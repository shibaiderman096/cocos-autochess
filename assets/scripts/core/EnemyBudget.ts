import type { EnemyBudgetResult, EnemyDifficultyConfig, WaveKind } from './EnemyGenerationTypes';

export interface WaveBudgetBounds {
  globalWaveId: number; budgetWaveIndex: number; stage: number; round: number; rounds: number; population: number;
  min: number; max: number; kind: Exclude<WaveKind, 'intro'>;
  countsForProgress?:boolean;progressRound?:number;progressRounds?:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function classifyWave(stage:number, round:number, rounds:number, c:EnemyDifficultyConfig): WaveKind {
  if (![stage,round,rounds].every(n=>Number.isSafeInteger(n)&&n>0)||round>rounds) throw new Error('Invalid wave identity');
  if(stage===1)return 'intro';
  if(c.classification.boss.enabled&&round===rounds-c.classification.boss.roundFromEnd+1)return 'boss';
  if(c.classification.elite.enabled&&rounds>=c.classification.elite.minRounds&&round===rounds-c.classification.elite.roundFromEnd+1)return 'elite';
  return 'normal';
}
export function rawEnemyBudget(b0:number,w:number,growth:number):number {
  if(!Number.isFinite(b0)||b0<=0||!Number.isSafeInteger(w)||w<1||!Number.isFinite(growth)||growth<=1)throw new Error('Invalid raw enemy budget');
  const n=b0*Math.pow(growth,w-1);
  if(!Number.isFinite(n))throw new Error('Raw enemy budget overflow; index exceeds numeric range');
  return n;
}

/** Requested anchors follow the raw curve. Feasible anchors solve population floors and recovery jointly.
 * No previous Boss multiplier is compounded into a later raw anchor. No unit selection occurs here. */
export class EnemyBudget {
  private anchors=new Map<number,number>();
  private recoverable=new Map<number,boolean>();
  constructor(readonly baseBudget:number, readonly config:EnemyDifficultyConfig, bounds:WaveBudgetBounds[]) {
    let previousFirst=0,previousLast:WaveBudgetBounds|undefined;
    const stages=Array.from(new Set(bounds.map(b=>b.stage))).sort((a,b)=>a-b);
    for(const stage of stages){
      const rows=bounds.filter(b=>b.stage===stage).sort((a,b)=>a.round-b.round),first=rows[0],last=rows[rows.length-1];
      for(const b of rows)if(!Number.isFinite(b.min)||!Number.isFinite(b.max)||b.min<=0||b.max<b.min)throw new Error('Invalid feasible enemy interval');
      const recovery=1-config.stageRecovery.target;
      const lo=Math.max(first.min,previousLast?previousLast.min*recovery:0);
      const hi=Math.min(first.max,previousLast?previousLast.max*recovery:Infinity);
      this.recoverable.set(stage,lo<=hi);
      const reference=baseBudget*(config.balanceBudgetScale??1);
      const anchor=lo<=hi?clamp(Math.max(rawEnemyBudget(reference,first.budgetWaveIndex,config.growthRate),previousFirst),lo,hi)
        :clamp(rawEnemyBudget(reference,first.budgetWaveIndex,config.growthRate),first.min,first.max);
      this.anchors.set(stage,anchor);previousFirst=anchor;previousLast=last;
    }
  }
  calculate(b:WaveBudgetBounds):EnemyBudgetResult {
    const raw=rawEnemyBudget(this.baseBudget*(this.config.balanceBudgetScale??1),b.budgetWaveIndex,this.config.growthRate);
    const round=b.progressRound??b.round,rounds=b.progressRounds??b.rounds;
    const fraction=rounds===1?1:(round-1)/(rounds-1);
    // End factor g/(1-recovery) makes next raw stage anchor exactly (1-recovery) of the Boss.
    const factor=Math.pow(this.config.growthRate/(1-this.config.stageRecovery.target),fraction);
    const kindMultiplier=this.config.waveKindMultipliers[b.kind],pacingMultiplier=factor/kindMultiplier;
    const requested=raw*factor;
    if(!Number.isFinite(requested))throw new Error('Requested enemy budget overflow');
    const first=this.anchors.get(b.stage),next=this.anchors.get(b.stage+1);
    if(first===undefined||next===undefined)throw new Error('Missing stage envelope lookahead');
    const end=next/(1-this.config.stageRecovery.target);
    const rampFraction=Math.pow(fraction,this.config.stageRampExponent??1);
    const envelope=first*Math.pow(end/first,rampFraction),effective=clamp(envelope,b.min,b.max);
    const adjusted=Math.abs(effective-requested)>Math.max(1,requested)*1e-12;
    const reason=requested>b.max?'ABOVE_MAX_FEASIBLE':requested<b.min?'BELOW_MIN_FEASIBLE':adjusted?'STAGE_ENVELOPE_CONSTRAINT':undefined;
    return {...(this.config.balanceBudgetScale===undefined?{}:{referenceBaseBudget:this.baseBudget,balanceBudgetScale:this.config.balanceBudgetScale}),
      ...(this.config.stageRampExponent===undefined?{}:{stageRampExponent:this.config.stageRampExponent}),globalWaveId:b.globalWaveId,budgetWaveIndex:b.budgetWaveIndex,stage:b.stage,round:b.round,waveKind:b.kind,
      rawBudget:raw,kindMultiplier,pacingMultiplier,requestedBudget:requested,effectiveBudget:effective,
      minFeasibleBudget:b.min,maxFeasibleBudget:b.max,saturated:reason!==undefined,saturationReason:reason,
      effectiveEnvelopeAdjusted:adjusted,recoveryFeasible:this.recoverable.get(b.stage+1)!==false};
  }
}
