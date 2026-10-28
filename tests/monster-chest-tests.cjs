require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {StageProgression,freshStageProgress}=require('../assets/scripts/core/StageProgression.ts');
const {CardPool}=require('../assets/scripts/core/CardPool.ts');
const {OwnedUnits}=require('../assets/scripts/core/OwnedUnits.ts');
const {EconomySystem}=require('../assets/scripts/core/EconomySystem.ts');
const {RunRandomContext}=require('../assets/scripts/core/RunRandomContext.ts');
const {assertLegalSession}=require('../tools/bots/legality.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function config(){const c=new ConfigManager();c.setUnits(inputs.units);c.setSkills(inputs.skills);c.setBattle(inputs.battle);c.setEquipment(inputs.equipment);return c;}
for(let stage=1;stage<=99;stage++)for(const winner of [0,1,null]){
 const cfg=config(),pool=new CardPool(cfg.allUnits()),owned=new OwnedUnits(),state=freshStageProgress();
 const progress=new StageProgression(inputs.run.stageEncounters,state,cfg,pool,owned,new EconomySystem(),new RunRandomContext(1000+stage),9,deps.equipmentPolicy?.tiers??{},()=>1);
 const wave={id:stage,stage,round:1,encounterKind:'monster'};
 progress.settle(wave,winner);
 if(winner!==0){assert.equal(state.pending,undefined);continue;}
 assert.equal(state.pending.kind,'unitBundle');assert.equal(owned.all().length,0);
 const frozen=JSON.stringify(state);progress.settle(wave,0);progress.collect(wave);assert.equal(JSON.stringify(state),frozen,'unclaimed rewards stay frozen');
 const action={type:'stageChoice',rewardId:state.pending.id,choice:'claim'};
 assert.equal(progress.act(action,wave).ok,true);assert.equal(state.pending,undefined);assert.equal(progress.act(action,wave).ok,false);
}
for(const mode of ['budget-v1']){
 const s=new RunSession(config(),inputs.run,inputs.waves,{...deps,stageCount:6,runSeed:17,enemyGenerationMode:mode});
 const monsters=s.waves.filter(w=>w.encounterKind==='monster');
 for(const w of monsters){
  assert.ok(s.debugJump(w.stage,w.round));
  if(!s.owned.onBoard().length)assert.ok(s.moveUnit(s.owned.all()[0].uid,{location:'board',x:3,y:3}).ok);
  const sim=s.startBattle();assert.ok(sim);sim.finished=true;sim.winner=0;assert.ok(s.settleBattle());
  const pending=s.pendingStageReward;assert.equal(pending.kind,'unitBundle');assert.equal(s.canAdvanceWave(),false);assert.equal(s.nextWave(),false);
  const saved=s.snapshot();const restored=new RunSession(config(),inputs.run,inputs.waves,{...deps,save:saved,enemyGenerationMode:mode});
  assert.deepEqual(restored.pendingStageReward,pending,'reload preserves the chest and its exact contents');assert.deepEqual(restored.owned.snapshot(),s.owned.snapshot());
  assertLegalSession(s);assertLegalSession(restored);
  const action={type:'stageChoice',rewardId:pending.id,choice:'claim'};assert.ok(s.act(action).ok);assert.ok(restored.act(action).ok);
  assert.deepEqual(restored.owned.snapshot(),s.owned.snapshot());assert.equal(s.pendingStageReward,undefined);assert.equal(s.canAdvanceWave(),true);assert.equal(s.act(action).ok,false);assertLegalSession(s);
 }
}
console.log('PASS monster chests: stages 1-99, wins/losses/draws, no early grants, no duplicates, both campaign modes, persistent contents and advancement gates');
