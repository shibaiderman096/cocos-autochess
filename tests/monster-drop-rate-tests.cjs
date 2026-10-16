require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {SHOP_RATES,COST_PRICE}=require('../assets/scripts/core/ShopConfig.ts');
const rules=require('../assets/resources/config/run.json').stageEncounters,tiers=require('../assets/resources/config/equipment-policy.json').tiers;
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
const wave={id:10,name:'test',stage:3,round:2,roundsInStage:6,encounterKind:'monster',enemies:[]};
function sample(seed,level=7,emptyOneCost=false){
 const pool=new CardPool(cfg.allUnits()),owned=new OwnedUnits(),state=freshStageProgress();
 if(emptyOneCost)for(const u of cfg.allUnits().filter(u=>u.cost===1))while(pool.take(u.id)){}
 const progress=new StageProgression(rules,state,cfg,pool,owned,new EconomySystem(),new RunRandomContext(seed),9,tiers,()=>level);
 progress.settle(wave,0);assert.equal(state.pending,undefined);return {pool,state,progress,owned,costs:state.lastUnitDrop.units.map(id=>cfg.getUnit(id).cost)};
}
const firstCosts=[0,0,0,0,0],lengths=new Set(),patterns=new Set();
for(let seed=1;seed<=2000;seed++){
 const {costs,state}=sample(seed);assert.equal(costs.reduce((n,c)=>n+COST_PRICE[c],0),6);assert.equal(state.lastUnitDrop.deferredValue,0);
 firstCosts[costs[0]-1]++;lengths.add(costs.length);patterns.add(costs.slice().sort((a,b)=>a-b).join(','));
}
for(let i=0;i<5;i++)assert.ok(Math.abs(firstCosts[i]/2000-SHOP_RATES[6][i]/100)<.035,`cost${i+1} first-draw rate ${firstCosts[i]/2000}`);
assert.ok(lengths.size>=4,'total value does not fix the number of cards');assert.ok(patterns.has('1,1,4'));assert.ok(patterns.has('1,1,2,2'));
for(let seed=1;seed<=30;seed++)assert.deepEqual(sample(seed,1).costs,[1,1,1,1,1,1],'zero-probability tiers cannot drop');
assert.deepEqual(sample(50).state,sample(50).state,'seed and level reproduce the same bundle');
const scarce=sample(1,1,true);assert.deepEqual(scarce.costs,[]);assert.equal(scarce.state.unitCredit,6,'do not silently substitute a zero-rate tier');
const one=cfg.allUnits().find(u=>u.cost===1);for(let i=0;i<6;i++)scarce.pool.give(one.id);scarce.progress.collect(wave);assert.equal(scarce.state.unitCredit,0);
console.log('PASS weighted monster drops: 2000 seeds follow level7 first-cost rates, exact value6, variable count, 1+1+4 and 1+1+2+2, level1 zero tiers, repeat and shortage refill');
