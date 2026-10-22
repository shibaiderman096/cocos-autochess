import { _decorator, Component, Node, UITransform, Graphics, Color, Vec3, Sprite, UIOpacity, BlockInputEvents, isValid } from 'cc';
import { loadArtSprite } from './ArtSpriteLoader';

const { ccclass } = _decorator;
export interface ChestFlightTarget {
  art: string;
  /** Re-evaluated each frame in the overlay's local coordinates, including current board zoom. */
  position: () => Vec3;
  recipient?: Node;
  land?: () => void;
}
interface Orb { target: ChestFlightTarget; sprite: Node; delay: number; arrived: boolean; }

/** Cosmetic UI particles and portraits only; no reward, simulation, RNG, timer or material writes. */
@ccclass('ChestRewardFlight')
export class ChestRewardFlight extends Component {
  private elapsed = 0;
  private orbs: Orb[] = [];
  private ink: Graphics | null = null;
  private origin: (() => Vec3) | null = null;
  private finish: (() => void) | null = null;
  private hidden = new Map<Node, {opacity: UIOpacity; value: number; remaining: number}>();
  private cancelled = false;

  play(origin: () => Vec3, targets: ChestFlightTarget[], finish: () => void): void {
    this.cancel(); this.cancelled = false; this.elapsed = 0; this.origin = origin; this.finish = finish;
    if (!this.node.getComponent(BlockInputEvents)) this.node.addComponent(BlockInputEvents);
    const trail = new Node('rewardParticleTrails'); trail.layer = this.node.layer; this.node.addChild(trail);
    this.ink = trail.addComponent(Graphics);
    this.orbs = targets.map((target, index) => {
      const node = new Node(`rewardOrb_${index}`); node.layer = this.node.layer; this.node.addChild(node);
      node.addComponent(UITransform).setContentSize(48, 60);
      const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      node.active = false;
      if (target.recipient && isValid(target.recipient, true)) {
        let held = this.hidden.get(target.recipient);
        if (!held) {
          const opacity = target.recipient.getComponent(UIOpacity) ?? target.recipient.addComponent(UIOpacity);
          held = {opacity, value: opacity.opacity, remaining: 0}; this.hidden.set(target.recipient, held);
          opacity.opacity = 0;
        }
        held.remaining++;
      }
      loadArtSprite(target.art, (error, frame) => {
        if (!error && frame && !this.cancelled && isValid(sprite, true)) sprite.spriteFrame = frame;
      });
      return {target, sprite: node, delay: index * .13, arrived: false};
    });
    if (!targets.length) { this.complete(); return; }
    console.info('CHEST_REWARD_FLIGHT_STARTED ' + JSON.stringify({copies: targets.length, duration: 1.30 + .13 * (targets.length - 1)}));
  }

  private point(from: Vec3, to: Vec3, progress: number, index: number): Vec3 {
    const t = Math.max(0, Math.min(1, progress)), u = 1 - t;
    const spread = (index % 2 ? 1 : -1) * (42 + index * 7);
    return new Vec3(u*u*u*from.x + 3*u*u*t*(from.x+spread) + 3*u*t*t*(to.x-spread*.35) + t*t*t*to.x,
      u*u*u*from.y + 3*u*u*t*(from.y+105) + 3*u*t*t*(to.y+82) + t*t*t*to.y, 0);
  }
  private dot(x: number, y: number, radius: number, alpha: number, gold = false): void {
    const g = this.ink!; g.fillColor = gold ? new Color(255, 217, 119, alpha) : new Color(104, 238, 232, alpha);
    g.circle(x, y, radius); g.fill();
  }
  private reveal(orb: Orb): void {
    orb.arrived = true; orb.sprite.active = false;
    const node = orb.target.recipient, held = node && this.hidden.get(node);
    if (held && --held.remaining === 0) {
      if (isValid(held.opacity, true)) held.opacity.opacity = held.value;
      this.hidden.delete(node!);
      orb.target.land?.();
    }
  }

  update(dt: number): void {
    if (this.cancelled || !this.origin || !this.ink) return;
    this.elapsed += Number.isFinite(dt) ? Math.max(0, dt) : 0;
    const g = this.ink; g.clear(); const from = this.origin();
    for (let index = 0; index < this.orbs.length; index++) {
      const orb = this.orbs[index], age = this.elapsed - orb.delay;
      if (age < 0) continue;
      const to = orb.target.position(), t = Math.min(1, age / .98);
      const pos = this.point(from, to, t, index);
      if (age < .98) {
        orb.sprite.active = true; orb.sprite.setPosition(pos);
        orb.sprite.setScale(.65 + .35 * Math.sin(Math.PI * t), .65 + .35 * Math.sin(Math.PI * t), 1);
        this.dot(pos.x, pos.y, 28, 28); this.dot(pos.x, pos.y, 19, 40, true);
        // Fixed-count analytic trail: no random emission, per-frame node creation or lingering particles.
        for (let tail = 1; tail <= 12; tail++) {
          const q = this.point(from, to, Math.max(0, t - tail * .016), index);
          this.dot(q.x, q.y, 5 * (1 - tail / 14), 140 * (1 - tail / 14), tail % 3 === 0);
        }
        for (let spark = 0; spark < 5; spark++) {
          const a = age * 7 + spark * Math.PI * 2 / 5;
          this.dot(pos.x + Math.cos(a)*24, pos.y + Math.sin(a)*19, 1.8, 185, true);
        }
      } else {
        if (!orb.arrived) this.reveal(orb);
        const fade = Math.max(0, 1 - (age - .98) / .32);
        for (let spark = 0; spark < 10 && fade > 0; spark++) {
          const a = spark*Math.PI/5, r = 9 + (1-fade)*32;
          this.dot(to.x+Math.cos(a)*r, to.y+Math.sin(a)*r*.65, 2.5*fade, 220*fade, true);
        }
      }
    }
    // A short burst makes the spawn point legible before the portraits separate.
    const burst = Math.max(0, 1 - this.elapsed / .45);
    for (let i = 0; i < 14 && burst > 0; i++) {
      const a = i*Math.PI*2/14, r = 8+(1-burst)*37;
      this.dot(from.x+Math.cos(a)*r, from.y+Math.sin(a)*r, 3*burst, 210*burst, true);
    }
    if (this.elapsed >= 1.30 + .13 * (this.orbs.length - 1)) this.complete();
  }

  private complete(): void {
    const callback = this.finish; this.finish = null; this.cancel();
    console.info('CHEST_REWARD_FLIGHT_FINISHED'); callback?.();
    if (isValid(this.node, true)) this.node.destroy();
  }
  cancel(): void {
    this.cancelled = true; this.finish = null; this.origin = null;
    for (const held of this.hidden.values()) if (isValid(held.opacity, true)) held.opacity.opacity = held.value;
    this.hidden.clear();
    for (const orb of this.orbs) if (isValid(orb.sprite, true)) orb.sprite.destroy();
    this.orbs = [];
    if (this.ink && isValid(this.ink.node, true)) this.ink.node.destroy();
    this.ink = null;
  }
  onDisable(): void { this.cancel(); }
  onDestroy(): void { this.cancel(); }
}
