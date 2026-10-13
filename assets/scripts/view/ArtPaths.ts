/**
 * 美术资源路径映射（M1 占位 → 正式素材）。
 * 路径相对于 assets/，Cocos resources.load 用相对 resources 的路径（去掉 resources 前缀）。
 * 素材放 assets/art/（不在 resources 下），因此 Bundle 加载或编辑器拖拽 SpriteFrame 即可。
 */
export const UNIT_SPRITE: Record<string, string> = {
  'warrior_ally': 'art/units/warrior_ally/spriteFrame',
  'archer_ally':  'art/units/archer_ally/spriteFrame',
  'mage_ally':    'art/units/mage_ally/spriteFrame',
  'warrior_enemy': 'art/units/warrior_enemy/spriteFrame',
  'archer_enemy':  'art/units/archer_enemy/spriteFrame',
  'mage_enemy':    'art/units/mage_enemy/spriteFrame',
};

export const TILE_SPRITE = {
  light:      'art/tiles/tile_light/spriteFrame',
  dark:       'art/tiles/tile_dark/spriteFrame',
  zoneAlly:   'art/tiles/tile_zone_ally/spriteFrame',
  zoneEnemy:  'art/tiles/tile_zone_enemy/spriteFrame',
  move:       'art/tiles/tile_move/spriteFrame',
  select:     'art/tiles/tile_select/spriteFrame',
};

export const UI_SPRITE = {
  barBg:        'art/ui/bar_bg/spriteFrame',
  hpFillAlly:   'art/ui/hp_fill_ally/spriteFrame',
  hpFillEnemy:  'art/ui/hp_fill_enemy/spriteFrame',
  manaFill:     'art/ui/mana_fill/spriteFrame',
  iconGold:     'art/ui/icon_gold/spriteFrame',
  iconStar:     'art/ui/icon_star/spriteFrame',
  iconHeart:    'art/ui/icon_heart/spriteFrame',
  btnPrimary:   'art/ui/btn_primary/spriteFrame',
  btnSecondary: 'art/ui/btn_secondary/spriteFrame',
  panel:        'art/ui/panel/spriteFrame',
};

export const FX_SPRITE = {
  arrow:    'art/fx/fx_arrow/spriteFrame',
  fireball: 'art/fx/fx_fireball/spriteFrame',
  hit:      'art/fx/fx_hit/spriteFrame',
  ring:     'art/fx/fx_ring/spriteFrame',
  slash:    'art/fx/fx_slash/spriteFrame',
};

/** cfgId + side → 棋子贴图 key */
export function unitSpriteKey(cfgId: string, side: 0 | 1): string {
  const suffix = side === 0 ? 'ally' : 'enemy';
  return `${cfgId}_${suffix}`;
}
