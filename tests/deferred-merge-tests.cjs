require('tsx/cjs');
const assert=require('node:assert/strict');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {freshRunSave}=require('../assets/scripts/core/ShopSave.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs();
function make(full=false){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 const save=freshRunSave(3,45,'budget-v1');save.gold=100;save.shopReserved=true;save.benchSlots=full?1:3;
 save.owned=[{uid:1,unitId:'ghostflame_blade',star:1,location:'board',x:3,y:3},{uid:2,unitId:'ghostflame_blade',star:1,location:'bench',x:-1,y:0}];
 save.shop=[{unitId:'ghostflame_blade'},...Array.from({length:4},()=>({unitId:null}))];
 save.nextOwnedUid=Math.max(save.nextOwnedUid,...save.owned.map(u=>u.uid+1));save.owned.forEach(u=>u.equipment??=[]);
 return new RunSession(cfg,inputs.run,inputs.waves,{save,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
}
for(const kind of ['monster','normal','boss']){
 const s=make();s.flow.wave.encounterKind=kind;assert.ok(s.startBattle());
 assert.equal(s.buyShopSlot(0).ok,true);assert.equal(s.owned.all().length,3);assert.equal(s.owned.get(1).star,1);
 const before=s.owned.snapshot();s.owned.tryMerge('ghostflame_blade');assert.deepEqual(s.owned.snapshot(),before);
 assert.equal(s.moveUnit(2,{location:'bench',x:-1,y:2}).ok,true);assert.equal(s.owned.all().length,3);
 const saved=s.snapshot();assert.equal(saved.owned.length,3,'saving during battle cannot consume copies');
 const restored=new RunSession(s.cfg,inputs.run,inputs.waves,{save:saved,...require('../tools/run-simulation.ts').loadEnemyGenerationInputs(),...require('../tools/run-simulation.ts').loadFormationInputs()});
 assert.equal(restored.flow.phase,'prepare');assert.equal(restored.owned.get(1).star,2,'interrupted battle merges only after returning to prepare');
 s.battle.finished=true;s.battle.winner=0;assert.ok(s.settleBattle());
 assert.notEqual(s.flow.phase,'battle');assert.equal(s.owned.get(1).star,2);assert.equal(s.owned.get(2),undefined);assert.equal(s.owned.get(3),undefined,'merge materials are consumed only after combat');
 const after=s.owned.snapshot();s.snapshot();assert.deepEqual(s.owned.snapshot(),after,'settlement flush is idempotent');
}
const full=make(true);full.startBattle();const before=full.snapshot();assert.equal(full.buyShopSlot(0).error,'bench_full');assert.deepEqual(full.snapshot(),before,'full-bench deferred merge preserves gold, cards, UID and reserved shop slot');
console.log('PASS deferred merge: monster/normal/boss combat purchases, moves, snapshots, recovery, settlement and full-bench rollback');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
let fighting=true;
const chain=new OwnedUnits(Array.from({length:9},(_,i)=>({uid:i+1,unitId:'ghostflame_blade',star:1,location:i===0?'board':'bench',x:i===0?3:-1,y:i===0?3:i-1,equipment:['guinsoo']})),undefined,()=>!fighting);
const materials=chain.snapshot();chain.mergeAll();assert.deepEqual(chain.snapshot(),materials);assert.equal(chain.equipmentReserve.length,0);
fighting=false;chain.mergeAll();assert.equal(chain.all().length,1);assert.equal(chain.get(1).star,3);assert.equal(chain.get(1).location,'board');assert.equal(chain.get(1).equipment.length,3);assert.equal(chain.equipmentReserve.length,6);
console.log('PASS deferred chained 3-star merge preserves equipped materials during combat and returns overflow after combat');
