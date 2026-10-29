require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {ShopSystem}=require('../assets/scripts/core/ShopSystem.ts');
const {equipmentQuality}=require('../assets/scripts/core/EquipmentQuality.ts');
const {validCost,unitPrice}=require('../assets/scripts/core/ShopConfig.ts');
const rules=require('../assets/resources/config/run.json').stageEncounters,tiers=require('../assets/resources/config/equipment-policy.json').tiers;
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const wave={id:10,name:'merchant',stage:2,round:2,encounterKind:'specialShop',enemies:[]};
function sample(seed,level,prepare=()=>{}) {
 const pool=new CardPool(cfg.allUnits()),owned=new OwnedUnits(),economy=new EconomySystem();prepare(pool);
 const state=freshStageProgress(),random=new RunRandomContext(seed);
 const ordinary=new ShopSystem(pool,owned,economy,new Map(cfg.allUnits().map(u=>[u.id,u])),random.stream('shop',10),()=>level,9,Array.from({length:5},()=>({unitId:null})));
 const rates=ordinary.costRates(),progress=new StageProgression(rules,state,cfg,pool,owned,economy,random,9,tiers,()=>level);
 progress.enter(wave);return{state,progress,pool,owned,economy,random,rates};
}
let duplicates;
for(let level=1;level<=10;level++) {
 let units=0,total=0;const counts=[0,0,0,0,0];
 for(let seed=1;seed<=2000;seed++) {
  const s=sample(seed,level),offers=s.state.pending.offers;
  offers.forEach(o=>{
   counts[(o.kind==='unit'?validCost(cfg.getUnit(o.id).cost):equipmentQuality(cfg.getEquipment([o.id])[0]))-1]++;
   if(o.kind==='unit'){assert.ok(cfg.getUnit(o.id).specialShopUnlock);assert.equal(validCost(cfg.getUnit(o.id).cost),5);assert.equal(o.price,unitPrice(cfg.getUnit(o.id).cost));units++;}
   total++;
  });
  const eq=offers.filter(o=>o.kind==='equipment').map(o=>o.id);assert.equal(new Set(eq).size,eq.length);
  const unitIds=offers.filter(o=>o.kind==='unit').map(o=>o.id);
  if(new Set(unitIds).size<unitIds.length)duplicates??=s;
  assert.deepEqual(offers,sample(seed,level===1?10:1).state.pending.offers,'merchant offers do not change with player level');
 }
 assert.ok(counts.every((n,index)=>Math.abs(n/total-rules.shop.qualityRates[index]/100)<.015));
 assert.ok(units>0,'fixed orange odds also apply before player level 7');
 console.log(`PASS special shop level ${level}: fixed quality mix ${counts.map(n=>Number((n/total*100).toFixed(1))).join('/')}%; exclusive cards share the orange tier`);
}
assert.ok(duplicates,'same-fee draws can repeat a unit as in the ordinary shop');
const restoredState=structuredClone(duplicates.state);
assert.doesNotThrow(()=>new StageProgression(rules,restoredState,cfg,duplicates.pool,duplicates.owned,duplicates.economy,duplicates.random,9,tiers,()=>10));
const ids=duplicates.state.pending.offers.filter(o=>o.kind==='unit').map(o=>o.id),counts=new Map(ids.map(id=>[id,duplicates.pool.count(id)]));
duplicates.economy.add(100);
for(const [index,o]of duplicates.state.pending.offers.entries())if(o.kind==='unit')assert.ok(duplicates.progress.act({type:'stageChoice',rewardId:duplicates.state.pending.id,choice:'buy',index},wave).ok);
for(const [id,before]of counts)assert.equal(duplicates.pool.count(id),before-ids.filter(x=>x===id).length);
const scarce=sample(5,10,pool=>{for(const u of cfg.allUnits().filter(u=>u.specialShopUnlock))while(pool.count(u.id)>1)pool.take(u.id);});
for(const id of cfg.allUnits().filter(u=>u.specialShopUnlock).map(u=>u.id))assert.ok(scarce.state.pending.offers.filter(o=>o.id===id).length<=1,'offers do not exceed remaining stock');
const emptyFive=sample(1,10,pool=>{for(const u of cfg.allUnits().filter(u=>u.specialShopUnlock))while(pool.take(u.id)){};});
assert.ok(emptyFive.state.pending.offers.every(o=>o.kind==='equipment'),'depleted exclusive stock cannot be offered');
assert.notDeepEqual(sample(1,1).rates,sample(1,10).rates,'ordinary chess shop rates still depend on level');
console.log('PASS exclusive roster, unchanged ordinary shop rates, duplicate-card reload/purchases, fixed-level merchant rolls and depleted inventory');
