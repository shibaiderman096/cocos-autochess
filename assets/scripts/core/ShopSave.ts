/**
 * 存档 v2：在 v1 基础上加入商店/备战席/卡池字段。
 * migrateSave 兼容 v1 旧档（缺失字段补默认值）。
 */

import { SaveData, migrateSave as migrateV1 } from './SaveData';
import { ShopSlot } from './ShopSystem';
import { MAX_EQUIPMENT, BackpackItem } from '../battle/types';
import { OwnedUnit } from './OwnedUnits';
import { DEFAULT_BENCH_SLOTS, POOL_STOCK, validCost } from './ShopConfig';
import { UnitConfigData } from './ConfigManager';
import { RoundSnapshot } from './RoundFlow';
import { SettlementBreakdown } from './EconomySystem';
import { DEFAULT_STAGE_COUNT, normalizeStageCount } from './RunSetup';
import { DEFAULT_RUN_SEED, RUN_RULES_VERSION, isRunSeed } from './RunRandomContext';
import { DEFAULT_POWER_MODEL_VERSION, DEFAULT_CALIBRATION_HASH } from './EnemyGenerationTypes';
import type { EnemyGenerationMode } from './EnemyGenerationTypes';
import { FORMATION_VERSION } from './EnemyFormationTypes';
import type { FormationOverride } from './EnemyFormationTypes';
import type { EquipmentProgress,EquipmentRewardEvent } from './EquipmentPolicyTypes';
import type { StageProgressState } from './StageProgression';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'autochess_save_v2';

const safeInt = (value: unknown, fallback: number, min: number, max: number): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback;
};

/** Configuration-aware repair: owned cards take priority over shop reservations. */
export function restoreShopState(save: SaveDataV2, configs: UnitConfigData[], boardWidth: number, ownRows: number): void {
  const remaining: Record<string, number> = {};
  for (const cfg of configs) remaining[cfg.id] = POOL_STOCK[validCost(cfg.cost ?? 1)];
  const occupied = new Set<string>();
  const valid = (u: OwnedUnit) => u.location === 'board'
    ? u.x >= 0 && u.x < boardWidth && u.y >= 0 && u.y < ownRows
    : u.y >= 0 && u.y < save.benchSlots;
  const key = (u: OwnedUnit) => `${u.location}:${u.location === 'bench' ? -1 : u.x}:${u.y}`;
  const kept: OwnedUnit[] = [], displaced: OwnedUnit[] = [];
  for (const u of save.owned) {
    const cards = 3 ** (u.star - 1);
    if (!(remaining[u.unitId] >= cards)) continue;
    remaining[u.unitId] -= cards;
    if (u.location === 'bench') u.x = -1;
    kept.push(u);
    if (valid(u) && !occupied.has(key(u))) occupied.add(key(u));
    else displaced.push(u);
  }
  for (const u of displaced) {
    const candidates: Array<{ location: 'board' | 'bench'; x: number; y: number }> = [];
    if (u.location === 'board') {
      candidates.push({ location: 'board', x: Math.max(0, Math.min(boardWidth - 1, u.x)), y: Math.max(0, Math.min(ownRows - 1, u.y)) });
      for (let y = 0; y < ownRows; y++) for (let x = 0; x < boardWidth; x++) candidates.push({ location: 'board', x, y });
    }
    for (let y = 0; y < save.benchSlots; y++) candidates.push({ location: 'bench', x: -1, y });
    const target = candidates.find(p => !occupied.has(key({ ...u, ...p })));
    if (target) { Object.assign(u, target); occupied.add(key(u)); }
    else { kept.splice(kept.indexOf(u), 1); remaining[u.unitId] += 3 ** (u.star - 1); }
  }
  save.owned = kept;
  for (const id of save.stageProgress?.unitReserve ?? []) {
    if (!(remaining[id] > 0)) throw new Error('Invalid reserved reward stock');
    remaining[id]--;
  }
  for (const slot of save.shop) {
    if (!slot.unitId) continue;
    if (!(remaining[slot.unitId] > 0)) slot.unitId = null;
    else remaining[slot.unitId]--;
  }
  save.pool = remaining;
  save.shopReserved = true;
}

