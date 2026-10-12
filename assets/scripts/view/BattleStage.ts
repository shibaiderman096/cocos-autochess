import { _decorator, Component, Node, resources, JsonAsset } from 'cc';
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
 * - M1 流程：进入即布阵（棋子就位）→ 点「开战」→ 自动战斗 → 胜负弹窗 → 再来一场。
 * - 倍速由 UI 循环 1x/2x/3x，TickDriver 按倍速推进固定 tick。
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

  async start() {
    await this.loadConfigs();
    this.buildBoard();
    this.createSim(false); // 先只建视图不推进
    this.createViews();
    this.replayer = this.node.addComponent(BattleReplayer);
    this.replayer.bind(this.sim, this.views, this.cellSize);

    const uiNode = new Node('battleUI');
    this.node.parent?.addChild(uiNode);
    this.ui = uiNode.addComponent(BattleUI);
    this.ui.init();
    this.ui.onFight = () => this.startFight();
    this.ui.onSpeed = (s) => { this.speed = s; };
    this.ui.onRestart = () => this.restart();

    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
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
    bv.cellSize = this.cellSize;
    bv.boardWidth = this.cfg.battle.boardWidth;
    bv.boardHeight = this.cfg.battle.boardHeight;
  }

  /** battle=false: 只建 sim 不 start（布阵态）；battle=true: 建好直接进入战斗 */
  private createSim(battle: boolean) {
    const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
      ({ cfg: this.cfg.getUnit(cfgId), side, x, y });
    const placements: Placement[] = [
      P('warrior', 0, 3, 3),
      P('archer', 0, 4, 1),
      P('mage', 0, 2, 0),
      P('warrior', 1, 3, 6),
      P('archer', 1, 4, 4),
      P('mage', 1, 2, 7),
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
    const bv = this.boardNode.getComponent(BoardView);
    const old = this.boardNode.getChildByName('units');
    if (old) old.destroy();
    const root = new Node('units');
    this.boardNode.addChild(root);
    this.views.clear();
    for (const u of this.sim.units) {
      const node = new Node(`unit_${u.id}`);
      const uv = node.addComponent(UnitView);
      uv.setup(u.cfg.id, u.side, u.id, this.cellSize);
      const p = bv.cellToWorld(u.x, u.y);
      node.setPosition(p.x, p.y, 0);
      root.addChild(node);
      this.views.set(u.id, uv);
    }
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
    this.createSim(false);
    this.createViews();
    this.replayer.bind(this.sim, this.views, this.cellSize);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
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
