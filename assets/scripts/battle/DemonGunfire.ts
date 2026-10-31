import type {ConfigManager,SkillConfigData} from '../core/ConfigManager';
import type {BattleEvent} from './types';
import {Unit} from './Unit';

interface Host {
  units:Unit[];events:BattleEvent[];now():number;valid(source:Unit,target:Unit):boolean;
  target(source:Unit):Unit|null;releaseTarget(source:Unit):void;cooldown(unit:Unit):number;
  damage(source:Unit,target:Unit,raw:number,skillId:string):void;
}

/** Retains mana on cast; each fixed-clock volley pays its own mana cost. */
export class DemonGunfire {
  private preparations=new Map<Unit,boolean>();
  constructor(private host:Host,private configs:ConfigManager){}
  prepare(unit:Unit):void {this.preparations.set(unit,unit.manaLocked);unit.manaLocked=true;}
  start(unit:Unit,skill:SkillConfigData):void {
    const old=this.preparations.get(unit)??unit.manaLocked;this.preparations.delete(unit);
    unit.manaLocked=true;unit.demonGunfire={nextTick:this.host.now()+this.interval(skill),wasManaLocked:old};
    this.host.events.push({t:'demon_gunfire',tick:this.host.now(),id:unit.id,durationTicks:Math.floor(unit.mana/skill.demonGunfire!.manaPerSecond)*this.interval(skill)});
  }
  private interval(skill:SkillConfigData):number{return Math.max(1,Math.round(skill.demonGunfire!.intervalSeconds*1000/this.configs.battle.tickMs));}
  update():void {
    for(const unit of this.preparations.keys())if(!unit.pendingCast||unit.hp<=0||!unit.alive)this.interrupt(unit);
    for(const unit of this.host.units){
      const state=unit.demonGunfire;if(!state)continue;
      const now=this.host.now(),skill=this.configs.getSkill(unit.cfg.skillId!),e=skill.demonGunfire!;
      if(unit.hp<=0||!unit.alive||unit.stunnedUntilTick>now||unit.fearUntilTick>now||unit.mana<e.manaPerSecond){this.interrupt(unit);continue;}
      const locked=unit.attackTargetId===null?undefined:this.host.units.find(u=>u.id===unit.attackTargetId);
      if(unit.attackTargetId!==null&&(!locked||!this.host.valid(unit,locked)))this.host.releaseTarget(unit);
      const target=this.host.target(unit);
      if(now<state.nextTick)continue;
      state.nextTick+=this.interval(skill);unit.mana=Math.max(0,unit.mana-e.manaPerSecond);
      if(target&&this.host.valid(unit,target)){
        const baseSpeed=this.configs.getUnit(unit.cfg.id).atkSpeed;
        const count=Math.max(1,Math.round(e.baseBullets*unit.attackSpeed/baseSpeed));
        this.host.events.push({t:'demon_volley',tick:now,id:unit.id,target:target.id,from:unit.pos,to:target.pos,count,flightTicks:Math.max(1,Math.round((skill.projectile?.flightSeconds??.2)*1000/this.configs.battle.tickMs))});
        for(let i=0;i<count;i++)this.host.damage(unit,target,skill.starDamage![unit.star-1],skill.id);
      }
      if(unit.mana<e.manaPerSecond)this.interrupt(unit);
    }
  }
  interrupt(unit:Unit):void {
    const preparation=this.preparations.get(unit),state=unit.demonGunfire;
    if(preparation===undefined&&!state)return;
    unit.manaLocked=state?.wasManaLocked??preparation!;unit.demonGunfire=null;this.preparations.delete(unit);
    unit.atkCd=this.host.cooldown(unit);
    if(state)this.host.events.push({t:'demon_gunfire_end',tick:this.host.now(),id:unit.id});
  }
  clear():void {for(const unit of this.host.units)this.interrupt(unit);this.preparations.clear();}
}
