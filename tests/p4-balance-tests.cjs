require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {validateEnemyDifficulty}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {applyBalanceParameters,PARAMETER_BOUNDS}=require('../tools/balance/parameters.ts');
const baseline=require('../docs/p4-balance/baseline/frozen.json'),c=baseline.configs,clone=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('tuning whitelist has bounds/steps and rejects invalid/undeclared-grid values',()=>{
 for(const [key,range]of Object.entries(PARAMETER_BOUNDS))assert.ok(range.min<=range.max&&range.step>0,key);
 const p={budgetScale:6.5,growthRate:1.045,earlyChallengeStage:3};assert.equal(applyBalanceParameters(c['enemy-difficulty'],p).balanceVersion,'balance-v1');
 for(const bad of [{...p,budgetScale:0},{...p,budgetScale:6.6},{...p,growthRate:1.1},{...p,earlyChallengeStage:2},{...p,stageRampExponent:.2},{...p,stageRampExponent:NaN}])assert.throws(()=>applyBalanceParameters(c['enemy-difficulty'],bad));
 for(const mutation of [d=>d.balanceBudgetScale=Infinity,d=>d.stageRampExponent=0,d=>d.balanceVersion='v1']){const d=clone(c['enemy-difficulty']);mutation(d);assert.throws(()=>validateEnemyDifficulty(d));}
});
test('finite search stays at 20 training trials and never changes content/model/formation/equipment/economy',()=>{
 const dir=path.resolve(__dirname,'../docs/p4-balance/training/search-v1'),history=fs.readFileSync(path.join(dir,'iterations.jsonl'),'utf8').trim().split('\n').map(JSON.parse);assert.equal(history.length,20);
 assert.deepEqual(history.map(r=>r.iteration),Array.from({length:20},(_,i)=>i+1));
 for(const row of history){const file='iteration-'+String(row.iteration).padStart(2,'0')+'-config.json',candidate=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  for(const key of Object.keys(c).filter(k=>k!=='enemy-difficulty'))assert.deepEqual(candidate.configs[key],c[key],key);
  assert.deepEqual(candidate.bots,require('../docs/p4-balance/baseline/bot-freeze.json').configs);
 }
 const trace=require('../docs/p4-balance/replay/medium-seed17-full.json'),sample=require('./fixtures/balance-seed17-summary.json');
 assert.equal(trace.configHash,sample.configHash);assert.equal(trace.botConfigHash,sample.botConfigHash);assert.equal(trace.botVersion,sample.botVersion);
 assert.deepEqual(trace.waves.map(w=>crypto.createHash('sha256').update(JSON.stringify(w.actions)).digest('hex')),sample.decisionsSha256);
});
console.log(`P4 balance: ${passed} passed, 0 failed`);
