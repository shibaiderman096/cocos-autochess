require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Exercise the actual adapter refresh at the exact gap between claiming and switching waves.
const source = ts.createSourceFile('stage.ts', fs.readFileSync('assets/scripts/view/BattleStage.ts', 'utf8'), ts.ScriptTarget.ES2020, true);
const cls = source.statements.find(n => ts.isClassDeclaration(n) && n.name?.text === 'BattleStage');
const method = cls.members.find(n => n.name?.getText(source) === 'refreshShopContent').getText(source);
const compiled = ts.transpileModule(`class Stage { ${method} } exports.Stage=Stage;`, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const out = {}; new Function('exports', compiled)(out);
const stage = new out.Stage();
stage.session = {openingShopLocked:false, pendingOpeningEncounter:false};
stage.flow = {phase:'settlement',wave:{encounterKind:'specialShop'}};
stage.ui = {setOpeningShopLocked(){},setShopContentOccupied(value){this.occupied=value;},hideOpeningEncounter(){}};
stage.refreshShopContent();
assert.equal(stage.ui.occupied, true, 'ordinary shop must remain hidden after special-shop claim, before the transition covers the board');
stage.flow = {phase:'prepare',wave:{encounterKind:'normal'}};
stage.ui.showFightBtn = () => {};
stage.refreshShopContent(); assert.equal(stage.ui.occupied,false,'ordinary shop returns only on the next wave');
console.log('PASS special-shop exit never reveals ordinary cards on the outgoing wave');

const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {RunSession} = require('../assets/scripts/core/RunSession.ts');
const {assertLegalSession} = require('../tools/bots/legality.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs} = require('../tools/run-simulation.ts');
const inputs=loadRunInputs(), deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function make(seed,save,mode='legacy') {
  const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);
  return new RunSession(cfg,inputs.run,inputs.waves,{...deps,runSeed:seed,stageCount:6,enemyGenerationMode:mode,...(save?{save}:{})});
}
assert.equal(make(1).flow.health,100,'new runs start at 100 health');
for(const mode of ['legacy','budget-v1']) {
  const seen=new Set();
  for(let seed=1;seed<=24;seed++) {
    let s=make(seed,undefined,mode), boss=s.waves.find(w=>w.stage===4&&w.encounterKind==='boss');
    assert.ok(s.debugJump(4,boss.round));
    const damaged=s.snapshot();damaged.round.health=seed%3===0?99:60;s=make(seed,damaged,mode);
    const unit=s.owned.all()[0];assert.ok(s.moveUnit(unit.uid,{location:'board',x:3,y:3}).ok);
    const sim=s.startBattle();assert.ok(sim);sim.end(0);s.settleBattle();
    const unopened=s.snapshot(), id=s.pendingStageReward.id, oldHealth=s.flow.health;
    const restored=make(seed,unopened,mode), action={type:'stageChoice',rewardId:id,choice:'claim'};
    assert.equal(s.claimStageReward({...action,choice:'units'}).ok,false,'caller cannot select a reward category');
    assert.equal(s.claimStageReward({...action,choice:'equipment'}).ok,false);
    const equipmentCount=s.owned.equipmentReserve.length;
    const result=s.claimStageReward(action);assert.ok(result.ok);assert.ok(result.stageReward);
    seen.add(result.stageReward.kind);
    assert.deepEqual(restored.claimStageReward(action),result,'reload keeps the seeded reward');
    assert.deepEqual(restored.snapshot(),s.snapshot(),'reload grants identical ownership, pool stock and health');
    assert.equal(s.pendingStageReward,undefined,'one click fully resolves the chest');
    if(result.stageReward.kind==='health') {
      assert.equal(s.flow.health,Math.min(100,oldHealth+5));
      assert.equal(s.flow.lastSettlement.healthRemaining,s.flow.health);
      assert.equal(s.owned.equipmentReserve.length,equipmentCount);
    } else if(result.stageReward.kind==='equipment') {
      assert.equal(s.flow.health,oldHealth);
      assert.equal(s.owned.equipmentReserve.length,equipmentCount+1);
      assert.equal(s.owned.equipmentReserve.at(-1),result.stageReward.equipmentId);
      assert.ok(inputs.run.stageEncounters.basicEquipmentIds.includes(result.stageReward.equipmentId));
    } else {
      assert.equal(s.flow.health,oldHealth);
      assert.equal(result.stageReward.units.reduce((sum,id)=>sum+s.cfg.getUnit(id).cost,0),8);
    }
    const claimed=s.snapshot();assert.equal(s.claimStageReward(action).ok,false);assert.deepEqual(s.snapshot(),claimed,'double click cannot grant again');
    assertLegalSession(s);assertLegalSession(restored);
    assert.equal(make(seed,claimed,mode).flow.health,s.flow.health,'healing persists after claiming');
    assert.equal(s.canAdvanceWave(),true);
    if(seen.size===3&&seed>=12)break;
  }
  assert.deepEqual([...seen].sort(),['equipment','health','units']);
}
const {RoundFlow}=require('../assets/scripts/core/RoundFlow.ts');
const flow=new RoundFlow([{id:1,name:'test',enemies:[]}],inputs.battle);
assert.equal(flow.restoreHealth(5),0);assert.equal(flow.health,100);
const almostFull=new RoundFlow([{id:1,name:'test',enemies:[]}],inputs.battle,{phase:'prepare',waveIndex:0,health:99,result:null,lastSettlement:null});
assert.equal(almostFull.restoreHealth(5),1);assert.equal(almostFull.health,100);
const dead=new RoundFlow([{id:1,name:'test',enemies:[]}],inputs.battle,{phase:'ended',waveIndex:0,health:0,result:'defeat',lastSettlement:null});
assert.equal(dead.restoreHealth(5),0,'healing cannot revive a defeated run');
console.log('PASS boss chests: all three seeded rewards, one-click delivery, reload stability, duplicate prevention, card conservation, capped +5 healing and 100 initial health');
