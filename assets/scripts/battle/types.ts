/** 逻辑层公共类型（不含渲染概念） */

export type Side = 0 | 1; // 0 = 己方（下 4 行），1 = 敌方（上 4 行）
export interface Pos { x: number; y: number }
export type DmgType = 'physical' | 'magic' | 'true';

export interface CombatAttributes {
  /** 100 means 100% of the configured skill damage. */
  spellPower: number;
  critChance: number;
  lifesteal: number;
  damageAmp: number;
  damageReduction: number;
}

export type BattleEvent =
  | { t: 'battle_start'; tick: number }
  | { t: 'move';   tick: number; id: number; from: Pos; to: Pos }
  | { t: 'attack'; tick: number; id: number; target: number }
  | { t: 'hit';    tick: number; id: number; dmg: number; hp: number; dmgType: DmgType; critical?: boolean }
  | { t: 'heal';   tick: number; id: number; amount: number; hp: number }
  | { t: 'cast';   tick: number; id: number; skillId: string; target: number }
  | { t: 'death';  tick: number; id: number }
  | { t: 'end';    tick: number; winner: Side | -1 };

export interface BattleResult {
  winner: Side | -1; // -1 = 平局
  ticks: number;
  events: BattleEvent[];
  survivors: number[];
}

export interface UnitRuntime {
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
}
