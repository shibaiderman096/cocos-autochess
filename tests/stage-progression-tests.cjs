require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs,runSimulation}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function make(save,mode='legacy',seed=11){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 return new RunSession(cfg,inputs.run,inputs.waves,{...deps,stageCount:6,runSeed:seed,enemyGenerationMode:mode,...(save?{save}: {})});
}
function win(s){
 if(!s.owned.onBoard().length)s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3});
 const sim=s.startBattle();assert.ok(sim,'real battle starts');
 for(const u of sim.units){u.cfg.skillId=undefined;u.cfg.maxMana=0;u.cfg.critChance=0;if(u.side===0){u.cfg.atk=100000;u.cfg.hp=100000;u.hp=100000;}else{u.cfg.atk=0;u.hp=1;}}
 assert.equal(sim.run().winner,0);const reward=s.settleBattle();assert.ok(reward);assert.equal(s.settleBattle(),null,'settlement is once only');return reward;
}
function choose(s,choice,index){return s.act({type:'stageChoice',rewardId:s.pendingStageReward?.id??'stale',choice,index});}
function jump(s,kind){const wave=s.waves.find(w=>w.stage===4&&w.encounterKind===kind);assert.ok(s.debugJump(4,wave.round));return wave;}
let first=make();
for(let round=1;round<=3;round++){
 const materials=units=>units.map(({uid,unitId,star,equipment})=>({uid,unitId,star,equipment}));const ownedBefore=materials(first.owned.snapshot());
 win(first);assert.equal(first.pendingStageReward.kind,'unitBundle','every monster victory leaves a chest');assert.deepEqual(materials(first.owned.snapshot()),ownedBefore,'unclaimed chest does not consume or grant units');assert.equal(first.save.stageProgress.lastUnitDrop.value,2);
 assert.equal(first.save.stageProgress.lastUnitDrop.units.reduce((n,id)=>n+first.cfg.getUnit(id).cost,0),2);
 assert.equal(first.canAdvanceWave(),false,'chest must be claimed before advancement');assert.equal(first.nextWave(),false);assertLegalSession(first);
 const before=first.snapshot(),restored=make(before);assert.deepEqual(restored.pendingStageReward,first.pendingStageReward);
 assert.deepEqual(restored.pool.snapshot(),first.pool.snapshot(),'reload preserves automatic reward stock');assert.deepEqual(restored.owned.snapshot(),first.owned.snapshot());const rewardId=restored.pendingStageReward.id;assert.equal(choose(restored,'claim').ok,true);assert.equal(restored.act({type:'stageChoice',rewardId,choice:'claim'}).ok,false,'chest cannot be claimed twice');assert.equal(restored.canAdvanceWave(),true);assertLegalSession(restored);
 assert.ok(restored.nextWave());assert.equal(restored.state.stage,round===3?2:1);first=restored;
}
console.log('PASS first monster stage: 3 value2 chests, explicit claim, reload persistence, no duplicate units and advancement gate');

