const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT || 'playwright');
const output = path.resolve('docs/evidence/home-portal'); fs.mkdirSync(output, { recursive: true });
(async () => {
 const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
 try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:7456/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!window.System);
  await page.evaluate(async () => {
    const cc = window.cc || await System.import('cc'); window.testCC = cc;
    if (!cc.find('Canvas')?.getComponentInChildren('MainMenu')) await new Promise((resolve, reject) => cc.director.loadScene('main', e => e ? reject(e) : resolve()));
    window.point = node => {
      const world = node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
      const screen = cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
      const canvas = document.querySelector('canvas'), rect = canvas.getBoundingClientRect();
      return { x: rect.x + screen.x / canvas.width * rect.width, y: rect.y + (1 - screen.y / canvas.height) * rect.height };
    };
  });
  await page.waitForFunction(() => testCC.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
  await page.evaluate(() => { window.menu = testCC.find('Canvas').getComponentInChildren('MainMenu'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, '01-home.png') });
  const report = { menu: await page.evaluate(() => ({ stages: menu.stageCount, start: menu.node.getChildByName('startGame').position, selector: !!menu.node.getChildByName('runSetup') })) };
  assert.equal(report.menu.stages, 10); assert.equal(report.menu.selector, false);
  assert.ok(report.menu.start.x > 0 && report.menu.start.y < 0);
  const click = async expression => { const p = await page.evaluate(expression); await page.mouse.click(p.x, p.y); await page.waitForTimeout(180); };
  await click(() => point(menu.node.getChildByName('menuHeader').getChildByName('openCollection_units')));
  assert.equal(await page.evaluate(() => menu.collection.root.active), true);
  await page.waitForFunction(() => menu.collection.body.getComponentsInChildren('cc.Sprite').filter(sprite => sprite.node.activeInHierarchy).every(sprite => !!sprite.spriteFrame));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(output, '02-units.png') });
  await click(() => point(menu.collection.body.getChildByName('collectionDetail').getChildByName('collectionStar_3')));
  assert.equal(await page.evaluate(() => menu.collection.star), 3);
  assert.equal(await page.evaluate(() => menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI').currentDetail.star), 3);
  await click(() => point(menu.collection.body.getChildByName('collectionDetail').getChildByName('unitDetail').getChildByName('skillIcon')));
  assert.equal(await page.evaluate(() => menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI').detailPopup.active), true, 'collection uses the live skill popup');
  await click(() => point(menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI').detailPopupClose));
  await click(() => point(menu.collection.body.getChildByName('collectionDetail').getChildByName('unitDetail').getChildByName('attr_aspd')));
  assert.equal(await page.evaluate(() => menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI').detailPopupTitle.string), '攻速说明');
  await click(() => point(menu.collection.body.getChildByName('collectionDetail').getComponent('BattleUI').detailPopupClose));
  await click(() => point(menu.collection.body.getChildByName('collectionNext')));
  assert.equal(await page.evaluate(() => menu.collection.page), 1);
  await click(() => point(menu.collection.body.getChildByName('collectionTab_traits')));
  await page.waitForTimeout(350); await page.screenshot({ path: path.join(output, '03-traits.png') });
  // Visit every trait including memberless reserved traits and all long effect panels.
  report.traits = await page.evaluate(() => menu.collection.entries().map(e => e.id)); report.traitBounds = [];
  for (const id of report.traits) {
    await page.evaluate(id => { const c = menu.collection, i = c.entries().findIndex(e => e.id === id); c.page = Math.floor(i / 8); c.selected = i; c.render(); }, id);
    await page.waitForTimeout(80);
    report.traitBounds.push(await page.evaluate(() => { const node = menu.collection.traitPanel.detail; return { id: menu.collection.entries()[menu.collection.selected].id, position: node?.position, size: node?.getComponent('cc.UITransform').contentSize }; }));
  }
  await page.evaluate(() => { const c=menu.collection,i=c.entries().findIndex(e=>e.id==='sunlight'); c.page=Math.floor(i/8);c.selected=i;c.render(); });
  await page.mouse.move(1000, 450); await page.mouse.wheel(0, 600); await page.waitForTimeout(250);
  assert.ok(await page.evaluate(() => menu.collection.traitPanel.catalogViewport.getComponent('cc.ScrollView').getScrollOffset().y > 0), 'long trait panel really scrolls');
  await page.screenshot({ path: path.join(output, '03b-trait-scroll.png') });
  await click(() => point(menu.collection.body.getChildByName('collectionTab_equipment')));
  await page.waitForFunction(() => menu.collection.body.getComponentsInChildren('cc.Sprite').every(sprite => !!sprite.spriteFrame));
  await page.screenshot({ path: path.join(output, '04-equipment.png') });
  const equipmentBefore = await page.evaluate(() => localStorage.getItem('autochess_save_v3'));
  await click(() => point(menu.collection.root.getChildByName('closeCollection')));
  assert.equal(await page.evaluate(() => menu.collection.root.active), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('autochess_save_v3')), equipmentBefore);
  await click(() => point(menu.node.getChildByName('startGame')));
  await page.waitForFunction(() => testCC.find('Canvas/Stage')?.getComponent('BattleStage')?.loaded, null, { timeout: 45000 });
  await page.evaluate(() => { window.stage = testCC.find('Canvas/Stage').getComponent('BattleStage'); });
  assert.equal(await page.evaluate(() => stage.save.stageCount), 10);
  await page.evaluate(() => {
    const s = stage;
    if (s.session.pendingOpeningEncounter) s.session.chooseOpeningEncounter('inspiration');
    const boss = s.waves.find(w => w.stage === 10 && w.encounterKind === 'boss');
    if (!s.session.debugJump(10, boss.round)) throw Error('debug jump failed');
    const unit = s.owned.all()[0]; s.session.moveUnit(unit.uid, { location: 'board', x: 3, y: 3 });
    const sim = s.session.startBattle(); sim.end(0); s.session.settleBattle();
    s.resultShown = true; s.fighting = false; s.resetBattle(false); s.refreshRunUI(); s.showSettlement(); s.scheduleNextWave();
  });
  assert.equal(await page.evaluate(() => stage.expeditionPortal.activeInHierarchy), true);
  await click(() => point(stage.expeditionPortal));
  assert.equal(await page.evaluate(() => stage.flow.wave.stage), 10, 'unclaimed rewards block the portal');
  await page.evaluate(() => {
    const s = stage; let p = s.session.pendingStageReward;
    s.session.claimStageReward({ type: 'stageChoice', rewardId: p.id, choice: 'claim' });
    s.stageRewards.hide(); s.refreshRunUI(); s.scheduleNextWave();
  });
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(() => stage.flow.wave.stage), 10, 'does not auto-advance');
  await page.screenshot({ path: path.join(output, '05-portal.png') });
  report.before = await page.evaluate(() => ({ gold: stage.economy.gold, units: stage.owned.snapshot(), equipment: [...stage.owned.equipmentReserve], health: stage.flow.health }));
  await click(() => point(stage.expeditionPortal));
  await page.waitForFunction(() => stage.flow.wave.stage === 11 && !stage.transitioning);
  report.after = await page.evaluate(() => ({ gold: stage.economy.gold, units: stage.owned.snapshot(), equipment: [...stage.owned.equipmentReserve], health: stage.flow.health, round: stage.flow.wave.round, enemies: stage.flow.wave.enemies }));
  assert.equal(report.after.round, 1); assert.equal(report.after.gold, report.before.gold); assert.deepEqual(report.after.units, report.before.units);
  assert.deepEqual(report.after.equipment, report.before.equipment); assert.equal(report.after.health, report.before.health);
  assert.ok(report.after.enemies.every(e => e.damageAmp === .01 && e.damageReduction === .01));
  await page.screenshot({ path: path.join(output, '06-stage11.png') });
  report.errors = errors; fs.writeFileSync(path.join(output, 'browser-acceptance.json'), JSON.stringify(report, null, 2)); assert.deepEqual(errors, []);
  console.log('PASS browser: home, all collections, star/page/detail controls, fixed start, portal pointer/reward gates, no auto-advance, preserved state and stage 11 growth');
 } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
