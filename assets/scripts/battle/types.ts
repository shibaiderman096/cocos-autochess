/** 逻辑层公共类型（不含渲染概念） */

export interface BackpackItem { id: string; name: string; icon: string; description?: string; kind: 'equipment' | 'consumable'; }
export const MAX_EQUIPMENT = 3;
export interface EquipmentConfigData {
  id: string;
  name: string;
  spellPower: number;
  /** Absolute attacks/second: 0.1 is displayed as +10% attack speed. */
  attackSpeedBonus: number;
  /** Absolute attacks/second gained per basic attack: 0.05 means +5%. */
  attackSpeedPerAttack: number;
  hp?: number;
  armor?: number;
  mr?: number;
  physicalPower?: number;
  /** Additive probability: 0.35 means +35 percentage points. */
  critChance?: number;
  skillCanCrit?: boolean;
  lifesteal?: number;
  /** Applied after all flat equipment HP; multiple copies add their percentages. */
  maxHpBonus?: number;
  spellPowerDamageAmp?: { step: number; bonus: number; cap: number };
  missingHpLifesteal?: { step: number; bonus: number };
  armorDamageReduction?: { threshold: number; bonus: number };
  lowTargetDamageAmp?: { threshold: number; bonus: number };
  magicDamageReduction?: number;
  lowHealthRegen?: { threshold: number; intervalSeconds: number; maxHpFraction: number };
  description?: string;
  /** Effect-only copy for equipment cards; base stat rows come from numeric fields. */
  effectDescription?: string;
  /** Shared by the carrier: triggers once per battle, including lethal damage. */
  lowHealthProtection?: {
    threshold: number;
    untargetableSeconds: number;
    shieldMaxHpFraction: number;
    healMaxHpFraction: number;
    healSeconds: number;
  };
  icon: string;
}

export type Side = 0 | 1; // 0 = 己方（下 4 行），1 = 敌方（上 4 行）
export interface Pos { x: number; y: number }
export type DmgType = 'physical' | 'magic' | 'true';

export interface BurnRuntime {
  sourceId: number;
  skillId: string;
  nextTick: number;
  intervalTicks: number;
  remainingPulses: number;
  rawDamage: number;
  dmgType: DmgType;
}

export interface CombatAttributes {
  /** Percentage bonus applied only to physical damage; 0 means no bonus. */
  physicalPower: number;
  /** Percentage bonus applied only to magic damage; 0 means no bonus. */
  spellPower: number;
  critChance: number;
  lifesteal: number;
  damageAmp: number;
  damageReduction: number;
}

export type BattleEvent =
  | { t: 'battle_start'; tick: number }
  | { t: 'move';   tick: number; id: number; from: Pos; to: Pos }
  | { t: 'teleport'; tick: number; id: number; from: Pos; to: Pos }
  | { t: 'attack'; tick: number; id: number; target: number }
  | { t: 'hit';    tick: number; id: number; source: number; actualDamage: number; dmg: number; hp: number; dmgType: DmgType; critical?: boolean }
  | { t: 'heal';   tick: number; id: number; source: number; amount: number; hp: number }
  | { t: 'shield'; tick: number; id: number; source?: number; equipmentId?: string; amount: number; shield: number }
  | { t: 'equipment_trigger'; tick: number; id: number; equipmentId: string; shield: number }
  | { t: 'cast';   tick: number; id: number; skillId: string; target: number; duration?: number }
  | { t: 'burn'; tick: number; id: number; source: number; duration: number }
  | { t: 'stun'; tick: number; id: number; source: number; duration: number }
  | { t: 'knockup'; tick: number; id: number; source: number; duration: number }
  | { t: 'guard'; tick: number; id: number; duration: number; reduction: number }
  | { t: 'skill_impact'; tick: number; id: number; target: number; skillId: string }
  | { t: 'death';  tick: number; id: number }
  | { t: 'end';    tick: number; winner: Side | -1 };

export interface BattleResult {
  winner: Side | -1; // -1 = 平局
  ticks: number;
  events: BattleEvent[];
  survivors: number[];
}

export interface CombatStatRow {
  id: number; name: string; side: Side; star: number;
  damage: number; taken: number; healing: number;
  /** Total shields granted, counted at acquisition rather than absorption. */
  shielding: number;
  damageByType: Record<DmgType, number>;
  takenByType: Record<DmgType, number>;
}

export interface UnitRuntime {
  manaPerSecond?: number;
  id: number;
  side: Side;
  cfgId: string;
  pos: Pos;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  atkCd: number;
  moveCd: number;
  alive: boolean;
  shield?: number;
  untargetable?: boolean;
}
