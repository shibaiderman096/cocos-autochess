import type { BattleEvent } from './types';
import type { Unit } from './Unit';

/** Single health/shield settlement for every healing source; never rescues lethal HP. */
export function applyHealing(source: Unit, target: Unit, raw: number, tick: number, events: BattleEvent[]): number {
  if (!target.alive || target.hp <= 0 || !Number.isFinite(raw) || raw <= 0) return 0;
  const total = Math.round(raw);
  const amount = Math.min(Math.max(0, target.cfg.hp - target.hp), total);
  if (amount > 0) {
    target.hp += amount;
    events.push({ t: 'heal', tick, id: target.id, source: source.id, amount, hp: target.hp });
  }
  const shield = Math.round((total - amount) * (target.bloodfiend?.overhealShieldRatio ?? 0));
  if (shield > 0) {
    target.shield += shield;
    events.push({ t: 'shield', tick, id: target.id, source: source.id, amount: shield, shield: target.shield });
  }
  return amount;
}
