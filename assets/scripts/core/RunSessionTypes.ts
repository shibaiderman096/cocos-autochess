import type { OwnedUnit, UnitLocation } from './OwnedUnits';
import type { RoundPhase, RunResult, RoundSettlement, WaveEnemy } from './RoundFlow';
import type { SaveDataV2 } from './ShopSave';
import type { ShopSlot } from './ShopSystem';
import type { EnemyDifficultyConfig, EnemyGenerationMode, EnemyGenerationDiagnostics, WaveKind } from './EnemyGenerationTypes';
import type { EnemyPowerData } from './EnemyPowerTypes';
import type { EnemyFormationConfig,EnemyRoleConfig,FormationOverride,EnemyFormationResult,FormationLevel } from './EnemyFormationTypes';
import type { EquipmentPolicyConfig,EquipmentRewardEvent,PendingEquipmentReward } from './EquipmentPolicyTypes';
import type { StageChoice, StagePending, StageRewardGrant } from './StageProgression';

export interface RunSessionOptions {
  /** Interactive new runs show the opening choice; offline fixtures opt in explicitly. */
  openingEncounter?: boolean;
  equipmentPolicy?:EquipmentPolicyConfig;
  runSeed?: number;
  stageCount?: number;
  save?: unknown;
  enemyGenerationMode?: EnemyGenerationMode;
  enemyDifficulty?: EnemyDifficultyConfig;
  enemyPower?: EnemyPowerData;
  formation?:FormationOverride;
  formationConfig?:EnemyFormationConfig;
  enemyRoles?:EnemyRoleConfig;
}

export interface RunSessionState {
  runSeed: number;
  rulesVersion: number;
  stage: number;
  round: number;
  waveId: number;
  playerHp: number;
  gold: number;
  level: number;
  xp: number;
  phase: RoundPhase;
  result: RunResult;
}

export type RunAction =
  | { type: 'openExplorerChest' }
  | { type: 'chooseEquipmentTrait'; index: number }
  | { type: 'chooseOpeningEncounter'; id: import('./OpeningEncounter').OpeningEncounterId }
  | StageChoice
  | { type: 'buy'; index: number }
  | { type: 'refresh' }
  | { type: 'lock' }
  | { type: 'buyExp' }
  | { type: 'move'; uid: number; to: { location: UnitLocation; x: number; y: number } }
  | { type: 'sell'; uid: number }
  | { type: 'equip'; uid: number; reserveIndex: number }
  | { type: 'unequip'; uid: number; slot: number }
  | { type: 'recycleEquipment'; reserveIndex: number; equipmentId: string }
  | { type: 'claimEquipmentReward'; index:number };

export interface ActionResult {
  stageReward?: StageRewardGrant;
  ok: boolean;
  error?: string;
  uid?: number;
  mergedUid?: number;
  copiedUnitId?: string;
  gold?: number;
}
export interface ActionAttempt { action: RunAction; result: ActionResult }

/** Deliberately excludes enemies, future waves, RNG state, debug grants and mutable core objects. */
export interface PlayerObservation {
  explorerPoints?: number;
  explorerChestValue?: number;
  pendingTraitChoice?: import('./TraitEmblem').PendingTraitChoice;
  pendingOpeningEncounter?: boolean;
  freeRefreshes?: number;
  state: RunSessionState;
  unitCap: number;
  boardWidth: number;
  ownRows: number;
  benchSlots: number;
  shop: Array<ShopSlot & { cost: number; price: number }>;
  shopLocked: boolean;
  units: Array<OwnedUnit & { cost: number }>;
  equipmentReserve: string[];
  pendingEquipmentReward?:PendingEquipmentReward;
  pendingStageReward?: StagePending;
  unitRewardReserve?: string[];
  deferredUnitValue?: number;
}
export interface RunPlayerPort {
  observe(): PlayerObservation;
  act(action: RunAction): ActionResult;
}
export type EndReason = 'PLAYER_DEAD' | 'RUN_COMPLETED' | 'MAX_WAVE_REACHED' | 'SIMULATION_ERROR';
export type SessionReward = NonNullable<SaveDataV2['lastReward']>;
export interface SessionSettlement { round: RoundSettlement; reward: SessionReward }

