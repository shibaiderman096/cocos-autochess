/** Runtime resource paths, relative to assets/resources. */
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

/** M2 interface textures; SVG originals live in art-source/ui_m2. */
export const M2_UI_SPRITE = {
  panel_ink: 'art/ui_m2/panel_ink/spriteFrame',
  panel_side: 'art/ui_m2/panel_side/spriteFrame',
  panel_dock: 'art/ui_m2/panel_dock/spriteFrame',
  panel_modal: 'art/ui_m2/panel_modal/spriteFrame',
  btn_primary: 'art/ui_m2/btn_primary/spriteFrame',
  btn_secondary: 'art/ui_m2/btn_secondary/spriteFrame',
  btn_disabled: 'art/ui_m2/btn_disabled/spriteFrame',
  btn_danger: 'art/ui_m2/btn_danger/spriteFrame',
  icon_lock_closed: 'art/ui_m2/icon_lock_closed/spriteFrame',
  icon_lock_open: 'art/ui_m2/icon_lock_open/spriteFrame',
  icon_refresh: 'art/ui_m2/icon_refresh/spriteFrame',
  icon_exp: 'art/ui_m2/icon_exp/spriteFrame',
  icon_sell: 'art/ui_m2/icon_sell/spriteFrame',
  icon_info: 'art/ui_m2/icon_info/spriteFrame',
  icon_wave: 'art/ui_m2/icon_wave/spriteFrame',
  icon_swords: 'art/ui_m2/icon_swords/spriteFrame',
  icon_speed: 'art/ui_m2/icon_speed/spriteFrame',
  icon_close: 'art/ui_m2/icon_close/spriteFrame',
  icon_life: 'art/ui_m2/icon_life/spriteFrame',
  stat_hp: 'art/ui_m2/stat_hp/spriteFrame',
  stat_atk: 'art/ui_m2/stat_atk/spriteFrame',
  stat_armor: 'art/ui_m2/stat_armor/spriteFrame',
  stat_range: 'art/ui_m2/stat_range/spriteFrame',
  stat_mana: 'art/ui_m2/stat_mana/spriteFrame',
  stat_aspd: 'art/ui_m2/stat_aspd/spriteFrame',
  card_cost1: 'art/ui_m2/card_cost1/spriteFrame',
  card_cost2: 'art/ui_m2/card_cost2/spriteFrame',
  card_cost3: 'art/ui_m2/card_cost3/spriteFrame',
  card_cost4: 'art/ui_m2/card_cost4/spriteFrame',
  card_cost5: 'art/ui_m2/card_cost5/spriteFrame',
  card_empty: 'art/ui_m2/card_empty/spriteFrame',
  card_lock_overlay: 'art/ui_m2/card_lock_overlay/spriteFrame',
  btn_lock_off: 'art/ui_m2/btn_lock_off/spriteFrame',
  btn_lock_on: 'art/ui_m2/btn_lock_on/spriteFrame',
  life_full: 'art/ui_m2/life_full/spriteFrame',
  life_empty: 'art/ui_m2/life_empty/spriteFrame',
  wave_done: 'art/ui_m2/wave_done/spriteFrame',
  wave_current: 'art/ui_m2/wave_current/spriteFrame',
  wave_todo: 'art/ui_m2/wave_todo/spriteFrame',
  wave_boss: 'art/ui_m2/wave_boss/spriteFrame',
  badge_level: 'art/ui_m2/badge_level/spriteFrame',
  exp_bar_bg: 'art/ui_m2/exp_bar_bg/spriteFrame',
  exp_bar_fill: 'art/ui_m2/exp_bar_fill/spriteFrame',
  star_badge_1: 'art/ui_m2/star_badge_1/spriteFrame',
  star_badge_2: 'art/ui_m2/star_badge_2/spriteFrame',
  star_badge_3: 'art/ui_m2/star_badge_3/spriteFrame',
  divider: 'art/ui_m2/divider/spriteFrame',
  sell_zone: 'art/ui_m2/sell_zone/spriteFrame',
  sell_zone_hot: 'art/ui_m2/sell_zone_hot/spriteFrame',
  bench_slot: 'art/ui_m2/bench_slot/spriteFrame',
  bench_slot_hover: 'art/ui_m2/bench_slot_hover/spriteFrame',
  tooltip_panel: 'art/ui_m2/tooltip_panel/spriteFrame',
  tooltip_tail: 'art/ui_m2/tooltip_tail/spriteFrame',
  banner_victory: 'art/ui_m2/banner_victory/spriteFrame',
  banner_defeat: 'art/ui_m2/banner_defeat/spriteFrame',
} as const;
export type UISkinKey = keyof typeof M2_UI_SPRITE;
