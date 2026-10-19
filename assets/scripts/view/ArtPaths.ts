/** Runtime resource paths, relative to assets/resources. */
const ENCOUNTER_SKIN = {
  normal: 'stage_node_normal', monster: 'stage_node_monster', elite: 'stage_node_elite',
  specialShop: 'stage_node_shop', boss: 'stage_node_boss',
} as const;
export const ENCOUNTER_SPRITE: Record<string, string> = Object.fromEntries(
  Object.entries(ENCOUNTER_SKIN).map(([kind, name]) => [kind, `art/ui_m2/${name}/spriteFrame`]),
);
/** Each configured unit has its own asset. Faction rings and bars identify sides. */
export const UNIT_ART: Record<string, string> = {
  helion: 'art/units/sunlight/helion/spriteFrame',
  saiph: 'art/units/sunlight/saiph/spriteFrame',
  bronda: 'art/units/sunlight/bronda/spriteFrame',
  kaeru: 'art/units/sunlight/kaeru/spriteFrame',
  leon: 'art/units/sunlight/leon/spriteFrame',
  phinia: 'art/units/sunlight/phinia/spriteFrame',
  aurelia: 'art/units/sunlight/aurelia/spriteFrame',
  celine: 'art/units/sunlight/celine/spriteFrame',
  oris: 'art/units/sunlight/oris/spriteFrame',
  seraphiel: 'art/units/sunlight/seraphiel/spriteFrame',
  abyss_iron_guard: 'art/units/shadow/abyss_iron_guard/spriteFrame',
  blackfeather_hunter: 'art/units/shadow/blackfeather_hunter/spriteFrame',
  nightmare_lamplighter: 'art/units/shadow/nightmare_lamplighter/spriteFrame',
  shadow_seam_assassin: 'art/units/shadow/shadow_seam_assassin/spriteFrame',
  soulcleaver_general: 'art/units/shadow/soulcleaver_general/spriteFrame',
  ghostflame_blade: 'art/units/shadow/ghostflame_blade/spriteFrame',
  eclipse_crossbow: 'art/units/shadow/eclipse_crossbow/spriteFrame',
  nether_lantern_witch: 'art/units/shadow/nether_lantern_witch/spriteFrame',
  blackstar_warlock: 'art/units/shadow/blackstar_warlock/spriteFrame',
  voidscar_reaver: 'art/units/shadow/voidscar_reaver/spriteFrame',
  red_guard: 'art/units/warrior_enemy/spriteFrame',
  red_archer: 'art/units/archer_enemy/spriteFrame',
  red_mage: 'art/units/mage_enemy/spriteFrame',
  ender_dragon: 'art/units/monsters/ender_dragon/spriteFrame',
  zombie: 'art/units/monsters/zombie/spriteFrame',
  skeleton_archer: 'art/units/monsters/skeleton_archer/spriteFrame',
  silverfish: 'art/units/monsters/silverfish/spriteFrame',
  red_eye_spider: 'art/units/monsters/red_eye_spider/spriteFrame',
};

export const UNIT_SPRITE: Record<string, string> = Object.fromEntries(
  Object.entries(UNIT_ART).flatMap(([id, path]) => [
    [`${id}_ally`, path], [`${id}_enemy`, path],
  ]),
);

/** Head portraits reuse the original artwork through runtime atlas regions. */
export const UNIT_PORTRAIT: Record<string, string> = Object.fromEntries(Object.entries({
  helion:'290,100,400,400', saiph:'270,210,360,360', bronda:'290,260,360,360', kaeru:'480,140,360,360', leon:'280,100,400,400',
  phinia:'450,70,340,340', aurelia:'260,140,360,360', celine:'350,140,360,360', oris:'360,170,360,360', seraphiel:'340,180,360,360',
  abyss_iron_guard: '360,40,400,400', blackfeather_hunter: '450,160,350,350',
  nightmare_lamplighter: '410,20,400,400', shadow_seam_assassin: '610,340,350,350',
  soulcleaver_general: '580,40,400,400', ghostflame_blade: '450,20,420,420',
  eclipse_crossbow: '270,100,350,350', nether_lantern_witch: '370,100,360,360',
  blackstar_warlock: '380,210,350,350', voidscar_reaver: '450,210,400,400',
}).map(([id, rect]) => [id, `${UNIT_ART[id]}#rawrect,${rect}`]));

