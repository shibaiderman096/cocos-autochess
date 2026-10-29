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

export interface TraitCarrier { id: string; grantedTraitIds?: readonly string[]; copyDominantTrait?: boolean; inheritedTraitId?: string; summonOnly?: boolean; }
type TraitRoster = TraitCarrier & { role?: string; damageType?: 'physical' | 'magic'; classTraitId?: string };

function countTraits(configs: readonly TraitConfigData[], deployed: readonly TraitCarrier[], roster: readonly TraitRoster[], bonusTraitId?: string): TraitState[] {
  deployed=deployed.filter(unit=>!(unit.summonOnly??roster.find(entry=>entry.id===unit.id)?.summonOnly));
  roster=roster.filter(unit=>!unit.summonOnly);
  return configs.map(original => {
    const selector = original.selector;
    const config = selector ? { ...original, members: Array.from(new Set(roster.filter(unit => unit.classTraitId
      ? unit.classTraitId === original.id : unit.role === selector.role
      && (!selector.damageType || (unit.damageType ?? 'physical') === selector.damageType)).map(unit => unit.id))).sort() } : original;
    const memberIds = Array.from(new Set([...config.members.filter(id => deployed.some(unit => unit.id === id)),
      ...deployed.filter(unit => unit.grantedTraitIds?.includes(config.id)).map(unit => unit.id)]));
    const count = memberIds.length + (original.id === bonusTraitId && original.breakpoints.some(t=>memberIds.length>=t.count) ? 1 : 0);
    const active = config.breakpoints.filter(tier => count >= tier.count).slice(-1)[0] ?? null;
    return { config, count, memberIds, active, next: config.breakpoints.find(tier => count < tier.count)?.count ?? null };
  });
}

/** Resolve all adopters from the same original lineup; never bootstrap an inactive trait. */
export function resolveTraitCarriers(configs: readonly TraitConfigData[], deployed: readonly TraitCarrier[], roster: readonly TraitRoster[]): TraitCarrier[] {
  const definitions=new Map(roster.map(unit=>[unit.id,unit]));
  return deployed.map(unit=>{
    if(!(unit.copyDominantTrait ?? definitions.get(unit.id)?.copyDominantTrait))return {...unit};
    const others=deployed.filter(other=>other.id!==unit.id);
    const winner=countTraits(configs,others,roster).filter(state=>!state.config.selector&&state.active)
      .sort((a,b)=>b.count-a.count||configs.findIndex(c=>c.id===a.config.id)-configs.findIndex(c=>c.id===b.config.id))[0];
    const granted=(unit.grantedTraitIds??[]).filter(id=>id!==unit.inheritedTraitId);
    return {...unit,inheritedTraitId:winner?.config.id,grantedTraitIds:Array.from(new Set([...granted,...(winner?[winner.config.id]:[])]))};
  });
}

/** The caller supplies only deployed units from one side. Copies count once. */
export function resolveTraits(configs: readonly TraitConfigData[], deployedIds: readonly (string | TraitCarrier)[], roster: readonly TraitRoster[] = [], bonusTraitId?: string): TraitState[] {
  const deployed=resolveTraitCarriers(configs,deployedIds.map(unit=>typeof unit==='string'?{id:unit}:unit),roster);
  return countTraits(configs,deployed,roster,bonusTraitId)
    .sort((a,b)=>Number(!!b.active)-Number(!!a.active)||b.count-a.count||a.config.id.localeCompare(b.config.id));
}

/** Resolve ties from the unmodified active counts; the caller owns a seeded stream. */
export function highestActiveTraits(traits: readonly TraitState[]): TraitState[] {
  const active=traits.filter(t=>t.active), max=Math.max(0,...active.map(t=>t.count));
  return active.filter(t=>t.count===max).sort((a,b)=>a.config.id<b.config.id?-1:a.config.id>b.config.id?1:0);
}

/** Membership is per carrier even when two copies share one roster identity. */
export function isTraitMember(trait: TraitState, unit: { id: string; grantedTraitIds?: readonly string[]; summonOnly?: boolean }): boolean {
  return !unit.summonOnly && (trait.config.members.includes(unit.id) || !!unit.grantedTraitIds?.includes(trait.config.id));
}
