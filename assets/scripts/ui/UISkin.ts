import { Node, Sprite, SpriteFrame, UITransform, Graphics, Color, resources } from 'cc';
import { M2_UI_SPRITE, UISkinKey } from '../view/ArtPaths';

const requested = new WeakMap<Sprite, UISkinKey>();
const sliced = new Set<UISkinKey>([
  'special_shop_panel', 'special_shop_card', 'special_shop_button',
  'panel_ink', 'panel_side', 'panel_dock', 'panel_modal', 'tooltip_panel',
  'btn_primary', 'btn_secondary', 'btn_disabled', 'btn_danger',
  'stage_track_panel',
]);

/** Flat shop surfaces: solid color and a single thin outline, without texture lighting. */
export function setFlatShopStyle(node: Node, kind: 'panel' | 'card' | 'button', enabled = true): void {
  const skin = node.getChildByName('skin');
  if (skin) {
    const sprite = skin.getComponent(Sprite);
    if (sprite) requested.delete(sprite);
    skin.active = false;
  }
  const { width, height } = node.getComponent(UITransform)!.contentSize;
  const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
  const fills = { panel: new Color(16, 31, 40), card: new Color(25, 45, 54), button: new Color(45, 99, 96) };
  graphics.clear();
  graphics.fillColor = enabled ? fills[kind] : new Color(32, 47, 55);
  graphics.strokeColor = kind === 'button' && enabled ? new Color(94, 153, 145) : new Color(65, 87, 96);
  graphics.lineWidth = 1;
  graphics.roundRect(-width / 2 + .5, -height / 2 + .5, width - 1, height - 1, 4);
  graphics.fill(); graphics.stroke();
}

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

/** The supplied badges are left aligned in a 60x20 image; center the visible stars. */
export function setStarBadge(node: Node, star: number): void {
  const rank = Math.max(1, Math.min(3, Math.round(star)));
  const key: UISkinKey = rank === 3 ? 'star_badge_3' : rank === 2 ? 'star_badge_2' : 'star_badge_1';
  const sprite = setUISkin(node, key);
  const width = node.getComponent(UITransform)!.contentSize.width;
  sprite.node.setPosition((3 - rank) * width / 6, 0, 0);
}
