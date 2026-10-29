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
const { readRunSave, freshRunSave: createSaveV2, SAVE_KEY } = core('ShopSave');
// Existing stage assertions describe legacy behavior; budget-v1 has separate runtime coverage below.
const freshRunSave=(stages,seed)=>createSaveV2(stages,seed,'budget-v1');
const sceneLoads = [];
const { BoardGeometry } = require('../assets/scripts/view/BoardGeometry.ts');
const {projectBoardPoint,unprojectBoardPoint,projectGroundPoint,benchGroundPoint}=require('../assets/scripts/view/BoardPresentation.ts');
const { SHOP_DROP_AREA, containsShopDrop } = require('../assets/scripts/ui/BattleUILayout.ts');
const shopDrop = () => new Vec3(SHOP_DROP_AREA.x, SHOP_DROP_AREA.y - 60);
const authored=require('./fixtures/content-c001e20.json').configs;
let currentContentEnabled=false;
let units = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/units.json'), 'utf8'));
let skills = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/skills.json'), 'utf8'));
let legacyRun = JSON.parse(fs.readFileSync(path.join(root, 'assets/resources/config/run.json'), 'utf8')); delete legacyRun.stageEncounters; delete legacyRun.starterSelection;
units=authored.units;skills=authored.skills;legacyRun=JSON.parse(JSON.stringify(authored.run));delete legacyRun.stageEncounters;delete legacyRun.starterSelection;
let stageEncountersEnabled = false;
let passed = 0, failed = 0;
async function test(name, run) {
  try { await run(); passed++; console.log('PASS ' + name); }
  catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.stack); }
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
  setSiblingIndex(i) { const list=this.parent.children;list.splice(list.indexOf(this),1);list.splice(i,0,this); }
  removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
  on(type, fn, context) { this.events.set(type, { fn, context }); }
  off(type) { this.events.delete(type); }
  destroy() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
}
class UITransform {
  setAnchorPoint(x,y) { this.anchorPoint={x,y}; }
  setContentSize(w, h) { this.contentSize = { width: w, height: h }; }
  convertToNodeSpaceAR(p) {
    const local=p.clone();
    for(let node=this.node;node;node=node.parent) { local.x-=node.position.x;local.y-=node.position.y; }
    return local;
  }
}
class Color { constructor(...rgba) { this.rgba = rgba; } static WHITE = new Color(255, 255, 255); }
class Sprite {static SizeMode={CUSTOM:0};isValid=true;}
class Graphics { ellipse() {} rect() {} roundRect() {} fill() {} stroke() {} }
class Label {}
class BoardView {
  showAstralFields(fields) { this.astralFields = fields; }
  highlightTarget(cell,allowed=true) { this.highlighted=cell;this.highlightAllowed=allowed; }
  boardPixelW = 530; boardPixelH = 342;
  initialize(w, h, size) {
    this.boardWidth = w; this.boardHeight = h;
    this.geometry = new BoardGeometry(w, h, size);
    this.boardPixelW = this.geometry.width; this.boardPixelH = this.geometry.height;
  }
  cellToWorld(x, y) {
    const c = this.geometry.cells.find(c => c.x === x && c.y === y).center;
    const p=projectBoardPoint(c);
    return new Vec3(p.x, p.y);
  }
  worldToCell(x, y) {
    const p=unprojectBoardPoint({x,y});
    const c = this.geometry.cellAt(p.x, p.y);
    return c ? { x: c.x, y: c.y } : null;
  }
  benchPosition(slot) {
    const p=projectGroundPoint(benchGroundPoint(slot,this.benchSlots,this.boardPixelH));
    return new Vec3(p.x,p.y);
  }
  isOwnCell(y) { return y >= 0 && y < this.boardHeight / 2; }
}
class UnitView {
  setVitalsVisible(visible) { this.vitalsVisible=visible; }
  setup(cfgId, side, unitId, cellSize, artId, tint, portraitScale=.82) { Object.assign(this, { cfgId, side, unitId, portraitScale }); this.star = 1; }
  setEquipment(items) { this.equipment = items; }
  setStar(star) { this.star = star; }
}
class BattleReplayer {
  bind(sim, views) { this.sim = sim; this.views = views; this.eventCursor = 0; }
  setFxRoot(root) { this.fxRoot = root; }
  consumeEvents() { this.seen = this.sim.events.slice(this.eventCursor); this.eventCursor = this.sim.events.length; }
  syncViews() {}
}
class BattleUI {
  getBattleSettings() { return {speed:1,damageNumbers:true,healingNumbers:true}; }
  setOpeningShopLocked(value) { this.openingShopLocked=value; }
  setPortalState(value) { this.portalState=value; }
  setShopContentOccupied(value) { this.occupied=value; }
  setFreeRefreshes(count) { this.freeRefreshes=count; }
  hideOpeningEncounter() {}
  showOpeningEncounter(title, choices, choose) { this.openingChoice=choose; }
  setShopEncounter(visible) { this.shopEncounter=visible; }
  setNextWaveVisible(visible) { this.nextWaveVisible=visible; }
  playWaveTransition(covered,complete) { covered();complete(); }
  setRewardStorage(count,credit) { this.rewardStorage={count,credit}; }
  showEquipmentReward(items) { this.rewardItems=items; }
  hideEquipmentReward() { this.rewardItems=null; }
  configureDebug(data) { this.debugData=data; }
  refreshDebugState(...args) { this.debugState=args; }
  setBoardCenter(x,y) { this.boardCenter={x,y}; }
  bindBoardPopulation(board) { this.populationBoard=board; }
  init() { this.node.addComponent(UITransform); } hideFightBtn() {} showFightBtn() {}
  refreshTop(gold, floor, lv, rates) { this.top = { gold, floor, level: lv.level, exp: lv.exp, cap: lv.unitCap }; this.rates=rates; }
  refreshFormation() {}
  refreshTraits(states) { this.traits = states; }
  refreshRun(...args) { this.run = args; } setLocked(v) { this.locked = v; }
  clearSellPreview() { this.sale = null; } showSellPreview(...args) { this.sale = args; }
  isInSellArea(x,y) { return this.shopVisible !== false && containsShopDrop(x,y); }
  refreshBackpack(items, editable) { this.backpack = { items, editable }; }
  showEquipment(items, editable, stacks) { this.equipment = { items, editable, stacks }; }
  showUnitDetail(data) { this.detail = data; this.unitDetailVisible=true; this.updateUnitVitals(data.hp,data.maxHp,data.mana,data.maxMana); }
  closeUnitDetail() { this.unitDetailVisible=false; }
  updateUnitVitals(...args) { this.vitals=args; }
  refreshCombatStats(rows) { this.combatStats=rows; }
  setCombatActive(v) { this.combatActive=v; }
  setBattleTimer(clock) { this.clock=clock; }
  setCombatCountdown(seconds) { this.countdown=seconds; }
  hideResult() {} showResult() {} showWarn(msg) { this.warn = msg; }
  refreshShop(slots) { this.slots = slots; }
  setShopVisible(v) { this.shopVisible = v; this.clearSellPreview(); }
}
const stageFile = path.join(root, 'assets/scripts/view/BattleStage.ts');
const code = ts.transpileModule(fs.readFileSync(stageFile, 'utf8'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, experimentalDecorators: true,
} }).outputText;
const stageExports = {};
const viewMocks = { './GameAudio':{GameAudio:{mount(){},play(){},setMusic(){}}}, './ArtSpriteLoader':{loadArtSprite:(name,cb)=>{assert.equal(typeof name,'string');const file=path.join(root,'assets/resources',name.split('#')[0].replace(/\/spriteFrame$/,'.png'));assert.ok(fs.existsSync(file),file);cb(null,{name});}}, './BoardView': { BoardView }, './UnitView': { UnitView }, './BattleReplayer': { BattleReplayer }, '../ui/BattleUI': { BattleUI }, '../ui/StageRewardPanel':{StageRewardPanel:class{constructor(parent,cfg,choose){this.choose=choose;}show(pending,gold){this.pending=pending;this.gold=gold;}hide(){this.pending=undefined;}}}, '../ui/UISkin': { setUISkin() {} } };
// This suite verifies progression; rendering duration is exercised in the dedicated flight suite/browser.
let deferRewardFlights=false, pendingRewardFlight=null;
viewMocks['./ChestRewardFlight']={ChestRewardFlight:class{play(origin,targets,done){this.targets=targets;if(deferRewardFlights)pendingRewardFlight=done;else done();}cancel(){}}};
viewMocks['./ExpeditionPortal']={ExpeditionPortal:class{init(position,enter){this.node.setPosition(position);this.enter=enter;}}};
const cc={Component,Node,Vec3,UITransform,Graphics,Label,Color,Sprite,JsonAsset:class{},
 director:{loadScene:name=>{sceneLoads.push(name);return true;}},
 _decorator:{ccclass:()=>c=>c,property:()=>()=>{}},
 resources:{load:(name,T,cb)=>{
   const key=name.replace('config/','');
   const json=key==='run'&&!stageEncountersEnabled?legacyRun:!currentContentEnabled&&['units','skills'].includes(key)?authored[key]:JSON.parse(fs.readFileSync(path.join(root,'assets/resources',name+'.json'),'utf8'));
   cb(null,{json:JSON.parse(JSON.stringify(json))});
 }}};
