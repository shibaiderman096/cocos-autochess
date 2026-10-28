// Isolated browser context: fixtures never change the player's browser save.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.ENCOUNTER_PLAYWRIGHT || 'playwright');
const output = path.resolve('.test-build/travel-shop-ui');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const report = {}, errors = [], resourceErrors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'warning' && /Cannot load|Failed to load/.test(msg.text())) resourceErrors.push(msg.text()); });
    await page.goto('http://localhost:7456/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      window.cc = window.cc || await System.import('cc');
      if (!cc.find('Canvas')?.getComponentInChildren('BattleStage'))
        await new Promise((resolve, reject) => cc.director.loadScene('floating-ruins', e => e ? reject(e) : resolve()));
    });
    await page.waitForFunction(() => {
      const s = cc.find('Canvas')?.getComponentInChildren('BattleStage'); return s?.loaded && !s.loadScreen;
    }, null, { timeout: 60000 });
    report.offers = await page.evaluate(() => {
      const s = window.stage = cc.find('Canvas').getComponentInChildren('BattleStage'); s.enabled = false;
      for (let seed = 1; seed <= 100; seed++) {
        const run = new s.session.constructor(s.cfg, s.runConfig, s.waveTemplates, {
          runSeed: seed, stageCount: 6, enemyGenerationMode:'budget-v1', equipmentPolicy: s.equipmentPolicy,
          enemyRoles: s.enemyRoles, formationConfig: s.formationConfig, enemyDifficulty: s.enemyDifficulty, enemyPower: s.enemyPower,
        });
        run.level.level = 10;
        const wave = run.waves.find(w => w.stage === 2 && w.encounterKind === 'specialShop'); run.debugJump(2, wave.round);
        if (run.pendingStageReward.offers.some(o => o.kind === 'unit')) { s.session = run; break; }
      }
      s.ui.hideOpeningEncounter(); s.ui.hideEquipmentReward(); s.nextWaveRemaining = null;
      s.economy.add(100); s.resetBattle(false); s.refreshShopUI(); s.refreshEconomyUI(); s.refreshRunUI();
      window.body = () => stage.stageRewards.root.getChildByName('stageRewardBody');
      window.card = i => body().children.find(n => n.getChildByName('stageChoice_' + i));
      window.point = node => {
        const world = node.getComponent('cc.UITransform').convertToWorldSpaceAR(new cc.Vec3());
        const screen = cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(world);
        const canvas = document.querySelector('canvas'), r = canvas.getBoundingClientRect();
        return { x: r.x + screen.x / canvas.width * r.width, y: r.y + (1 - screen.y / canvas.height) * r.height };
      };
      return s.session.pendingStageReward.offers;
    });
    async function settled() {
      await page.waitForFunction(() => stage.stageRewards.root.getComponentsInChildren('cc.Sprite').every(s => !!s.spriteFrame));
      await page.waitForTimeout(400);
    }
    async function click(fn, arg) { const p = await page.evaluate(fn, arg); await page.mouse.click(p.x, p.y); await page.waitForTimeout(180); }
    await settled();
    report.skins = await page.evaluate(() => ({
      body: body().getChildByName('skin').getComponent('cc.Sprite').spriteFrame.name,
      button: card(0).getChildByName('stageChoice_0').getChildByName('skin').getComponent('cc.Sprite').spriteFrame.name,
      normalShop: stage.ui.shopSlots.some(slot => slot.node.activeInHierarchy),
    }));
    assert.match(report.skins.body, /panel_dock/); assert.match(report.skins.button, /btn_primary/); assert.equal(report.skins.normalShop, false);
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    const equipmentIndex = report.offers.findIndex(o => o.kind === 'equipment'), unitIndex = report.offers.findIndex(o => o.kind === 'unit');
    assert.ok(equipmentIndex >= 0 && unitIndex >= 0);
    await click(i => point(card(i).getChildByName('rewardArt')), equipmentIndex);
    assert.equal(await page.evaluate(() => !!stage.ui.equipmentDetail?.activeInHierarchy), true);
    await page.screenshot({ path: path.join(output, 'equipment-detail.png') });
    await click(() => point(stage.ui.equipmentDetail.getChildByName('closeEquipmentDetail')));
    for (const index of [equipmentIndex, unitIndex]) {
      const before = await page.evaluate(() => stage.economy.gold);
      await click(i => point(card(i).getChildByName('stageChoice_' + i)), index); await settled();
      assert.equal(await page.evaluate(i => stage.session.pendingStageReward.offers[i].bought, index), true);
      assert.equal(await page.evaluate(() => stage.economy.gold), before - report.offers[index].price);
      await click(i => point(card(i).getChildByName('stageChoice_' + i)), index);
      assert.equal(await page.evaluate(() => stage.economy.gold), before - report.offers[index].price, 'sold item cannot charge twice');
    }
    assert.ok(await page.evaluate(id => stage.save.unlockedUnits.includes(id), report.offers[unitIndex].id));
    await page.screenshot({ path: path.join(output, 'sold.png') });
    await page.evaluate(() => { stage.economy.spend(stage.economy.gold); stage.refreshEconomyUI(); stage.refreshRunUI(); });
    await settled();
    const unavailable = report.offers.findIndex((o, i) => i !== equipmentIndex && i !== unitIndex);
    report.unaffordable = await page.evaluate(i => {
      const b = card(i).getChildByName('stageChoice_' + i);
      return { caption: b.getChildByName('text').getComponent('cc.Label').string, skin: b.getChildByName('skin').getComponent('cc.Sprite').spriteFrame.name };
    }, unavailable);
    assert.match(report.unaffordable.caption, /差\d+金/); assert.match(report.unaffordable.skin, /btn_disabled/);
    await click(i => point(card(i).getChildByName('stageChoice_' + i)), unavailable);
    assert.equal(await page.evaluate(i => stage.session.pendingStageReward.offers[i].bought, unavailable), false);
    assert.equal(await page.evaluate(() => stage.economy.gold), 0);
    await page.screenshot({ path: path.join(output, 'unaffordable.png') });
    report.viewports = [];
    for (const [width, height] of [[960, 540], [2400, 1080]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(450);
      const points = await page.evaluate(() => body().children.filter(n => n.name === 'stageOffer').flatMap(n => {
        const t = n.getComponent('cc.UITransform'), h = t.contentSize;
        return [[-h.width / 2, -h.height / 2], [h.width / 2, h.height / 2]].map(([x, y]) => {
          const w = t.convertToWorldSpaceAR(new cc.Vec3(x, y, 0));
          const p = cc.find('Canvas').getComponent('cc.Canvas').cameraComponent.worldToScreen(w);
          const c = document.querySelector('canvas'), r = c.getBoundingClientRect();
          return { x: r.x + p.x / c.width * r.width, y: r.y + (1 - p.y / c.height) * r.height };
        });
      }));
      assert.ok(points.every(p => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height), 'all cards fit');
      await page.screenshot({ path: path.join(output, `${width}x${height}.png`) }); report.viewports.push({ width, height, cardsFit: true });
    }
    await click(() => point(stage.ui.nextWaveBtn));
    await page.waitForFunction(() => !stage.transitioning && stage.flow.wave.encounterKind !== 'specialShop');
    assert.equal(await page.evaluate(() => !!stage.stageRewards.root?.activeInHierarchy), false);
    assert.deepEqual(errors, []); assert.deepEqual(resourceErrors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ...report, errors, resourceErrors }, null, 2));
    console.log('PASS travel shop preview: shared skins, equipment inspector, purchases/unlock, sold/insufficient guards, next stage, three viewport sizes and zero page/resource errors');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
