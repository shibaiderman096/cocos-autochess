require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {EnemyPowerModel}=require('../assets/scripts/core/EnemyPowerModel.ts');
const {analyzeModel}=require('../tools/power-calibration/report.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const root=path.resolve(__dirname,'..');
// Measured-point assertions use the immutable model paired with the published roster.
const modelFile=path.join(root,'docs/p1-enemy-difficulty/power-calibration/final-500/enemy-power.json');
const data=JSON.parse(fs.readFileSync(fs.existsSync(modelFile)?modelFile:path.join(root,'docs/p1-enemy-difficulty/power-calibration/smoke-20/enemy-power.json'),'utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('runtime model returns measured unit/star/equipment points and explicit tactical environments',()=>{
 const model=new EnemyPowerModel(data,{configHash:data.configHash,sourceHash:data.sourceHash,version:data.version});
 for(const [unitId,u]of Object.entries(data.units))for(const [star,points]of Object.entries(u.points))for(const [equipment,p]of Object.entries(points)){
  const request={unitId,star:Number(star),equipment:equipment?equipment.split('+'):[]};
  assert.equal(model.estimateUnitPower(request).power,p.power);assert.equal(model.estimateUnitPower(request).method,'measured');
  for(const environment of ['close','medium','far']){
   const estimate=model.estimateUnitPower({...request,environment});assert.equal(estimate.power,p.environments[environment]);
   assert.ok(p.environmentConfidence?.[environment]);assert.equal(estimate.sampleCount,p.environmentConfidence[environment].sampleCount);
   assert.ok(p.environmentConfidence[environment].independentSeeds<p.confidence.independentSeeds);
  }
 }
});
test('derived values and legacy environment metadata never claim unsupported confidence',()=>{
 assert.ok(data.derivedConfidence?.costBaseline[5].sampleCount>0);assert.equal(data.derivedConfidence.costBaseline[5].reliability,'low');
 for(const star of [1,2,3])assert.ok(data.derivedConfidence.globalStarFactors[star].sampleCount>0);
 const old=clone(data);delete old.units.warrior.points[1][''].environmentConfidence;
 const estimate=new EnemyPowerModel(old).estimateUnitPower({unitId:'warrior',star:1,environment:'close'});
 assert.equal(estimate.sampleCount,0);assert.equal(estimate.confidence,'low');assert.match(estimate.diagnostics.join(' '),/metadata missing/);
});
test('model does not mutate inputs or expose a mutable model through queries',()=>{
 const original=clone(data),local=clone(data),m=new EnemyPowerModel(local),id=Object.keys(data.units)[0];
 const expected=m.estimateUnitPower({unitId:id,star:1}).power;
 local.units[id].points[1][''].power=999999;assert.equal(m.estimateUnitPower({unitId:id,star:1}).power,expected);
 const estimate=m.estimateUnitPower({unitId:id,star:1});estimate.diagnostics.push('mutated');assert.ok(!m.estimateUnitPower({unitId:id,star:1}).diagnostics.includes('mutated'));
 assert.deepEqual(data,original);
});
test('missing unit/star/equipment and unmeasured combinations are explicit positive low-confidence fallbacks',()=>{
 const m=new EnemyPowerModel(data),id=Object.keys(data.units)[0];
 assert.throws(()=>m.estimateUnitPower({unitId:'missing',star:1}),/explicit valid cost/);
 const unknown=m.estimateUnitPower({unitId:'missing',star:2,cost:2});assert.ok(unknown.power>0);assert.equal(unknown.confidence,'low');assert.ok(unknown.diagnostics.length);
 const gear=m.estimateUnitPower({unitId:id,star:1,equipment:['unknown-equipment']});assert.ok(gear.power>0);assert.equal(gear.confidence,'low');assert.match(gear.diagnostics.join(' '),/missing/);
 const triple=m.estimateUnitPower({unitId:id,star:3,equipment:['guinsoo','guinsoo','totem_of_undying']});assert.equal(triple.method,'additive-fallback');assert.equal(triple.confidence,'low');assert.ok(triple.diagnostics.some(x=>x.includes('combination')));
 const absent=clone(data);delete absent.units[id].points[2];delete absent.units[id].starFactors[2];
 const fallback=new EnemyPowerModel(absent).estimateUnitPower({unitId:id,star:2});assert.ok(fallback.power>0);assert.equal(fallback.confidence,'low');assert.match(fallback.diagnostics.join(' '),/star calibration missing/);
});
test('model rejects malformed requests, source mismatches and invalid model points',()=>{
 const m=new EnemyPowerModel(data),id=Object.keys(data.units)[0];
 for(const request of [{unitId:id,star:0},{unitId:id,star:4},{unitId:id,star:NaN},{unitId:id,star:1,equipment:Array(4).fill('guinsoo')},{unitId:id,star:1,equipment:['x+y']},{unitId:id,star:1,environment:'square'}])assert.throws(()=>m.estimateUnitPower(request));
 assert.throws(()=>new EnemyPowerModel(data,{configHash:'changed'}),/mismatch/);
 const invalid=clone(data);invalid.units[id].points[1][''].power=0;assert.throws(()=>new EnemyPowerModel(invalid));
 assert.throws(()=>m.winProbability(0,100));assert.throws(()=>m.estimateTeamPower([]));assert.throws(()=>m.estimateTeamPower(Array(11).fill({unitId:id,star:1})));
});
test('team estimates sum real calibrated points, propagate fallback confidence, and predict complementary scores',()=>{
 const m=new EnemyPowerModel(data),units=[{unitId:'warrior',star:2},{unitId:'mage',star:2,equipment:['guinsoo']}];
 const p=m.estimateTeamPower(units);assert.equal(p.power,units.reduce((s,u)=>s+m.estimateUnitPower(u).power,0));
 assert.equal(m.winProbability(p.power,p.power),.5);assert.ok(Math.abs(m.winProbability(100,200)+m.winProbability(200,100)-1)<1e-12);
 const fallback=m.estimateTeamPower([...units,{unitId:'missing',cost:1,star:1}]);assert.equal(fallback.confidence,'low');assert.ok(fallback.diagnostics.length);
});
test('star and equipment diagnostics expose non-monotonic evidence instead of forcing positive gains',()=>{
 const fixture=clone(data);fixture.units.warrior.points[2][''].power=fixture.units.warrior.points[1][''].power*.9;
 fixture.units.warrior.points[1].guinsoo.power=fixture.units.warrior.points[1][''].power*.8;
 const analysis=analyzeModel(fixture,[],require('./historical-inputs.cjs').archivedInputs);
 assert.ok(analysis.starMonotonicViolations.some(r=>r.unitId==='warrior'));
 assert.ok(analysis.negativeEquipment.some(r=>r.unitId==='warrior'&&r.star===1&&r.equipment==='guinsoo'));
 const m=new EnemyPowerModel(fixture);assert.ok(m.estimateUnitPower({unitId:'warrior',star:1,equipment:['guinsoo']}).power<m.estimateUnitPower({unitId:'warrior',star:1}).power);
});
test('P0 archived waves remain reproducible and retained P1-B evidence remains byte-identical',()=>{
 const {buildRunWaves}=require('../assets/scripts/core/RunSetup.ts'),inputs=require('./historical-inputs.cjs').archivedInputs;
 assert.deepEqual(buildRunWaves(99,inputs.run,inputs.waves,inputs.units),require('../docs/p0-enemy-difficulty/baseline/waves-before.json'));
 require('./archive-evidence.cjs').assertArchivedEvidence(require('../docs/p1-enemy-difficulty/power-calibration/protected-before.json'));
});
console.log(`EnemyPowerModel: ${passed} passed, 0 failed`);
