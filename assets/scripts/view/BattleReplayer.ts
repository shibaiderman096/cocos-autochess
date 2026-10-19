import { _decorator, Component, Node, Vec3, Color, Sprite, SpriteFrame, UITransform, UIOpacity, resources, tween } from 'cc';
import { BattleSim } from '../battle/BattleSim';
import { BattleEvent } from '../battle/types';
import { UnitView } from './UnitView';
import { FloatText, FloatTextPool } from './FloatText';
import { BoardView } from './BoardView';
import { FX_SPRITE, UNIT_ART } from './ArtPaths';
import { ShadowSkillVfx } from './ShadowSkillVfx';
import { SunlightVfx } from './SunlightVfx';
import { SunlightSpriteVfx } from './SunlightSpriteVfx';

const { ccclass } = _decorator;
interface MoveVisual { from: Vec3; to: Vec3; startTick: number; durationTicks: number }

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
  private moves = new Map<number, MoveVisual>();
  private renderTick = 0;
  private tickMs = 50;
  private shadowFog: Node | null = null;
  private shadowSkillVfx: ShadowSkillVfx | null = null;
  private sunlightVfx: SunlightVfx | null = null;
  private sunlightSprites: SunlightSpriteVfx | null = null;

  bind(sim: BattleSim, views: Map<number, UnitView>, cellSize: number, boardView: BoardView, tickMs = 50) {
    this.clearShadowFog();
    this.shadowSkillVfx?.destroy(); this.shadowSkillVfx = null;
    this.sunlightVfx?.destroy(); this.sunlightVfx = null;
    this.sunlightSprites?.destroy(); this.sunlightSprites = null;
    this.sim = sim;
    this.unitViews = views;
    this.cellSize = cellSize;
    this.boardView = boardView;
    this.tickMs = tickMs;
    this.eventCursor = 0;
    this.moves.clear(); this.renderTick = sim.tick;
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
      case 'sun_pulse':
        if (this.fxRoot?.isValid && this.boardView) {
          this.sunlightVfx ??= new SunlightVfx(this.fxRoot, this.cellSize, this.tickMs,
            (x, y) => this.boardView.cellToWorld(x, y), id => this.unitViews.get(id)?.node);
          if (e.effect !== 'board') this.sunlightVfx.play(e);
          this.sunlightArt()?.play(e);
        }
        break;
      case 'battle_start': break;
      case 'move': {
        const unit = this.sim.units.find(u => u.id === e.id);
        if (unit && this.boardView) this.moves.set(e.id, {
          from: this.boardView.cellToWorld(e.from.x, e.from.y),
          to: this.boardView.cellToWorld(e.to.x, e.to.y),
          startTick: e.tick, durationTicks: Math.max(1, unit.cfg.moveTicks),
        });
        break;
      }
      case 'teleport': {
        this.moves.delete(e.id);
        const uv = this.unitViews.get(e.id);
        if (uv && this.boardView) uv.node.setPosition(this.boardView.cellToWorld(e.to.x, e.to.y));
        const unit = this.sim.units.find(unit => unit.id === e.id);
        const path = unit && UNIT_ART[unit.cfg.artId ?? unit.cfg.id];
        if (path?.includes('/units/shadow/') && this.boardView)
          this.shadowVfx()?.teleport(e.id, path, this.boardView.cellToWorld(e.from.x,e.from.y), this.boardView.cellToWorld(e.to.x,e.to.y), e.tick);
        if (path?.includes('/units/sunlight/') && this.boardView)
          this.sunlightArt()?.teleport(this.boardView.cellToWorld(e.from.x,e.from.y),this.boardView.cellToWorld(e.to.x,e.to.y),e.tick);
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
          const shadowMelee = attacker && attacker.cfg.range <= 1 && UNIT_ART?.[attacker.cfg.artId ?? attacker.cfg.id]?.includes('/units/shadow/');
          const sunlight = attacker && UNIT_ART?.[attacker.cfg.artId ?? attacker.cfg.id]?.includes('/units/sunlight/');
          if (sunlight) this.sunlightArt()?.basicAttack(uv.node.position.clone(),tv.node.position.clone(),e.tick,attacker.cfg.range>1);
          if (shadowMelee) this.shadowVfx()?.basicMelee(uv.node.position.clone(),tv.node.position.clone(),e.tick);
          else if (e.shadow) this.playSpriteFx(FX_SPRITE.shadowProjectile, uv.node.position.clone(), tv.node.position.clone(), 1.1, 0.55, true, false, undefined, true);
          const projectile = e.shadow || shadowMelee || sunlight ? undefined : attacker?.cfg.basicAttackFx;
          if (projectile) {
            const tint = attacker.cfg.basicAttackTint;
            this.playSpriteFx(FX_SPRITE[projectile], uv.node.position.clone(), tv.node.position.clone(),
              projectile === 'arrow' ? 0.9 : 0.5,
              projectile === 'arrow' ? 0.3 : 0.5,
              true, false, tint ? new Color(...tint) : undefined, true);
          }
        }
        break;
      }
      case 'shadow_board': this.showShadowFog(); break;
      case 'shadow_pulse':
        if (e.damage && this.boardView) this.shadowVfx()?.boardPulse(e.tick,this.boardView.boardPixelW/this.cellSize);
        break;
      case 'shadow_mark': break; // The snapshot owns the persistent, moving unit aura.
      case 'skill_pulse': {
        if (!this.boardView) break;
        const pos = this.boardView.cellToWorld(e.center.x, e.center.y);
        const source = this.unitViews.get(e.id)?.node.position.clone();
        this.shadowVfx()?.play(e.effect,e.id,source??pos,pos,e.tick,e.radius,e.duration,e.selfCast);
        break;
      }
      case 'fear': {
        const view = this.unitViews.get(e.id);
        if (view && this.fxRoot) FloatTextPool.get().show('恐惧', new Color(195, 120, 235), view.node.position.clone(), this.fxRoot);
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
            ft.show(e.executed ? '斩杀' : `${e.critical ? '!' : ''}${e.dmg}`, color, pos, this.fxRoot, {
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
          const source = this.sim.units.find(unit => unit.id === e.id);
          const path = source && UNIT_ART[source.cfg.artId ?? source.cfg.id];
          const view = this.unitViews.get(e.id);
          if (path?.includes('/units/shadow/') && view) this.shadowVfx()?.charge(e.id,view.node.position.clone(),e.tick,e.duration);
          if (path?.includes('/units/sunlight/') && view) this.sunlightArt()?.charge(e.id,view.node.position.clone(),e.tick,e.duration);
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
      case 'shield': {
        // Equipment triggers already have their own visual notification.
        if (e.equipmentId) break;
        const uv = this.unitViews.get(e.id);
        if (uv && this.fxRoot) FloatTextPool.get().show(`+${e.amount}护盾`, new Color(220, 235, 255), uv.node.position.clone(), this.fxRoot);
        break;
      }
      case 'equipment_trigger': {
        const uv = this.unitViews.get(e.id);
        const name = this.sim.units.find(u => u.id === e.id)?.equipment.find(item => item.id === e.equipmentId)?.name ?? '装备触发';
        if (uv && this.fxRoot) FloatTextPool.get().show(name, new Color(255, 218, 104), uv.node.position.clone(), this.fxRoot);
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
          this.playSpriteFx(FX_SPRITE.dragonBreath, pos, pos, 3.2, 3.2);
        }
        break;
      }
      case 'death': {
        this.moves.delete(e.id);
        this.shadowSkillVfx?.cancel(e.id);
        this.sunlightSprites?.cancel(e.id);
        const uv = this.unitViews.get(e.id);
        if (uv) uv.playDeath();
        break;
      }
      case 'end': this.clearShadowFog(); this.shadowSkillVfx?.clear(); this.sunlightVfx?.clear(); this.sunlightSprites?.clear(); break;
    }
  }

  syncViews(dt: number, interpolation = 0, playbackSpeed = 1) {
    if (!this.sim || !this.boardView) return;
    // The fixed clock controls travel at every playback speed; only the final step may finish after settlement.
    this.renderTick = this.sim.finished
      ? Math.max(this.renderTick, this.sim.tick) + Math.max(0, dt) * playbackSpeed * 1000 / this.tickMs
      : this.sim.tick + Math.max(0, Math.min(1, interpolation));
    // Derive motion from the simulation clock so pause and playback speed also govern mist.
    if (this.shadowFog?.isValid) {
      const phase = this.renderTick * this.tickMs / 1000;
      this.shadowFog.setScale(1 + Math.sin(phase * 1.7) * 0.018, 1 + Math.cos(phase * 1.3) * 0.018, 1);
      this.shadowFog.getComponent(UIOpacity)!.opacity = 220 + Math.round(Math.sin(phase * 2) * 20);
    }
    for (const u of this.sim.units) {
      const uv = this.unitViews.get(u.id);
      if (!uv) continue;
      if (u.alive) {
        const target = this.boardView.cellToWorld(u.x, u.y);
        const movement = this.moves.get(u.id);
        if (movement) {
          const progress = Math.max(0, Math.min(1, (this.renderTick - movement.startTick) / movement.durationTicks));
          Vec3.lerp(target, movement.from, movement.to, progress);
          if (progress === 1) this.moves.delete(u.id);
        }
        uv.node.setPosition(target);
        uv.sync(u.snapshot(this.sim.tick), this.cellSize);
        uv.animateShadowCorruption?.(this.renderTick,this.tickMs,this.cellSize);
        uv.animateSunlight?.(this.renderTick,this.tickMs,this.cellSize);
        const domain = uv.node.getChildByName('shadowDomain');
        if (domain?.active) {
          const breath = 1 + Math.sin(this.renderTick*this.tickMs/280)*.025;
          domain.setScale(breath,breath,1);
          domain.getComponent(UIOpacity)!.opacity = 160+Math.round(Math.sin(this.renderTick*this.tickMs/400)*20);
        }
      }
    }
    this.shadowSkillVfx?.update(this.renderTick);
    this.sunlightVfx?.update(this.renderTick);
    this.sunlightSprites?.update(this.renderTick);
  }

  private sunlightArt(): SunlightSpriteVfx | null {
    if (!this.fxRoot?.isValid || !this.boardView) return null;
    this.sunlightSprites ??= new SunlightSpriteVfx(this.fxRoot,this.cellSize,this.tickMs,
      (x,y)=>this.boardView.cellToWorld(x,y),id=>this.unitViews.get(id)?.node,
      {width:this.boardView.boardPixelW,height:this.boardView.boardPixelH},id=>{
        const unit=this.sim.units.find(u=>u.id===id);
        return unit ? {alive:unit.alive&&unit.hp>0,shield:unit.shield,empowered:unit.skillAttackSpeedBonus>0} : undefined;
      });
    return this.sunlightSprites;
  }

  private shadowVfx(): ShadowSkillVfx | null {
    if (!this.fxRoot?.isValid) return null;
    this.shadowSkillVfx ??= new ShadowSkillVfx(this.fxRoot,this.cellSize,this.tickMs,id=>this.unitViews.get(id)?.node);
    return this.shadowSkillVfx;
  }

  private showShadowFog(): void {
    if (this.shadowFog?.isValid || !this.fxRoot?.isValid || !this.boardView) return;
    const fog = new Node('shadowBoardFog');
    fog.addComponent(UITransform).setContentSize(this.boardView.boardPixelW + 155, this.boardView.boardPixelH + 100);
    const sprite = fog.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    fog.addComponent(UIOpacity).opacity = 220;
    this.fxRoot.addChild(fog); fog.setSiblingIndex(0); fog.setPosition(0, 0, 0); this.shadowFog = fog;
    resources.load(FX_SPRITE.shadowBoardFog, SpriteFrame, (err, frame) => { if (!err && fog.isValid) sprite.spriteFrame = frame; });
  }

  private clearShadowFog(): void {
    if (this.shadowFog?.isValid) this.shadowFog.destroy();
    this.shadowFog = null;
  }

  onDestroy(): void { this.clearShadowFog(); this.shadowSkillVfx?.destroy(); this.shadowSkillVfx=null; this.sunlightVfx?.destroy(); this.sunlightVfx=null; this.sunlightSprites?.destroy(); this.sunlightSprites=null; }

  private playSpriteFx(path: string, from: Vec3, to: Vec3, width: number, height: number, projectile = false, mirror = false, tint?: Color, rotate = false, angle?: number): void {
    if (!this.fxRoot?.isValid) return;
    const effect = new Node(projectile ? 'ravenProjectile' : 'ravenVortex');
    effect.addComponent(UITransform).setContentSize(this.cellSize * width, this.cellSize * height);
    const sprite = effect.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    if (tint) sprite.color = tint;
    this.fxRoot.addChild(effect); effect.setPosition(from);
    if (angle !== undefined) effect.angle = angle;
    else if (projectile && rotate) effect.angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
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
