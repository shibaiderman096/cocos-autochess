import type { OwnedUnit } from '../core/OwnedUnits';

export interface RewardDelivery {
  unitId: string;
  /** Missing uid means the core retained this copy in reward storage. */
  uid?: number;
}

/** Read actual claim results; never predict rewards, roll RNG, or choose an inventory slot. */
export function rewardDeliveryPlan(rewards: readonly string[], before: readonly OwnedUnit[], after: readonly OwnedUnit[]): RewardDelivery[] {
  const copies = (unit: OwnedUnit): number => 3 ** (unit.star - 1);
  const old = new Map(before.map(unit => [unit.uid, unit]));
  const gain = new Map<string, number>();
  for (const unit of after) gain.set(unit.unitId, (gain.get(unit.unitId) ?? 0) + copies(unit));
  for (const unit of before) gain.set(unit.unitId, (gain.get(unit.unitId) ?? 0) - copies(unit));
  const targets = after.filter(unit => !old.has(unit.uid) || unit.star > old.get(unit.uid)!.star)
    .sort((a, b) => Number(old.has(a.uid)) - Number(old.has(b.uid)) || a.uid - b.uid)
    .map(unit => ({unit, capacity: copies(unit) - (old.has(unit.uid) ? copies(old.get(unit.uid)!) : 0)}));
  return rewards.map(unitId => {
    const target = (gain.get(unitId) ?? 0) > 0 ? targets.find(t => t.unit.unitId === unitId && t.capacity > 0) : undefined;
    if (!target) return {unitId};
    target.capacity--; gain.set(unitId, gain.get(unitId)! - 1);
    return {unitId, uid: target.unit.uid};
  });
}
