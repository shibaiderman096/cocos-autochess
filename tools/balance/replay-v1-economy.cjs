// Historical diagnosis only. Frozen prices and original bot source are compiled in this process;
// no production file is replaced and no historical evidence is overwritten.
require('tsx/cjs');
const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),crypto=require('node:crypto'),readline=require('node:readline');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/p4r1-bot-qualification/v1-diagnosis');
const source=require('../../docs/p4r1-bot-qualification/freeze/v1-bot-sources.json');
const old=require('../../docs/p4-balance/baseline/frozen.json'),candidate=require('../../docs/p4-balance/freeze/candidate.json');
const ext=require.extensions['.ts'];
require.extensions['.ts']=(m,file)=>{const rel=path.relative(root,file).replace(/\\/g,'/');
  const text=rel==='assets/scripts/core/ShopConfig.ts'?old.rules.ShopConfig:rel.startsWith('tools/bots/')?source[path.basename(file)]:undefined;
  if(text!==undefined)m._compile(ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,file);else ext(m,file);};
const {runSimulation}=require('../run-simulation.ts');
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function main(){if(fs.existsSync(out))throw Error('Diagnosis already exists');fs.mkdirSync(out,{recursive:true});
  const wanted=new Set(require('../../docs/p4-balance/analysis/medium-economy-validation.json').deaths.slice(0,10).map(d=>d.seed)),saved=new Map();
  for await(const line of readline.createInterface({input:fs.createReadStream(path.join(root,'docs/p4-balance/validation/runs-500/medium/per-run.jsonl')),crlfDelay:Infinity})){
    const r=JSON.parse(line);if(wanted.has(r.seed))saved.set(r.seed,r);}
  const c=candidate.configs,inputs={units:c.units,skills:c.skills,battle:c.battle,run:c.run,waves:c.waves,equipment:c.equipment};
  const extra={enemyDifficulty:c['enemy-difficulty'],enemyPower:c['enemy-power'],formationConfig:c['enemy-formation'],enemyRoles:c['enemy-roles'],equipmentPolicy:c['equipment-policy']};
  const rows=[];
  for(const seed of wanted){const r=runSimulation(inputs,{runSeed:seed,stageCount:99,maxWaves:38,bot:'medium',botConfig:candidate.bots.medium,economyAudit:true,...extra});
    if(r.result!=='PLAYER_DEAD'||r.waves.at(-1).stage!==6)throw Error('Did not reproduce Stage6 death '+seed);
    const s=saved.get(seed);for(const [index,w]of r.waves.entries())if(sha(w.actions)!==s.waves[index].decisionsSha256||w.goldAtBattle!==s.waves[index].goldAfterShopping)throw Error('Historical action mismatch '+seed+'/'+w.waveId);
    fs.writeFileSync(path.join(out,`medium-v1-seed${seed}.json`),JSON.stringify(r)+'\n',{flag:'wx'});
    const w=r.waves.at(-1),a=w.botEconomy.after;
    rows.push({seed,exactHistoricalActions:true,deathWave:w.waveId,gold:w.goldAtBattle,level:w.levelAtBattle,population:w.playerUnits.length,
      hp:w.hpBefore,levelTarget:a.legacyLevelTarget,levelUpGold:a.levelUpGold,bench:a.bench,benchPowerProxy:a.benchPowerProxy,
      couldLevel:a.populationOpportunity,unusedGoldReason:a.unusedGoldReason,refreshSpent:w.botMetrics.refreshSpending,xpSpent:w.botMetrics.xpSpending,
      explanation:`${a.level>=a.legacyLevelTarget?'Fixed level target reached':'XP purchase loop capped at 3 buys / 12 gold'} at Lv${a.level}, target ${a.legacyLevelTarget}, remaining upgrade cost ${a.levelUpGold}, bank ${a.gold}. Roll wanted=${a.rollWanted}, capped at ${candidate.bots.medium.maxRolls}; upgraded board ratio replaces core readiness. No Boss-specific spending window.`});
  }
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({schema:'v1-historical-replay',oldPriceRules:true,candidateRejected:true,note:'Historical candidate used only to reproduce known failures; not a production balance run. Report config hash now includes old price table; action hashes match archived P4 wave by wave.',rows},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(rows));
}main().catch(e=>{console.error(e);process.exitCode=1;});
