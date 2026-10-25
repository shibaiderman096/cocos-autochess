import { ConfigManager } from './ConfigManager';
import { CardPool } from './CardPool';
import { OwnedUnits } from './OwnedUnits';
import { EconomySystem } from './EconomySystem';
import { COST_PRICE, validCost, SHOP_RATES, shopCostRates, rollShopCost } from './ShopConfig';
import { RunRandomContext } from './RunRandomContext';
import type { WaveConfig } from './RoundFlow';
import type { EquipmentTier } from './EquipmentPolicyTypes';

export interface StageEncounterRules {
  version: 'stage-encounters-v1'; startStage: number;
  monsterStatGrowth: number;
  monsterFormation?: { center: { x: number; y: number }; pairs: Array<[{ x: number; y: number }, { x: number; y: number }]> };
  strongMonster?: { unitIds: string[]; startStage: number; everyStages: number; statGrowth: number;
    escorts?: { initialCount: number; countPerEncounter: number; maxCount: number;
      pairs: NonNullable<StageEncounterRules['monsterFormation']>['pairs']; unitIdsByLeader: Record<string, string[]> } };
  monsterReward: { initialValue: number; valuePerStage: number; maxValue: number };
  bossReward?: { healAmount: number };
  shop: { slots: number; equipmentPrices: Record<EquipmentTier, number> };
  basicEquipmentIds: string[];
}
export type StageOffer = { kind: 'unit' | 'equipment'; id: string; price: number; bought: boolean };
export type StagePending =
  // Serialized name retained for unopened legacy chests; claiming now rolls and delivers a random reward.
  | { id: string; waveId: number; kind: 'bossChoice'; value: number }
  | { id: string; waveId: number; kind: 'unitBundle'; value: number; units: string[]; deferredValue: number }
  | { id: string; waveId: number; kind: 'equipmentChoice'; candidates: string[] }
  | { id: string; waveId: number; kind: 'specialShop'; offers: StageOffer[] };
export interface StageProgressState {
  lastUnitDrop?: { waveId: number; value: number; units: string[]; deferredValue: number };
  lastRewardWave: number; unitReserve: string[]; unitCredit: number; equipmentCredit?: number; creditRoll: number; pending?: StagePending;
}
export interface StageChoice { type: 'stageChoice'; rewardId: string; choice: 'units' | 'equipment' | 'claim' | 'buy' | 'continue'; index?: number }
export type StageRewardGrant = { kind: 'units'; units: string[] }
  | { kind: 'equipment'; equipmentIds: string[]; value: number; equipmentCredit: number } | { kind: 'health'; amount: number };
export const freshStageProgress = (): StageProgressState => ({ lastRewardWave: 0, unitReserve: [], unitCredit: 0, creditRoll: 0 });
export const isChestlessBoss = (wave: WaveConfig): boolean => wave.stage === 10 && wave.round === 10 && wave.encounterKind === 'boss';

