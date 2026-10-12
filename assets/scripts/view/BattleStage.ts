import { _decorator, Component, Node, resources, JsonAsset, Vec3, UITransform, EventTouch, Color } from 'cc';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { BattleSim, Placement } from '../battle/BattleSim';
import { TickDriver } from '../core/TickDriver';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { BattleReplayer } from './BattleReplayer';
import { BattleUI } from '../ui/BattleUI';
import { EconomySystem } from '../core/EconomySystem';
import { LevelSystem, EXP_PER_BATTLE } from '../core/LevelSystem';
import { SaveData, loadSave, writeSave, freshSave } from '../core/SaveData';

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
  private save: SaveData;  private resultShown = false;

  // 拖拽状态
  private draggingId = 0;          // 被拖拽的 unit id（0 = 无）
  private dragging: UnitView | null = null;
  private dragOrigPos: Vec3 = new Vec3();
  private touchOffset: Vec3 = new Vec3();

  async start() {
    this.save = loadSave() ?? freshSave();
    this.economy = new EconomySystem(undefined, {
      gold: this.save.gold,
      winStreak: this.save.winStreak,
      loseStreak: this.save.loseStreak,
    });
    this.levelSys = new LevelSystem({ level: this.save.level, exp: this.save.exp });
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
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
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
    const ut = root.addComponent(UITransform);
    ut.setContentSize(bv.boardPixelW || 600, bv.boardPixelH || 400);
    this.boardNode.addChild(root);
    this.views.clear();
    for (const u of this.sim.units) {
      const node = new Node(`unit_${u.id}`);
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

    const dragUnit = this.sim.units.find(u => u.id === this.draggingId);
    if (!dragUnit) { this.resetDrag(); return; }

    if (!cell || !bv.isOwnCell(cell.y)) {
      // 无效目标：回原位
      uv.node.setPosition(this.dragOrigPos.x, this.dragOrigPos.y, 0);
      this.resetDrag();
      return;
    }

    const occupant = this.sim.units.find(u => u.alive && u.id !== dragUnit.id && u.x === cell.x && u.y === cell.y);
    if (occupant) {
      // 交换
      const occUv = this.views.get(occupant.id);
      const oldX = dragUnit.x, oldY = dragUnit.y;
      dragUnit.x = cell.x; dragUnit.y = cell.y;
      occupant.x = oldX; occupant.y = oldY;
      if (occUv) {
        const target = bv.cellToWorld(oldX, oldY);
        occUv.node.setPosition(target.x, target.y, 0);
      }
      const target = bv.cellToWorld(cell.x, cell.y);
      uv.node.setPosition(target.x, target.y, 0);
    } else if (cell.x === dragUnit.x && cell.y === dragUnit.y) {
      uv.node.setPosition(this.dragOrigPos.x, this.dragOrigPos.y, 0);
    } else {
      // 移动到空格
      dragUnit.x = cell.x;
      dragUnit.y = cell.y;
      const target = bv.cellToWorld(cell.x, cell.y);
      uv.node.setPosition(target.x, target.y, 0);
    }
    this.resetDrag();
  }

  private resetDrag() {
    this.draggingId = 0;
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
    this.resetDrag();
    this.save.floor++;
    writeSave(this.save);
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

  /** 战斗结束结算：连胜/连败 → 金币 → 经验 → 存档 → UI。一场战斗只走一次（由 resultShown 保证）。 */
  private settleBattleEnd() {
    const breakdown = this.economy.settleBattle(this.save.floor, { winner: this.sim.winner });
    const ups = this.levelSys.addExp(EXP_PER_BATTLE);
    this.save.gold = this.economy.gold;
    this.save.level = this.levelSys.level;
    this.save.exp = this.levelSys.exp;
    this.save.winStreak = this.economy.winStreak;
    this.save.loseStreak = this.economy.loseStreak;
    writeSave(this.save);
    this.ui.showResult(
      this.sim.winner,
      breakdown,
      EXP_PER_BATTLE,
      ups.length,
      this.levelSys.level,
    );
    this.ui.refreshTop(this.economy.gold, this.save.floor, this.levelSys);
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
