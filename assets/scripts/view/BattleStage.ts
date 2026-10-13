import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, Color, Graphics } from 'cc';
import { ConfigManager, BattleConfigData } from '../core/ConfigManager';
import { BattleSim, Placement } from '../battle/BattleSim';
import { TickDriver } from '../core/TickDriver';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { BattleReplayer } from './BattleReplayer';
import { BattleUI } from '../ui/BattleUI';
import { setUISkin } from '../ui/UISkin';
import { EconomySystem } from '../core/EconomySystem';
import { LevelSystem, EXP_PER_BATTLE, EXP_PURCHASE, MAX_LEVEL } from '../core/LevelSystem';
import { Rng } from '../core/Rng';
import { CardPool } from '../core/CardPool';
import { OwnedUnits } from '../core/OwnedUnits';
import { ShopSystem } from '../core/ShopSystem';
import { loadSaveV2, writeSaveV2, freshSaveV2, SaveDataV2 } from '../core/ShopSave';
import { COST_PRICE, Cost, sellPrice } from '../core/ShopConfig';
import { RoundFlow, WaveConfig } from '../core/RoundFlow';
import { UnitConfigData } from '../core/ConfigManager';

const { ccclass, property } = _decorator;

/**
 * 战斗舞台：组装 BoardView + UnitView + BattleSim + TickDriver + BattleUI。
 * - 准备阶段：拖拽己方棋子调整站位（空格移动 / 占格交换 / 无效返回）。
 * - 战斗阶段：禁止拖拽。
 * - 战斗结束返回准备阶段后重新允许调整。
 */
@ccclass('BattleStage')
export class BattleStage extends Component {
  @property(Node)
  boardNode: Node;

  private cfg = new ConfigManager();
  private sim: BattleSim;
  private driver: TickDriver;
  private replayer: BattleReplayer;
  private views = new Map<number, UnitView>();
  /** 战斗回放按 sim id 索引；布阵操作按持有棋子的 uid 索引。 */
  private ownedViews = new Map<number, UnitView>();
  private battleIds = new Map<number, number>();
  private cellSize = 56;
  private loaded = false;
  private fighting = false;
  private ui: BattleUI;
  private speed = 1;

  // 经济 / 等级 / 存档
  private economy: EconomySystem;
  private levelSys: LevelSystem;
  private save: SaveDataV2;
  private pool: CardPool;
  private owned: OwnedUnits;
  private shop: ShopSystem;
  private rng: Rng;
  private resultShown = false;
  private flow: RoundFlow;
  private waves: WaveConfig[];
  private dragStart = new Vec3();
  private dragMoved = false;

  // 拖拽状态
  private draggingId = 0;          // 被拖拽的 unit id（0 = 无）
  private dragging: UnitView | null = null;
  private touchOffset: Vec3 = new Vec3();

  async start() {
    const loadedSave = loadSaveV2();
    this.save = loadedSave ?? freshSaveV2();
    this.economy = new EconomySystem(undefined, {
      gold: this.save.gold,
      winStreak: this.save.winStreak,
      loseStreak: this.save.loseStreak,
    });
    this.levelSys = new LevelSystem({ level: this.save.level, exp: this.save.exp });
    await this.loadConfigs();
    this.flow = new RoundFlow(this.waves, this.cfg.battle, this.save.round ?? undefined);
    this.save.floor = this.flow.waveIndex + 1;
    this.rng = new Rng(Date.now() % 2147483647);
    this.pool = new CardPool(this.cfgUnits(), this.save.pool);
    this.restoreFormation();
    this.owned = new OwnedUnits(this.save.owned);
    // 新局先发初始棋子；抽商品时才预留剩余库存。
    if (!loadedSave || (!this.save.shopReserved && this.owned.all().length === 0)) {
      for (const id of ['warrior', 'archer', 'mage']) {
        if (this.pool.take(id) && !this.owned.addToBench(id, this.save.benchSlots)) this.pool.give(id);
      }
    }
    const restoreShop = loadedSave && (this.save.shopReserved || this.save.shop.some(s => s.unitId));
    this.shop = new ShopSystem(
      this.pool, this.owned, this.economy,
      this.unitMap(), this.rng,
      () => this.levelSys.level,
      this.save.benchSlots,
      restoreShop ? this.save.shop : undefined,
      this.save.shopReserved,
    );
    this.shop.locked = this.save.shopLocked;
    this.buildBoard();
    this.replayer = this.node.addComponent(BattleReplayer);
    const uiNode = new Node('battleUI');
    this.node.parent?.addChild(uiNode);
    this.ui = uiNode.addComponent(BattleUI);
    this.ui.init();
    this.ui.onFight = () => this.startFight();
    this.ui.onSpeed = (s) => { this.speed = s; };
    this.ui.onRestart = () => this.restart();
    this.ui.onBuy = (slot) => this.buyFromShop(slot);
    this.ui.onRefresh = () => this.refreshShop();
    this.ui.onBuyExp = () => this.buyExperience();
    this.ui.onLock = () => {
      if (!this.loaded || this.flow.phase !== 'prepare') return;
      this.shop.locked = !this.shop.locked; this.persistShopState(); this.ui.setLocked(this.shop.locked);
    };
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.setShopVisible(true);
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.loaded = true;
    this.refreshRunUI();
    if (this.flow.phase === 'settlement' || this.flow.phase === 'ended') {
      this.fighting = true; this.resultShown = true; this.ui.hideFightBtn(); this.ui.setShopVisible(false);
      this.showSettlement();
    }
  }

