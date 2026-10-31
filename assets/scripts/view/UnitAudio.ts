import type { UnitConfigData } from '../core/ConfigManager';
import type { SoundId } from './GameAudio';

type AudioUnit = Partial<Pick<UnitConfigData, 'id' | 'artId' | 'range' | 'damageType' | 'basicAttackFx' | 'skillId'>>;

/** Sound identity belongs to presentation; shared art does not determine a unit's weapon. */
const ATTACKS: Record<string, SoundId> = {
  star_card_magician:'ranged_magic',
  blueflame_soul_knight:'heavy',
  thornchain_succubus: 'chain', raven_succubus: 'claw', crimson_gunslinger: 'ranged_mechanical',
  infernal_axe_guard: 'sword', redhorn_imp: 'claw', hellflame_hound: 'bite', saien: 'heavy',
  star_ring_sage: 'ranged_magic', hushrope_ranger: 'ranged_arrow', sandsea_navigator: 'sword',
  wayward_alchemist: 'ranged_magic', windlance_huntress: 'ranged_arrow', starlamp_guide: 'heavy',
  startrail_fox: 'claw', gravity_executor: 'heavy', nebula_weaver: 'ranged_magic', xiya: 'ranged_arrow',
  milu: 'claw', star_armor_guard: 'heavy', atlas: 'ranged_mechanical', furnace_executioner: 'mechanical_melee',
  ripsaw_spider: 'claw', turbo_fist_tiger: 'mechanical_melee', arc_repairer: 'ranged_mechanical',
  rail_hunter_07: 'ranged_mechanical', bao_zero: 'mechanical_melee', abyss_iron_guard: 'heavy',
  blackfeather_hunter: 'ranged_arrow', nightmare_lamplighter: 'heavy', ghostflame_blade: 'sword',
  eclipse_crossbow: 'ranged_arrow', nether_lantern_witch: 'ranged_magic', blackstar_warlock: 'ranged_magic',
  voidscar_reaver: 'sword', helion: 'sword', saiph: 'ranged_arrow', kaeru: 'sword', phinia: 'sword',
  aurelia: 'ranged_arrow', celine: 'ranged_magic', oris: 'ranged_magic', crimson_riftclaw: 'claw',
  bloodline_earl: 'ranged_magic', crimson_devourer: 'bite', scarlet_enchantress: 'ranged_magic',
  crimson_demon_knight: 'sword',
};

const SKILLS: Record<string, SoundId> = {
  star_card_show:'cast_stars',
  soul_realm:'cast_drain',
  thornchain_pull: 'chain', raven_soul_theft: 'cast_drain', infernal_gunfire: 'ranged_mechanical',
  infernal_axe_spin: 'sword', redhorn_fervor: 'roar', hellhound_breath: 'cast_fire',
  abyss_verdict: 'cast_smash', infernal_cataclysm: 'cast_fire', runic_arcana: 'cast_rune',
  rope_shadow_hunt: 'chain', sand_compass: 'cast_smash', wayward_corrosion: 'cast_corrosion',
  windward_hunt: 'ranged_arrow', lone_lantern_guard: 'shield', startrail_inspiration: 'cast_blessing',
  crimson_upheaval: 'cast_smash', bloodline_siphon: 'cast_drain', gravity_collapse: 'cast_gravity',
  nebula_tide: 'cast_stars', moon_triple_arrow: 'ranged_arrow', milu_star_leap: 'cast_stars',
  stellar_bulwark: 'shield', sky_annihilation: 'cast_mechanical', furnace_overload: 'cast_fire',
  rending_hunt: 'claw', turbo_hunt: 'mechanical_melee', repair_protocol: 'cast_blessing',
  rail_execution: 'rail', hydraulic_bulwark: 'shield', abyss_bulwark: 'shield',
  nightfeather_pierce: 'ranged_arrow', nightmare_domain: 'cast_shadow', ghostflame_combo: 'cast_fire',
  eclipse_execution: 'ranged_arrow', hundred_nether_lanterns: 'cast_shadow', blackstar_annihilation: 'cast_gravity',
  voidscar_transit: 'teleport', sunrise_bulwark: 'shield', dawn_feather_arrows: 'ranged_arrow',
  lightchaser_hunt: 'sword', ember_sacred_blade: 'cast_fire', sunpiercer_lance: 'ranged_arrow',
  solar_prayer: 'cast_blessing', celestial_judgment: 'cast_sunlight', monster_blast: 'cast_rune',
  frostblood_roar: 'cast_ice', scarlet_aid_dance: 'cast_blessing', blood_sovereignty: 'roar',
};

export function unitAttackSound(unit?: AudioUnit, art?: string): SoundId {
  if (unit?.id && ATTACKS[unit.id]) return ATTACKS[unit.id];
  if ((unit?.range ?? 1) <= 1) return 'melee';
  if (art?.includes('/mechanical/')) return 'ranged_mechanical';
  if (unit?.basicAttackFx === 'arrow') return 'ranged_arrow';
  return unit?.damageType === 'magic' ? 'ranged_magic' : 'ranged';
}

export function unitCastSound(skillId?: string, art?: string): SoundId {
  if (skillId && SKILLS[skillId]) return SKILLS[skillId];
  return art?.includes('/shadow/') ? 'cast_shadow' : art?.includes('/sunlight/') ? 'cast_sunlight'
    : art?.includes('/astral/') ? 'cast_astral' : art?.includes('/mechanical/') ? 'cast_mechanical' : 'cast';
}
