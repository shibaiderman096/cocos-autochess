/** Presentation-only identities. These values never enter saves or combat configuration. */
export type BasicAttackAtlas = 'basicDemon' | 'basicArcane' | 'basicMechanical' | 'basicBlood' | 'starCards';
// Authored transparent gutters in the 1536px source sheets; uniform sixths cut a few feathers/sparks.
export const BASIC_ATTACK_ROW_EDGES: Partial<Record<BasicAttackAtlas, readonly number[]>> = {
  basicDemon: [0, 263, 519, 768, 1024, 1280, 1536],
  basicArcane: [0, 275, 538, 797, 1024, 1288, 1536],
};
export interface BasicAttackLook {
  atlas: BasicAttackAtlas;
  row: number;
  motion: 'impact' | 'projectile' | 'lash';
  width: number;
  height: number;
  seconds: number;
}

const look = (atlas: BasicAttackAtlas, row: number, motion: BasicAttackLook['motion'],
  width: number, height: number, seconds = .3): BasicAttackLook => ({atlas, row, motion, width, height, seconds});

// Each row was drawn for this unit's weapon, rather than inferred from damage type or faction.
export const BASIC_ATTACK_LOOKS: Readonly<Record<string, BasicAttackLook>> = {
  star_card_magician: look('starCards',0,'projectile',1.2,.7),
  thornchain_succubus: look('basicDemon', 0, 'lash', 1.5, .8, .35),
  raven_succubus: look('basicDemon', 1, 'impact', 1.35, 1),
  infernal_axe_guard: look('basicDemon', 2, 'impact', 1.55, 1.15, .35),
  redhorn_imp: look('basicDemon', 3, 'impact', 1.1, .85),
  hellflame_hound: look('basicDemon', 4, 'impact', 1.3, 1),
  saien: look('basicDemon', 5, 'impact', 1.7, 1.2, .35),
  sandsea_navigator: look('basicArcane', 0, 'impact', 1.35, .95),
  starlamp_guide: look('basicArcane', 1, 'impact', 1.3, 1),
  gravity_executor: look('basicArcane', 2, 'impact', 1.45, 1.15, .35),
  milu: look('basicArcane', 3, 'impact', 1.2, .85),
  star_armor_guard: look('basicArcane', 4, 'impact', 1.35, 1),
  arc_repairer: look('basicArcane', 5, 'projectile', 1, .55),
  atlas: look('basicMechanical', 0, 'projectile', 1.1, .55, .35),
  furnace_executioner: look('basicMechanical', 1, 'impact', 1.55, 1.05, .35),
  ripsaw_spider: look('basicMechanical', 2, 'impact', 1.35, 1),
  turbo_fist_tiger: look('basicMechanical', 3, 'impact', 1.3, 1),
  rail_hunter_07: look('basicMechanical', 4, 'projectile', 1.3, .4, .25),
  bao_zero: look('basicMechanical', 5, 'impact', 1.45, 1.05, .35),
  crimson_riftclaw: look('basicBlood', 0, 'impact', 1.3, 1),
  bloodline_earl: look('basicBlood', 1, 'projectile', .95, .75, .35),
  crimson_devourer: look('basicBlood', 2, 'impact', 1.5, 1.15, .35),
  crimson_demon_knight: look('basicBlood', 3, 'impact', 1.55, 1.05),
};

export function basicAttackLook(id: string | undefined): BasicAttackLook | undefined {
  return id && Object.prototype.hasOwnProperty.call(BASIC_ATTACK_LOOKS, id) ? BASIC_ATTACK_LOOKS[id] : undefined;
}
