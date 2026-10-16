import type { WaveKind } from './EnemyGenerationTypes';

export type EquipmentTier = 'basic' | 'advanced' | 'special';
export interface EquipmentQuota { stage:number; maxEquippedUnits:number; maxItemsPerUnit:number; targetItems:number }
export interface EquipmentPolicyConfig {
  enemyVersion:'equipment-policy-v1'; rewardVersion:'equipment-reward-v1';
  tiers:Record<string,EquipmentTier>;
  enemy:{ calibratedItems:string[]; tierUnlock:Record<EquipmentTier,number>;
    maxEquipmentCandidatesPerUnit:number; topKSingle:number; topKCombination:number;
    quotas:Record<'normal'|'elite'|'boss',EquipmentQuota[]>;
    rolePreferences:Record<string,string[]>; targetPenalty:number; corePenalty:number };
  reward:{ tierUnlock:Record<EquipmentTier,number>; eliteChance:number; bossChance:number; choices:number;
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
