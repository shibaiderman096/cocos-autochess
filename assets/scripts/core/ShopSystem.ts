/**
 * 商店系统（纯逻辑，无 cc）。
 * - 5 格商店：每格先按等级抽费用、再从卡池抽棋子。
 * - 费用档空则重新抽费用（最多重试 10 次）；整池空显示空位，不死循环。
 * - refresh：扣 2 金币 + 返还未购买的棋子到卡池。
 * - buy：检查金币 / 卡池 / 备战席（或可直接合并）；成功后格子清空。
 * - sell：棋子移除 + 返还卡池 1 张。
 * - 战斗期间所有操作由调用方（BattleStage.fighting）拦截。
 */

import { Rng } from './Rng';
import { CardPool } from './CardPool';
import { OwnedUnits } from './OwnedUnits';
import { EconomySystem } from './EconomySystem';
import { SHOP_RATES, SHOP_SLOTS, COST_PRICE, Cost } from './ShopConfig';
import { UnitConfigData } from './ConfigManager';

export const REFRESH_COST = 2;

export interface ShopSlot {
  unitId: string | null;
}

export type ShopError =
  | 'not_enough_gold'
  | 'pool_empty'
  | 'bench_full'
  | 'slot_empty'
  | 'fighting';

export class ShopSystem {
  slots: ShopSlot[] = [];

  constructor(
    private pool: CardPool,
    private owned: OwnedUnits,
    private economy: EconomySystem,
    private unitConfigs: Map<string, UnitConfigData>,
    private rng: Rng,
    private getLevel: () => number,
    private benchSlots: number,
    initialState?: ShopSlot[],
  ) {
    if (initialState && initialState.length === SHOP_SLOTS) {
      this.slots = initialState.map(s => ({ ...s }));
    } else {
      this.reroll(false); // 初始免费生成
    }
  }

  /** 按当前等级抽一个费用档 */
  private rollCost(level: number): Cost {
    const row = SHOP_RATES[Math.min(level, SHOP_RATES.length) - 1];
    const r = this.rng.next() * 100;
    let acc = 0;
    for (let i = 0; i < row.length; i++) {
      acc += row[i];
      if (r < acc) return (i + 1) as Cost;
    }
    return 1; // 浮点兜底
  }

  /** 生成一格：费用档重试；档空重掷费用；整池空返回 null */
  private rollOne(): ShopSlot {
    if (this.pool.isEmpty()) return { unitId: null };
    for (let attempt = 0; attempt < 10; attempt++) {
      const cost = this.rollCost(this.getLevel());
      const id = this.pool.pickByCost(cost, this.rng);
      if (id) return { unitId: id };
      // 该档全空，重掷费用
    }
    return { unitId: null };
  }

  /** 刷新 5 格（内部生成，不扣钱） */
  private reroll(free: boolean): void {
    this.slots = [];
    for (let i = 0; i < SHOP_SLOTS; i++) {
      this.slots.push(this.rollOne());
    }
  }

  /**
   * 手动刷新：扣金币 + 返还未购买棋子。
   * 返回 null = 成功；否则返回错误码。
   */
  refresh(): ShopError | null {
    if (!this.economy.spend(REFRESH_COST)) return 'not_enough_gold';
    this.returnUnbought();
    this.reroll(false);
    return null;
  }

  /** 返还未购买的商店棋子到卡池（关闭/重开时也调用） */
  returnUnbought(): void {
    for (const s of this.slots) {
      if (s.unitId) {
        this.pool.give(s.unitId);
        s.unitId = null;
      }
    }
  }

  /**
   * 购买指定格。
   * 返回 null = 成功（棋子进备战席或直接合并）；否则返回错误码。
   */
  buy(slotIndex: number, canPlaceOnBoardHint = false): { error?: ShopError; mergedUid?: number; uid?: number } {
    const s = this.slots[slotIndex];
    if (!s || !s.unitId) return { error: 'slot_empty' };
    const unitId = s.unitId;
    const price = COST_PRICE[this.pool.costOfUnit(unitId)];

    if (this.economy.gold < price) return { error: 'not_enough_gold' };
    if (this.pool.count(unitId) <= 0) return { error: 'pool_empty' };

    // 备战席满：若该购买能直接完成合并则放行，否则拒绝
    const benchFree = this.owned.inBench().length < this.benchSlots;
    if (!benchFree) {
      const same = this.owned.all().filter(u => u.unitId === unitId && u.star === 1).length;
      if (same + 1 < 3) return { error: 'bench_full' };
      // 满但能合并：addToBench 会失败（无空位），需临时放行
      // 简化：先扣钱扣池，直接执行合并逻辑（tryMerge 用临时计数）
      this.economy.spend(price);
      this.pool.take(unitId);
      // 手动构造合并：新增第 3 张 → 立即 tryMerge
      // 由于 addToBench 需要空位，这里直接创建临时棋子并合并
      const tempUid = -(Date.now() % 1000000); // 临时 uid
      const u = {
        uid: tempUid, unitId, star: 1,
        location: 'bench' as const, x: -1, y: -1,
      };
      // 直接操作 owned 内部：通过 addToBench 不可行，改为 forceAdd + tryMerge
      // OwnedUnits 需要暴露 forceAdd —— 简化：临时放宽 benchSlots=999
      const added = (this.owned as unknown as { addToBench(unitId: string, benchSlots: number, slot?: number, star?: number): unknown })
        .addToBench(unitId, 999, -1, 1);
      if (!added) {
        // 理论不可达
        this.economy.add(price);
        this.pool.give(unitId);
        return { error: 'bench_full' };
      }
      const merged = this.owned.tryMerge(unitId);
      s.unitId = null;
      return { mergedUid: merged ? merged.uid : (added as { uid: number }).uid };
    }

    // 正常购买
    this.economy.spend(price);
    this.pool.take(unitId);
    const added = this.owned.addToBench(unitId, this.benchSlots, -1, 1);
    if (!added) {
      // 理论不可达（已检查 benchFree）
      this.economy.add(price);
      this.pool.give(unitId);
      return { error: 'bench_full' };
    }
    s.unitId = null;
    return { uid: added.uid };
  }

  /** 出售：移除棋子 + 返还卡池 + 加金币。战斗期间由调用方拦截。 */
  sell(uid: number): { gold: number } | null {
    const u = this.owned.get(uid);
    if (!u) return null;
    const cost = this.pool.costOfUnit(u.unitId);
    const gold = COST_PRICE[cost] * u.star; // 星级倍数出售
    this.owned.remove(uid);
    this.pool.give(u.unitId);
    this.economy.add(gold);
    return { gold };
  }

  /** 存档快照 */
  snapshot(): ShopSlot[] {
    return this.slots.map(s => ({ ...s }));
  }
}
