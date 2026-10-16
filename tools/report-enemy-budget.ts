import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { buildRunWaves } from '../assets/scripts/core/RunSetup';
import type { WaveConfig } from '../assets/scripts/core/RoundFlow';
import { EnemyPowerModel } from '../assets/scripts/core/EnemyPowerModel';
import { stableEnemyJson } from '../assets/scripts/core/EnemyGenerationTypes';
import { isRunSeed } from '../assets/scripts/core/RunRandomContext';
import { loadRunInputs, loadEnemyGenerationInputs } from './run-simulation';

const root=resolve(__dirname,'..'),sha=(data:string|Buffer)=>createHash('sha256').update(data).digest('hex');
let seed=12345,output='docs/p1-enemy-difficulty/budget-generator/final-seed12345';
const seen=new Set<string>();
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i],value=process.argv[++i];
  if(!['--seed','--output'].includes(key)||seen.has(key)||!value)throw new Error('Expected --seed uint32 or --output directory');seen.add(key);
  if(key==='--seed'){if(!/^\d+$/.test(value)||!isRunSeed(Number(value)))throw new Error('Invalid seed');seed=Number(value);}else output=value;
}
const destination=resolve(root,output);let ancestor=destination;while(!existsSync(ancestor))ancestor=dirname(ancestor);
const actual=resolve(realpathSync(ancestor),relative(ancestor,destination));
for(const protectedDir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty/run-session','docs/p1-enemy-difficulty/power-calibration']){
  const p=resolve(root,protectedDir).toLowerCase();if(actual.toLowerCase()===p||actual.toLowerCase().startsWith(p+sep))throw new Error('Previous evidence is protected');
}
if(existsSync(destination))throw new Error('Choose a new output directory; existing reports are not overwritten');
const inputs=loadRunInputs(root),bundle=loadEnemyGenerationInputs(root),model=new EnemyPowerModel(bundle.enemyPower);
const starts=new Map<number,number>(),timings:Array<{globalWaveId:number;generationMilliseconds:number}>=[];
const started=performance.now();
const waves=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:bundle.enemyDifficulty,power:bundle.enemyPower,
  onWave:(id,phase)=>{if(phase==='start')starts.set(id,performance.now());else timings.push({globalWaveId:id,generationMilliseconds:performance.now()-starts.get(id)!});}});
