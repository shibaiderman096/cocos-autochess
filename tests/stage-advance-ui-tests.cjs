// Run the actual Cocos adapter methods with only UI and elapsed-time boundaries replaced.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.join(__dirname, '../assets/scripts/view/BattleStage.ts');
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true);
const stageClass = source.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'BattleStage');
const names = ['manualEncounter', 'refreshNextWaveButton', 'nextSpecialEncounter', 'scheduleNextWave', 'update', 'openStageReward', 'chooseStageReward', 'finishStageReward'];
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
  const stage = makeStage(kind), manual = kind === 'specialShop';
  stage.scheduleNextWave();
  assert.equal(stage.ui.nextVisible, manual, `${kind}: only shop displays next button`);
  assert.equal(stage.nextWaveRemaining, manual ? null : 1);
  stage.update(.5); assert.equal(stage.restarts, 0);
  stage.update(.5); assert.equal(stage.restarts, manual ? 0 : 1, `${kind}: other encounters advance automatically`);
  stage.nextSpecialEncounter(); assert.equal(stage.restarts, 1, `${kind}: next button handles only manual encounters`);
  stage.flow.phase = 'battle'; stage.refreshNextWaveButton(); assert.equal(stage.ui.nextVisible, false);
  stage.flow.phase = 'ended'; stage.scheduleNextWave();
  assert.equal(stage.ui.nextVisible, false); assert.equal(stage.nextWaveRemaining, null);
}
for (const kind of ['monster', 'elite', 'normal', 'boss']) {
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
boss.scheduleNextWave(); assert.equal(boss.nextWaveRemaining, null);
boss.update(2); assert.equal(boss.restarts, 0);
delete boss.session.pendingStageReward;
boss.scheduleNextWave(); assert.equal(boss.ui.nextVisible, false);
boss.update(1); assert.equal(boss.restarts, 1);
console.log('PASS encounter advancement: shop button, boss and other encounters auto-advance, reward gates, shop exit and run-end states');

// Clicking a monster chest claims directly; failed/pending claims never skip rewards.
for (const outcome of ['success','failed','equipment']) {
  const stage=makeStage('monster');
  stage.session.pendingStageReward={id:'monster-chest',kind:'unitBundle',units:['helion']};
  stage.owned={snapshot:()=>[]};
  // This suite isolates reward/advancement gates; the actual asynchronous flight is covered by regression-tests.
  stage.flyChestRewards=(units,before)=>{assert.deepEqual(units,['helion']);assert.deepEqual(before,[]);return false;};
  let claims=0, panels=0;
  stage.session.claimStageReward=action=>{
    claims++; assert.deepEqual(action,{type:'stageChoice',rewardId:'monster-chest',choice:'claim'});
    if(outcome==='failed')return {ok:false};
    delete stage.session.pendingStageReward;
    if(outcome==='equipment')stage.session.pendingEquipmentReward={};
    return {ok:true};
  };
  for(const method of ['persistShopState','refreshOwnedViews','refreshShopUI','refreshEconomyUI','refreshRunUI'])stage[method]=()=>{};
  stage.stageRewards={show(){panels++;}};
  stage.openStageReward();
  assert.equal(claims,1);assert.equal(panels,0);
  assert.equal(stage.restarts,outcome==='success'?1:0);
  stage.openStageReward();assert.equal(stage.restarts,outcome==='success'?1:0,'repeat click does not advance twice');
}
const battleChest=makeStage('monster','battle');battleChest.session.pendingStageReward={kind:'unitBundle'};
battleChest.openStageReward();assert.equal(battleChest.restarts,0);
console.log('PASS monster chest: direct claim, immediate advancement, pending/failed reward gates and repeated clicks');
