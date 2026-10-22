import { Node, Sprite, UITransform, UIOpacity } from 'cc';
import type { BattleEvent, Side } from '../battle/types';
import type { BattleSim } from '../battle/BattleSim';
import { densestAstralCenter } from '../battle/Astral';
import { BoardView } from './BoardView';
import { FX_SPRITE } from './ArtPaths';
import { astralSprite } from './AstralArt';

type MeteorEvent = Extract<BattleEvent, { t: 'astral_meteor' }>;
interface Slot {
  node: Node; ring: Sprite; comet: Sprite; impact: Sprite; shock: Sprite;
  event?: MeteorEvent; previewSide?: Side;
}
const IMPACT_SECONDS = 1.15, APPROACH_SECONDS = .6;
const opacity = (sprite: Sprite, value: number) => { sprite.node.getComponent(UIOpacity)!.opacity = Math.round(value); };

/** Painted, pooled layers. Preview is cosmetic; only the authoritative event creates an impact. */
export class AstralVfx {
  private slots: Slot[] = [];
  private disposed = false;
  constructor(private root: Node, private board: BoardView, private tickMs: number) { this.acquire(); }

  private acquire(): Slot | undefined {
    if (this.disposed || !this.root.isValid) return;
    const idle = this.slots.find(s => !s.event && s.previewSide === undefined);
    if (idle) return idle;
    if (this.slots.length >= 6) return;
    const node = new Node('astralPooled'); this.root.addChild(node); node.layer = this.root.layer;
    node.addComponent(UIOpacity);
    const alive = () => !this.disposed && this.root.isValid;
    const size = this.board.hexSize * 4.6;
    const ring = astralSprite(node, 'astralTargetRing', FX_SPRITE.astralRing, size, size * .6, alive);
    const shock = astralSprite(node, 'astralShockwave', FX_SPRITE.astralRing, size, size * .6, alive);
    const impact = astralSprite(node, 'astralImpact', FX_SPRITE.astralImpact, size * 1.45, size * .97, alive);
    const comet = astralSprite(node, 'astralComet', FX_SPRITE.astralMeteor, size * 1.65, size * 1.1, alive);
    // The painted star head is at 71% x, 72% y in the untrimmed source canvas.
    comet.node.getComponent(UITransform)!.setAnchorPoint(.71, .28);
    const slot = { node, ring, comet, impact, shock }; this.slots.push(slot); this.release(slot); return slot;
  }
  private release(slot: Slot): void {
    slot.node.active = false; slot.node.name = 'astralPooled'; slot.event = undefined; slot.previewSide = undefined;
    for (const sprite of [slot.ring, slot.comet, slot.impact, slot.shock]) {
      sprite.node.active = false; sprite.node.angle = 0; sprite.node.setScale(1, 1, 1); sprite.node.setPosition(0, 0, 0); opacity(sprite, 0);
    }
  }
  play(event: MeteorEvent): void {
    if (this.disposed) return;
    const slot = this.slots.find(s => s.previewSide === event.side) ?? this.acquire();
    if (!slot) return;
    this.release(slot); slot.event = event; slot.node.name = 'astralMeteor'; slot.node.active = true;
    slot.node.setPosition(this.board.cellToWorld(event.center.x, event.center.y));
    this.drawImpact(slot, 0);
  }
  private drawImpact(slot: Slot, age: number): void {
    const p = Math.max(0, Math.min(1, age / IMPACT_SECONDS));
    slot.comet.node.active = false; slot.ring.node.active = false;
    slot.impact.node.active = true; slot.shock.node.active = true;
    const bloom = .45 + .65 * (1 - Math.pow(1 - p, 3));
    slot.impact.node.setScale(bloom, bloom, 1); opacity(slot.impact, 255 * Math.pow(1 - p, 1.5));
    const wave = .48 + .9 * p;
    slot.shock.node.setScale(wave, wave, 1); opacity(slot.shock, 205 * (1 - p));
  }
  update(renderTick: number, sim?: BattleSim): void {
    if (this.disposed) return;
    for (const slot of this.slots) if (slot.event) {
      const age = (renderTick - slot.event.tick) * this.tickMs / 1000;
      if (age >= IMPACT_SECONDS) this.release(slot); else this.drawImpact(slot, age);
    }
    if (!sim || sim.finished) return;
    for (const field of sim.astralFields) {
      const meteor = field.effect.meteor; if (!meteor) continue;
      const interval = Math.max(1, Math.round(meteor.intervalSeconds * 1000 / this.tickMs));
      const remaining = (interval - renderTick % interval) * this.tickMs / 1000;
      let slot = this.slots.find(s => s.previewSide === field.side);
      if (remaining > APPROACH_SECONDS) { if (slot) this.release(slot); continue; }
      const enemies = sim.units.filter(u => u.side !== field.side && u.hp > 0 && u.alive && !u.snapshot(sim.tick).untargetable);
      const center = densestAstralCenter(enemies, this.board.boardWidth, this.board.boardHeight, meteor.radius);
      if (!center) { if (slot) this.release(slot); continue; }
      slot ??= this.acquire(); if (!slot) continue;
      slot.previewSide = field.side; slot.node.name = 'astralWarning'; slot.node.active = true;
      slot.node.setPosition(this.board.cellToWorld(center.x, center.y));
      slot.ring.node.active = true; slot.comet.node.active = true;
      const p = Math.max(0, Math.min(1, 1 - remaining / APPROACH_SECONDS));
      const travel = Math.pow(1 - p, 1.5);
      slot.comet.node.setPosition(-this.board.hexSize * 4 * travel, this.board.hexSize * 5 * travel, 0);
      opacity(slot.comet, 255 * Math.min(1, p * 4));
      slot.ring.node.setScale(.75 + p * .25, .75 + p * .25, 1);
      opacity(slot.ring, 70 + 100 * p);
    }
  }
  /** Terminal cleanup prevents late resource callbacks from touching a replay that ended. */
  clear(): void {
    this.disposed = true;
    for (const slot of this.slots) if (slot.node.isValid) {
      slot.node.active = false; slot.node.removeFromParent(); slot.node.destroy();
    }
    this.slots.length = 0;
  }
}
