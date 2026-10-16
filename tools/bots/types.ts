import type {ActionAttempt} from '../../assets/scripts/core/RunSessionTypes';
import type {BotPlayerPort} from '../../assets/scripts/core/BotObservation';
export type BotId='minimal'|'weak'|'medium'|'strong';
export interface BotConfig {
  economyV2?: {excessGoldThreshold:number;minGold:number;bossReserve:number;eliteReserve:number;
    saveRolls:number;developRolls:number;stabilizeRolls:number;allInRolls:number;populationValuePerGold:number;
    benchValueRatio:number;weakSlotRatio:number;maxThreeStarCores:number};
  version:string;qualityWeight:number;mergeWeight:number;coreCopies:number;
  reserveStages:number[];dangerHp:number;criticalHp:number;targetLevels:number[];
  maxXpBuys:number;maxRolls:number;rollEvery:number;mergeBuyThreshold:number;benchBuffer:number;
  formation:'rows'|'spread'|'counter';equipment:'first-fit'|'roles'|'synergy';reward:'first-useful'|'roles'|'synergy';
}
export interface RunBot {
  diagnostics?: {mode:string;policy:unknown;unusedGoldReason:string[]};
  readonly id:Exclude<BotId,'minimal'>;readonly version:string;readonly configHash:string;
  prepare(player:BotPlayerPort):ActionAttempt[];
  claimRewards(player:BotPlayerPort):ActionAttempt[];
}
