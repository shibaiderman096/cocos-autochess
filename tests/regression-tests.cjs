// Exercise the real shop and stage code. Cocos rendering is replaced only at
// the Node/Component boundary, so these tests do not claim visual validation.
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const core = name => require(path.join(root, 'assets/scripts/core', name + '.ts'));
const { CardPool } = core('CardPool');
const { OwnedUnits } = core('OwnedUnits');
const { ShopSystem } = core('ShopSystem');
const { EconomySystem } = core('EconomySystem');
const { Rng } = core('Rng');
const { migrateSaveV2, freshSaveV2, SAVE_KEY } = core('ShopSave');
const units = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/units.json'), 'utf8'));
const skills = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/skills.json'), 'utf8'));
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}

class Vec3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z = 0) { Object.assign(this, { x, y, z }); }
  clone() { return new Vec3(this.x, this.y, this.z); }
}
class Component { getComponent(T) { return this.node.getComponent(T); } }
class Node {
  static EventType = { TOUCH_START: 'start', TOUCH_MOVE: 'move', TOUCH_END: 'end', TOUCH_CANCEL: 'cancel' };
  constructor(name) { this.name = name; this.position = new Vec3(); this.children = []; this.components = new Map(); this.events = new Map(); this.active = true; }
  addChild(n) { n.parent = this; this.children.push(n); }
  getChildByName(name) { return this.children.find(n => n.name === name); }
  addComponent(T) { const c = new T(); c.node = this; this.components.set(T, c); return c; }
  getComponent(T) { return this.components.get(T); }
  setPosition(x, y, z) { this.position = typeof x === 'object' ? x.clone() : new Vec3(x, y, z); }
  setScale() {}
  removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
  on(type, fn, context) { this.events.set(type, { fn, context }); }
  off(type) { this.events.delete(type); }
  destroy() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
}
class UITransform { setContentSize(w, h) { this.contentSize = { width: w, height: h }; } convertToNodeSpaceAR(p) { return p; } }
class Color { constructor(...rgba) { this.rgba = rgba; } static WHITE = new Color(255, 255, 255); }
class Graphics { rect() {} roundRect() {} fill() {} stroke() {} }
class Label {}
class BoardView {
  boardPixelW = 530; boardPixelH = 342;
  initialize(w, h) { this.boardWidth = w; this.boardHeight = h; }
  cellToWorld(x, y) { return new Vec3((x - 3.5) * 60, (y - 2.5) * 54); }
  worldToCell(x, y) {
    const col = Math.round(x / 60 + 3.5), row = Math.round(y / 54 + 2.5);
    return col >= 0 && col < 8 && row >= 0 && row < 6 ? { x: col, y: row } : null;
  }
  isOwnCell(y) { return y >= 0 && y < 3; }
}
class UnitView { setup(cfgId, side, unitId) { Object.assign(this, { cfgId, side, unitId }); } }
class BattleReplayer {
  bind(sim, views) { this.sim = sim; this.views = views; this.eventCursor = 0; }
  setFxRoot(root) { this.fxRoot = root; }
  consumeEvents() { this.seen = this.sim.events.slice(this.eventCursor); this.eventCursor = this.sim.events.length; }
  syncViews() {}
}
class BattleUI {
  init() {} refreshTop() {} hideFightBtn() {} showFightBtn() {}
  hideResult() {} showResult() {} showWarn(msg) { this.warn = msg; }
  refreshShop(slots) { this.slots = slots; }
  setShopVisible(v) { this.shopVisible = v; }
}
const stageFile = path.join(root, 'assets/scripts/view/BattleStage.ts');
const code = ts.transpileModule(fs.readFileSync(stageFile, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
} }).outputText;
const stageExports = {};
const viewMocks = { './BoardView': { BoardView }, './UnitView': { UnitView }, './BattleReplayer': { BattleReplayer }, '../ui/BattleUI': { BattleUI } };
new Function('require', 'exports', code)(id => {
  if (id === 'cc') return { Component, Node, Vec3, UITransform, Graphics, Label, Color, JsonAsset: class {},
    _decorator: { ccclass: () => c => c, property: () => () => {} },
    resources: { load: (name, T, cb) => cb(null, { json: name === 'config/units' ? units : skills }) } };
  return viewMocks[id] ?? require(path.resolve(path.dirname(stageFile), id) + '.ts');
}, stageExports);
const storage = new Map();
global.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
async function makeStage(saved) {
  storage.clear(); if (saved) storage.set(SAVE_KEY, JSON.stringify(saved));
  const stage = new stageExports.BattleStage();
  const canvas = new Node('Canvas'); stage.node = new Node('Stage'); canvas.addChild(stage.node);
  stage.boardNode = new Node('Board'); canvas.addChild(stage.boardNode);
  stage.boardNode.addComponent(BoardView);
  await stage.start(); return stage;
}
const touch = pos => ({ getUILocation: () => pos });
function drag(stage, from, to) {
  stage.onTouchStart(touch(from)); stage.onTouchMove(touch(to)); stage.onTouchEnd(touch(to));
}

