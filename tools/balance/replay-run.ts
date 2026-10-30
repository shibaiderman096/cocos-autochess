import {existsSync,mkdirSync,realpathSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {loadBalanceBundle} from '../balance-sim';
import {runSimulation} from '../run-simulation';
import type {SimulationOptions} from '../run-simulation';
import {DEFAULT_STAGE_COUNT} from '../../assets/scripts/core/RunSetup';

// Training-only full action trace; it cannot bypass the one-use holdout workflow.
const root=process.cwd(),args=process.argv.slice(2),values:Record<string,string>={};
try {
  for(let n=0;n<args.length;n+=2){const key=args[n],value=args[n+1];
    if(!['--bot','--seed','--stages','--config','--json'].includes(key)||values[key]!==undefined||value===undefined)throw Error('Invalid replay argument');values[key]=value;}
  const bot=values['--bot'],seed=Number(values['--seed']),stages=Number(values['--stages']??DEFAULT_STAGE_COUNT);
  if(!['weak','medium','strong'].includes(bot)||!Number.isInteger(seed)||seed<1||seed>500||!Number.isInteger(stages)||stages<3||stages>99||!values['--config']||!values['--json'])throw Error('Replay requires a formal bot, training seed1..500, stages3..99, frozen --config and a new --json file');
  const target=resolve(root,values['--json']);let ancestor=dirname(target);while(!existsSync(ancestor))ancestor=dirname(ancestor);
  const actual=resolve(realpathSync(ancestor),relative(ancestor,target));if(!actual.startsWith(root+sep)||existsSync(target))throw Error('Use a new project output file');
  for(const dir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation','docs/p3-equipment']){
    const protectedRoot=resolve(root,dir);if(actual===protectedRoot||actual.startsWith(protectedRoot+sep))throw Error('Historical evidence is protected');}
  const bundle=loadBalanceBundle({root,config:values['--config']}),id=bot as 'weak'|'medium'|'strong';
  const report=runSimulation(bundle.inputs,{runSeed:seed,stageCount:stages,bot:id,botConfig:bundle.bots[id],audit:true,...bundle.extra} as SimulationOptions);
  if(report.result==='SIMULATION_ERROR')throw Error(report.error);
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({file:target,seed,botVersion:report.botVersion,waves:report.waves.length,result:report.result}));
}catch(error){console.error(error);process.exitCode=1;}