const elapsed=performance.now()-started;
const legacy=buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'legacy'});
const powerOf=(w:WaveConfig)=>model.estimateTeamPower(w.enemies.map(e=>({unitId:e.unitId,star:e.star,equipment:e.equipment??[]}))).power;
const normal=waves.filter(w=>w.budget),stageRows=[];
for(let stage=2;stage<=99;stage++){
  const rows=normal.filter(w=>w.stage===stage),costs:Record<string,number>={},stars:Record<string,number>={};
  const n=rows.reduce((n,w)=>n+w.enemies.length,0);
  for(const w of rows)for(const e of w.enemies){const cost=inputs.units.find(u=>u.id===e.unitId)!.cost!;costs[cost]=(costs[cost]??0)+1;stars[e.star]=(stars[e.star]??0)+1;}
  const mean=Object.entries(costs).reduce((n,[cost,count])=>n+Number(cost)*count,0)/n;
  const variance=Object.entries(costs).reduce((n,[cost,count])=>n+(Number(cost)-mean)**2*count,0)/n;
  const minOne=Math.min(...Object.values(bundle.enemyPower.units).filter(u=>u.cost<=bundle.enemyDifficulty.costUnlock.filter(v=>v.stage<=stage).slice(-1)[0].maxCost).map(u=>u.points[1][''].power));
  const minTwo=stage>=bundle.enemyDifficulty.starPolicy.twoStarUnlockStage?Math.min(...Object.values(bundle.enemyPower.units).filter(u=>u.cost<=bundle.enemyDifficulty.costUnlock.filter(v=>v.stage<=stage).slice(-1)[0].maxCost).map(u=>u.points[2][''].power)):0;
  const policy=rows.map(w=>{const b=w.budget!,count=Math.round(w.enemies.length*b.twoStarTarget),minimum=count*minTwo+(w.enemies.length-count)*minOne;
    return {globalWaveId:w.id,stage,round:w.round,targetRatio:b.twoStarTarget,actualRatio:b.twoStarRatio,targetTwoStarCount:count,
      minimumPowerForRoundedTarget:minimum,effectiveBudget:b.effectiveBudget,maximumAllowedWithTolerance:b.effectiveBudget*(1+bundle.enemyDifficulty.optimizer.targetDeviation),
      roundedTargetUnaffordable:minimum>b.effectiveBudget*(1+bundle.enemyDifficulty.optimizer.targetDeviation)+1e-9};});
  stageRows.push({stage,populationRange:[Math.min(...rows.map(w=>w.enemies.length)),Math.max(...rows.map(w=>w.enemies.length))],
    requestedRange:[rows[0].budget!.requestedBudget,rows[rows.length-1].budget!.requestedBudget],effectiveRange:[rows[0].budget!.effectiveBudget,rows[rows.length-1].budget!.effectiveBudget],
    actualRange:[rows[0].budget!.actualBudget,rows[rows.length-1].budget!.actualBudget],maxDeviationPct:Math.max(...rows.map(w=>w.budget!.deviationPct)),
    twoStarRatio:(stars[2]??0)/n,twoStarTarget:rows[0].budget!.twoStarTarget,starDistribution:stars,costDistribution:costs,averageCost:mean,costVariance:variance,
    mixedCostWaves:rows.filter(w=>Object.keys(w.budget!.enemyCostDistribution).length>1).length,
    saturatedWaves:rows.filter(w=>w.budget!.saturated).length,starPolicyEvidence:policy});
}
const boundaries=[];
for(let stage=2;stage<99;stage++){
  const before=normal.filter(w=>w.stage===stage).slice(-1)[0],after=normal.find(w=>w.stage===stage+1)!;
  const lb=legacy.find(w=>w.id===before.id)!,la=legacy.find(w=>w.id===after.id)!;
  const oldBefore=powerOf(lb),oldAfter=powerOf(la);
  boundaries.push({fromStage:stage,toStage:stage+1,fromWaveId:before.id,toWaveId:after.id,
    legacyUnadjustedModelPowerBefore:oldBefore,legacyUnadjustedModelPowerAfter:oldAfter,legacyModelChangePct:(oldAfter/oldBefore-1)*100,
    legacyFreeScalingBefore:{damageAmp:lb.enemies[0].damageAmp,damageReduction:lb.enemies[0].damageReduction},
    legacyFreeScalingAfter:{damageAmp:la.enemies[0].damageAmp,damageReduction:la.enemies[0].damageReduction},
    requestedChangePct:(after.budget!.requestedBudget/before.budget!.requestedBudget-1)*100,
    effectiveChangePct:(after.budget!.effectiveBudget/before.budget!.effectiveBudget-1)*100,
    actualModelPowerBefore:before.budget!.actualBudget,actualModelPowerAfter:after.budget!.actualBudget,actualModelChangePct:(after.budget!.actualBudget/before.budget!.actualBudget-1)*100,
    recoveryFeasible:before.budget!.recoveryFeasible});
}
const b0Wave=legacy.find(w=>w.stage===2&&w.round===1)!;
const summary={seed,mode:'budget-v1',powerModelVersion:bundle.enemyPower.version,calibrationHash:bundle.enemyPower.calibrationHash,
  b0:{value:powerOf(b0Wave),source:'P0 legacy Stage 2-1; real naked unit/star queries, summed by EnemyPowerModel',enemies:b0Wave.enemies,
    constituents:b0Wave.enemies.map(e=>({unitId:e.unitId,star:e.star,...model.estimateUnitPower({unitId:e.unitId,star:e.star})}))},
  waveCount:waves.length,nonIntroWaves:normal.length,maxDeviationPct:Math.max(...normal.map(w=>w.budget!.deviationPct)),
  solutions:normal.reduce((counts,w)=>{const key=w.budget!.solution;counts[key]=(counts[key]??0)+1;return counts;},{} as Record<string,number>),
  saturation:normal.reduce((counts,w)=>{const key=w.budget!.saturationReason??'none';counts[key]=(counts[key]??0)+1;return counts;},{} as Record<string,number>),
  firstAboveMaximum:normal.find(w=>w.budget!.saturationReason==='ABOVE_MAX_FEASIBLE')?.budget,
  maxOptimizerIterations:Math.max(...normal.map(w=>w.budget!.optimizerIterations)),
  caveats:['Budgets use P1-B individual sums; team prediction error remains and estimatedBudgetConfidence is low.',
    'Requested raw anchors grow 4% per budget wave; effective envelopes jointly enforce population feasibility and stage recovery.',
    'Legacy power comparison excludes its uncalibrated extra damageAmp/damageReduction; those values are recorded separately.',
    'Star targets are soft: minimum required power and explicit conflicts are recorded; no free upgrades.',
    'No final balance or player win-rate inference is made.'],stages:stageRows};
