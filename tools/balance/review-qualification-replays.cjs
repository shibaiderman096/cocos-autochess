require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline');
const revised=process.argv[2]==='--revision-b';
const phase='docs/p4r1-bot-qualification'+(revised?'/revision-b':'');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,phase);
const {loadBalanceBundle}=require('../balance-sim.ts'),{runSimulation}=require('../run-simulation.ts');
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function main(){const out=path.join(dir,'replays');if(fs.existsSync(out))throw Error('Replay reports already exist');
 const reports=[];for await(const line of readline.createInterface({input:fs.createReadStream(path.join(dir,'qualification-500/medium/per-run.jsonl')),crlfDelay:Infinity})){
  const r=JSON.parse(line);reports.push({seed:r.seed,death:r.deathContext?.stage===6,hp:Math.min(...r.waves.filter(w=>w.stage<=6).map(w=>w.hpAfter))});}
 const selected=[...reports.filter(r=>r.death),...reports.slice().sort((a,b)=>a.hp-b.hp||a.seed-b.seed),...reports.slice().sort((a,b)=>b.hp-a.hp||a.seed-b.seed)];
 const seeds=[...new Set([selected[0].seed,reports[0].seed,reports.at(-1).seed,...selected.map(r=>r.seed)])].slice(0,5),expected=new Map();
 for await(const line of readline.createInterface({input:fs.createReadStream(path.join(dir,'qualification-500/medium/per-run.jsonl')),crlfDelay:Infinity})){
  const r=JSON.parse(line);if(seeds.includes(r.seed))expected.set(r.seed,r);}
 const bundle=loadBalanceBundle({root,config:phase+'/freeze/bots-v2.json'}),rows=[];
 fs.mkdirSync(out,{recursive:true});
 for(const seed of seeds){const r=runSimulation(bundle.inputs,{runSeed:seed,stageCount:12,bot:'medium',botConfig:bundle.bots.medium,audit:true,economyAudit:true,...bundle.extra});
  if(r.waves.length!==expected.get(seed).waves.length)throw Error('Replay length mismatch');
  for(const [n,w]of r.waves.entries())if(sha(w.actions)!==expected.get(seed).waves[n].decisionsSha256)throw Error('Replay decisions mismatch '+seed+'/'+w.waveId);
  const bosses=r.waves.filter(w=>w.waveKind==='boss'&&w.stage>=4&&w.stage<=8).map(w=>({stage:w.stage,hp:w.hpBefore,goldBefore:w.goldBefore,goldAtBattle:w.goldAtBattle,
    level:w.levelAtBattle,population:w.playerUnits.length,spending:w.botMetrics,diagnostics:w.botEconomy}));
  fs.writeFileSync(path.join(out,`medium-v2-seed${seed}.json`),JSON.stringify(r,null,2)+'\n',{flag:'wx'});
  rows.push({seed,result:r.result,minimumHp:Math.min(...r.waves.map(w=>w.hpAfter)),fullActionHash:sha(r.waves.map(w=>w.actions)),qualificationActionsMatch:true,
    stage6Death:r.result==='PLAYER_DEAD'&&r.waves.at(-1).stage===6,bosses});
 }
 fs.writeFileSync(path.join(out,'index.json'),JSON.stringify({rows,stage6DeathCasesAvailable:reports.filter(r=>r.death).length,
  note:'Five complete v2 action traces. If no v2 Stage6 deaths occur under unchanged production rules, do not invent one; ten exact historical v1 deaths are preserved in v1-diagnosis, and low-HP Boss behavior is separately exercised by real-action fixtures.'},null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify(rows.map(r=>({seed:r.seed,result:r.result,minimumHp:r.minimumHp,qualificationActionsMatch:r.qualificationActionsMatch}))));
}main().catch(e=>{console.error(e);process.exitCode=1;});
