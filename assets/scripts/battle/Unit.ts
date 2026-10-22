import { BurnRuntime, Side, EquipmentConfigData, ShadowTraitEffect, ShadowCorruption, ConquerorTraitEffect, SpellbladeTraitEffect, SpellchanterTraitEffect, SwiftmartialistTraitEffect } from './types';
import { UnitConfigData } from '../core/ConfigManager';
import type { MechanicalPioneerTraitEffect } from './types';
import type { HydraulicBulwarkRuntime, SpiderLeapRuntime, FurnaceDashRuntime } from './types';

export class Unit {
  hp: number;
  mana: number;
  manaPerSecond = 0;
  traitRegenPerSecond = 0;
  traitAttackDamage = 0;
  traitExecuteThreshold = 0;
  conqueror?: ConquerorTraitEffect;
  conquerorProtectionUsed = false;
  conquerorProtectionUntilTick = 0;
  spellblade?: SpellbladeTraitEffect;
  spellbladeUntilTick = 0;
  spellbladeAttacks = 0;
  spellchanter?: SpellchanterTraitEffect;
  spellchanterPendingMana = 0;
  swiftmartialist?: SwiftmartialistTraitEffect;
  swiftmartialistStacks = 0;
  mechanicalPioneer?: MechanicalPioneerTraitEffect;
  overclockUntilTick = 0;
  overclockNextTick = 0;
  overclockHealTick = 0;
  overclockEmergencyUsed = false;
  /** Updated by the fixed battle clock before any unit acts. */
  combatTick = 0;
  get conquerorDamageAmp(): number {
    const effect = this.conqueror;
    return effect ? effect.damageAmp * (this.hp < this.cfg.hp * effect.lowHealthThreshold ? effect.lowHealthMultiplier : 1) : 0;
  }
  traitDamageReductionAt(tick: number): number {
    return (tick < this.conquerorProtectionUntilTick ? this.conqueror?.protection?.damageReduction ?? 0 : 0)
      + (tick < this.spellbladeUntilTick ? this.spellblade?.damageReduction ?? 0 : 0);
  }
  shadowAttack?: ShadowTraitEffect;
  shadowCorruption?: ShadowCorruption;
  shadowAttackSpeedBonus = 0;
  sunlightShield = 0;
  skillArmorBonus = 0;
  hydraulicBulwark: HydraulicBulwarkRuntime | null = null;
  spiderLeap: SpiderLeapRuntime | null = null;
  furnaceDash: FurnaceDashRuntime | null = null;
  atlasManaReduction = 0;
  get hydraulicResistanceBonus(): number {
    return this.alive && this.hydraulicBulwark && this.combatTick < this.hydraulicBulwark.untilTick ? this.hydraulicBulwark.resistanceBonus : 0;
  }
  get hydraulicRooted(): boolean {
    return this.alive && !!this.hydraulicBulwark && this.combatTick < this.hydraulicBulwark.untilTick;
  }
  skillMrBonus = 0;
  skillAttackSpeedBonus = 0;
  skillAttackSpeedPenalty = 0;
  skillUntargetable = false;
  domainUntilTick = 0;
  domainRadius = 0;
  fearUntilTick = 0;
  fearOrigin = { x: 0, y: 0 };
  get armor(): number { return (this.cfg.armor + this.skillArmorBonus + this.hydraulicResistanceBonus) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
  get mr(): number { return (this.cfg.mr + this.skillMrBonus + this.hydraulicResistanceBonus) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
  private manaFraction = 0;
  gainMana(amount: number): void {
    if (!this.alive || this.hp <= 0 || this.cfg.maxMana <= 0 || this.manaLocked || this.pendingCast || !Number.isFinite(amount) || amount <= 0) return;
    this.manaFraction += amount;
    const whole = Math.floor(this.manaFraction + 1e-9);
    this.manaFraction = Math.max(0, this.manaFraction - whole);
    this.mana = Math.min(this.cfg.maxMana, this.mana + whole);
    if (this.mana === this.cfg.maxMana) this.manaFraction = 0;
  }
  atkCd = 0;
  moveCd = 0;
  alive = true;
  star = 1;
  skillScale = 1;
  pendingCast: { skillId: string; remainingTicks: number; targetId?: number; nextHealTick?: number } | null = null;
  burns: BurnRuntime[] = [];
  empoweredAttacks = 0;
  permanentEmpower = false;
  /** Fixed skill damage replacing an empowered basic attack's ordinary attack value. */
  empoweredAttackDamage = 0;
  priorityTarget: number | null = null;
  /** Absolute attacks/second added to the base: +5% means +0.05. */
  attackSpeedBonus = 0;
  overtimeAttackSpeedBonus = 0;
  overtimeDamageAmp = 0;
  get damageAmp(): number { return (this.cfg.damageAmp ?? 0) + this.overtimeDamageAmp + this.conquerorDamageAmp - (this.shadowCorruption?.damageAmpLoss ?? 0); }
  equipment: EquipmentConfigData[] = [];
  equipmentAttackStacks = 0;
  get equipmentAttackSpeedBonus(): number {
    return this.equipment.reduce((sum, item) => sum + item.attackSpeedBonus + item.attackSpeedPerAttack * this.equipmentAttackStacks, 0);
  }
  manaLocked = false;
  attackSpeedCap = 5;
  stunnedUntilTick = 0;
  guardUntilTick = 0;
  guardReduction = 0;
  susanooUntilTick = 0;
  susanooReduction = 0;
  damageReductionAt(tick: number): number {
    return Math.min(1, (this.cfg.damageReduction ?? 0) + (tick < this.guardUntilTick ? this.guardReduction : 0)
      + (tick < this.susanooUntilTick ? this.susanooReduction : 0) + this.traitDamageReductionAt(tick));
  }
  shield = 0;
  stellarShield: { remaining: number; untilTick: number } | null = null;
  stellarCharge: import('./types').StellarChargeRuntime | null = null;
  untargetableUntilTick = 0;
  lowHealthProtectionUsed = false;
  equipmentRegen: { startTick: number; durationTicks: number; total: number; delivered: number } | null = null;
  /** Per-slot state allows repeated regen items to trigger and heal independently. */
  equipmentSustain = new Map<number, { nextTick: number; pulses: number; delivered: number }>();

  get lifesteal(): number {
    const missing = Math.max(0, 1 - this.hp / this.cfg.hp);
    return Math.min(1, (this.cfg.lifesteal ?? 0) + (this.conqueror?.lifesteal ?? 0) + this.equipment.reduce((sum, item) => {
      const effect = item.missingHpLifesteal;
      return sum + (effect ? Math.floor(missing / effect.step + 1e-9) * effect.bonus : 0);
    }, 0));
  }

  get attackSpeed(): number {
    const speed = this.cfg.atkSpeed + this.attackSpeedBonus + this.equipmentAttackSpeedBonus + this.overtimeAttackSpeedBonus + this.shadowAttackSpeedBonus + this.skillAttackSpeedBonus - this.skillAttackSpeedPenalty
      + (this.combatTick < this.spellbladeUntilTick ? this.spellblade?.attackSpeedBonus ?? 0 : 0)
      + this.swiftmartialistStacks * (this.swiftmartialist?.attackSpeedPerCast ?? 0)
      + (this.alive && this.combatTick < this.overclockUntilTick ? this.mechanicalPioneer?.attackSpeedBonus ?? 0 : 0);
    return Math.min(this.attackSpeedCap, this.skillAttackSpeedPenalty > 0 ? Math.max(.1, speed) : speed);
  }

  constructor(
    public id: number,
    public side: Side,
    public cfg: UnitConfigData,
    public x: number,
    public y: number,
  ) {
    this.hp = cfg.hp;
    this.mana = cfg.startMana;
  }

  get pos() { return { x: this.x, y: this.y }; }

  /** 快照给表现层 / 模拟器读取，防止外部直接改内部状态 */
  snapshot(tick = 0) {
    return {
      hydraulicBulwarkActive: this.alive && !!this.hydraulicBulwark && tick < this.hydraulicBulwark.untilTick,
      ...(this.shadowCorruption ? { shadowCorrupted: this.alive } : {}),
      ...(this.domainRadius ? { domainRadius: this.alive && tick < this.domainUntilTick ? this.domainRadius : 0 } : {}),
      susanooActive: this.alive && tick < this.susanooUntilTick,
      equipmentAttackStacks: this.equipmentAttackStacks,
      id: this.id,
      side: this.side,
      cfgId: this.cfg.id,
      pos: { x: this.x, y: this.y },
      hp: this.hp,
      maxHp: this.cfg.hp,
      mana: this.mana,
      manaPerSecond: this.manaPerSecond,
      maxMana: this.cfg.maxMana,
      atkCd: this.atkCd,
      moveCd: this.moveCd,
      alive: this.alive,
      shield: this.shield,
      sunlightShield: this.sunlightShield,
      spiderAirborne: this.alive && !!this.spiderLeap,
      atlasBurning: this.alive && this.burns.some(b=>b.untilBattleEnd),
      untargetable: !!this.spiderLeap || this.skillUntargetable || tick < this.untargetableUntilTick,
    };
  }
}
