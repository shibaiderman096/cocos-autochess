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
const sceneLoads = [];
const { BoardGeometry } = require('../assets/scripts/view/BoardGeometry.ts');
const { SHOP_DROP_AREA, containsShopDrop } = require('../assets/scripts/ui/BattleUILayout.ts');
const shopDrop = () => new Vec3(SHOP_DROP_AREA.x, SHOP_DROP_AREA.y - 60);
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
class UITransform {
  setContentSize(w, h) { this.contentSize = { width: w, height: h }; }
  convertToNodeSpaceAR(p) {
    const local=p.clone();
    for(let node=this.node;node;node=node.parent) { local.x-=node.position.x;local.y-=node.position.y; }
    return local;
  }
}
class Color { constructor(...rgba) { this.rgba = rgba; } static WHITE = new Color(255, 255, 255); }
class Graphics { rect() {} roundRect() {} fill() {} stroke() {} }
class Label {}
class BoardView {
  boardPixelW = 530; boardPixelH = 342;
  initialize(w, h, size) {
    this.boardWidth = w; this.boardHeight = h;
    this.geometry = new BoardGeometry(w, h, size);
    this.boardPixelW = this.geometry.width; this.boardPixelH = this.geometry.height;
  }
  cellToWorld(x, y) {
    const c = this.geometry.cells.find(c => c.x === x && c.y === y).center;
    return new Vec3(c.x, c.y);
  }
  worldToCell(x, y) {
    const c = this.geometry.cellAt(x, y);
    return c ? { x: c.x, y: c.y } : null;
  }
  isOwnCell(y) { return y >= 0 && y < this.boardHeight / 2; }
}
class UnitView {
  setup(cfgId, side, unitId) { Object.assign(this, { cfgId, side, unitId }); this.star = 1; }
  setStar(star) { this.star = star; }
}
class BattleReplayer {
  bind(sim, views) { this.sim = sim; this.views = views; this.eventCursor = 0; }
  setFxRoot(root) { this.fxRoot = root; }
  consumeEvents() { this.seen = this.sim.events.slice(this.eventCursor); this.eventCursor = this.sim.events.length; }
  syncViews() {}
}
class BattleUI {
  init() { this.node.addComponent(UITransform); } hideFightBtn() {} showFightBtn() {}
  refreshTop(gold, floor, lv, rates) { this.top = { gold, floor, level: lv.level, exp: lv.exp, cap: lv.unitCap }; this.rates=rates; }
  refreshFormation() {}
  refreshRun(...args) { this.run = args; } setLocked(v) { this.locked = v; }
  clearSellPreview() { this.sale = null; } showSellPreview(...args) { this.sale = args; }
  isInSellArea(x,y) { return this.shopVisible !== false && containsShopDrop(x,y); }
  showUnitDetail(data) { this.detail = data; this.unitDetailVisible=true; }
  closeUnitDetail() { this.unitDetailVisible=false; }
  updateUnitVitals(...args) { this.vitals=args; }
  setCombatActive(v) { this.combatActive=v; }
  hideResult() {} showResult() {} showWarn(msg) { this.warn = msg; }
  refreshShop(slots) { this.slots = slots; }
  setShopVisible(v) { this.shopVisible = v; this.clearSellPreview(); }
}
const stageFile = path.join(root, 'assets/scripts/view/BattleStage.ts');
const code = ts.transpileModule(fs.readFileSync(stageFile, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
} }).outputText;
const stageExports = {};
const viewMocks = { './BoardView': { BoardView }, './UnitView': { UnitView }, './BattleReplayer': { BattleReplayer }, '../ui/BattleUI': { BattleUI }, '../ui/UISkin': { setUISkin() {} } };
new Function('require', 'exports', code)(id => {
  if (id === 'cc') return { Component, Node, Vec3, UITransform, Graphics, Label, Color, JsonAsset: class {},
    director: { loadScene: name => { sceneLoads.push(name); return true; } },
    _decorator: { ccclass: () => c => c, property: () => () => {} },
    resources: { load: (name, T, cb) => cb(null, { json: JSON.parse(fs.readFileSync(path.join(root, 'assets/resources', name + '.json'), 'utf8')) }) } };
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
// Board inputs become Canvas coordinates, including the board's 60-pixel offset.
const touch = pos => ({ getUILocation: () => new Vec3(pos.x,pos.y+60) });
function twoUnitSave() {
  const saved = freshSaveV2(); saved.shopReserved = true;
  saved.owned = [{uid:1,unitId:'warrior',star:1,location:'bench',x:-1,y:0},
    {uid:2,unitId:'archer',star:1,location:'bench',x:-1,y:1}];
  return saved;
}
function drag(stage, from, to) {
  stage.onTouchStart(touch(from)); stage.onTouchMove(touch(to)); stage.onTouchEnd(touch(to));
}

(async () => {
  await test('locked shop retains exact slots and inventory across waves and reload', async () => {
    const stage = await makeStage({ ...freshSaveV2(), gold: 20 }); stage.ui.onLock();
    const slots = stage.shop.snapshot(), pool = stage.pool.snapshot();
    stage.flow.startBattle(); stage.flow.settle(0,0); stage.resultShown = true; stage.fighting = true;
    stage.restart();
    assert.deepEqual(stage.shop.snapshot(),slots); assert.deepEqual(stage.pool.snapshot(),pool);
    const reloaded = await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(reloaded.shop.locked,true); assert.equal(reloaded.ui.locked,true);
    assert.deepEqual(reloaded.shop.snapshot(),slots);
    const gold = reloaded.economy.gold; reloaded.refreshShop();
    assert.equal(reloaded.economy.gold,gold-2,'explicit refresh still rerolls while locked');
  });
  await test('tap opens star-scaled attributes and skill without moving or selling', async () => {
    const saved = freshSaveV2(); saved.owned = [{uid:1,unitId:'mage',star:1,location:'bench',x:-1,y:0}];
    const stage = await makeStage(saved), before = stage.owned.snapshot(), gold = stage.economy.gold;
    const p = stage.benchSlotWorld(0); stage.onTouchStart(touch(p)); stage.onTouchEnd(touch(p));
    assert.match(stage.ui.detail.name,/法师/); assert.match(stage.ui.detail.skillName,/火球/);
    assert.equal(stage.ui.detail.range,stage.cfg.getUnit('mage').range);
    assert.deepEqual(stage.owned.snapshot(),before); assert.equal(stage.economy.gold,gold);
  });
  await test('drag sale refunds discounted upgraded unit and restores original cards once', async () => {
    const saved = freshSaveV2(); saved.shopReserved = true;
    saved.pool = {mage:15};
    saved.owned = [{uid:1,unitId:'mage',star:2,location:'bench',x:-1,y:0}];
    const stage = await makeStage(saved), pool = stage.pool.count('mage'), gold = stage.economy.gold;
    drag(stage,stage.benchSlotWorld(0),shopDrop());
    assert.equal(stage.owned.all().length,0); assert.equal(stage.economy.gold,gold+8);
    assert.equal(stage.pool.count('mage'),pool+3);
    stage.onTouchEnd(touch(shopDrop())); assert.equal(stage.economy.gold,gold+8);
    assert.equal(JSON.parse(storage.get(SAVE_KEY)).owned.length,0);
  });
  await test('shop drag mode previews population, blocks transactions, and cancels without selling', async () => {
    const stage = await makeStage(twoUnitSave()), bv = stage.boardNode.getComponent(BoardView);
    const first = stage.owned.inBench()[0], pos = stage.benchSlotWorld(first.y);
    const owned = stage.owned.snapshot(), gold = stage.economy.gold;
    stage.onTouchStart(touch(pos)); assert.equal(stage.ui.sale,null,'a tap does not show drag UI');
    stage.onTouchMove(touch(bv.cellToWorld(2,2)));
    assert.equal(stage.ui.sale[3],1,'preview first deployment');
    stage.onTouchMove(touch(shopDrop())); assert.equal(stage.ui.sale[2],true);
    assert.equal(stage.ui.sale[3],0,'bench sale does not consume population');
    const shop = stage.shop.snapshot(), locked = stage.shop.locked;
    stage.ui.onBuy(0); stage.ui.onBuyExp(); stage.ui.onRefresh(); stage.ui.onLock(); stage.ui.onFight();
    assert.equal(stage.economy.gold,gold); assert.deepEqual(stage.shop.snapshot(),shop);
    assert.equal(stage.shop.locked,locked); assert.equal(stage.flow.phase,'prepare');
    stage.onTouchEnd({...touch(shopDrop()),type:Node.EventType.TOUCH_CANCEL});
    assert.deepEqual(stage.owned.snapshot(),owned); assert.equal(stage.economy.gold,gold); assert.equal(stage.ui.sale,null);
    drag(stage,pos,bv.cellToWorld(2,2));
    const second = stage.owned.inBench()[0]; stage.onTouchStart(touch(stage.benchSlotWorld(second.y)));
    stage.onTouchMove(touch(bv.cellToWorld(3,2))); assert.equal(stage.ui.sale[3],2,'project over-cap deployment');
    stage.onTouchEnd(touch(bv.cellToWorld(3,2))); assert.equal(stage.owned.onBoard().length,1); assert.equal(stage.ui.sale,null);
    stage.onTouchStart(touch(bv.cellToWorld(2,2))); stage.onTouchMove(touch(shopDrop()));
    assert.equal(stage.ui.sale[3],0,'board sale previews the released population');
    stage.onTouchEnd({...touch(shopDrop()),type:Node.EventType.TOUCH_CANCEL});
    assert.equal(stage.owned.onBoard().length,1); assert.equal(stage.ui.sale,null);
    drag(stage,bv.cellToWorld(2,2),new Vec3(488,-75));
    assert.equal(stage.owned.onBoard().length,1,'the old sidebar sale area no longer sells');
    assert.equal(stage.economy.gold,gold);
  });

  await test('settlement reload does not grant duplicate income and advances exactly one wave', async () => {
    const stage = await makeStage(); stage.owned.move(1,{location:'board',x:3,y:3}); stage.startFight();
    stage.sim.run(); stage.update(.1);
    const saved = JSON.parse(storage.get(SAVE_KEY)), gold = stage.economy.gold, health = stage.flow.health;
    const restored = await makeStage(saved); restored.update(10);
    assert.equal(restored.economy.gold,gold); assert.equal(restored.flow.health,health);
    assert.equal(restored.resultShown,true); assert.equal(restored.ui.shopVisible,false);
    restored.restart(); assert.equal(restored.flow.waveIndex,1); assert.equal(restored.flow.phase,'prepare');
    restored.restart(); assert.equal(restored.flow.waveIndex,1);
  });
  await test('zero-gold starter earns base income per subround from the current stage', async () => {
    const stage = await makeStage();
    assert.equal(stage.economy.gold,0);assert.equal(stage.owned.all().length,1);
    const cards=stage.shop.snapshot();stage.buyFromShop(0);stage.refreshShop();stage.ui.onBuyExp();
    assert.equal(stage.economy.gold,0);assert.deepEqual(stage.shop.snapshot(),cards);assert.equal(stage.owned.all().length,1);
    stage.owned.move(1,{location:'board',x:3,y:3});
    for(const expectedIncome of [2,2,2,4]) {
      const before=stage.economy.gold;stage.startFight();stage.sim.run();stage.update(.1);
      const reward=stage.save.lastReward.breakdown;
      assert.equal(reward.floorIncome,expectedIncome,'base reward depends on stage, not total wave or subround index');
      assert.equal(reward.interest,Math.min(Math.floor(before*.1),5));
      assert.equal(reward.winBonus,1);assert.equal(reward.streakBonus,Math.min(Math.floor(reward.winStreak/2),3));
      assert.equal(stage.economy.gold,before+reward.total);stage.restart();
    }
    const reloaded=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(reloaded.economy.gold,stage.economy.gold,'continuing retains earned gold');
  });
  await test('run end restarts health, economy, levels, inventory, lock, and wave together', async () => {
    const stage = await makeStage(); stage.flow.startBattle(); stage.flow.settle(1,99);
    stage.shop.locked=true; stage.resultShown=true; stage.fighting=true; stage.persistShopState();
    const restored = await makeStage(JSON.parse(storage.get(SAVE_KEY))); restored.restart();
    assert.equal(restored.flow.phase,'prepare'); assert.equal(restored.flow.health,20);
    assert.equal(restored.flow.waveIndex,0); assert.equal(restored.economy.gold,0);
    assert.equal(restored.levelSys.level,1); assert.equal(restored.owned.all().length,1);
    assert.equal(restored.shop.locked,false); assert.equal(restored.shop.slots.filter(s=>s.unitId).length,5);
    const total = new CardPool(units).total();
    assert.equal(restored.pool.total()+1+5,total);
  });
  await test('experience button exchanges exactly four gold for four XP and persists upgrades', async () => {
    const stage = await makeStage({ ...freshSaveV2(), gold: 20 }), beforeShop = stage.shop.snapshot();
    const original = stage.owned.snapshot(), gold = stage.economy.gold;
    stage.ui.onBuyExp();
    assert.equal(stage.economy.gold, gold - 4);
    assert.equal(stage.levelSys.level, 3); assert.equal(stage.levelSys.exp, 0); assert.equal(stage.levelSys.unitCap, 3);
    assert.deepEqual(stage.ui.top, { gold: gold - 4, floor: 1, level: 3, exp: 0, cap: 3 });
    assert.deepEqual(stage.shop.snapshot(), beforeShop); assert.deepEqual(stage.owned.snapshot(), original);
    const reloaded = await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(reloaded.economy.gold, gold - 4); assert.equal(reloaded.levelSys.level, 3);
  });
  await test('XP purchase rejects insufficient gold and max level, and remains available during combat', async () => {
    const poor = await makeStage({ ...freshSaveV2(), gold: 3 });
    const before = storage.get(SAVE_KEY); poor.ui.onBuyExp();
    assert.equal(poor.economy.gold, 3); assert.equal(poor.levelSys.exp, 0); assert.equal(poor.levelSys.level, 1);
    assert.equal(storage.get(SAVE_KEY), before); assert.equal(poor.ui.warn, '金币不足');
    const max = await makeStage({ ...freshSaveV2(), gold: 20, level: 10 }); max.ui.onBuyExp();
    assert.equal(max.economy.gold, 20); assert.equal(max.levelSys.exp, 0); assert.equal(max.ui.warn, '已达最高等级');
    const fighting = await makeStage({ ...freshSaveV2(), gold: 20 });
    fighting.owned.move(fighting.owned.all()[0].uid, { location: 'board', x: 2, y: 3 }); fighting.startFight();
    const sim=fighting.sim; fighting.ui.onBuyExp(); assert.equal(fighting.economy.gold, 16); assert.equal(fighting.levelSys.level, 3);
    assert.equal(fighting.sim,sim);
  });
  await test('XP purchase carries remaining XP and stops charging after reaching level ten', async () => {
    const stage = await makeStage({ ...freshSaveV2(), gold: 20, level: 9, exp: 66 });
    stage.ui.onBuyExp();
    assert.equal(stage.economy.gold, 16); assert.equal(stage.levelSys.level, 10); assert.equal(stage.levelSys.exp, 2);
    stage.ui.onBuyExp(); assert.equal(stage.economy.gold, 16); assert.equal(stage.levelSys.exp, 2);
    const normal = await makeStage({ ...freshSaveV2(), gold: 20, level: 3, exp: 3 }); normal.ui.onBuyExp();
    assert.equal(normal.levelSys.level, 4); assert.equal(normal.levelSys.exp, 1);
  });
  await test('star rank reaches bench and combat views and updates after merging', async () => {
    const saved = freshSaveV2(); saved.owned = [
      { uid: 1, unitId: 'warrior', star: 3, location: 'board', x: 2, y: 3 },
      { uid: 2, unitId: 'mage', star: 2, location: 'bench', x: -1, y: 0 },
      { uid: 3, unitId: 'archer', star: 1, location: 'bench', x: -1, y: 1 },
    ];
    const stage = await makeStage(saved);
    for (const ou of stage.owned.all()) assert.equal(stage.ownedViews.get(ou.uid).star, ou.star);
    stage.startFight(); assert.equal(stage.ownedViews.get(1).star, 3);
    for (const enemy of stage.sim.units.filter(u => u.side === 1)) assert.equal(stage.views.get(enemy.id).star, 1);
    const merged = await makeStage();
    merged.owned.forceAdd('warrior'); merged.owned.forceAdd('warrior'); merged.owned.tryMerge('warrior'); merged.resetBattle(false);
    const warrior = merged.owned.all().find(u => u.unitId === 'warrior');
    assert.equal(warrior.star, 2); assert.equal(merged.ownedViews.get(warrior.uid).star, 2);
  });
  await test('perspective hex centers round trip, edges reject outside points', () => {
    const board = new BoardGeometry(7, 8, 48);
    assert.equal(board.cells.length, 56);
    for (const cell of board.cells) {
      const hit = board.cellAt(cell.center.x, cell.center.y);
      assert.equal(hit.x, cell.x); assert.equal(hit.y, cell.y);
      for (const p of cell.polygon) {
        const x = cell.center.x + (p.x - cell.center.x) * 0.85;
        const y = cell.center.y + (p.y - cell.center.y) * 0.85;
        assert.equal(board.cellAt(x, y), cell);
      }
    }
    assert.equal(board.cellAt(0, -board.height / 2 - 1), null);
    assert.equal(board.cellAt(board.width / 2 + 10, 0), null);
  });
  await test('fourth deployment row is playable and enemy formation stays in its half', async () => {
    const stage = await makeStage(), bv = stage.boardNode.getComponent(BoardView);
    assert.equal(bv.boardWidth, 7); assert.equal(bv.boardHeight, 8);
    const first = stage.owned.all()[0];
    drag(stage, stage.benchSlotWorld(first.y), bv.cellToWorld(6, 3));
    assert.equal(first.x, 6); assert.equal(first.y, 3); assert.equal(first.location, 'board');
    for (const u of stage.sim.units.filter(u => u.side === 1)) assert.ok(u.y >= 4 && u.y < 8);
    drag(stage, bv.cellToWorld(6, 3), bv.cellToWorld(6, 4));
    assert.equal(first.y, 3, 'enemy half must reject deployment');
  });
  await test('old eighth-column save retains unit identity and star in a free valid cell', async () => {
    const saved = freshSaveV2();
    saved.owned = [{ uid: 1, unitId: 'warrior', star: 2, location: 'board', x: 7, y: 2 },
      { uid: 2, unitId: 'archer', star: 1, location: 'board', x: 6, y: 2 }];
    const stage = await makeStage(saved), migrated = stage.owned.get(1);
    assert.equal(migrated.star, 2); assert.equal(migrated.location, 'board');
    assert.ok(migrated.x < 7 && migrated.y < 4);
    assert.notEqual(`${migrated.x},${migrated.y}`, '6,2');
    assert.equal(stage.owned.all().length, 2);
    const persisted = JSON.parse(storage.get(SAVE_KEY));
    assert.deepEqual(persisted.owned, stage.owned.snapshot());
  });
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
    const shop = new ShopSystem(pool, new OwnedUnits(), new EconomySystem(undefined,{gold:1,winStreak:0,loseStreak:0}), new Map([['warrior', units[0]]]), new Rng(42), () => 1, 9);
    assert.equal(shop.slots.filter(s => s.unitId).length, 1);
    assert.equal(pool.count('warrior'), 0);
    assert.equal(shop.buy(0).error, undefined);
  });
  await test('zero inventory survives save migration and reload', () => {
    const pool = new CardPool(units, Object.fromEntries(units.map(u => [u.id, 0])));
    const migrated = migrateSaveV2({ pool: pool.snapshot() });
    assert.equal(new CardPool(units, migrated.pool).total(), 0);
  });
  await test('fresh game renders bench and populates shop without charging', async () => {
    const stage = await makeStage();
    assert.equal(stage.ownedViews?.size, 1);
    assert.equal(stage.owned.all()[0].star,1); assert.equal(stage.cfg.getUnit(stage.owned.all()[0].unitId).cost,1);
    assert.equal(stage.waves.length,23); assert.equal(stage.save.stageCount,3);
    assert.equal(stage.ui.slots.filter(s => s.unitId).length, 5);
    assert.equal(stage.economy.gold, 0);
  });
  await test('bench drag deploys, enforces cap, undeploys, and binds new nodes', async () => {
    const stage = await makeStage(twoUnitSave()); const bv = stage.boardNode.getComponent(BoardView);
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
    assert.equal(stage.save.floor, floor, 'subrounds retain stage income'); assert.equal(stage.flow.wave.round,2);
    assert.equal(stage.ui.slots.filter(s => s.unitId).length, 5);
    assert.equal(stage.replayer.sim, stage.sim);
  });
  await test('purchase immediately renders new bench unit and persists initialization', async () => {
    const stage = await makeStage({ ...freshSaveV2(), gold: 20 }); stage.buyFromShop(0);
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
    const shop = new ShopSystem(pool, owned, new EconomySystem(undefined,{gold:1,winStreak:0,loseStreak:0}), new Map([['warrior', units[0]]]), new Rng(1), () => 1, 2);
    assert.equal(shop.buy(0).error, undefined);
    assert.equal(owned.all().length, 1); assert.equal(owned.all()[0].star, 2);
    shop.sell(owned.all()[0].uid); shop.returnUnbought();
    assert.equal(pool.count('warrior'), 30);
  });
  await test('empty formation cannot start, and combat freezes deployed units while allowing shop purchases', async () => {
    const stage = await makeStage({ ...freshSaveV2(), gold: 20 }); stage.startFight();
    assert.equal(stage.fighting, false);
    const bv = stage.boardNode.getComponent(BoardView);
    drag(stage, stage.benchSlotWorld(0), bv.cellToWorld(2, 2)); stage.startFight();
    const sim=stage.sim, formation=stage.owned.onBoard().map(u=>({...u})),gold=stage.economy.gold;
    stage.buyFromShop(0); assert.ok(stage.economy.gold<gold); stage.refreshShop();
    drag(stage, bv.cellToWorld(2, 2), stage.benchSlotWorld(0));
    assert.equal(stage.sim,sim); assert.deepEqual(stage.owned.onBoard(),formation);
    assert.equal(stage.draggingId,0); assert.equal(stage.ui.shopVisible,true);
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
  await test('selected stage count survives reload, stage boundaries, and a complete restart', async () => {
    const stage = await makeStage(freshSaveV2(4)); assert.equal(stage.waves.length,33);
    for(let i=0;i<3;i++) {
      stage.flow.startBattle(); stage.flow.settle(0,0); stage.resultShown=true; stage.fighting=true; stage.restart();
    }
    assert.equal(stage.flow.wave.stage,2); assert.equal(stage.flow.wave.round,1); assert.equal(stage.save.floor,2);
    const reloaded = await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(reloaded.waves.length,33); assert.equal(reloaded.flow.waveIndex,3);
    assert.equal(reloaded.flow.wave.stage,2); assert.equal(reloaded.flow.wave.round,1);
    reloaded.flow.startBattle(); reloaded.flow.settle(1,99); reloaded.resultShown=true; reloaded.restart();
    assert.equal(reloaded.save.stageCount,4); assert.equal(reloaded.waves.length,33);
    assert.equal(reloaded.owned.all().length,1); assert.equal(reloaded.flow.wave.stage,1);
  });
  await test('runtime difficulty retains stage strength and ignores selected run length', async () => {
    const resumed=(count,index)=>({...freshSaveV2(count),round:{phase:'prepare',waveIndex:index,health:20,result:null,lastSettlement:null}});
    const previous=await makeStage(resumed(3,12));
    const next=await makeStage(resumed(3,13));
    const longer=await makeStage(resumed(6,13));
    const army=stage=>stage.sim.units.filter(u=>u.side===1).map(u=>({id:u.cfg.id,star:u.star,hp:u.cfg.hp,atk:u.cfg.atk,armor:u.cfg.armor,mr:u.cfg.mr}));
    const prevArmy=army(previous),nextArmy=army(next);
    assert.ok(nextArmy.reduce((sum,u)=>sum+u.hp,0)>prevArmy.reduce((sum,u)=>sum+u.hp,0),'new stage starts stronger than the previous finale');
    assert.ok(nextArmy.reduce((sum,u)=>sum+u.atk,0)>prevArmy.reduce((sum,u)=>sum+u.atk,0));
    assert.deepEqual(army(longer),nextArmy,'simulation stats stay identical when more stages are selected');
    const later=await makeStage(resumed(3,14));
    assert.deepEqual(army(later).map(u=>u.id),nextArmy.map(u=>u.id));
    assert.ok(army(later).every((u,i)=>u.hp>nextArmy[i].hp&&u.atk>=nextArmy[i].atk),'the next subround applies its slight stat growth to the runtime');
  });
  await test('main menu return preserves run and is blocked during battle', async () => {
    const stage=await makeStage(freshSaveV2(5)); sceneLoads.length=0;
    stage.ui.onHome(); assert.deepEqual(sceneLoads,['main']);
    assert.equal(JSON.parse(storage.get(SAVE_KEY)).stageCount,5);
    stage.owned.move(1,{location:'board',x:3,y:3}); stage.startFight();
    stage.ui.onHome(); assert.equal(sceneLoads.length,1);
  });
  await test('combat shop, XP, lock, reserve swap/sale and board merging preserve the active battle', async () => {
    const saved=freshSaveV2(); saved.level=4;saved.gold=100;
    saved.owned=[{uid:1,unitId:'warrior',star:1,location:'board',x:2,y:2},
      {uid:2,unitId:'warrior',star:1,location:'board',x:4,y:2},
      {uid:3,unitId:'archer',star:1,location:'bench',x:-1,y:0},
      {uid:4,unitId:'mage',star:1,location:'bench',x:-1,y:1}];
    saved.shop=['warrior','guardian','mage','archer','scout'].map(unitId=>({unitId}));
    const pool=new CardPool(units);for(const unit of saved.owned)pool.take(unit.unitId);saved.pool=pool.snapshot();
    const stage=await makeStage(saved);stage.startFight();stage.update(.1);
    const sim=stage.sim,driver=stage.driver,cursor=stage.replayer.eventCursor;
    const combatViews=new Map(stage.views),snapshot=sim.units.map(u=>u.snapshot()),events=sim.events.map(e=>({...e}));
    const battleId=stage.battleIds.get(2);
    stage.buyFromShop(0);
    assert.equal(stage.owned.get(1).star,2);assert.equal(stage.owned.get(2),undefined);
    assert.equal(stage.views.get(stage.battleIds.get(1)).star,1,'upgrade is applied next combat');
    assert.equal(sim.units.find(u=>u.id===battleId).star,1);
    stage.showBattleDetail(battleId);assert.equal(stage.ui.detail.star,1);assert.equal(stage.ui.detail.hp,sim.units.find(u=>u.id===battleId).hp);
    assert.equal(stage.ui.detail.range,stage.cfg.getUnit('warrior').range);
    const archer=stage.owned.get(3),mage=stage.owned.get(4);
    drag(stage,stage.benchSlotWorld(0),stage.benchSlotWorld(1));
    assert.equal(archer.y,1);assert.equal(mage.y,0);
    const bv=stage.boardNode.getComponent(BoardView);
    drag(stage,stage.benchSlotWorld(1),bv.cellToWorld(3,2));assert.equal(archer.location,'bench');
    const money=stage.economy.gold;
    drag(stage,stage.benchSlotWorld(0),shopDrop());assert.equal(stage.owned.get(4),undefined);assert.equal(stage.economy.gold,money+3);
    stage.ui.onBuyExp();stage.ui.onLock();assert.equal(stage.shop.locked,true);stage.ui.onRefresh();
    assert.equal(stage.sim,sim);assert.equal(stage.driver,driver);assert.equal(stage.replayer.sim,sim);
    assert.equal(stage.replayer.eventCursor,cursor);assert.deepEqual(sim.units.map(u=>u.snapshot()),snapshot);assert.deepEqual(sim.events,events);
    for(const [id,view]of combatViews)assert.equal(stage.views.get(id),view);
    for(const u of stage.owned.inBench())assert.equal(stage.ownedViews.get(u.uid).node.events.size,4);
    const persisted=JSON.parse(storage.get(SAVE_KEY));assert.equal(persisted.round.phase,'battle');
    assert.equal(persisted.shopLocked,true);assert.deepEqual(persisted.owned,stage.owned.snapshot());
    sim.run();stage.update(.1);assert.equal(stage.flow.phase,'settlement');
    const settledMoney=stage.economy.gold;stage.ui.onBuyExp();stage.ui.onRefresh();assert.equal(stage.economy.gold,settledMoney);
    stage.restart();assert.equal(stage.views.get(stage.battleIds.get(1)).star,2,'next battle uses upgraded formation');
  });
  await test('combat ending mid-drag restores the reserve piece and prevents a late sale', async () => {
    const stage=await makeStage(twoUnitSave());stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    const archer=stage.owned.get(2);stage.onTouchStart(touch(stage.benchSlotWorld(archer.y)));stage.onTouchMove(touch(shopDrop()));
    assert.ok(stage.draggingId);stage.sim.run();stage.update(.1);
    assert.equal(stage.draggingId,0);assert.deepEqual(stage.ownedViews.get(2).node.position,stage.benchSlotWorld(archer.y));
    const gold=stage.economy.gold;stage.onTouchEnd(touch(shopDrop()));assert.equal(stage.economy.gold,gold);assert.ok(stage.owned.get(2));
  });
  await test('combat merge keeps the deployed position even when the oldest copy was on the bench', async () => {
    const saved=freshSaveV2();saved.gold=20;saved.owned=[{uid:1,unitId:'warrior',star:1,location:'bench',x:-1,y:0},
      {uid:2,unitId:'warrior',star:1,location:'board',x:3,y:3}];
    saved.shop=['warrior',null,null,null,null].map(unitId=>({unitId}));
    const stage=await makeStage(saved);stage.startFight();const sim=stage.sim;stage.buyFromShop(0);
    assert.equal(stage.owned.get(1),undefined);assert.equal(stage.owned.get(2).star,2);
    assert.equal(stage.owned.get(2).location,'board');assert.equal(stage.owned.get(2).x,3);
    assert.equal(stage.sim,sim);assert.equal(sim.units.find(u=>u.side===0).star,1);
  });
  await test('combat details follow runtime HP/mana for allies and enemies even after death', async () => {
    const stage=await makeStage();stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    const ally=stage.sim.units.find(u=>u.side===0),enemy=stage.sim.units.find(u=>u.side===1);
    ally.hp=321;ally.mana=27;stage.showBattleDetail(ally.id);stage.refreshDetailVitals();
    assert.deepEqual(stage.ui.vitals,[321,ally.cfg.hp,27,ally.cfg.maxMana]);
    enemy.hp=0;enemy.alive=false;stage.showBattleDetail(enemy.id);stage.refreshDetailVitals();
    assert.equal(stage.ui.detail.name,'小史莱姆');assert.equal(stage.ui.vitals[0],0);assert.equal(stage.ui.detail.side,1);
  });
  await test('displayed cost rates match implemented tiers and refresh stays populated at high level', async () => {
    const saved=freshSaveV2();saved.level=10;saved.gold=100;
    const stage=await makeStage(saved);const rates=stage.shop.costRates();
    assert.equal(rates[3],0);assert.equal(rates[4],0);assert.ok(Math.abs(rates.reduce((a,b)=>a+b,0)-100)<1e-8);
    assert.deepEqual(stage.ui.rates,rates);
    for(let i=0;i<10;i++) { stage.refreshShop();assert.equal(stage.shop.slots.filter(s=>s.unitId).length,5); }
  });
  console.log(`Regression: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
