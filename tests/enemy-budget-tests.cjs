require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {buildRunWaves,stageRoundCount}=require('../assets/scripts/core/RunSetup.ts');
const {EnemyBudget,classifyWave,rawEnemyBudget}=require('../assets/scripts/core/EnemyBudget.ts');
const {EnemyGenerator}=require('../assets/scripts/core/EnemyGenerator.ts');
const {buildEnemyCandidates,feasibleEnemyBounds}=require('../assets/scripts/core/EnemyCandidates.ts');
const {validateEnemyDifficulty,stableEnemyJson}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {freshSaveV2,migrateSaveV2}=require('../assets/scripts/core/ShopSave.ts');
const {loadEnemyGenerationInputs,runSimulation:simulate}=require('../tools/run-simulation.ts');
const loadRunInputs=()=>require('./historical-inputs.cjs').archivedInputs;
const runSimulation=(inputs,options)=>simulate(inputs,{...options,equipmentPolicy:false});
const inputs=loadRunInputs(),bundle={...loadEnemyGenerationInputs(),enemyPower:require('../docs/p1-enemy-difficulty/power-calibration/final-500/enemy-power.json')},c=bundle.enemyDifficulty,power=bundle.enemyPower;
const clone=v=>JSON.parse(JSON.stringify(v)),digest=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const model=new EnemyPowerModel(power),root=path.resolve(__dirname,'..');let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
const build=(stages=99,seed=12345,extra={})=>buildRunWaves(stages,inputs.run,inputs.waves,inputs.units,{mode:'budget-v1',runSeed:seed,difficulty:c,power,...extra});
const legacy=()=>buildRunWaves(99,inputs.run,inputs.waves,inputs.units,{mode:'legacy'});
const waves=build(),normal=waves.filter(w=>w.budget),old=legacy();
function session(options={}){const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 return new RunSession(cfg,inputs.run,inputs.waves,{runSeed:12345,stageCount:10,formation:'L0',...bundle,...options});}
function stub(stage,kind,target,population=1){const g=new EnemyGenerator(c,power,inputs.units,new RunRandomContext(1)),limits=g.bounds(stage,kind,population);
 return {g,b:{globalWaveId:999,budgetWaveIndex:999,stage,round:1,waveKind:kind,rawBudget:target,kindMultiplier:1,pacingMultiplier:1,
  requestedBudget:target,effectiveBudget:target,minFeasibleBudget:limits.min,maxFeasibleBudget:limits.max,saturated:false,effectiveEnvelopeAdjusted:false,recoveryFeasible:true}};}

