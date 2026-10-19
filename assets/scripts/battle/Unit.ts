import { BurnRuntime, Side, EquipmentConfigData, ShadowTraitEffect, ShadowCorruption } from './types';
import { UnitConfigData } from '../core/ConfigManager';

export class Unit {
  hp: number;
  mana: number;
  manaPerSecond = 0;
  traitRegenPerSecond = 0;
  traitAttackDamage = 0;
  traitExecuteThreshold = 0;
  shadowAttack?: ShadowTraitEffect;
  shadowCorruption?: ShadowCorruption;
  shadowAttackSpeedBonus = 0;
  sunlightShield = 0;
  skillArmorBonus = 0;
  skillMrBonus = 0;
  skillAttackSpeedBonus = 0;
  skillAttackSpeedPenalty = 0;
  skillUntargetable = false;
  domainUntilTick = 0;
  domainRadius = 0;
  fearUntilTick = 0;
  fearOrigin = { x: 0, y: 0 };
  get armor(): number { return (this.cfg.armor + this.skillArmorBonus) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
  get mr(): number { return (this.cfg.mr + this.skillMrBonus) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
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
  get damageAmp(): number { return (this.cfg.damageAmp ?? 0) + this.overtimeDamageAmp - (this.shadowCorruption?.damageAmpLoss ?? 0); }
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
      + (tick < this.susanooUntilTick ? this.susanooReduction : 0));
  }
  shield = 0;
  untargetableUntilTick = 0;
  lowHealthProtectionUsed = false;
  equipmentRegen: { startTick: number; durationTicks: number; total: number; delivered: number } | null = null;
  /** Per-slot state allows repeated regen items to trigger and heal independently. */
  equipmentSustain = new Map<number, { nextTick: number; pulses: number; delivered: number }>();

  get lifesteal(): number {
    const missing = Math.max(0, 1 - this.hp / this.cfg.hp);
    return Math.min(1, (this.cfg.lifesteal ?? 0) + this.equipment.reduce((sum, item) => {
      const effect = item.missingHpLifesteal;
      return sum + (effect ? Math.floor(missing / effect.step + 1e-9) * effect.bonus : 0);
    }, 0));
  }

  get attackSpeed(): number {
    const speed = this.cfg.atkSpeed + this.attackSpeedBonus + this.equipmentAttackSpeedBonus + this.overtimeAttackSpeedBonus + this.shadowAttackSpeedBonus + this.skillAttackSpeedBonus - this.skillAttackSpeedPenalty;
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
      untargetable: this.skillUntargetable || tick < this.untargetableUntilTick,
    };
  }
}
