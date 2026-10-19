import { Color, Graphics, Node, Sprite, UITransform, Vec3 } from 'cc';
import { BOARD_ENCOUNTER_SPRITE } from './ArtPaths';
import { loadArtSprite } from './ArtSpriteLoader';

/** Clickable encounter object, outside combat and formation counting. */
export class ShopVisitor {
  private root: Node;

  constructor(parent: Node, position: Vec3, enter: () => void, kind: 'shop' | 'chest' = 'shop') {
    this.root = new Node(kind === 'shop' ? 'shopVisitor' : 'bossChest'); parent.addChild(this.root);
    this.root.layer = parent.layer;
    const touchArea = this.root.addComponent(UITransform);
    touchArea.setContentSize(132, 132); touchArea.setAnchorPoint(0.5, 0.25);
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
    loadArtSprite(BOARD_ENCOUNTER_SPRITE[kind],
      (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
    this.root.on(Node.EventType.TOUCH_END, (event: any) => { event.propagationStopped = true; enter(); });
  }

  setVisible(visible: boolean): void {
    this.root.active = visible;
    if (visible) this.root.setSiblingIndex(this.root.parent!.children.length - 1);
  }
}
