require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {sellPrice}=require('../assets/scripts/core/ShopConfig.ts');
const t=require('../tools/run-simulation.ts'),inputs=t.loadRunInputs();
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
function make(options={}){
 const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
 return new RunSession(cfg,inputs.run,inputs.waves,{...deps,runSeed:options.save?undefined:217,...options});
}
{
 const s=make(),u=s.owned.all()[0];u.equipment=[inputs.equipment.find(e=>!e.consumable&&!e.traitChoice&&!e.populationBonus).id];
 for(const location of ['bench','board']){
  if(location==='board')assert.ok(s.moveUnit(u.uid,{location:'board',x:3,y:3}).ok);
  const before=s.snapshot();assert.equal(s.unitSellingLocked,true);
  assert.deepEqual(s.sellUnit(u.uid),{ok:false,error:'opening_sell_locked'});
  assert.deepEqual(s.snapshot(),before,'blocked sale changes neither wallet, pool, equipment nor placement');
 }
 assert.ok(s.debugJump(1,2));assert.equal(s.unitSellingLocked,false);
 const gold=s.economy.gold,price=sellPrice(s.cfg.getUnit(u.unitId).cost,u.star);
 assert.ok(s.sellUnit(u.uid).ok);assert.equal(s.economy.gold,gold+price);assert.equal(s.owned.get(u.uid),undefined);
}
{
 const s=make(),last=s.waves.filter(w=>w.stage===1).at(-1);
 assert.ok(s.debugJump(1,last.round));assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
 const sim=s.startBattle();sim.end(0);s.settleBattle();
 if(s.pendingStageReward)assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'claim'}).ok);
 const gold=s.economy.gold;assert.ok(s.nextWave());
 assert.deepEqual([s.state.stage,s.state.round,s.economy.gold],[2,1,gold+5],'2-1 pays immediately on real advance');
 assert.equal(s.incomePreview.entrySubsidy,5);assert.equal(s.incomePreview.win.floorIncome,0,'already paid entry subsidy is not paid again in settlement');
 const restored=make({save:s.snapshot()});assert.equal(restored.economy.gold,gold+5,'reload cannot duplicate subsidy');
 let paid3=false;
 for(const target of [[2,2],[2,1],[3,1],[3,2],[3,1],[4,1]]){
  const before=restored.economy.gold;assert.ok(restored.debugJump(...target));
  assert.equal(restored.economy.gold,before+(target[0]===3&&target[1]===1&&!paid3?5:0));
  if(target[0]===3&&target[1]===1)paid3=true;
 }
 assert.deepEqual(restored.snapshot().earlyGoldStages,[2,3]);
 const old=s.snapshot();delete old.earlyGoldStages;
 assert.equal(make({save:old}).economy.gold,old.gold+5,'old save currently at 2-1 adopts the subsidy once');
 assert.ok(s.debugJump(3,2));const past=s.snapshot();delete past.earlyGoldStages;
 const migrated=make({save:past});assert.equal(migrated.economy.gold,past.gold,'no retroactive subsidies for old saves past the entry');
 assert.ok(migrated.debugJump(2,1));assert.equal(migrated.economy.gold,past.gold,'past entries cannot be farmed by revisiting');
}
{
 let s;
 for(let seed=1;seed<=30;seed++){
  const candidate=make({openingEncounter:true,runSeed:seed});
  if(candidate.openingEncounterOptions.some(o=>o.id==='stipend')){s=candidate;break;}
 }
 assert.ok(s);assert.ok(s.chooseOpeningEncounter('stipend').ok);
 const start=s.economy.gold;assert.ok(s.debugJump(2,1));assert.equal(s.economy.gold,start+15,'stage subsidy coexists with the authored 10-gold encounter stipend');
 const loaded=make({save:s.snapshot()});assert.equal(loaded.economy.gold,start+15);
 assert.ok(loaded.debugJump(3,1));assert.equal(loaded.economy.gold,start+30);
 assert.ok(loaded.debugJump(4,1));assert.equal(loaded.economy.gold,start+40,'stage 4 keeps only the encounter stipend');
}
{
 const s=make(),wave=s.waves.find(w=>w.stage>=2&&w.encounterKind==='specialShop');assert.ok(wave);assert.ok(s.debugJump(wave.stage,wave.round));
 assert.equal(s.pendingStageReward.kind,'specialShop');s.economy.gold=0;
 const id=inputs.units.find(u=>u.cost===5&&!u.specialShopUnlock).id;assert.ok(s.pool.take(id));const u=s.owned.forceAdd(id);
 assert.ok(s.sellUnit(u.uid).ok);assert.equal(s.economy.gold,5,'merchant sale pays immediately');
 assert.ok(s.claimStageReward({type:'stageChoice',rewardId:s.pendingStageReward.id,choice:'refresh'}).ok,'sale gold funds same-wave refresh');
 assert.equal(s.economy.gold,3);
 assert.equal(make({save:s.snapshot()}).economy.gold,3,'same-wave spending and sale persist');
}
console.log('PASS early economy: 1-1 board/bench sales blocked without side effects, 1-2 sale enabled, merchant sale instantly spendable, 2-1/3-1 entry +5 once, reload/revisit/migration and no later subsidy');
