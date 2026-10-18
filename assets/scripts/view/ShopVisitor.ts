import { Color, Graphics, Label, Node, Sprite, UITransform, Vec3 } from 'cc';
import { ENCOUNTER_SPRITE } from './ArtPaths';
import { loadArtSprite } from './ArtSpriteLoader';

/** Clickable encounter object, outside combat and formation counting. */
export class ShopVisitor {
  private root: Node;

  constructor(parent: Node, position: Vec3, enter: () => void, kind: 'shop' | 'chest' = 'shop') {
    this.root = new Node(kind === 'shop' ? 'shopVisitor' : 'bossChest'); parent.addChild(this.root);
    this.root.layer = parent.layer;
    this.root.addComponent(UITransform).setContentSize(132, 158);
    this.root.setPosition(position);
    const base = this.root.addComponent(Graphics);
    base.fillColor = new Color(20, 29, 30, 220);
    base.ellipse(0, -18, 49, 13); base.fill();
    base.strokeColor = new Color(234, 193, 98); base.lineWidth = 3;
    base.ellipse(0, -18, 49, 13); base.stroke();
    const portrait = new Node(kind === 'shop' ? 'merchant' : 'treasureChest');
    this.root.addChild(portrait); portrait.layer = parent.layer;
    portrait.addComponent(UITransform).setContentSize(112, 112); portrait.setPosition(0, 36, 0);
    const sprite = portrait.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadArtSprite(ENCOUNTER_SPRITE[kind === 'shop' ? 'specialShop' : 'boss'],
      (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
    this.text(kind === 'shop' ? '旅行商店' : '首领宝箱', -43, 20, new Color(255, 217, 137));
    this.text(kind === 'shop' ? '点击进入' : '点击领取', -68, 14, new Color(227, 237, 225));
    this.root.on(Node.EventType.TOUCH_END, (event: any) => { event.propagationStopped = true; enter(); });
  }

  private text(value: string, y: number, size: number, color: Color): void {
    const node = new Node('text'); this.root.addChild(node); node.layer = this.root.layer;
    node.addComponent(UITransform).setContentSize(160, 26); node.setPosition(0, y, 0);
    const label = node.addComponent(Label); label.string = value; label.fontSize = size;
    label.lineHeight = size + 4; label.color = color; label.isBold = true;
    label.horizontalAlign = Label.HorizontalAlign.CENTER; label.verticalAlign = Label.VerticalAlign.CENTER;
  }

  setVisible(visible: boolean): void {
    this.root.active = visible;
    if (visible) this.root.setSiblingIndex(this.root.parent!.children.length - 1);
  }
}
