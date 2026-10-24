const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.ASTRAL_PLAYWRIGHT || 'playwright');
const output = path.resolve('.test-build/completed-unit-fx');
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const errors = [], report = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:7456/', { waitUntil: 'networkidle' });
    await page.evaluate(async () => { window.cc = await System.import('cc'); });
    await page.waitForFunction(() => cc.find('Canvas')?.getComponentInChildren('MainMenu')?.ready);
    await page.evaluate(() => new Promise((resolve, reject) => cc.director.loadScene('floating-ruins', e => e ? reject(e) : resolve())));
    await page.waitForFunction(() => { const s = cc.find('Canvas')?.getComponentInChildren('BattleStage'); return s?.loaded && !s.loadScreen; });
    await page.evaluate(() => {
      const s = window.stage = cc.find('Canvas').getComponentInChildren('BattleStage'); s.enabled = false;
      if (s.session.pendingOpeningEncounter) s.session.chooseOpeningEncounter(s.session.openingEncounterOptions[0].id);
      s.ui.hideOpeningEncounter(); s.ui.setShopContentOccupied(false);
      const Sim = s.sim.constructor;
      window.install = id => {
        const owned = [{ uid: 1, unitId: id, star: 1, location: 'board', x: 3, y: 3, equipment: [] }];
        s.owned.all().splice(0, s.owned.all().length, ...owned);
        s.session.createPreview = () => {
          const blank = () => ({ ...s.cfg.getUnit('helion'), hp: 20000, atk: 0, maxMana: 0, startMana: 0, skillId: undefined, armor: 0, mr: 0, critChance: 0 });
          const sim = new Sim(s.cfg, [{ cfg: { ...s.cfg.getUnit(id), critChance: 0 }, side: 0, x: 3, y: 3 },
            ...[{ x: 4, y: 3 }].map(p => ({ cfg: blank(), side: 1, ...p }))], { seed: 1024 });
          sim.units.forEach(u => u.atkCd = u.moveCd = 100000);
          sim.units[0].mana = sim.units[0].cfg.maxMana; sim.units[0].atkCd = 0;
          return { sim, battleIds: new Map([[1, 1]]) };
        };
        s.resetBattle(false); s.replayer.damageNumbers = false; s.replayer.healingNumbers = false;
      };
      window.advance = t => {
        while (s.sim.tick < Math.floor(t)) { s.sim.step(); if (s.sim.tick === 1) s.sim.units[0].atkCd = 100000; }
        s.replayer.consumeEvents(); s.replayer.syncViews(0, t - Math.floor(t));
      };
      window.visual = () => ({ tick: s.sim.tick,
        owner: { name: s.sim.units[0].cfg.name, damageType: s.sim.units[0].cfg.damageType, maxMana: s.sim.units[0].cfg.maxMana,
          x: s.views.get(1).node.position.x, y: s.views.get(1).node.position.y },
        hits: s.sim.events.filter(e => e.t === 'hit' && e.source === 1).length,
        slots: s.replayer.astralUnitVfx.slots.map(f => ({ active: f.node.active, frame: f.frameIndex, loaded: !!f.sprite.spriteFrame, first: f.firstFrame, angle: f.node.angle, pos: { x: f.node.position.x, y: f.node.position.y }, opacity: f.node.getComponent('cc.UIOpacity').opacity })),
        barrier: { active: s.views.get(1).stellarAura?.active ?? false, frame: s.views.get(1).stellarFrameIndex, loaded: !!s.views.get(1).stellarAura?.getComponent('cc.Sprite').spriteFrame,
          generic: s.views.get(1).shieldRing.active, width: s.views.get(1).stellarAura?.getComponent('cc.UITransform').width ?? 0 }
      });
    });
    for (const id of ['milu', 'star_armor_guard']) {
      await page.evaluate(id => { install(id); advance(1.1); }, id);
      await page.waitForFunction(() => stage.views.get(1).visualReady && stage.replayer.astralUnitVfx.slots.length > 0 && stage.replayer.astralUnitVfx.slots.every(s => s.frames.filter(Boolean).length === 8));
      if (id === 'star_armor_guard') await page.waitForFunction(() => stage.views.get(1).stellarFrames.filter(Boolean).length === 8);
      const atStart = await page.evaluate(() => visual());
      await page.waitForTimeout(250); assert.deepEqual(await page.evaluate(() => visual()), atStart, 'pause holds frame, position and opacity');
      const frames = path.join(output, id); fs.mkdirSync(frames, { recursive: true });
      const samples = [];
      for (let i = 0; i < 42; i++) {
        const t = 1.1 + i * .5;
        await page.evaluate(t => advance(t), t);
        await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (i < 18) samples.push(await page.evaluate(() => visual()));
        if (process.env.ASTRAL_RECORD === '1') await page.screenshot({ path: path.join(frames, String(i).padStart(3, '0') + '.png'), clip: { x: 380, y: 200, width: 600, height: 360 } });
        if (i === 5) await page.screenshot({ path: path.join(output, id + '.png') });
      }
      assert.ok(samples.some(v => v.slots.some(f => f.active && f.loaded)), 'painted effect visible');
      assert.ok(new Set(samples.flatMap(v => v.slots.filter(f => f.active).map(f => f.frame))).size >= 5, 'at least five painted phases rendered');
      if (id === 'milu') {
        assert.deepEqual(atStart.slots.map(f => f.first).sort(), [0]);
        assert.equal(atStart.owner.name, '流星灵狐'); assert.equal(atStart.owner.maxMana, 30); assert.equal(atStart.hits, 0);
        assert.ok(new Set(samples.slice(0, 8).map(s => `${s.owner.x},${s.owner.y}`)).size > 2, 'real portrait travels continuously');
        assert.ok(samples.filter(s => s.tick < 5).every(s => s.hits === 0), 'no damage before landing');
        assert.ok(samples.some(s => s.tick >= 5 && s.hits === 1 && s.slots.some(f => f.first === 8 && f.active)), 'impact appears at arrival');
      }
      if (id === 'star_armor_guard') {
        assert.equal(atStart.owner.damageType, 'magic');
        assert.ok(atStart.barrier.width > 100, 'atlas gutters compensated in live portrait size');
        assert.equal(atStart.barrier.generic, false, 'painted stellar shield replaces generic gold ring');
        assert.ok(samples.every(v => v.barrier.active && v.barrier.loaded));
        assert.ok(new Set(samples.map(v => v.barrier.frame)).size >= 5, 'barrier loops painted phases');
        await page.evaluate(() => { stage.sim.units[0].stellarShield = null; stage.replayer.syncViews(0); });
        assert.equal((await page.evaluate(() => visual())).barrier.active, false, 'shield break clears barrier');
      }
      const events = await page.evaluate(() => stage.sim.events);
      assert.ok(events.some(e => e.t === 'dash'), 'real BattleSim cast triggers painted effect');
      if (id === 'milu') assert.ok(!events.some(e => e.t === 'teleport'), 'fox displacement never teleports');
      report[id] = { atStart, samples, events };
      report[id].speed = await page.evaluate(id => {
        const sample = (speed, frames) => { install(id); for (let i = 0; i < frames; i++) stage.driver.advance(speed / 60); stage.replayer.consumeEvents(); stage.replayer.syncViews(0, stage.driver.interpolation, speed); return visual(); };
        return { normal: sample(1, 12), double: sample(2, 6) };
      }, id);
      assert.deepEqual(report[id].speed.normal, report[id].speed.double, '1x/2x same simulation time has same phase');
      await page.evaluate(() => { stage.sim.end(-1); stage.replayer.consumeEvents(); stage.replayer.syncViews(0); });
      const ended = await page.evaluate(() => visual());
      assert.ok(ended.slots.every(s => !s.active)); assert.equal(ended.barrier.active, false);
      await page.evaluate(id => install(id), id);
      assert.equal((await page.evaluate(() => visual())).slots.length, 0, 'rebind clears old effect pool');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ...report, errors }, null, 2));
    console.log('PASS Creator 1280x720: real Milu/guardian casts, painted phases, pause, 1x/2x equivalence, shield break, battle end and rebind cleanup');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
