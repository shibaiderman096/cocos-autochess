/**
 * 经济系统（纯逻辑，无 cc）。
 * 结算顺序（固定且可测试）：
 *   1. 用战斗结果更新连胜/连败计数
 *   2. 计算阶段收入（floor × 每层金币）
 *   3. 计算胜利奖励（胜 +1 / 负 +0 / 平 +0）
 *   4. 计算存款利息 = min(floor(结算前余额 × 0.1), 5)
 *   5. 计算连胜/连败奖励 = min(floor(计数 / 2), 3)
 *   6. 总收入入账
 *
 * 平局处理：按现有项目规则，BattleSim 超时判 winner = -1（平局）。
 * 平局既不增加连胜也不增加连败，两个计数都保持不变。
 *
 * 所有消费（买棋子/刷新）必须走 spend()，保证余额不为负、UI 单一数据源。
 */

export interface EconomyConfig {
  /** 每层基础阶段收入 */
  incomePerFloor: number;
  /** 利息上限 */
  interestCap: number;
  /** 利息比率 */
  interestRate: number;
  /** 连胜/连败奖励上限 */
  streakCap: number;
  /** 胜利奖励 */
  winBonus: number;
  /** 初始金币 */
  initialGold: number;
}

export const DEFAULT_ECONOMY_CONFIG: EconomyConfig = {
  incomePerFloor: 5,
  interestCap: 5,
  interestRate: 0.1,
  streakCap: 3,
  winBonus: 1,
  initialGold: 20,
};

export interface BattleOutcome {
  /** 0 = 己方胜，1 = 敌方胜，-1 = 平局 */
  winner: number;
}

export interface SettlementBreakdown {
  floorIncome: number;
  winBonus: number;
  interest: number;
  streakBonus: number;
  total: number;
  goldBefore: number;
  goldAfter: number;
  /** 结算后的连胜数 */
  winStreak: number;
  /** 结算后的连败数 */
  loseStreak: number;
}

export class EconomySystem {
  gold: number;
  winStreak = 0;
  loseStreak = 0;

  constructor(
    public config: EconomyConfig = { ...DEFAULT_ECONOMY_CONFIG },
    initialState?: {
      gold: number;
      winStreak: number;
      loseStreak: number;
    },
  ) {
    this.gold = initialState?.gold ?? config.initialGold;
    if (initialState) {
      this.winStreak = initialState.winStreak ?? 0;
      this.loseStreak = initialState.loseStreak ?? 0;
    }
  }

  /**
   * 结算一场战斗。返回明细供 UI 展示。
   * 调用方保证一场战斗只调用一次（本方法内部不防重，由状态机保证）。
   */
  settleBattle(floor: number, outcome: BattleOutcome): SettlementBreakdown {
    // 1. 先更新连胜/连败（在计算奖励之前）
    if (outcome.winner === 0) {
      this.winStreak++;
      this.loseStreak = 0;
    } else if (outcome.winner === 1) {
      this.loseStreak++;
      this.winStreak = 0;
    }
    // winner === -1（平局）：两个计数都不变

    // 2~5. 计算各项收入
    const goldBefore = this.gold;
    const floorIncome = Math.max(0, Math.floor(floor)) * this.config.incomePerFloor;
    const winBonus = outcome.winner === 0 ? this.config.winBonus : 0;
    const interest = Math.min(
      Math.floor(goldBefore * this.config.interestRate),
      this.config.interestCap,
    );
    const streakBonus = Math.min(
      Math.floor(Math.max(this.winStreak, this.loseStreak) / 2),
      this.config.streakCap,
    );
    const total = floorIncome + winBonus + interest + streakBonus;

    // 6. 入账
    this.gold += total;

    return {
      floorIncome, winBonus, interest, streakBonus, total,
      goldBefore, goldAfter: this.gold,
      winStreak: this.winStreak, loseStreak: this.loseStreak,
    };
  }

  /** 消费金币；余额不足返回 false，成功扣除返回 true。绝不扣成负数。 */
  spend(amount: number): boolean {
    const n = Math.floor(amount);
    if (n <= 0) return false;
    if (this.gold < n) return false;
    this.gold -= n;
    return true;
  }

  /** 直接加金币（奖励/调试用），不做上限限制 */
  add(amount: number): void {
    this.gold += Math.floor(amount);
  }

  /** 存档快照 */
  snapshot(): { gold: number; winStreak: number; loseStreak: number } {
    return { gold: this.gold, winStreak: this.winStreak, loseStreak: this.loseStreak };
  }
}
