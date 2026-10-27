require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {stageShopRefreshPrice}=require('../assets/scripts/core/StageProgression.ts');
const {COST_PRICE,validCost}=require('../assets/scripts/core/ShopConfig.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const i=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()},clone=x=>JSON.parse(JSON.stringify(x));
function make(seed=17,save,mode='legacy',run=i.run){const cfg=new ConfigManager();cfg.setUnits(i.units);cfg.setSkills(i.skills);cfg.setBattle(i.battle);cfg.setEquipment(i.equipment);
 return new RunSession(cfg,run,i.waves,{...deps,stageCount:6,runSeed:seed,enemyGenerationMode:mode,...(save?{save}:{})});}
function win(s,kind='boss',stage=4){const wave=s.waves.find(w=>w.stage===stage&&w.encounterKind===kind);assert.ok(s.debugJump(stage,wave.round));if(!s.owned.onBoard().length)assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);const sim=s.startBattle();sim.end(0);assert.ok(s.settleBattle());return wave;}
const claim=s=>s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'claim'});
const price=(s,id)=>s.cfg.equipmentPrice(id,i.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]);
const value=(s,g)=>g.units.reduce((n,id)=>n+COST_PRICE[validCost(s.cfg.getUnit(id).cost)],0)+g.equipmentIds.reduce((n,id)=>n+price(s,id),0)+g.health*2+g.gold;
const cleared=s=>{assert.equal(s.save.stageProgress.unitCredit,0);assert.equal(s.save.stageProgress.equipmentCredit,0);assert.deepEqual(s.save.stageProgress.unitReserve,[]);assert.equal(s.pendingStageReward,undefined);};
const budgets=make().stageProgression;
for(const [stage,total,elite] of [[1,3,2],[2,4,2],[3,5,3],[4,6,3],[5,7,4],[27,29,15],[28,30,15],[29,30,15],[99,30,15]]){
 assert.equal(budgets.value(stage),total);assert.equal(budgets.chestValue({stage,encounterKind:'elite'}),elite);
}
console.log('PASS chest curve: 3/4/5/6 onward, cap 30 from stage 28, elite half rounds upward');
const seen=new Set();let combinations=0;
for(const mode of ['legacy','budget-v1'])for(let seed=1;seed<=16;seed++){
 let s=make(seed,undefined,mode);const damaged=s.snapshot();damaged.round.health=seed%3===0?99:60;s=make(seed,damaged,mode);win(s);
 assert.equal(s.pendingStageReward.kind,'mixedChest');assert.equal(s.pendingStageReward.value,6);assert.equal(s.canAdvanceWave(),false);
 const saved=s.snapshot(),restored=make(seed,saved,mode),oldHP=s.flow.health,oldGold=s.economy.gold,oldGear=s.owned.equipmentReserve.length;
 const result=claim(s);assert.equal(result.ok,true);const g=result.stageReward;assert.equal(g.kind,'mixed');assert.equal(value(s,g),g.value);assert.equal(g.value,6);
 assert.equal(s.flow.health-oldHP,g.health);assert.ok(s.flow.health<=100);assert.equal(s.economy.gold-oldGold,g.gold);assert.equal(s.owned.equipmentReserve.length-oldGear,g.equipmentIds.length);
 for(const [kind,count] of [['units',g.units.length],['equipment',g.equipmentIds.length],['health',g.health]])if(count)seen.add(kind);
 if(Number(g.units.length>0)+Number(g.equipmentIds.length>0)+Number(g.health>0)>1)combinations++;
 assert.deepEqual(claim(restored),result,'unopened save rolls the same mixed reward');assert.deepEqual(restored.snapshot(),s.snapshot());cleared(s);assertLegalSession(s);
 const after=s.snapshot();assert.equal(s.claimStageReward({type:'stageChoice',rewardId:saved.stageProgress.pending.id,choice:'claim'}).ok,false);assert.deepEqual(s.snapshot(),after);
}
assert.deepEqual([...seen].sort(),['equipment','health','units']);assert.ok(combinations>0,'one chest can contain several reward types');
for(const stage of [4,5,6]){const s=make();win(s,'elite',stage);assert.equal(s.pendingStageReward.source,'elite');assert.equal(s.pendingStageReward.value,Math.ceil(Math.min(30,stage+2)/2));const g=claim(s).stageReward;assert.equal(value(s,g),g.value);cleared(s);assertLegalSession(s);}
const full=make();full.moveUnit(full.owned.all()[0].uid,{location:'board',x:3,y:3});
for(const u of full.cfg.allUnits().filter(u=>u.id!==full.owned.onBoard()[0].unitId).slice(0,9)){for(let n=0;n<9;n++)assert.ok(full.pool.take(u.id));assert.ok(full.owned.addToBench(u.id,9,-1,3));}
win(full);const fullGrant=claim(full).stageReward;assert.deepEqual(fullGrant.units,[]);assert.equal(fullGrant.health,0);assert.equal(value(full,fullGrant),6);cleared(full);assertLegalSession(full);
const scarce=make();win(scarce);for(const u of scarce.cfg.allUnits())while(scarce.pool.take(u.id)){}
const scarceGrant=claim(scarce).stageReward;assert.deepEqual(scarceGrant.units,[]);assert.equal(value(scarce,scarceGrant),6);cleared(scarce);
const beforeRestock=scarce.owned.snapshot();scarce.pool.give('helion');scarce.snapshot();assert.deepEqual(scarce.owned.snapshot(),beforeRestock,'claim leaves no later card payout');
let carried=make();win(carried);const carrySave=carried.snapshot(),held=i.units.find(u=>u.cost===1&&!u.specialShopUnlock).id;
carrySave.stageProgress.unitReserve=[held];carrySave.pool[held]--;carrySave.stageProgress.unitCredit=1;carrySave.stageProgress.equipmentCredit=2;
carried=make(17,carrySave);const carryGrant=claim(carried).stageReward;assert.equal(carryGrant.value,9);assert.equal(value(carried,carryGrant),9);cleared(carried);assertLegalSession(carried);
assert.ok(carried.owned.all().some(u=>u.unitId===held),'previously purchased/reserved cards keep their identity instead of turning into reward value');
const oldRun=clone(i.run);delete oldRun.stageEncounters.chestReward;
const old=make(17,undefined,'legacy',oldRun);win(old,'monster',1);assert.equal(old.pendingStageReward.kind,'unitBundle');
const migrated=make(17,old.snapshot());const migratedGrant=claim(migrated).stageReward;assert.equal(migratedGrant.kind,'mixed');assert.equal(value(migrated,migratedGrant),3);cleared(migrated);assertLegalSession(migrated);
const previousRun=clone(i.run);previousRun.stageEncounters.monsterReward={initialValue:2,valuePerStage:2,maxValue:10};
const previousBundleRun=clone(previousRun);delete previousBundleRun.stageEncounters.chestReward;
const previousBundle=make(17,undefined,'legacy',previousBundleRun);win(previousBundle,'monster',1);
const restoredBundle=make(17,previousBundle.snapshot()),bundleGrant=claim(restoredBundle).stageReward;
assert.equal(value(restoredBundle,bundleGrant),2);cleared(restoredBundle);assertLegalSession(restoredBundle);
for(const kind of ['monster','elite','boss']){
 const previous=make(17,undefined,'budget-v1',previousRun);win(previous,kind,4);const save=previous.snapshot(),restored=make(17,save,'budget-v1');
 assert.deepEqual(restored.pendingStageReward,previous.pendingStageReward,'issued chest keeps its frozen budget');
 assert.equal(restored.economy.gold,save.gold);assert.deepEqual(restored.owned.snapshot(),save.owned);assert.equal(restored.flow.health,save.round.health);
 const grant=claim(restored).stageReward;assert.equal(value(restored,grant),kind==='elite'?4:8);cleared(restored);assertLegalSession(restored);
}
const high=make();assert.ok(high.debugJump(28,1));win(high,'boss',28);assert.equal(high.pendingStageReward.value,30);const highGrant=claim(high).stageReward;
assert.equal(value(high,highGrant),30);cleared(high);assertLegalSession(high);
console.log('PASS mixed chests: exact budgets, several types, 1HP=2 gold, elite half value, full HP/bench/pool fallback, no credits, legacy carry, reload and double claim');

