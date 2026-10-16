import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UITransform, UIOpacity, resources, tween } from 'cc';
import { BattleSim } from '../battle/BattleSim';
import { BattleEvent } from '../battle/types';
import { UnitView } from './UnitView';
import { FloatText, FloatTextPool } from './FloatText';
import { BoardView } from './BoardView';
import { FX_SPRITE } from './ArtPaths';

const { ccclass } = _decorator;
const ROLE_SKILL_FX: Record<string, { path: string; size: number; tint: [number, number, number] }> = {
  aimed_arrow: { path: FX_SPRITE.hit, size: 0.9, tint: [255, 220, 150] },
  piercing_shot: { path: FX_SPRITE.hit, size: 1.3, tint: [130, 235, 160] },
  cleave: { path: FX_SPRITE.slash, size: 2.8, tint: [255, 220, 170] },
  fireball: { path: FX_SPRITE.fireball, size: 2.8, tint: [255, 165, 90] },
  corrupt_curse: { path: FX_SPRITE.ring, size: 1.5, tint: [190, 110, 255] },
  divine_mend: { path: FX_SPRITE.ring, size: 1.5, tint: [130, 255, 190] },
};

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
          const attacker = this.sim.units.find(u => u.id === e.id);
          const skillId = attacker?.cfg.skillId;
          const projectile = attacker?.cfg.basicAttackFx;
          if (projectile) {
            const tint = attacker.cfg.basicAttackTint;
            this.playSpriteFx(FX_SPRITE[projectile], uv.node.position.clone(), tv.node.position.clone(),
              projectile === 'ninjaBolt' ? 1.1 : projectile === 'arrow' ? 0.9 : 0.5,
              projectile === 'ninjaBolt' ? 1.1 * 2 / 3 : projectile === 'arrow' ? 0.3 : 0.5,
              true, false, tint ? new Color(...tint) : undefined, true);
          }
          if (skillId === 'rasengan' || skillId === 'sage_clone_rasengan') {
            this.playSpriteFx(FX_SPRITE.rasenganSmall, uv.node.position.clone(), tv.node.position.clone(), 0.65, 0.65, true);
          }
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
          if (this.fxRoot && tv.side !== 0) {
            const ft = FloatTextPool.get();
            const color = FloatText.colorForType(e.dmgType);
            const pos = tv.node.position.clone();
            const sourcePos = this.unitViews.get(e.source)?.node.position;
            ft.show(`${e.critical ? '!' : ''}${e.dmg}`, color, pos, this.fxRoot, {
              critical: e.critical,
              damage: e.dmg,
              direction: sourcePos ? pos.x - sourcePos.x : 0,
            });
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
        if (e.skillId === 'hybrid_bolt' && tv) {
          const source = this.unitViews.get(e.id);
          if (source) this.playSpriteFx(FX_SPRITE.ninjaBolt,
            source.node.position.clone(), tv.node.position.clone(), 1.8, 1.2, true, false, undefined, true);
        }
        if (tv) tv.playHit();
        break;
      }
      case 'heal': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}`, new Color(89, 203, 176), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'shield': {
        // Equipment triggers already have their own visual notification.
        if (e.equipmentId) break;
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}护盾`, new Color(220, 235, 255), uv.node.position.clone(), this.fxRoot);
        if (uv && this.sim.units.find(u => u.id === e.id)?.cfg.skillId === 'guardian_bulwark') {
          const pos = uv.node.position.clone();
          this.playSpriteFx(FX_SPRITE.ring, pos, pos, 1.5, 1.5, false, false, new Color(180, 215, 255));
        }
        break;
      }
      case 'equipment_trigger': {
        const uv = this.unitViews.get(e.id);
        const name = this.sim.units.find(u => u.id === e.id)?.equipment.find(item => item.id === e.equipmentId)?.name ?? '装备触发';
        if (uv && this.fxRoot) FloatTextPool.get().show(name, new Color(255, 218, 104), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'burn': {
        if (this.sim.units.find(u => u.id === e.source)?.cfg.skillId !== 'corrupt_curse')
          this.unitViews.get(e.id)?.playBlackFlame(e.duration);
        break;
      }
      case 'stun': {
        const uv = this.unitViews.get(e.id);
        uv?.playCast(e.duration);
        if (uv && this.fxRoot) FloatTextPool.get().show('眩晕', new Color(204, 125, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'knockup': {
        const uv = this.unitViews.get(e.id);
        uv?.playKnockup(e.duration);
        if (uv && this.fxRoot) FloatTextPool.get().show('击飞', new Color(240, 210, 135), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'guard': {
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`减伤${Math.round(e.reduction * 100)}%`, new Color(120, 215, 150), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'skill_impact': {
        const target = this.unitViews.get(e.target);
        if (e.skillId === 'dragon_breath' && target) {
          const pos = target.node.position.clone();
          this.playSpriteFx(FX_SPRITE.fireball, pos, pos, 3.2, 3.2, false, false, new Color(180, 70, 255));
        }
        const roleFx = ROLE_SKILL_FX[e.skillId];
        if (roleFx && target) {
          const pos = target.node.position.clone();
          this.playSpriteFx(roleFx.path, pos, pos, roleFx.size, roleFx.size, false, false, new Color(...roleFx.tint));
        }
        if (e.skillId === 'sage_clone_rasengan' && target) {
          const source = this.unitViews.get(e.id);
          const direction = Math.sign(target.node.position.x - (source?.node.position.x ?? target.node.position.x)) || 1;
          const pos = target.node.position.clone();
          // Keep the forward-hand Rasengan on the victim; the clone stands behind it.
          pos.x -= direction * this.cellSize * 0.65;
          this.playSpriteFx(FX_SPRITE.sageCloneRasengan, pos, pos, 2.8, 2.8 * 2 / 3, false, direction < 0);
        }
        if (e.skillId === 'rasengan' && target) {
          const pos = target.node.position.clone();
          this.playSpriteFx(FX_SPRITE.rasenganLarge, pos, pos, 4.6, 4.6);
        }
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

  private playSpriteFx(path: string, from: Vec3, to: Vec3, width: number, height: number, projectile = false, mirror = false, tint?: Color, rotate = false): void {
    if (!this.fxRoot?.isValid) return;
    const effect = new Node(projectile ? 'ravenProjectile' : 'ravenVortex');
    effect.addComponent(UITransform).setContentSize(this.cellSize * width, this.cellSize * height);
    const sprite = effect.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    if (tint) sprite.color = tint;
    this.fxRoot.addChild(effect); effect.setPosition(from);
    if (projectile && rotate) effect.angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
    else if (mirror || (projectile && to.x < from.x)) effect.setScale(new Vec3(-1, 1, 1));
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
