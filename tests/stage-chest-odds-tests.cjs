require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {StageProgression,freshStageProgress,chestUnitValue,explorerLootStarRates,explorerLootQualityRates}=require('../assets/scripts/core/StageProgression.ts');
const {equipmentQuality}=require('../assets/scripts/core/EquipmentQuality.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs(),deps=t.loadEquipmentInputs();
const clone=x=>structuredClone(x),sources=['monster','elite','boss'];
const expected={monster:{qualityRates:[60,25,10,4,1],starRates:[95,5,0]},elite:{qualityRates:[25,35,25,12,3],starRates:[80,18,2]},boss:{qualityRates:[10,20,30,25,15],starRates:[60,30,10]}};
assert.deepEqual(input.run.stageEncounters.chestReward.encounterLoot,expected);
assert.equal(chestUnitValue(1,2),6);assert.equal(chestUnitValue(5,3),135);assert.equal(chestUnitValue(7,2),42);
for(const star of [0,4,1.5,NaN])assert.throws(()=>chestUnitValue(1,star),/star/);
function make({seed=1,rules=clone(input.run.stageEncounters),units=input.units,equipment=input.equipment,level=1,owned=new OwnedUnits(),emptyPool=false,tiers=deps.equipmentPolicy.tiers}={}){
 const cfg=new ConfigManager();cfg.setUnits(units);cfg.setEquipment(equipment);
 const pool=new CardPool(units);if(emptyPool)for(const u of units)while(pool.take(u.id)){}
 const economy=new EconomySystem(),state=freshStageProgress();
 const progress=new StageProgression(rules,state,cfg,pool,owned,economy,new RunRandomContext(seed),9,tiers,()=>level);
 return {cfg,pool,owned,economy,state,progress};
}
function claim(s,source,budget,capacity=0){
 const wave={id:31,stage:28,round:source==='boss'?10:2,encounterKind:source,enemies:[]};
 s.progress.settle(wave,0);assert.equal(s.state.pending.source,source);
 // Custom budgets below exercise the production claim entry point without changing the stage curve.
 s.state.pending.value=budget;
 const result=s.progress.act({type:'stageChoice',choice:'claim',rewardId:s.state.pending.id},wave,capacity);
 assert.equal(result.ok,true);assert.equal(s.state.pending,undefined);return result.stageReward;
}
const value=(s,g)=>g.units.reduce((n,u)=>n+s.cfg.getUnit(u.unitId).cost*3**(u.star-1)*u.star,0)
 +g.equipmentIds.reduce((n,id)=>n+s.cfg.equipmentPrice(id,input.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]),0)+g.health*2+g.gold;
const copies=(owned,id)=>owned.all().filter(u=>u.unitId===id).reduce((n,u)=>n+3**(u.star-1),0);
for(const source of sources)for(const budget of [1,2,3,6,10,15,27,30])for(let seed=1;seed<=24;seed++){
 const a=make({seed,level:1}),b=make({seed,level:10}),before=a.pool.snapshot(),grant=claim(a,source,budget,8);
 assert.deepEqual(grant,claim(b,source,budget,8),'stage odds do not depend on shop level');
 assert.equal(value(a,grant),budget);assert.ok(grant.health<=8);assert.equal(a.economy.gold,grant.gold);
 for(const u of input.units)assert.equal(before[u.id]-a.pool.count(u.id),copies(a.owned,u.id),'ranked unit deducts equivalent physical copies');
 assert.ok(a.owned.inBench().every(u=>u.y>=0&&u.y<9));
}
console.log('PASS stage claim routing, level-independent rolls, exact budgets, stock/ownership conservation and legal delivery');

// Isolate quality odds using equal-price items, unequal item counts, no units and no healing.
const items=[...Array.from({length:5},(_,q)=>({...input.equipment[0],id:`odds_${q+1}`,quality:q+1,shopPrice:1,chestDrop:true})),
 {...input.equipment[0],id:'odds_extra_white',quality:1,shopPrice:1,chestDrop:true}];
