/**
 * 美术资源路径映射。
 * art/…       = M1 基础素材（units/tiles/ui/fx）
 * ui2/sliced/ = UI 概念图集裁切组件（M2）
 */

// ─── M1 基础 ───
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

// ─── M2 UI 组件（ui2 概念图集裁切） ───
const U = (n: string) => `art/ui2/sliced/${n}/spriteFrame`;

export const UI2 = {
  // 按钮
  btnFight:    U('btn_fight'),
  btnRefresh:  U('btn_refresh'),
  btnBuy:      U('btn_buy'),
  btnSell:     U('btn_sell'),
  btnCancel:   U('btn_cancel'),
  btnShopRefresh: U('btn_shop_refresh'),

  // 面板
  panelEconomy: U('panel_economy'),
  panelLevel:   U('panel_level'),
  panelResult:  U('panel_result'),
  panelWarn:    U('panel_warn'),
  topBar:       U('top_bar'),
  expBarBg:     U('expbar_bg'),

  // 商店卡（按费用 1-5）
  shopCard1: U('shop_card1'),
  shopCard2: U('shop_card2'),
  shopCard3: U('shop_card3'),
  shopCard4: U('shop_card4'),
  shopCard5: U('shop_card5'),

  // 备战席
  benchSlot:    U('bench_slot'),
  benchSlotOcc: U('bench_slot_occ'),

  // 六边格子状态
  hexPlaceable: U('hex_placeable'),
  hexOwn:       U('hex_own'),
  hexEnemy:     U('hex_enemy'),
  hexBlocked:   U('hex_blocked'),
  hexSelected:  U('hex_selected'),

  // 图标
  costIcon1: U('cost_icon_1'),
  costIcon2: U('cost_icon_2'),
  costIcon3: U('cost_icon_3'),
  costIcon4: U('cost_icon_4'),
  costIcon5: U('cost_icon_5'),
  iconCoin:  U('icon_coin'),
  iconExp:   U('icon_exp'),
  iconStarGold: U('icon_star_gold'),
  iconStarGray: U('icon_star_gray'),
};

/** 按费用取商店卡图 */
export function shopCardByCost(cost: number): string {
  return (UI2 as unknown as Record<string, string>)[`shopCard${Math.min(5, Math.max(1, cost))}`] ?? UI2.shopCard1;
}

export function unitSpriteKey(cfgId: string, side: 0 | 1): string {
  const suffix = side === 0 ? 'ally' : 'enemy';
  return `${cfgId}_${suffix}`;
}
