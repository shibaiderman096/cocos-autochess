require('tsx/cjs');
const assert = require('node:assert/strict');
const { RunSession } = require('../assets/scripts/core/RunSession.ts');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { DEFAULT_STAGE_COUNT, buildRunWaves } = require('../assets/scripts/core/RunSetup.ts');
const { loadRunInputs, loadEnemyGenerationInputs, loadFormationInputs, loadEquipmentInputs } = require('../tools/run-simulation.ts');
const inputs = loadRunInputs(), deps = { ...loadEnemyGenerationInputs(), ...loadFormationInputs(), ...loadEquipmentInputs() };
const clone = v => JSON.parse(JSON.stringify(v));
function make(extra = {}, run = inputs.run) {
  const cfg = new ConfigManager(); cfg.setUnits(inputs.units); cfg.setSkills(inputs.skills); cfg.setBattle(inputs.battle); cfg.setEquipment(inputs.equipment);
  return new RunSession(cfg, run, inputs.waves, { ...deps, runSeed: 217, ...extra });
}
assert.equal(DEFAULT_STAGE_COUNT, 10);
const generation = { mode: 'budget-v1', runSeed: 217, difficulty: deps.enemyDifficulty, power: deps.enemyPower };
for (const options of [undefined, generation]) {
  const waves = buildRunWaves(12, inputs.run, inputs.waves, inputs.units, options);
  for (const [stage, round, amp, reduction] of [[10,10,0,0],[11,1,.01,.01],[11,10,.1,.01],[12,1,.11,.02],[12,10,.2,.02]]) {
    const wave = waves.find(w => w.stage === stage && w.round === round);
    for (const enemy of wave.enemies) { assert.equal(enemy.damageAmp ?? 0, amp); assert.equal(enemy.damageReduction ?? 0, reduction); }
  }
  assert.ok(waves.filter(w => w.stage === 11 && w.encounterKind === 'monster').every(w => w.enemies.every(e => e.damageAmp > 0 && e.damageReduction === .01)));
}
const capConfig = clone(inputs.run); capConfig.endlessProgression.startStage = 2;
const capped = buildRunWaves(99, capConfig, inputs.waves, inputs.units).find(w => w.stage === 99 && w.round === 1);
assert.ok(capped.enemies.every(e => e.damageReduction === .95));
console.log('PASS growth: legacy/budget waves, 10-stage boundary, cumulative rounds, monsters, bosses and reduction cap');
function settleBoss(s, stage = 10, winner = 0) {
  const boss = s.waves.find(w => w.stage === stage && w.encounterKind === 'boss');
  assert.ok(s.debugJump(stage, boss.round));
  if (!s.owned.onBoard().length) assert.ok(s.moveUnit(s.owned.all()[0].uid, { location: 'board', x: 3, y: 3 }).ok);
  const sim = s.startBattle(); assert.ok(sim); sim.end(winner); assert.ok(s.settleBattle());
}
function claim(s) {
  const p = s.pendingStageReward;
  assert.ok(s.claimStageReward({ type: 'stageChoice', rewardId: p.id, choice: 'claim' }).ok);
}
let session = make(); assert.equal(session.save.stageCount, 10); assert.equal(session.portalAvailable, false); assert.equal(session.enterPortal(), false);
settleBoss(session); assert.equal(session.portalAvailable, true); assert.equal(session.nextWave(), false); assert.equal(session.enterPortal(), false);
session = make({ save: session.snapshot() }); assert.equal(session.portalAvailable, true); assert.ok(session.pendingStageReward);
claim(session);
const before = session.snapshot();
session = make({ save: before }); assert.equal(session.portalAvailable, true);
assert.equal(session.enterPortal(), true); assert.equal(session.enterPortal(), false);
assert.equal(session.flow.wave.stage, 11); assert.equal(session.flow.wave.round, 1); assert.equal(session.flow.phase, 'prepare');
assert.equal(session.save.stageCount, 11); assert.equal(session.flow.health, before.round.health);
assert.equal(session.economy.gold, before.gold); assert.equal(session.level.level, before.level);
assert.deepEqual(session.owned.snapshot(), before.owned); assert.deepEqual(session.owned.equipmentReserve, before.equipmentReserve);
assert.deepEqual(session.waves.filter(w => w.stage <= 10), make().waves, 'extending a campaign never rerolls earlier encounters');
assert.ok(session.createPreview().sim.units.filter(u => u.side === 1).every(u => u.cfg.damageAmp >= .01 && u.cfg.damageReduction >= .01));
const resumed = make({ save: session.snapshot() }); assert.equal(resumed.flow.wave.stage, 11); assert.equal(resumed.portalAvailable, false);
settleBoss(session, 11); claim(session); assert.equal(session.enterPortal(), true); assert.equal(session.flow.wave.stage, 12);
const loss = make(); settleBoss(loss, 10, 1); assert.equal(loss.portalAvailable, false); assert.equal(loss.enterPortal(), false);
const oldRun = clone(inputs.run); delete oldRun.endlessProgression;
const old = make({}, oldRun); const migrated = make({ save: old.snapshot() }); assert.equal(migrated.flow.wave.stage, 1);
const wrongRun = clone(inputs.run); wrongRun.monsterAttackSpeed += .1;
assert.throws(() => make({ save: old.snapshot() }, wrongRun), /configuration mismatch/);
console.log('PASS portal: victory/reward gates, saved pending/claimed rewards, state preservation, repeated clicks, 11→12, loss and compatible-save migration');
