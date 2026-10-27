require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {StageProgression,freshStageProgress,stageShopQualityRates,explorerLootQualityRates}=require('../assets/scripts/core/StageProgression.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {equipmentQuality}=require('../assets/scripts/core/EquipmentQuality.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs();
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const rules=input.run.stageEncounters,clone=x=>structuredClone(x);
const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);
for(const [limit,fn]of [[20,n=>stageShopQualityRates(n,rules.shop)],[1000,n=>explorerLootQualityRates(n,rules.chestReward)]]){
 let prior=fn(0);
 for(let step=1;step<=limit;step++){
  const rates=fn(step);assert.ok(Math.abs(rates.reduce((a,b)=>a+b,0)-100)<1e-8);
  assert.ok(rates.every(rate=>Number.isFinite(rate)&&rate>=0));
  for(let tier=2;tier<5;tier++)assert.ok(rates[tier]>=prior[tier],`high tier ${tier+1} declines at ${step}`);
  assert.ok(rates[0]<=prior[0]);prior=rates;
 }
 assert.deepEqual(fn(limit+1000),fn(limit),'probability caps without capping actual layer count');
}
assert.deepEqual(stageShopQualityRates(0,rules.shop),[35,30,20,10,5]);
assert.deepEqual(stageShopQualityRates(1,rules.shop),[33.5,29.5,20.5,10.75,5.75]);
assert.deepEqual(explorerLootQualityRates(1000,rules.chestReward),[5,10,20,30,35]);
function session(run=input.run,save){return new RunSession(cfg,run,input.waves,{...deps,stageCount:6,runSeed:217,enemyGenerationMode:'budget-v1',...(save?{save}:{})});}
const wave={id:17,stage:4,round:3,encounterKind:'specialShop',enemies:[]};
const counts=[[0,0,0,0,0],[0,0,0,0,0]];
for(let seed=1;seed<=1000;seed++){
 const state=freshStageProgress(),economy=new EconomySystem();economy.gold=10000;
 const p=new StageProgression(rules,state,cfg,new CardPool(input.units),new OwnedUnits(),economy,new RunRandomContext(seed),9,deps.equipmentPolicy.tiers);
 p.enter(wave);
 for(let refresh=0;refresh<=20;refresh++){
  if(refresh===0||refresh===20)for(const offer of state.pending.offers){
   const quality=offer.kind==='unit'?cfg.getUnit(offer.id).cost:equipmentQuality(cfg.getEquipment([offer.id])[0]);counts[refresh===0?0:1][quality-1]++;
  }
  if(refresh<20)assert.ok(p.act({type:'stageChoice',rewardId:state.pending.id,choice:'refresh'},wave).ok);
 }
}
for(let row=0;row<2;row++)for(let q=0;q<5;q++)assert.ok(Math.abs(counts[row][q]/50-stageShopQualityRates(row*20,rules.shop)[q])<2.5,'real merchant draws follow growing odds');
const s=session();if(s.pendingOpeningEncounter)s.chooseOpeningEncounter('inspiration');const sw=s.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');s.debugJump(4,sw.round);s.economy.gold=1000;
for(let n=0;n<3;n++)assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'refresh'}).ok);
const save=s.snapshot(),restored=session(input.run,save);assert.deepEqual(restored.pendingStageReward,s.pendingStageReward);
for(const run of [s,restored])assert.ok(run.claimStageReward({type:'stageChoice',rewardId:run.pendingStageReward.id,choice:'refresh'}).ok);
assert.deepEqual(restored.pendingStageReward,s.pendingStageReward,'reload preserves refresh count and next seeded roll');
assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'continue'}).ok);
const next=s.waves.find(w=>w.stage===5&&w.encounterKind==='specialShop');assert.ok(s.debugJump(5,next.round));assert.equal(s.pendingStageReward.refreshes,0);
// Actual explorer equipment draws: equal prices isolate quality weighting from affordability.
const items=Array.from({length:5},(_,q)=>({...input.equipment[0],id:`test_quality_${q+1}`,quality:q+1,shopPrice:1,chestDrop:true}));
const lootCfg=new ConfigManager();lootCfg.setUnits(input.units);lootCfg.setEquipment(items);
const lootRules=clone(rules);delete lootRules.chestReward.explorerGoldThreshold;lootRules.basicEquipmentIds=items.map(i=>i.id);
const tiers=Object.fromEntries(items.map(i=>[i.id,'basic']));
for(const points of [0,500,1000,2000]){
 const totals=[0,0,0,0,0];
 for(let seed=1;seed<=300;seed++){
  const pool=new CardPool(input.units);for(const unit of input.units)while(pool.take(unit.id)){}
  const p=new StageProgression(lootRules,freshStageProgress(),lootCfg,pool,new OwnedUnits(),new EconomySystem(),new RunRandomContext(seed),9,tiers);
  const reward=p.grantExplorerReward(30,17,0,points);assert.equal(reward.gold,0);assert.equal(reward.equipmentIds.length,30);
  for(const id of reward.equipmentIds)totals[equipmentQuality(lootCfg.getEquipment([id])[0])-1]++;
 }
 const expected=explorerLootQualityRates(points,lootRules.chestReward);
 for(let q=0;q<5;q++)assert.ok(Math.abs(totals[q]/90-expected[q])<2,'actual explorer loot follows layer odds');
}
const oldRun=clone(input.run);delete oldRun.stageEncounters.shop.refreshQuality;delete oldRun.stageEncounters.chestReward.explorerQuality;
const old=session(oldRun).snapshot(),adopted=session(input.run,old);assert.equal(adopted.economy.gold,old.gold);assert.deepEqual(adopted.owned.snapshot(),old.owned);
for(const invalid of [0,-1,.5]){const bad=clone(input.run);bad.stageEncounters.shop.refreshQuality.maxSteps=invalid;assert.throws(()=>session(bad),/quality growth/);}
console.log('PASS loot quality growth: monotone curves, exact totals, 1000-layer cap, real merchant/explorer draw distributions, deterministic reload, per-shop reset and old-save adoption');