const viewCache=new Map();
function loadView(file){
 if(viewCache.has(file))return viewCache.get(file);
 const out={};viewCache.set(file,out);
 const text=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,experimentalDecorators:true}}).outputText;
 new Function('require','exports',text)(id=>id==='cc'?cc:viewMocks[id]??require(path.resolve(path.dirname(file),id)+'.ts'),out);
 return out;
}
new Function('require','exports',code)(id=>id==='cc'?cc:viewMocks[id]??(id==='./ShopVisitor'?loadView(path.resolve(path.dirname(stageFile),id)+'.ts'):require(path.resolve(path.dirname(stageFile),id)+'.ts')),stageExports);
const storage = new Map();
global.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
async function makeStage(saved) {
  storage.clear(); if (saved) storage.set(SAVE_KEY, JSON.stringify(saved));
  const stage = new stageExports.BattleStage();
  const canvas = new Node('Canvas'); stage.node = new Node('Stage'); canvas.addChild(stage.node);
  stage.boardNode = new Node('Board'); canvas.addChild(stage.boardNode);
  stage.boardNode.addComponent(BoardView);
  await stage.start(); if(stage.session.pendingOpeningEncounter){stage.session.chooseOpeningEncounter('inspiration');stage.refreshRunUI();} return stage;
}
// Board inputs become Canvas coordinates, including the board's 60-pixel offset.
const touch = pos => ({ getUILocation: () => new Vec3(pos.x,pos.y+60) });
function twoUnitSave() {
  const saved = freshRunSave(); saved.shopReserved = true;
  saved.owned = [{uid:1,unitId:'warrior',star:1,location:'bench',x:-1,y:0},
    {uid:2,unitId:'archer',star:1,location:'bench',x:-1,y:1}];
  return saved;
}
function drag(stage, from, to) {
  stage.onTouchStart(touch(from)); stage.onTouchMove(touch(to)); stage.onTouchEnd(touch(to));
}

