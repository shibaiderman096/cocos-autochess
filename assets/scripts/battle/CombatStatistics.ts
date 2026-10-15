import { BattleEvent, CombatStatRow } from './types';

/** A separate event cursor keeps statistics independent of replay and formation rebuilds. */
export class CombatStatistics {
  private rows = new Map<number, CombatStatRow>();
  private cursor = 0;

  begin(units: Array<{ id: number; side: 0 | 1; star: number; cfg: { name: string } }>): void {
    this.cursor = 0;
    this.rows.clear();
    for (const u of units) this.rows.set(u.id, {
      id: u.id, name: u.cfg.name, side: u.side, star: u.star, damage: 0, taken: 0, healing: 0,
      damageByType: { physical: 0, magic: 0, true: 0 }, takenByType: { physical: 0, magic: 0, true: 0 },
    });
  }

  consume(events: BattleEvent[]): boolean {
    let changed = false;
    while (this.cursor < events.length) {
      const event = events[this.cursor++];
      if (event.t === 'hit') {
        const source = this.rows.get(event.source), target = this.rows.get(event.id);
        if (source) { source.damage += event.actualDamage; source.damageByType[event.dmgType] += event.actualDamage; }
        if (target) { target.taken += event.actualDamage; target.takenByType[event.dmgType] += event.actualDamage; }
        changed = true;
      } else if (event.t === 'heal') {
        const source = this.rows.get(event.source);
        if (source) source.healing += event.amount;
        changed = true;
      }
    }
    return changed;
  }

  snapshot(): CombatStatRow[] {
    return [...this.rows.values()].sort((a, b) => a.side - b.side || b.damage - a.damage || a.id - b.id)
      .map(row => ({ ...row, damageByType: { ...row.damageByType }, takenByType: { ...row.takenByType } }));
  }
}
