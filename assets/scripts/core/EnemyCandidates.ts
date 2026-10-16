import type { UnitConfigData } from './ConfigManager';
import { EnemyPowerModel } from './EnemyPowerModel';
import type { EnemyCandidate, EnemyDifficultyConfig, WaveKind } from './EnemyGenerationTypes';

export const compareCandidate=(a:EnemyCandidate,b:EnemyCandidate):number=>a.power-b.power||a.cost-b.cost||a.star-b.star||(a.unitId<b.unitId?-1:a.unitId>b.unitId?1:0);
export interface CandidatePool { candidates:EnemyCandidate[]; maxThreeStars:number; maxCost:number; twoStarTarget:number }
export function buildEnemyCandidates(stage:number,kind:Exclude<WaveKind,'intro'>,roster:UnitConfigData[],model:EnemyPowerModel,c:EnemyDifficultyConfig):CandidatePool {
  if(!Number.isSafeInteger(stage)||stage<2||!['normal','elite','boss'].includes(kind)||!roster?.length)throw new Error('Invalid enemy candidate context');
  if(new Set(roster.map(u=>u.id)).size!==roster.length||roster.some(u=>!u.id||!Number.isInteger(u.cost)||u.cost!<1||u.cost!>5))throw new Error('Invalid enemy roster');
  const unlocked=c.costUnlock.filter(v=>v.stage<=stage).slice(-1)[0];
  if(!unlocked)throw new Error('Empty enemy cost unlock policy');
  const maxThreeStars=stage>=c.starPolicy.threeStarUnlockStage?c.starPolicy.maxThreeStars[kind]:0;
  const stars=stage>=c.starPolicy.twoStarUnlockStage?[1,2]:[1];if(maxThreeStars)stars.push(3);
  const candidates:EnemyCandidate[]=[];
  for(const u of roster.filter(u=>u.cost!<=unlocked.maxCost))for(const star of stars){
    const estimate=model.estimateUnitPower({unitId:u.id,cost:u.cost,star,equipment:[]});
    if(!Number.isFinite(estimate.power)||estimate.power<=0)throw new Error(`Invalid candidate power: ${u.id}/${star}`);
    candidates.push({unitId:u.id,cost:u.cost!,star,equipment:[],power:estimate.power,confidence:estimate.confidence,diagnostics:estimate.diagnostics});
  }
  candidates.sort(compareCandidate);
  if(!candidates.length||!candidates.some(u=>u.star<3))throw new Error('No legal enemy candidates');
  return {candidates,maxThreeStars,maxCost:unlocked.maxCost,twoStarTarget:c.starPolicy.twoStarTargets.filter(v=>v.stage<=stage).slice(-1)[0].ratio};
}
/** Repeats are legal; the only hard coupling is the explicit three-star quota. */
export function feasibleEnemyBounds(pool:CandidatePool,population:number):{min:number;max:number} {
  if(!Number.isInteger(population)||population<1||population>10)throw new Error('Invalid enemy population');
  const base=pool.candidates.filter(u=>u.star<3).map(u=>u.power),three=pool.candidates.filter(u=>u.star===3).map(u=>u.power);
  if(!base.length||base.some(p=>!Number.isFinite(p)||p<=0))throw new Error('Invalid candidate bounds');
  const min=Math.min(...base),max=Math.max(...base),quota=Math.min(population,pool.maxThreeStars);
  return {min:min*population+(three.length?Math.min(0,Math.min(...three)-min)*quota:0),
    max:max*population+(three.length?Math.max(0,Math.max(...three)-max)*quota:0)};
}