export interface SaveDataV2 extends SaveData {
  stageProgress?: StageProgressState;
  balanceVersion?:string;
  enemyEquipmentVersion:string;
  equipmentRewardVersion:string;
  equipmentConfigIdentity?:string;
  equipmentProgress:EquipmentProgress;
  lastEquipmentReward?:EquipmentRewardEvent;
  formationVersion:string;
  formationOverride:FormationOverride;
  formationConfigIdentity?:string;
  enemyGenerationVersion: EnemyGenerationMode;
  powerModelVersion: string;
  powerModelCalibrationHash: string;
  difficultyConfigVersion: string;
  /** Bound on the first session construction, before any wave has been played. */
  difficultyConfigIdentity?: string;
  /** Session/RNG rules are independent of the legacy stage-index migration version below. */
  runSeed: number;
  rulesVersion: number;
  runSeedSource: 'explicit' | 'legacy-default';
  /** Successful manual shop rolls in the current wave; automatic roll is index zero. */
  shopRollIndex: number;
  nextOwnedUid: number;
  /** Progression rule version: 1 had ten rounds in every stage after the intro. */
  runRulesVersion: number;
  stageCount: number;
  /** 商店 5 格内容 */
  shop: ShopSlot[];
  /** true 表示商店商品已从 pool 预留；缺省为旧版未预留存档。 */
  shopReserved: boolean;
  /** 玩家持有棋子（备战席 + 棋盘） */
  owned: OwnedUnit[];
  equipmentReserve?: string[];
  backpackItems?: BackpackItem[];
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
    const used = new Set<number>();
    for (const u of d.owned) {
      if (!u || typeof u.unitId !== 'string') continue;
      const star = safeInt(u.star, 1, 1, 3);
      const loc = u.location === 'board' ? 'board' : 'bench';
      const x = safeInt(u.x, 0, -1, Number.MAX_SAFE_INTEGER);
      const y = safeInt(u.y, 0, 0, Number.MAX_SAFE_INTEGER);
      while (used.has(nextUid)) nextUid++;
      const uid = Number.isSafeInteger(u.uid) && u.uid > 0 && u.uid < Number.MAX_SAFE_INTEGER && !used.has(u.uid) ? u.uid : nextUid;
      used.add(uid);
      owned.push({ uid, unitId: u.unitId, star, location: loc, x, y, equipment: Array.isArray(u.equipment) ? u.equipment.filter(id => typeof id === 'string').slice(0, MAX_EQUIPMENT) : [] });
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

  const benchSlots = safeInt(d.benchSlots, DEFAULT_BENCH_SLOTS, 1, 12);
  const r = d.round;
  const round: RoundSnapshot | null = r && Number.isFinite(r.health) && Number.isInteger(r.waveIndex)
    && ['prepare', 'battle', 'settlement', 'ended'].includes(r.phase) ? {
      phase:r.phase, waveIndex:safeInt(r.waveIndex, 0, 0, 9999), health:safeInt(r.health, 20, 0, 999999),
      result:r.result === 'victory' || r.result === 'defeat' ? r.result : null,
      lastSettlement:r.lastSettlement && ['waveId', 'enemySurvivors', 'healthLost', 'healthRemaining'].every(k => Number.isSafeInteger(r.lastSettlement[k]) && r.lastSettlement[k] >= 0)
        && [-1, 0, 1].includes(r.lastSettlement.winner)
        && [null, 'victory', 'defeat'].includes(r.lastSettlement.runResult)
        && ['stage', 'round'].every(k => r.lastSettlement[k] === undefined || (Number.isSafeInteger(r.lastSettlement[k]) && r.lastSettlement[k] > 0))
        ? { ...r.lastSettlement } : null,
    } : null;

  return {
    ...v1,
    version: SAVE_VERSION,
    ...(d.stageProgress === undefined ? {} : { stageProgress: JSON.parse(JSON.stringify(d.stageProgress)) }),
    ...(typeof d.balanceVersion==='string'?{balanceVersion:d.balanceVersion}:{}),
    enemyEquipmentVersion:d.enemyEquipmentVersion??'none',
    equipmentRewardVersion:d.equipmentRewardVersion??'none',
    equipmentConfigIdentity:d.equipmentConfigIdentity,
    equipmentProgress:d.equipmentProgress===undefined?{lastClaimedWaveId:0,lastEvaluatedWaveId:0,guaranteeSatisfied:{}}:JSON.parse(JSON.stringify(d.equipmentProgress)),
    lastEquipmentReward:d.lastEquipmentReward===undefined?undefined:JSON.parse(JSON.stringify(d.lastEquipmentReward)),
    formationVersion:d.formationVersion??'l0-compat',
    formationOverride:d.formationOverride??'L0',
    formationConfigIdentity:d.formationConfigIdentity,
    enemyGenerationVersion: (d.enemyGenerationVersion ?? 'legacy') as EnemyGenerationMode,
    powerModelVersion: d.powerModelVersion ?? (d.enemyGenerationVersion === 'budget-v1' ? '' : 'none'),
    powerModelCalibrationHash: d.powerModelCalibrationHash ?? (d.enemyGenerationVersion === 'budget-v1' ? '' : 'none'),
    difficultyConfigVersion: d.difficultyConfigVersion ?? (d.enemyGenerationVersion === 'budget-v1' ? '' : 'none'),
    difficultyConfigIdentity: d.difficultyConfigIdentity,
    runSeed: isRunSeed(d.runSeed) ? d.runSeed : DEFAULT_RUN_SEED,
    rulesVersion: safeInt(d.rulesVersion, RUN_RULES_VERSION, 1, Number.MAX_SAFE_INTEGER),
    runSeedSource: !isRunSeed(d.runSeed) || d.runSeedSource === 'legacy-default' ? 'legacy-default' : 'explicit',
    shopRollIndex: safeInt(d.shopRollIndex, 0, 0, Number.MAX_SAFE_INTEGER - 1),
    nextOwnedUid: Math.max(owned.reduce((max, u) => Math.max(max, u.uid + 1), 1), safeInt(d.nextOwnedUid, 1, 1, Number.MAX_SAFE_INTEGER)),
    runRulesVersion: d.runRulesVersion === 2 ? 2 : 1,
    stageCount: normalizeStageCount(d.stageCount ?? DEFAULT_STAGE_COUNT),
    backpackItems: Array.isArray(d.backpackItems) ? d.backpackItems.filter(item => item && item.kind === 'consumable' && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.icon === 'string').map(item => ({ ...item })) : [],
    equipmentReserve: Array.isArray(d.equipmentReserve) ? d.equipmentReserve.filter(id => typeof id === 'string') : [],
    shop, owned, pool, benchSlots, shopReserved: d.shopReserved === true,
    round, shopLocked: d.shopLocked === true,
    lastReward: d.lastReward && ['floorIncome', 'winBonus', 'interest', 'streakBonus', 'total', 'goldBefore', 'goldAfter', 'winStreak', 'loseStreak']
      .every(k => Number.isFinite(d.lastReward.breakdown?.[k]) && d.lastReward.breakdown[k] >= 0 && d.lastReward.breakdown[k] <= Number.MAX_SAFE_INTEGER)
      && ['expGained', 'levelUps'].every(k => Number.isSafeInteger(d.lastReward[k]) && d.lastReward[k] >= 0)
      ? { ...d.lastReward, breakdown: { ...d.lastReward.breakdown, extraIncome: safeInt(d.lastReward.breakdown.extraIncome, 0, 0, Number.MAX_SAFE_INTEGER) } } : undefined,
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

export function freshSaveV2(stageCount = DEFAULT_STAGE_COUNT, runSeed = DEFAULT_RUN_SEED, mode: EnemyGenerationMode = 'budget-v1',equipmentEnabled=false): SaveDataV2 {
  if (!isRunSeed(runSeed)) throw new Error('runSeed must be a uint32 integer');
  if (!['legacy','budget-v1'].includes(mode)) throw new Error('Unsupported enemy generation version');
  return migrateSaveV2({ stageCount, runRulesVersion: 2, runSeed, rulesVersion: RUN_RULES_VERSION, enemyGenerationVersion:mode,
    enemyEquipmentVersion:equipmentEnabled&&mode==='budget-v1'?'equipment-policy-v1':'none',equipmentRewardVersion:equipmentEnabled?'equipment-reward-v1':'none',
    formationVersion:mode==='budget-v1'?FORMATION_VERSION:'l0-compat',formationOverride:mode==='budget-v1'?'auto':'L0',
    powerModelVersion:mode==='budget-v1'?DEFAULT_POWER_MODEL_VERSION:'none',
    powerModelCalibrationHash:mode==='budget-v1'?DEFAULT_CALIBRATION_HASH:'none',difficultyConfigVersion:mode==='budget-v1'?'budget-v1':'none' });
}
