require('tsx/cjs');
const assert=require('node:assert/strict');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const rules=require('../assets/resources/config/run.json').stageEncounters;
const tiers=require('../assets/resources/config/equipment-policy.json').tiers;
const cfg=new ConfigManager();cfg.setUnits(require('../assets/resources/config/units.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
function load(pending,extra={}){return new StageProgression(rules,{...freshStageProgress(),...extra,pending},cfg,new CardPool(cfg.allUnits()),new OwnedUnits(),new EconomySystem(),new RunRandomContext(1),9,tiers);}
const base={id:'stage-encounters-v1:1:10:shop',waveId:10};
const offers=Array.from({length:5},(_,i)=>({kind:'equipment',id:rules.basicEquipmentIds[i],price:3,bought:false}));
assert.doesNotThrow(()=>load({...base,kind:'specialShop',offers}));
assert.doesNotThrow(()=>load({...base,kind:'equipmentChoice',candidates:rules.basicEquipmentIds.slice(0,4)}));
assert.doesNotThrow(()=>load({...base,kind:'unitBundle',value:2,units:['helion','saiph'],deferredValue:0}));
assert.doesNotThrow(()=>load(undefined,{equipmentCredit:2}));
for(const equipmentCredit of [-1,NaN,Infinity,.5,3,1000000000])assert.throws(()=>load(undefined,{equipmentCredit}),/Invalid stage reward save/);
for(const pending of [null,{}, {...base,kind:'unknown'}, {...base,kind:'bossChoice',value:-1},
 {...base,waveId:NaN,kind:'bossChoice',value:2}, {...base,kind:'equipmentChoice',candidates:['missing']},
 {...base,kind:'equipmentChoice',candidates:Array(4).fill('guinsoo')},
 {...base,kind:'unitBundle',value:2,units:['undead_mage'],deferredValue:0},
 {...base,kind:'unitBundle',value:2,units:['leon'],deferredValue:0},
 {...base,kind:'specialShop',offers:[...offers.slice(0,4),{...offers[4],price:-1}]},
 {...base,kind:'specialShop',offers:[...offers.slice(0,4),{...offers[4],price:Infinity}]},
 {...base,kind:'specialShop',offers:[...offers.slice(0,4),{...offers[4],id:'missing'}]},
 {...base,kind:'specialShop',offers:[...offers.slice(0,4),{...offers[4],bought:'false'}]},
])assert.throws(()=>load(pending),/Invalid stage reward save/);
for(const lastUnitDrop of [{waveId:1,value:2,units:['missing'],deferredValue:0},{waveId:1,value:2,units:[],deferredValue:-1}])assert.throws(()=>load(undefined,{lastUnitDrop}),/Invalid stage reward save/);
console.log('PASS stage reward restore: valid states, unknown IDs, invalid prices/flags/kinds, corrupt wave IDs, duplicate choices and value conservation');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const run=require('../assets/resources/config/run.json'),waves=require('../assets/resources/config/waves.json');
cfg.setSkills(require('../assets/resources/config/skills.json'));cfg.setBattle(require('../assets/resources/config/battle.json'));
function session(save){return new RunSession(cfg,run,waves,{runSeed:7,stageCount:4,enemyGenerationMode:'legacy',...(save?{save}:{})});}
const s=session(),shop=s.waves.find(w=>w.stage===3&&w.encounterKind==='specialShop');
assert.ok(s.debugJump(shop.stage,shop.round));const saved=s.snapshot();
assert.doesNotThrow(()=>session(saved),'valid persisted shop restores normally');
saved.stageProgress.pending.offers[1]={...saved.stageProgress.pending.offers[0]};
assert.throws(()=>session(saved),/Invalid stage reward save/,'duplicate saved merchandise cannot be sold as two distinct offers');
console.log('PASS actual RunSession restore rejects duplicate special-shop merchandise before rendering');
