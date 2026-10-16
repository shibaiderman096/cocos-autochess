import { Node, Sprite, SpriteFrame, UITransform, Label, Color, resources } from 'cc';
import { M2_UI_SPRITE } from './ArtPaths';

/** Detail-panel indicator for configured extra mana per second. */
export class ManaRegenBadge {
  readonly node = new Node('manaRegen');
  readonly value: Label;
  constructor(parent: Node, x: number, y: number) {
    parent.addChild(this.node); this.node.setPosition(x, y, 0);
    const icon = new Node('manaRegenIcon'); this.node.addChild(icon);
    icon.addComponent(UITransform).setContentSize(12, 12);
    icon.setPosition(6, 0, 0);
    const sprite = icon.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(M2_UI_SPRITE.stat_mana, SpriteFrame, (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
    const text = new Node('manaRegenValue'); this.node.addChild(text);
    text.addComponent(UITransform).setContentSize(42, 18); text.getComponent(UITransform)!.setAnchorPoint(0, .5);
    text.setPosition(15, 0, 0);
    this.value = text.addComponent(Label); this.value.fontSize = 11; this.value.lineHeight = 14;
    this.value.isBold = true; this.value.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.value.color = new Color(149, 216, 255);
    this.node.active = false;
  }
  setRate(rate: number, enabled = true): void {
    this.node.active = enabled && Number.isFinite(rate) && rate > 0;
    this.value.string = this.node.active ? `+${Number(rate.toFixed(2))}/s` : '';
  }
}
