import type { ConfigManager, SkillConfigData } from '../core/ConfigManager';
import { equipmentMaxHpResistance } from '../core/ConfigManager';
import type { Unit } from './Unit';
import type { BattleEvent } from './types';
import { applyHealing } from './Healing';
import { inFearLine } from './LineFear';

interface Host {
  units: Unit[];
  events: BattleEvent[];
  now(): number;
  targetable(unit: Unit): boolean;
  damage(source: Unit, target: Unit, raw: number, skillId: string): void;
}

/** Battle-local health growth, one empowered basic and one low-health rebirth. */
export class BloodReign {
  constructor(private host: Host, private configs: ConfigManager) {}

  private skill(unit: Unit): SkillConfigData | undefined {
    const skill = unit.cfg.skillId ? this.configs.getSkill(unit.cfg.skillId) : undefined;
    return skill?.effect === 'bloodReign' ? skill : undefined;
  }

  busy(unit: Unit): boolean { return !!unit.bloodRebirth; }

  trigger(unit: Unit): boolean {
    const skill = this.skill(unit), spec = skill?.bloodReign;
    if (!spec || !unit.alive || unit.bloodRebirthUsed || unit.hp >= unit.cfg.hp * spec.rebirthThreshold) return false;
    const durationTicks = Math.max(1, Math.round(spec.rebirthSeconds * 1000 / this.configs.battle.tickMs));
    unit.bloodRebirthUsed = true;
    unit.hp = Math.max(1, unit.hp); // Intercept lethal damage before death/kill settlement.
    unit.pendingCast = null;
    unit.bloodCleaveWindup = null;
    unit.bloodRebirth = { startTick: this.host.now(), durationTicks,
      total: Math.round(unit.cfg.hp * spec.rebirthHealMaxHpFraction), delivered: 0, wasManaLocked: unit.manaLocked };
    unit.manaLocked = true;
    this.host.events.push({ t:'blood_rebirth', tick:this.host.now(), id:unit.id, skillId:skill!.id,
      untilTick:this.host.now()+durationTicks });
    return true;
  }

  update(): void {
    for (const unit of this.host.units) {
      const state = unit.bloodRebirth;
      if (!state) continue;
      if (!unit.alive || unit.hp <= 0) { this.stopRebirth(unit); continue; }
      const elapsed = Math.min(state.durationTicks, this.host.now()-state.startTick);
      // Cumulative rounding delivers exactly the configured total across the full duration.
      const delivered = Math.floor(state.total*elapsed/state.durationTicks);
      applyHealing(unit,unit,delivered-state.delivered,this.host.now(),this.host.events);
      state.delivered = delivered;
      if (elapsed >= state.durationTicks) this.stopRebirth(unit);
    }
  }

  private stopRebirth(unit: Unit): void {
    if (unit.bloodRebirth) unit.manaLocked = unit.bloodRebirth.wasManaLocked;
    unit.bloodRebirth = null;
  }

  cast(unit: Unit, skill: SkillConfigData): void {
    const amount = skill.bloodReign!.healthGains[unit.star-1];
    const previousArmor = unit.cfg.armor;
    const previousResistance = equipmentMaxHpResistance(unit.cfg.hp,unit.equipment);
    unit.cfg.hp += amount;
    unit.hp += amount;
    unit.bloodReignHealth += amount;
    // Growth is added health, not healing; it must not create vamp/overheal/statistics.
    const resistance = equipmentMaxHpResistance(unit.cfg.hp,unit.equipment)-previousResistance;
    unit.cfg.armor += resistance;
    unit.cfg.mr += resistance;
    unit.bloodReignResistance += resistance;
    const reduction = unit.equipment.reduce((sum,item)=>{
      const effect = item.armorDamageReduction;
      return sum+(effect&&previousArmor<=effect.threshold&&unit.cfg.armor>effect.threshold?effect.bonus:0);
    },0);
    const oldReduction = unit.cfg.damageReduction ?? 0;
    unit.cfg.damageReduction = Math.min(1,oldReduction+reduction);
    unit.bloodReignReduction += unit.cfg.damageReduction-oldReduction;
    unit.bloodCleaveReady = true;
  }

  onBasicAttack(source: Unit, target: Unit): void {
    if (!source.bloodCleaveReady || this.busy(source)) return;
    const skill = this.skill(source);
    if (!skill) return;
    source.bloodCleaveReady = false;
    source.bloodCleaveWindup = null;
    const spec = skill.bloodReign!, from = source.pos, toward = target.pos;
    this.host.events.push({ t:'blood_cleave',tick:this.host.now(),id:source.id,skillId:skill.id,
      from,toward,length:spec.length,width:spec.width });
    for (const enemy of this.host.units) {
      if (enemy.side!==source.side && enemy.hp>0 && this.host.targetable(enemy)
        && inFearLine(from,toward,enemy.pos,spec.length,spec.width)) {
        this.host.damage(source,enemy,skill.starDamage![source.star-1],skill.id);
      }
    }
  }

  onDeath(unit: Unit): void {
    this.stopRebirth(unit);
    unit.bloodCleaveReady = false;
    unit.bloodCleaveWindup = null;
  }

  /** Start only when the next basic is in range and ready; no hit/mana occurs during preparation. */
  prepareBasic(source: Unit, target: Unit): boolean {
    if (!source.bloodCleaveReady) return false;
    const spec = this.skill(source)?.bloodReign;
    if (!spec) return false;
    if (!source.bloodCleaveWindup || source.bloodCleaveWindup.targetId !== target.id) {
      const duration = Math.max(1,Math.round(spec.attackWindupSeconds*1000/this.configs.battle.tickMs));
      source.bloodCleaveWindup = {targetId:target.id,startTick:this.host.now(),endTick:this.host.now()+duration};
      this.host.events.push({t:'blood_cleave_charge',tick:this.host.now(),id:source.id,target:target.id,untilTick:this.host.now()+duration});
    }
    return this.host.now() < source.bloodCleaveWindup.endTick;
  }

  clear(): void {
    for (const unit of this.host.units) {
      this.onDeath(unit);
      unit.cfg.hp -= unit.bloodReignHealth;
      unit.hp = Math.min(unit.hp,unit.cfg.hp);
      unit.cfg.armor -= unit.bloodReignResistance;
      unit.cfg.mr -= unit.bloodReignResistance;
      unit.cfg.damageReduction = Math.max(0,(unit.cfg.damageReduction??0)-unit.bloodReignReduction);
      unit.bloodReignHealth = unit.bloodReignResistance = unit.bloodReignReduction = 0;
    }
  }
}