for(const mode of ['legacy','budget-v1']){
 for(const stage of [2,3]){
  const early=make(undefined,mode),waves=early.waves.filter(w=>w.stage===stage);
  assert.equal(waves.filter(w=>w.encounterKind==='monster').length,1);assert.equal(waves.filter(w=>w.encounterKind==='specialShop').length,1);
  assert.ok(waves.every(w=>w.encounterKind!=='boss'&&w.encounterKind!=='elite'));
  const monster=waves.find(w=>w.encounterKind==='monster');assert.ok(early.debugJump(stage,monster.round));win(early);
  assert.equal(early.pendingStageReward.kind,'unitBundle');assert.equal(early.pendingStageReward.value,stage*2);assertLegalSession(early);assert.ok(choose(early,'claim').ok);
  {const shopWave=waves.find(w=>w.encounterKind==='specialShop');assert.ok(early.debugJump(stage,shopWave.round));assert.equal(early.pendingStageReward.kind,'specialShop');assert.equal(early.pendingStageReward.offers.length,5);assert.ok(choose(early,'continue').ok);assertLegalSession(early);}
 }
 const s=make(undefined,mode);for(let stage=4;stage<=6;stage++){
  const waves=s.waves.filter(w=>w.stage===stage);for(const kind of ['monster','elite','specialShop','boss'])assert.equal(waves.filter(w=>w.encounterKind===kind).length,1);
  assert.equal(waves.at(-1).encounterKind,'boss');assert.equal(waves.find(w=>w.encounterKind==='specialShop').enemies.length,0);
  const monster=waves.find(w=>w.encounterKind==='monster');
  assert.ok(monster.enemies.every(e=>inputs.run.monsters.some(m=>m.id===e.unitId)));
  const monsterSession=make(undefined,mode);assert.ok(monsterSession.debugJump(stage,monster.round));win(monsterSession);
  assert.equal(monsterSession.pendingStageReward.kind,'unitBundle');assert.equal(monsterSession.pendingStageReward.value,Math.min(inputs.run.stageEncounters.monsterReward.maxValue,stage*2));
  assert.equal(monsterSession.canAdvanceWave(),false);assert.ok(choose(monsterSession,'claim').ok);assertLegalSession(monsterSession);
 }
 jump(s,'boss');win(s);assert.equal(s.pendingStageReward.kind,'bossChoice');assert.equal(s.pendingEquipmentReward,undefined,'old automatic equipment reward is disabled');
 const stale=s.pendingStageReward.id;assert.ok(choose(s,'equipment').ok);assert.equal(s.pendingStageReward.kind,'equipmentChoice');
 const choices=s.pendingStageReward.candidates;assert.equal(new Set(choices).size,4);assert.ok(choices.every(id=>inputs.run.stageEncounters.basicEquipmentIds.includes(id)));
 assert.deepEqual(make(s.snapshot(),mode).pendingStageReward.candidates,choices,'four choices persist without reroll');
 const count=s.owned.equipmentReserve.length;assert.ok(choose(s,'claim',2).ok);assert.equal(s.owned.equipmentReserve.length,count+1);
 assert.equal(s.act({type:'stageChoice',rewardId:stale,choice:'equipment'}).ok,false);assertLegalSession(s);
 const units=make(undefined,mode);jump(units,'boss');win(units);assert.ok(choose(units,'units').ok);assert.equal(units.pendingStageReward.value,8);assert.ok(choose(units,'claim').ok);assertLegalSession(units);
 const elite=make(undefined,mode);jump(elite,'elite');win(elite);assert.equal(elite.pendingStageReward,undefined,'only boss offers category choice');
}
console.log('PASS both generation modes: exact stage encounters, real monster configs, boss branches, four distinct basic items, persistence, stale actions and no elite category reward');

const shop=make();jump(shop,'specialShop');assert.equal(shop.pendingStageReward.offers.length,5);assert.equal(shop.startBattle(),null);
const p=shop.pendingStageReward,eq=p.offers.findIndex(i=>i.kind==='equipment'),unit=p.offers.findIndex(i=>i.kind==='unit');
const state=shop.state,streak=shop.economy.snapshot();assert.equal(choose(shop,'buy',eq).ok,false);shop.economy.add(100);
const gold=shop.economy.gold;assert.ok(choose(shop,'buy',eq).ok);assert.equal(shop.economy.gold,gold-p.offers[eq].price);assert.equal(choose(shop,'buy',eq).ok,false);
assert.ok(choose(shop,'buy',unit).ok);const savedShop=shop.snapshot(),sameShop=make(savedShop);assert.deepEqual(sameShop.pendingStageReward,shop.pendingStageReward);assertLegalSession(sameShop);
assert.ok(choose(sameShop,'continue').ok);assert.equal(sameShop.save.lastReward.breakdown.total,0);assert.equal(sameShop.state.xp,state.xp);assert.equal(sameShop.state.playerHp,state.playerHp);
assert.equal(sameShop.economy.winStreak,streak.winStreak);assert.equal(sameShop.economy.loseStreak,streak.loseStreak);assert.ok(sameShop.nextWave());
const skip=make();jump(skip,'specialShop');const prior=skip.economy.gold;assert.ok(choose(skip,'continue').ok);assert.equal(skip.economy.gold,prior);
console.log('PASS special shop: 5 persisted mixed offers, insufficient money, actual charges, duplicate prevention, buy/reload, skip, and no combat income/XP/streak/HP change');

