import type {EnemyDifficultyConfig} from '../../assets/scripts/core/EnemyGenerationTypes';
import {validateEnemyDifficulty} from '../../assets/scripts/core/EnemyGenerationTypes';
export interface BalanceParameters {budgetScale:number;growthRate:number;earlyChallengeStage:number;stageRampExponent?:number}
export const PARAMETER_BOUNDS={budgetScale:{min:1,max:12,step:.25},growthRate:{min:1.02,max:1.06,step:.0025},earlyChallengeStage:{min:3,max:6,step:1},stageRampExponent:{min:.25,max:1,step:.05}};
export function applyBalanceParameters(base:EnemyDifficultyConfig,p:BalanceParameters):EnemyDifficultyConfig {
  for(const key of Object.keys(PARAMETER_BOUNDS) as Array<keyof BalanceParameters>){const bound=PARAMETER_BOUNDS[key],value=p[key];
    if(key==='stageRampExponent'&&value===undefined)continue;
    if(!Number.isFinite(value)||value<bound.min-1e-9||value>bound.max+1e-9||Math.abs((value-bound.min)/bound.step-Math.round((value-bound.min)/bound.step))>1e-7)throw Error('Parameter outside declared bounds: '+key);}
  const c:EnemyDifficultyConfig=JSON.parse(JSON.stringify(base));c.balanceVersion='balance-v1';c.balanceBudgetScale=p.budgetScale;c.growthRate=p.growthRate;
  if(p.stageRampExponent!==undefined)c.stageRampExponent=p.stageRampExponent;
  if(p.earlyChallengeStage<c.starPolicy.twoStarUnlockStage){
    c.starPolicy.twoStarUnlockStage=p.earlyChallengeStage;
    c.starPolicy.twoStarTargets.push({stage:p.earlyChallengeStage,ratio:1/3});c.starPolicy.twoStarTargets.sort((a,b)=>a.stage-b.stage);
    c.costUnlock.push({stage:p.earlyChallengeStage,maxCost:3});c.costUnlock.sort((a,b)=>a.stage-b.stage);
    c.costUnlock=[...new Map(c.costUnlock.map(v=>[v.stage,{stage:v.stage,maxCost:Math.max(...c.costUnlock.filter(r=>r.stage===v.stage).map(r=>r.maxCost))}])).values()];
    let max=1;for(const row of c.costUnlock){max=Math.max(max,row.maxCost);row.maxCost=max;}
  }
  validateEnemyDifficulty(c);return c;
}
export function balanceObjective(summary:any,ordering?:{weak:any;medium:any;strong:any}):number {
  const stages=summary.stages,s3=stages[2].cumulativeCompletion.rate??0,s6=stages[5].cumulativeCompletion.rate??0;
  let cliff=0;for(let n=1;n<Math.min(stages.length,6);n++){const previous=stages[n-1].conditionalCompletion.rate,current=stages[n].conditionalCompletion.rate;
    if(previous!==null&&current!==null)cliff+=Math.max(0,previous-current-.15)**2;}
  const damage=summary.waves.filter((w:any)=>w.waveKind==='normal'&&w.stage<=6).reduce((n:number,w:any)=>n+Math.max(0,w.averageHpLoss-6)**2,0)/Math.max(1,summary.waves.length);
  let orderPenalty=0;
  if(ordering)for(const stage of [3,6]){const rates=[ordering.weak,ordering.medium,ordering.strong].map(s=>s.stages[stage-1].cumulativeCompletion.rate??0);
    orderPenalty+=Math.max(0,rates[0]-rates[1])**2+Math.max(0,rates[1]-rates[2])**2;}
  return (s3-.85)**2+(s6-.5)**2+.1*cliff+.01*damage+orderPenalty;
}
