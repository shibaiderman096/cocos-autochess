import { BurnRuntime, Side, EquipmentConfigData } from './types';
import { UnitConfigData } from '../core/ConfigManager';

export class Unit {
  hp: number;
  mana: number;
  atkCd = 0;
  moveCd = 0;
  alive = true;
  star = 1;
  skillScale = 1;
  pendingCast: { skillId: string; remainingTicks: number; targetId?: number; nextHealTick?: number } | null = null;
  burns: BurnRuntime[] = [];
  empoweredAttacks = 0;
  permanentEmpower = false;
  attackMultiplier = 1;
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
  shield = 0;
  untargetableUntilTick = 0;
  lowHealthProtectionUsed = false;
  equipmentRegen: { startTick: number; durationTicks: number; total: number; delivered: number } | null = null;

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
      maxMana: this.cfg.maxMana,
      atkCd: this.atkCd,
      moveCd: this.moveCd,
      alive: this.alive,
      shield: this.shield,
      untargetable: tick < this.untargetableUntilTick,
    };
  }
}