let shop=make();shop.level.level=10;const wave=shop.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');assert.ok(shop.debugJump(4,wave.round));shop.economy.add(100);
const act=(s,choice,index)=>s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice,index});
assert.equal(stageShopRefreshPrice(shop.pendingStageReward.refreshes,i.run.stageEncounters.shop.refresh),2);
assert.ok(act(shop,'buy',0).ok);const inventory=shop.owned.snapshot(),gear=[...shop.owned.equipmentReserve],prior=shop.snapshot(),same=make(17,prior),gold=shop.economy.gold;
assert.ok(act(shop,'refresh').ok);assert.ok(act(same,'refresh').ok);assert.equal(shop.economy.gold,gold-2);assert.deepEqual(shop.pendingStageReward,same.pendingStageReward);
assert.equal(shop.pendingStageReward.refreshes,1);assert.equal(stageShopRefreshPrice(1,i.run.stageEncounters.shop.refresh),4);
assert.deepEqual(shop.owned.snapshot(),inventory);assert.deepEqual(shop.owned.equipmentReserve,gear);assert.ok(shop.pendingStageReward.offers.every(o=>!o.bought));assertLegalSession(shop);
shop=make(17,shop.snapshot());const second=shop.economy.gold;assert.ok(act(shop,'refresh').ok);assert.equal(shop.economy.gold,second-4);assert.equal(shop.pendingStageReward.refreshes,2);
shop.economy.spend(shop.economy.gold-5);const poor=shop.snapshot();assert.equal(act(shop,'refresh').error,'not_enough_gold');assert.deepEqual(shop.snapshot(),poor,'failed refresh charges nothing and keeps offers');
assert.ok(act(shop,'continue').ok);assert.equal(shop.nextWave(),true);
const nextShop=shop.waves.find(w=>w.stage===5&&w.encounterKind==='specialShop');assert.ok(shop.debugJump(5,nextShop.round));assert.equal(shop.pendingStageReward.refreshes,0);
const oldGrowth=clone(i.run);delete oldGrowth.enemyGoldBudget.earlyGrowth;const oldBudget=make(17,undefined,'budget-v1',oldGrowth);
const oldSave=oldBudget.snapshot(),updated=make(17,oldSave,'budget-v1');assert.equal(updated.economy.gold,oldSave.gold);assert.deepEqual(updated.owned.snapshot(),oldSave.owned);assert.equal(updated.flow.health,oldSave.round.health);
const bad=clone(oldSave),identity=JSON.parse(bad.difficultyConfigIdentity);identity.run.enemyGoldBudget.goldPerStage++;bad.difficultyConfigIdentity=JSON.stringify(identity);
assert.throws(()=>make(17,bad,'budget-v1'),/configuration mismatch/,'unrelated combat changes are still rejected');
console.log('PASS travel shop: 2/4/6 escalating refresh, deterministic offers, purchased inventory retained, reload, insufficient funds, per-encounter reset and early-budget save adoption');
