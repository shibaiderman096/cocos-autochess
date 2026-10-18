// Run the actual Cocos adapter methods with only UI and elapsed-time boundaries replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.join(__dirname, '../assets/scripts/view/BattleStage.ts');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
const stageClass = source.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'BattleStage');
const names = ['manualEncounter', 'refreshNextWaveButton', 'nextSpecialEncounter', 'scheduleNextWave', 'update'];
const methods = names.map(name => stageClass.members.find(n => n.name?.getText(source) === name).getText(source));
const compiled = ts.transpileModule(`class Stage { ${methods.join('\n')} } exports.Stage=Stage;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const out = {}; new Function('exports', compiled)(out);
function makeStage(kind, phase = 'settlement') {
  const stage = new out.Stage();
  stage.flow = { phase, wave: { encounterKind: kind } };
  stage.session = { flow: stage.flow, canAdvanceWave: () => stage.flow.phase === 'settlement'
    && !stage.session.pendingStageReward && !stage.session.pendingEquipmentReward };
  Object.assign(stage, { loaded: true, transitioning: false, draggingId: 0, resultShown: true,
    cfg: { battle: { nextWaveDelaySeconds: 1 } }, sim: { finished: true }, nextWaveRemaining: null,
    replayer: { syncViews() {} }, refreshDetailVitals() {}, restarts: 0,
    restart() { this.restarts++; this.nextWaveRemaining = null; },
    ui: { setNextWaveVisible(value) { this.nextVisible = value; }, showWarn(message) { this.warning = message; } },
  });
  return stage;
}
for (const kind of [undefined, 'normal', 'monster', 'elite', 'specialShop', 'boss']) {
  const stage = makeStage(kind), manual = kind === 'specialShop' || kind === 'boss';
  stage.scheduleNextWave();
  assert.equal(stage.ui.nextVisible, manual, `${kind}: only shop/boss display next button`);
  assert.equal(stage.nextWaveRemaining, manual ? null : 1);
  stage.update(.5); assert.equal(stage.restarts, 0);
  stage.update(.5); assert.equal(stage.restarts, manual ? 0 : 1, `${kind}: other encounters advance automatically`);
  stage.nextSpecialEncounter(); assert.equal(stage.restarts, 1, `${kind}: next button handles only manual encounters`);
  stage.flow.phase = 'battle'; stage.refreshNextWaveButton(); assert.equal(stage.ui.nextVisible, false);
  stage.flow.phase = 'ended'; stage.scheduleNextWave();
  assert.equal(stage.ui.nextVisible, false); assert.equal(stage.nextWaveRemaining, null);
}
for (const kind of ['monster', 'elite', 'normal']) {
  const stage = makeStage(kind);
  stage.session.pendingStageReward = { kind: 'unitBundle' };
  stage.scheduleNextWave(); assert.equal(stage.ui.nextVisible, false); assert.equal(stage.nextWaveRemaining, null);
  delete stage.session.pendingStageReward;
  stage.scheduleNextWave(); stage.update(1); assert.equal(stage.restarts, 1, 'auto advance resumes after claiming reward');
  stage.session.pendingEquipmentReward = {};
  stage.scheduleNextWave(); assert.equal(stage.nextWaveRemaining, null);
  delete stage.session.pendingEquipmentReward;
  stage.scheduleNextWave(); stage.update(1); assert.equal(stage.restarts, 2);
}
const shop = makeStage('specialShop', 'prepare');
shop.session.pendingStageReward = { id: 'shop', kind: 'specialShop' };
shop.chooseStageReward = action => {
  assert.deepEqual(action, { type: 'stageChoice', rewardId: 'shop', choice: 'continue' });
  delete shop.session.pendingStageReward; shop.flow.phase = 'settlement';
};
shop.refreshNextWaveButton(); assert.equal(shop.ui.nextVisible, true);
shop.nextSpecialEncounter(); assert.equal(shop.restarts, 1);
const boss = makeStage('boss'); boss.session.pendingStageReward = { kind: 'bossChoice' };
boss.nextSpecialEncounter(); assert.equal(boss.restarts, 0); assert.ok(boss.ui.warning);
delete boss.session.pendingStageReward;
boss.nextSpecialEncounter(); assert.equal(boss.restarts, 1);
console.log('PASS encounter advancement: shop/boss buttons, other encounters auto-advance, reward gates, shop exit and run-end states');
