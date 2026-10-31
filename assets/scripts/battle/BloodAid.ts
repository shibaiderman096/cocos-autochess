import type { ConfigManager, SkillConfigData } from '../core/ConfigManager';
import { Unit } from './Unit';
import type { BattleEvent, Pos } from './types';
import { hexDist, hexNeighbors } from './HexMath';
import { applyHealing } from './Healing';

export interface BloodAidConfig {
  healAmounts: number[];
  resistanceBonuses: number[];
  attackBonusDamage: number[];
  staySeconds: number;
  resistanceSeconds: number;
}
interface Host {
  units: Unit[]; events: BattleEvent[];
  now(): number; width(): number; height(): number;
  targetable(unit: Unit): boolean;
  damage(source: Unit, target: Unit, raw: number, skillId: string): void;
}
interface Visit { source: Unit; target: Unit; skill: SkillConfigData; origin: Pos; end: number; wasManaLocked: boolean }

/** Each caster owns its visit and resistance gift; buffs survive the caster's death. */
export class BloodAid {
  private visits=new Map<number,Visit>();
  constructor(private host:Host,private configs:ConfigManager) {}
  private get tick():number {return this.host.now();}
  private ticks(seconds:number):number {return Math.max(1,Math.round(seconds*1000/this.configs.battle.tickMs));}
  private free(p:Pos,source:Unit):boolean {
    return p.x>=0&&p.y>=0&&p.x<this.host.width()&&p.y<this.host.height()
      && !this.host.units.some(u=>u!==source&&u.alive&&u.hp>0&&u.x===p.x&&u.y===p.y);
  }
  private beside(source:Unit,target:Unit):Pos|undefined {
    return hexNeighbors(target.x,target.y).filter(p=>this.free(p,source))
      .sort((a,b)=>hexDist(source.pos,a)-hexDist(source.pos,b)||a.y-b.y||a.x-b.x)[0];
  }
  target(source:Unit):Unit|undefined {
    const target=this.host.units.filter(u=>u!==source&&u.side===source.side&&u.hp>0&&this.host.targetable(u))
      .sort((a,b)=>a.hp/a.cfg.hp-b.hp/b.cfg.hp||a.id-b.id)[0];
    return target&&this.beside(source,target)?target:undefined;
  }
  busy(source:Unit):boolean {return this.visits.has(source.id);}
  activate(source:Unit,target:Unit,skill:SkillConfigData,onCast?:()=>void):boolean {
    const to=this.beside(source,target);
    if(!to||this.busy(source)||target===source||target.side!==source.side||target.hp<=0||!this.host.targetable(target))return false;
    const spec=skill.bloodAid!,rank=source.star-1,from=source.pos;
    const end=this.tick+this.ticks(spec.staySeconds),buffEnd=this.tick+this.ticks(spec.resistanceSeconds);
    this.visits.set(source.id,{source,target,skill,origin:from,end,wasManaLocked:source.manaLocked});
    onCast?.();
    source.bloodAidUntilTick=end;source.manaLocked=true;source.x=to.x;source.y=to.y;
    target.bloodAidResistances.set(source.id,{amount:spec.resistanceBonuses[rank],untilTick:buffEnd});
    this.host.events.push({t:'teleport',tick:this.tick,id:source.id,from,to:{...to}});
    applyHealing(source,target,spec.healAmounts[rank]*(1+(source.cfg.spellPower??0)/100),this.tick,this.host.events);
    this.host.events.push({t:'blood_aid',tick:this.tick,id:source.id,target:target.id,skillId:skill.id,phase:'arrive',from,to:{...to},untilTick:buffEnd});
    return true;
  }
  private finish(visit:Visit,returnAlive=true):void {
    const {source,target,origin,skill}=visit;this.visits.delete(source.id);source.bloodAidUntilTick=0;source.manaLocked=visit.wasManaLocked;
    if(!returnAlive||!source.alive||source.hp<=0)return;
    const cells:Pos[]=[];
    for(let y=0;y<this.host.height();y++)for(let x=0;x<this.host.width();x++)if(this.free({x,y},source))cells.push({x,y});
    const to=cells.sort((a,b)=>hexDist(origin,a)-hexDist(origin,b)||a.y-b.y||a.x-b.x)[0];
    if(!to)return;
    const from=source.pos;source.x=to.x;source.y=to.y;
    this.host.events.push({t:'teleport',tick:this.tick,id:source.id,from,to:{...to}});
    this.host.events.push({t:'blood_aid',tick:this.tick,id:source.id,target:target.id,skillId:skill.id,phase:'return',from,to:{...to},untilTick:this.tick});
  }
  update():void {
    for(const u of this.host.units)for(const [id,buff] of u.bloodAidResistances)
      if(!u.alive||u.hp<=0||this.tick>=buff.untilTick)u.bloodAidResistances.delete(id);
    for(const visit of Array.from(this.visits.values()))
      if(!visit.source.alive||visit.source.hp<=0)this.finish(visit,false);
      else if(this.tick>=visit.end||!visit.target.alive||visit.target.hp<=0)this.finish(visit);
  }
  interrupt(source:Unit):void {const visit=this.visits.get(source.id);if(visit)this.finish(visit);}
  onDeath(unit:Unit):void {
    unit.bloodAidResistances.clear();
    for(const visit of Array.from(this.visits.values()))if(visit.source===unit)this.finish(visit,false);else if(visit.target===unit)this.finish(visit);
  }
  onBasicAttack(source:Unit,target:Unit):void {
    const visit=this.visits.get(source.id);if(!visit||this.tick>=visit.end)return;
    this.host.damage(source,target,visit.skill.bloodAid!.attackBonusDamage[source.star-1],visit.skill.id);
    this.host.events.push({t:'skill_impact',tick:this.tick,id:source.id,target:target.id,skillId:visit.skill.id});
  }
  clear():void {for(const visit of Array.from(this.visits.values()))this.finish(visit);for(const unit of this.host.units)unit.bloodAidResistances.clear();}
}
