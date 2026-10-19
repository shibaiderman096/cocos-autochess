import { Node, Graphics, Color, UITransform, Vec3 } from 'cc';
import type { BattleEvent } from '../battle/types';

type Pulse = Extract<BattleEvent, { t: 'sun_pulse' }>;
interface Slot { node: Node; graphics: Graphics; pulse?: Pulse; center: Vec3; from: Vec3 }

/** Reusable vector effects follow the replay clock, including pause and accelerated play. */
export class SunlightVfx {
  private slots: Slot[] = [];
  constructor(private root: Node, private cell: number, private tickMs: number, private project: (x: number, y: number) => Vec3, private owner: (id: number) => Node | undefined) {}
  play(pulse: Pulse): void {
    let slot = this.slots.find(s => !s.pulse);
    if (!slot) {
      if (this.slots.length >= 96) return;
      const node = new Node('sunlightVfx'); this.root.addChild(node); node.addComponent(UITransform).setContentSize(this.cell * 8, this.cell * 8);
      slot = { node, graphics: node.addComponent(Graphics), center: new Vec3(), from: new Vec3() }; this.slots.push(slot);
    }
    slot.pulse = pulse; slot.center = this.project(pulse.center.x, pulse.center.y);
    slot.from = pulse.from ? this.project(pulse.from.x, pulse.from.y) : slot.center.clone();
    slot.node.setScale(1, 1, 1); slot.node.angle = 0; slot.node.active = true; slot.graphics.clear();
  }
  update(tick: number): void {
    for (const slot of this.slots) {
      const e = slot.pulse; if (!e) continue;
      const elapsed = (tick - e.tick) * this.tickMs / 1000, p = Math.max(0, elapsed / Math.max(.05, e.duration));
      if (p >= 1) { slot.pulse = undefined; slot.node.active = false; slot.graphics.clear(); continue; }
      const g = slot.graphics, c = this.cell, alpha = Math.round(240 * (1 - p));
      g.clear(); slot.node.setPosition(slot.center); g.lineWidth = 2;
      g.strokeColor = new Color(255, 212, 89, alpha); g.fillColor = new Color(255, 192, 59, Math.round(alpha * .14));
      if (e.effect === 'bolt' || e.effect === 'slash') {
        const dx = slot.center.x - slot.from.x, dy = slot.center.y - slot.from.y;
        slot.node.angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (e.effect === 'bolt') {
          slot.node.setPosition(slot.from.x + dx * Math.min(1, p * 2), slot.from.y + dy * Math.min(1, p * 2), 0);
          g.lineWidth = 5; g.moveTo(-c * .4, 0); g.lineTo(c * .25, 0); g.stroke();
          g.moveTo(c * .1, -c * .1); g.lineTo(c * .28, 0); g.lineTo(c * .1, c * .1); g.stroke();
          for (let i = 1; i <= 3; i++) {
            g.strokeColor = new Color(255, 198, 70, Math.round(alpha / (i + 1)));
            g.moveTo(-c * (.4 + i * .16), -c * .04 * i); g.lineTo(-c * .2, -c * .04 * i); g.stroke();
          }
        } else {
          g.lineWidth = 4; const r = c * (.35 + e.radius * .25 + p * .25);
          g.arc(0, 0, r, -Math.PI / 3 + p, Math.PI / 3 + p, false); g.stroke();
          g.lineWidth = 2; g.strokeColor = new Color(255, 248, 204, alpha);
          g.arc(0, 0, r * .83, -Math.PI / 3 + p, Math.PI / 3 + p, false); g.stroke();
        }
      } else if (e.effect === 'judgment') {
        g.fillColor = new Color(255, 238, 161, Math.round(alpha * .3)); g.rect(-c * .15 * (1 - p), 0, c * .3 * (1 - p), c * 5); g.fill();
        g.lineWidth = 3; g.ellipse(0, 0, c * (.4 + p), c * (.2 + p * .3)); g.stroke();
        g.fillColor = new Color(255, 255, 221, alpha); g.ellipse(0, c * (3 - p * 3), c * .12, c * .3); g.fill();
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4;
          g.moveTo(Math.cos(a) * c * p, Math.sin(a) * c * p * .6);
          g.lineTo(Math.cos(a) * c * (p + .2), Math.sin(a) * c * (p + .2) * .6);
        } g.stroke();
      } else {
        if (e.effect === 'shield' || e.effect === 'formation') {
          const owner = this.owner(e.id); if (owner?.isValid) slot.node.setPosition(owner.position);
        }
        const radius = c * (e.effect === 'board' ? e.radius * .55 : e.effect === 'prayer' ? e.radius + .5 : .35 + e.radius * .45 + p * .6);
        if (e.effect === 'shield') { g.ellipse(0, c * .1, radius, radius * 1.2); g.fill(); g.stroke(); }
        else if (e.effect === 'formation') {
          // Rising chevrons signal the delayed front/back formation enhancement.
          for (let i = 0; i < 3; i++) {
            const y = c * (p * 1.1 + i * .2);
            g.moveTo(-c * .22, y); g.lineTo(0, y + c * .16); g.lineTo(c * .22, y); g.stroke();
          }
        } else {
          g.ellipse(0, 0, radius, radius * .6); g.fill(); g.stroke();
          if (e.effect === 'prayer' || e.effect === 'board') {
            g.ellipse(0, 0, radius * .75, radius * .45); g.stroke();
            for (let i = 0; i < 6; i++) {
              const a = elapsed * .7 + i * Math.PI / 3, b = a + Math.PI * 2 / 3;
              g.moveTo(Math.cos(a) * radius * .75, Math.sin(a) * radius * .45);
              g.lineTo(Math.cos(b) * radius * .75, Math.sin(b) * radius * .45);
            } g.stroke();
          }
          for (let i = 0; i < 12; i++) {
            const a = i * Math.PI / 6 + elapsed * .4, outer = radius * 1.2;
            g.moveTo(Math.cos(a) * radius, Math.sin(a) * radius * .6); g.lineTo(Math.cos(a) * outer, Math.sin(a) * outer * .6);
          } g.stroke();
        }
      }
    }
  }
  clear(): void { for (const s of this.slots) { s.pulse = undefined; s.node.active = false; s.graphics.clear(); } }
  destroy(): void { for (const s of this.slots) s.node.destroy(); this.slots.length = 0; }
}
