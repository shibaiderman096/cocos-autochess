import {existsSync,mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {applyBalanceParameters,balanceObjective,PARAMETER_BOUNDS} from './parameters';
import type {BalanceParameters} from './parameters';
import {loadBotConfigs} from '../bots/factory';

const root=process.cwd(),dir=resolve(root,'docs/p4-balance/training/search-v1');
if(!existsSync(resolve(root,'docs/p4-balance/baseline/baseline-completed.json')))throw Error('Full unchanged baseline must be completed before tuning');
if(existsSync(dir))throw Error('Training experiment directories cannot be overwritten');mkdirSync(dir,{recursive:true});
const baseline=JSON.parse(readFileSync(resolve(root,'docs/p4-balance/baseline/frozen.json'),'utf8')),botFreeze=JSON.parse(readFileSync(resolve(root,'docs/p4-balance/baseline/bot-freeze.json'),'utf8'));
const frozenBots=botFreeze.configs;
if(JSON.stringify(frozenBots)!==JSON.stringify(loadBotConfigs(root)))throw Error('Bot configurations changed since smoke freeze');
const history:Array<{iteration:number;parameters:BalanceParameters;score:number;stage3:number;stage6:number;output:string}>=[],seen=new Set<string>();
writeFileSync(resolve(dir,'bounds.json'),JSON.stringify({maxIterations:20,bounds:PARAMETER_BOUNDS,seedRange:[1,100],campaignStages:6,parameterClasses:{budget:['budgetScale','growthRate'],unlock:['earlyChallengeStage']},
  rationale:'Full 500-seed baseline is 100% through Stage3/6. Growth 1.02..1.06 leaves Stage3 effective budgets identical because 1-cost/1-star caps dominate. Keep measured B0 reference and add an explicit static budget scale plus a coherent earlier cost-3/two-star unlock. No unit/equipment/economy/model or player-adaptive changes.'},null,2)+'\n');
function evaluate(parameters:BalanceParameters,reason:string){
 const key=JSON.stringify(parameters);if(seen.has(key))return;if(history.length>=20)return;seen.add(key);
 const iteration=history.length+1,name='iteration-'+String(iteration).padStart(2,'0'),config=resolve(dir,name+'-config.json'),output=resolve(dir,name);
 const configs=JSON.parse(JSON.stringify(baseline.configs));configs['enemy-difficulty']=applyBalanceParameters(configs['enemy-difficulty'],parameters);
 writeFileSync(config,JSON.stringify({configs,bots:frozenBots,experiment:{iteration,parameters,reason}},null,2)+'\n');
 const p=spawnSync(process.execPath,['--require','tsx/cjs','tools/balance-sim.ts','--bot','medium','--seed-start','1','--seed-count','100','--stages','6','--workers','4','--partition','training','--config',config,'--output',output],{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024});
 writeFileSync(resolve(dir,name+'.log'),p.stdout+(p.stderr??''));if(p.error||p.status!==0)throw p.error??Error('Training run failed: '+p.stderr);
 const summary=JSON.parse(readFileSync(resolve(output,'medium/summary.json'),'utf8'));
 const row={iteration,parameters,score:balanceObjective(summary),stage3:summary.stages[2].cumulativeCompletion.rate,stage6:summary.stages[5].cumulativeCompletion.rate,output};history.push(row);
 appendFileSync(resolve(dir,'iterations.jsonl'),JSON.stringify({...row,reason,previous:history.length>1?history[history.length-2].parameters:null})+'\n');
 console.log(JSON.stringify(row));
}
for(const budgetScale of [3,5,7,9])evaluate({budgetScale,growthRate:1.04,earlyChallengeStage:3},'Coarse bounded budget scan with one coherent early-unlock package; first two parameter classes only.');
let best=history.slice().sort((a,b)=>a.score-b.score||a.iteration-b.iteration)[0];
for(const growthRate of [1.02,1.025,1.03,1.035,1.045,1.05,1.055,1.06])evaluate({...best.parameters,growthRate},'Budget-class growth sensitivity around the best coarse scale; unlock policy unchanged.');
best=history.slice().sort((a,b)=>a.score-b.score||a.iteration-b.iteration)[0];
for(const delta of [-.5,-.25,.25,.5]){const budgetScale=best.parameters.budgetScale+delta;if(budgetScale>=1&&budgetScale<=12)evaluate({...best.parameters,budgetScale},'Local quarter-step scale refinement on training seeds only.');}
const ranked=history.slice().sort((a,b)=>a.score-b.score||a.iteration-b.iteration);
writeFileSync(resolve(dir,'ranked.json'),JSON.stringify({trainingOnly:true,seedRange:[1,100],history,ranked,best:ranked[0],validationUsed:false,holdoutUsed:false},null,2)+'\n');
console.log('Bounded training search complete; finalists still require 500 training seeds and ordering checks before freezing.');
