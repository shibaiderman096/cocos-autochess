/** Current run persistence. Starting a new save is required after rule changes. */
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
import { DEFAULT_ECONOMY_CONFIG } from './EconomySystem';
import { MAX_LEVEL } from './LevelSystem';
import { freshMerchantServices } from './MerchantServices';
import { freshExplorerProgress } from './ExplorerProgress';
import { freshStageProgress } from './StageProgression';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'autochess_save_v3';

export interface RunSaveData {
  version: number;
  floor: number;
  gold: number;
  level: number;
  exp: number;
  winStreak: number;
  loseStreak: number;
  merchantServices: import('./MerchantServices').MerchantServicesState;
  /** Stage-entry subsidies already handled; retained across reloads and debug revisits. */
  earlyGoldStages: number[];
  explorerProgress: import('./ExplorerProgress').ExplorerProgress;
  unlockedUnits?: string[];
  traitChoiceRoll?: number;
  pendingTraitChoice?: import('./TraitEmblem').PendingTraitChoice;
  openingEncounter?: import('./OpeningEncounter').OpeningEncounterState;
  stageProgress: StageProgressState;
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
  runSeed: number;
  rulesVersion: number;
  /** Successful manual shop rolls in the current wave; automatic roll is index zero. */
  shopRollIndex: number;
  nextOwnedUid: number;
  stageCount: number;
  /** 商店 5 格内容 */
  shop: ShopSlot[];
  /** 商店商品是否已经从卡池预留。 */
  shopReserved: boolean;
  /** 玩家持有棋子（备战席 + 棋盘） */
  owned: OwnedUnit[];
  equipmentReserve: string[];
  backpackItems: BackpackItem[];
  /** 卡池剩余 unitId → 数量 */
  pool: Record<string, number>;
  /** 备战席格子数 */
  benchSlots: number;
  round: RoundSnapshot | null;
  shopLocked: boolean;
  lastReward?: { breakdown: SettlementBreakdown; expGained: number; levelUps: number };
}

/** Current saves are validated and copied, never repaired or upgraded. */
export function readRunSave(raw: unknown): RunSaveData {
  const d = raw as RunSaveData;
  const integer = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): n is number => Number.isSafeInteger(n) && Number(n) >= min && Number(n) <= max;
  const invalid = () => { throw new Error('Invalid current run save'); };
  if (!d || d.version !== SAVE_VERSION || d.rulesVersion !== RUN_RULES_VERSION
    || !isRunSeed(d.runSeed) || d.enemyGenerationVersion !== 'budget-v1'
    || !integer(d.stageCount, 3) || !integer(d.floor, 1) || !integer(d.gold)
    || !integer(d.level, 1, MAX_LEVEL) || !integer(d.exp) || !integer(d.winStreak) || !integer(d.loseStreak)
    || !integer(d.benchSlots, 1, 12) || !integer(d.shopRollIndex) || !integer(d.nextOwnedUid, 1)
    || typeof d.shopReserved !== 'boolean' || typeof d.shopLocked !== 'boolean'
    || !Array.isArray(d.shop) || d.shop.length !== 5 || d.shop.some(slot => !slot || (slot.unitId !== null && typeof slot.unitId !== 'string'))
    || !Array.isArray(d.owned) || !d.pool || typeof d.pool !== 'object' || Array.isArray(d.pool)
    || Object.values(d.pool).some(n => !integer(n)) || !Array.isArray(d.equipmentReserve) || d.equipmentReserve.some(id => typeof id !== 'string')
    || !Array.isArray(d.backpackItems) || d.backpackItems.some(item => !item || item.kind !== 'consumable' || !['id','name','icon'].every(k => typeof item[k] === 'string'))
    || !Array.isArray(d.earlyGoldStages) || d.earlyGoldStages.some(stage => stage !== 2 && stage !== 3)
    || new Set(d.earlyGoldStages).size !== d.earlyGoldStages.length || !d.merchantServices || !d.explorerProgress || !d.stageProgress || !d.equipmentProgress) invalid();
  const ids = new Set<number>();
  for (const u of d.owned) {
    if (!u || !integer(u.uid, 1, d.nextOwnedUid - 1) || ids.has(u.uid) || typeof u.unitId !== 'string'
      || !integer(u.star, 1, 3) || !['board','bench'].includes(u.location) || !integer(u.x, -1) || !integer(u.y)
      || !Array.isArray(u.equipment) || u.equipment.length > MAX_EQUIPMENT || u.equipment.some(id => typeof id !== 'string')) invalid();
    for (const [source,total] of [['itemHealth','permanentMaxHp'],['itemPhysicalPower','permanentPhysicalPower'],['itemSpellPower','permanentSpellPower']])
      if ((u[source] ?? 0) > (u[total] ?? 0)) invalid();
    ids.add(u.uid);
    for (const key of ['soulLampHealth','permanentPhysicalPower','permanentSpellPower','permanentMaxHp','itemHealth','itemPhysicalPower','itemSpellPower'])
      if (u[key] !== undefined && !integer(u[key])) invalid();
  }
  const r = d.round;
  if (r !== null && (!r || !['prepare','battle','settlement','ended'].includes(r.phase) || !integer(r.waveIndex)
    || !integer(r.health) || ![null,'victory','defeat'].includes(r.result))) invalid();
  if (d.lastReward && (!['winBonus','interest','streakBonus','extraIncome','total','goldBefore','goldAfter','winStreak','loseStreak']
    .every(key => integer(d.lastReward!.breakdown?.[key])) || !integer(d.lastReward.expGained) || !integer(d.lastReward.levelUps))) invalid();
  return JSON.parse(JSON.stringify(d));
}

