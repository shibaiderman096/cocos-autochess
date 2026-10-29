import type { ConfigManager, SkillConfigData } from '../core/ConfigManager';
import type { BattleEvent, DemonTraitEffect, Pos, Side } from './types';
import { Unit } from './Unit';
import { hexDist } from './HexMath';

interface Host {
  units:Unit[]; events:BattleEvent[]; now():number; width():number; height():number;
  summonPosition(side:Side):Pos|undefined;
  targetable(unit:Unit):boolean;
  damage(source:Unit,target:Unit,raw:number,skillId:string):void;
  knockup(source:Unit,target:Unit,seconds:number):void;
  cast(source:Unit,skill:SkillConfigData):void;
  cooldown(unit:Unit):number;
}
interface Army { side:Side; members:Unit[]; summon:Unit; effect:DemonTraitEffect; nextPulse:number }
interface Charge { unit:Unit; skill:SkillConfigData; end:number }
interface Shield { target:Unit; remaining:number; end:number }

/** Battle-only summoned units and contribution bookkeeping; never adds owned pieces or pool stock. */
export class DemonCombat {
  private armies:Army[]=[];
  private charges:Charge[]=[];
  private shields:Shield[]=[];
  private contributions=new Map<number,Set<number>>();
  private power=new Map<Unit,number>();
  constructor(private host:Host,private configs:ConfigManager){}
  private ticks(seconds:number):number{return Math.max(1,Math.round(seconds*1000/this.configs.battle.tickMs));}
  private empty(pos:Pos,except?:Unit):boolean {
    return !this.host.units.some(u=>u!==except&&u.alive&&u.hp>0&&u.x===pos.x&&u.y===pos.y);
  }
  private cells():Pos[]{
    const cells:Pos[]=[];for(let y=0;y<this.host.height();y++)for(let x=0;x<this.host.width();x++)cells.push({x,y});return cells;
  }
  register(side:Side,members:Unit[],effect:DemonTraitEffect):void {
    if(!members.length)return;
    const home=(p:Pos)=>side===0?p.y<this.configs.battle.ownRows:p.y>=this.host.height()-this.configs.battle.ownRows;
    const preferred=this.host.summonPosition(side);
    const ideal=preferred&&Number.isInteger(preferred.x)&&Number.isInteger(preferred.y)&&preferred.x>=0&&preferred.x<this.host.width()
      &&preferred.y>=0&&preferred.y<this.host.height()&&home(preferred)?preferred
      :{x:Math.floor(this.host.width()/2),y:side===0?this.configs.battle.ownRows-1:this.host.height()-this.configs.battle.ownRows};
    const cells=this.cells().filter(p=>this.empty(p));
    const pos=cells.sort((a,b)=>Number(!home(a))-Number(!home(b))||hexDist(a,ideal)-hexDist(b,ideal)
      ||Math.abs(a.x-ideal.x)-Math.abs(b.x-ideal.x)||(side===0?b.y-a.y:a.y-b.y)||a.x-b.x)[0];
    if(!pos)return;
    const base=this.configs.scaleUnit(this.configs.getUnit(effect.unitId),effect.star);
    const stars=members.reduce((sum,u)=>sum+u.star,0),health=base.hp+stars*effect.healthPerStar;
    const unit=new Unit(this.host.units.reduce((id,u)=>Math.max(id,u.id),0)+1,side,{...base,hp:health},pos.x,pos.y);
    unit.baseMaxHp=base.hp;unit.star=effect.star;unit.skillScale=1;unit.attackSpeedCap=this.configs.battle.attackSpeedCap??5;
    unit.manaPerSecond=base.manaPerSecond??0;
    this.host.units.push(unit);
    this.armies.push({side,members,summon:unit,effect,nextPulse:this.ticks(1)});
  }
  start():void {
    for(const army of this.armies)this.host.events.push({t:'demon_summon',tick:this.host.now(),id:army.summon.id,star:army.summon.star,pos:army.summon.pos});
  }
  busy(unit:Unit):boolean{return !!unit.demonLeap||this.charges.some(c=>c.unit===unit);}
  begin(unit:Unit,skill:SkillConfigData):boolean {
    if(!skill.demonLeap||!this.host.units.some(u=>u.side!==unit.side&&u.hp>0&&this.host.targetable(u)))return false;
    unit.mana=0;this.charges.push({unit,skill,end:this.host.now()+this.ticks(skill.castSeconds!)});
    this.host.cast(unit,skill);
    const army=this.armies.find(a=>a.summon===unit),fraction=army?.effect.castShieldFraction??0;
    if(fraction){
      const amount=Math.round(unit.cfg.hp*fraction);unit.shield+=amount;
      this.shields.push({target:unit,remaining:amount,end:this.host.now()+this.ticks(army!.effect.shieldSeconds)});
      this.host.events.push({t:'shield',tick:this.host.now(),id:unit.id,source:unit.id,amount,shield:unit.shield});
    }
    return true;
  }
  private landing(unit:Unit,radius:number):Pos {
    const enemies=this.host.units.filter(u=>u.side!==unit.side&&u.hp>0&&this.host.targetable(u));
    const count=(p:Pos)=>enemies.filter(e=>hexDist(p,e.pos)<=radius).length;
    const distance=(p:Pos)=>enemies.reduce((sum,e)=>sum+hexDist(p,e.pos),0);
    return this.cells().filter(p=>this.empty(p,unit)).sort((a,b)=>count(b)-count(a)||distance(a)-distance(b)
      ||hexDist(unit.pos,a)-hexDist(unit.pos,b)||(unit.side===0?a.y-b.y:b.y-a.y)||a.x-b.x)[0]??unit.pos;
  }
  private addPower(unit:Unit,amount:number,source:Unit):void {
    unit.cfg.physicalPower=(unit.cfg.physicalPower??0)+amount;unit.adjustSpellPower(amount);
    this.power.set(unit,(this.power.get(unit)??0)+amount);
    this.host.events.push({t:'demon_power',tick:this.host.now(),id:unit.id,source:source.id,amount});
  }
  update():void {
    const now=this.host.now();
    for(const shield of [...this.shields])if(now>=shield.end||shield.target.hp<=0)this.removeShield(shield);
    for(const charge of [...this.charges]){
      if(charge.unit.hp<=0){this.charges.splice(this.charges.indexOf(charge),1);continue;}
      if(now<charge.end)continue;
      this.charges.splice(this.charges.indexOf(charge),1);
      const {unit,skill}=charge,radius=skill.demonLeap!.radii[unit.star-1],to=this.landing(unit,radius),duration=this.ticks(skill.demonLeap!.airborneSeconds);
      unit.demonLeap={from:unit.pos,to,startTick:now,endTick:now+duration,radius};
      this.host.events.push({t:'demon_leap',tick:now,id:unit.id,from:unit.pos,to,durationTicks:duration,radius});
    }
    for(const army of this.armies){
      const unit=army.summon,leap=unit.demonLeap;
      if(leap&&unit.hp>0&&now>=leap.endTick){
        // A destination can be occupied during the flight; resolve a legal nearby tile without sharing a cell.
        const to=this.cells().filter(p=>this.empty(p,unit)).sort((a,b)=>hexDist(a,leap.to)-hexDist(b,leap.to)
          ||hexDist(a,leap.from)-hexDist(b,leap.from)||a.y-b.y||a.x-b.x)[0]??unit.pos;
        unit.x=to.x;unit.y=to.y;unit.demonLeap=null;unit.atkCd=this.host.cooldown(unit);
        const skill=this.configs.getSkill(unit.cfg.skillId!);
        this.host.events.push({t:'demon_impact',tick:now,id:unit.id,center:unit.pos,radius:leap.radius});
        for(const enemy of this.host.units)if(enemy.side!==unit.side&&enemy.hp>0&&this.host.targetable(enemy)&&hexDist(enemy.pos,unit.pos)<=leap.radius){
          this.host.damage(unit,enemy,skill.starDamage![unit.star-1],skill.id);
          this.host.knockup(unit,enemy,skill.stunSeconds![unit.star-1]);
        }
      }
      if(now>=army.nextPulse){
        army.nextPulse+=this.ticks(1);
        if(unit.alive&&unit.hp>0&&army.effect.powerPerSecond>0)
          for(const member of army.members)if(member.alive&&member.hp>0)this.addPower(member,army.effect.powerPerSecond,unit);
      }
    }
  }
  recordDamage(source:Unit,target:Unit,amount:number):void {
    if(amount<=0||source.side===target.side||!this.armies.some(a=>a.members.includes(source)))return;
    let members=this.contributions.get(target.id);if(!members)this.contributions.set(target.id,members=new Set());members.add(source.id);
  }
  onDeath(unit:Unit):void {
    const participants=this.contributions.get(unit.id);this.contributions.delete(unit.id);
    if(participants)for(const army of this.armies)if(army.side!==unit.side&&army.effect.takedownPower>0&&army.summon.alive&&army.summon.hp>0
      &&army.members.some(member=>participants.has(member.id)))this.addPower(army.summon,army.effect.takedownPower,army.summon);
    unit.demonLeap=null;this.charges=this.charges.filter(c=>c.unit!==unit);
    for(const shield of [...this.shields])if(shield.target===unit)this.removeShield(shield);
  }
  absorb(target:Unit,amount:number):number {
    for(const layer of this.shields)if(layer.target===target){const used=Math.min(amount,layer.remaining);layer.remaining-=used;amount-=used;if(!amount)break;}return amount;
  }
  private removeShield(layer:Shield):void {
    this.shields.splice(this.shields.indexOf(layer),1);layer.target.shield=Math.max(0,layer.target.shield-layer.remaining);
  }
  clear():void {
    for(const shield of [...this.shields])this.removeShield(shield);
    for(const army of this.armies)army.summon.demonLeap=null;
    for(const [unit,amount]of this.power){unit.cfg.physicalPower=(unit.cfg.physicalPower??0)-amount;unit.adjustSpellPower(-amount);}
    this.power.clear();this.charges=[];this.contributions.clear();
  }
}
