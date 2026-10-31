/**
 * 全局共享卡池（纯逻辑，无 cc）。
 * - 按棋子 id 计数；初始存量按费用从 POOL_STOCK 取。
 * - 抽取/购买共用同一份状态；不允许负数；不允许同一张重复扣/还。
 * - 单机 PvE 的"全局"= 当前单局的共享池。
 */

import { Rng } from './Rng';
import { Cost, POOL_STOCK, validCost } from './ShopConfig';
import { UnitConfigData } from './ConfigManager';

export class CardPool {
  /** unitId → 剩余张数 */
  private stock: Map<string, number> = new Map();
  /** unitId → cost（冗余缓存，避免每次查配置） */
  private costOf: Map<string, Cost> = new Map();
  private locked = new Set<string>();

  constructor(
    unitConfigs: UnitConfigData[],
    initialState?: Record<string, number>,
    unlocked: readonly string[] = [],
    private createdCopies:Record<string,number> = {},
  ) {
    for (const u of unitConfigs) {
      if (u.specialShopUnlock && !unlocked.includes(u.id)) this.locked.add(u.id);
      const cost = validCost(u.cost ?? 1);
      this.costOf.set(u.id, cost);
      const n = initialState?.[u.id] ?? POOL_STOCK[cost];
      this.stock.set(u.id, Number.isFinite(n) ? Math.max(0, Math.min(POOL_STOCK[cost]+(createdCopies[u.id]??0), Math.floor(n))) : 0);
    }
  }

  /** 剩余张数；未知棋子返回 0 */
  count(unitId: string): number {
    return this.stock.get(unitId) ?? 0;
  }
  canDraw(unitId: string): boolean { return this.stock.has(unitId) && !this.locked.has(unitId); }
  unlock(unitId: string): void { this.locked.delete(unitId); }
  unlockedSpecialUnits(configs: readonly UnitConfigData[]): string[] {
    return configs.filter(u => u.specialShopUnlock && this.canDraw(u.id)).map(u => u.id).sort();
  }

  /** 整池剩余总数 */
  total(): number {
    let n = 0;
    for (const v of this.stock.values()) n += v;
    return n;
  }

  costOfUnit(unitId: string): Cost {
    return this.costOf.get(unitId) ?? 1;
  }

  /**
   * 按费用档随机抽一个还有存量的棋子 id；该档全空返回 null。
   * 调用方负责对空档重新掷费用；整池全空时上层显示空位。
   */
  pickByCost(cost: Cost, rng: Rng): string | null {
    const ids: string[] = [];
    for (const [id, n] of this.stock) {
      if (n > 0 && this.canDraw(id) && this.costOf.get(id) === cost) ids.push(id);
    }
    if (ids.length === 0) return null;
    // 确定性遍历（Map 插入序 = 配置序），rng 决定选中项
    return ids[rng.int(0, ids.length - 1)];
  }

  /** 是否还有任何棋子可抽 */
  isEmpty(): boolean {
    for (const [id, n] of this.stock) if (n > 0 && this.canDraw(id)) return false;
    return true;
  }

  /** 扣 1 张；不足返回 false（防负数） */
  take(unitId: string): boolean {
    const n = this.stock.get(unitId) ?? 0;
    if (n <= 0) return false;
    this.stock.set(unitId, n - 1);
    return true;
  }

  /** 还 1 张；防重复由调用方保证（本方法只防超额：不超过初始存量） */
  give(unitId: string): boolean {
    const n = this.stock.get(unitId) ?? 0;
    const cost = this.costOf.get(unitId);
    if (cost === undefined) return false;
    const max = POOL_STOCK[cost]+(this.createdCopies[unitId]??0);
    if (n >= max) return false; // 超过初始存量视为重复返还，拒绝
    this.stock.set(unitId, n + 1);
    return true;
  }

  /** A skill-created card is delivered directly to ownership/reserve, without drawing stock. */
  createCopy(unitId:string):boolean {
    const cost=this.costOf.get(unitId),next=(this.createdCopies[unitId]??0)+1;
    if(cost===undefined||!Number.isSafeInteger(POOL_STOCK[cost]+next))return false;
    this.createdCopies[unitId]=next;return true;
  }

  /** 存档快照 */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.stock) out[k] = v;
    return out;
  }
}
