require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {RunSession}=require('../assets/scripts/core/RunSession.ts'),{ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {EnemyBudget}=require('../assets/scripts/core/EnemyBudget.ts'),{validateEnemyDifficulty}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts'),{applyBalanceParameters,PARAMETER_BOUNDS}=require('../tools/balance/parameters.ts');
const baseline=require('../docs/p4-balance/baseline/frozen.json'),c=baseline.configs,clone=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function session(difficulty,save){const cfg=new ConfigManager();cfg.setUnits(c.units);cfg.setSkills(c.skills);cfg.setBattle(c.battle);cfg.setEquipment(c.equipment);
 return new RunSession(cfg,c.run,c.waves,{runSeed:17,stageCount:3,enemyPower:c['enemy-power'],enemyDifficulty:difficulty,formationConfig:c['enemy-formation'],enemyRoles:c['enemy-roles'],equipmentPolicy:c['equipment-policy'],...(save?{save}:{})});}
function build(d,stages=13){return buildRunWaves(stages,c.run,c.waves,c.units,{mode:'budget-v1',runSeed:17,power:c['enemy-power'],difficulty:d,equipmentPolicy:c['equipment-policy'],equipmentRoles:c['enemy-roles']});}

test('P4 leaves every production configuration and P0-P3 evidence byte-identical to the frozen baseline',()=>{
 for(const [file,digest]of Object.entries(baseline.hashes))if(file.startsWith('docs/')||file.startsWith('assets/resources/config/'))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',file))).digest('hex'),digest,file);
});
test('optional budget controls default to the exact original anchors, requested/effective budgets and recovery',()=>{
 const waves=build(c['enemy-difficulty']),rows=waves.filter(w=>w.budget).map(w=>({globalWaveId:w.id,budgetWaveIndex:w.budget.budgetWaveIndex,stage:w.stage,round:w.round,rounds:waves.filter(q=>q.stage===w.stage).length,population:w.enemies.length,min:w.budget.minFeasibleBudget,max:w.budget.maxFeasibleBudget,kind:w.waveKind}));
 const b0=waves.find(w=>w.budget).budget.rawBudget;
 const a=new EnemyBudget(b0,c['enemy-difficulty'],rows),b=new EnemyBudget(b0,{...c['enemy-difficulty'],balanceBudgetScale:1,stageRampExponent:1},rows);
 for(const row of rows.filter(r=>r.stage<13)){const actual=b.calculate(row);delete actual.referenceBaseBudget;delete actual.balanceBudgetScale;delete actual.stageRampExponent;assert.deepEqual(actual,a.calculate(row));}
});
test('tuning whitelist has bounds/steps and rejects invalid/undeclared-grid values',()=>{
 for(const [key,range]of Object.entries(PARAMETER_BOUNDS))assert.ok(range.min<=range.max&&range.step>0,key);
 const p={budgetScale:6.5,growthRate:1.045,earlyChallengeStage:3};assert.equal(applyBalanceParameters(c['enemy-difficulty'],p).balanceVersion,'balance-v1');
 for(const bad of [{...p,budgetScale:0},{...p,budgetScale:6.6},{...p,growthRate:1.1},{...p,earlyChallengeStage:2},{...p,stageRampExponent:.2},{...p,stageRampExponent:NaN}])assert.throws(()=>applyBalanceParameters(c['enemy-difficulty'],bad));
 for(const mutation of [d=>d.balanceBudgetScale=Infinity,d=>d.stageRampExponent=0,d=>d.balanceVersion='v1']){const d=clone(c['enemy-difficulty']);mutation(d);assert.throws(()=>validateEnemyDifficulty(d));}
});
test('candidate pays for equipment, respects feasible budgets and retains hard star/stat rules',()=>{
 const candidate=applyBalanceParameters(c['enemy-difficulty'],{budgetScale:6.5,growthRate:1.045,earlyChallengeStage:3});
 for(const w of build(candidate)){if(!w.budget)continue;const b=w.budget;assert.ok(b.effectiveBudget>=b.minFeasibleBudget-1e-8&&b.effectiveBudget<=b.maxFeasibleBudget+1e-8);
  if(b.feasible)assert.ok(b.deviationPct<=5+1e-9);else assert.ok(b.reason);
  for(const u of w.enemies){assert.equal(u.statMultiplier,1);if(u.star===3)assert.ok(w.stage>=10&&w.waveKind==='boss');for(const id of u.equipment)assert.ok(c['equipment-policy'].enemy.calibratedItems.includes(id));}
 }
});
test('bound old saves reject a new balance identity, and same-version continuation is exact',()=>{
 const old=session(c['enemy-difficulty']).snapshot(),d=applyBalanceParameters(c['enemy-difficulty'],{budgetScale:6.5,growthRate:1.045,earlyChallengeStage:3});
 assert.throws(()=>session(d,old),/balance version mismatch/);const current=session(d),saved=current.snapshot();assert.equal(saved.balanceVersion,'balance-v1');
 assert.deepEqual(session(d,saved).snapshot(),saved);assert.throws(()=>session({...d,balanceVersion:'balance-v2'},saved),/balance version mismatch/);
 assert.throws(()=>session({...d,balanceBudgetScale:7},saved),/configuration mismatch/);
 const unbound=clone(old);delete unbound.difficultyConfigIdentity;delete unbound.formationConfigIdentity;delete unbound.equipmentConfigIdentity;unbound.balanceVersion='balance-v99';
 assert.throws(()=>session(d,unbound),/balance version mismatch/);
});
test('finite search stays at 20 training trials and never changes content/model/formation/equipment/economy',()=>{
 const dir=path.resolve(__dirname,'../docs/p4-balance/training/search-v1'),history=fs.readFileSync(path.join(dir,'iterations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(history.length,20);
 assert.deepEqual(history.map(r=>r.iteration),Array.from({length:20},(_,i)=>i+1));
 for(const row of history){const file='iteration-'+String(row.iteration).padStart(2,'0')+'-config.json',candidate=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  for(const key of Object.keys(c).filter(k=>k!=='enemy-difficulty'))assert.deepEqual(candidate.configs[key],c[key],key);
  assert.deepEqual(candidate.bots,require('../docs/p4-balance/baseline/bot-freeze.json').configs);
 }
 const trace=require('../docs/p4-balance/replay/medium-seed17-full.json'),sample=fs.readFileSync(path.resolve(__dirname,'../docs/p4-balance/determinism/single-50/medium/per-run.jsonl'),'utf8').trim().split('\n').map(JSON.parse).find(r=>r.seed===17);
 assert.equal(trace.configHash,sample.configHash);assert.equal(trace.botConfigHash,sample.botConfigHash);assert.equal(trace.botVersion,sample.botVersion);
 assert.deepEqual(trace.waves.map(w=>crypto.createHash('sha256').update(JSON.stringify(w.actions)).digest('hex')),sample.waves.map(w=>w.decisionsSha256));
});
console.log(`P4 balance: ${passed} passed, 0 failed`);