const sourceFiles=['assets/scripts/core/EnemyGenerationTypes.ts','assets/scripts/core/EnemyBudget.ts','assets/scripts/core/EnemyCandidates.ts','assets/scripts/core/EnemyGenerator.ts',
  'assets/scripts/core/RunSetup.ts','assets/scripts/core/RunSession.ts','assets/scripts/core/RunSessionTypes.ts','assets/scripts/core/ShopSave.ts','assets/scripts/core/RoundFlow.ts',
  'assets/scripts/view/BattleStage.ts','tools/run-simulation.ts','tools/run-sim.ts','tools/report-enemy-budget.ts'].sort();
const provenance={seed,mode:'budget-v1',powerModelVersion:bundle.enemyPower.version,calibrationHash:bundle.enemyPower.calibrationHash,
  configHash:sha(stableEnemyJson({inputs,...bundle})),sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,sha(readFileSync(resolve(root,p)))]))};
mkdirSync(destination,{recursive:true});const hashes:Record<string,string>={};
const write=(name:string,text:string)=>{writeFileSync(resolve(destination,name),text);hashes[name]=sha(text);};
const json=(name:string,data:unknown)=>write(name,JSON.stringify(data,null,2)+'\n');
json('waves.json',waves);json('summary.json',summary);json('boundaries.json',boundaries);json('provenance.json',provenance);
const selected=normal.filter(w=>w.stage!<=10);
const csv=(rows:(string|number|boolean)[][])=>rows.map(row=>row.map(v=>{const s=String(v);return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(',')).join('\n')+'\n';
const header=['globalWaveId','budgetWaveIndex','stage','round','kind','population','rawBudget','kindMultiplier','pacingMultiplier','requested','effective','actual','deviationPct','minFeasible','maxFeasible','star1','star2','star3','cost1','cost2','cost3','cost4','cost5','saturated','saturationReason','candidateCount','iterations','diversity','confidence'];
write('budget-table.csv',csv([header,...selected.map(w=>{const b=w.budget!;return [w.id,b.budgetWaveIndex,w.stage!,w.round!,w.waveKind!,w.enemies.length,b.rawBudget,b.kindMultiplier,b.pacingMultiplier,b.requestedBudget,b.effectiveBudget,b.actualBudget,b.deviationPct,
  b.minFeasibleBudget,b.maxFeasibleBudget,...[1,2,3].map(n=>b.enemyStarDistribution[n]??0),...[1,2,3,4,5].map(n=>b.enemyCostDistribution[n]??0),b.saturated,b.saturationReason??'',b.candidateCount,b.optimizerIterations,b.unitDiversity,b.estimatedBudgetConfidence];})]));
write('composition-table.csv',csv([['globalWaveId','stage','round','kind','slot','unitId','cost','star','power','confidence','x','y','equipment','statMultiplier'],
 ...selected.flatMap(w=>w.enemies.map((e,slot)=>[w.id,w.stage!,w.round!,w.waveKind!,slot,e.unitId,inputs.units.find(u=>u.id===e.unitId)!.cost!,e.star,
  model.estimateUnitPower(e).power,model.estimateUnitPower(e).confidence,e.x,e.y,(e.equipment??[]).join('+'),e.statMultiplier]))]));
const f=(v:number)=>v.toFixed(3);
let report='# P1-C Stage 2–10 实际生成预算表\n\n种子 '+seed+'；99阶段完整生成968波。当前工具只生成敌军，不冒充整局战斗胜率。\n\n';
report+='B0 = '+summary.b0.value+'，来源为旧Stage 2-1实际战士1★的P1-B估值。全局第4波为budgetWaveIndex 1，intro三波不参与预算。\n\n';
report+='| stage-round | kind | 人口 | requested | effective | actual | 偏差% | 1★/2★/3★ | 费用1/2/3/4/5 | 饱和原因 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
for(const w of selected){const b=w.budget!;report+=`| ${w.stage}-${w.round} | ${w.waveKind} | ${w.enemies.length} | ${f(b.requestedBudget)} | ${f(b.effectiveBudget)} | ${f(b.actualBudget)} | ${f(b.deviationPct)} | ${[1,2,3].map(n=>b.enemyStarDistribution[n]??0).join('/')} | ${[1,2,3,4,5].map(n=>b.enemyCostDistribution[n]??0).join('/')} | ${b.saturationReason??''} |\n`;}
report+='\n## Stage 6–8 星级与可行性\n\n| 阶段 | 2★目标 | 实际2★ | 四舍五入目标最低成本超出预算容差的波数 |\n| --- | --- | --- | --- |\n';
for(const s of stageRows.filter(s=>[6,7,8].includes(s.stage)))report+=`| ${s.stage} | ${f(s.twoStarTarget*100)}% | ${f(s.twoStarRatio*100)}% | ${s.starPolicyEvidence.filter(p=>p.roundedTargetUnaffordable).length}/${s.starPolicyEvidence.length} |\n`;
report+='\n## 关键边界\n\nLegacy估值不包含其未标定的额外增伤/减伤；原值另存boundaries.json。\n\n| 边界 | Legacy模型变化% | 新requested变化% | 新effective变化% | 新actual模型变化% |\n| --- | --- | --- | --- | --- |\n';
for(const b of boundaries.filter(b=>[5,7,9].includes(b.fromStage)))report+=`| ${b.fromStage}→${b.toStage} | ${f(b.legacyModelChangePct)} | ${f(b.requestedChangePct)} | ${f(b.effectiveChangePct)} | ${f(b.actualModelChangePct)} |\n`;
report+='\nP1-B的团队求和局限、全部饱和原因和逐波升星最低预算证明见summary.json；耗时只保存于performance.json，不参与确定性哈希。\n';
write('REPORT.md',report);
writeFileSync(resolve(destination,'output-hashes.json'),JSON.stringify(hashes,null,2)+'\n');
const times=timings.map(t=>t.generationMilliseconds).sort((a,b)=>a-b);
writeFileSync(resolve(destination,'performance.json'),JSON.stringify({totalMilliseconds:elapsed,measuredPerWaveScope:'EnemyBudget.calculate + EnemyGenerator.generate; stage-bound precomputation included only in total',
  averagePerWaveMilliseconds:times.reduce((n,t)=>n+t,0)/times.length,p95Milliseconds:times[Math.floor(times.length*.95)],maxMilliseconds:times[times.length-1],waves:timings},null,2)+'\n');
console.log(JSON.stringify({output:destination,waves:waves.length,maxDeviationPct:summary.maxDeviationPct,solutions:summary.solutions,modelVersion:bundle.enemyPower.version,wavesSha256:hashes['waves.json'],totalMilliseconds:elapsed},null,2));
