import type {ConfigManager,SkillConfigData} from '../core/ConfigManager';
import type {BattleEvent,Pos} from './types';
import {Unit} from './Unit';
import {hexDist,offsetToWorld} from './HexMath';

interface Host {
  units:Unit[];events:BattleEvent[];now():number;targetable(unit:Unit):boolean;
  damage(source:Unit,target:Unit,raw:number,skillId:string):void;
  verdict(source:Unit,target:Unit,skill:SkillConfigData):void;
  pull(source:Unit,target:Unit,skill:SkillConfigData):void;
  cooldown(unit:Unit):number;
}

/** Hex radius and a continuous 120-degree cone, including the two boundary neighbors. */
export function inDemonCone(from:Pos,toward:Pos,target:Pos,radius:number,angleDegrees:number):boolean {
  if(hexDist(from,target)>radius)return false;
  const a=offsetToWorld(from.x,from.y,1,0,0),b=offsetToWorld(toward.x,toward.y,1,0,0),c=offsetToWorld(target.x,target.y,1,0,0);
  const dx=b.x-a.x,dy=b.y-a.y,x=c.x-a.x,y=c.y-a.y,denominator=Math.hypot(dx,dy)*Math.hypot(x,y);
  return denominator>0&&(dx*x+dy*y)/denominator>=Math.cos(angleDegrees*Math.PI/360)-1e-8;
}

/** Releases use the shared pending-cast clock, interrupt rules, damage and burn queues. */
export class DemonSkills {
  constructor(private host:Host,private configs:ConfigManager){}
  handles(skill:SkillConfigData):boolean{return !!(skill.redhornFervor||skill.hellhoundBreath||skill.abyssVerdict||skill.infernalSpin||skill.thornPull);}
  busy(unit:Unit):boolean{return !!unit.infernalSpin;}
  private ticks(seconds:number):number{return Math.max(1,Math.round(seconds*1000/this.configs.battle.tickMs));}
  release(source:Unit,skill:SkillConfigData,targetId?:number,direction?:Pos):void {
    const now=this.host.now(),rank=source.star-1;
    if(skill.redhornFervor){
      const e=skill.redhornFervor;
      source.demonFervor={untilTick:now+this.ticks(e.durationSeconds),attackSpeedBonus:e.attackSpeedBonuses[rank]*(1+(source.cfg.spellPower??0)/100),lifestealBonus:e.lifestealBonuses[rank]};
      this.host.events.push({t:'demon_fervor',tick:now,id:source.id,untilTick:source.demonFervor.untilTick});return;
    }
    const target=this.host.units.find(u=>u.id===targetId&&u.side!==source.side&&u.hp>0&&this.host.targetable(u)&&source.canSelectEnemy(u));
    if(skill.thornPull){
      if(target&&hexDist(source.pos,target.pos)<=source.cfg.range){
        this.host.events.push({t:'thorn_whip',tick:now,id:source.id,target:target.id,from:source.pos,to:target.pos});
        this.host.damage(source,target,skill.starDamage![rank],skill.id);this.host.pull(source,target,skill);
      }
      return;
    }
    if(skill.infernalSpin){
      const duration=this.ticks(skill.infernalSpin.durationSeconds),toward=target?.pos??direction??{x:source.x+1,y:source.y};
      source.infernalSpin={startTick:now,endTick:now+duration,toward,hitIds:new Set(),wasManaLocked:source.manaLocked};source.manaLocked=true;
      this.host.events.push({t:'infernal_spin',tick:now,id:source.id,center:source.pos,toward,radius:skill.radius,durationTicks:duration});
      this.updateSpin(source,skill);return;
    }
    if(skill.hellhoundBreath){
      const toward=target?.pos??direction;if(!toward)return;
      this.host.events.push({t:'hellhound_breath',tick:now,id:source.id,from:source.pos,toward,radius:skill.radius,angleDegrees:skill.hellhoundBreath.angleDegrees});
      for(const enemy of this.host.units){
        if(enemy.side===source.side||enemy.hp<=0||!this.host.targetable(enemy)||!inDemonCone(source.pos,toward,enemy.pos,skill.radius,skill.hellhoundBreath.angleDegrees))continue;
        this.host.damage(source,enemy,skill.starDamage![rank],skill.id);
        const burn=skill.burn!,interval=this.ticks(burn.intervalSeconds),pulses=Math.floor(burn.durationSeconds/burn.intervalSeconds);
        enemy.burns=enemy.burns.filter(b=>b.sourceId!==source.id||b.skillId!==skill.id);
        enemy.burns.push({sourceId:source.id,skillId:skill.id,intervalTicks:interval,nextTick:now+interval,remainingPulses:pulses,
          rawDamage:enemy.cfg.hp*burn.maxHpFraction,dmgType:burn.dmgType});
        this.host.events.push({t:'burn',tick:now,id:enemy.id,source:source.id,duration:burn.durationSeconds});
        this.host.events.push({t:'demon_burn',tick:now,id:enemy.id,source:source.id,untilTick:now+interval*pulses});
      }
      return;
    }
    if(skill.abyssVerdict&&target&&hexDist(source.pos,target.pos)<=source.cfg.range){
      this.host.events.push({t:'abyss_verdict',tick:now,id:source.id,target:target.id,from:source.pos,to:target.pos});
      this.host.verdict(source,target,skill);
    }
  }
  private updateSpin(unit:Unit,skill:SkillConfigData):void {
    const state=unit.infernalSpin;if(!state)return;
    const now=this.host.now(),progress=Math.max(0,Math.min(1,(now-state.startTick)/(state.endTick-state.startTick)));
    const a=offsetToWorld(unit.x,unit.y,1,0,0),b=offsetToWorld(state.toward.x,state.toward.y,1,0,0),base=Math.atan2(b.y-a.y,b.x-a.x);
    for(const enemy of this.host.units){
      if(enemy.side===unit.side||enemy.hp<=0||!this.host.targetable(enemy)||state.hitIds.has(enemy.id)||hexDist(unit.pos,enemy.pos)>skill.radius)continue;
      const p=offsetToWorld(enemy.x,enemy.y,1,0,0),angle=(base-Math.atan2(p.y-a.y,p.x-a.x)+Math.PI*2)%(Math.PI*2);
      if(angle>progress*Math.PI*2+1e-8)continue;
      state.hitIds.add(enemy.id);this.host.damage(unit,enemy,skill.starDamage![unit.star-1],skill.id);
    }
    if(now>=state.endTick)this.interrupt(unit);
  }
  update():void {
    for(const unit of this.host.units)if(unit.infernalSpin){
      if(unit.hp<=0||!unit.alive||unit.stunnedUntilTick>this.host.now()||unit.fearUntilTick>this.host.now())this.interrupt(unit);
      else this.updateSpin(unit,this.configs.getSkill(unit.cfg.skillId!));
    }
  }
  interrupt(unit:Unit):void {
    const spin=unit.infernalSpin;if(!spin)return;
    unit.manaLocked=spin.wasManaLocked;unit.infernalSpin=null;unit.atkCd=this.host.cooldown(unit);
    this.host.events.push({t:'infernal_spin_end',tick:this.host.now(),id:unit.id});
  }
  clear():void {for(const unit of this.host.units)this.interrupt(unit);}
}
