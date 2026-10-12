import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, Color } from 'cc';
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
import { OwnedUnits, OwnedUnit } from '../core/OwnedUnits';
import { ShopSystem } from '../core/ShopSystem';
import { loadSaveV2, writeSaveV2, freshSaveV2, SaveDataV2 } from '../core/ShopSave';
import { REFRESH_COST } from '../core/ShopSystem';
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
  private cellSize = 52;   // hexSize 的视觉直径参考（棋子贴图尺寸）
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
  /** 商店是否已初始化（防止 start 重复） */
  private shopReady = false;  private resultShown = false;

  // 拖拽状态
  private draggingId = 0;          // 被拖拽的 unit id（0 = 无）
  private dragging: UnitView | null = null;
  private dragOrigPos: Vec3 = new Vec3();
  private touchOffset: Vec3 = new Vec3();

  async start() {
    this.save = loadSaveV2() ?? freshSaveV2();
    this.economy = new EconomySystem(undefined, {
      gold: this.save.gold,
      winStreak: this.save.winStreak,
      loseStreak: this.save.loseStreak,
    });
    this.levelSys = new LevelSystem({ level: this.save.level, exp: this.save.exp });
    await this.loadConfigs();
    this.rng = new Rng(Date.now() % 2147483647);
    this.pool = new CardPool(this.cfgUnits(), this.save.pool);
    this.owned = new OwnedUnits(this.save.owned);
    this.shop = new ShopSystem(
      this.pool, this.owned, this.economy,
      this.unitMap(), this.rng,
      () => this.levelSys.level,
      this.save.benchSlots,
      this.save.shop.length === 5 ? this.save.shop : undefined,
    );
    this.shopReady = true;
    // 首次游戏：给 3 个初始棋子进备战席
    if (this.owned.all().length === 0) {
      for (const id of ['warrior', 'archer', 'mage']) {
        this.owned.addToBench(id, this.save.benchSlots, -1, 1);
        this.pool.take(id); // 初始棋子从卡池扣
      }
    }    this.buildBoard();
    this.createSim(false);
    this.createViews();
    const bv = this.boardNode.getComponent(BoardView)!;
    this.replayer = this.node.addComponent(BattleReplayer);
    this.replayer.bind(this.sim, this.views, this.cellSize, bv);
    const fxRoot = new Node('fx');
    this.boardNode.addChild(fxRoot);
    this.replayer.setFxRoot(fxRoot);
    const uiNode = new Node('battleUI');
    this.node.parent?.addChild(uiNode);
    this.ui = uiNode.addComponent(BattleUI);
    this.ui.init();
    this.ui.onFight = () => this.startFight();
    this.ui.onSpeed = (s) => { this.speed = s; };
    this.ui.onRestart = () => this.restart();
    this.ui.onBuy = (slot) => this.buyFromShop(slot);
    this.ui.onRefresh = () => this.refreshShop();
    this.ui.updateTop(this.economy.gold, this.save.floor, this.levelSys);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
    this.refreshShopUI();
    this.ui.updateTop(this.economy.gold, this.save.floor, this.levelSys);
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
    bv.hexSize = 36;
    bv.boardWidth = this.cfg.battle.boardWidth;
    bv.boardHeight = this.cfg.battle.boardHeight;
  }

  private createSim(battle: boolean) {
    const placements: Placement[] = [];
    // 敌方固定阵容（按层数增强留 M2-8；当前固定）
    const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
      ({ cfg: this.cfg.getUnit(cfgId), side, x, y });
    placements.push(P('warrior', 1, 2, 3));
    placements.push(P('archer', 1, 4, 4));
    placements.push(P('mage', 1, 6, 5));

    // 己方：从 owned 数据生成（board 位置）
    for (const u of this.owned.onBoard()) {
      const cfg = this.cfg.getUnit(u.unitId);
      placements.push({ cfg, side: 0, x: u.x, y: u.y, star: u.star });
    }
    // 兜底：玩家没有任何棋子时，给 1 个战士防崩
    if (this.owned.onBoard().length === 0) {
      const cfg = this.cfg.getUnit('warrior');
      placements.push({ cfg, side: 0, x: 3, y: 2, star: 1 });
    }

    this.sim = new BattleSim(this.cfg, placements, {
      seed: Math.floor(Math.random() * 100000),
      w: this.cfg.battle.boardWidth,
      h: this.cfg.battle.boardHeight,
      maxTicks: this.cfg.battle.maxTicks,
    });
    if (battle) this.sim.start();
  }

  private createViews() {
    const bv = this.boardNode.getComponent(BoardView)!;
    const old = this.boardNode.getChildByName('units');
    if (old) old.destroy();
    const root = new Node('units');
    const ut = root.addComponent(UITransform);
    ut.setContentSize(bv.boardPixelW || 600, bv.boardPixelH || 400);
    this.boardNode.addChild(root);
    this.views.clear();

    // 棋盘上的己方 + 敌方
    for (const u of this.sim.units) {
      if (u.side === 1) {
        // 敌方视图
        const node = new Node(`unit_${u.id}`);
        const utt = node.addComponent(UITransform);
        utt.setContentSize(this.cellSize, this.cellSize);
        const uv = node.addComponent(UnitView);
        uv.setup(u.cfg.id, 1, u.id, this.cellSize);
        const p = bv.cellToWorld(u.x, u.y);
        node.setPosition(p.x, p.y, 0);
        root.addChild(node);
        this.views.set(u.id, uv);
      }
    }
    // 己方棋盘单位（owned 数据）
    for (const ou of this.owned.onBoard()) {
      const node = new Node(`unit_${ou.uid}`);
      const utt = node.addComponent(UITransform);
      utt.setContentSize(this.cellSize, this.cellSize);
      const uv = node.addComponent(UnitView);
      uv.setup(ou.unitId, 0, ou.uid, this.cellSize);
      const p = bv.cellToWorld(ou.x, ou.y);
      node.setPosition(p.x, p.y, 0);
      root.addChild(node);
      this.views.set(ou.uid, uv);
    }
  }

  // ─── 拖拽布阵 ───

  private setupTouchEvents() {
    const unitsRoot = this.boardNode.getChildByName('units');
    if (!unitsRoot) return;
    unitsRoot.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    unitsRoot.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    unitsRoot.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    unitsRoot.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
    unitsRoot.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    unitsRoot.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    unitsRoot.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    unitsRoot.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
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

    // 用「像素距离到棋子所在格子中心」判断命中（与渲染完全一致）
    let bestId = 0;
    let bestDist = Infinity;
    for (const u of this.sim.units) {
      if (!u.alive || u.side !== 0) continue;
      const c = this.boardNode.getComponent(BoardView)!.cellToWorld(u.x, u.y);
      const d = (boardPos.x - c.x) ** 2 + (boardPos.y - c.y) ** 2;
      if (d < bestDist) { bestDist = d; bestId = u.id; }
    }
    if (!bestId || bestDist > (this.cellSize * 0.6) ** 2) return;

    const uv = this.views.get(bestId);
    if (!uv) return;
    this.draggingId = bestId;
    this.dragging = uv;
    this.dragOrigPos.set(uv.node.position.x, uv.node.position.y, 0);
    this.touchOffset.set(boardPos.x - uv.node.position.x, boardPos.y - uv.node.position.y, 0);
    uv.node.setScale(1.15, 1.15, 1);
  }

  private onTouchMove(event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const boardPos = this.touchToBoard(event);
    this.dragging.node.setPosition(boardPos.x - this.touchOffset.x, boardPos.y - this.touchOffset.y, 0);
  }

  private onTouchEnd(_event: EventTouch) {
    if (!this.draggingId || !this.dragging) return;
    const uv = this.dragging;
    const bv = this.boardNode.getComponent(BoardView)!;
    uv.node.setScale(1, 1, 1);

    const curPos = uv.node.position;
    const cell = bv.worldToCell(curPos.x, curPos.y);

    const ou = this.owned.get(this.draggingId);
    if (!ou) { this.resetDrag(); return; }

    if (!cell || !bv.isOwnCell(cell.y)) {
      // 回原位
      const orig = ou.location === 'board' ? bv.cellToWorld(ou.x, ou.y) : this.benchSlotWorld(ou.y);
      uv.node.setPosition(orig.x, orig.y, 0);
      this.resetDrag();
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
        console.warn(`[BattleStage] 上阵人数已达上限 ${cap}，无法再上棋子`);
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
    this.createViews();
    this.resetDrag();
  }

  /** 备战席槽位的世界坐标（棋盘下方一排） */
  private benchSlotWorld(slot: number): Vec3 {
    // 棋盘本地坐标下，棋盘下边缘往下 80px，槽位横向排列
    const bv = this.boardNode.getComponent(BoardView)!;
    const w = bv.boardPixelW;
    const y = -bv.boardPixelH / 2 - 60;
    const spacing = 64;
    const totalW = (this.save.benchSlots - 1) * spacing;
    const x = -totalW / 2 + slot * spacing;
    return new Vec3(x, y, 0);
    void bv; void w;
  }

  private resetDrag() {
    this.draggingId = 0;
    this.dragging = null;
  }



  private startFight() {
    if (this.fighting || !this.loaded) return;
    // 上阵前把备战席棋子自动留在备战席（玩家手动拖上阵）；战斗时只上 board 单位
    this.shop.returnUnbought(); // 返还未购买商店棋子（关闭商店效果）
    this.persistShopState();
    this.fighting = true;
    this.ui.hideFightBtn();
    this.ui.setShopVisible(false);
    this.createSim(true); // 用最新 owned 数据重建 sim
    this.sim.start();
  }

  private restart() {
    this.ui.hideResult();
    this.fighting = false;
    this.resultShown = false;
    this.resetDrag();
    this.save.floor++;
    writeSaveV2(this.save);
    this.createSim(false);
    this.createViews();
    const bv = this.boardNode.getComponent(BoardView)!;
    this.replayer.bind(this.sim, this.views, this.cellSize, bv);
    const fxRoot = this.boardNode.getChildByName('fx');
    if (fxRoot) fxRoot.destroy();
    const newFx = new Node('fx');
    this.boardNode.addChild(newFx);
    this.replayer.setFxRoot(newFx);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
    this.ui.showFightBtn();
  }

  // ─── 商店操作（战斗期间锁定） ───

  private buyFromShop(slot: number) {
    if (this.fighting) return;
    const r = this.shop.buy(slot);
    if (r.error) {
      const msg = r.error === 'not_enough_gold' ? '金币不足'
        : r.error === 'bench_full' ? '备战席已满'
        : r.error === 'pool_empty' ? '卡池已空'
        : '无法购买';
      this.ui.showWarn(msg);
      return;
    }
    this.persistShopState();
    this.refreshShopUI();
    this.ui.updateTop(this.economy.gold, this.save.floor, this.levelSys);
  }

  private refreshShop() {
    if (this.fighting) return;
    const err = this.shop.refresh();
    if (err) {
      this.ui.showWarn(err === 'not_enough_gold' ? '金币不足' : '刷新失败');
      return;
    }
    this.persistShopState();
    this.refreshShopUI();
    this.ui.updateTop(this.economy.gold, this.save.floor, this.levelSys);
  }

  private persistShopState() {
    this.save.shop = this.shop.snapshot();
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

  /** 战斗结束结算', @'：连胜/连败 → 金币 → 经验 → 存档 → UI。一场战斗只走一次（由 resultShown 保证）。 */
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
    this.ui.updateTop(this.economy.gold, this.save.floor, this.levelSys);
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
