import type {ConfigManager,SkillConfigData} from '../core/ConfigManager';
import {Unit} from './Unit';
import type {BattleEvent,Pos} from './types';
import {hexDist,hexNeighbors,offsetToWorld} from './HexMath';

interface Host {
  units:Unit[];events:BattleEvent[];now():number;width():number;height():number;
  targetable(unit:Unit):boolean;damage(source:Unit,target:Unit,skill:SkillConfigData):void;cooldown(unit:Unit):number;
}

/** Targetable, interruptible raven travel and battle-only spell-power transfers. */
export class RavenFlight {
  private power=new Map<Unit,number>();
  constructor(private host:Host,private configs:ConfigManager){}
  private empty(p:Pos,source:Unit):boolean {
    return p.x>=0&&p.y>=0&&p.x<this.host.width()&&p.y<this.host.height()
      &&!this.host.units.some(u=>u!==source&&u.alive&&u.hp>0&&((u.x===p.x&&u.y===p.y)||(u.ravenFlight?.to.x===p.x&&u.ravenFlight.to.y===p.y)||(u.starLeap?.to.x===p.x&&u.starLeap.to.y===p.y)));
  }
  private landing(source:Unit,target:Unit):Pos|undefined {
    return hexNeighbors(target.x,target.y).filter(p=>this.empty(p,source)).sort((a,b)=>hexDist(a,source.pos)-hexDist(b,source.pos)||a.y-b.y||a.x-b.x)[0];
  }
  target(source:Unit,skill:SkillConfigData):Unit|undefined {
    return this.host.units.filter(u=>u.side!==source.side&&u.hp>0&&this.host.targetable(u)&&source.canSelectEnemy(u)
      &&hexDist(source.pos,u.pos)<=skill.ravenTheft!.targetRange&&!!this.landing(source,u))
      .sort((a,b)=>a.hp-b.hp||hexDist(source.pos,a.pos)-hexDist(source.pos,b.pos)||a.id-b.id)[0];
  }
  start(source:Unit,skill:SkillConfigData,targetId?:number):void {
    const target=this.host.units.find(u=>u.id===targetId&&u.side!==source.side&&u.hp>0&&this.host.targetable(u)&&source.canSelectEnemy(u)
      &&hexDist(source.pos,u.pos)<=skill.ravenTheft!.targetRange);
    const to=target&&this.landing(source,target);if(!target||!to)return;
    const now=this.host.now(),duration=Math.max(1,Math.round(skill.ravenTheft!.flightSeconds*1000/this.configs.battle.tickMs));
    source.ravenFlight={from:source.pos,to,startTick:now,endTick:now+duration,targetId:target.id};
    this.host.events.push({t:'raven_flight',tick:now,id:source.id,from:source.pos,to,durationTicks:duration});
  }
  update():void {
    for(const source of this.host.units){
      const state=source.ravenFlight;if(!state)continue;
      if(source.hp<=0||!source.alive||source.stunnedUntilTick>this.host.now()||source.fearUntilTick>this.host.now()){this.interrupt(source);continue;}
      const p=Math.max(0,Math.min(1,(this.host.now()-state.startTick)/(state.endTick-state.startTick)));
      const from=offsetToWorld(state.from.x,state.from.y,1,0,0),to=offsetToWorld(state.to.x,state.to.y,1,0,0);
      const x=from.x+(to.x-from.x)*p,y=from.y+(to.y-from.y)*p,cells:Pos[]=[];
      for(let row=0;row<this.host.height();row++)for(let col=0;col<this.host.width();col++)if(this.empty({x:col,y:row},source))cells.push({x:col,y:row});
      const distance=(p:Pos)=>{const v=offsetToWorld(p.x,p.y,1,0,0);return (v.x-x)**2+(v.y-y)**2;};
      const current=cells.sort((a,b)=>distance(a)-distance(b)||a.y-b.y||a.x-b.x)[0];
      if(current){source.x=current.x;source.y=current.y;}
      if(p<1)continue;
      const target=this.host.units.find(u=>u.id===state.targetId&&u.hp>0&&this.host.targetable(u)&&source.canSelectEnemy(u));
      const landing=target&&this.landing(source,target);
      if(!target||!landing){this.interrupt(source);continue;}
      source.x=landing.x;source.y=landing.y;source.ravenFlight=null;source.priorityTarget=target.id;source.atkCd=this.host.cooldown(source);
      this.host.events.push({t:'raven_end',tick:this.host.now(),id:source.id,to:source.pos,interrupted:false});
      this.host.damage(source,target,this.configs.getSkill(source.cfg.skillId!));
    }
  }
  private adjust(unit:Unit,amount:number):void {
    unit.adjustSpellPower(amount);
  }
  steal(source:Unit,target:Unit,skill:SkillConfigData):void {
    const amount=Math.min(Math.max(0,target.cfg.spellPower??0),skill.ravenTheft!.spellPowerAmounts[source.star-1]);if(amount<=0)return;
    this.adjust(target,-amount);this.adjust(source,amount);
    this.power.set(target,(this.power.get(target)??0)-amount);this.power.set(source,(this.power.get(source)??0)+amount);
    this.host.events.push({t:'raven_theft',tick:this.host.now(),id:source.id,target:target.id,from:target.pos,to:source.pos,amount});
  }
  interrupt(unit:Unit):void {
    if(!unit.ravenFlight)return;unit.ravenFlight=null;unit.atkCd=this.host.cooldown(unit);
    this.host.events.push({t:'raven_end',tick:this.host.now(),id:unit.id,to:unit.pos,interrupted:true});
  }
  clear():void {
    for(const unit of this.host.units)this.interrupt(unit);
    for(const [unit,amount]of this.power)this.adjust(unit,-amount);this.power.clear();
  }
}
