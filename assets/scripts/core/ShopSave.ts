/**
 * 存档 v2：在 v1 基础上加入商店/备战席/卡池字段。
 * migrateSave 兼容 v1 旧档（缺失字段补默认值）。
 */

import { SaveData, migrateSave as migrateV1 } from './SaveData';
import { ShopSlot } from './ShopSystem';
import { OwnedUnit } from './OwnedUnits';
import { DEFAULT_BENCH_SLOTS } from './ShopConfig';
import { RoundSnapshot } from './RoundFlow';
import { SettlementBreakdown } from './EconomySystem';
import { DEFAULT_STAGE_COUNT, normalizeStageCount } from './RunSetup';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'autochess_save_v2';

export interface SaveDataV2 extends SaveData {
  stageCount: number;
  /** 商店 5 格内容 */
  shop: ShopSlot[];
  /** true 表示商店商品已从 pool 预留；缺省为旧版未预留存档。 */
  shopReserved: boolean;
  /** 玩家持有棋子（备战席 + 棋盘） */
  owned: OwnedUnit[];
  /** 卡池剩余 unitId → 数量 */
  pool: Record<string, number>;
  /** 备战席格子数 */
  benchSlots: number;
  round: RoundSnapshot | null;
  shopLocked: boolean;
  lastReward?: { breakdown: SettlementBreakdown; expGained: number; levelUps: number };
}

export function migrateSaveV2(raw: unknown): SaveDataV2 {
  const v1 = migrateV1(raw); // 先走 v1 钳位
  const d = (raw ?? {}) as Partial<SaveDataV2>;

  // shop：必须恰好 5 格，每格 unitId 必须是 string | null
  let shop: ShopSlot[] = [];
  if (Array.isArray(d.shop) && d.shop.length === 5) {
    shop = d.shop.map(s => ({ unitId: (s && typeof s.unitId === 'string') ? s.unitId : null }));
  } else {
    shop = [0, 1, 2, 3, 4].map(() => ({ unitId: null }));
  }

  // owned：数组 + 字段钳位
  const owned: OwnedUnit[] = [];
  if (Array.isArray(d.owned)) {
    let nextUid = 1;
    for (const u of d.owned) {
      if (!u || typeof u.unitId !== 'string') continue;
      const star = Math.max(1, Math.min(3, Math.floor(Number(u.star)) || 1));
      const loc = u.location === 'board' ? 'board' : 'bench';
      const x = Math.max(-1, Math.floor(Number(u.x)) || 0);
      const y = Math.max(0, Math.floor(Number(u.y)) || 0);
      owned.push({ uid: nextUid++, unitId: u.unitId, star, location: loc, x, y });
    }
  }

  // pool：Record<string, number>，负值钳 0
  const pool: Record<string, number> = {};
  if (d.pool && typeof d.pool === 'object') {
    for (const [k, v] of Object.entries(d.pool)) {
      const n = Math.floor(Number(v));
      pool[k] = Number.isFinite(n) ? Math.max(0, n) : 0;
    }
  }

  const benchSlots = Math.max(1, Math.min(12, Math.floor(Number(d.benchSlots)) || DEFAULT_BENCH_SLOTS));
  const r = d.round;
  const round: RoundSnapshot | null = r && Number.isFinite(r.health) && Number.isInteger(r.waveIndex)
    && ['prepare', 'battle', 'settlement', 'ended'].includes(r.phase) ? {
      phase:r.phase, waveIndex:Math.max(0, r.waveIndex), health:Math.max(0, r.health),
      result:r.result === 'victory' || r.result === 'defeat' ? r.result : null,
      lastSettlement:r.lastSettlement && Number.isFinite(r.lastSettlement.healthRemaining) ? { ...r.lastSettlement } : null,
    } : null;

  return {
    ...v1,
    version: SAVE_VERSION,
    stageCount: normalizeStageCount(d.stageCount ?? DEFAULT_STAGE_COUNT),
    shop, owned, pool, benchSlots, shopReserved: d.shopReserved === true,
    round, shopLocked: d.shopLocked === true,
    lastReward: d.lastReward && Number.isFinite(d.lastReward.breakdown?.total) ? d.lastReward : undefined,
  };
}

export function loadSaveV2(): SaveDataV2 | null {
  try {
    const s = typeof localStorage !== 'undefined'
      ? localStorage.getItem(SAVE_KEY) ?? localStorage.getItem('autochess_save_v1')
      : null;
    if (!s) return null;
    return migrateSaveV2(JSON.parse(s));
  } catch {
    return null;
  }
}

export function writeSaveV2(data: SaveDataV2): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    }
  } catch {}
}

export function freshSaveV2(stageCount = DEFAULT_STAGE_COUNT): SaveDataV2 {
  return migrateSaveV2({ stageCount });
}
