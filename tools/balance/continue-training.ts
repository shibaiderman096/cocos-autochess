import {existsSync,mkdirSync,readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {applyBalanceParameters,balanceObjective,PARAMETER_BOUNDS} from './parameters';
import type {BalanceParameters} from './parameters';
const root=process.cwd(),dir=resolve(root,'docs/p4-balance/training/search-v1'),initial=JSON.parse(readFileSync(resolve(dir,'ranked.json'),'utf8'));
if(initial.history.length!==16||existsSync(resolve(dir,'ranked-20.json')))throw Error('Expected exactly 16 completed original training trials');
const baseline=JSON.parse(readFileSync(resolve(root,'docs/p4-balance/baseline/frozen.json'),'utf8')),bots=JSON.parse(readFileSync(resolve(root,'docs/p4-balance/baseline/bot-freeze.json'),'utf8')).configs;
const history=initial.history.slice();
writeFileSync(resolve(dir,'ramp-bounds-extension.json'),JSON.stringify({totalIterationLimit:20,remainingTrials:4,bounds:PARAMETER_BOUNDS,
  reason:'All 16 trials leave Stage3 cumulative completion at 100%; Stage3 boss can lose but fewer earlier losses leave enough HP. Test a budget-envelope exponent with unchanged first/last anchors, recovery, population and actual power accounting. Growth substep is refined within the same original interval; no validation or holdout observed.'},null,2)+'\n');
function evaluate(parameters:BalanceParameters,reason:string){
 if(history.length>=20)throw Error('20-trial limit');const iteration=history.length+1,name='iteration-'+iteration,config=resolve(dir,name+'-config.json'),output=resolve(dir,name);
 const configs=JSON.parse(JSON.stringify(baseline.configs));configs['enemy-difficulty']=applyBalanceParameters(configs['enemy-difficulty'],parameters);
 writeFileSync(config,JSON.stringify({configs,bots,experiment:{iteration,parameters,reason}},null,2)+'\n');
 const result=spawnSync(process.execPath,['--require','tsx/cjs','tools/balance-sim.ts','--bot','medium','--seed-start','1','--seed-count','100','--stages','6','--workers','4','--partition','training','--config',config,'--output',output],{cwd:root,encoding:'utf8',maxBuffer:5*1024*1024});
 writeFileSync(resolve(dir,name+'.log'),result.stdout+(result.stderr??''));if(result.error||result.status!==0)throw result.error??Error(result.stderr);
 const summary=JSON.parse(readFileSync(resolve(output,'medium/summary.json'),'utf8'));
 const row={iteration,parameters,score:balanceObjective(summary),stage3:summary.stages[2].cumulativeCompletion.rate,stage6:summary.stages[5].cumulativeCompletion.rate,output};history.push(row);
 appendFileSync(resolve(dir,'iterations.jsonl'),JSON.stringify({...row,reason,previous:history[history.length-2].parameters})+'\n');console.log(JSON.stringify(row));return row;
}
const a=evaluate({budgetScale:9,growthRate:1.03,earlyChallengeStage:3,stageRampExponent:.3},'Budget shape test after documented 16-trial Stage3 plateau; higher scale is paired with gentler growth.');
const b=evaluate({budgetScale:9,growthRate:1.03,earlyChallengeStage:3,stageRampExponent:.4},'Paired shape sensitivity only, all other parameters equal.');
let exponent=.35;
if(a.stage3>=.85&&b.stage3>=.85)exponent=.25;
else if(a.stage3<=.85&&b.stage3<=.85)exponent=.5;
const c=evaluate({budgetScale:9,growthRate:1.03,earlyChallengeStage:3,stageRampExponent:exponent},'Training-only bracket refinement of Stage3 target.');
const best=[a,b,c].sort((x,y)=>x.score-y.score)[0];
const growthRate=Math.max(1.02,Math.min(1.06,best.parameters.growthRate+(best.stage6>.5?.005:-.005)));
evaluate({...best.parameters,growthRate},'Final allowed trial changes growth only to adjust Stage6, keeping the measured Stage3 envelope shape.');
const ranked=history.slice().sort((x,y)=>x.score-y.score||x.iteration-y.iteration);writeFileSync(resolve(dir,'ranked-20.json'),JSON.stringify({trainingOnly:true,seedRange:[1,100],history,ranked,best:ranked[0],validationUsed:false,holdoutUsed:false},null,2)+'\n');
