import { _decorator, Component, Node, Vec3, Color } from 'cc';
import { BattleSim } from '../battle/BattleSim';
import { BattleEvent } from '../battle/types';
import { UnitView } from './UnitView';
import { FloatText, FloatTextPool } from './FloatText';

const { ccclass } = _decorator;

/**
 * 战斗回放器：消费 sim.events，把逻辑事件映射到 UnitView 表现。
 * - sim 由 BattleStage 持有并推进（TickDriver），本组件只消费新增事件。
 * - 倍速由 BattleStage 控制（TickDriver advance 的 dt 乘 speed）。
 */
@ccclass('BattleReplayer')
export class BattleReplayer extends Component {
  private sim: BattleSim;
  private eventCursor = 0;
  private unitViews = new Map<number, UnitView>();
  private cellSize = 64;
  private fxRoot: Node;

  bind(sim: BattleSim, views: Map<number, UnitView>, cellSize: number) {
    this.sim = sim;
    this.unitViews = views;
    this.cellSize = cellSize;
    this.eventCursor = 0;
  }

  setFxRoot(root: Node): void {
    this.fxRoot = root;
  }

  /** 每帧由 BattleStage 调用：消费 sim.events 中尚未处理的事件 */
  consumeEvents() {
    if (!this.sim) return;
    const events = this.sim.events;
    while (this.eventCursor < events.length) {
      const e = events[this.eventCursor++];
      this.play(e);
    }
  }

  private play(e: BattleEvent) {
    switch (e.t) {
      case 'battle_start':
        break;
      case 'move':
        break;
      case 'attack': {
        const uv = this.unitViews.get(e.id);
        const tv = this.unitViews.get(e.target);
        if (uv && tv) {
          const dir = new Vec3(
            Math.sign(tv.node.position.x - uv.node.position.x),
            Math.sign(tv.node.position.y - uv.node.position.y),
            0,
          );
          uv.playAttack(dir);
        }
        break;
      }
      case 'hit': {
        const tv = this.unitViews.get(e.id);
        if (tv) {
          tv.playHit();
          // 飘字
          if (this.fxRoot) {
            const ft = FloatTextPool.get();
            const color = FloatText.colorForType(e.dmgType);
            const pos = tv.node.position.clone();
            ft.show(`-${e.dmg}`, color, pos, this.fxRoot);
          }
        }
        break;
      }
      case 'cast': {
        const tv = this.unitViews.get(e.target);
        if (tv) tv.playHit();
        break;
      }
      case 'death': {
        const uv = this.unitViews.get(e.id);
        if (uv) uv.playDeath();
        break;
      }
      case 'end':
        break;
    }
  }

  /** BattleStage 每帧调用，按 id 顺序把 sim.units 快照同步到视图 */
  syncViews(dt: number) {
    if (!this.sim) return;
    for (const u of this.sim.units) {
      const uv = this.unitViews.get(u.id);
      if (!uv) continue;
      if (u.alive) uv.sync(u.snapshot(), this.cellSize, dt);
    }
  }
}