/** Inventory and rewards only; all randomness uses persisted encounter identities. */
export class StageProgression {
  constructor(readonly rules: StageEncounterRules, readonly state: StageProgressState, private cfg: ConfigManager,
    private pool: CardPool, private owned: OwnedUnits, private economy: EconomySystem, private random: RunRandomContext,
    private benchSlots: number, private tiers: Record<string, EquipmentTier>, private shopLevel: () => number = () => 1) {
    if (rules.version !== 'stage-encounters-v1' || !Number.isSafeInteger(rules.startStage) || rules.startStage < 4 || !Number.isFinite(rules.monsterStatGrowth) || rules.monsterStatGrowth < 0
      || (rules.bossReward && (!Number.isSafeInteger(rules.bossReward.healAmount) || rules.bossReward.healAmount <= 0))
      || rules.shop.slots !== 5 || rules.basicEquipmentIds.length < 4 || new Set(rules.basicEquipmentIds).size !== rules.basicEquipmentIds.length
      || rules.basicEquipmentIds.some(id => !cfg.getEquipmentReserve([id]).length || !['basic', 'advanced'].includes(tiers[id]))
      || ![rules.monsterReward.initialValue, rules.monsterReward.valuePerStage, rules.monsterReward.maxValue, ...Object.values(rules.shop.equipmentPrices)].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid stage encounter rules');
    if (!state || ![state.lastRewardWave, state.unitCredit, state.creditRoll].every(n => Number.isSafeInteger(n) && n >= 0)
      || (state.equipmentCredit !== undefined && (!Number.isSafeInteger(state.equipmentCredit) || state.equipmentCredit < 0))
      || !Array.isArray(state.unitReserve) || state.unitReserve.some(id => !cfg.allUnits().some(u => u.id === id))) throw new Error('Invalid stage reward save');
    this.validateSavedRewards();
  }
  /** Save data crosses a runtime boundary: reject malformed entries before a UI or purchase consumes them. */
  private validateSavedRewards(): void {
    const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
    const value = (n: number) => positive(n) && n <= this.rules.monsterReward.maxValue;
    const roster = new Map(this.cfg.allUnits().map(u => [u.id, u]));
    const equipment = new Set(this.cfg.allEquipment().map(e => e.id));
    const bundle = (b: { value: number; units: string[]; deferredValue: number }) =>
      value(b.value) && Array.isArray(b.units) && b.units.every(id => roster.has(id))
      && Number.isSafeInteger(b.deferredValue) && b.deferredValue >= 0
      && b.units.reduce((n, id) => n + COST_PRICE[validCost(roster.get(id)!.cost)], b.deferredValue) === b.value;
    const bad = () => { throw new Error('Invalid stage reward save'); };
    const cheapestEquipment = Math.min(...this.rules.basicEquipmentIds.map(id => this.cfg.equipmentPrice(id, this.rules.shop.equipmentPrices[this.tiers[id]])));
    if ((this.state.equipmentCredit ?? 0) >= cheapestEquipment) bad();
    const drop = this.state.lastUnitDrop;
    if (drop !== undefined && (!drop || !positive(drop.waveId) || !bundle(drop))) bad();
    const p = this.state.pending;
    if (p === undefined) return;
    if (!p || typeof p.id !== 'string' || !p.id.trim() || !positive(p.waveId)) bad();
    switch (p.kind) {
      case 'bossChoice': if (!value(p.value)) bad(); break;
      case 'unitBundle': if (!bundle(p)) bad(); break;
      case 'equipmentChoice':
        if (!Array.isArray(p.candidates) || ![4, 5].includes(p.candidates.length) || new Set(p.candidates).size !== p.candidates.length
          || p.candidates.some(id => !this.rules.basicEquipmentIds.includes(id))) bad();
        break;
      case 'specialShop':
        if (!Array.isArray(p.offers) || p.offers.length !== this.rules.shop.slots || p.offers.some(o => !o
          || !positive(o.price) || typeof o.bought !== 'boolean'
          || (o.kind === 'unit' ? !roster.has(o.id) : o.kind === 'equipment' ? !equipment.has(o.id) : true))
          || new Set(p.offers.filter(o => o.kind === 'equipment').map(o => o.id)).size !== p.offers.filter(o => o.kind === 'equipment').length) bad();
        break;
      default: bad();
    }
  }
  value(stage: number): number { const r = this.rules.monsterReward; return Math.min(r.maxValue, r.initialValue + (stage - 1) * r.valuePerStage); }
  private id(wave: WaveConfig, kind: string): string { return `${this.rules.version}:${this.random.runSeed}:${wave.id}:${kind}`; }
  /** Equipment uses the same gold budget as cards; unspendable value stays in the run. */
  private reserveEquipment(value: number, waveId: number): StageRewardGrant & { kind: 'equipment' } {
    const catalogue = this.rules.basicEquipmentIds.slice().sort().map(id => ({ id,
      price: this.cfg.equipmentPrice(id, this.rules.shop.equipmentPrices[this.tiers[id]]) }));
    const budget = value + (this.state.equipmentCredit ?? 0);
    if (!Number.isSafeInteger(budget)) throw new Error('Invalid equipment reward budget');
    // Saved credit is below the cheapest price, so the change-making table stays bounded.
    const reachable = Array(budget + 1).fill(false); reachable[0] = true;
    for (let n = 1; n <= budget; n++) reachable[n] = catalogue.some(item => item.price <= n && reachable[n-item.price]);
    let remaining = budget; while (remaining > 0 && !reachable[remaining]) remaining--;
    const equipmentCredit = budget-remaining, equipmentIds: string[] = [], rng = this.random.stream('reward', waveId, 4301);
    while (remaining > 0) {
      const choices = catalogue.filter(item => item.price <= remaining && reachable[remaining-item.price]);
      const item = choices[rng.int(0, choices.length-1)];
      equipmentIds.push(item.id); remaining -= item.price;
    }
    this.owned.equipmentReserve.push(...equipmentIds);
    this.state.equipmentCredit = equipmentCredit;
    return { kind: 'equipment', equipmentIds, value, equipmentCredit };
  }
  /** Bounded change-making preserves exact card value when stocks permit it. */
  private reserveCards(value: number, waveId: number, salt: number): { units: string[]; deferredValue: number } {
    const level = Math.max(1, Math.min(SHOP_RATES.length, Math.floor(this.shopLevel())));
    const rates = SHOP_RATES[level - 1];
    const roster = this.cfg.allUnits().filter(u => this.pool.canDraw(u.id) && rates[validCost(u.cost) - 1] > 0).slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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
      const costs = Array.from(new Set(choices.map(u => validCost(u.cost))));
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
  enter(wave: WaveConfig): void {
    this.collect(wave);
    if (wave.encounterKind !== 'specialShop' || this.state.pending) return;
    const rng = this.random.stream('encounter', wave.id, 4201), offers: StageOffer[] = [];
    const units = this.cfg.allUnits().filter(u => u.specialShopUnlock && this.pool.count(u.id) > 0).sort((a, b) => a.id.localeCompare(b.id));
    const equipment = this.cfg.allEquipment().filter(i => i.specialShopOnly || this.tiers[i.id] === 'basic' || (wave.stage! >= 4 && this.tiers[i.id] === 'advanced') || wave.stage! >= 8).sort((a, b) => a.id.localeCompare(b.id));
    const seen = new Set<string>();
    const rates = shopCostRates(this.shopLevel(), this.cfg.allUnits()
      .filter(u => this.pool.canDraw(u.id) && this.pool.count(u.id) > 0).map(u => validCost(u.cost)));
    const costRng = this.random.stream('encounter', wave.id, 4202);
    for (let i = 0; i < this.rules.shop.slots; i++) {
      const cost = rollShopCost(rates, () => costRng.next());
      const candidates = units.filter(u => validCost(u.cost) === cost
        && offers.filter(o => o.kind === 'unit' && o.id === u.id).length < this.pool.count(u.id));
      const kind: StageOffer['kind'] = candidates.length ? 'unit' : 'equipment';
      // Missing exclusive fee tiers become equipment; never renormalize a 5-fee card to 100%.
      const available = kind === 'unit' ? candidates : equipment.filter(item => !seen.has(item.id));
      const selected = available[rng.int(0, available.length - 1)];
      if (!selected) throw new Error('Insufficient special shop catalogue');
      seen.add(selected.id);
      offers.push({ kind, id: selected.id, bought: false, price: kind === 'unit' ? COST_PRICE[validCost(this.cfg.getUnit(selected.id).cost)] : this.cfg.equipmentPrice(selected.id, this.rules.shop.equipmentPrices[this.tiers[selected.id]]) });
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
      const drop = this.state.lastUnitDrop;
      this.state.pending = { id: this.id(wave, 'units'), kind: 'unitBundle', ...drop };
    }
    else if (wave.encounterKind === 'boss' && !isChestlessBoss(wave)) this.state.pending = { id: this.id(wave, 'boss'), waveId: wave.id, kind: 'bossChoice', value: this.value(wave.stage!) };
  }
  act(action: StageChoice, wave: WaveConfig): { ok: boolean; error?: string; completeShop?: boolean; stageReward?: StageRewardGrant } {
    const p = this.state.pending;
    if (!p || p.waveId !== wave.id || p.id !== action.rewardId) return { ok: false, error: 'stale_stage_reward' };
    if (p.kind === 'bossChoice') {
      if (action.choice !== 'claim') return { ok: false, error: 'invalid_reward_choice' };
      // Opening is one atomic action. Reloading an unopened chest keeps the same seeded outcome.
      const kind = this.random.stream('reward', wave.id, 4300).int(0, 2);
      let stageReward: StageRewardGrant;
      if (kind === 0) {
        stageReward = { kind: 'units', units: this.reserveCards(p.value, wave.id, 4101).units };
      } else if (kind === 1) {
        stageReward = this.reserveEquipment(p.value, wave.id);
      } else stageReward = { kind: 'health', amount: this.rules.bossReward?.healAmount ?? 5 };
      delete this.state.pending; this.collect(wave);
      return { ok: true, stageReward };
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
      if (offer.kind === 'unit') { this.pool.unlock(offer.id); this.state.unitReserve.push(offer.id); } else this.owned.equipmentReserve.push(offer.id);
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