(async () => {
  await test('refresh conserves cards across owned, shop and remaining pool', () => {
    const pool = new CardPool(units); const owned = new OwnedUnits();
    const shop = new ShopSystem(pool, owned, new EconomySystem(undefined, { gold: 100 }), new Map(units.map(u => [u.id, u])), new Rng(42), () => 1, 9);
    pool.take('warrior'); owned.addToBench('warrior', 9);
    const total = new CardPool(units).total();
    const accounted = () => pool.total() + shop.slots.filter(s => s.unitId).length + owned.all().reduce((n,u) => n + 3 ** (u.star - 1), 0);
    assert.equal(accounted(), total);
    for (let i = 0; i < 10; i++) { shop.refresh(); assert.equal(accounted(), total); }
    const before = pool.total(); assert.equal(shop.buy(0).error, undefined);
    assert.equal(pool.total(), before, 'purchase must transfer reserved card without a second deduction');
    assert.equal(accounted(), total);
    shop.returnUnbought(); shop.returnUnbought(); assert.equal(accounted(), total);
  });
  await test('last reserved card remains purchasable', () => {
    const pool = new CardPool([units[0]], { warrior: 1 });
    const shop = new ShopSystem(pool, new OwnedUnits(), new EconomySystem(), new Map([['warrior', units[0]]]), new Rng(42), () => 1, 9);
    assert.equal(shop.slots.filter(s => s.unitId).length, 1);
    assert.equal(pool.count('warrior'), 0);
    assert.equal(shop.buy(0).error, undefined);
  });
  await test('zero inventory survives save migration and reload', () => {
    const pool = new CardPool(units, { warrior: 0, archer: 0, mage: 0 });
    const migrated = migrateSaveV2({ pool: pool.snapshot() });
    assert.equal(new CardPool(units, migrated.pool).total(), 0);
  });
  await test('fresh game renders bench and populates shop without charging', async () => {
    const stage = await makeStage();
    assert.equal(stage.ownedViews?.size, 3);
    assert.equal(stage.ui.slots.filter(s => s.unitId).length, 5);
    assert.equal(stage.economy.gold, freshSaveV2().gold);
  });
  await test('bench drag deploys, enforces cap, undeploys, and binds new nodes', async () => {
    const stage = await makeStage(); const bv = stage.boardNode.getComponent(BoardView);
    const first = stage.owned.all()[0], second = stage.owned.all()[1];
    drag(stage, stage.benchSlotWorld(first.y), bv.cellToWorld(2, 2));
    assert.equal(first.location, 'board');
    assert.equal(stage.ownedViews.get(first.uid).node.events.size, 4);
    drag(stage, stage.benchSlotWorld(second.y), bv.cellToWorld(3, 2));
    assert.equal(second.location, 'bench', 'level 1 cap must reject second deployment');
    drag(stage, bv.cellToWorld(2, 2), stage.benchSlotWorld(5));
    assert.equal(first.location, 'bench'); assert.equal(first.y, 5);
  });
  await test('ally view IDs match events without overwriting enemies', async () => {
    const stage = await makeStage(); const ally = stage.owned.all()[0];
    stage.owned.move(ally.uid, { location: 'board', x: 2, y: 2 });
    stage.createSim(false); stage.createViews();
    assert.equal(stage.views.size, stage.sim.units.length);
    for (const u of stage.sim.units) {
      assert.equal(stage.views.get(u.id)?.side, u.side);
      assert.equal(stage.views.get(u.id)?.cfgId, u.cfg.id);
    }
  });
  await test('startFight binds current simulation and restart restores free shop', async () => {
    const stage = await makeStage(); const bv = stage.boardNode.getComponent(BoardView);
    drag(stage, stage.benchSlotWorld(0), bv.cellToWorld(2, 2));
    const old = stage.sim; stage.startFight();
    assert.notEqual(stage.sim, old); assert.equal(stage.replayer.sim, stage.sim);
    stage.update(0.1); assert.ok(stage.replayer.seen.length > 0);
    stage.sim.run(); stage.update(0.1);
    const gold = stage.economy.gold, floor = stage.save.floor;
    stage.restart();
    assert.equal(stage.ui.shopVisible, true); assert.equal(stage.economy.gold, gold);
    assert.equal(stage.save.floor, floor + 1);
    assert.equal(stage.ui.slots.filter(s => s.unitId).length, 5);
    assert.equal(stage.replayer.sim, stage.sim);
  });
  await test('purchase immediately renders new bench unit and persists initialization', async () => {
    const stage = await makeStage(); stage.buyFromShop(0);
    assert.equal(stage.ownedViews?.size, stage.owned.all().length);
    const saved = JSON.parse(storage.get(SAVE_KEY));
    assert.equal(saved.owned.length, stage.owned.all().length);
    const reloaded = await makeStage(saved);
    assert.deepEqual(reloaded.pool.snapshot(), stage.pool.snapshot());
    assert.deepEqual(reloaded.shop.snapshot(), stage.shop.snapshot());
  });
  await test('legacy unreserved shop is deducted exactly once on restore', async () => {
    const saved = { ...freshSaveV2(), pool: { warrior: 29, archer: 30, mage: 18 },
      owned: [{ uid: 1, unitId: 'warrior', star: 1, location: 'bench', x: -1, y: 0 }],
      shop: Array.from({ length: 5 }, () => ({ unitId: 'warrior' })) };
    const stage = await makeStage(saved);
    assert.equal(stage.pool.count('warrior'), 24);
    const snapshot = JSON.parse(storage.get(SAVE_KEY));
    assert.equal(snapshot.shopReserved, true);
    const reloaded = await makeStage(snapshot);
    assert.equal(reloaded.pool.count('warrior'), 24);
  });
  await test('full bench merge and sale return the original three cards', () => {
    const pool = new CardPool([units[0]]); const owned = new OwnedUnits();
    pool.take('warrior'); pool.take('warrior');
    owned.addToBench('warrior', 2); owned.addToBench('warrior', 2);
    const shop = new ShopSystem(pool, owned, new EconomySystem(), new Map([['warrior', units[0]]]), new Rng(1), () => 1, 2);
    assert.equal(shop.buy(0).error, undefined);
    assert.equal(owned.all().length, 1); assert.equal(owned.all()[0].star, 2);
    shop.sell(owned.all()[0].uid); shop.returnUnbought();
    assert.equal(pool.count('warrior'), 30);
  });
  await test('empty formation cannot start, and combat locks purchases and dragging', async () => {
    const stage = await makeStage(); stage.startFight();
    assert.equal(stage.fighting, false);
    const bv = stage.boardNode.getComponent(BoardView);
    drag(stage, stage.benchSlotWorld(0), bv.cellToWorld(2, 2)); stage.startFight();
    const gold = stage.economy.gold, snapshot = stage.owned.snapshot();
    stage.buyFromShop(0); stage.refreshShop();
    drag(stage, bv.cellToWorld(2, 2), stage.benchSlotWorld(0));
    assert.equal(stage.economy.gold, gold); assert.deepEqual(stage.owned.snapshot(), snapshot);
  });
  await test('cancelled or invalid drag restores position and does not persist a move', async () => {
    const stage = await makeStage(); const initial = stage.owned.snapshot();
    const original = stage.benchSlotWorld(0), target = stage.boardNode.getComponent(BoardView).cellToWorld(2, 2);
    stage.onTouchStart(touch(original)); stage.onTouchMove(touch(target));
    stage.onTouchEnd({ ...touch(target), type: Node.EventType.TOUCH_CANCEL });
    assert.deepEqual(stage.owned.snapshot(), initial);
    assert.deepEqual(stage.ownedViews.get(1).node.position, original);
    drag(stage, original, new Vec3(999, 999));
    assert.deepEqual(stage.owned.snapshot(), initial);
    assert.deepEqual(stage.ownedViews.get(1).node.position, original);
  });
  console.log(`Regression: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
