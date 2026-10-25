import { _decorator, Component, Node, Graphics, Color, UITransform, UIOpacity, Vec3 } from 'cc';
import { label } from '../ui/UIPrimitives';

const { ccclass } = _decorator;
const TAU = Math.PI * 2;
const GOLD = new Color(220, 187, 112), CYAN = new Color(128, 239, 255), TEAL = new Color(50, 189, 221, 190);
const STREAMS = [new Color(53, 108, 220, 155), new Color(58, 184, 232, 200), new Color(128, 239, 255, 220)];

/** Board-space animation only; inventory and progression remain owned by RunSession. */
@ccclass('ExpeditionPortal')
export class ExpeditionPortal extends Component {
  private visual: Node;
  private runes: Node;
  private vortex: Graphics;
  private halo: Graphics;
  private opacity: UIOpacity;
  private caption: UIOpacity;
  private hint: ReturnType<typeof label>;
  private elapsed = 0;
  private entering = false;
  private enterElapsed = 0;
  private onEntered: (() => void) | null = null;

  init(position: Vec3, enter: () => void): void {
    this.node.setPosition(position.x, position.y + 30, 0);
    this.node.addComponent(UITransform).setContentSize(212, 250);
    const foot = this.graphics(this.node, 'portalFoot');
    foot.fillColor = new Color(4, 14, 26, 95); foot.ellipse(0, -54, 69, 18); foot.fill();
    foot.strokeColor = TEAL; foot.lineWidth = 2; foot.ellipse(0, -54, 55, 12); foot.stroke();
    foot.strokeColor = GOLD; foot.lineWidth = 1; foot.ellipse(0, -54, 65, 15); foot.stroke();

    this.visual = this.child(this.node, 'portalVisual'); this.visual.setPosition(0, 20, 0);
    this.opacity = this.visual.addComponent(UIOpacity);
    this.halo = this.graphics(this.visual, 'portalHalo');
    const frame = this.graphics(this.visual, 'portalFrame');
    frame.fillColor = new Color(6, 18, 45, 245); frame.ellipse(0, 0, 47, 70); frame.fill();
    frame.strokeColor = new Color(37, 78, 113); frame.lineWidth = 11; frame.ellipse(0, 0, 52, 76); frame.stroke();
    frame.strokeColor = GOLD; frame.lineWidth = 2; frame.ellipse(0, 0, 55, 79); frame.stroke();
    frame.strokeColor = CYAN; frame.lineWidth = 2; frame.ellipse(0, 0, 47, 70); frame.stroke();
    this.vortex = this.graphics(this.visual, 'portalVortex');
    this.runes = this.child(this.visual, 'portalRunes'); this.runes.setScale(1, 1.35, 1);
    const glyphs = this.graphics(this.runes, 'portalGlyphs'); glyphs.strokeColor = GOLD; glyphs.lineWidth = 1.8;
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12, x = Math.cos(a), y = Math.sin(a);
      glyphs.moveTo(x * 60, y * 60); glyphs.lineTo(x * 66 - y * 3, y * 66 + x * 3);
      glyphs.lineTo(x * 72, y * 72); glyphs.lineTo(x * 66 + y * 3, y * 66 - x * 3);
      glyphs.close(); glyphs.stroke();
    }
    const crest = this.graphics(this.visual, 'portalCrest'); crest.fillColor = GOLD;
    for (const y of [-86, 86]) {
      crest.moveTo(0, y + 7); crest.lineTo(6, y); crest.lineTo(0, y - 7); crest.lineTo(-6, y); crest.close(); crest.fill();
    }
    const caption = this.child(this.node, 'portalCaption'); this.caption = caption.addComponent(UIOpacity);
    const plate = this.graphics(caption, 'portalPlate');
    plate.fillColor = new Color(9, 26, 40, 245); plate.roundRect(-106, -120, 212, 56, 8); plate.fill();
    plate.strokeColor = new Color(100, 172, 190); plate.lineWidth = 1; plate.roundRect(-106, -120, 212, 56, 8); plate.stroke();
    label(caption, '星界之门', 0, -81, 20, new Color(235, 222, 176), 196);
    this.hint = label(caption, '点击进入下一阶段', 0, -105, 14, new Color(152, 225, 231), 200);
    this.node.on(Node.EventType.TOUCH_END, event => {
      event.propagationStopped = true; if (!this.entering) enter();
    });
    this.paint();
  }
  private child(parent: Node, name: string): Node {
    const node = new Node(name); node.layer = parent.layer; parent.addChild(node);
    node.addComponent(UITransform).setContentSize(212, 250); return node;
  }
  private graphics(parent: Node, name: string): Graphics { return this.child(parent, name).addComponent(Graphics); }
  onEnable(): void {
    this.elapsed = 0; this.entering = false; this.enterElapsed = 0; this.onEntered = null;
    if (this.hint) this.hint.string = '点击进入下一阶段';
    if (this.visual) this.paint();
  }
  onDisable(): void { this.onEntered = null; }
  /** Short intake/flash before the existing covered scene transition. Repeated clicks cannot re-enter. */
  playEnter(done: () => void): void {
    if (this.entering) return;
    this.entering = true; this.enterElapsed = 0; this.onEntered = done; this.hint.string = '正在穿越…';
  }
  update(dt: number): void {
    const step = Math.max(0, Math.min(.1, Number.isFinite(dt) ? dt : 0));
    this.elapsed += step;
    if (this.entering) this.enterElapsed += step;
    if (!this.visual) return;
    this.paint();
    if (this.entering && this.enterElapsed >= .65 && this.onEntered) {
      const done = this.onEntered; this.onEntered = null; done();
    }
  }
  private paint(): void {
    const t = this.elapsed, opening = Math.min(1, t / .8), ease = 1 - (1 - opening) ** 3;
    const entering = this.entering ? Math.min(1, this.enterElapsed / .65) : 0;
    const pulse = 1 + Math.sin(t * 2) * .018;
    const scale = (.06 + .94 * ease) * pulse * (1 + entering * .35);
    this.visual.setScale(scale, scale, 1); this.opacity.opacity = Math.round(255 * ease);
    this.caption.opacity = Math.round(255 * Math.min(1, opening * 2));
    this.runes.setRotationFromEuler(0, 0, -t * 13 - entering * 80);
    const halo = this.halo; halo.clear();
    for (let i = 3; i >= 0; i--) {
      halo.strokeColor = new Color(62, 183, 234, 16 + i * 6 + entering * 24); halo.lineWidth = 7;
      halo.ellipse(0, 0, 59 + i * 4 + entering * 16, 84 + i * 4 + entering * 20); halo.stroke();
    }
    const g = this.vortex; g.clear();
    for (let arm = 0; arm < 6; arm++) {
      g.strokeColor = STREAMS[arm % STREAMS.length]; g.lineWidth = 1.4 + arm % 3 * .65;
      for (let step = 0; step <= 24; step++) {
        const r = (step + 1) / 25, a = arm * TAU / 6 + r * 4.8 - t * (1.5 + entering * 5);
        const x = Math.cos(a) * r * 43, y = Math.sin(a) * r * 65;
        if (!step) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const life = (i / 16 + t * (.1 + entering * .35)) % 1, r = 1 - life;
      const a = i * 2.39996 + t * .6, size = 1 + (i % 3) * .45;
      g.fillColor = i % 4 ? CYAN : GOLD;
      g.ellipse(Math.cos(a) * r * 43, Math.sin(a) * r * 65, size, size); g.fill();
    }
    g.fillColor = new Color(158, 246, 255, 150 + entering * 105);
    g.ellipse(0, 0, 4 + entering * 30, 6 + entering * 47); g.fill();
  }
}