(async () => {
  await test('attack speed bonuses are flat additions in preparation and combat',async()=>{
    const saved=twoUnitSave();saved.owned[0].equipment=['guinsoo'];
    const stage=await makeStage(saved),unit=stage.owned.all()[0],base=stage.cfg.getUnit(unit.unitId);
    stage.showOwnedDetail(unit.uid);assert.ok(Math.abs(stage.ui.detail.atkSpeed-(base.atkSpeed+.1))<1e-9);
    stage.owned.move(unit.uid,{location:'board',x:0,y:0});stage.resetBattle(false);stage.startFight();
    const combat=stage.sim.units.find(u=>u.side===0);combat.attackSpeedBonus=.05;
    assert.ok(Math.abs(combat.attackSpeed-(base.atkSpeed+.15))<1e-9);
  });
  await test('audit: unknown saved equipment is repaired and visible backpack indices stay aligned', async () => {
    const saved=twoUnitSave();
    saved.owned[0].equipment=['removed-equipment','guinsoo'];
    saved.equipmentReserve=['removed-equipment','guinsoo'];
    const stage=await makeStage(saved),unit=stage.owned.all()[0];
    assert.deepEqual(unit.equipment,['guinsoo']);
    assert.deepEqual(stage.owned.equipmentReserve,['guinsoo']);
    // A removed item can also enter the reserve after loading; UI indices must
    // still refer to the original reserve, not the filtered display array.
    stage.owned.equipmentReserve.unshift('removed-equipment');
    stage.refreshBackpack();stage.showOwnedDetail(unit.uid);
    assert.equal(stage.ui.backpack.items[0].id,'guinsoo');
    stage.ui.onBackpack(0);
    assert.deepEqual(unit.equipment,['guinsoo','guinsoo']);
    assert.deepEqual(stage.owned.equipmentReserve,['removed-equipment']);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.deepEqual(resumed.owned.all()[0].equipment,['guinsoo','guinsoo']);
    assert.deepEqual(resumed.owned.equipmentReserve,[]);
  });
  await test('audit: exhausted cost tiers show the same probabilities as actual draws', async () => {
    const stage=await makeStage();stage.shop.returnUnbought();stage.levelSys.addExp(1000);
    for(const cfg of stage.cfgUnits().filter(u=>u.cost!==2)) while(stage.pool.take(cfg.id)) {}
    stage.refreshEconomyUI();
    assert.deepEqual(stage.ui.rates,[0,100,0,0,0]);
    for(let i=0;i<100;i++) assert.equal(stage.shop.rollCost(stage.levelSys.level),2);
    for(const cfg of stage.cfgUnits()) while(stage.pool.take(cfg.id)) {}
    assert.deepEqual(stage.shop.costRates(),[0,0,0,0,0]);
    assert.equal(stage.shop.rollCost(stage.levelSys.level),null);
  });
  await test('board units use 1.3-cell portraits while reserve units retain their slot size',async()=>{
    const stage=await makeStage();
    assert.ok([...stage.views.values()].every(view=>view.portraitScale===1.3));
    const slots=stage.boardNode.getChildByName('units').children.filter(node=>node.name.startsWith('bench_'));
    assert.equal(slots.length,9,'the connected platform retains nine usable slots');
    assert.ok(slots.every(node=>!node.getComponent(Graphics)),'do not paint separate floating slot frames over the connected platform');
    assert.equal(stage.ownedViews.get(1).portraitScale,.82*1.3);
    stage.owned.move(1,{location:'board',x:3,y:3});stage.refreshOwnedViews();
    assert.equal(stage.ownedViews.get(1).portraitScale,1.3);
    stage.owned.move(1,{location:'bench',x:-1,y:0});stage.refreshOwnedViews();
    assert.equal(stage.ownedViews.get(1).portraitScale,.82*1.3);
  });
  await test('drag highlights valid cells, rejects over-cap/enemy cells, and clears on cancel',async()=>{
    const stage=await makeStage(twoUnitSave()),bv=stage.boardNode.getComponent(BoardView);
    stage.onTouchStart(touch(stage.benchSlotWorld(0)));stage.onTouchMove(touch(bv.cellToWorld(2,2)));
    assert.deepEqual(bv.highlighted,{x:2,y:2});assert.equal(bv.highlightAllowed,true);
    stage.onTouchEnd(touch(bv.cellToWorld(2,2)));assert.equal(bv.highlighted,null);
    stage.onTouchStart(touch(stage.benchSlotWorld(1)));stage.onTouchMove(touch(bv.cellToWorld(3,2)));
    assert.equal(bv.highlightAllowed,false);stage.onTouchMove(touch(bv.cellToWorld(3,5)));assert.equal(bv.highlightAllowed,false);
    stage.onTouchEnd({...touch(bv.cellToWorld(3,5)),type:Node.EventType.TOUCH_CANCEL});assert.equal(bv.highlighted,null);
    assert.equal(stage.ui.populationBoard,stage.boardNode);
  });
  await test('one second preparation uses real time and never ticks early or charges twice', async () => {
    const stage=await makeStage({...freshRunSave(),gold:20});stage.owned.move(1,{location:'board',x:3,y:3});
    stage.speed=3;stage.startFight();const sim=stage.sim, tick=sim.tick;
    stage.startFight();assert.equal(stage.sim,sim);assert.equal(stage.ui.countdown,1);
    stage.update(.5);assert.equal(sim.tick,tick);assert.equal(stage.ui.countdown,.5);
    const gold=stage.economy.gold;stage.buyExperience();assert.equal(stage.economy.gold,gold-4);assert.equal(stage.sim,sim);
    stage.update(.5);assert.equal(sim.tick,tick);assert.equal(stage.ui.countdown,0);
    stage.update(.1);assert.ok(sim.tick>tick);
    const reloaded=await makeStage(JSON.parse(storage.get(SAVE_KEY)));assert.equal(reloaded.flow.phase,'prepare');assert.equal(reloaded.preparationRemaining,0);
  });
  await test('stage income is zero while interest and victory bonuses remain', () => {
    for(const stage of [1,4,5,6,99]) {
      const economy=new EconomySystem(undefined,{gold:50,winStreak:0,loseStreak:0});
      const reward=economy.settleBattle(stage,{winner:0});assert.equal(reward.floorIncome,0);
      assert.equal(reward.interest,5);assert.equal(reward.winBonus,1);assert.equal(reward.total,reward.floorIncome+6);
    }
  });
  await test('preparation crossing frame spends only leftover time on combat', async () => {
    const stage=await makeStage();stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    const tick=stage.sim.tick;stage.update(1.125);assert.equal(stage.preparationRemaining,0);
    assert.equal(stage.sim.tick-tick,2,'125ms leftover produces two 50ms ticks');
  });
  await test('audit: run numeric configuration cannot produce infinite counts or population', () => {
    const run=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config/run.json'),'utf8'));
    const templates=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config/waves.json'),'utf8'));
    const {runRoundCount,buildRunWaves}=core('RunSetup');
    assert.throws(()=>runRoundCount(3,{...run,roundsPerStage:Infinity}));
    assert.throws(()=>buildRunWaves(5,{...run,enemyProgression:{...run.enemyProgression,populationEveryRounds:Infinity}},templates,units));
  });
  await test('audit: duplicate and out-of-range saved positions are repaired', async () => {
    const saved=twoUnitSave(); saved.owned.push({...saved.owned[0],uid:3,y:99});
    saved.owned[1].y=0;
    saved.owned.push({...saved.owned[0],uid:4,location:'board',x:2,y:2},
      {...saved.owned[0],uid:5,location:'board',x:2,y:2});
    const stage=await makeStage(saved);
    const positions=stage.owned.all().map(u=>`${u.location}:${u.x}:${u.y}`);
    assert.equal(new Set(positions).size,positions.length);
    for(const u of stage.owned.inBench())assert.ok(u.y>=0&&u.y<stage.save.benchSlots&&u.x===-1);
  });
  await test('audit: restore reconciles pool, owned stars and reserved shop per unit', async () => {
    const saved=twoUnitSave();saved.pool=new CardPool(units).snapshot();
    saved.owned[0].star=2;saved.shop[0]={unitId:'warrior'};
    const stage=await makeStage(saved);
    for(const cfg of units)assert.equal(stage.pool.count(cfg.id)+stage.owned.all().filter(u=>u.unitId===cfg.id).reduce((n,u)=>n+3**(u.star-1),0)+stage.shop.slots.filter(s=>s.unitId===cfg.id).length,new CardPool(units).count(cfg.id));
  });
  await test('audit: exhausted weighted tier never creates a false empty slot', () => {
    const stock=Object.fromEntries(units.map(u=>[u.id,u.cost===2?10:0]));
    const pool=new CardPool(units,stock),rng=new Rng(1);rng.next=()=>0;
    const shop=new ShopSystem(pool,new OwnedUnits(),new EconomySystem(),new Map(units.map(u=>[u.id,u])),rng,()=>3,9);
    assert.equal(shop.slots.filter(s=>s.unitId).length,5);
  });
  await test('audit: nonfinite money and level inputs cannot poison state', () => {
    const economy=new EconomySystem(undefined,{gold:20,winStreak:0,loseStreak:0});
    assert.equal(economy.spend(NaN),false);economy.add(Infinity);economy.add(-50);assert.equal(economy.gold,20);
    const {LevelSystem}=core('LevelSystem');const level=new LevelSystem({level:NaN,exp:Infinity});level.addExp(NaN);
    assert.equal(level.level,1);assert.equal(level.exp,0);
    assert.ok(core('ShopConfig').shopCostRates(NaN).every(Number.isFinite));
  });
  await test('audit: invalid costs and pool counts are rejected or bounded', () => {
    assert.throws(()=>new CardPool([{...units[0],cost:NaN}]));
    const pool=new CardPool(units,{warrior:Infinity,archer:-1});
    assert.ok(Number.isFinite(pool.total()));assert.ok(pool.count('warrior')<=30);assert.equal(pool.count('archer'),0);
  });
  await test('audit: failed full-bench merge rolls back gold, units, UID and reservation', () => {
    for(const mode of ['null','throw']) {
      const owned=new OwnedUnits([{uid:1,unitId:'warrior',star:1,location:'bench',x:-1,y:0},{uid:2,unitId:'warrior',star:1,location:'bench',x:-1,y:1}]);
      const economy=new EconomySystem(undefined,{gold:20,winStreak:0,loseStreak:0});
      const shop=new ShopSystem(new CardPool(units),owned,economy,new Map(units.map(u=>[u.id,u])),new Rng(1),()=>3,2,[{unitId:'warrior'},...Array.from({length:4},()=>({unitId:null}))]);
      const before=owned.snapshot(),merge=owned.tryMerge;
      owned.tryMerge=()=>{owned.remove(1);if(mode==='throw')throw Error('injected');return null;};
      assert.deepEqual(shop.buy(0),{error:'bench_full'});assert.equal(economy.gold,20);assert.deepEqual(owned.snapshot(),before);assert.equal(shop.slots[0].unitId,'warrior');
      owned.tryMerge=merge;assert.equal(owned.forceAdd('archer').uid,3);
    }
  });
  await test('locked shop retains exact slots and inventory across waves and reload', async () => {
    const stage = await makeStage({ ...freshRunSave(), gold: 20 }); stage.ui.onLock();
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
    const saved = freshRunSave(); saved.owned = [{uid:1,unitId:'mage',star:1,location:'bench',x:-1,y:0}];
    const stage = await makeStage(saved), before = stage.owned.snapshot(), gold = stage.economy.gold;
    const p = stage.benchSlotWorld(0); stage.onTouchStart(touch(p)); stage.onTouchEnd(touch(p));
    assert.match(stage.ui.detail.name,/法师/); assert.match(stage.ui.detail.skillName,/火球/);
    assert.equal(stage.ui.detail.range,stage.cfg.getUnit('mage').range);
    assert.deepEqual(stage.owned.snapshot(),before); assert.equal(stage.economy.gold,gold);
  });
  await test('skill detail resolves current-star damage instead of multiplier lists', async () => {
    const stage = await makeStage(freshRunSave());
    for (const star of [1,2,3]) {
      for (const id of ['mage','enderman','sasuke']) {
        const base = stage.cfg.getUnit(id), unit = stage.cfg.scaleUnit(base,star);
        const skill = stage.cfg.getSkill(unit.skillId);
        const scale = stage.cfg.battle.starScaling[star-1].skill;
        stage.showDetail(star,unit,scale,0,unit.hp,unit.startMana);
        const expected = Math.round(skill.starDamage?.[star-1] ?? skill.power*scale);
        if (id === 'enderman') {
          assert.equal(stage.ui.detail.skillName,'末影突袭');
          assert.ok(stage.ui.detail.skillDescription.includes(`${expected}点物理伤害`),`${id} star ${star}`);
          assert.doesNotMatch(stage.ui.detail.skillDescription,/施法|攻速上限/);
          if (star < 3) assert.doesNotMatch(stage.ui.detail.skillDescription,/回蓝/);
          assert.ok(stage.ui.detail.skillDescription.includes(`${skill.attackSpeedBonuses[star-1]*100}%攻击速度`));
        } else assert.ok(stage.ui.detail.skillName.includes(`${expected}`),`${id} star ${star}`);
        assert.doesNotMatch(stage.ui.detail.skillDescription.split('\n')[0],/125%\/|150%\/|1~3星/);
        assert.doesNotMatch(stage.ui.detail.skillDescription,/标注来源/);
        assert.ok(stage.ui.detail.skillStats.length>0);
        assert.match(stage.ui.detail.skillStats[0].currentRich,/<color=/);
      }
    }
  });
  await test('drag sale refunds discounted upgraded unit and restores original cards once', async () => {
    const saved = freshRunSave(); saved.shopReserved = true;
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
    const restored = await makeStage(saved); restored.update(.5);
    assert.equal(restored.economy.gold,gold); assert.equal(restored.flow.health,health);
    assert.equal(restored.resultShown,true); assert.equal(restored.ui.shopVisible,false);
    restored.update(.5); assert.equal(restored.flow.waveIndex,1); assert.equal(restored.flow.phase,'prepare');
    restored.restart(); assert.equal(restored.flow.waveIndex,1);
  });
  await test('auto next wave waits one real second, advances once and preserves rewards', async () => {
    const stage=await makeStage();stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    stage.speed=3;stage.sim.run();stage.update(.2);
    assert.equal(stage.flow.phase,'settlement');assert.equal(stage.nextWaveRemaining,1);
    const gold=stage.economy.gold,exp=stage.levelSys.exp;
    const stats=stage.ui.combatStats.map(row=>({...row}));assert.ok(stats.some(row=>row.damage>0));
    stage.update(.75);assert.equal(stage.flow.waveIndex,0);assert.equal(stage.flow.phase,'settlement');
    stage.update(.25);assert.equal(stage.flow.waveIndex,1);assert.equal(stage.flow.phase,'prepare');
    assert.equal(stage.ui.shopVisible,true);assert.equal(stage.resultShown,false);
    stage.update(2);assert.equal(stage.flow.waveIndex,1);assert.equal(stage.economy.gold,gold);assert.equal(stage.levelSys.exp,exp);
    assert.deepEqual(stage.ui.combatStats,stats,'next-wave preparation preserves completed combat statistics');
    stage.startFight();assert.ok(stage.ui.combatStats.every(row=>row.damage===0&&row.taken===0&&row.healing===0),'only starting the next battle clears statistics');
  });
  await test('manual next wave cancels automatic transition and run end retains final result', async () => {
    const stage=await makeStage();stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();stage.sim.run();stage.update(.1);
    stage.restart();stage.update(2);assert.equal(stage.flow.waveIndex,1);assert.equal(stage.nextWaveRemaining,null);
    stage.flow.startBattle();stage.flow.settle(1,99);stage.resultShown=true;stage.fighting=true;stage.scheduleNextWave();
    stage.update(2);assert.equal(stage.flow.phase,'ended');assert.equal(stage.resultShown,true);assert.equal(stage.nextWaveRemaining,null);
  });
  await test('zero-gold starter earns only outcome, interest and streak income across stages', async () => {
    const stage = await makeStage();
    assert.equal(stage.economy.gold,0);assert.equal(stage.owned.all().length,1);
    const cards=stage.shop.snapshot();stage.buyFromShop(0);stage.refreshShop();stage.ui.onBuyExp();
    assert.equal(stage.economy.gold,0);assert.deepEqual(stage.shop.snapshot(),cards);assert.equal(stage.owned.all().length,1);
    stage.owned.move(1,{location:'board',x:3,y:3});
    for(const expectedIncome of [0,0,0,0]) {
      const before=stage.economy.gold;stage.startFight();stage.sim.run();stage.update(.1);
      const reward=stage.save.lastReward.breakdown;
      assert.equal(reward.floorIncome,expectedIncome,'no fixed stage reward at any wave');
      assert.equal(reward.interest,Math.min(Math.floor(before*.1),5));
      assert.equal(reward.winBonus,stage.sim.winner===0?1:0);assert.equal(reward.streakBonus,Math.min(Math.floor(Math.max(reward.winStreak,reward.loseStreak)/2),3));
      assert.equal(stage.economy.gold,before+reward.total);stage.restart();
    }
    const reloaded=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(reloaded.economy.gold,stage.economy.gold,'continuing retains earned gold');
  });
  await test('run end restarts health, economy, levels, inventory, lock, and wave together', async () => {
    const stage = await makeStage(); stage.flow.startBattle(); stage.flow.settle(1,99);
    stage.shop.locked=true; stage.resultShown=true; stage.fighting=true; stage.persistShopState();
    const restored = await makeStage(JSON.parse(storage.get(SAVE_KEY))); restored.restart();
    assert.equal(restored.flow.phase,'prepare'); assert.equal(restored.flow.health,restored.cfg.battle.initialHealth);
    assert.equal(restored.flow.waveIndex,0); assert.equal(restored.economy.gold,0);
    assert.equal(restored.levelSys.level,1); assert.equal(restored.owned.all().length,1);
    assert.equal(restored.shop.locked,false); assert.equal(restored.shop.slots.filter(s=>s.unitId).length,5);
    const total = new CardPool(units).total();
    assert.equal(restored.pool.total()+1+5,total);
  });
  await test('experience button exchanges exactly four gold for four XP and persists upgrades', async () => {
    const stage = await makeStage({ ...freshRunSave(), gold: 20 }), beforeShop = stage.shop.snapshot();
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
    const poor = await makeStage({ ...freshRunSave(), gold: 3 });
    const before = storage.get(SAVE_KEY); poor.ui.onBuyExp();
    assert.equal(poor.economy.gold, 3); assert.equal(poor.levelSys.exp, 0); assert.equal(poor.levelSys.level, 1);
    assert.equal(storage.get(SAVE_KEY), before); assert.equal(poor.ui.warn, '金币不足');
    const max = await makeStage({ ...freshRunSave(), gold: 20, level: 10 }); max.ui.onBuyExp();
    assert.equal(max.economy.gold, 20); assert.equal(max.levelSys.exp, 0); assert.equal(max.ui.warn, '已达最高等级');
    const fighting = await makeStage({ ...freshRunSave(), gold: 20 });
    fighting.owned.move(fighting.owned.all()[0].uid, { location: 'board', x: 2, y: 3 }); fighting.startFight();
    const sim=fighting.sim; fighting.ui.onBuyExp(); assert.equal(fighting.economy.gold, 16); assert.equal(fighting.levelSys.level, 3);
    assert.equal(fighting.sim,sim);
  });
  await test('XP purchase carries remaining XP and stops charging after reaching level ten', async () => {
    const stage = await makeStage({ ...freshRunSave(), gold: 20, level: 9, exp: 66 });
    stage.ui.onBuyExp();
    assert.equal(stage.economy.gold, 16); assert.equal(stage.levelSys.level, 10); assert.equal(stage.levelSys.exp, 2);
    stage.ui.onBuyExp(); assert.equal(stage.economy.gold, 16); assert.equal(stage.levelSys.exp, 2);
    const normal = await makeStage({ ...freshRunSave(), gold: 20, level: 3, exp: 3 }); normal.ui.onBuyExp();
    assert.equal(normal.levelSys.level, 4); assert.equal(normal.levelSys.exp, 1);
  });
  await test('star rank reaches bench and combat views and updates after merging', async () => {
    const saved = freshRunSave(); saved.owned = [
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
  await test('fresh game renders bench and populates shop without charging', async () => {
    const stage = await makeStage();
    assert.equal(stage.ownedViews?.size, 1);
    assert.equal(stage.owned.all()[0].star,1); assert.equal(stage.cfg.getUnit(stage.owned.all()[0].unitId).cost,1);
    assert.equal(stage.waves.length,78); assert.equal(stage.save.stageCount,10);
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
    stage.update(1); stage.update(0.1); assert.ok(stage.replayer.seen.length > 0);
    stage.sim.run(); stage.update(0.1);
    const gold = stage.economy.gold, floor = stage.save.floor;
    stage.restart();
    assert.equal(stage.ui.shopVisible, true); assert.equal(stage.economy.gold, gold);
    assert.equal(stage.save.floor, floor, 'subrounds retain stage income'); assert.equal(stage.flow.wave.round,2);
    assert.equal(stage.ui.slots.filter(s => s.unitId).length, 5);
    assert.equal(stage.replayer.sim, stage.sim);
  });
  await test('purchase immediately renders new bench unit and persists initialization', async () => {
    const stage = await makeStage({ ...freshRunSave(), gold: 20 }); stage.buyFromShop(0);
    assert.equal(stage.ownedViews?.size, stage.owned.all().length);
    const saved = JSON.parse(storage.get(SAVE_KEY));
    assert.equal(saved.owned.length, stage.owned.all().length);
    const reloaded = await makeStage(saved);
    assert.deepEqual(reloaded.pool.snapshot(), stage.pool.snapshot());
    assert.deepEqual(reloaded.shop.snapshot(), stage.shop.snapshot());
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
    const stage = await makeStage({ ...freshRunSave(), gold: 20 }); stage.startFight();
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
  await test('runtime population grows across stages without increasing shared base stats', async () => {
    const resumed=(count,index)=>({...freshRunSave(count),round:{phase:'prepare',waveIndex:index,health:20,result:null,lastSettlement:null}});
    const previous=await makeStage(resumed(3,7));
    const next=await makeStage(resumed(3,8));
    const longer=await makeStage(resumed(6,8));
    const army=stage=>stage.sim.units.filter(u=>u.side===1).map(u=>({id:u.cfg.id,star:u.star,hp:u.cfg.hp,atk:u.cfg.atk,armor:u.cfg.armor,mr:u.cfg.mr}));
    const prevArmy=army(previous),nextArmy=army(next);
    assert.deepEqual(nextArmy,prevArmy,'same tier and population keep exactly the same stats');
    assert.deepEqual(army(longer),nextArmy,'simulation stats stay identical when more stages are selected');
    const later=await makeStage(resumed(3,9));
    assert.equal(army(later).length,nextArmy.length+1,'third completed subround adds one population');
    assert.deepEqual(army(later).slice(0,nextArmy.length),nextArmy);
  });
  await test('late-stage bonuses reach combat and detail without mutating shared unit configs', async () => {
    const run=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config/run.json'),'utf8'));
    const templates=JSON.parse(fs.readFileSync(path.join(root,'assets/resources/config/waves.json'),'utf8'));
    const waves=core('RunSetup').buildRunWaves(10,run,templates,units),index=waves.findIndex(w=>w.stage===10);
    const stage=await makeStage({...freshRunSave(10),round:{phase:'prepare',waveIndex:index,health:20,result:null,lastSettlement:null}});
    assert.equal(stage.sim.units.filter(u=>u.side===1).length,10);
    const enemy=stage.sim.units.find(u=>u.side===1);stage.showBattleDetail(enemy.id);
    assert.equal(stage.ui.detail.damageAmp,.05);assert.equal(stage.ui.detail.damageReduction,.05);
    assert.equal(enemy.cfg.hp,stage.cfg.scaleUnit(stage.cfg.getUnit(enemy.cfg.id),3).hp);
    assert.equal(stage.cfg.getUnit(enemy.cfg.id).damageAmp,0);assert.equal(stage.cfg.getUnit(enemy.cfg.id).damageReduction,0);
    stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    const ally=stage.sim.units.find(u=>u.side===0);stage.showBattleDetail(ally.id);
    assert.equal(stage.ui.detail.spellPower,0);assert.equal(stage.ui.detail.critChance,.25);
  });
  await test('main menu return preserves run and is blocked during battle', async () => {
    const stage=await makeStage(freshRunSave(5)); sceneLoads.length=0;
    stage.ui.onHome(); assert.deepEqual(sceneLoads,['main']);
    assert.equal(JSON.parse(storage.get(SAVE_KEY)).stageCount,5);
    stage.owned.move(1,{location:'board',x:3,y:3}); stage.startFight();
    stage.ui.onHome(); assert.equal(sceneLoads.length,1);
  });
  await test('combat shop, XP, lock, reserve swap/sale and board merging preserve the active battle', async () => {
    const saved=freshRunSave(); saved.level=4;saved.gold=100;
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
    assert.equal(stage.owned.get(1).star,1);assert.equal(stage.owned.get(2).star,1);
    assert.equal(stage.owned.all().filter(u=>u.unitId==='warrior').length,3,'all three cards remain owned during combat');
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
    const saved=freshRunSave();saved.gold=20;saved.owned=[{uid:1,unitId:'warrior',star:1,location:'bench',x:-1,y:0},
      {uid:2,unitId:'warrior',star:1,location:'board',x:3,y:3}];
    saved.shop=['warrior',null,null,null,null].map(unitId=>({unitId}));
    const stage=await makeStage(saved);stage.startFight();const sim=stage.sim;stage.buyFromShop(0);
    assert.equal(stage.owned.get(1).star,1);assert.equal(stage.owned.get(2).star,1);
    assert.equal(stage.owned.all().filter(u=>u.unitId==='warrior').length,3);
    assert.equal(stage.owned.get(2).location,'board');assert.equal(stage.owned.get(2).x,3);
    assert.equal(stage.sim,sim);assert.equal(sim.units.find(u=>u.side===0).star,1);
  });
  await test('combat details follow runtime HP/mana for allies and enemies even after death', async () => {
    const stage=await makeStage();stage.owned.move(1,{location:'board',x:3,y:3});stage.startFight();
    const ally=stage.sim.units.find(u=>u.side===0),enemy=stage.sim.units.find(u=>u.side===1);
    ally.hp=321;ally.mana=27;stage.showBattleDetail(ally.id);stage.refreshDetailVitals();
    assert.deepEqual(stage.ui.vitals,[321,ally.cfg.hp,27,ally.cfg.maxMana]);
    ally.attackSpeedBonus=1.5;ally.cfg.atk+=10;ally.cfg.armor+=5;
    ally.cfg.physicalPower=35;ally.cfg.spellPower=80;ally.cfg.damageAmp=.2;
    stage.refreshDetailVitals();
    assert.equal(stage.ui.detail.atkSpeed,ally.attackSpeed);
    assert.equal(stage.ui.detail.atk,ally.cfg.atk);assert.equal(stage.ui.detail.armor,ally.cfg.armor);
    assert.equal(stage.ui.detail.physicalPower,35);assert.equal(stage.ui.detail.spellPower,80);
    assert.equal(stage.ui.detail.damageAmp,.2);
    ally.attackSpeedBonus=0;stage.refreshDetailVitals();assert.equal(stage.ui.detail.atkSpeed,ally.attackSpeed);
    stage.ui.closeUnitDetail();stage.refreshDetailVitals();assert.equal(stage.ui.unitDetailVisible,false,'refresh never reopens a closed panel');
    enemy.hp=0;enemy.alive=false;stage.showBattleDetail(enemy.id);stage.refreshDetailVitals();
    assert.equal(stage.ui.detail.name,enemy.cfg.name);assert.equal(stage.ui.vitals[0],0);assert.equal(stage.ui.detail.side,1);
    assert.equal(stage.ui.detail.skillDescription,enemy.cfg.description);
  });
  await test('displayed cost rates match implemented tiers and refresh stays populated at high level', async () => {
    const saved=freshRunSave();saved.level=10;saved.gold=100;
    const stage=await makeStage(saved);const rates=stage.shop.costRates();
    assert.ok(rates[3]>0);assert.ok(rates[4]>0);assert.ok(Math.abs(rates.reduce((a,b)=>a+b,0)-100)<1e-8);
    assert.deepEqual(stage.ui.rates,rates);
    for(let i=0;i<10;i++) { stage.refreshShop();assert.equal(stage.shop.slots.filter(s=>s.unitId).length,5); }
  });
  await test('equipment detail edits persist, cap at three and lock during combat', async () => {
    const stage=await makeStage(); const unit=stage.owned.all()[0];
    stage.showOwnedDetail(unit.uid);
    for(let i=0;i<4;i++) stage.ui.onGrantEquipment();
    for(let i=0;i<4;i++) stage.ui.onBackpack(0);
    assert.equal(stage.owned.equipmentReserve.length,1);
    assert.equal(stage.ownedViews.get(unit.uid).equipment.length,3);
    assert.equal(unit.equipment.length,3); assert.equal(stage.ui.equipment.items.length,3);
    assert.ok(stage.ui.detail.spellPower>=30);
    const saved=JSON.parse(storage.get(SAVE_KEY)); assert.equal(saved.owned.find(u=>u.uid===unit.uid).equipment.length,3);
    stage.ui.onEquipment(1);assert.equal(unit.equipment.length,2);assert.equal(stage.owned.equipmentReserve.length,2);
    stage.owned.move(unit.uid,{location:'board',x:0,y:0}); stage.resetBattle(false);stage.startFight();
    stage.showOwnedDetail(unit.uid);stage.ui.onEquipment(0);assert.equal(unit.equipment.length,2);
    assert.equal(stage.ui.equipment.editable,false);
    const combat=stage.sim.units.find(u=>u.side===0);assert.equal(combat.equipment.length,2);
  });
  await test('totem grant, equip, detail stats, save reload, combat stats and equipment lock', async () => {
    const stage=await makeStage(); const unit=stage.owned.all()[0];
    stage.showOwnedDetail(unit.uid); const before={...stage.ui.detail};
    stage.ui.onGrantEquipment('totem_of_undying');
    assert.equal(stage.ui.backpack.items[0].id,'totem_of_undying');
    stage.ui.onBackpack(0);
    assert.deepEqual(unit.equipment,['totem_of_undying']);
    assert.equal(stage.ui.detail.maxHp,before.maxHp+200);
    assert.equal(stage.ui.detail.armor,before.armor+10);assert.equal(stage.ui.detail.mr,before.mr+10);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.deepEqual(resumed.owned.all()[0].equipment,['totem_of_undying']);
    const current=resumed.owned.all()[0];
    resumed.owned.move(current.uid,{location:'board',x:0,y:0});resumed.resetBattle(false);resumed.startFight();
    const combat=resumed.sim.units.find(u=>u.side===0);
    assert.equal(combat.equipment[0].id,'totem_of_undying');assert.equal(combat.cfg.hp,before.maxHp+200);
    resumed.ui.onGrantEquipment('totem_of_undying');assert.equal(resumed.owned.equipmentReserve.length,0);
  });
  await test('skill-crit items grant, stack matching attributes, reload, unlock combat and unequip', async () => {
    const stage=await makeStage();const unit=stage.owned.all()[0];stage.showOwnedDetail(unit.uid);
    const before={...stage.ui.detail};
    for(const id of ['jeweled_gauntlet','infinity_edge']) {stage.ui.onGrantEquipment(id);stage.ui.onBackpack(0);}
    assert.deepEqual(unit.equipment,['jeweled_gauntlet','infinity_edge']);
    assert.equal(stage.ui.detail.physicalPower,(before.physicalPower??0)+20);
    assert.equal(stage.ui.detail.spellPower,(before.spellPower??0)+20);
    assert.ok(Math.abs(stage.ui.detail.critChance-.95)<1e-9);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY))), current=resumed.owned.all()[0];
    assert.deepEqual(current.equipment,['jeweled_gauntlet','infinity_edge']);
    resumed.owned.move(current.uid,{location:'board',x:0,y:0});resumed.resetBattle(false);resumed.startFight();
    const combat=resumed.sim.units.find(u=>u.side===0);assert.equal(combat.cfg.skillCanCrit,true);
    assert.ok(Math.abs(combat.cfg.critChance-.95)<1e-9);
    stage.showOwnedDetail(unit.uid);stage.ui.onEquipment(0);stage.ui.onEquipment(0);
    stage.owned.move(unit.uid,{location:'board',x:0,y:0});stage.resetBattle(false);
    assert.equal(stage.sim.units.find(u=>u.side===0).cfg.skillCanCrit,false,'trait removed with last item');
    assert.equal(stage.owned.equipmentReserve.length,2);
  });
  await test('backpack drag equips reserve unit and generic consumables survive reload', async () => {
    const saved=twoUnitSave();saved.equipmentReserve=['guinsoo'];
    saved.backpackItems=[{id:'future_potion',name:'后续道具',kind:'consumable',icon:'art/equipment/guinsoo/spriteFrame'}];
    const stage=await makeStage(saved), unit=stage.owned.all()[0];
    assert.equal(stage.ui.backpack.items.length,2);
    stage.ui.onBackpack(0,touch(stage.benchSlotWorld(unit.y)));
    assert.equal(unit.equipment.length,1);assert.equal(stage.owned.equipmentReserve.length,0);
    assert.equal(stage.ui.backpack.items[0].kind,'consumable');
    stage.ui.onBackpack(0);assert.equal(unit.equipment.length,1);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(resumed.ui.backpack.items[0].id,'future_potion');
    assert.equal(resumed.ownedViews.get(resumed.owned.all()[0].uid).equipment.length,1);
  });
  await test('debug catalogue follows configs and gold grants preserve combat and survive reload at the save cap', async () => {
    const stage=await makeStage();
    assert.equal(stage.ui.debugData.equipment.length,require('../assets/resources/config/equipment.json').length);
    assert.deepEqual(stage.ui.debugData.units.map(u=>u.id),units.map(u=>u.id));
    assert.equal(stage.ui.debugData.roundsPerStage.length,99);assert.equal(stage.ui.debugData.roundsPerStage[0],3);
    stage.ui.onDebugGold(100);assert.equal(stage.economy.gold,100);assert.equal(stage.ui.top.gold,100);
    for(const amount of [NaN,Infinity,-10,0,1.5,1000001])stage.ui.onDebugGold(amount);
    assert.equal(stage.economy.gold,100);
    const unit=stage.owned.all()[0];stage.owned.move(unit.uid,{location:'board',x:0,y:0});stage.resetBattle(false);stage.startFight();
    const sim=stage.sim,views=stage.views,driver=stage.driver;stage.ui.onDebugGold(1000);
    assert.equal(stage.economy.gold,1100);assert.equal(stage.sim,sim);assert.equal(stage.views,views);assert.equal(stage.driver,driver);
    stage.economy.gold=999995;stage.ui.onDebugGold(100);assert.equal(stage.economy.gold,999999);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY)));assert.equal(resumed.economy.gold,999999);
    resumed.ui.onDebugGold(10);assert.equal(resumed.economy.gold,999999);
  });
  await test('debug unit grants conserve star copies and equipment through reload and sale', async () => {
    const stage=await makeStage(),id=units.find(unit=>unit.cost===5).id,stock=stage.pool.count(id),gold=stage.economy.gold;
    stage.ui.onDebugUnit(id,3);
    assert.equal(stage.economy.gold,gold);assert.equal(stage.pool.count(id),stock-9);
    const unit=stage.owned.all().find(unit=>unit.unitId===id);assert.equal(unit.star,3);assert.equal(unit.location,'bench');
    assert.ok(stage.ownedViews.has(unit.uid));
    stage.ui.onDebugUnit(id,3);assert.equal(stage.pool.count(id),stock-9,'insufficient stock does not grant more copies');
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY))),restored=resumed.owned.all().find(unit=>unit.unitId===id);
    assert.equal(restored.star,3);assert.equal(resumed.pool.count(id),stock-9);
    resumed.shop.sell(restored.uid);assert.equal(resumed.pool.count(id),stock);
  });
  await test('debug unit rejects invalid/full bench, allows full-bench merge and rolls back failures', async () => {
    const saved=twoUnitSave();saved.benchSlots=2;for(const unit of saved.owned)unit.unitId='warrior';
    saved.owned[0].equipment=['totem_of_undying'];
    const stage=await makeStage(saved),stock=stage.pool.count('warrior');
    stage.ui.onDebugUnit('archer',1);assert.equal(stage.owned.all().length,2);assert.match(stage.ui.warn,/已满/);
    stage.ui.onDebugUnit('warrior',1);assert.equal(stage.owned.all().length,1);assert.equal(stage.owned.all()[0].star,2);
    assert.deepEqual(stage.owned.all()[0].equipment,['totem_of_undying']);assert.equal(stage.pool.count('warrior'),stock-1);
    const before=stage.owned.snapshot(),pool=stage.pool.snapshot();
    for(const [id,star] of [['missing',1],['warrior',0],['warrior',4],['warrior',1.5]])stage.ui.onDebugUnit(id,star);
    assert.deepEqual(stage.owned.snapshot(),before);assert.deepEqual(stage.pool.snapshot(),pool);
    const original=stage.owned.addToBench;stage.owned.addToBench=()=>{throw Error('injected');};stage.ui.onDebugUnit('warrior',1);stage.owned.addToBench=original;
    assert.deepEqual(stage.owned.snapshot(),before);assert.deepEqual(stage.pool.snapshot(),pool);
  });
  await test('debug stage jump extends the run without changing existing waves, resources or shop and resumes exactly', async () => {
    const stage=await makeStage(freshRunSave(3));stage.ui.onDebugGold(100);stage.ui.onGrantEquipment('totem_of_undying');
    const oldWaves=JSON.parse(JSON.stringify(stage.waves)),gold=stage.economy.gold,exp=stage.levelSys.exp,
      owned=stage.owned.snapshot(),shop=stage.shop.snapshot(),pool=stage.pool.snapshot();
    stage.ui.onDebugStage(5,2);
    assert.equal(stage.save.stageCount,5);assert.equal(stage.flow.wave.stage,5);assert.equal(stage.flow.wave.round,2);
    assert.deepEqual(stage.waves.slice(0,oldWaves.length),oldWaves,'old stage enemies and names stay unchanged');
    assert.equal(stage.flow.phase,'prepare');assert.equal(stage.save.lastReward,undefined);assert.equal(stage.save.floor,5);
    assert.equal(stage.economy.gold,gold);assert.equal(stage.levelSys.exp,exp);assert.deepEqual(stage.owned.snapshot(),owned);
    assert.deepEqual(stage.shop.snapshot(),shop);assert.deepEqual(stage.pool.snapshot(),pool);
    assert.deepEqual(stage.owned.equipmentReserve,['totem_of_undying']);assert.deepEqual(stage.ui.debugState,[5,2,5]);
    assert.equal(stage.replayer.sim,stage.sim);assert.equal(stage.replayer.eventCursor,0);assert.equal(stage.sim.tick,0);
    const resumed=await makeStage(JSON.parse(storage.get(SAVE_KEY)));
    assert.equal(resumed.save.stageCount,5);assert.equal(resumed.flow.wave.stage,5);assert.equal(resumed.flow.wave.round,2);
    assert.equal(resumed.economy.gold,gold);assert.deepEqual(resumed.owned.snapshot(),owned);
    const sim=resumed.sim;
    for(const [s,r] of [[0,1],[100,1],[NaN,1],[2,0],[2,999],[2.5,1],[2,1.5]])resumed.ui.onDebugStage(s,r);
    assert.equal(resumed.sim,sim);resumed.ui.onDebugStage(1,1);assert.equal(resumed.save.stageCount,5);
  });
  await test('debug jump cancels countdown, active battle and pending settlement without stale rewards or timers', async () => {
    for(const phase of ['countdown','battle','settlement','ended']) {
      const stage=await makeStage(),unit=stage.owned.all()[0];
      stage.owned.move(unit.uid,{location:'board',x:0,y:0});stage.resetBattle(false);stage.startFight();
      if(phase==='battle')stage.update(1.05);
      if(phase==='settlement'||phase==='ended') {
        if(phase==='ended')stage.flow.state.health=0;
        stage.sim.finished=true;stage.sim.winner=1;stage.update(0);
      }
      const oldSim=stage.sim,tick=oldSim.tick,gold=stage.economy.gold,exp=stage.levelSys.exp,health=stage.flow.health;
      const reserve=stage.owned.equipmentReserve.length;stage.ui.onGrantEquipment('guinsoo');
      assert.equal(stage.owned.equipmentReserve.length,reserve);
      const before=stage.owned.snapshot();stage.ui.onDebugUnit('warrior',1);assert.deepEqual(stage.owned.snapshot(),before);
      stage.ui.onDebugStage(2,1);
      assert.equal(stage.flow.phase,'prepare',phase);assert.equal(stage.flow.health,health||stage.cfg.battle.initialHealth);
      assert.equal(stage.fighting,false);assert.equal(stage.preparationRemaining,0);assert.equal(stage.nextWaveRemaining,null);
      assert.equal(stage.resultShown,false);assert.equal(stage.ui.combatActive,false);assert.equal(stage.ui.shopVisible,true);
      assert.ok(stage.ui.combatStats.every(row=>row.damage===0&&row.taken===0&&row.healing===0));
      stage.update(30);assert.equal(stage.flow.wave.stage,2);assert.equal(stage.flow.wave.round,1);
      assert.equal(stage.economy.gold,gold);assert.equal(stage.levelSys.exp,exp);assert.equal(oldSim.tick,tick);
    }
  });
  await test('debug mutations reject an in-progress drag', async () => {
    const stage=await makeStage(),before=stage.owned.snapshot(),sim=stage.sim,gold=stage.economy.gold;
    stage.draggingId=before[0].uid;stage.ui.onDebugGold(100);stage.ui.onDebugUnit('warrior',1);stage.ui.onDebugStage(2,1);
    assert.equal(stage.economy.gold,gold);assert.equal(stage.sim,sim);assert.deepEqual(stage.owned.snapshot(),before);
  });
  await test('RunSession: repeated UI preview rebuilds preserve shops, combat seed and complete battle events', async () => {
    const saved={...freshRunSave(3,12345),owned:[{uid:17,unitId:'warrior',star:1,location:'board',x:3,y:3}],shopReserved:false};
    const a=await makeStage(saved),b=await makeStage(saved);
    const before=b.shop.snapshot(),seed=b.session.battleSeed;
    for(let i=0;i<25;i++)b.resetBattle(false);
    assert.deepEqual(b.shop.snapshot(),before);assert.equal(b.session.battleSeed,seed);
    a.startFight();b.startFight();assert.deepEqual(a.sim.run(),b.sim.run());
    a.update(.1);b.update(.1);assert.deepEqual(a.save.lastReward,b.save.lastReward);
    assert.deepEqual(a.session.snapshot(),b.session.snapshot());
  });
  await test('RunSession: Cocos adapter and pure headless session consume identical actions and settlement', async () => {
    const {RunSession}=core('RunSession'),{ConfigManager}=core('ConfigManager');
    const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
    const saved=freshRunSave(3,12345),stage=await makeStage(saved),cfg=new ConfigManager();
    cfg.setUnits(units);cfg.setSkills(skills);cfg.setBattle(require('../assets/resources/config/battle.json'));
    cfg.setEquipment(require('../assets/resources/config/equipment.json'));
    const session=new RunSession(cfg,legacyRun,require('../assets/resources/config/waves.json'),{save:saved});
    const bot=new MinimalBaselineBot();
    for(let i=0;i<4;i++){
      assert.deepEqual(bot.prepare(stage.session.playerPort()),bot.prepare(session.playerPort()));
      stage.resetBattle(false);stage.startFight();const headless=session.startBattle();
      assert.deepEqual(stage.sim.run(),headless.run());stage.update(.1);session.settleBattle();
      assert.deepEqual(stage.session.snapshot(),session.snapshot());
      stage.restart();session.nextWave();assert.deepEqual(stage.session.snapshot(),session.snapshot());
    }
  });
  // Current production content remains covered by the same real stage/headless adapter below.
  currentContentEnabled=true;
  units=require('../assets/resources/config/units.json');skills=require('../assets/resources/config/skills.json');
  legacyRun=JSON.parse(JSON.stringify(require('../assets/resources/config/run.json')));delete legacyRun.stageEncounters;delete legacyRun.starterSelection;
  await test('budget-v1: new Cocos sessions and headless sessions consume the same generated enemies and real combat', async () => {
    const {RunSession}=core('RunSession'),{ConfigManager}=core('ConfigManager');
    const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
    const saved={...createSaveV2(3,12345),formationOverride:'L0'},stage=await makeStage(saved),cfg=new ConfigManager();
    cfg.setUnits(units);cfg.setSkills(skills);cfg.setBattle(require('../assets/resources/config/battle.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
    const deps={enemyPower:require('../assets/resources/config/enemy-power.json'),enemyDifficulty:require('../assets/resources/config/enemy-difficulty.json')};
    const session=new RunSession(cfg,legacyRun,require('../assets/resources/config/waves.json'),{save:saved,...deps, openingEncounter:true});
    session.chooseOpeningEncounter('inspiration');
    assert.equal(stage.save.enemyGenerationVersion,'budget-v1');assert.deepEqual(stage.waves,session.waves);
    const bot=new MinimalBaselineBot();
    for(let i=0;i<5;i++){
      assert.deepEqual(bot.prepare(stage.session.playerPort()),bot.prepare(session.playerPort()));stage.resetBattle(false);stage.startFight();
      assert.deepEqual(stage.sim.run(),session.startBattle().run());stage.update(.1);session.settleBattle();assert.deepEqual(stage.session.snapshot(),session.snapshot());
      stage.restart();session.nextWave();
    }
  });
  await test('budget-v1: Cocos debug extension, persisted continuation and late combat keep versioned budgets without free scaling', async () => {
    const stage=await makeStage({...createSaveV2(3,12345),formationOverride:'L0'});stage.ui.onDebugStage(10,1);
    assert.equal(stage.flow.wave.budget.enemyGenerationMode,'budget-v1');
    for(const u of stage.sim.units.filter(u=>u.side===1)){assert.equal(u.cfg.damageAmp,stage.cfg.getUnit(u.cfg.id).damageAmp);assert.equal(u.cfg.damageReduction,stage.cfg.getUnit(u.cfg.id).damageReduction);}
    const saved=stage.session.snapshot(),continued=await makeStage(saved);assert.deepEqual(continued.waves,stage.waves);assert.deepEqual(continued.session.snapshot(),saved);
  });
  await test('P2: Cocos loads versioned formation resources and shows fixed L2 preview before L3 locks at battle start',async()=>{
    const saved=createSaveV2(3,12345);saved.formationOverride='L3';saved.level=3;
    saved.owned=[{uid:1,unitId:'helion',star:1,location:'board',x:3,y:3},{uid:2,unitId:'celine',star:2,location:'board',x:0,y:0},{uid:3,unitId:'saiph',star:2,location:'board',x:1,y:0}];
    const stage=await makeStage(saved);stage.ui.onDebugStage(14,10);const base=stage.session.formation,seed=stage.session.battleSeed,shop=stage.shop.snapshot();
    assert.equal(base.level,'L2');assert.equal(base.diagnostics.playerSnapshotUsed,false);
    for(let n=0;n<20;n++)stage.resetBattle(false);assert.deepEqual(stage.session.formation,base);assert.deepEqual(stage.shop.snapshot(),shop);
    const generator=JSON.parse(JSON.stringify(stage.flow.wave)),before=stage.session.snapshot();stage.startFight();
    const final=stage.session.formation;assert.equal(final.level,'L3');assert.ok(final.diagnostics.playerSnapshotUsed);assert.equal(stage.session.battleSeed,seed);assert.deepEqual(stage.flow.wave,generator);
    assert.deepEqual(stage.sim.units.filter(u=>u.side===1).map(u=>({x:u.x,y:u.y})),final.placements.map(e=>({x:e.x,y:e.y})));
    const {ConfigManager}=core('ConfigManager'),{RunSession}=core('RunSession'),cfg=new ConfigManager();cfg.setUnits(units);cfg.setSkills(skills);cfg.setBattle(require('../assets/resources/config/battle.json'));cfg.setEquipment(require('../assets/resources/config/equipment.json'));
    const {loadEnemyGenerationInputs,loadFormationInputs}=require('../tools/run-simulation.ts');
    const headless=new RunSession(cfg,legacyRun,require('../assets/resources/config/waves.json'),{save:before,...loadEnemyGenerationInputs(),...loadFormationInputs()});
    assert.deepEqual(headless.startBattle().run(),stage.sim.run());assert.deepEqual(headless.formation,final);
  });
  await test('advanced equipment stays in save, debug catalogue and detail with live missing-HP lifesteal', async () => {
    const stage=await makeStage(),unit=stage.owned.all()[0];stage.showOwnedDetail(unit.uid);
    const before={...stage.ui.detail};
    for(const id of ['arcane_sovereignty','crimson_bloodclaw','forest_sanctuary']) {
      assert.ok(stage.ui.debugData.equipment.some(item=>item.id===id));
      stage.ui.onGrantEquipment(id);stage.ui.onBackpack(0);
    }
    const detail=stage.ui.detail;
    assert.equal(detail.maxHp,Math.round((before.maxHp+500)*1.2));
    assert.equal(detail.armor,before.armor+10);assert.equal(detail.mr,before.mr+10);
    assert.equal(detail.spellPower,(before.spellPower??0)+60);assert.equal(detail.physicalPower,(before.physicalPower??0)+10);
    assert.ok(Math.abs(detail.damageAmp-.03)<1e-9);assert.ok(Math.abs(detail.lifesteal-.2)<1e-9);
    const restored=await makeStage(JSON.parse(storage.get(SAVE_KEY))),owned=restored.owned.all()[0];
    assert.deepEqual(owned.equipment,['arcane_sovereignty','crimson_bloodclaw','forest_sanctuary']);
    restored.owned.move(owned.uid,{location:'board',x:0,y:0});restored.resetBattle(false);restored.startFight();
    const combat=restored.sim.units.find(u=>u.side===0);combat.hp=combat.cfg.hp*.4;
    restored.showBattleDetail(combat.id);assert.ok(Math.abs(restored.ui.detail.lifesteal-.26)<1e-9);
    combat.hp=combat.cfg.hp;restored.refreshDetailVitals();assert.ok(Math.abs(restored.ui.detail.lifesteal-.2)<1e-9);
  });
  await test('P3: actual Cocos adapter persists pending before UI, blocks auto/manual restart and restores/claims exactly once',async()=>{
    const ticket=createSaveV2(10,12345,'budget-v1',true),stage=await makeStage(ticket);
    assert.equal(stage.save.enemyEquipmentVersion,'equipment-policy-v1');
    stage.levelSys.addExp(10000);const starter=stage.owned.all()[0];stage.owned.remove(starter.uid);
    for(const [index,id]of ['helion','celine','saiph'].entries()){
      stage.ui.onDebugUnit(id,3);const unit=stage.owned.all().find(u=>u.unitId===id);assert.ok(unit);stage.owned.move(unit.uid,{location:'board',x:1+index*2,y:index?1:3});
    }
    stage.ui.onDebugStage(3,6);stage.startFight();assert.equal(stage.sim.run().winner,0);stage.update(.1);
    const pending=stage.session.pendingEquipmentReward;assert.ok(pending);assert.equal(stage.nextWaveRemaining,null);
    assert.deepEqual(stage.ui.rewardItems.map(i=>i.id),pending.candidates);
    const saved=JSON.parse(storage.get(SAVE_KEY));assert.deepEqual(saved.equipmentProgress.pending,pending);
    const gold=stage.economy.gold,xp=stage.levelSys.exp,wave=stage.flow.wave.id;
    stage.update(5);stage.restart();assert.equal(stage.flow.wave.id,wave);assert.ok(stage.session.pendingEquipmentReward);
    const restored=await makeStage(saved);assert.deepEqual(restored.ui.rewardItems.map(i=>i.id),pending.candidates);assert.equal(restored.economy.gold,gold);assert.equal(restored.levelSys.exp,xp);
    restored.ui.onClaimEquipmentReward(1);assert.equal(restored.ui.rewardItems,null);assert.equal(restored.owned.equipmentReserve.length,1);
    const claimed=JSON.parse(storage.get(SAVE_KEY));assert.equal(claimed.equipmentProgress.pending,undefined);assert.equal(claimed.equipmentProgress.lastClaimedWaveId,wave);
    restored.ui.onClaimEquipmentReward(1);assert.equal(restored.owned.equipmentReserve.length,1);
    restored.update(2);assert.equal(restored.flow.wave.id,wave+1);assert.equal(restored.flow.phase,'prepare');
    const again=await makeStage(claimed);assert.equal(again.session.pendingEquipmentReward,undefined);assert.equal(again.owned.equipmentReserve.length,1);
  });
  await test('new stage UI persists purchases, skips noncombat shop, blocks unopened Boss chest and resumes after random reward',async()=>{
    stageEncountersEnabled=true;
    try {
      const ticket=createSaveV2(6,1,'budget-v1');ticket.level=10;
      ticket.owned=['helion','bao_zero','atlas','oris','crimson_demon_knight','blackstar_warlock','voidscar_reaver','aurelia','celine','eclipse_crossbow'].map((unitId,n)=>({uid:n+1,unitId,star:3,location:'board',x:n%7,y:2+Math.floor(n/7),equipment:[]}));ticket.nextOwnedUid=11;
      const stage=await makeStage(ticket);
      stage.ui.onDebugGold(100);stage.ui.onDebugStage(4,3);
      const shopReward=stage.session.pendingStageReward;assert.equal(shopReward.kind,'specialShop');
      stage.openStageReward();assert.equal(stage.stageRewards.pending.id,shopReward.id);const gold=stage.economy.gold;
      stage.chooseStageReward({type:'stageChoice',rewardId:shopReward.id,choice:'buy',index:0});
      assert.equal(stage.economy.gold,gold-shopReward.offers[0].price);
      const saved=JSON.parse(storage.get(SAVE_KEY));assert.equal(saved.stageProgress.pending.offers[0].bought,true);
      const resumed=await makeStage(saved);resumed.openStageReward();assert.equal(resumed.stageRewards.pending.offers[0].bought,true);
      resumed.ui.onNextWave();
      assert.equal(resumed.flow.wave.stage,4);assert.equal(resumed.flow.wave.round,4);assert.equal(resumed.flow.phase,'prepare');
      resumed.ui.onDebugStage(4,7);resumed.owned.move(resumed.owned.all()[0].uid,{location:'board',x:3,y:3});
      resumed.startFight();
      resumed.preparationRemaining=0; // The real battle has already consumed its preparation countdown.
      // Win with actual authored three-star cards; no combat stat overrides.
      assert.equal(resumed.sim.run().winner,0);resumed.update(.1);
      const boss=resumed.session.pendingStageReward;assert.equal(boss.kind,'bossChoice');
      resumed.update(5);assert.equal(resumed.flow.wave.round,7,'pending choice blocks auto advance');
      resumed.openStageReward();assert.equal(resumed.session.pendingStageReward,undefined);
      const choicePreview=resumed.sim,choiceTick=choicePreview.tick;resumed.update(.2);
      assert.equal(choicePreview.tick,choiceTick,'reward selection keeps the finished battle frozen');
      assert.equal(choicePreview.finished,true);
      const claimedPreview=resumed.sim,claimedTick=claimedPreview.tick;resumed.update(.4);
      assert.equal(claimedPreview,choicePreview);assert.equal(claimedPreview.tick,claimedTick,'claiming preserves the final frame during the next-wave delay');
      resumed.update(2);
      assert.equal(resumed.flow.wave.stage,5);assert.equal(resumed.flow.wave.round,1);
    } finally {stageEncountersEnabled=false;}
  });
  await test('monster chest waits for click and preserves battle result, positions, HP and board views before claim',async()=>{
    stageEncountersEnabled=true;
    try {
      const ticket=createSaveV2(3,1,'budget-v1');ticket.owned=[{uid:1,unitId:'helion',star:1,location:'board',x:3,y:3,equipment:[]}];
      const stage=await makeStage(ticket);
      stage.owned.move(stage.owned.all()[0].uid,{location:'board',x:3,y:3});stage.startFight();stage.preparationRemaining=0;
      // The authored one-star Helion must beat the actual opening monster.
      assert.equal(stage.sim.run().winner,0);
      const endSim=stage.sim,endTick=endSim.tick,endState=endSim.units.map(u=>u.snapshot(endTick)),boardViews=new Map(stage.views);
      stage.update(.1);assert.equal(stage.sim,endSim,'settlement must not recreate the opening preview');
      for(const [id,view]of boardViews)assert.equal(stage.views.get(id),view,'board views stay intact');
      assert.equal(stage.stageRewards.pending,undefined);assert.equal(stage.session.pendingStageReward.kind,'unitBundle');
      assert.equal(stage.save.stageProgress.lastUnitDrop.value,2);
      assert.equal(stage.owned.all().reduce((n,u)=>n+3**(u.star-1),0),1,'rewards stay in the chest before claiming');
      const preview=stage.sim;stage.update(.4);assert.equal(preview.tick,endTick);assert.deepEqual(preview.units.map(u=>u.snapshot(endTick)),endState);
      const saved=JSON.parse(storage.get(SAVE_KEY)),loaded=await makeStage(saved);
      assert.deepEqual(loaded.owned.snapshot(),stage.owned.snapshot());assert.equal(loaded.stageRewards.pending,undefined);
      stage.update(.7);assert.equal(stage.flow.wave.round,1,'unclaimed chest blocks automatic progression');
      stage.openStageReward();assert.equal(stage.flow.wave.round,2);assert.equal(stage.flow.phase,'prepare');
    }finally{stageEncountersEnabled=false;}
  });
  await test('reward flight commits once, holds transition until arrival, and reload keeps already awarded units',async()=>{
    stageEncountersEnabled=true;deferRewardFlights=true;
    try {
      const ticket=createSaveV2(3,1,'budget-v1');ticket.owned=[{uid:1,unitId:'helion',star:1,location:'board',x:3,y:3,equipment:[]}];
      const stage=await makeStage(ticket);stage.startFight();stage.preparationRemaining=0;assert.equal(stage.sim.run().winner,0);stage.update(.1);
      const before=stage.owned.all().reduce((n,u)=>n+3**(u.star-1),0),count=stage.session.pendingStageReward.units.length;
      stage.openStageReward();assert.ok(stage.rewardFlight);assert.equal(stage.session.pendingStageReward,undefined);
      const total=stage.owned.all().reduce((n,u)=>n+3**(u.star-1),0);assert.equal(total,before+count);
      stage.update(20);stage.restart();stage.startFight();assert.equal(stage.flow.wave.round,1,'arrival is a presentation gate');
      const persisted=JSON.parse(storage.get(SAVE_KEY));const restored=await makeStage(persisted);
      assert.equal(restored.owned.all().reduce((n,u)=>n+3**(u.star-1),0),total,'reload neither loses nor duplicates committed units');
      const finish=pendingRewardFlight;pendingRewardFlight=null;finish();assert.equal(stage.rewardFlight,null);assert.equal(stage.flow.wave.round,2);
    }finally{stageEncountersEnabled=false;deferRewardFlights=false;pendingRewardFlight=null;}
  });
  console.log(`Regression: ${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
