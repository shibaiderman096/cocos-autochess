require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const t=require('../tools/run-simulation.ts'),i=t.loadRunInputs(),deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const ids=['replicator_glimmer','replicator_starlight','replicator_firmament','expedition_command_crown'];
const clone=x=>JSON.parse(JSON.stringify(x));
function cfg(items=i.equipment){const c=new ConfigManager();c.setUnits(i.units);c.setSkills(i.skills);c.setBattle(i.battle);c.setEquipment(items);return c;}
function make(save,items=i.equipment,overrides={}){return new RunSession(cfg(items),i.run,i.waves,{...deps,...overrides,stageCount:6,runSeed:17,enemyGenerationMode:'budget-v1',...(save?{save}:{})});}
function card(s,cost=1,star=1){const c=i.units.find(u=>u.cost===cost&&!u.specialShopUnlock&&!s.owned.all().some(o=>o.unitId===u.id));assert.ok(c);for(let n=0;n<3**(star-1);n++)assert.ok(s.pool.take(c.id));const u=s.owned.addToBench(c.id,s.save.benchSlots,-1,star);assert.ok(u);return u;}
function use(s,id,u){s.owned.equipmentReserve.push(id);return s.equipItem(u.uid,s.owned.equipmentReserve.length-1);}
for(let n=0;n<4;n++){const item=i.equipment.find(e=>e.id===ids[n]);assert.equal(item.shopPrice,[2,4,6,16][n]);assert.equal(item.chestDrop,true);assert.equal(deps.equipmentPolicy.tiers[item.id],'special');assert.equal(deps.equipmentPolicy.enemy.itemTags[item.id].enabled,false);}
for(const [id,max]of ids.slice(0,3).map((id,n)=>[id,[1,3,5][n]])){
 for(let cost=1;cost<=5;cost++){
  const s=make(),target=card(s,cost);target.equipment=['basic_iron_shield','basic_mystic_cloak','basic_life_heart'];target.permanentMaxHp=123;target.permanentSpellPower=45;
  s.owned.equipmentReserve.push(id);const before=s.snapshot(),count=s.pool.count(target.unitId),result=s.equipItem(target.uid,0);
  if(cost>max){assert.equal(result.error,'copy_cost_limit');assert.deepEqual(s.snapshot(),before);continue;}
  assert.equal(result.ok,true);assert.equal(result.copiedUnitId,target.unitId);assert.equal(s.pool.count(target.unitId),count-1);assert.deepEqual(s.owned.equipmentReserve,[]);
  const copies=s.owned.all().filter(u=>u.unitId===target.unitId);assert.equal(copies.length,2);const copy=copies.find(u=>u.uid!==target.uid);
  assert.equal(copy.star,1);assert.ok(!copy.equipment?.length);assert.equal(copy.permanentMaxHp,undefined);assert.equal(copy.permanentSpellPower,undefined);assert.equal(target.equipment.length,3);assertLegalSession(s);
 }
}
const highStar=make(),three=card(highStar,3,3);assert.ok(use(highStar,ids[1],three).ok);assert.equal(highStar.owned.all().filter(u=>u.unitId===three.unitId).find(u=>u.uid!==three.uid).star,1);assertLegalSession(highStar);
const empty=make(),target=empty.owned.all()[0];while(empty.pool.take(target.unitId)){}empty.owned.equipmentReserve.push(ids[0]);const emptyBefore=empty.snapshot();assert.equal(empty.equipItem(target.uid,0).error,'pool_empty');assert.deepEqual(empty.snapshot(),emptyBefore);
for(const merge of [false,true]){
 const s=make(),target=s.owned.all()[0];if(merge){assert.ok(s.pool.take(target.unitId));s.owned.addToBench(target.unitId,9);}
 while(s.owned.inBench().length<9)card(s);s.owned.equipmentReserve.push(ids[0]);const before=s.snapshot();
 const result=s.equipItem(target.uid,0);
 if(merge){assert.equal(result.ok,true);assert.equal(s.owned.get(target.uid).star,2);assert.equal(s.owned.inBench().length,8);assertLegalSession(s);}
 else{assert.equal(result.error,'bench_full');assert.deepEqual(s.snapshot(),before);}
}
let s=make();assert.ok(s.debugJump(1,2));let carrier=s.owned.all()[0],other=card(s);assert.ok(s.moveUnit(other.uid,{location:'board',x:2,y:1}).ok);
assert.ok(use(s,ids[3],carrier).ok);assert.equal(s.level.unitCap,1,'reserve crown is inactive');assert.equal(s.unitCapAfterMove(carrier.uid,{location:'board',x:3,y:1}),2);
assert.ok(s.moveUnit(carrier.uid,{location:'board',x:3,y:1}).ok);assert.equal(s.level.unitCap,2);assert.equal(s.level.level,1);
assert.equal(s.unequipItem(carrier.uid,0).error,'population_cap');const reserve=card(s);const swapBefore=s.snapshot();assert.equal(s.moveUnit(carrier.uid,{location:'bench',x:-1,y:reserve.y}).error,'population_cap');assert.deepEqual(s.snapshot(),swapBefore);
const saved=s.snapshot();s=make(saved);assert.equal(s.level.unitCap,2);assert.deepEqual(s.owned.snapshot(),saved.owned);assertLegalSession(s);
assert.ok(use(s,ids[3],s.owned.get(carrier.uid)).ok);assert.equal(s.level.unitCap,3);s.level.level=10;assert.equal(s.level.unitCap,12);assert.equal(s.shop.costRates().reduce((a,b)=>a+b,0),100);
s.level.level=1;assert.ok(s.moveUnit(reserve.uid,{location:'board',x:4,y:1}).ok);const saleBefore=s.snapshot();assert.equal(s.sellUnit(carrier.uid).error,'population_cap');assert.deepEqual(s.snapshot(),saleBefore);
assert.ok(s.moveUnit(reserve.uid,{location:'bench',x:-1,y:0}).ok);
s.level.level=1;assert.ok(s.moveUnit(other.uid,{location:'bench',x:-1,y:s.owned.inBench().length}).ok);assert.ok(s.unequipItem(carrier.uid,0).ok);assert.equal(s.level.unitCap,2);assert.ok(s.unequipItem(carrier.uid,0).ok);assert.equal(s.level.unitCap,1);assertLegalSession(s);
const battling=make(),fighter=battling.owned.all()[0];assert.ok(battling.moveUnit(fighter.uid,{location:'board',x:3,y:1}).ok);battling.owned.equipmentReserve.push(ids[0]);assert.ok(battling.startBattle());const during=battling.snapshot();assert.equal(battling.equipItem(fighter.uid,0).error,'fighting');assert.deepEqual(battling.snapshot(),during);
console.log('PASS special item use: rarity limits, one-star copy without equipment/growth, no slot use, exhausted pool/full bench atomicity, full-bench merges, crown activation/stacking/swaps/removal/reload and combat lock');
const found=new Set(),c=cfg();
for(let seed=1;seed<=2048&&found.size<4;seed++){
 const pool=new CardPool(i.units),owned=new OwnedUnits(),economy=new EconomySystem(),progress=new StageProgression(i.run.stageEncounters,freshStageProgress(),c,pool,owned,economy,new RunRandomContext(seed),9,deps.equipmentPolicy.tiers,()=>10);
 const g=progress.mixedReward(30,1,100),value=g.units.reduce((n,id)=>n+c.getUnit(id).cost,0)+g.equipmentIds.reduce((n,id)=>n+c.equipmentPrice(id,i.run.stageEncounters.shop.equipmentPrices[deps.equipmentPolicy.tiers[id]]),0)+g.health*2+g.gold;
 assert.equal(value,30);for(const id of g.equipmentIds)if(ids.includes(id))found.add(id);
}
assert.deepEqual([...found].sort(),ids.slice().sort(),'all four special items can be drawn without exceeding chest value');
const oldItems=i.equipment.filter(e=>!ids.includes(e.id)),oldPolicy=clone(deps.equipmentPolicy);for(const id of ids){delete oldPolicy.tiers[id];delete oldPolicy.enemy.itemTags[id];}oldPolicy.reward.excludedIds=oldPolicy.reward.excludedIds.filter(id=>!ids.includes(id));
const old=make(undefined,oldItems,{equipmentPolicy:oldPolicy}),oldSave=old.snapshot(),restored=make(oldSave);assert.equal(restored.economy.gold,oldSave.gold);assert.equal(restored.flow.health,oldSave.round.health);assert.deepEqual(restored.owned.snapshot(),oldSave.owned);assertLegalSession(restored);
console.log('PASS drops and catalogue migration: all special items obtainable by exact chest prices, no enemy assignment, existing saves retain ownership/gold/health');
const merchantFound=new Set();
for(let seed=1;seed<=256&&merchantFound.size<4;seed++){
 const shop=new RunSession(cfg(),i.run,i.waves,{...deps,stageCount:6,runSeed:seed,enemyGenerationMode:'budget-v1'}),w=shop.waves.find(w=>w.stage===4&&w.encounterKind==='specialShop');
 shop.level.level=10;assert.ok(shop.debugJump(4,w.round));shop.economy.add(100);
 for(let n=0;n<shop.pendingStageReward.offers.length;n++){
  const offer=shop.pendingStageReward.offers[n];if(!ids.includes(offer.id))continue;
  merchantFound.add(offer.id);assert.equal(offer.price,i.equipment.find(e=>e.id===offer.id).shopPrice);
  const gold=shop.economy.gold;assert.ok(shop.claimStageReward({type:'stageChoice',rewardId:shop.pendingStageReward.id,choice:'buy',index:n}).ok);
  assert.equal(shop.economy.gold,gold-offer.price);assert.ok(shop.owned.equipmentReserve.includes(offer.id));
 }
 assertLegalSession(shop);
}
assert.deepEqual([...merchantFound].sort(),ids.slice().sort());
const group=Array.from({length:9},(_,n)=>({uid:n+1,unitId:n<3?'helion':i.units[n+3].id,star:1,location:'board',x:n%7,y:Math.floor(n/7),equipment:n<3?[ids[3],ids[3],ids[3]]:[]}));
const mergeOwned=new OwnedUnits(group,10,()=>true,units=>units.filter(u=>u.location==='board').length<=1+units.filter(u=>u.location==='board').reduce((n,u)=>n+u.equipment.filter(id=>id===ids[3]).length,0));
assert.equal(mergeOwned.tryMerge('helion'),null,'merging must not drop active crowns and leave too many deployed units');assert.equal(mergeOwned.all().length,9);
for(let n=4;n<=7;n++)assert.ok(mergeOwned.move(n,{location:'bench',x:-1,y:n-4}));
assert.equal(mergeOwned.tryMerge('helion').star,2);assert.equal(mergeOwned.equipmentReserve.length,6);
console.log('PASS special merchant prices/ownership, and safe crown overflow on multi-unit merges');
