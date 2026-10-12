import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, Color, Sprite } from 'cc';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { BattleSim, Placement } from '../battle/BattleSim';
import { TickDriver } from '../core/TickDriver';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { BattleReplayer } from './BattleReplayer';
import { BattleUI } from '../ui/BattleUI';

const { ccclass, property } = _decorator;

/**
 * 战斗舞台：组装 BoardView + UnitView + BattleSim + TickDriver + BattleUI。
 * - 准备阶段：可以拖拽己方棋子调整站位（空格移动、有棋子则交换、无效格返回原位）。
 * - 战斗阶段：禁止拖拽，TickDriver 驱动自动战斗。
 * - 战斗结束后返回准备阶段，重新允许调整。
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
  private cellSize = 64;
  private loaded = false;
  private fighting = false;
  private ui: BattleUI;
  private speed = 1;

  // 拖拽状态
  private dragging: UnitView | null = null;
  private dragOriginalPos: Vec3 = new Vec3();
  private touchOffset: Vec3 = new Vec3();

  async start() {
    await this.loadConfigs();
    this.buildBoard();
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
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
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

  private buildBoard() {
    const bv = this.boardNode.getComponent(BoardView) ?? this.boardNode.addComponent(BoardView);
    bv.hexSize = 36;
    bv.boardWidth = this.cfg.battle.boardWidth;
    bv.boardHeight = this.cfg.battle.boardHeight;
  }

  private createSim(battle: boolean) {
    const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
      ({ cfg: this.cfg.getUnit(cfgId), side, x, y });
    const placements: Placement[] = [
      P('warrior', 0, 2, 2),
      P('archer', 0, 4, 1),
      P('mage', 0, 6, 0),
      P('warrior', 1, 2, 3),
      P('archer', 1, 4, 4),
      P('mage', 1, 6, 5),
    ];
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
    // 关键：units 根节点必须有 UITransform + 足够大的 contentSize，
    // 否则 Cocos 触摸事件系统在 _sortPointerEventProcessorList 时读不到 cameraPriority 崩溃
    const ut = root.addComponent(UITransform);
    ut.setContentSize(
      this.cfg.battle.boardWidth * this.cellSize * 1.5,
      this.cfg.battle.boardHeight * this.cellSize,
    );
    this.boardNode.addChild(root);
    this.views.clear();
    for (const u of this.sim.units) {
      const node = new Node(`unit_${u.id}`);
      // 每个 unit 节点也需要 UITransform，否则触摸命中区域为 0
      const utt = node.addComponent(UITransform);
      utt.setContentSize(this.cellSize, this.cellSize);
      const uv = node.addComponent(UnitView);
      uv.setup(u.cfg.id, u.side, u.id, this.cellSize);
      const p = bv.cellToWorld(u.x, u.y);
      node.setPosition(p.x, p.y, 0);
      root.addChild(node);
      this.views.set(u.id, uv);
    }
  }

  // ─── 拖拽布阵 ───

  private setupTouchEvents() {
    const unitsRoot = this.boardNode.getChildByName('units');
    if (!unitsRoot) return;
    // 先 off 再 on，防止 restart 后重复注册
    unitsRoot.off(Node.EventType.TOUCH_START);
    unitsRoot.off(Node.EventType.TOUCH_MOVE);
    unitsRoot.off(Node.EventType.TOUCH_END);
    unitsRoot.off(Node.EventType.TOUCH_CANCEL);
    unitsRoot.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    unitsRoot.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    unitsRoot.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    unitsRoot.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this);
  }

  private onTouchStart(event: EventTouch) {
    if (this.fighting || !this.loaded) return;
    const unitsRoot = this.boardNode.getChildByName('units');
    if (!unitsRoot) return;
    const worldPos = event.getUILocation();
    // 直接用 boardNode 的 UITransform 做坐标转换（它一定有 UITransform）
    const boardUT = this.boardNode.getComponent(UITransform) ?? this.boardNode.addComponent(UITransform);
    const local = boardUT.convertToNodeSpaceAR(new Vec3(worldPos.x, worldPos.y, 0));

    // 查找点击的己方棋子
    for (const [id, uv] of this.views) {
      const u = this.sim.units.find(uu => uu.id === id);
      if (!u || !u.alive || u.side !== 0) continue;
      const unitPos = uv.node.position;
      const dx = local.x - unitPos.x;
      const dy = local.y - unitPos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < (this.cellSize * 0.5) ** 2) {
        this.dragging = uv;
        this.dragOriginalPos.set(uv.node.position.x, uv.node.position.y, 0);
        this.touchOffset.set(dx, dy, 0);
        uv.node.setScale(1.15, 1.15, 1);
        return;
      }
    }
  }

  private onTouchMove(event: EventTouch) {
    if (!this.dragging) return;
    const worldPos = event.getUILocation();
    const boardUT = this.boardNode.getComponent(UITransform) ?? this.boardNode.addComponent(UITransform);
    const local = boardUT.convertToNodeSpaceAR(new Vec3(worldPos.x, worldPos.y, 0));
    this.dragging.node.setPosition(local.x - this.touchOffset.x, local.y - this.touchOffset.y, 0);
  }

  private onTouchEnd(event: EventTouch) {
    if (!this.dragging) return;
    const uv = this.dragging;
    const bv = this.boardNode.getComponent(BoardView)!;
    uv.node.setScale(1, 1, 1);

    const curPos = uv.node.position.clone();
    const cell = bv.worldToCell(curPos.x, curPos.y);

    if (!cell || !bv.isOwnCell(cell.y)) {
      uv.node.setPosition(this.dragOriginalPos.x, this.dragOriginalPos.y, 0);
      this.dragging = null;
      return;
    }

    const dragUnit = this.sim.units.find(u => u.id === uv.unitId);
    if (!dragUnit) {
      uv.node.setPosition(this.dragOriginalPos.x, this.dragOriginalPos.y, 0);
      this.dragging = null;
      return;
    }

    const occupant = this.sim.units.find(u => u.alive && u.id !== dragUnit.id && u.x === cell.x && u.y === cell.y);
    if (occupant) {
      const occUv = this.views.get(occupant.id);
      const oldX = dragUnit.x, oldY = dragUnit.y;
      dragUnit.x = cell.x;
      dragUnit.y = cell.y;
      occupant.x = oldX;
      occupant.y = oldY;
      if (occUv) {
        const targetPos = bv.cellToWorld(oldX, oldY);
        occUv.node.setPosition(targetPos.x, targetPos.y, 0);
      }
      const targetPos = bv.cellToWorld(cell.x, cell.y);
      uv.node.setPosition(targetPos.x, targetPos.y, 0);
    } else if (cell.x === dragUnit.x && cell.y === dragUnit.y) {
      uv.node.setPosition(this.dragOriginalPos.x, this.dragOriginalPos.y, 0);
    } else {
      dragUnit.x = cell.x;
      dragUnit.y = cell.y;
      const targetPos = bv.cellToWorld(cell.x, cell.y);
      uv.node.setPosition(targetPos.x, targetPos.y, 0);
    }

    this.dragging = null;
  }

  private startFight() {
    if (this.fighting || !this.loaded) return;
    this.fighting = true;
    this.ui.hideFightBtn();
    this.sim.start();
  }

  private restart() {
    this.ui.hideResult();
    this.fighting = false;
    this.resultShown = false;
    this.createSim(false);
    this.createViews();
    const bv = this.boardNode.getComponent(BoardView)!;
    this.replayer.bind(this.sim, this.views, this.cellSize, bv);
    const fxRoot = new Node('fx');
    this.boardNode.addChild(fxRoot);
    this.replayer.setFxRoot(fxRoot);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.setupTouchEvents();
    this.ui.showFightBtn();
  }

  private resultShown = false;

  update(dt: number) {
    if (!this.loaded || !this.sim) return;
    if (this.fighting && !this.sim.finished) {
      this.driver.advance(dt * this.speed);
      this.replayer.consumeEvents();
      this.replayer.syncViews(dt);
    } else if (this.sim.finished && !this.resultShown) {
      this.resultShown = true;
      this.replayer.consumeEvents();
      this.ui.showResult(this.sim.winner);
    }
  }
}
