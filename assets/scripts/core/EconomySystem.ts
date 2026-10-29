/**
 * 经济系统（纯逻辑，无 cc）。
 * 结算顺序（固定且可测试）：
 *   1. 用战斗结果更新连胜/连败计数
 *   2. 阶段固定金币为 0
 *   3. 计算胜利奖励（胜 +1 / 负 +0 / 平 +0）
 *   4. 计算存款利息 = min(floor(结算前余额 × 0.1), 5)
 *   5. 计算连胜/连败奖励 = min(计数, 6)
 *   6. 加入奇遇/其他额外收入后入账
 *
 * 平局处理：按现有项目规则，BattleSim 超时判 winner = -1（平局）。
 * 平局既不增加连胜也不增加连败，两个计数都保持不变。
 *
 * 所有消费（买棋子/刷新/购买经验）必须走 spend()，保证余额不为负、UI 单一数据源。
 */

export interface EconomyConfig {
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
  interestCap: 5,
  interestRate: 0.1,
  streakCap: 6,
  winBonus: 1,
  initialGold: 0,
};

/** Authored one-time entry income, separate from battle settlement and its interest. */
export const EARLY_STAGE_GOLD: Readonly<Record<number, number>> = { 2: 5, 3: 5 };

export interface BattleOutcome {
  interestGold?: number;
  /** 0 = 己方胜，1 = 敌方胜，-1 = 平局 */
  winner: number;
  /** Encounter and other one-time income; excluded from this round's interest. */
  extraIncome?: number;
  /** Neutral encounters keep both streaks intact; other income still settles normally. */
  countsForStreak?: boolean;
}

export interface SettlementBreakdown {
  extraIncome: number;
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
export interface IncomePreview {
  /** Already credited at this wave's entry; never included in projected settlement. */
  entrySubsidy?: number;
  gold:number; winStreak:number; loseStreak:number; streakBonus:number; progress:number; progressMax:number;
  win:SettlementBreakdown; loss:SettlementBreakdown;
}

export class EconomySystem {
  gold: number;
  unlimitedInterest = false;
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
    for (const [key, value] of Object.entries(config)) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid economy config: ${key}`);
    }
    const integer = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n))) : 0;
    this.gold = integer(initialState?.gold ?? config.initialGold);
    if (initialState) {
      this.winStreak = integer(initialState.winStreak ?? 0);
      this.loseStreak = integer(initialState.loseStreak ?? 0);
    }
  }

  /**
   * 结算一场战斗。返回明细供 UI 展示。
   * 调用方保证一场战斗只调用一次（本方法内部不防重，由状态机保证）。
   */
  settleBattle(floor: number, outcome: BattleOutcome): SettlementBreakdown {
    if (!Number.isSafeInteger(floor) || floor < 1 || ![-1, 0, 1].includes(outcome.winner)) throw new Error('Invalid settlement input');
    const extraIncome = outcome.extraIncome ?? 0;
    if (!Number.isSafeInteger(extraIncome) || extraIncome < 0) throw new Error('Invalid extra income');
    const interestGold = outcome.interestGold ?? this.gold;
    if (!Number.isSafeInteger(interestGold)||interestGold<0) throw new Error('Invalid interest wallet');
    const interest = Math.min(this.unlimitedInterest ? Math.floor(interestGold / 10) : Math.floor(interestGold * this.config.interestRate), this.unlimitedInterest ? Number.MAX_SAFE_INTEGER : this.config.interestCap);
    const projected = extraIncome + this.config.winBonus + interest + this.config.streakCap;
    if (!Number.isFinite(projected) || projected > Number.MAX_SAFE_INTEGER - this.gold) throw new Error('Settlement exceeds safe range');
    // 1. 先更新连胜/连败（在计算奖励之前）
    if (outcome.countsForStreak !== false && outcome.winner === 0) {
      this.winStreak++;
      this.loseStreak = 0;
    } else if (outcome.countsForStreak !== false && outcome.winner === 1) {
      this.loseStreak++;
      this.winStreak = 0;
    }
    // winner === -1（平局）：两个计数都不变

    // 2~5. 计算各项收入
    const goldBefore = this.gold;
    const winBonus = outcome.winner === 0 ? this.config.winBonus : 0;

    const streakBonus = Math.min(
      Math.max(this.winStreak, this.loseStreak),
      this.config.streakCap,
    );
    const total = winBonus + interest + streakBonus + extraIncome;

    // 6. 入账
    this.gold += total;

    return {
      winBonus, interest, streakBonus, extraIncome, total,
      goldBefore, goldAfter: this.gold,
      winStreak: this.winStreak, loseStreak: this.loseStreak,
    };
  }

  /** 消费金币；余额不足返回 false，成功扣除返回 true。绝不扣成负数。 */
  spend(amount: number): boolean {
    if (!Number.isFinite(amount) || !Number.isSafeInteger(this.gold) || this.gold < 0) return false;
    const n = Math.floor(amount);
    if (n <= 0) return false;
    if (this.gold < n) return false;
    this.gold -= n;
    return true;
  }

  /** 直接加金币（奖励/调试用），不做上限限制 */
  add(amount: number): void {
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(this.gold)) return;
    this.gold = Math.min(Number.MAX_SAFE_INTEGER, this.gold + Math.floor(amount));
  }

  /** 存档快照 */
  snapshot(): { gold: number; winStreak: number; loseStreak: number } {
    return { gold: this.gold, winStreak: this.winStreak, loseStreak: this.loseStreak };
  }
  /** Use the settlement path on detached wallets so displayed projections cannot pay rewards. */
  preview(floor:number,winExtra=0,countsForStreak=true,interestGold?:number):IncomePreview {
    const current=Math.max(this.winStreak,this.loseStreak),state=this.snapshot();
    const project=(winner:number,extraIncome=0)=>{
      const wallet=new EconomySystem(this.config,state);wallet.unlimitedInterest=this.unlimitedInterest;
      return wallet.settleBattle(floor,{winner,extraIncome,countsForStreak,interestGold});
    };
    return {...state,streakBonus:Math.min(current,this.config.streakCap),progress:Math.min(current,this.config.streakCap),progressMax:Math.max(1,this.config.streakCap),
      win:project(0,winExtra),
      loss:project(1)};
  }
}
