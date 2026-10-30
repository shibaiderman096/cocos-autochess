require('tsx/cjs');
const assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs();
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {writeRunSave,SAVE_KEY}=require('../assets/scripts/core/ShopSave.ts');
const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);
const session=new RunSession(cfg,input.run,input.waves,{...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs(),runSeed:1028,stageCount:6,openingEncounter:true});
let stored;global.localStorage={setItem:(key,value)=>{assert.equal(key,SAVE_KEY);stored=value;}};
const detached=session.snapshot(),gold=session.economy.gold;detached.gold=gold+10;assert.equal(session.economy.gold,gold);
writeRunSave(session.snapshot());const expected=stored;
const stringify=JSON.stringify;let count=0;JSON.stringify=function(...args){count++;return stringify.apply(this,args);};
const results=[];
try{for(const mode of ['snapshot+write','persist']){count=0;const start=performance.now();for(let i=0;i<100;i++) mode==='persist'?session.persist(writeRunSave):writeRunSave(session.snapshot());results.push({mode,stringifications:count,ms:+(performance.now()-start).toFixed(3)});assert.equal(stored,expected);}}finally{JSON.stringify=stringify;delete global.localStorage;}
assert.equal(results[1].stringifications*2,results[0].stringifications);
console.log(JSON.stringify({scope:'Node synchronous save, 100 unchanged writes; includes all JSON.stringify calls',results},null,2));
console.log('PASS persistence: serialized save equality, detached public snapshot, half the serialization passes');
