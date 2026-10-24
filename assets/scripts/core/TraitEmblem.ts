import { resolveTraits } from '../battle/Traits';
import type { ConfigManager } from './ConfigManager';
import type { OwnedUnit } from './OwnedUnits';
import type { Rng } from './Rng';

export interface PendingTraitChoice {
  uid: number;
  slot: number;
  equipmentId: string;
  candidates: string[];
}

/** Active traits lead by deployed member count; ties and remaining options use seeded randomness. */
export function traitEmblemChoices(cfg: ConfigManager, units: readonly OwnedUnit[], uid: number, rng: Rng): string[] {
  const bearer = units.find(unit => unit.uid === uid);
  if (!bearer) return [];
  const roster = cfg.allUnits();
  const enriched = (unit: OwnedUnit) => ({ id: unit.unitId,
    grantedTraitIds: cfg.getEquipment(unit.equipment).flatMap(item => item.grantedTraitId ? [item.grantedTraitId] : []) });
  const self = enriched(bearer);
  const states = resolveTraits(cfg.battle.traits ?? [], units.filter(unit => unit.location === 'board').map(enriched), roster);
  const eligible = states.filter(state => state.config.members.length > 0 && !state.config.members.includes(bearer.unitId)
    && !self.grantedTraitIds.includes(state.config.id));
  const shuffled = eligible.map(state => ({ state, tie: rng.next() }));
  shuffled.sort((a, b) => Number(!!b.state.active) - Number(!!a.state.active)
    || (a.state.active && b.state.active ? b.state.count - a.state.count : 0) || a.tie - b.tie);
  return shuffled.slice(0, 4).map(({ state }) => state.config.id);
}
