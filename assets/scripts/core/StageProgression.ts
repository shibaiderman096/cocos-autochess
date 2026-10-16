import { ConfigManager } from './ConfigManager';
import { CardPool } from './CardPool';
import { OwnedUnits } from './OwnedUnits';
import { EconomySystem } from './EconomySystem';
import { COST_PRICE, validCost, SHOP_RATES } from './ShopConfig';
import { RunRandomContext } from './RunRandomContext';
import type { WaveConfig } from './RoundFlow';
import type { EquipmentTier } from './EquipmentPolicyTypes';

export interface StageEncounterRules {
  version: 'stage-encounters-v1'; startStage: number;
  monsterStatGrowth: number;
  strongMonster?: { unitId: string; startStage: number; everyStages: number; statGrowth: number };
  monsterReward: { initialValue: number; valuePerStage: number; maxValue: number };
  shop: { slots: number; equipmentPrices: Record<EquipmentTier, number> };
  basicEquipmentIds: string[];
}
export type StageOffer = { kind: 'unit' | 'equipment'; id: string; price: number; bought: boolean };
export type StagePending =
  | { id: string; waveId: number; kind: 'bossChoice'; value: number }
  | { id: string; waveId: number; kind: 'unitBundle'; value: number; units: string[]; deferredValue: number }
  | { id: string; waveId: number; kind: 'equipmentChoice'; candidates: string[] }
  | { id: string; waveId: number; kind: 'specialShop'; offers: StageOffer[] };
export interface StageProgressState {
  lastUnitDrop?: { waveId: number; value: number; units: string[]; deferredValue: number };
  lastRewardWave: number; unitReserve: string[]; unitCredit: number; creditRoll: number; pending?: StagePending;
}
export interface StageChoice { type: 'stageChoice'; rewardId: string; choice: 'units' | 'equipment' | 'claim' | 'buy' | 'continue'; index?: number }
export const freshStageProgress = (): StageProgressState => ({ lastRewardWave: 0, unitReserve: [], unitCredit: 0, creditRoll: 0 });

