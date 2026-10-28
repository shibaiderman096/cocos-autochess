/**
 * 等级与经验系统（纯逻辑，无 cc）。
 * - 初始 1 级，上限 10 级。
 * - 每回合战斗结束 +2 经验。
 * - 备战期可单次花费 4 金币购买 4 经验。
 * - 5 级起升级经验降低 10%，取最接近的偶数。
 * - 支持一次奖励连续升级；剩余经验保留。
 * - 当前等级 = 上阵棋子数上限；降级不会发生；升级不删除已有棋子（超员提示由调用方处理）。
 */

export const MAX_LEVEL = 10;
/** 每回合战斗结束后获得的经验 */
export const EXP_PER_BATTLE = 2;
/** One preparation-phase purchase exchanges four gold for four experience. */
export const EXP_PURCHASE = { gold: 4, exp: 4 } as const;

/** Array index = current level minus one; level 10 has no next level. */
export const LEVEL_UP_EXP: ReadonlyArray<number> = [
  2,  // 1 → 2
  2,  // 2 → 3
  6,  // 3 → 4
  10, // 4 → 5
  28, // 5 → 6
  44, // 6 → 7
  66, // 7 → 8
  86, // 8 → 9
  116, // 9 → 10
];

export interface LevelUpEvent {
  from: number;
  to: number;
}

export class LevelSystem {
  level: number;
  /** 当前等级内已积累、尚未消费的经验 */
  exp: number;
  /** Session-owned equipment is the source of truth; this is not a saved bonus counter. */
  populationBonus: () => number = () => 0;

  constructor(initialState?: { level: number; exp: number }) {
    this.level = Number.isFinite(initialState?.level) ? Math.floor(initialState.level) : 1;
    this.exp = Number.isFinite(initialState?.exp) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(initialState.exp))) : 0;
    if (this.level < 1) this.level = 1;
    if (this.level > MAX_LEVEL) this.level = MAX_LEVEL;
  }

  /** 当前等级升下一级所需经验；10 级返回 Infinity */
  expToNext(): number {
    if (this.level >= MAX_LEVEL) return Infinity;
    return LEVEL_UP_EXP[this.level - 1];
  }

  /** 上阵上限包含当前装备提供的人口，不改变等级或商店概率。 */
  get unitCap(): number {
    return this.level + this.populationBonus();
  }

  /**
   * 增加经验并自动连续升级。
   * 返回升级路径（如 1→2→3 则 [{from:1,to:2},{from:2,to:3}]）。
   */
  addExp(amount: number): LevelUpEvent[] {
    if (!Number.isFinite(amount) || amount < 0) return [];
    this.exp = Math.min(Number.MAX_SAFE_INTEGER, this.exp + Math.floor(amount));
    const ups: LevelUpEvent[] = [];
    while (this.level < MAX_LEVEL && this.exp >= this.expToNext()) {
      const need = this.expToNext();
      this.exp -= need;
      const from = this.level;
      this.level++;
      ups.push({ from: from, to: this.level });
    }
    // 10 级时经验封顶不再累积意义，但保留数值不丢（供调试）
    return ups;
  }

  /** 存档快照 */
  snapshot(): { level: number; exp: number } {
    return { level: this.level, exp: this.exp };
  }
}