test('C0 uses the published P1-B model and B0 is the old Stage 2-1 real army query',()=>{
 assert.equal(power.version,'enemy-power-v1');assert.equal(power.calibrationHash,c.calibrationHash);
 const row=old.find(w=>w.stage===2&&w.round===1),value=model.estimateTeamPower(row.enemies.map(e=>({unitId:e.unitId,star:e.star,equipment:[]}))).power;
 assert.equal(normal[0].budget.rawBudget,value);assert.equal(value,model.estimateUnitPower({unitId:'warrior',star:1}).power);
});
test('A legacy all 968 waves exactly equal P0, intro and population stay unchanged',()=>{
 assert.deepEqual(old,require('../docs/p0-enemy-difficulty/baseline/waves-before.json'));assert.equal(waves.length,968);
 for(let i=0;i<waves.length;i++){assert.equal(waves[i].enemies.length,old[i].enemies.length);if(waves[i].stage===1){assert.deepEqual(waves[i].enemies,old[i].enemies);assert.equal(waves[i].waveKind,'intro');assert.equal(waves[i].budget,undefined);}}
 assert.equal(normal[0].budget.budgetWaveIndex,1);assert.equal(normal[0].id,4);
});
test('B same seed regenerates all wave enemies and diagnostics exactly; another seed can vary choices',()=>{
 assert.deepEqual(build(),waves);assert.notEqual(digest(build(10,12346).map(w=>w.enemies)),digest(waves.filter(w=>w.stage<=10).map(w=>w.enemies)));
});
test('C 3 / 6 / 99 stage prefixes include identical budgets and final selected-stage Boss',()=>{
 for(const stages of [3,6])assert.deepEqual(build(stages),waves.filter(w=>w.stage<=stages));
});
test('D 1000 enemy draws and composition generation leave shop/battle/bot/formation streams unchanged',()=>{
 const a=new RunRandomContext(55),b=new RunRandomContext(55),enemy=b.stream('enemy',8);for(let i=0;i<1000;i++)enemy.next();
 const g=new EnemyGenerator(c,power,inputs.units,b),row=normal.find(w=>w.stage===7);g.generate(row.budget,row.enemies.length,inputs.run.enemyProgression.cells);
 for(const key of ['shop','battle','bot','formation']){const aa=a.stream(key,8),bb=b.stream(key,8);assert.deepEqual(Array.from({length:30},()=>aa.next()),Array.from({length:30},()=>bb.next()));}
});
test('E mixed costs really occur, costs respect unlock and implemented 4-cost units enter the pool and army',()=>{
 const mixed=normal.filter(w=>Object.keys(w.budget.enemyCostDistribution).length>1);assert.ok(mixed.length>10);
 assert.ok(normal.some(w=>w.stage>=7&&w.budget.enemyCostDistribution[4]>0));
 for(const w of normal){const max=c.costUnlock.filter(v=>v.stage<=w.stage).at(-1).maxCost;for(const e of w.enemies)assert.ok(inputs.units.find(u=>u.id===e.unitId).cost<=max);}
 assert.equal(buildEnemyCandidates(7,'normal',inputs.units,model,c).candidates.filter(u=>u.cost===4).length,4);
});
test('F 1-star / 2-star mixtures and progressive feasible soft targets replace full-team tier switching',()=>{
 const ratios=[6,7,8].map(stage=>{const rows=normal.filter(w=>w.stage===stage);return rows.reduce((n,w)=>n+(w.budget.enemyStarDistribution[2]??0),0)/rows.reduce((n,w)=>n+w.enemies.length,0);});
 assert.ok(ratios[0]>.2&&ratios[0]<.4);assert.ok(ratios[1]>ratios[0]);assert.ok(ratios[2]>ratios[1]);
 for(const stage of [6,7])assert.ok(normal.some(w=>w.stage===stage&&w.budget.enemyStarDistribution[1]&&w.budget.enemyStarDistribution[2]));
 for(const stage of [7,8])assert.ok(normal.some(w=>w.stage===stage&&w.budget.starPolicyBudgetConflict));
 console.log('  seed12345 Stage6/7/8 2-star ratios '+ratios.join('/'));
});
test('soft diversity avoids the observed affordable all-mage degeneration without imposing unique-unit caps',()=>{
 const row=normal.find(w=>w.stage===7&&w.round===1);assert.ok(row.budget.unitDiversity>1);assert.ok(row.enemies.length>row.budget.unitDiversity);
 assert.ok(Object.keys(row.budget.enemyCostDistribution).length>1);assert.ok(row.budget.deviationPct<=5);
});
test('G normal/elite have zero 3-stars, Boss has at most one and its real nonlinear price is paid',()=>{
 for(const w of normal){const n=w.enemies.filter(e=>e.star===3).length;assert.ok(n<=(w.waveKind==='boss'&&w.stage>=10?1:0));
  assert.equal(w.budget.actualBudget,model.estimateTeamPower(w.enemies.map(e=>({unitId:e.unitId,star:e.star,equipment:e.equipment}))).power);}
 assert.ok(normal.some(w=>w.enemies.some(e=>e.star===3)));
});
test('H every budget multiplier is 1, enemy equipment is empty and legacy late bonuses are absent',()=>{
 for(const w of normal)for(const e of w.enemies){assert.equal(e.statMultiplier,1);assert.equal(e.damageAmp,0);assert.equal(e.damageReduction,0);assert.deepEqual(e.equipment,[]);}
 assert.equal(old.find(w=>w.stage===10).enemies[0].damageAmp,.05);assert.equal(old.find(w=>w.stage===99).enemies[0].damageReduction,.8);
 const s=session();s.debugJump(10,1);const sim=s.createPreview().sim;for(const u of sim.units.filter(u=>u.side===1)){assert.equal(u.cfg.damageAmp,s.cfg.getUnit(u.cfg.id).damageAmp);assert.equal(u.cfg.damageReduction,s.cfg.getUnit(u.cfg.id).damageReduction);}
});
test('I all 965 formal generated non-intro waves meet tolerance with explicit solution classification',()=>{
 for(const w of normal){const b=w.budget;assert.ok(b.feasible,JSON.stringify(b));assert.equal(b.solution,'within-tolerance');assert.ok(b.deviationPct<=5+1e-9);assert.ok(b.optimizerIterations<=100);}
});
test('J requested and effective Boss-to-next-first budgets recover exactly 6 percent at all 97 boundaries',()=>{
 for(let stage=2;stage<99;stage++){const last=normal.filter(w=>w.stage===stage).at(-1).budget,next=normal.find(w=>w.stage===stage+1).budget;
  assert.equal(last.waveKind,'boss');assert.ok(last.recoveryFeasible);assert.ok(Math.abs(next.requestedBudget/last.requestedBudget-.94)<1e-12);assert.ok(Math.abs(next.effectiveBudget/last.effectiveBudget-.94)<1e-12);}
});
test('K requested normal anchors follow 4 percent per budget wave with no compounded Boss multiplier',()=>{
 const b0=normal[0].budget.rawBudget;for(const w of normal){const b=w.budget;assert.equal(b.rawBudget,b0*1.04**(b.budgetWaveIndex-1));assert.ok(Math.abs(b.rawBudget*b.kindMultiplier*b.pacingMultiplier-b.requestedBudget)<b.requestedBudget*1e-12);if(w.round===1)assert.equal(b.requestedBudget,b.rawBudget);}
});
test('L saturation preserves huge requested budgets, returns within finite limits and never breaks population or star caps',()=>{
 const row=normal.find(w=>w.stage===99&&w.waveKind==='normal'),b=clone(row.budget),g=new EnemyGenerator(c,power,inputs.units,new RunRandomContext(2));
 b.requestedBudget=b.rawBudget=rawEnemyBudget(normal[0].budget.rawBudget,10000,c.growthRate);b.budgetWaveIndex=10000;
 b.saturated=true;b.saturationReason='ABOVE_MAX_FEASIBLE';b.effectiveBudget=b.maxFeasibleBudget;
 const result=g.generate(b,10,inputs.run.enemyProgression.cells);assert.ok(result.diagnostics.requestedBudget>1e100);assert.equal(result.diagnostics.saturationReason,'ABOVE_MAX_FEASIBLE');assert.ok(result.diagnostics.optimizerIterations<=100);assert.equal(result.enemies.length,10);
 assert.equal(result.enemies.filter(e=>e.star===3).length,0);assert.ok(normal.some(w=>w.budget.saturationReason==='ABOVE_MAX_FEASIBLE'));
 assert.throws(()=>rawEnemyBudget(100,Number.MAX_SAFE_INTEGER,1.04),/overflow/);
});
test('wave kind rules are centralized and explicitly configurable',()=>{
 assert.equal(classifyWave(1,3,3,c),'intro');assert.equal(classifyWave(2,3,5,c),'normal');assert.equal(classifyWave(2,4,5,c),'elite');assert.equal(classifyWave(2,5,5,c),'boss');
 const config=clone(c);config.classification.elite.enabled=false;config.classification.boss.enabled=false;assert.equal(classifyWave(2,5,5,config),'normal');
});
test('feasible intervals exactly account for the shared three-star quota and legal repeats',()=>{
 const pool=buildEnemyCandidates(10,'boss',inputs.units,model,c),bounds=feasibleEnemyBounds(pool,2);let lo=Infinity,hi=0;
 for(const a of pool.candidates)for(const b of pool.candidates)if((a.star===3)+(b.star===3)<=1){lo=Math.min(lo,a.power+b.power);hi=Math.max(hi,a.power+b.power);}
 assert.equal(bounds.min,lo);assert.equal(bounds.max,hi);assert.throws(()=>feasibleEnemyBounds(pool,11));
});
test('unreachable discrete target is reported with an exact small-population nearest certificate',()=>{
 const {g,b}=stub(6,'normal',75),r=g.generate(b,1,inputs.run.enemyProgression.cells),pool=g.pool(6,'normal');
 const nearest=pool.candidates.slice().sort((a,b)=>Math.abs(a.power-75)-Math.abs(b.power-75))[0].power;
 assert.equal(r.diagnostics.feasible,false);assert.equal(r.diagnostics.solution,'nearest-discrete');assert.equal(r.diagnostics.nearestAchievableBudget,nearest);assert.equal(r.diagnostics.actualBudget,nearest);
});
test('bounded optimizer reports a limit rather than asserting an unproved discrete impossibility',()=>{
 const config=clone(c);config.optimizer.maxIterations=1;config.optimizer.targetDeviation=1e-10;
 const g=new EnemyGenerator(config,power,inputs.units,new RunRandomContext(9)),{b}=stub(6,'normal',777.777,3),r=g.generate(b,3,inputs.run.enemyProgression.cells);
 assert.ok(r.diagnostics.optimizerIterations<=1);assert.equal(r.diagnostics.solution,'optimizer-limit');assert.equal(r.diagnostics.reason,'BOUNDED_OPTIMIZER_LIMIT');assert.equal(r.diagnostics.nearestAchievableBudget,undefined);
});
test('stable candidate sorting and generation ignore object-key and roster load order',()=>{
 const reverse=o=>Array.isArray(o)?o.map(reverse):o&&typeof o==='object'?Object.fromEntries(Object.entries(o).reverse().map(([k,v])=>[k,reverse(v)])):o;
 const reordered=buildRunWaves(10,reverse(inputs.run),reverse(inputs.waves),inputs.units.slice().reverse(),{mode:'budget-v1',runSeed:12345,difficulty:reverse(c),power:reverse(power)});
 assert.deepEqual(reordered,waves.filter(w=>w.stage<=10));
});
test('invalid candidates, models, policies and nonfinite targets fail loudly',()=>{
 const variants=[v=>v.costUnlock=[],v=>v.starPolicy.maxThreeStars.normal=1,v=>v.attributeAdjustment.enabled=true,v=>v.optimizer.maxIterations=Infinity,v=>v.growthRate=NaN];
 for(const change of variants){const v=clone(c);change(v);assert.throws(()=>validateEnemyDifficulty(v));}
 assert.throws(()=>buildEnemyCandidates(2,'normal',[],model,c));assert.throws(()=>build(3,1,{difficulty:{...c,calibrationHash:'wrong'}}),/mismatch/);
 const bad=clone(power);bad.units.warrior.points[1][''].power=NaN;assert.throws(()=>new EnemyGenerator(c,bad,inputs.units,new RunRandomContext(1)));
 const {g,b}=stub(6,'normal',100);b.effectiveBudget=NaN;assert.throws(()=>g.generate(b,1,inputs.run.enemyProgression.cells));
});
test('missing P1-B points retain low-confidence fallback diagnostics; team confidence stays qualified',()=>{
 const missing=clone(power);delete missing.units.warrior.points[2];const m=new EnemyPowerModel(missing),pool=buildEnemyCandidates(6,'normal',inputs.units,m,c),warrior=pool.candidates.find(u=>u.unitId==='warrior'&&u.star===2);
 assert.equal(warrior.confidence,'low');assert.ok(warrior.diagnostics.length);
 for(const w of normal){assert.equal(w.budget.estimatedBudgetConfidence,'low');assert.ok(w.budget.powerDiagnostics.some(s=>s.includes('composition effects')));for(const e of w.enemies)if(model.estimateUnitPower(e).confidence==='low')assert.ok(w.budget.lowConfidenceUnits.includes(e.unitId+'*'+e.star));}
});
test('new games default budget-v1, missing old save fields pin to legacy and saved modes cannot be replaced',()=>{
 assert.equal(freshSaveV2().enemyGenerationVersion,'budget-v1');assert.equal(migrateSaveV2({runSeed:12345}).enemyGenerationVersion,'legacy');
 assert.equal(session().save.enemyGenerationVersion,'budget-v1');const old=migrateSaveV2({runSeed:12345});assert.equal(session({save:old}).save.enemyGenerationVersion,'legacy');
 assert.throws(()=>session({save:old,enemyGenerationMode:'budget-v1'}),/Cannot replace/);
 assert.throws(()=>session({save:{...old,enemyGenerationVersion:'future'}}),/Unsupported/);
});
test('saved model/version/hash/config mismatches are refused before future waves can drift',()=>{
 const s=session(),save=s.snapshot();for(const key of ['powerModelVersion','powerModelCalibrationHash','difficultyConfigVersion'])assert.throws(()=>session({save:{...save,[key]:'future'}}),/mismatch/);
 const changed=clone(c);changed.optimizer.topK=2;assert.throws(()=>session({save,enemyDifficulty:changed}),/configuration mismatch/);
});
test('budget save/load and debug extension retain all enemies, IDs, shops and isolated future combat seeds',()=>{
 const a=session({stageCount:3});a.debugJump(6,1);const save=a.snapshot(),b=session({save});assert.deepEqual(a.waves,b.waves);assert.deepEqual(save,b.snapshot());assert.deepEqual(a.shop.snapshot(),b.shop.snapshot());assert.equal(a.battleSeed,b.battleSeed);
 a.moveUnit(1,{location:'board',x:3,y:3});b.moveUnit(1,{location:'board',x:3,y:3});assert.deepEqual(a.startBattle().run(),b.startBattle().run());assert.deepEqual(a.settleBattle(),b.settleBattle());
});
test('run-sim exports the generator diagnostics and explicit modes without granting bot resources',()=>{
 const report=runSimulation(require('../tools/run-simulation.ts').loadRunInputs(),{runSeed:12345,stageCount:3});assert.notEqual(report.result,'SIMULATION_ERROR',report.error);assert.equal(report.enemyGenerationMode,'budget-v1');
 const row=report.waves.find(w=>w.stage===2&&w.enemyBudget);assert.ok(row);assert.equal(row.actualBudget,row.enemyBudget.actualBudget);assert.equal(row.budgetWaveIndex,row.waveId-3);assert.equal(report.waves[0].enemyBudget,null);assert.equal(row.statMultiplier,1);
 assert.ok(report.waves.filter(w=>w.encounterKind==='monster').every(w=>w.enemyBudget===null),'monster encounters use their independent template, not a generated player-unit budget');
});
test('archived experiment configurations remain unchanged',()=>{
 assert.deepEqual(loadRunInputs(),inputs);assert.deepEqual(require('../docs/p1-enemy-difficulty/power-calibration/final-500/enemy-power.json'),power);
});
console.log(`Enemy budget: ${passed} passed, 0 failed`);
