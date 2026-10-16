import {existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync,appendFileSync,createReadStream,openSync,readSync,closeSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {dirname,resolve,relative,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {fork} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs,runSimulation} from './run-simulation';
import type {SimulationOptions,RunInputs} from './run-simulation';
import type {CompactRun} from './balance/metrics';
import {compactRun,aggregateRuns} from './balance/metrics';
import {loadBotConfigs} from './bots/factory';

const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
interface Options {root:string;output:string;bot:'weak'|'medium'|'strong'|'all';seedStart:number;seedCount:number;stages:number;workers:number;
  partition:'smoke'|'development'|'baseline'|'training'|'validation'|'holdout'|'qualification'|'long-tail';formation?:SimulationOptions['formation'];config?:string;audit:boolean;experiment?:'bot-qualification-v2'|'bot-qualification-v2r1b'}
function parse(args:string[]):Options {
  const o:Options={root:process.cwd(),output:'',bot:'all',seedStart:1,seedCount:50,stages:99,workers:Math.min(4,cpus().length),partition:'smoke',audit:true},seen=new Set<string>();
  const names=['--output','--bot','--seed-start','--seed-count','--stages','--workers','--partition','--formation','--config','--audit','--experiment'];
  for(let n=0;n<args.length;n++){const key=args[n],v=args[++n];if(!names.includes(key)||seen.has(key)||v===undefined)throw Error('Invalid or repeated balance argument: '+key);seen.add(key);
    if(key==='--output')o.output=v;else if(key==='--config')o.config=v;
    else if(key==='--experiment'){if(!['bot-qualification-v2','bot-qualification-v2r1b'].includes(v))throw Error('Invalid experiment');o.experiment=v as Options['experiment'];}
    else if(key==='--bot'){if(!['weak','medium','strong','all'].includes(v))throw Error('Invalid bot');o.bot=v as Options['bot'];}
    else if(key==='--formation'){if(!['auto','L0','L1','L2','L3'].includes(v))throw Error('Invalid formation');o.formation=v as Options['formation'];}
    else if(key==='--partition'){if(!['smoke','development','baseline','training','validation','holdout','qualification','long-tail'].includes(v))throw Error('Invalid partition');o.partition=v as Options['partition'];}
    else if(key==='--audit'){if(!['true','false'].includes(v))throw Error('Invalid audit');o.audit=v==='true';}
    else {if(!/^\d+$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('Invalid positive integer');const num=Number(v);
      if(key==='--seed-start')o.seedStart=num;if(key==='--seed-count')o.seedCount=num;if(key==='--stages')o.stages=num;if(key==='--workers')o.workers=num;}
  }
  if(!o.output||o.seedCount<1||o.seedStart<1||o.seedStart+o.seedCount-1>0xffffffff||o.stages<3||o.stages>99||o.workers<1||o.workers>16)throw Error('Invalid range or missing output');
  const last=o.seedStart+o.seedCount-1;
  if(o.experiment){
    const revised=o.experiment==='bot-qualification-v2r1b';
    const ranges=revised?{smoke:[5501,5550],development:[5601,5800],qualification:[6001,6500],'long-tail':[6501,6550]}:
      {smoke:[1951,2000],development:[2001,2200],qualification:[2201,2700],'long-tail':[2701,2750]};
    const range=ranges[o.partition as keyof typeof ranges];
    if(!range||o.seedStart<range[0]||last>range[1]||!o.audit||o.formation)throw Error('Qualification partition/range/audit violation');
    if(['qualification','long-tail'].includes(o.partition)&&!o.config)throw Error('Qualification requires frozen bots');
    if(o.partition==='qualification'&&(o.bot!=='all'||o.seedStart!==ranges.qualification[0]||o.seedCount!==500))throw Error('Formal qualification requires all three bots on all 500 untouched seeds');
    if(o.partition==='long-tail'&&(o.bot!=='medium'||o.seedStart!==ranges['long-tail'][0]||o.seedCount!==50))throw Error('Long-tail requires 50 untouched Medium seeds');
    if(o.partition!=='long-tail'&&o.stages!==12||o.partition==='long-tail'&&o.stages!==99)throw Error('Qualification requires real Stage12 / long-tail Stage99 campaigns');
    return o;
  }
  if(['qualification','long-tail'].includes(o.partition))throw Error('Qualification requires its experiment identity');
  if(['smoke','development','baseline','training'].includes(o.partition)&&last>500)throw Error('Training/development seeds must stay within 1..500');
  if(o.partition==='validation'&&(o.seedStart<501||last>1000))throw Error('Validation seeds are 501..1000');
  if(o.partition==='holdout'&&(o.seedStart<1001||last>1250))throw Error('Holdout seeds are 1001..1250');
  if(['validation','holdout'].includes(o.partition)&&!o.config)throw Error('Validation and holdout require an explicitly frozen config file');
  return o;
}
export function loadBalanceBundle(o:{root:string;config?:string}) {
  let inputs=loadRunInputs(o.root),extra={...loadEnemyGenerationInputs(o.root),...loadFormationInputs(o.root),...loadEquipmentInputs(o.root)},bots=loadBotConfigs(o.root);
  if(o.config){const data=JSON.parse(readFileSync(resolve(o.root,o.config),'utf8'));
    if(data.freeze?.sourceHashes)for(const [file,digest]of Object.entries(data.freeze.sourceHashes)){
      const absolute=resolve(o.root,file);if(!absolute.startsWith(o.root+sep)||sha(readFileSync(absolute))!==digest)throw Error('Frozen runtime source mismatch: '+file);
    }
    if(data.configs){const c=data.configs;inputs={units:c.units,skills:c.skills,battle:c.battle,run:c.run,waves:c.waves,equipment:c.equipment};
      extra={enemyDifficulty:c['enemy-difficulty'],enemyPower:c['enemy-power'],formationConfig:c['enemy-formation'],enemyRoles:c['enemy-roles'],equipmentPolicy:c['equipment-policy']};}
    else {if(data.inputs)inputs=data.inputs;if(data.extra)extra={...extra,...data.extra};}
    if(data.bots)bots=data.bots;
  }
  return {inputs,extra,bots};
}
interface WorkerJob {bot:'weak'|'medium'|'strong';seed:number}
function worker(file:string):void {
  const params=JSON.parse(readFileSync(file,'utf8')) as {options:Options;jobs:WorkerJob[];part:string},o=params.options,bundle=loadBalanceBundle(o);
  writeFileSync(params.part,'');let count=0;
  for(const job of params.jobs){const r=runSimulation(bundle.inputs,{runSeed:job.seed,stageCount:o.stages,bot:job.bot,botConfig:bundle.bots[job.bot],audit:o.audit,economyAudit:!!o.experiment,...bundle.extra,...(o.formation?{formation:o.formation}:{})});
    if(r.result==='SIMULATION_ERROR')throw Error(`${job.bot}/${job.seed}: ${r.error}`);
    const compact=compactRun(r,bundle.inputs,bundle.extra.equipmentPolicy.tiers);appendFileSync(params.part,JSON.stringify(compact)+'\n');
    count++;if(count%10===0)process.send?.({done:count});
  }
  process.send?.({done:count,finished:true});
}
function safeDestination(root:string,output:string):string {
  const dest=resolve(root,output);let parent=dest;while(!existsSync(parent))parent=dirname(parent);
  const actual=resolve(realpathSync(parent),relative(parent,dest));
  if(!actual.toLowerCase().startsWith((root+sep).toLowerCase()))throw Error('Output must remain within project');
  for(const dir of ['docs/p0-enemy-difficulty','docs/p1-enemy-difficulty','docs/p2-enemy-formation','docs/p3-equipment','docs/p4-balance']){
    const protectedRoot=resolve(root,dir).toLowerCase();if(actual.toLowerCase()===protectedRoot||actual.toLowerCase().startsWith(protectedRoot+sep))throw Error('Previous stage evidence is protected');}
  if(existsSync(dest))throw Error('Reports are immutable; choose a new output directory');return dest;
}
function csv(file:string,rows:Record<string,unknown>[]):void {
  const keys=Object.keys(rows[0]??{}),quote=(v:unknown)=>'"'+String(typeof v==='object'?JSON.stringify(v):v??'').replace(/"/g,'""')+'"';
  writeFileSync(file,[keys.map(quote).join(','),...rows.map(r=>keys.map(k=>quote(r[k])).join(','))].join('\n')+'\n');
}
function hashFile(file:string):string {
  const fd=openSync(file,'r'),buffer=Buffer.allocUnsafe(1024*1024),hash=createHash('sha256');
  try {let count:number;while((count=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));}
  finally{closeSync(fd);}return hash.digest('hex');
}
async function main():Promise<void> {
  const o=parse(process.argv.slice(2)),dest=safeDestination(o.root,o.output),bundle=loadBalanceBundle(o),ids=o.bot==='all'?['weak','medium','strong'] as const:[o.bot],jobs:WorkerJob[]=[];
  const inputHash=sha(JSON.stringify(bundle));
  if(o.experiment){
    const revised=o.experiment==='bot-qualification-v2r1b';
    const frozen=JSON.parse(readFileSync(resolve(o.root,'docs/p4r1-bot-qualification/freeze/game-before.json'),'utf8'));
    for(const [file,digest]of Object.entries(frozen.hashes))if(sha(readFileSync(resolve(o.root,file)))!==digest)throw Error('Production game changed: '+file);
    const production=loadBalanceBundle({root:o.root});
    if(sha(JSON.stringify(bundle.inputs))!==sha(JSON.stringify(production.inputs))||sha(JSON.stringify(bundle.extra))!==sha(JSON.stringify(production.extra)))throw Error('Qualification cannot change game configuration');
    if(o.config&&['qualification','long-tail'].includes(o.partition)){const b=JSON.parse(readFileSync(resolve(o.root,o.config),'utf8'));
      if(b.schema!==(revised?'p4r1-bots-frozen-v2r1b':'p4r1-bots-frozen-v2'))throw Error('Qualification requires frozen bot identity');}
    const phaseDir='docs/p4r1-bot-qualification'+(revised?'/revision-b':'');
    if(revised&&!dest.startsWith(resolve(o.root,phaseDir)+sep)&&!dest.startsWith(resolve(o.root,'temp')+sep))throw Error('Revised reports must not change rejected qualification evidence');
    if(o.partition==='qualification')writeFileSync(resolve(o.root,phaseDir,'qualification-once.json'),JSON.stringify({inputHash,seedRange:[o.seedStart,o.seedStart+o.seedCount-1],bots:ids,config:o.config},null,2)+'\n',{flag:'wx'});
  }
  if(o.partition==='holdout'){
    const lock=resolve(o.root,'docs/p4-balance/holdout-once.json');
    writeFileSync(lock,JSON.stringify({inputHash,config:o.config,seeds:[o.seedStart,o.seedStart+o.seedCount-1],output:o.output,bots:ids},null,2)+'\n',{flag:'wx'});
  }
  for(const bot of ids)for(let seed=o.seedStart;seed<o.seedStart+o.seedCount;seed++)jobs.push({bot,seed});
  mkdirSync(resolve(dest,'parts'),{recursive:true});const workerCount=Math.min(o.workers,jobs.length),starts=performance.now(),counts=Array(workerCount).fill(0),parts:string[]=[];
  console.log(`Balance ${o.partition}: ${jobs.length} runs, ${o.stages} campaign stages, ${workerCount} worker processes; no difficulty values are changed`);
  await Promise.all(Array.from({length:workerCount},(_,index)=>new Promise<void>((res,rej)=>{
    const assigned=jobs.filter((_,n)=>n%workerCount===index),file=resolve(dest,'parts',`job-${index}.json`),part=resolve(dest,'parts',`part-${index}.jsonl`);parts.push(part);
    writeFileSync(file,JSON.stringify({options:o,jobs:assigned,part},null,2)+'\n');
    const child=fork(__filename,['--worker',file],{cwd:o.root,execArgv:__filename.endsWith('.ts')?['--require','tsx/cjs']:[],stdio:['ignore','inherit','inherit','ipc']});
    child.on('message',(m:any)=>{if(typeof m.done==='number'){counts[index]=m.done;console.log(`progress ${counts.reduce((n,v)=>n+v,0)}/${jobs.length}`);}});
    child.on('error',rej);child.on('exit',code=>code===0?res():rej(Error(`Balance worker ${index} exited ${code}`)));
  })));
  const simulationElapsed=performance.now()-starts;
  const hashes:Record<string,string>={},summaries:Record<string,ReturnType<typeof aggregateRuns>>={};
  const json=(file:string,data:unknown)=>{writeFileSync(resolve(dest,file),JSON.stringify(data,null,2)+'\n');hashes[file]=sha(readFileSync(resolve(dest,file)));};
  // Each worker emits bot-major, seed-sorted lines. Merge one head per worker and
  // retain only scalar metrics for one bot, rather than every 99-stage roster in RAM.
  const readers=parts.map(file=>createInterface({input:createReadStream(file),crlfDelay:Infinity})[Symbol.asyncIterator]());
  const heads=await Promise.all(readers.map(async reader=>{const next=await reader.next();return next.done?null:{line:next.value,run:JSON.parse(next.value) as CompactRun};}));
  const rank=(r:CompactRun)=>r.bot==='WeakBot'?0:r.bot==='MediumBot'?1:2;
  let battles=0,totalRuns=0;
  for(const bot of ids){const name=bot==='weak'?'WeakBot':bot==='medium'?'MediumBot':'StrongBot',selected:CompactRun[]=[],folder=resolve(dest,bot);mkdirSync(folder);
    const perRun=resolve(folder,'per-run.jsonl'),perWave=resolve(folder,'per-wave.csv');writeFileSync(perRun,'');writeFileSync(perWave,'');let waveKeys:string[]=[];
    while(true){const available=heads.map((value,index)=>({value,index})).filter(v=>v.value!==null).sort((a,b)=>rank(a.value!.run)-rank(b.value!.run)||a.value!.run.seed-b.value!.run.seed);
      const next=available[0];if(!next||next.value!.run.bot!==name)break;
      const {line,run}=next.value!;appendFileSync(perRun,line+'\n');battles+=run.waves.length;totalRuns++;
      if(!waveKeys.length){waveKeys=Object.keys(run.waves[0]);appendFileSync(perWave,waveKeys.map(key=>'"'+key+'"').join(',')+'\n');}
      const quote=(v:unknown)=>'"'+String(typeof v==='object'?JSON.stringify(v):v??'').replace(/"/g,'""')+'"';
      appendFileSync(perWave,run.waves.map(w=>waveKeys.map(key=>quote((w as Record<string,unknown>)[key])).join(',')).join('\n')+'\n');
      for(const w of run.waves){delete (w as Partial<typeof w>).playerRoster;delete (w as Partial<typeof w>).enemyRoster;}
      selected.push(run);const item=await readers[next.index].next();heads[next.index]=item.done?null:{line:item.value,run:JSON.parse(item.value) as CompactRun};
    }
    if(selected.length!==o.seedCount)throw Error('Incomplete merged bot report: '+bot);
    hashes[bot+'/per-run.jsonl']=hashFile(perRun);hashes[bot+'/per-wave.csv']=hashFile(perWave);
    const summary=aggregateRuns(selected,bundle.inputs);summaries[bot]=summary;json(bot+'/summary.json',summary);
    csv(resolve(folder,'per-stage.csv'),summary.stages);hashes[bot+'/per-stage.csv']=sha(readFileSync(resolve(folder,'per-stage.csv')));
  }
  json('aggregate.json',summaries);
  json('provenance.json',{partition:o.partition,seedRange:[o.seedStart,o.seedStart+o.seedCount-1],campaignStages:o.stages,formation:o.formation??'auto',audit:o.audit,inputHash,
    bots:ids.map(id=>({id,version:bundle.bots[id].version,config:bundle.bots[id]})),configFile:o.config??null});
  const elapsed=performance.now()-starts;
  writeFileSync(resolve(dest,'performance.json'),JSON.stringify({runs:totalRuns,battles,workers:workerCount,wallMilliseconds:elapsed,simulationWallMilliseconds:simulationElapsed,runsPerSecond:totalRuns/(elapsed/1000),wavesPerSecond:battles/(elapsed/1000)},null,2)+'\n');
  json('manifest.json',{hashes});
  console.log(JSON.stringify({output:o.output,runs:totalRuns,battles,seconds:elapsed/1000,results:Object.fromEntries(ids.map(id=>[id,{stage3:summaries[id].stages[2]?.cumulativeCompletion,stage6:summaries[id].stages[5]?.cumulativeCompletion,failedActions:summaries[id].failedActions}]))},null,2));
}
if(require.main===module){
  if(process.argv[2]==='--worker'){try{worker(process.argv[3]);}catch(e){console.error(e);process.exitCode=1;}}
  else main().catch(e=>{console.error(e);process.exitCode=1;});
}