const fixtureRules=clone(input.run.stageEncounters);fixtureRules.basicEquipmentIds=items.map(e=>e.id);
const fixtureTiers=Object.fromEntries(items.map(e=>[e.id,'basic']));
for(const source of sources){
 const totals=[0,0,0,0,0];
 for(let seed=1;seed<=1200;seed++){
  const s=make({seed,rules:fixtureRules,equipment:items,tiers:fixtureTiers,emptyPool:true});
  for(const id of claim(s,source,5).equipmentIds)totals[equipmentQuality(s.cfg.getEquipment([id])[0])-1]++;
 }
 for(let q=0;q<5;q++)assert.ok(Math.abs(totals[q]/60-expected[source].qualityRates[q])<2,`${source} actual quality ${q+1}: ${totals}`);
}
console.log('PASS real equipment draws follow each fixed quality table, independent of catalogue item counts');

// All fee/star combinations fit on the first draw; later budget filtering cannot bias this sample.
const sampleUnits=Array.from({length:5},(_,index)=>({...input.units.find(u=>u.cost===index+1&&!u.specialShopUnlock),id:`odds_unit_${index+1}`}));
const costlyItems=items.map(e=>({...e,shopPrice:10000}));
for(const source of sources){
 const stars=[0,0,0],qualities=[0,0,0,0,0];
 for(let seed=1;seed<=2000;seed++){
  const s=make({seed,rules:fixtureRules,units:sampleUnits,equipment:costlyItems,tiers:fixtureTiers});
  const first=claim(s,source,135).units[0];assert.ok(first);stars[first.star-1]++;qualities[s.cfg.getUnit(first.unitId).cost-1]++;
 }
 for(let star=0;star<3;star++)assert.ok(Math.abs(stars[star]/20-expected[source].starRates[star])<2,`${source} actual stars: ${stars}`);
 for(let q=0;q<5;q++)assert.ok(Math.abs(qualities[q]/20-expected[source].qualityRates[q])<3,`${source} unit quality: ${qualities}`);
}
console.log('PASS real unit draws follow independent star/fee tables when all combinations are affordable');

const explorerRules=clone(fixtureRules);delete explorerRules.chestReward.explorerGoldThreshold;
assert.deepEqual(explorerLootStarRates(0,explorerRules.chestReward),[95,5,0]);
assert.deepEqual(explorerLootStarRates(500,explorerRules.chestReward),[62.5,22.5,15]);
assert.deepEqual(explorerLootStarRates(1000,explorerRules.chestReward),[30,40,30]);
let previous=explorerLootStarRates(0,explorerRules.chestReward);
for(let points=1;points<=1100;points++){
 const rates=explorerLootStarRates(points,explorerRules.chestReward);assert.ok(Math.abs(rates.reduce((a,b)=>a+b,0)-100)<1e-8);
 assert.ok(rates[0]<=previous[0]&&rates[1]>=previous[1]&&rates[2]>=previous[2]);previous=rates;
}
for(const points of [0,500,1000,2000]){
 const totals=[0,0,0],fees=[0,0,0,0,0];
 for(let seed=1;seed<=1500;seed++){
  const s=make({seed,rules:explorerRules,units:sampleUnits,equipment:costlyItems,tiers:fixtureTiers});
  const grant=s.progress.grantExplorerReward(135,31,0,points),first=grant.units[0];assert.ok(first);
  totals[first.star-1]++;fees[s.cfg.getUnit(first.unitId).cost-1]++;
  const value=grant.units.reduce((sum,u)=>sum+s.cfg.getUnit(u.unitId).cost*3**(u.star-1)*u.star,0)+grant.gold;
  assert.equal(value,135);for(const u of sampleUnits)assert.equal(s.pool.count(u.id)+copies(s.owned,u.id),u.cost===1?30:u.cost===2?25:u.cost===3?18:u.cost===4?10:9);
 }
 const expectedStars=explorerLootStarRates(points,explorerRules.chestReward),expectedFees=explorerLootQualityRates(points,explorerRules.chestReward);
 for(let star=0;star<3;star++)assert.ok(Math.abs(totals[star]/15-expectedStars[star])<2.5,`explorer ${points} layers, stars: ${totals}`);
 for(let fee=0;fee<5;fee++)assert.ok(Math.abs(fees[fee]/15-expectedFees[fee])<3,`explorer ${points} layers, qualities: ${fees}`);
}
console.log('PASS explorer star/quality curves, monotone 1000-layer cap, real high-star grants and exact value/pool accounting');

