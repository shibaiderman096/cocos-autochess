import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UITransform, UIOpacity, resources, tween } from 'cc';
import { BattleSim } from '../battle/BattleSim';
import { BattleEvent } from '../battle/types';
import { UnitView } from './UnitView';
import { FloatText, FloatTextPool } from './FloatText';
import { BoardView } from './BoardView';
import { FX_SPRITE } from './ArtPaths';

const { ccclass } = _decorator;

/**
 * 战斗回放器：消费 sim.events，把逻辑事件映射到 UnitView 表现。
 */
@ccclass('BattleReplayer')
export class BattleReplayer extends Component {
  private sim: BattleSim;
  private eventCursor = 0;
  private unitViews = new Map<number, UnitView>();
  private cellSize = 64;
  private fxRoot: Node;
  private boardView: BoardView;

  bind(sim: BattleSim, views: Map<number, UnitView>, cellSize: number, boardView: BoardView) {
    this.sim = sim;
    this.unitViews = views;
    this.cellSize = cellSize;
    this.boardView = boardView;
    this.eventCursor = 0;
  }

  setFxRoot(root: Node): void { this.fxRoot = root; }

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
      case 'battle_start': break;
      case 'move': break;
      case 'teleport': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.boardView) uv.node.setPosition(this.boardView.cellToWorld(e.to.x, e.to.y));
        break;
      }
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
          if (this.sim.units.find(u => u.id === e.id)?.cfg.id === 'itachi') {
            this.playSpriteFx(FX_SPRITE.itachiRaven, uv.node.position.clone(), tv.node.position.clone(), 0.75, 0.75, true);
          }
        }
        break;
      }
      case 'hit': {
        const tv = this.unitViews.get(e.id);
        if (tv) {
          tv.playHit();
          if (this.fxRoot) {
            const ft = FloatTextPool.get();
            const color = FloatText.colorForType(e.dmgType);
            const pos = tv.node.position.clone();
            ft.show(`-${e.dmg}${e.critical ? '!' : ''}`, color, pos, this.fxRoot, e.critical);
          }
        }
        break;
      }
      case 'cast': {
        if (e.duration !== undefined) {
          this.unitViews.get(e.id)?.playCast(e.duration);
          break;
        }
        const tv = this.unitViews.get(e.target);
        if (tv) tv.playHit();
        break;
      }
      case 'heal': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}`, new Color(89, 203, 176), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'equipment_trigger': {
        const uv = this.unitViews.get(e.id);
        const name = this.sim.units.find(u => u.id === e.id)?.equipment.find(item => item.id === e.equipmentId)?.name ?? '装备触发';
        if (uv && this.fxRoot) FloatTextPool.get().show(name, new Color(255, 218, 104), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'burn': {
        this.unitViews.get(e.id)?.playBlackFlame(e.duration);
        break;
      }
      case 'stun': {
        const uv = this.unitViews.get(e.id);
        uv?.playCast(e.duration);
        if (uv && this.fxRoot) FloatTextPool.get().show('眩晕', new Color(204, 125, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'skill_impact': {
        const target = this.unitViews.get(e.target);
        if (e.skillId === 'tsukuyomi' && target) {
          const pos = target.node.position.clone();
          this.playSpriteFx(FX_SPRITE.itachiVortex, pos, pos, 2.7, 1.8);
        }
        break;
      }
      case 'death': {
        const uv = this.unitViews.get(e.id);
        if (uv) uv.playDeath();
        break;
      }
      case 'end': break;
    }
  }

  syncViews(dt: number) {
    if (!this.sim || !this.boardView) return;
    for (const u of this.sim.units) {
      const uv = this.unitViews.get(u.id);
      if (!uv) continue;
      if (u.alive) {
        const target = this.boardView.cellToWorld(u.x, u.y);
        uv.sync(u.snapshot(this.sim.tick), target, this.cellSize, dt);
      }
    }
  }

  private playSpriteFx(path: string, from: Vec3, to: Vec3, width: number, height: number, projectile = false): void {
    if (!this.fxRoot?.isValid) return;
    const effect = new Node(projectile ? 'ravenProjectile' : 'ravenVortex');
    effect.addComponent(UITransform).setContentSize(this.cellSize * width, this.cellSize * height);
    const sprite = effect.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    this.fxRoot.addChild(effect); effect.setPosition(from);
    if (projectile && to.x < from.x) effect.setScale(new Vec3(-1, 1, 1));
    resources.load(path, SpriteFrame, (err, frame) => {
      if (!effect.isValid) return;
      if (err) { effect.destroy(); return; }
      sprite.spriteFrame = frame;
      if (projectile) {
        tween(effect).to(0.25, { position: to }).call(() => { if (effect.isValid) effect.destroy(); }).start();
      } else {
        const opacity = effect.addComponent(UIOpacity);
        tween(opacity).to(0.45, { opacity: 0 }).call(() => { if (effect.isValid) effect.destroy(); }).start();
      }
    });
  }
}
