import type { PowerReliability } from './EnemyPowerTypes';
import type { EnemyEquipmentDiagnostics } from './EquipmentPolicyTypes';

export type EnemyGenerationMode = 'legacy' | 'budget-v1';
export type WaveKind = 'intro' | 'normal' | 'elite' | 'boss';
// Pins identify the already published P1-B artifact, not invented power weights.
export const DEFAULT_POWER_MODEL_VERSION = 'enemy-power-v1';
export const DEFAULT_CALIBRATION_HASH = 'fb31829c87670bdba73af786d39ca99cda9aa875f1ffb609fd1e072e66e00b3d';
export interface EnemyDifficultyConfig {
  version: 'budget-v1';
  /** P4 static difficulty budget, separate from the measured naked B0 reference. */
  balanceBudgetScale?:number;
  balanceVersion?:string;
  stageRampExponent?:number;
  powerModelVersion: string;
  calibrationHash: string;
  growthRate: number;
  waveKindMultipliers: Record<'normal' | 'elite' | 'boss', number>;
  classification: { elite: { enabled: boolean; minRounds: number; roundFromEnd: number }; boss: { enabled: boolean; roundFromEnd: number } };
  stageRecovery: { min: number; target: number; max: number };
  costUnlock: Array<{ stage: number; maxCost: number }>;
  starPolicy: { twoStarUnlockStage: number; threeStarUnlockStage: number; maxThreeStars: Record<'normal' | 'elite' | 'boss', number>;
    twoStarTargets: Array<{ stage: number; ratio: number }> };
  maxPopulation: number;
  optimizer: { maxIterations: number; topK: number; pairTopK: number; targetDeviation: number;
    starPenalty: number; diversityPenalty: number; concentrationPenalty: number };
  attributeAdjustment: { min: number; max: number; enabled: boolean };
  saturationPolicy: 'feasible-stage-envelope';
}
export interface EnemyCandidate { unitId: string; cost: number; star: number; equipment: string[]; power: number;
  confidence: PowerReliability; diagnostics: string[] }
export interface EnemyBudgetResult {
  referenceBaseBudget?:number;balanceBudgetScale?:number;
  stageRampExponent?:number;
  globalWaveId: number; budgetWaveIndex: number; stage: number; round: number; waveKind: WaveKind;
  rawBudget: number; kindMultiplier: number; pacingMultiplier: number; requestedBudget: number;
  effectiveBudget: number; minFeasibleBudget: number; maxFeasibleBudget: number;
  saturated: boolean; saturationReason?: 'ABOVE_MAX_FEASIBLE' | 'BELOW_MIN_FEASIBLE' | 'STAGE_ENVELOPE_CONSTRAINT';
  effectiveEnvelopeAdjusted: boolean; recoveryFeasible: boolean;
}
export interface EnemyGenerationDiagnostics extends EnemyBudgetResult,Partial<EnemyEquipmentDiagnostics> {
  enemyGenerationMode: 'budget-v1'; population: number; actualBudget: number; deviationPct: number;
  feasible: boolean; solution: 'within-tolerance' | 'nearest-discrete' | 'optimizer-limit';
  reason?: string; nearestAchievableBudget?: number;
  candidateCount: number; optimizerIterations: number;
  enemyCostDistribution: Record<string, number>; enemyStarDistribution: Record<string, number>; unitDiversity: number;
  twoStarTarget: number; twoStarRatio: number; starPolicyBudgetConflict: boolean;
  lowConfidenceUnits: string[]; estimatedBudgetConfidence: PowerReliability; powerDiagnostics: string[];
  powerModelVersion: string; calibrationHash: string; difficultyConfigVersion: string;
  statMultiplier: number;
}

/** Stable ordering also gives saved configuration identity without a platform crypto dependency. */
export function stableEnemyJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableEnemyJson).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableEnemyJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

/** Inventory art and display copy do not affect equipment mechanics. */
export function combatEquipmentIdentity(items: unknown): unknown {
  if (!Array.isArray(items)) throw new Error('Invalid equipment identity');
  return items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid equipment identity');
    return Object.fromEntries(Object.entries(item).filter(([key]) =>
      !['name', 'icon', 'description', 'effectDescription'].includes(key)));
  });
}

/** Display copy and table templates do not change difficulty or formation rules. */
export function combatConfigurationIdentity(value: Record<string, unknown>): string {
  if (!value || typeof value !== 'object' || !value.skills || typeof value.skills !== 'object' || Array.isArray(value.skills)) {
    throw new Error('Invalid combat configuration identity');
  }
  const skills = Object.fromEntries(Object.entries(value.skills).map(([id, skill]) => {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) throw new Error('Invalid skill identity');
    return [id, Object.fromEntries(Object.entries(skill).filter(([key]) => key !== 'description' && key !== 'statRows'))];
  }));
  return stableEnemyJson({ ...value, skills, ...(value.equipment === undefined ? {} : { equipment: combatEquipmentIdentity(value.equipment) }) });
}