export interface RunWaveReport extends Partial<Omit<EnemyGenerationDiagnostics,'enemyGenerationMode'>> {
  goldBudget?: import('./EnemyGoldArmy').EnemyGoldDiagnostics;
  enemyUpgrade?: import('./EquipmentPolicyTypes').EnemyUpgradeDiagnostics;
  unitDrop?: NonNullable<import('./StageProgression').StageProgressState['lastUnitDrop']>;
  stageReward?: import('./StageProgression').StagePending;
  botMetrics?:{refreshSpending:number;xpSpending:number;unitSpending:number;saleIncome:number;formationChanges:number;
    mainCarryUid:number|null;mainCarryUnitId:string|null;mainCarryStar:number|null;mainTankUid:number|null;mainTankUnitId:string|null;mainTankStar:number|null;
    carryItems:number;tankItems:number;enemySurvivors:number;failedActions:number;rewardsClaimed:number};
  equipmentReward?:EquipmentRewardEvent;
  playerEquipmentInventory?:string[];playerEquippedItems?:string[];playerEquipmentCount?:number;
  rewardTriggered?:boolean;rewardId?:string;rewardCandidates?:string[];rewardChoice?:string;
  guaranteeState?:Record<string,boolean>;
  formationVersion?:string;formationLevel?:FormationLevel;formationStrength?:number;
  roleCounts?:Record<string,number>;templateId?:string|null;templateUsed?:boolean;formationScore?:number;
  spacingViolations?:number;fallbackSteps?:string[];playerSnapshotHash?:string|null;
  formationDiagnostics?:EnemyFormationResult['diagnostics'];
  enemyGenerationMode?: EnemyGenerationMode;
  waveKind?: WaveKind;
  encounterKind?: import('./StageEncounters').StageEncounterKind;
  /** Base army query and optimizer diagnostics; bonus gold and HP are recorded separately in enemyUpgrade. */
  enemyBudget?: EnemyGenerationDiagnostics | null;
  waveId: number;
  stage: number;
  round: number;
  hpBefore: number;
  hpAfter: number;
  /** Before bot actions, immediately before battle, and after settlement are separate snapshots. */
  goldBefore: number;
  goldAtBattle: number;
  goldAfter: number;
  levelAtBattle: number;
  xpAtBattle: number;
  level: number;
  xp: number;
  shop: ShopSlot[];
  shopAtBattle: ShopSlot[];
  playerUnits: OwnedUnit[];
  benchUnits: OwnedUnit[];
  enemies: WaveEnemy[];
  actions: ActionAttempt[];
  battle: { seed: number; result: 0 | 1 | -1; ticks: number; duration: number; damageTaken: number };
  reward: SessionReward;
}

export interface RunSimulationReport {
  stageRewardVersion?: string;
  balanceVersion?:string;
  enemyEquipmentVersion?:string;equipmentRewardVersion?:string;
  formationVersion?:string;formationOverride?:FormationOverride;
  enemyGenerationMode?: EnemyGenerationMode;
  enemyGenerationVersion?: string;
  powerModelVersion?: string;
  powerModelCalibrationHash?: string;
  difficultyConfigVersion?: string;
  schemaVersion: number;
  runSeed: number;
  rulesVersion: number;
  bot: 'MinimalBaselineBot'|'WeakBot'|'MediumBot'|'StrongBot';
  botVersion?:string;botConfigHash?:string;
  /** The logical campaign horizon is distinct from a sampling cutoff. */
  stageCount: number;
  maxStage: number;
  maxWaves: number | null;
  configHash: string;
  result: EndReason;
  gameResult: RunResult;
  endState: RunSessionState | null;
  waves: RunWaveReport[];
  error?: string;
}
