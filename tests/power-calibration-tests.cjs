require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const {buildCalibrationCases,singlePositions}=require('../tools/power-calibration/fixtures.ts');
const {provenance,sampleCase,sampleCacheKey,simulateSample,placementsFor}=require('../tools/power-calibration/sampling.ts');
const {aggregateCase,fitRatings,fitPowerModel}=require('../tools/power-calibration/fitting.ts');
const root=path.resolve(__dirname,'..'),inputs=loadRunInputs(),cfg=new ConfigManager();
cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
const prov=provenance(inputs,root),cases=buildCalibrationCases(inputs.units,inputs.equipment.map(e=>e.id));
const tempRoot=path.join(root,'temp');fs.mkdirSync(tempRoot,{recursive:true});const cache=fs.mkdtempSync(path.join(tempRoot,'power-calibration-test-'));
let passed=0;function test(name,fn){fn();passed++;console.log('PASS '+name);}
try{
 test('bounded plan contains exact matrix counts and all fixture cells are legal odd-r half-boards',()=>{
  const {archivedInputs}=require('./advanced-equipment-compatibility.cjs');
  const original=buildCalibrationCases(archivedInputs.units,archivedInputs.equipment.map(item=>item.id));
  assert.equal(original.length,971,'the published four-item experiment retains its original matrix');
  const counts=Object.fromEntries(['mirror','unit','star','single','combo','team'].map(k=>[k,cases.filter(c=>c.category===k).length]));
  assert.equal(cases.length,1533);
  assert.deepEqual(counts,{mirror:368,unit:240,star:48,single:480,combo:320,team:77});
  for(const unit of inputs.units)for(const item of inputs.equipment)for(const star of [1,2,3]) {
   assert.ok(cases.some(c=>c.category==='single'&&c.b[0].unitId===unit.id&&c.b[0].star===star&&c.b[0].equipment[0]===item.id));
  }
  for(const c of cases)for(let e=0;e<3;e++)for(const flip of [false,true])for(const reverse of [false,true])assert.ok(placementsFor(cfg,c,e,flip,reverse).placements.length>0);
 });
 test('real sampling, seed partitions and clustered summaries are deterministic',()=>{
  const c=cases.find(c=>c.category==='star'),a=sampleCase(cfg,c,prov,1,20),b=sampleCase(cfg,c,prov,1,20);
  assert.deepEqual(a.data,b.data);assert.equal(a.actual,80);const summary=aggregateCase(a.data,16);
  assert.equal(summary.train.samples,64);assert.equal(summary.validation.samples,16);
  const train=new Set(a.data.blocks.slice(0,16).map(b=>b.seed));assert.ok(a.data.blocks.slice(16).every(b=>!train.has(b.seed)));
  assert.ok(summary.trainEnvironments.every(s=>s.samples>0));assert.ok(summary.validationEnvironments.every(s=>s.samples>0));
  const mirror=cases[0];for(let seed=1;seed<=10;seed++){
   const outcomes=[];for(const flip of [false,true])for(const reverse of [false,true])outcomes.push(simulateSample(cfg,mirror,seed,0,flip,reverse).outcome);
   assert.equal(outcomes.reduce((s,n)=>s+n,0)/4,.5);
  }
 });
 test('cache keys include source/config/version, unit/star/equipment, positions, orientations and seed range',()=>{
  const c=cases.find(c=>c.category==='single'),key=sampleCacheKey(prov,c,1,20);
  for(const changed of [{...prov,sourceHash:'changed'},{...prov,configHash:'changed'},{...prov,version:'changed'}])assert.notEqual(sampleCacheKey(changed,c,1,20),key);
  for(const a of [[{...c.a[0],unitId:'archer'}],[{...c.a[0],star:3}],[{...c.a[0],equipment:['totem_of_undying']}]] )assert.notEqual(sampleCacheKey(prov,{...c,a},1,20),key);
  assert.notEqual(sampleCacheKey(prov,c,2,20),key);assert.notEqual(sampleCacheKey(prov,c,1,21),key);
  const x=singlePositions[0][0].x;try{singlePositions[0][0].x=2;assert.notEqual(sampleCacheKey(prov,c,1,20),key);}finally{singlePositions[0][0].x=x;}
 });
 test('cache replay preserves data, config changes miss cache and corrupt cache is recomputed',()=>{
  const c=cases.find(c=>c.category==='single');const a=sampleCase(cfg,c,prov,1,20,cache),b=sampleCase(cfg,c,prov,1,20,cache);
  assert.equal(a.actual,80);assert.equal(b.actual,0);assert.equal(b.cached,80);assert.deepEqual(a.data,b.data);
  const changed=sampleCase(cfg,c,{...prov,configHash:'new config'},1,20,cache);assert.equal(changed.actual,80);assert.equal(changed.cached,0);
  const file=path.join(cache,sampleCacheKey(prov,c,1,20)+'.json.gz');fs.writeFileSync(file,'corrupt');
  const repaired=sampleCase(cfg,c,prov,1,20,cache);assert.equal(repaired.actual,80);assert.equal(repaired.corruptions,1);assert.deepEqual(repaired.data,a.data);
 });
 test('relative-value fitting is bounded, deterministic and rejects disconnected/nonfinite input',()=>{
  const edges=[{a:0,b:1,target:-Math.log(2),weight:1},{a:1,b:2,target:-Math.log(3),weight:1},{a:0,b:2,target:-Math.log(6),weight:1}];
  const a=fitRatings(3,edges),b=fitRatings(3,edges);assert.deepEqual(a,b);assert.ok(a.converged);assert.ok(a.rmse<.01);
  assert.ok(fitRatings(3,edges,1).iterations<=1);assert.throws(()=>fitRatings(3,[{a:0,b:1,target:0,weight:1}]),/Disconnected/);
  assert.throws(()=>fitRatings(2,[{a:0,b:1,target:NaN,weight:1}]));assert.throws(()=>fitRatings(2,[]));
 });
 test('validation seed data cannot influence fitted powers or training win-probability slope',()=>{
  const file=path.join(root,'docs/p1-enemy-difficulty/power-calibration/smoke-20/observations.json');
  const records=JSON.parse(fs.readFileSync(file,'utf8')),changed=JSON.parse(JSON.stringify(records));
  for(const row of changed){row.validation.score=1-row.validation.score;row.validation.target+=100;for(const s of row.validationEnvironments){s.score=1-s.score;s.target+=100;}}
  // The archived observations measured only the original four items, so fit those exact inputs.
  const {archivedInputs}=require('./advanced-equipment-compatibility.cjs');
  const a=fitPowerModel(records,archivedInputs,prov),b=fitPowerModel(changed,archivedInputs,prov);
  assert.deepEqual(a.model.units,b.model.units);assert.deepEqual(a.model.costBaseline,b.model.costBaseline);assert.equal(a.model.winProbabilitySlope,b.model.winProbabilitySlope);
 });
 console.log(`Power calibration: ${passed} passed, 0 failed`);
}finally{
 const real=fs.realpathSync(cache),parent=fs.realpathSync(tempRoot);
 if(path.dirname(real)!==parent||!path.basename(real).startsWith('power-calibration-test-'))throw new Error('Unsafe test cache cleanup');
 fs.rmSync(real,{recursive:true,force:true});
}