/** Legacy saves may contain presentation fields; all combat fields must still match. */
export function sameCombatConfigurationIdentity(saved: string, current: string): boolean {
  try {
    return combatConfigurationIdentity(JSON.parse(saved)) === combatConfigurationIdentity(JSON.parse(current));
  } catch {
    return false;
  }
}

export function validateEnemyDifficulty(c: EnemyDifficultyConfig): void {
  const bad = () => { throw new Error('Invalid enemy difficulty configuration'); };
  if (!c || c.version !== 'budget-v1' || !c.powerModelVersion || !c.calibrationHash || c.saturationPolicy !== 'feasible-stage-envelope') bad();
  if(c.balanceBudgetScale!==undefined&&(!Number.isFinite(c.balanceBudgetScale)||c.balanceBudgetScale<1||c.balanceBudgetScale>12))bad();
  if(c.balanceVersion!==undefined&&!/^balance-v[1-9]\d*$/.test(c.balanceVersion))bad();
  if(c.stageRampExponent!==undefined&&(!Number.isFinite(c.stageRampExponent)||c.stageRampExponent<.25||c.stageRampExponent>1))bad();
  if (!Number.isFinite(c.growthRate) || c.growthRate <= 1 || c.growthRate > 2 || c.maxPopulation !== 10) bad();
  for (const k of ['normal','elite','boss'] as const) if (!Number.isFinite(c.waveKindMultipliers?.[k]) || c.waveKindMultipliers[k] <= 0) bad();
  const r=c.stageRecovery;
  if (!r || ![r.min,r.target,r.max].every(v=>Number.isFinite(v)&&v>=.05&&v<=.08) || r.min>r.target || r.target>r.max) bad();
  const {elite,boss}=c.classification ?? {} as EnemyDifficultyConfig['classification'];
  if (!elite || !boss || typeof elite.enabled!=='boolean' || typeof boss.enabled!=='boolean' || !Number.isInteger(elite.minRounds) || elite.minRounds<3
    || elite.roundFromEnd!==2 || boss.roundFromEnd!==1) bad();
  if (!Array.isArray(c.costUnlock) || !c.costUnlock.length || c.costUnlock[0].stage!==2 || c.costUnlock[0].maxCost!==1
    || c.costUnlock.some((v,i)=>!Number.isSafeInteger(v.stage)||v.stage<2||!Number.isInteger(v.maxCost)||v.maxCost<1||v.maxCost>5
      || (i>0&&(v.stage<=c.costUnlock[i-1].stage||v.maxCost<c.costUnlock[i-1].maxCost)))) bad();
  const s=c.starPolicy;
  if (!s || !Number.isSafeInteger(s.twoStarUnlockStage) || s.twoStarUnlockStage<2 || !Number.isSafeInteger(s.threeStarUnlockStage)
    || s.threeStarUnlockStage<s.twoStarUnlockStage || s.maxThreeStars?.normal!==0 || s.maxThreeStars.boss<0 || s.maxThreeStars.boss>1
    || !Number.isInteger(s.maxThreeStars.boss) || !Number.isInteger(s.maxThreeStars.elite) || s.maxThreeStars.elite<0 || s.maxThreeStars.elite>1
    || !Array.isArray(s.twoStarTargets) || !s.twoStarTargets.length || s.twoStarTargets[0].stage!==2
    || s.twoStarTargets.some((v,i)=>!Number.isSafeInteger(v.stage)||v.stage<2||!Number.isFinite(v.ratio)||v.ratio<0||v.ratio>1
      || (v.stage<s.twoStarUnlockStage&&v.ratio!==0) || (i>0&&v.stage<=s.twoStarTargets[i-1].stage))) bad();
  const o=c.optimizer;
  if (!o || ![o.maxIterations,o.topK,o.pairTopK].every(v=>Number.isSafeInteger(v)&&v>=1) || o.maxIterations>100 || o.topK>10 || o.pairTopK>10
    || !Number.isFinite(o.targetDeviation)||o.targetDeviation<=0||o.targetDeviation>.05
    || ![o.starPenalty,o.diversityPenalty,o.concentrationPenalty].every(v=>Number.isFinite(v)&&v>=0&&v<=.05)) bad();
  const a=c.attributeAdjustment;
  if (!a || a.enabled!==false || !Number.isFinite(a.min)||!Number.isFinite(a.max)||a.min<.95||a.max>1.05||a.min>1||a.max<1) bad();
}
