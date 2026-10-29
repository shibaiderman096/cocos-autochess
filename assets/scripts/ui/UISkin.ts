import { Node, Sprite, SpriteFrame, UITransform, Graphics, resources, Label, Color } from 'cc';
import { M2_UI_SPRITE, UISkinKey } from '../view/ArtPaths';

const requested = new WeakMap<Sprite, UISkinKey>();
const sliced = new Set<UISkinKey>([
  'panel_ink', 'panel_side', 'panel_dock', 'panel_modal', 'tooltip_panel',
  'btn_primary', 'btn_secondary', 'btn_disabled', 'btn_danger',
  'stage_track_panel',
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

/** The supplied badges are left aligned in a 60x20 image; center the visible stars. */
export function setStarBadge(node: Node, star: number): void {
  let four=node.getChildByName('fourStars');
  if(star>=4){
    if(!four){four=new Node('fourStars');node.addChild(four);four.addComponent(UITransform).setContentSize(86,24);
      const label=four.addComponent(Label);label.string='★★★★';label.fontSize=18;label.lineHeight=24;label.color=new Color(255,208,99);}
    four.active=true;const skin=node.getChildByName('skin');if(skin)skin.active=false;return;
  }
  if(four)four.active=false;
  const rank = Math.max(1, Math.min(3, Math.round(star)));
  const key: UISkinKey = rank === 3 ? 'star_badge_3' : rank === 2 ? 'star_badge_2' : 'star_badge_1';
  const sprite = setUISkin(node, key);
  sprite.node.active=true;
  const width = node.getComponent(UITransform)!.contentSize.width;
  sprite.node.setPosition((3 - rank) * width / 6, 0, 0);
}