const full=make();full.moveUnit(1,{location:'board',x:3,y:3});
for(const card of full.cfg.allUnits().filter(u=>u.id!==full.owned.onBoard()[0].unitId).slice(0,9)){
 for(let i=0;i<9;i++)assert.ok(full.pool.take(card.id));assert.ok(full.owned.addToBench(card.id,9,-1,3));
}
jump(full,'monster');win(full);assert.equal(full.pendingStageReward.kind,'unitBundle');assert.ok(full.save.stageProgress.unitReserve.length>0);assertLegalSession(full);
const legacyPopup=full.snapshot(),drop=legacyPopup.stageProgress.lastUnitDrop;
legacyPopup.stageProgress.pending={kind:'unitBundle',id:`stage-encounters-v1:${legacyPopup.runSeed}:${drop.waveId}:units`,...drop};
const migratedPopup=make(legacyPopup);assert.deepEqual(migratedPopup.pendingStageReward,full.pendingStageReward,'restored chest remains unclaimed');assertLegalSession(migratedPopup);assert.ok(choose(full,'claim').ok);
const reloadFull=make(full.snapshot());assert.deepEqual(reloadFull.save.stageProgress.unitReserve,full.save.stageProgress.unitReserve);assertLegalSession(reloadFull);
assert.ok(reloadFull.nextWave());const reserveBefore=reloadFull.save.stageProgress.unitReserve.length;
assert.ok(reloadFull.act({type:'sell',uid:reloadFull.owned.inBench()[0].uid}).ok);assert.ok(reloadFull.save.stageProgress.unitReserve.length<reserveBefore);assertLegalSession(reloadFull);
console.log('PASS full bench: reserved warehouse, exact card conservation through reload and automatic collection after sale');

const scarce=make();jump(scarce,'monster');
for(const unit of scarce.cfg.allUnits())while(scarce.pool.take(unit.id)){}
win(scarce);assert.equal(scarce.save.stageProgress.lastUnitDrop.units.length,0);assert.equal(scarce.save.stageProgress.lastUnitDrop.deferredValue,8);
assert.equal(scarce.save.stageProgress.unitCredit,8);assert.equal(scarce.pendingStageReward.kind,'unitBundle');assert.ok(choose(scarce,'claim').ok);
const priorWarriors=scarce.owned.all().filter(u=>u.unitId==='helion').reduce((n,u)=>n+3**(u.star-1),0);
for(let i=0;i<8;i++)scarce.pool.give('helion');scarce.snapshot();
assert.equal(scarce.save.stageProgress.unitCredit,0);
assert.equal(scarce.owned.all().filter(u=>u.unitId==='helion').reduce((n,u)=>n+3**(u.star-1),0),priorWarriors+8);
console.log('PASS exhausted card pool: claim stays available, unit value is retained and automatically delivered after restocking');

const report=runSimulation(inputs,{...deps,runSeed:12,stageCount:6,maxStage:4,bot:'medium'});
assert.notEqual(report.result,'SIMULATION_ERROR',report.error);assert.ok(report.waves.every(w=>w.reward.breakdown.floorIncome===0));
console.log('PASS actual campaign CLI path: new rewards, conservation audits and zero fixed income; result '+report.result);
