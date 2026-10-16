import { BurnRuntime, Side, EquipmentConfigData } from './types';
import { UnitConfigData } from '../core/ConfigManager';

export class Unit {
  hp: number;
  mana: number;
  manaPerSecond = 0;
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
  damageReductionAt(tick: number): number {
    return Math.min(1, (this.cfg.damageReduction ?? 0) + (tick < this.guardUntilTick ? this.guardReduction : 0));
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

  get attackSpeed(): number { return Math.min(this.attackSpeedCap, this.cfg.atkSpeed + this.attackSpeedBonus + this.equipmentAttackSpeedBonus); }

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
      untargetable: tick < this.untargetableUntilTick,
    };
  }
}