/** Configuration-aware repair: owned cards take priority over shop reservations. */
export function restoreRunInventory(save: RunSaveData, configs: UnitConfigData[], boardWidth: number, ownRows: number): void {
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

export function loadRunSave(): RunSaveData | null {
  try {
    const text = typeof localStorage !== 'undefined' ? localStorage.getItem(SAVE_KEY) : null;
    return text ? readRunSave(JSON.parse(text)) : null;
  } catch { return null; }
}
export function writeRunSave(data: RunSaveData): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
}
export function freshRunSave(stageCount = DEFAULT_STAGE_COUNT, runSeed = DEFAULT_RUN_SEED, mode: EnemyGenerationMode = 'budget-v1', equipmentEnabled = false): RunSaveData {
  if (!isRunSeed(runSeed)) throw new Error('runSeed must be a uint32 integer');
  if (mode !== 'budget-v1') throw new Error('Unsupported enemy generation version');
  return {
    version: SAVE_VERSION, floor: 1, gold: DEFAULT_ECONOMY_CONFIG.initialGold, level: 1, exp: 0, winStreak: 0, loseStreak: 0,
    stageCount: normalizeStageCount(stageCount), runSeed, rulesVersion: RUN_RULES_VERSION,
    enemyGenerationVersion: mode, enemyEquipmentVersion: equipmentEnabled ? 'equipment-policy-v1' : 'none',
    equipmentRewardVersion: equipmentEnabled ? 'equipment-reward-v1' : 'none',
    powerModelVersion: DEFAULT_POWER_MODEL_VERSION, powerModelCalibrationHash: DEFAULT_CALIBRATION_HASH, difficultyConfigVersion: 'budget-v1',
    formationVersion: FORMATION_VERSION, formationOverride: 'auto',
    traitChoiceRoll: 0, unlockedUnits: [], merchantServices: freshMerchantServices(), explorerProgress: freshExplorerProgress(), stageProgress: freshStageProgress(), earlyGoldStages: [],
    equipmentProgress: { lastClaimedWaveId: 0, lastEvaluatedWaveId: 0, guaranteeSatisfied: {} },
    shopRollIndex: 0, nextOwnedUid: 1, shop: Array.from({ length: 5 }, () => ({ unitId: null })), shopReserved: false,
    owned: [], pool: {}, equipmentReserve: [], backpackItems: [], benchSlots: DEFAULT_BENCH_SLOTS, round: null, shopLocked: false,
  };
}
