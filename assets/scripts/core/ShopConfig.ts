/**
 * 商店与卡池配置（纯逻辑，无 cc）。
 * - SHOP_RATES[level] = 该等级 5 个费用档的抽取概率（总和必须 100）。
 * - POOL_STOCK[cost] = 每个不同棋子的初始存量。
 * - 概率表独立配置，商店逻辑不写分支。
 */

/** 费用档位 1~5 */
export type Cost = 1 | 2 | 3 | 4 | 5;

export function validCost(value: number = 1): Cost {
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('Invalid unit cost');
  return value as Cost;
}

/** SHOP_RATES[level][costIndex]，costIndex 0=1费 ... 4=5费；单位 % */
export const SHOP_RATES: ReadonlyArray<ReadonlyArray<number>> = [
  [100, 0, 0, 0, 0],   // 1 级
  [100, 0, 0, 0, 0],   // 2 级
  [75, 25, 0, 0, 0],   // 3 级
  [55, 30, 15, 0, 0],  // 4 级
  [45, 33, 20, 2, 0],  // 5 级
  [30, 40, 25, 5, 0],  // 6 级
  [16, 30, 43, 10, 1], // 7 级
  [15, 20, 32, 30, 3], // 8 级
  [10, 17, 25, 33, 15],// 9 级
  [5, 10, 20, 40, 25], // 10 级
];

/** Normalize against implemented cost tiers; empty stocks still use the normal retry rule. */
export function shopCostRates(level: number, supportedCosts: readonly number[] = [1, 2, 3, 4, 5]): number[] {
  const row = SHOP_RATES[Math.max(0, Math.min(SHOP_RATES.length - 1, Math.floor(Number.isFinite(level) ? level : 1) - 1))];
  const weights = row.map((rate, i) => supportedCosts.includes(i + 1) ? rate : 0);
  const total = weights.reduce((sum, rate) => sum + rate, 0);
  return weights.map(rate => total ? rate * 100 / total : 0);
}

/** 每个不同棋子的初始存量（按费用） */
export const POOL_STOCK: Readonly<Record<Cost, number>> = {
  1: 30, 2: 25, 3: 18, 4: 10, 5: 9,
};

/** 购买价格（按费用） */
export const COST_PRICE: Readonly<Record<Cost, number>> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
};

/** One-cost units keep full combined value; upgraded higher costs lose one gold. */
export const COST_SELL: Readonly<Record<Cost, number>> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5,
};

export function sellPrice(cost: Cost, star: number): number {
  const rank = Math.max(1, Math.min(3, Math.floor(Number.isFinite(star) ? star : 1)));
  return COST_SELL[validCost(cost)] * 3 ** (rank - 1) - (cost > 1 && rank > 1 ? 1 : 0);
}

/** 商店格子数 */
export const SHOP_SLOTS = 5;

/** 备战席格子数（可通过 SAVE 配置修改的默认值） */
export const DEFAULT_BENCH_SLOTS = 9;

/** 升星合成所需同名棋子数 */
export const MERGE_COUNT = 3;

/** 校验所有等级概率总和为 100 */
export function validateRates(): string[] {
  const errors: string[] = [];
  for (let lv = 1; lv <= SHOP_RATES.length; lv++) {
    const row = SHOP_RATES[lv - 1];
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum !== 100) errors.push(`level ${lv}: rates sum ${sum} != 100`);
  }
  return errors;
}