  private loadConfigs(): Promise<void> {
    return new Promise((res, rej) => {
      let pending = 4;
      const done = () => { if (--pending === 0) res(); };
      const fail = (e: Error) => { pending = -1; rej(e); };
      resources.load('config/units', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setUnits(a.json as UnitConfigData[]);
        done();
      });
      resources.load('config/skills', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setSkills(a.json as Record<string, never>);
        done();
      });
      resources.load('config/battle', JsonAsset, (e, a) => {
        if (e) { fail(e); return; }
        this.cfg.setBattle(a.json as BattleConfigData);
        done();
      });
      resources.load('config/waves', JsonAsset, (e, a) => {
        if (e) { fail(e); return; } this.waves = a.json as WaveConfig[]; done();
      });
    });
  }

  private cfgUnits(): UnitConfigData[] {
    return this.cfg.allUnits();
  }

  private unitMap(): Map<string, UnitConfigData> {
    const m = new Map<string, UnitConfigData>();
    for (const u of this.cfgUnits()) m.set(u.id, u);
    return m;
  }

  private buildBoard() {
    const bv = this.boardNode.getComponent(BoardView) ?? this.boardNode.addComponent(BoardView);
    this.boardNode.setPosition(0, 60, 0);
    bv.initialize(this.cfg.battle.boardWidth, this.cfg.battle.boardHeight, 48);
  }

  /** Old eight-column saves retain their units when the arena becomes seven columns. */
  private restoreFormation(): void {
    const { boardWidth, ownRows } = this.cfg.battle;
    const board = this.save.owned.filter(u => u.location === 'board');
    const valid = (u: { x: number; y: number }) => u.x >= 0 && u.x < boardWidth && u.y >= 0 && u.y < ownRows;
    const occupied = new Set(board.filter(valid).map(u => `${u.x},${u.y}`));
    for (const u of board.filter(u => !valid(u))) {
      const row = Math.max(0, Math.min(ownRows - 1, u.y));
      const preferred = { x: Math.max(0, Math.min(boardWidth - 1, u.x)), y: row };
      const candidates = [preferred];
      for (let y = 0; y < ownRows; y++) for (let x = 0; x < boardWidth; x++) candidates.push({ x, y });
      const target = candidates.find(c => !occupied.has(`${c.x},${c.y}`));
      if (target) { u.x = target.x; u.y = target.y; occupied.add(`${u.x},${u.y}`); }
    }
  }

  private createSim(battle: boolean) {
    const placements: Placement[] = [];
    this.battleIds.clear();
    for (const e of this.flow.wave.enemies) placements.push({ cfg:this.cfg.getUnit(e.unitId), side:1,
      x:e.x, y:e.y, star:e.star, statMultiplier:e.statMultiplier });

    // 己方：从 owned 数据生成（board 位置）
    for (const u of this.owned.onBoard().slice().sort((a, b) => a.uid - b.uid)) {
      const cfg = this.cfg.getUnit(u.unitId);
      this.battleIds.set(u.uid, placements.length + 1);
      placements.push({ cfg, side: 0, x: u.x, y: u.y, star: u.star });
    }

    this.sim = new BattleSim(this.cfg, placements, {
      seed: this.rng.int(0, 99999),
      w: this.cfg.battle.boardWidth,
      h: this.cfg.battle.boardHeight,
      maxTicks: this.cfg.battle.maxTicks,
    });
    if (battle) this.sim.start();
  }

  private createViews() {
    const bv = this.boardNode.getComponent(BoardView)!;
    const old = this.boardNode.getChildByName('units');
    if (old) { old.removeFromParent(); old.destroy(); }
    const root = new Node('units');
    const ut = root.addComponent(UITransform);
    ut.setContentSize(Math.max(bv.boardPixelW, this.save.benchSlots * 64), bv.boardPixelH + 180);
    this.boardNode.addChild(root);
    this.views.clear();
    this.ownedViews.clear();

    // 棋盘上的双方视图严格使用 sim id，回放事件不会与 owned uid 混用。
    for (const u of this.sim.units) {
      const uv = this.makeUnitView(root, u.cfg.id, u.side, u.id, bv.cellToWorld(u.x, u.y));
      this.views.set(u.id, uv);
      uv.setStar(u.star);
    }
    for (const ou of this.owned.onBoard()) {
      const uv = this.views.get(this.battleIds.get(ou.uid)!)!;
      this.ownedViews.set(ou.uid, uv);
    }
    // 备战席与棋盘共用持有数据，但备战棋子不进入战斗回放索引。
    for (let slot = 0; slot < this.save.benchSlots; slot++) {
      const node = new Node(`bench_${slot}`);
      node.addComponent(UITransform).setContentSize(62, 50);
      node.setPosition(this.benchSlotWorld(slot));
      root.addChild(node);
      const g = node.addComponent(Graphics);
      g.fillColor = new Color(16, 33, 39, 255);
      g.roundRect(-31, -25, 62, 50, 4); g.fill();
      g.strokeColor = new Color(142, 119, 72, 255);
      g.lineWidth = 1.5; g.roundRect(-31, -25, 62, 50, 4); g.stroke();
      g.fillColor = new Color(42, 64, 65, 255);
      g.rect(-21, -22, 42, 2); g.fill();
      setUISkin(node, 'bench_slot', g);
    }
    for (const ou of this.owned.inBench()) {
      const uv = this.makeUnitView(root, ou.unitId, 0, ou.uid, this.benchSlotWorld(ou.y));
      this.ownedViews.set(ou.uid, uv);
    }
    for (const ou of this.owned.all()) {
      const uv = this.ownedViews.get(ou.uid)!;
      uv.setStar(ou.star);
    }
  }

  private makeUnitView(root: Node, cfgId: string, side: 0 | 1, id: number, pos: Vec3): UnitView {
    const node = new Node(`unit_${side}_${id}`);
    node.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    root.addChild(node);
    const uv = node.addComponent(UnitView);
    const cfg = this.cfg.getUnit(cfgId);
    uv.setup(cfgId, side, id, this.cellSize, cfg.artId ?? cfgId, cfg.tint);
    node.setPosition(pos);
    return uv;
  }

  /** 每次改变布阵或切换阶段，模拟器、视图和事件游标一起重建。 */
  private resetBattle(battle: boolean): void {
    this.createSim(battle);
    this.createViews();
    this.ui.refreshFormation(this.owned.all(), this.cfgUnits());
    const bv = this.boardNode.getComponent(BoardView)!;
    this.replayer.bind(this.sim, this.views, this.cellSize, bv);
    const oldFx = this.boardNode.getChildByName('fx');
    if (oldFx) { oldFx.removeFromParent(); oldFx.destroy(); }
    const fx = new Node('fx');
    this.boardNode.addChild(fx);
    this.replayer.setFxRoot(fx);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
  }

  // ─── 拖拽布阵 ───

  private setupTouchEvents() {
    for (const [uid, uv] of this.ownedViews) {
      uv.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
      uv.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
      uv.node.on(Node.EventType.TOUCH_END, (event: EventTouch) => {
        if (this.flow.phase === 'battle') this.showOwnedDetail(uid);
        else this.onTouchEnd(event);
      });
      uv.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }
    for (const u of this.sim.units.filter(u => u.side === 1)) {
      this.views.get(u.id)!.node.on(Node.EventType.TOUCH_END, () => this.showDetail(u.cfg.id, u.star, u.cfg, u.skillScale));
    }
  }

  /** 触摸点 → boardNode 本地坐标 */
  private touchToBoard(event: EventTouch): Vec3 {
    const worldPos = event.getUILocation();
    const bvUt = this.boardNode.getComponent(UITransform) ?? this.boardNode.addComponent(UITransform);
    return bvUt.convertToNodeSpaceAR(new Vec3(worldPos.x, worldPos.y, 0));
  }

  private onTouchStart(event: EventTouch) {
    if (this.fighting || !this.loaded || this.flow.phase !== 'prepare' || this.draggingId) return;
    const boardPos = this.touchToBoard(event);

    // 用视图本地坐标检测己方棋盘和备战席棋子。
    let bestId = 0;
    let bestDist = Infinity;
    for (const [uid, uv] of this.ownedViews) {
      const c = uv.node.position;
      const d = (boardPos.x - c.x) ** 2 + (boardPos.y - c.y) ** 2;
      if (d < bestDist) { bestDist = d; bestId = uid; }
    }
    if (!bestId || bestDist > (this.cellSize * 0.6) ** 2) return;

    const uv = this.ownedViews.get(bestId);
    if (!uv) return;
    this.draggingId = bestId;
    this.dragging = uv;
    this.dragStart.set(boardPos.x, boardPos.y, 0); this.dragMoved = false;
    this.touchOffset.set(boardPos.x - uv.node.position.x, boardPos.y - uv.node.position.y, 0);
    uv.node.setScale(1.15, 1.15, 1);
  }

  private onTouchMove(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const boardPos = this.touchToBoard(event);
    if (Math.hypot(boardPos.x - this.dragStart.x, boardPos.y - this.dragStart.y) > 8) this.dragMoved = true;
    if (!this.dragMoved) return;
    this.dragging.node.setPosition(boardPos.x - this.touchOffset.x, boardPos.y - this.touchOffset.y, 0);
    const u = this.owned.get(this.draggingId)!;
    this.ui.showSellPreview(this.cfg.getUnit(u.unitId).name, sellPrice(this.pool.costOfUnit(u.unitId), u.star), this.overSell(event));
  }

  private onTouchEnd(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const uv = this.dragging;
    const bv = this.boardNode.getComponent(BoardView)!;
    uv.node.setScale(1, 1, 1);

    const curPos = uv.node.position;
    const cell = bv.worldToCell(curPos.x, curPos.y);

    const ou = this.owned.get(this.draggingId);
    if (!ou) { this.resetDrag(); return; }
    if (event.type !== Node.EventType.TOUCH_CANCEL && !this.dragMoved) {
      uv.node.setPosition(ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y));
      this.resetDrag(); this.showOwnedDetail(ou.uid); return;
    }
    if (event.type !== Node.EventType.TOUCH_CANCEL && this.overSell(event)) {
      this.shop.sell(ou.uid); this.resetDrag(); this.resetBattle(false); this.persistShopState();
      this.refreshShopUI(); this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys); return;
    }

    const benchSlot = this.benchSlotAt(curPos.x, curPos.y);
    if (event.type === Node.EventType.TOUCH_CANCEL || (benchSlot === null && (!cell || !bv.isOwnCell(cell.y)))) {
      // 回原位
      const orig = ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y);
      uv.node.setPosition(orig.x, orig.y, 0);
      this.resetDrag();
      return;
    }

    if (benchSlot !== null) {
      this.owned.move(ou.uid, { location: 'bench', x: -1, y: benchSlot });
      this.resetDrag();
      this.resetBattle(false);
      this.persistShopState();
      return;
    }

    // 上阵人数检查（board 目标格为空且当前上阵数已满 → 拒绝）
    const occupant = this.owned.atBoard(cell.x, cell.y);
    if (!occupant && ou.location === 'bench') {
      const cap = this.levelSys.unitCap;
      if (this.owned.onBoard().length >= cap) {
        // 超员：回原位 + 提示
        const orig = this.benchSlotWorld(ou.y);
        uv.node.setPosition(orig.x, orig.y, 0);
        this.ui.showWarn(`上阵人数已达上限 ${cap}`);
        this.resetDrag();
        return;
      }
    }

    // 数据层移动/交换（自动合并同名）
    this.owned.move(ou.uid, { location: 'board', x: cell.x, y: cell.y });
    const target = bv.cellToWorld(cell.x, cell.y);
    uv.node.setPosition(target.x, target.y, 0);
    // 若发生合并，uv 可能已失效——重建视图
    this.resetDrag();
    this.resetBattle(false);
    this.persistShopState();
  }

  /** 备战席槽位的世界坐标（棋盘下方一排） */
  private benchSlotWorld(slot: number): Vec3 {
    // Screen position is shared by rendering and hit testing, including perspective.
    const bv = this.boardNode.getComponent(BoardView)!;
    const y = -bv.boardPixelH / 2 - 53;
    const spacing = 68;
    const totalW = (this.save.benchSlots - 1) * spacing;
    const x = -totalW / 2 + slot * spacing;
    return new Vec3(x, y, 0);
  }

  private benchSlotAt(x: number, y: number): number | null {
    for (let slot = 0; slot < this.save.benchSlots; slot++) {
      const pos = this.benchSlotWorld(slot);
      if (Math.abs(x - pos.x) <= 31 && Math.abs(y - pos.y) <= 25) return slot;
    }
    return null;
  }

  private resetDrag() {
    if (this.dragging) this.dragging.node.setScale(1, 1, 1);
    this.draggingId = 0;
    this.dragging = null;
    this.ui?.clearSellPreview();
  }

  private overSell(event: EventTouch): boolean {
    const p = event.getUILocation();
    const local = this.ui.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    return this.ui.isInSellArea(local.x, local.y);
  }
  private showOwnedDetail(uid: number): void {
    const u = this.owned.get(uid); if (!u) return;
    const base = this.cfg.getUnit(u.unitId);
    this.showDetail(u.unitId, u.star, this.cfg.scaleUnit(base, u.star), this.cfg.battle.starScaling[u.star - 1].skill);
  }
  private showDetail(id: string, star: number, cfg: UnitConfigData, skillScale: number): void {
    const base = this.cfg.getUnit(id), skill = cfg.skillId ? this.cfg.getSkill(cfg.skillId) : null;
    this.ui.showUnitDetail(`${base.name}  ·  ${star} 星  ·  ${base.cost ?? 1} 费`,
      `生命 ${cfg.hp}    攻击 ${cfg.atk}\n护甲 ${cfg.armor}    魔抗 ${cfg.mr}\n攻速 ${cfg.atkSpeed}    射程 ${cfg.range}\n法力 ${cfg.startMana} / ${cfg.maxMana}\n\n${skill ? `${skill.name ?? cfg.skillId}  ·  伤害 ${Math.round(skill.power * skillScale)}\n${skill.description ?? ''}` : '无主动技能 · 普通攻击输出'}`);
  }
  private refreshRunUI(): void {
    this.ui.refreshRun(this.flow.health, this.cfg.battle.initialHealth, this.flow.waveIndex + 1, this.waves.length, this.flow.wave.name);
    this.ui.setLocked(this.shop.locked);
  }
  private showSettlement(): void {
    const s = this.flow.lastSettlement; if (!s) return;
    const r = this.save.lastReward;
    this.ui.showResult(s.winner, r?.breakdown ?? null, r?.expGained ?? 0, r?.levelUps ?? 0, this.levelSys.level, s);
  }



  private startFight() {
    if (this.fighting || !this.loaded || this.flow.phase !== 'prepare') return;
    if (this.owned.onBoard().length === 0) {
      this.ui.showWarn('请先将棋子拖到己方棋盘');
      return;
    }
    this.resetDrag();
    this.flow.startBattle();
    this.persistShopState();
    this.fighting = true;
    this.resultShown = false;
    this.ui.hideFightBtn();
    this.ui.setShopVisible(false);
    this.resetBattle(true);
  }

  private restart() {
    if (!this.resultShown || !['settlement', 'ended'].includes(this.flow.phase)) return;
    const ended = this.flow.phase === 'ended';
    this.ui.hideResult();
    this.fighting = false;
    this.resultShown = false;
    this.resetDrag();
    if (ended) {
      this.save = freshSaveV2(); this.flow.restart();
      this.economy = new EconomySystem(); this.levelSys = new LevelSystem();
      this.pool = new CardPool(this.cfgUnits()); this.owned = new OwnedUnits();
      for (const id of ['warrior', 'archer', 'mage']) {
        if (this.pool.take(id)) this.owned.addToBench(id, this.save.benchSlots);
      }
      this.shop = new ShopSystem(this.pool, this.owned, this.economy, this.unitMap(), this.rng, () => this.levelSys.level, this.save.benchSlots);
    } else { this.flow.nextWave(); this.shop.nextRound(); }
    this.save.floor = this.flow.waveIndex + 1; this.save.lastReward = undefined;
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.ui.setShopVisible(true);
    this.ui.showFightBtn();
    this.refreshRunUI();
  }

  // ─── 商店操作（战斗期间锁定） ───

  private buyFromShop(slot: number) {
    if (this.fighting || !this.loaded) return;
    const r = this.shop.buy(slot);
    if (r.error) {
      const msg = r.error === 'not_enough_gold' ? '金币不足'
        : r.error === 'bench_full' ? '备战席已满'
        : r.error === 'pool_empty' ? '卡池已空'
        : '无法购买';
      this.ui.showWarn(msg);
      return;
    }
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
  }

  private refreshShop() {
    if (this.fighting || !this.loaded) return;
    const err = this.shop.refresh();
    if (err) {
      this.ui.showWarn(err === 'not_enough_gold' ? '金币不足' : '刷新失败');
      return;
    }
    this.persistShopState();
    this.refreshShopUI();
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
  }

  private buyExperience(): void {
    if (this.fighting || !this.loaded) return;
    if (this.levelSys.level >= MAX_LEVEL) { this.ui.showWarn('已达最高等级'); return; }
    if (!this.economy.spend(EXP_PURCHASE.gold)) { this.ui.showWarn('金币不足'); return; }
    this.levelSys.addExp(EXP_PURCHASE.exp);
    this.persistShopState();
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
  }

  private persistShopState() {
    this.save.shop = this.shop.snapshot();
    this.save.shopReserved = true;
    this.save.owned = this.owned.snapshot();
    this.save.pool = this.pool.snapshot();
    this.save.gold = this.economy.gold;
    this.save.level = this.levelSys.level;
    this.save.exp = this.levelSys.exp;
    this.save.round = this.flow.snapshot(); this.save.shopLocked = this.shop.locked;
    writeSaveV2(this.save);
  }

  private refreshShopUI() {
    const slots = this.shop.slots.map(s => {
      if (!s.unitId) return { unitId: null, name: '', cost: 0, price: 0, poolLeft: 0 };
      const cfg = this.unitMap().get(s.unitId)!;
      const cost = (cfg.cost ?? 1) as Cost;
      return {
        unitId: s.unitId,
        name: cfg.name,
        cost, price: COST_PRICE[cost],
        poolLeft: this.pool.count(s.unitId),
        artId:cfg.artId, role:cfg.role, tint:cfg.tint,
      };
    });
    this.ui.refreshShop(slots);
  }

  /** 一场战斗只结算一次（由 resultShown 保证）。 */
  private settleBattleEnd() {
    const round = this.flow.settle(this.sim.winner, this.sim.units.filter(u => u.side === 1 && u.alive).length);
    if (!round) return;
    const breakdown = this.economy.settleBattle(this.save.floor, { winner: this.sim.winner });
    const ups = this.levelSys.addExp(EXP_PER_BATTLE);
    this.save.gold = this.economy.gold;
    this.save.level = this.levelSys.level;
    this.save.exp = this.levelSys.exp;
    this.save.winStreak = this.economy.winStreak;
    this.save.loseStreak = this.economy.loseStreak;
    this.save.lastReward = { breakdown, expGained:EXP_PER_BATTLE, levelUps:ups.length };
    this.ui.showResult(
      this.sim.winner,
      breakdown,
      EXP_PER_BATTLE,
      ups.length,
      this.levelSys.level,
      round,
    );
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.persistShopState();
    this.refreshRunUI();
  }

  update(dt: number) {
    if (!this.loaded || !this.sim) return;
    if (this.fighting && !this.sim.finished) {
      this.driver.advance(dt * this.speed);
      this.replayer.consumeEvents();
      this.replayer.syncViews(dt);
    } else if (this.sim.finished && !this.resultShown) {
      this.resultShown = true;
      this.replayer.consumeEvents();
      this.settleBattleEnd();
    }
  }
}