export const UI_SPRITE = {
  barBg:        'art/ui/bar_bg/spriteFrame',
  hpFillAlly:   'art/ui/hp_fill_ally/spriteFrame',
  hpFillEnemy:  'art/ui/hp_fill_enemy/spriteFrame',
  manaFill:     'art/ui/mana_fill/spriteFrame',
  shieldFill:   'art/ui/shield_fill/spriteFrame',
  iconGold:     'art/ui/icon_gold/spriteFrame',
};

export const FX_SPRITE = {
  sunlightBarrier: 'art/fx/sunlight_barrier/spriteFrame',
  sunlightArrow: 'art/fx/sunlight_arrow/spriteFrame',
  sunlightSlash: 'art/fx/sunlight_slash/spriteFrame',
  sunlightSigil: 'art/fx/sunlight_sigil/spriteFrame',
  sunlightJudgment: 'art/fx/sunlight_judgment/spriteFrame',
  sunlightField: 'art/fx/sunlight_field/spriteFrame',
  shadowBarrier: 'art/fx/shadow_barrier_v2/spriteFrame',
  shadowSlash: 'art/fx/shadow_slash_v2/spriteFrame',
  shadowWisp: 'art/fx/shadow_corruption_wisp/spriteFrame',
  shadowLantern: 'art/fx/shadow_lantern_v2/spriteFrame',
  shadowProjectile: 'art/fx/shadow_projectile/spriteFrame',
  shadowBoardFog: 'art/fx/shadow_board_fog/spriteFrame',
  shadowCorruption: 'art/fx/shadow_corruption/spriteFrame',
  dragonBreath: 'art/fx/dragon_breath/spriteFrame',
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

/** Full-color, text-free objects placed directly on the board. */
export const BOARD_ENCOUNTER_SPRITE = {
  shop: 'art/ui/board_shop/spriteFrame',
  chest: 'art/ui/board_boss_chest/spriteFrame',
} as const;

/** Current M2 interface textures. */
export const M2_UI_SPRITE = {
  attr_phys_atk: 'art/ui_m2/attr_phys_atk/spriteFrame',
  attr_armor: 'art/ui_m2/attr_armor/spriteFrame',
  attr_mr: 'art/ui_m2/attr_mr/spriteFrame',
  attr_aspd: 'art/ui_m2/attr_aspd/spriteFrame',
  attr_range: 'art/ui_m2/attr_range/spriteFrame',
  attr_phys_bonus: 'art/ui_m2/attr_phys_bonus/spriteFrame',
  attr_spell_bonus: 'art/ui_m2/attr_spell_bonus/spriteFrame',
  attr_crit: 'art/ui_m2/attr_crit/spriteFrame',
  attr_lifesteal: 'art/ui_m2/attr_lifesteal/spriteFrame',
  attr_dmg_amp: 'art/ui_m2/attr_dmg_amp/spriteFrame',
  attr_dmg_reduce: 'art/ui_m2/attr_dmg_reduce/spriteFrame',
  arena_board: 'art/arena/floating_board/spriteFrame',
  arena_sky: 'art/arena/sky_background/spriteFrame',
  panel_ink: 'art/ui_m2/panel_ink/spriteFrame',
  panel_side: 'art/ui_m2/panel_side/spriteFrame',
  panel_dock: 'art/ui_m2/panel_dock/spriteFrame',
  panel_modal: 'art/ui_m2/panel_modal/spriteFrame',
  btn_primary: 'art/ui_m2/btn_primary/spriteFrame',
  btn_secondary: 'art/ui_m2/btn_secondary/spriteFrame',
  btn_disabled: 'art/ui_m2/btn_disabled/spriteFrame',
  btn_danger: 'art/ui_m2/btn_danger/spriteFrame',
  icon_refresh: 'art/ui_m2/icon_refresh/spriteFrame',
  icon_exp: 'art/ui_m2/icon_exp/spriteFrame',
  icon_sell: 'art/ui_m2/icon_sell/spriteFrame',
  icon_swords: 'art/ui_m2/icon_swords/spriteFrame',
  icon_speed: 'art/ui_m2/icon_speed/spriteFrame',
  icon_close: 'art/ui_m2/icon_close/spriteFrame',
  icon_life: 'art/ui_m2/icon_life/spriteFrame',
  stat_hp: 'art/ui_m2/stat_hp/spriteFrame',
  stat_mana: 'art/ui_m2/stat_mana/spriteFrame',
  card_cost1: 'art/ui_m2/card_cost1/spriteFrame',
  card_cost2: 'art/ui_m2/card_cost2/spriteFrame',
  card_cost3: 'art/ui_m2/card_cost3/spriteFrame',
  card_cost4: 'art/ui_m2/card_cost4/spriteFrame',
  card_cost5: 'art/ui_m2/card_cost5/spriteFrame',
  card_empty: 'art/ui_m2/card_empty/spriteFrame',
  card_lock_overlay: 'art/ui_m2/card_lock_overlay/spriteFrame',
  btn_lock_off: 'art/ui_m2/btn_lock_off/spriteFrame',
  btn_lock_on: 'art/ui_m2/btn_lock_on/spriteFrame',
  stage_node_normal: 'art/ui_m2/stage_node_normal/spriteFrame',
  stage_node_normal_locked: 'art/ui_m2/stage_node_normal_locked/spriteFrame',
  stage_node_monster: 'art/ui_m2/stage_node_monster/spriteFrame',
  stage_node_monster_locked: 'art/ui_m2/stage_node_monster_locked/spriteFrame',
  stage_node_elite: 'art/ui_m2/stage_node_elite/spriteFrame',
  stage_node_elite_locked: 'art/ui_m2/stage_node_elite_locked/spriteFrame',
  stage_node_shop: 'art/ui_m2/stage_node_shop/spriteFrame',
  stage_node_shop_locked: 'art/ui_m2/stage_node_shop_locked/spriteFrame',
  stage_node_boss: 'art/ui_m2/stage_node_boss/spriteFrame',
  stage_node_boss_locked: 'art/ui_m2/stage_node_boss_locked/spriteFrame',
  stage_node_ring: 'art/ui_m2/stage_node_ring/spriteFrame',
  stage_node_ring_boss: 'art/ui_m2/stage_node_ring_boss/spriteFrame',
  stage_link_done: 'art/ui_m2/stage_link_done/spriteFrame',
  stage_link_current: 'art/ui_m2/stage_link_current/spriteFrame',
  stage_link_todo: 'art/ui_m2/stage_link_todo/spriteFrame',
  stage_track_panel: 'art/ui_m2/stage_track_panel/spriteFrame',
  badge_level: 'art/ui_m2/badge_level/spriteFrame',
  exp_bar_bg: 'art/ui_m2/exp_bar_bg/spriteFrame',
  exp_bar_fill: 'art/ui_m2/exp_bar_fill/spriteFrame',
  star_badge_1: 'art/ui_m2/star_badge_1/spriteFrame',
  star_badge_2: 'art/ui_m2/star_badge_2/spriteFrame',
  star_badge_3: 'art/ui_m2/star_badge_3/spriteFrame',
  divider: 'art/ui_m2/divider/spriteFrame',
  sell_zone: 'art/ui_m2/sell_zone/spriteFrame',
  sell_zone_hot: 'art/ui_m2/sell_zone_hot/spriteFrame',
  tooltip_panel: 'art/ui_m2/tooltip_panel/spriteFrame',
} as const;
export type UISkinKey = keyof typeof M2_UI_SPRITE;
