import { _decorator, Component, Node, resources, JsonAsset, Label, Color } from 'cc';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import { BattleSim, Placement } from '../battle/BattleSim';
import { TickDriver } from '../core/TickDriver';
import { BoardView } from './BoardView';
import { UnitView } from './UnitView';
import { BattleReplayer } from './BattleReplayer';

const { ccclass, property } = _decorator;

/**
 * 战斗舞台：组装 BoardView + UnitView + BattleSim + TickDriver。
 * - 使用方法：空场景里放一个 Node，挂 BattleStage；Cocos 编辑器把 BoardView 绑到 boardNode。
 * - 逻辑：读 units.json / skills.json → 建 BattleSim → TickDriver 驱动 → BattleReplayer 消费事件。
 * - M1 先用固定布阵；第 10 项做开战按钮 / 胜负弹窗 / 重来。
 */
@ccclass('BattleStage')
export class BattleStage extends Component {
  @property(Node)
  boardNode: Node;

  @property
  speed = 1; // 1 / 2 / 3

  private cfg = new ConfigManager();
  private sim: BattleSim;
  private driver: TickDriver;
  private replayer: BattleReplayer;
  private views = new Map<number, UnitView>();
  private cellSize = 64;
  private started = false;

  async start() {
    await this.loadConfigs();
    this.buildBoard();
    this.createSim();
    this.createViews();
    this.replayer = this.node.addComponent(BattleReplayer);
    this.replayer.bind(this.sim, this.views, this.cellSize);
    this.driver = new TickDriver(this.cfg.battle.tickMs, () => this.sim.step());
    this.started = true;
  }

  private loadConfigs(): Promise<void> {
    return new Promise((res, rej) => {
      let pending = 2;
      const done = () => { if (--pending === 0) res(); };
      resources.load('config/units', JsonAsset, (e, a) => {
        if (e) { rej(e); return; }
        this.cfg.setUnits(a.json as UnitConfigData[]);
        done();
      });
      resources.load('config/skills', JsonAsset, (e, a) => {
        if (e) { rej(e); return; }
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

  private createSim() {
    const units = this.cfg;
    const P = (cfgId: string, side: 0 | 1, x: number, y: number): Placement =>
      ({ cfg: units.getUnit(cfgId), side, x, y });
    const placements: Placement[] = [
      P('warrior', 0, 3, 3),
      P('archer', 0, 4, 1),
      P('mage', 0, 2, 0),
      P('warrior', 1, 3, 6),
      P('archer', 1, 4, 4),
      P('mage', 1, 2, 7),
    ];
    this.sim = new BattleSim(this.cfg, placements, {
      seed: 42, w: this.cfg.battle.boardWidth, h: this.cfg.battle.boardHeight,
      maxTicks: this.cfg.battle.maxTicks,
    });
  }

  private createViews() {
    const bv = this.boardNode.getComponent(BoardView);
    const root = new Node('units');
    this.boardNode.addChild(root);
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

  update(dt: number) {
    if (!this.started || !this.sim || this.sim.finished) return;
    this.driver.advance(dt * this.speed);
    this.replayer.consumeEvents();
    this.replayer.syncViews(dt);
  }
}