function forced(star,cost=1,owned=new OwnedUnits()){
 const rules=clone(fixtureRules);rules.chestReward.encounterLoot.boss={qualityRates:[0,0,0,0,0],starRates:[0,0,0]};
 rules.chestReward.encounterLoot.boss.qualityRates[cost-1]=100;rules.chestReward.encounterLoot.boss.starRates[star-1]=100;
 return make({rules,units:[sampleUnits[cost-1]],equipment:costlyItems,tiers:fixtureTiers,owned});
}
for(const [star,cost,budget] of [[2,1,6],[3,5,135]]){
 const s=forced(star,cost),id=sampleUnits[cost-1].id,before=s.pool.count(id),g=claim(s,'boss',budget);
 assert.deepEqual(g.units,[{unitId:id,star}]);assert.equal(g.gold,0);assert.equal(s.owned.all()[0].star,star);assert.equal(s.pool.count(id),before-3**(star-1));
 const poor=forced(star,cost);assert.deepEqual(claim(poor,'boss',budget-1).units,[]);assert.equal(poor.owned.all().length,0);
 const scarce=forced(star,cost);while(scarce.pool.count(id)>=3**(star-1))scarce.pool.take(id);
 assert.deepEqual(claim(scarce,'boss',budget).units,[]);assert.equal(scarce.owned.all().length,0);
}
const id=sampleUnits[0].id,full=new OwnedUnits(Array.from({length:9},(_,i)=>({uid:i+1,unitId:i<2?id:`filler_${i}`,star:i<2?2:3,location:'bench',x:-1,y:i})),10);
const merging=forced(2,1,full);for(let n=0;n<6;n++)merging.pool.take(id);
assert.deepEqual(claim(merging,'boss',6).units,[{unitId:id,star:2}]);assert.equal(merging.owned.get(1).star,3);assert.equal(merging.owned.inBench().length,8);
const blocked=forced(3,1,new OwnedUnits(Array.from({length:9},(_,i)=>({uid:i+1,unitId:`filler_${i}`,star:3,location:'bench',x:-1,y:i})),10));
const blockedPool=blocked.pool.snapshot(),blockedOwned=blocked.owned.snapshot(),fallback=claim(blocked,'boss',27);
assert.deepEqual(fallback.units,[]);assert.equal(fallback.gold,27);assert.deepEqual(blocked.pool.snapshot(),blockedPool);assert.deepEqual(blocked.owned.snapshot(),blockedOwned);
console.log('PASS direct 2/3-star grants, 6/135 valuation, insufficient budget/stock, full-bench ranked merge and safe gold fallback');

for(const mutate of [r=>delete r.chestReward.encounterLoot,r=>r.chestReward.encounterLoot.boss.starRates=[60,30],
 r=>r.chestReward.encounterLoot.monster.qualityRates[0]=-1,r=>r.chestReward.encounterLoot.elite.starRates=[80,18,3]]){
 const rules=clone(input.run.stageEncounters);mutate(rules);assert.throws(()=>make({rules}),/stage chest odds/);
}
for(const mutate of [r=>delete r.chestReward.explorerStars,r=>r.chestReward.explorerStars.maxSteps=0,
 r=>r.chestReward.explorerStars.maxRates=[100,0,0],r=>r.chestReward.explorerStars.initialRates=[100,0]]){
 const rules=clone(input.run.stageEncounters);mutate(rules);assert.throws(()=>make({rules}),/explorer star odds|quality growth/);
}
const locked=make();assert.equal(locked.pool.canDraw('star_ring_sage'),false);
const badAction=locked.progress.act({type:'stageChoice',choice:'claim',rewardId:'stale'},{});assert.equal(badAction.ok,false);
console.log('PASS malformed fixed odds rejected and existing shop-exclusive card locks retained');
