import { Node, Sprite, SpriteFrame, UITransform, Graphics, resources } from 'cc';
import { M2_UI_SPRITE, UISkinKey } from '../view/ArtPaths';

const requested = new WeakMap<Sprite, UISkinKey>();
const sliced = new Set<UISkinKey>([
  'panel_ink', 'panel_side', 'panel_dock', 'panel_modal', 'tooltip_panel',
  'btn_primary', 'btn_secondary', 'btn_disabled', 'btn_danger',
]);

/** Load a skin behind labels. Keep the vector fallback until the image is ready. */
export function setUISkin(node: Node, key: UISkinKey, fallback?: Graphics, ready?: (sprite: Sprite) => void): Sprite {
  let art = node.getChildByName('skin');
  if (!art) {
    art = new Node('skin');
    art.addComponent(UITransform);
    art.addComponent(Sprite);
    node.addChild(art); art.setSiblingIndex(0);
  }
  const size = node.getComponent(UITransform)!.contentSize;
  art.getComponent(UITransform)!.setContentSize(size.width, size.height);
  const sprite = art.getComponent(Sprite)!;
  sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  sprite.trim = false;
  sprite.type = sliced.has(key) ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
  if (requested.get(sprite) !== key) sprite.spriteFrame = null;
  requested.set(sprite, key);
  resources.load(M2_UI_SPRITE[key], SpriteFrame, (err, frame) => {
    if (!sprite.isValid || requested.get(sprite) !== key) return;
    if (err) { console.warn(`[UI] Cannot load ${key}: ${err.message}`); return; }
    sprite.spriteFrame = frame;
    if (fallback?.isValid) fallback.clear();
    ready?.(sprite);
  });
  return sprite;
}
