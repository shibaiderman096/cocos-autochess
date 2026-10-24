import type { TraitConfigData, TraitBreakpoint, Side } from './types';

/** The two home rows nearest the opposing army, mirrored for the enemy side. */
export function isTraitFrontRow(side: Side, y: number, boardHeight: number, ownRows: number): boolean {
  const first = side === 0 ? ownRows - 2 : boardHeight - ownRows;
  return y >= first && y < first + 2;
}

export interface TraitState {
  config: TraitConfigData;
  count: number;
  memberIds: string[];
  active: TraitBreakpoint | null;
  next: number | null;
}

/** The caller supplies only deployed units from one side. Copies count once. */
export function resolveTraits(configs: readonly TraitConfigData[], deployedIds: readonly (string | { id: string; grantedTraitIds?: readonly string[] })[], roster: readonly { id: string; role?: string; damageType?: 'physical' | 'magic'; classTraitId?: string }[] = []): TraitState[] {
  const deployed = deployedIds.map(unit => typeof unit === 'string' ? { id: unit } : unit);
  return configs.map(original => {
    const selector = original.selector;
    const config = selector ? { ...original, members: Array.from(new Set(roster.filter(unit => unit.classTraitId
      ? unit.classTraitId === original.id : unit.role === selector.role
      && (!selector.damageType || (unit.damageType ?? 'physical') === selector.damageType)).map(unit => unit.id))).sort() } : original;
    const memberIds = Array.from(new Set([...config.members.filter(id => deployed.some(unit => unit.id === id)),
      ...deployed.filter(unit => unit.grantedTraitIds?.includes(config.id)).map(unit => unit.id)]));
    const count = memberIds.length;
    const active = config.breakpoints.filter(tier => count >= tier.count).slice(-1)[0] ?? null;
    return { config, count, memberIds, active, next: config.breakpoints.find(tier => count < tier.count)?.count ?? null };
  }).sort((a, b) => Number(!!b.active) - Number(!!a.active) || b.count - a.count || a.config.id.localeCompare(b.config.id));
}

/** Membership is per carrier even when two copies share one roster identity. */
export function isTraitMember(trait: TraitState, unit: { id: string; grantedTraitIds?: readonly string[] }): boolean {
  return trait.config.members.includes(unit.id) || !!unit.grantedTraitIds?.includes(trait.config.id);
}
