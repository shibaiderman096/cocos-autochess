import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, Color, Graphics, Label } from 'cc';
import { ConfigManager } from '../core/ConfigManager';
import { BattleSim, Placement } from '../battle/BattleSim';
import { TickDriver } from '../core/TickDriver';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { BattleReplayer } from './BattleReplayer';
import { BattleUI } from '../ui/BattleUI';
import { EconomySystem } from '../core/EconomySystem';
import { LevelSystem, EXP_PER_BATTLE } from '../core/LevelSystem';
import { Rng } from '../core/Rng';
import { CardPool } from '../core/CardPool';
import { OwnedUnits } from '../core/OwnedUnits';
import { ShopSystem } from '../core/ShopSystem';
import { loadSaveV2, writeSaveV2, freshSaveV2, SaveDataV2 } from '../core/ShopSave';
import { COST_PRICE, Cost } from '../core/ShopConfig';
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
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.setShopVisible(true);
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.loaded = true;
  }

  private loadConfigs(): Promise<void> {
    return new Promise((res, rej) => {
      let pending = 2;
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
    });
  }

  private cfgUnits(): UnitConfigData[] {
    // 从 ConfigManager 拿所有 unit（借助内部 map 需要暴露，这里用 tryGet 遍历已知 id）
    return ['warrior', 'archer', 'mage']
      .map(id => { try { return this.cfg.getUnit(id); } catch { return null; } })
      .filter((u): u is UnitConfigData => u !== null);
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
    // 敌方固定阵容（按层数增强留 M2-8；当前固定）
    const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
      ({ cfg: this.cfg.getUnit(cfgId), side, x, y });
    const front = this.cfg.battle.ownRows;
    placements.push(P('warrior', 1, 2, front));
    placements.push(P('archer', 1, 4, front + 2));
    placements.push(P('mage', 1, 6, front + 3));

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
    }
    for (const ou of this.owned.inBench()) {
      const uv = this.makeUnitView(root, ou.unitId, 0, ou.uid, this.benchSlotWorld(ou.y));
      this.ownedViews.set(ou.uid, uv);
    }
    for (const ou of this.owned.all()) {
      const uv = this.ownedViews.get(ou.uid)!;
      const stars = new Node('stars');
      stars.addComponent(UITransform).setContentSize(56, 18);
      const label = stars.addComponent(Label);
      label.string = '★'.repeat(ou.star);
      label.fontSize = 14; label.lineHeight = 18;
      label.color = new Color(255, 215, 0, 255);
      stars.setPosition(0, -21, 0);
      uv.node.addChild(stars);
    }
  }

  private makeUnitView(root: Node, cfgId: string, side: 0 | 1, id: number, pos: Vec3): UnitView {
    const node = new Node(`unit_${side}_${id}`);
    node.addComponent(UITransform).setContentSize(this.cellSize, this.cellSize);
    root.addChild(node);
    const uv = node.addComponent(UnitView);
    uv.setup(cfgId, side, id, this.cellSize);
    node.setPosition(pos);
    return uv;
  }

  /** 每次改变布阵或切换阶段，模拟器、视图和事件游标一起重建。 */
  private resetBattle(battle: boolean): void {
    this.createSim(battle);
    this.createViews();
    this.ui.refreshFormation(this.owned.all());
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
    for (const uv of this.ownedViews.values()) {
      uv.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
      uv.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
      uv.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
      uv.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    }
  }

  /** 触摸点 → boardNode 本地坐标 */
  private touchToBoard(event: EventTouch): Vec3 {
    const worldPos = event.getUILocation();
    const bvUt = this.boardNode.getComponent(UITransform) ?? this.boardNode.addComponent(UITransform);
    return bvUt.convertToNodeSpaceAR(new Vec3(worldPos.x, worldPos.y, 0));
  }

  private onTouchStart(event: EventTouch) {
    if (this.fighting || !this.loaded || this.draggingId) return;
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
    this.touchOffset.set(boardPos.x - uv.node.position.x, boardPos.y - uv.node.position.y, 0);
    uv.node.setScale(1.15, 1.15, 1);
  }

  private onTouchMove(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const boardPos = this.touchToBoard(event);
    this.dragging.node.setPosition(boardPos.x - this.touchOffset.x, boardPos.y - this.touchOffset.y, 0);
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
    this.draggingId = 0;
    this.dragging = null;
  }



  private startFight() {
    if (this.fighting || !this.loaded) return;
    if (this.owned.onBoard().length === 0) {
      this.ui.showWarn('请先将棋子拖到己方棋盘');
      return;
    }
    this.resetDrag();
    this.persistShopState();
    this.fighting = true;
    this.resultShown = false;
    this.ui.hideFightBtn();
    this.ui.setShopVisible(false);
    this.resetBattle(true);
  }

  private restart() {
    if (!this.sim.finished || !this.resultShown) return;
    this.ui.hideResult();
    this.fighting = false;
    this.resultShown = false;
    this.resetDrag();
    this.save.floor++;
    this.shop.nextRound();
    this.resetBattle(false);
    this.persistShopState();
    this.refreshShopUI();
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.ui.setShopVisible(true);
    this.ui.showFightBtn();
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

  private persistShopState() {
    this.save.shop = this.shop.snapshot();
    this.save.shopReserved = true;
    this.save.owned = this.owned.snapshot();
    this.save.pool = this.pool.snapshot();
    this.save.gold = this.economy.gold;
    this.save.level = this.levelSys.level;
    this.save.exp = this.levelSys.exp;
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
      };
    });
    this.ui.refreshShop(slots);
  }

  /** 一场战斗只结算一次（由 resultShown 保证）。 */
  private settleBattleEnd() {
    const breakdown = this.economy.settleBattle(this.save.floor, { winner: this.sim.winner });
    const ups = this.levelSys.addExp(EXP_PER_BATTLE);
    this.save.gold = this.economy.gold;
    this.save.level = this.levelSys.level;
    this.save.exp = this.levelSys.exp;
    this.save.winStreak = this.economy.winStreak;
    this.save.loseStreak = this.economy.loseStreak;
    writeSaveV2(this.save);
    this.ui.showResult(
      this.sim.winner,
      breakdown,
      EXP_PER_BATTLE,
      ups.length,
      this.levelSys.level,
    );
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
    this.persistShopState();
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
