import type { WaveKind } from './EnemyGenerationTypes';
import type { FormationRole } from './EnemyFormationTypes';

/** Internal AI metadata, never rendered in item descriptions. */
export interface EnemyEquipmentFit {
  enabled: boolean; roles: FormationRole[]; damageTypes?: Array<'physical' | 'magic'>; requiresMana?: boolean;
  goldCost?: number;
}
export interface EnemyEquipmentEconomy {
  startStage: number; itemCost: number;
  normal?: { initialGold: number; goldPerStage: number };
  elite: { initialGold: number; goldPerStage: number; maxGold?: number; healthMultiplier: number };
  boss: { initialGold: number; goldPerStage: number; maxGold?: number; healthMultiplier: number };
}
export interface EnemyUpgradeDiagnostics {
  baseGoldBudget?: number; unitGoldCarryover?: number; reinforcementGold?: number; consumableIds?: string[]; qualityRates?: number[];
  goldBudget: number; goldSpent: number; goldRemaining: number; itemCount: number; healthMultiplier: number;
  /** Budget diagnostics describe the base army; this bonus has its own gold account. */
  equipmentIds: string[];
}

export type EquipmentTier = 'basic' | 'advanced' | 'special';
export interface EquipmentQuota { stage:number; maxEquippedUnits:number; maxItemsPerUnit:number; targetItems:number }
export interface EquipmentPolicyConfig {
  enemyVersion:'equipment-policy-v1'; rewardVersion:'equipment-reward-v1';
  tiers:Record<string,EquipmentTier>;
  enemy:{ calibratedItems:string[]; tierUnlock:Record<EquipmentTier,number>;
    itemTags?: Record<string, EnemyEquipmentFit>; equipmentEconomy?: EnemyEquipmentEconomy;
    maxEquipmentCandidatesPerUnit:number; topKSingle:number; topKCombination:number;
    quotas:Record<'normal'|'elite'|'boss',EquipmentQuota[]>;
    rolePreferences:Record<string,string[]>; targetPenalty:number; corePenalty:number };
  reward:{ tierUnlock:Record<EquipmentTier,number>; eliteChance:number; bossChance:number; choices:number;
    excludedIds?: string[];
    emptyBasicFallbackIds:string[]; insufficientPool:'fewer-choices'; guarantee:'last-eligible-victory' };
}
export interface PendingEquipmentReward {
  rewardId:string; waveId:number; stage:number; round:number;
  source:'elite'|'boss'|'guarantee'; candidates:string[]; claimed:false;
  diagnostics:string[];
}
export interface EquipmentProgress {
  pending?:PendingEquipmentReward;
  /** Monotonic wave markers bound history without retaining every candidate list. */
  lastClaimedWaveId:number; lastEvaluatedWaveId:number;
  guaranteeSatisfied:Record<string,boolean>;
}
export interface EquipmentRewardEvent {
  rewardTriggered:boolean; rewardId?:string; rewardCandidates:string[]; rewardChoice?:string;
  source?:PendingEquipmentReward['source']; diagnostics:string[];
}
export interface EnemyEquipmentDiagnostics {
  enemyEquipmentPolicy:string; enemyEquipmentTarget:number; enemyEquipmentActual:number;
  enemyEquipmentCount:number; equippedEnemyCount:number; equipmentIds:string[];
  enemyEquipmentItems:string[];enemyEquipmentPower:number;
  equipmentPowerContribution:number; equipmentPolicyBudgetConflict:boolean;
  equipmentDiagnostics:string[]; nakedCandidateCount:number;
}
export type RewardWave = {id:number;stage?:number;round?:number;roundsInStage?:number;waveKind?:WaveKind};
