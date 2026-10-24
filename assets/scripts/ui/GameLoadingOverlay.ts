import { _decorator, Component, Node, UITransform, Graphics, Color, Sprite, Label, BlockInputEvents, isValid } from 'cc';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { UI_SPRITE } from '../view/ArtPaths';

const { ccclass } = _decorator;

/** Scene-local presentation; completion is driven by resource readiness, never by animation time. */
@ccclass('GameLoadingOverlay')
export class GameLoadingOverlay extends Component {
  private elapsed = 0;
  private message = '';
  private finished = false;
  private failed = false;
  private emblem: Node;
  private motion: Graphics;
  private status: Label;
  private returnButton: Node;
  private returnAction: (() => void) | null = null;

  static show(parent: Node, message: string): GameLoadingOverlay {
    const existing = parent.getChildByName('gameLoading')?.getComponent(GameLoadingOverlay);
    if (existing && !existing.finished) { existing.setMessage(message); return existing; }
    const root = new Node('gameLoading'); parent.addChild(root); root.layer = parent.layer;
    root.addComponent(UITransform).setContentSize(1280, 720);
    root.addComponent(BlockInputEvents);
    const loading = root.addComponent(GameLoadingOverlay);
    loading.build(); loading.setMessage(message); loading.update(0);
    return loading;
  }

  private text(parent: Node, name: string, value: string, y: number, size: number, color: Color): Label {
    const node = new Node(name); parent.addChild(node); node.layer = this.node.layer;
    node.addComponent(UITransform).setContentSize(680, size + 16); node.setPosition(0, y, 0);
    const text = node.addComponent(Label); text.string = value; text.fontSize = size;
    text.lineHeight = size + 6; text.color = color; return text;
  }

  private build(): void {
    const background = this.node.addComponent(Graphics);
    background.fillColor = new Color(12, 25, 34);
    background.rect(-1600, -1000, 3200, 2000); background.fill();
    const orbit = new Node('loadingOrbit'); this.node.addChild(orbit); orbit.layer = this.node.layer;
    orbit.addComponent(UITransform).setContentSize(320, 300); this.motion = orbit.addComponent(Graphics);
    this.emblem = new Node('loadingEmblem'); this.node.addChild(this.emblem); this.emblem.layer = this.node.layer;
    this.emblem.addComponent(UITransform).setContentSize(164, 164); this.emblem.setPosition(0, 64, 0);
    const sprite = this.emblem.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    loadArtSprite(UI_SPRITE.loadingEmblem, (error, frame) => {
      if (!error && !this.finished && sprite.isValid) sprite.spriteFrame = frame;
    });
    this.text(this.node, 'loadingTitle', '浮空棋境', -47, 28, new Color(231, 239, 231)).isBold = true;
    this.status = this.text(this.node, 'loadingStatus', '', -88, 16, new Color(155, 187, 189));
    this.returnButton = new Node('loadingReturn'); this.node.addChild(this.returnButton);
    this.returnButton.layer = this.node.layer;
    this.returnButton.addComponent(UITransform).setContentSize(188, 42); this.returnButton.setPosition(0, -164, 0);
    const button = this.returnButton.addComponent(Graphics); button.fillColor = new Color(45, 99, 96);
    button.roundRect(-94, -21, 188, 42, 4); button.fill();
    this.text(this.returnButton, 'loadingReturnLabel', '返回主界面', 0, 17, new Color(231, 239, 231));
    this.returnButton.on(Node.EventType.TOUCH_END, () => {
      const action = this.returnAction; this.returnAction = null; action?.();
    });
    this.returnButton.active = false;
  }

  setMessage(message: string): void { this.message = message; if (this.status) this.status.string = message; }

  fail(message: string, onReturn: () => void): void {
    if (this.finished) return;
    this.failed = true; this.setMessage(message); this.returnAction = onReturn;
    this.status.color = new Color(231, 166, 149); this.returnButton.active = true;
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true; this.returnAction = null;
    if (isValid(this.node, true)) { this.node.active = false; this.node.destroy(); }
  }

  update(dt: number): void {
    if (this.finished || !this.motion) return;
    const siblings = this.node.parent?.children;
    if (siblings?.length && siblings[siblings.length - 1] !== this.node) this.node.setSiblingIndex(siblings.length - 1);
    if (!this.failed) this.elapsed = (this.elapsed + Math.max(0, dt)) % 1.8;
    const phase = Math.floor(this.elapsed / .3) % 6;
    const wave = Math.sin(this.elapsed * Math.PI * 2 / 1.8);
    this.emblem.setPosition(0, 64 + wave * 5, 0);
    const scale = 1 + wave * .018;
    this.emblem.setScale(scale, scale, 1);
    const g = this.motion; g.clear();
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 2 - i * Math.PI / 3;
      const x = Math.cos(angle) * 116, y = 64 + Math.sin(angle) * 88;
      const trail = (phase - i + 6) % 6;
      g.fillColor = trail === 0 ? new Color(216, 190, 115) : new Color(66, 145, 143, trail < 3 ? 180 : 65);
      for (let corner = 0; corner < 6; corner++) {
        const a = corner * Math.PI / 3;
        const px = x + Math.cos(a) * 8, py = y + Math.sin(a) * 8;
        if (!corner) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.close(); g.fill();
    }
    if (!this.failed) {
      for (let i = 0; i < 3; i++) {
        g.fillColor = new Color(111, 188, 176, (Math.floor(this.elapsed / .3) % 3 === i) ? 255 : 60);
        g.ellipse((i - 1) * 18, -126, 3, 3); g.fill();
      }
    }
  }
}