/** Inventory and rewards only; all randomness uses persisted encounter identities. */
export class StageProgression {
  constructor(readonly rules: StageEncounterRules, readonly state: StageProgressState, private cfg: ConfigManager,
    private pool: CardPool, private owned: OwnedUnits, private economy: EconomySystem, private random: RunRandomContext,
    private benchSlots: number, private tiers: Record<string, EquipmentTier>, private shopLevel: () => number = () => 1) {
    if (rules.version !== 'stage-encounters-v1' || !Number.isSafeInteger(rules.startStage) || rules.startStage < 4 || !Number.isFinite(rules.monsterStatGrowth) || rules.monsterStatGrowth < 0
      || rules.shop.slots !== 5 || rules.basicEquipmentIds.length < 4 || new Set(rules.basicEquipmentIds).size !== rules.basicEquipmentIds.length
      || rules.basicEquipmentIds.some(id => !cfg.getEquipmentReserve([id]).length || !['basic', 'advanced'].includes(tiers[id]))
      || ![rules.monsterReward.initialValue, rules.monsterReward.valuePerStage, rules.monsterReward.maxValue, ...Object.values(rules.shop.equipmentPrices)].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid stage encounter rules');
    if (!state || ![state.lastRewardWave, state.unitCredit, state.creditRoll].every(n => Number.isSafeInteger(n) && n >= 0)
      || !Array.isArray(state.unitReserve) || state.unitReserve.some(id => !cfg.allUnits().some(u => u.id === id))) throw new Error('Invalid stage reward save');
  }
  value(stage: number): number { const r = this.rules.monsterReward; return Math.min(r.maxValue, r.initialValue + (stage - 1) * r.valuePerStage); }
  private id(wave: WaveConfig, kind: string): string { return `${this.rules.version}:${this.random.runSeed}:${wave.id}:${kind}`; }
  private shuffle<T>(items: T[], waveId: number, salt: number): T[] {
    const rng = this.random.stream('reward', waveId, salt);
    for (let i = items.length - 1; i > 0; i--) { const j = rng.int(0, i); [items[i], items[j]] = [items[j], items[i]]; }
    return items;
  }
  /** Bounded change-making preserves exact card value when stocks permit it. */
  private reserveCards(value: number, waveId: number, salt: number): { units: string[]; deferredValue: number } {
    const level = Math.max(1, Math.min(SHOP_RATES.length, Math.floor(this.shopLevel())));
    const rates = SHOP_RATES[level - 1];
    const roster = this.cfg.allUnits().filter(u => rates[validCost(u.cost) - 1] > 0).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const possible = (target: number): boolean => {
      const reachable = Array(target + 1).fill(false); reachable[0] = true;
      for (const u of roster) {
        const price = COST_PRICE[validCost(u.cost)], count = Math.min(this.pool.count(u.id), Math.floor(target / price));
        for (let n = 0; n < count; n++) for (let v = target; v >= price; v--) reachable[v] ||= reachable[v - price];
      }
      return reachable[target];
    };
    let target = value; while (target && !possible(target)) target--;
    const deferredValue = value - target, units: string[] = [], rng = this.random.stream('reward', waveId, salt);
    while (target > 0) {
      const choices = roster.filter(u => {
        const price = COST_PRICE[validCost(u.cost)]; if (price > target || !this.pool.take(u.id)) return false;
        const fits = possible(target - price); this.pool.give(u.id); return fits;
      });
      const costs = [...new Set(choices.map(u => validCost(u.cost)))];
      let roll = rng.next() * costs.reduce((n, cost) => n + rates[cost - 1], 0);
      const cost = costs.find(cost => { roll -= rates[cost - 1]; return roll < 0; }) ?? costs[costs.length - 1];
      const cards = choices.filter(u => validCost(u.cost) === cost);
      const chosen = cards[rng.int(0, cards.length - 1)];
      if (!chosen || !this.pool.take(chosen.id)) throw new Error('Unit reward stock changed');
      units.push(chosen.id); target -= COST_PRICE[validCost(chosen.cost)];
    }
    this.state.unitReserve.push(...units); this.state.unitCredit += deferredValue;
    return { units, deferredValue };
  }
  private bundle(wave: WaveConfig): void {
    const value = this.value(wave.stage!);
    this.state.pending = { id: this.id(wave, 'units'), waveId: wave.id, kind: 'unitBundle', value, ...this.reserveCards(value, wave.id, 4101) };
  }
  enter(wave: WaveConfig): void {
    this.collect(wave);
    if (wave.encounterKind !== 'specialShop' || this.state.pending) return;
    const rng = this.random.stream('encounter', wave.id, 4201), offers: StageOffer[] = [];
    const units = this.cfg.allUnits().filter(u => (u.cost ?? 1) <= Math.min(5, wave.stage!) && this.pool.count(u.id) > 0).sort((a, b) => a.id.localeCompare(b.id));
    const equipment = this.cfg.allEquipment().filter(i => this.tiers[i.id] === 'basic' || (wave.stage! >= 4 && this.tiers[i.id] === 'advanced') || wave.stage! >= 8).sort((a, b) => a.id.localeCompare(b.id));
    const seen = new Set<string>();
    for (let i = 0; i < this.rules.shop.slots; i++) {
      let kind: StageOffer['kind'] = i === 0 ? 'unit' : i === 1 ? 'equipment' : rng.next() < .5 ? 'unit' : 'equipment';
      let available = (kind === 'unit' ? units : equipment).filter(item => !seen.has(item.id));
      if (!available.length) { kind = kind === 'unit' ? 'equipment' : 'unit'; available = (kind === 'unit' ? units : equipment).filter(item => !seen.has(item.id)); }
      const selected = available[rng.int(0, available.length - 1)];
      if (!selected) throw new Error('Insufficient special shop catalogue');
      seen.add(selected.id);
      offers.push({ kind, id: selected.id, bought: false, price: kind === 'unit' ? COST_PRICE[validCost(this.cfg.getUnit(selected.id).cost)] : this.rules.shop.equipmentPrices[this.tiers[selected.id]] });
    }
    this.state.pending = { id: this.id(wave, 'shop'), waveId: wave.id, kind: 'specialShop', offers };
  }
  settle(wave: WaveConfig, winner: number): void {
    if (wave.id <= this.state.lastRewardWave) return;
    this.state.lastRewardWave = wave.id;
    if (winner !== 0) return;
    if (wave.encounterKind === 'monster') {
      const value = this.value(wave.stage!);
      this.state.lastUnitDrop = { waveId: wave.id, value, ...this.reserveCards(value, wave.id, 4101) };
      this.collect(wave);
    }
    else if (wave.encounterKind === 'boss') this.state.pending = { id: this.id(wave, 'boss'), waveId: wave.id, kind: 'bossChoice', value: this.value(wave.stage!) };
  }
  /** Older saves may still have an unclaimed monster popup. Deliver it without rerolling. */
  resume(wave: WaveConfig): void {
    const pending = this.state.pending;
    if (wave.encounterKind === 'monster' && pending?.kind === 'unitBundle') {
      const { waveId, value, units, deferredValue } = pending;
      this.state.lastUnitDrop = { waveId, value, units: [...units], deferredValue };
      delete this.state.pending; this.collect(wave);
    }
  }
  act(action: StageChoice, wave: WaveConfig): { ok: boolean; error?: string; completeShop?: boolean } {
    const p = this.state.pending;
    if (!p || p.waveId !== wave.id || p.id !== action.rewardId) return { ok: false, error: 'stale_stage_reward' };
    if (p.kind === 'bossChoice') {
      if (action.choice === 'units') this.bundle(wave);
      else if (action.choice === 'equipment') this.state.pending = { id: this.id(wave, 'equipment'), waveId: wave.id, kind: 'equipmentChoice', candidates: this.shuffle(this.rules.basicEquipmentIds.slice().sort(), wave.id, 4301).slice(0, 4) };
      else return { ok: false, error: 'invalid_reward_choice' };
    } else if (p.kind === 'unitBundle' && action.choice === 'claim') {
      delete this.state.pending; this.collect(wave);
    } else if (p.kind === 'equipmentChoice' && action.choice === 'claim' && Number.isInteger(action.index) && p.candidates[action.index!] !== undefined) {
      this.owned.equipmentReserve.push(p.candidates[action.index!]); delete this.state.pending;
    } else if (p.kind === 'specialShop') {
      if (action.choice === 'continue') { delete this.state.pending; return { ok: true, completeShop: true }; }
      const offer = p.offers[action.index!];
      if (action.choice !== 'buy' || !Number.isInteger(action.index) || !offer || offer.bought) return { ok: false, error: 'invalid_shop_choice' };
      if (this.economy.gold < offer.price) return { ok: false, error: 'not_enough_gold' };
      if (offer.kind === 'unit' && !this.pool.take(offer.id)) return { ok: false, error: 'unit_sold_out' };
      if (!this.economy.spend(offer.price)) { if (offer.kind === 'unit') this.pool.give(offer.id); return { ok: false, error: 'not_enough_gold' }; }
      if (offer.kind === 'unit') this.state.unitReserve.push(offer.id); else this.owned.equipmentReserve.push(offer.id);
      offer.bought = true; this.collect(wave);
    } else return { ok: false, error: 'invalid_reward_choice' };
    return { ok: true };
  }
  collect(wave: WaveConfig): void {
    if (this.state.pending?.kind === 'unitBundle') return;
    if (this.state.unitCredit > 0 && !this.pool.isEmpty()) {
      const credit = Math.min(10, this.state.unitCredit); this.state.unitCredit -= credit;
      const added = this.reserveCards(credit, wave.id, 4401 + this.state.creditRoll);
      if (added.units.length) this.state.creditRoll++;
    }
    for (let i = 0; i < this.state.unitReserve.length;) {
      const id = this.state.unitReserve[i], free = this.owned.inBench().length < this.benchSlots;
      if (!free && this.owned.all().filter(u => u.unitId === id && u.star === 1).length < 2) { i++; continue; }
      try {
        this.owned.transaction(() => {
          if (free) { if (!this.owned.addToBench(id, this.benchSlots)) throw new Error('Full bench'); }
          else { this.owned.forceAdd(id); this.owned.tryMerge(id); if (this.owned.inBench().some(u => u.y < 0)) throw new Error('Merge failed'); }
        });
        this.state.unitReserve.splice(i, 1);
      } catch { i++; }
    }
  }
}
