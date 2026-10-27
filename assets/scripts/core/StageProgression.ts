import { ConfigManager } from './ConfigManager';
import { CardPool } from './CardPool';
import { OwnedUnits } from './OwnedUnits';
import { EconomySystem } from './EconomySystem';
import { COST_PRICE, validCost, SHOP_RATES, shopCostRates, rollShopCost } from './ShopConfig';
import { RunRandomContext } from './RunRandomContext';
import { equipmentQuality } from './EquipmentQuality';
import type { WaveConfig } from './RoundFlow';
import type { EquipmentTier } from './EquipmentPolicyTypes';

export interface QualityGrowth {
  maxSteps: number;
  maxRates: number[];
}
/** Percentages retain two decimals; the final tier absorbs rounding so every row totals 100. */
function growingQualityRates(initial: readonly number[], growth: QualityGrowth | undefined, steps: number): number[] {
  if(!growth)return [...initial];
  const fraction=Math.min(growth.maxSteps,Math.max(0,steps))/growth.maxSteps;
  const rates=initial.slice(0,4).map((rate,index)=>Math.round((rate+(growth.maxRates[index]-rate)*fraction)*100)/100);
  return [...rates,Math.round((100-rates.reduce((sum,rate)=>sum+rate,0))*100)/100];
}
export function stageShopQualityRates(refreshes: number, rules: Pick<StageEncounterRules['shop'],'qualityRates'|'refreshQuality'>): number[] {
  return growingQualityRates(rules.qualityRates??[35,30,20,10,5],rules.refreshQuality,refreshes);
}
export function explorerLootQualityRates(points: number, rules: StageEncounterRules['chestReward']): number[] {
  const growth=rules?.explorerQuality;
  return growingQualityRates(growth?.initialRates??[55,30,10,4,1],growth,points);
}

export interface StageEncounterRules {
  version: 'stage-encounters-v1'; startStage: number;
  monsterStatGrowth: number;
  monsterFormation?: { center: { x: number; y: number }; pairs: Array<[{ x: number; y: number }, { x: number; y: number }]> };
  strongMonster?: { unitIds: string[]; startStage: number; everyStages: number; statGrowth: number;
    escorts?: { initialCount: number; countPerEncounter: number; maxCount: number;
      pairs: NonNullable<StageEncounterRules['monsterFormation']>['pairs']; unitIdsByLeader: Record<string, string[]> } };
  monsterReward: { initialValue: number; valuePerStage: number; maxValue: number };
  bossReward?: { healAmount: number };
  chestReward?: { version: 'mixed-v1'; healthGoldValue: number; eliteValueMultiplier: number; explorerGoldThreshold?: number;
    explorerQuality?: QualityGrowth & {initialRates: number[]} };
  shop: { slots: number; equipmentPrices: Record<EquipmentTier, number>; refresh?: { initialPrice: number; priceIncrement: number }; equipmentQualityOdds?: 'shop-level'; qualityRates?: number[];
    refreshQuality?: QualityGrowth };
  basicEquipmentIds: string[];
}
export type StageOffer = { kind: 'unit' | 'equipment'; id: string; price: number; bought: boolean };
export type StagePending =
  // Serialized name retained for unopened legacy chests; claiming now rolls and delivers a random reward.
  | { id: string; waveId: number; kind: 'bossChoice'; value: number }
  | { id: string; waveId: number; kind: 'unitBundle'; value: number; units: string[]; deferredValue: number }
  | { id: string; waveId: number; kind: 'equipmentChoice'; candidates: string[] }
  | { id: string; waveId: number; kind: 'mixedChest'; value: number; source: 'monster' | 'elite' | 'boss' }
  | { id: string; waveId: number; kind: 'specialShop'; offers: StageOffer[]; refreshes?: number };
export interface StageProgressState {
  lastUnitDrop?: { waveId: number; value: number; units: string[]; deferredValue: number };
  lastRewardWave: number; unitReserve: string[]; unitCredit: number; equipmentCredit?: number; creditRoll: number; pending?: StagePending;
}
export interface StageChoice { type: 'stageChoice'; rewardId: string; choice: 'units' | 'equipment' | 'claim' | 'buy' | 'refresh' | 'continue'; index?: number }
export type StageRewardGrant = { kind: 'units'; units: string[] }
  | { kind: 'equipment'; equipmentIds: string[]; value: number; equipmentCredit: number } | { kind: 'health'; amount: number }
  | { kind: 'mixed'; units: string[]; equipmentIds: string[]; equipmentStart?: number; health: number; gold: number; value: number };
export function stageShopRefreshPrice(refreshes = 0, rules = { initialPrice: 2, priceIncrement: 2 }): number {
  const price=rules.initialPrice+refreshes*rules.priceIncrement;
  if(!Number.isSafeInteger(refreshes)||refreshes<0||!Number.isSafeInteger(price)||price<1)throw new Error('Invalid special shop refresh count');
  return price;
}
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
    if(rules.chestReward&&(rules.chestReward.version!=='mixed-v1'||!Number.isSafeInteger(rules.chestReward.healthGoldValue)
      ||rules.chestReward.healthGoldValue<1||rules.chestReward.eliteValueMultiplier!==.5
      ||(rules.chestReward.explorerGoldThreshold!==undefined&&(!Number.isSafeInteger(rules.chestReward.explorerGoldThreshold)
        ||rules.chestReward.explorerGoldThreshold<0))))throw new Error('Invalid mixed chest rules');
    if(rules.shop.refresh&&![rules.shop.refresh.initialPrice,rules.shop.refresh.priceIncrement].every(n=>Number.isSafeInteger(n)&&n>0))throw new Error('Invalid special shop refresh prices');
    if(rules.shop.equipmentQualityOdds!==undefined&&rules.shop.equipmentQualityOdds!=='shop-level')throw new Error('Invalid merchant equipment quality odds');
    if(rules.shop.qualityRates&&(!Array.isArray(rules.shop.qualityRates)||rules.shop.qualityRates.length!==5
      ||rules.shop.qualityRates.some(rate=>!Number.isSafeInteger(rate)||rate<0)||rules.shop.qualityRates.reduce((a,b)=>a+b,0)!==100))throw new Error('Invalid fixed merchant quality odds');
    const validRates=(rates:unknown):rates is number[]=>Array.isArray(rates)&&rates.length===5
      &&rates.every(rate=>Number.isFinite(rate)&&rate>=0)&&Math.abs(rates.reduce((sum,rate)=>sum+rate,0)-100)<1e-8;
    const validateGrowth=(growth:QualityGrowth|undefined,initial:readonly number[])=>{
      if(!growth)return;
      if(!Number.isSafeInteger(growth.maxSteps)||growth.maxSteps<1||!validRates(growth.maxRates)
        ||!validRates(initial))throw new Error('Invalid loot quality growth');
      // Increasing exploration/refreshes may never lower the chance of reaching any higher tier.
      for(let tier=1;tier<5;tier++)if(growth.maxRates.slice(tier).reduce((sum,r)=>sum+r,0)<initial.slice(tier).reduce((sum,r)=>sum+r,0))
        throw new Error('Invalid loot quality growth');
    };
    if(rules.shop.refreshQuality&&!rules.shop.qualityRates)throw new Error('Merchant quality growth needs initial rates');
    validateGrowth(rules.shop.refreshQuality,rules.shop.qualityRates??[]);
    validateGrowth(rules.chestReward?.explorerQuality,rules.chestReward?.explorerQuality?.initialRates??[]);
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
      case 'mixedChest': if(!value(p.value)||!['monster','elite','boss'].includes(p.source))bad();break;
      case 'unitBundle': if (!bundle(p)) bad(); break;
      case 'equipmentChoice':
        if (!Array.isArray(p.candidates) || ![4, 5].includes(p.candidates.length) || new Set(p.candidates).size !== p.candidates.length
          || p.candidates.some(id => !this.rules.basicEquipmentIds.includes(id))) bad();
        break;
      case 'specialShop':
        stageShopRefreshPrice(p.refreshes,this.rules.shop.refresh);
        if (!Array.isArray(p.offers) || p.offers.length !== this.rules.shop.slots || p.offers.some(o => !o
          || !positive(o.price) || typeof o.bought !== 'boolean'
          || (o.kind === 'unit' ? !roster.has(o.id) : o.kind === 'equipment' ? !equipment.has(o.id) : true))
          || new Set(p.offers.filter(o => o.kind === 'equipment').map(o => o.id)).size !== p.offers.filter(o => o.kind === 'equipment').length) bad();
        break;
      default: bad();
    }
  }
  value(stage: number): number { const r = this.rules.monsterReward; return Math.min(r.maxValue, r.initialValue + (stage - 1) * r.valuePerStage); }
  chestValue(wave: WaveConfig): number { return wave.encounterKind==='elite'?Math.ceil(this.value(wave.stage!)*(this.rules.chestReward?.eliteValueMultiplier??.5)):this.value(wave.stage!); }
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
  private rollShop(wave: WaveConfig, refreshes = 0): Extract<StagePending,{kind:'specialShop'}> {
    const rng = this.random.stream('encounter', wave.id, 4201+refreshes*2), offers: StageOffer[] = [];
    const units = this.cfg.allUnits().filter(u => u.specialShopUnlock && this.pool.count(u.id) > 0).sort((a, b) => a.id.localeCompare(b.id));
    const equipment = this.cfg.allEquipment().filter(i => i.specialShopOnly || this.tiers[i.id] === 'basic' || (wave.stage! >= 4 && this.tiers[i.id] === 'advanced') || wave.stage! >= 8).sort((a, b) => a.id.localeCompare(b.id));
    const seen = new Set<string>();
    const rates = shopCostRates(this.shopLevel(), this.cfg.allUnits()
      .filter(u => this.pool.canDraw(u.id) && this.pool.count(u.id) > 0).map(u => validCost(u.cost)));
    const costRng = this.random.stream('encounter', wave.id, 4202+refreshes*2);
    const qualityRng=this.random.stream('encounter',wave.id,6201+refreshes);
    if(this.rules.shop.qualityRates){
      const qualityRates=stageShopQualityRates(refreshes,this.rules.shop);
      for(let index=0;index<this.rules.shop.slots;index++){
        const available=[
          ...units.filter(unit=>offers.filter(o=>o.kind==='unit'&&o.id===unit.id).length<this.pool.count(unit.id))
            .map(unit=>({kind:'unit' as const,id:unit.id,quality:validCost(unit.cost),price:COST_PRICE[validCost(unit.cost)]})),
          ...equipment.filter(item=>!seen.has(item.id)).map(item=>({kind:'equipment' as const,id:item.id,quality:equipmentQuality(item),
            price:this.cfg.equipmentPrice(item.id,this.rules.shop.equipmentPrices[this.tiers[item.id]])}))
        ];
        const weights=qualityRates.map((rate,n)=>available.some(item=>item.quality===n+1)?rate:0);
        const quality=rollShopCost(weights,()=>qualityRng.next()),choices=available.filter(item=>item.quality===quality);
        const selected=choices[rng.int(0,choices.length-1)];if(!selected)throw new Error('Insufficient fixed merchant catalogue');
        if(selected.kind==='equipment')seen.add(selected.id);
        offers.push({kind:selected.kind,id:selected.id,price:selected.price,bought:false});
      }
      return {id:this.id(wave,'shop'),waveId:wave.id,kind:'specialShop',offers,refreshes};
    }
    for (let i = 0; i < this.rules.shop.slots; i++) {
      const cost = rollShopCost(rates, () => costRng.next());
      const candidates = units.filter(u => validCost(u.cost) === cost
        && offers.filter(o => o.kind === 'unit' && o.id === u.id).length < this.pool.count(u.id));
      const kind: StageOffer['kind'] = candidates.length ? 'unit' : 'equipment';
      // Missing exclusive fee tiers become equipment; never renormalize a 5-fee card to 100%.
      let available = kind === 'unit' ? candidates : equipment.filter(item => !seen.has(item.id));
      if(kind==='equipment'&&this.rules.shop.equipmentQualityOdds==='shop-level'){
        const gear=available as ReturnType<ConfigManager['allEquipment']>;
        const quality=rollShopCost(shopCostRates(this.shopLevel(),gear.map(equipmentQuality)),()=>qualityRng.next());
        available=gear.filter(item=>equipmentQuality(item)===quality);
      }
      const selected = available[rng.int(0, available.length - 1)];
      if (!selected) throw new Error('Insufficient special shop catalogue');
      seen.add(selected.id);
      offers.push({ kind, id: selected.id, bought: false, price: kind === 'unit' ? COST_PRICE[validCost(this.cfg.getUnit(selected.id).cost)] : this.cfg.equipmentPrice(selected.id, this.rules.shop.equipmentPrices[this.tiers[selected.id]]) });
    }
    return { id: this.id(wave, 'shop'), waveId: wave.id, kind: 'specialShop', offers, refreshes };
  }
  enter(wave: WaveConfig): void {
    this.collect(wave);
    if (wave.encounterKind !== 'specialShop' || this.state.pending) return;
    this.state.pending=this.rollShop(wave);
  }
  settle(wave: WaveConfig, winner: number): void {
    if (wave.id <= this.state.lastRewardWave) return;
    this.state.lastRewardWave = wave.id;
    if (winner !== 0) return;
    if(this.rules.chestReward){
      const source=wave.encounterKind;
      if((source==='monster'||source==='elite'||source==='boss')&&!isChestlessBoss(wave))
        this.state.pending={id:this.id(wave,'mixed'),waveId:wave.id,kind:'mixedChest',source,value:this.chestValue(wave)};
      return;
    }
    if (wave.encounterKind === 'monster') {
      const value = this.value(wave.stage!);
      this.state.lastUnitDrop = { waveId: wave.id, value, ...this.reserveCards(value, wave.id, 4101) };
      const drop = this.state.lastUnitDrop;
      this.state.pending = { id: this.id(wave, 'units'), kind: 'unitBundle', ...drop };
    }
    else if (wave.encounterKind === 'boss' && !isChestlessBoss(wave)) this.state.pending = { id: this.id(wave, 'boss'), waveId: wave.id, kind: 'bossChoice', value: this.value(wave.stage!) };
  }
  grantExplorerReward(value: number, waveId: number, healthCapacity: number, points = value*10): Extract<StageRewardGrant,{kind:'mixed'}> {
    return this.mixedReward(value,waveId,healthCapacity,[],'explorer',points);
  }
  private mixedReward(value: number, waveId: number, healthCapacity: number, returnedCards: string[] = [], source: 'stage'|'explorer' = 'stage', points = 0): Extract<StageRewardGrant,{kind:'mixed'}> {
    const roster=this.cfg.allUnits().slice().sort((a,b)=>a.id.localeCompare(b.id));
    const stock=new CardPool(roster,this.pool.snapshot(),this.pool.unlockedSpecialUnits(roster));
    const owned=new OwnedUnits(this.owned.snapshot(),this.owned.nextUnitUid,()=>true,this.owned.canMergeResult);
    const reserve=this.state.unitReserve.slice();
    for(const id of returnedCards){const index=reserve.indexOf(id);if(index<0)throw new Error('Missing legacy chest reservation');reserve.splice(index,1);}
    const carried=returnedCards.reduce((sum,id)=>sum+COST_PRICE[validCost(this.cfg.getUnit(id).cost)],0)
      +this.state.unitCredit+(this.state.equipmentCredit??0);
    const budget=value+(source==='stage'?carried:0);
    if(!Number.isSafeInteger(budget)||budget<0)throw new Error('Invalid mixed chest budget');
    for(const id of returnedCards)stock.give(id);
    const rates=SHOP_RATES[Math.max(0,Math.min(SHOP_RATES.length-1,Math.floor(this.shopLevel())-1))];
    const lootRates=source==='explorer'&&this.rules.chestReward?.explorerQuality
      ?explorerLootQualityRates(points,this.rules.chestReward):undefined;
    const gear=this.cfg.allEquipment().filter(e=>e.chestDrop||(!e.specialShopOnly&&!e.traitChoice&&['basic','advanced'].includes(this.tiers[e.id])))
      .map(e=>({id:e.id,quality:equipmentQuality(e),price:this.cfg.equipmentPrice(e.id,this.rules.shop.equipmentPrices[this.tiers[e.id]])})).filter(e=>e.price>0).sort((a,b)=>a.id.localeCompare(b.id));
    const healthPrice=this.rules.chestReward?.healthGoldValue??2,rng=this.random.stream('reward',waveId,source==='explorer'?4700:4500);
    const result: Extract<StageRewardGrant,{kind:'mixed'}>={kind:'mixed',units:[],equipmentIds:[],health:0,gold:0,value:budget};
    const goldThreshold=this.rules.chestReward?.explorerGoldThreshold;
    const goldEligible=source==='explorer'&&goldThreshold!==undefined&&budget>goldThreshold;
    let remaining=budget,capacity=Math.max(0,Math.floor(healthCapacity));
    const deliver=(target:OwnedUnits,id:string)=>{
      if(target.inBench().length<this.benchSlots){if(!target.addToBench(id,this.benchSlots))throw new Error('Mixed reward bench changed');}
      else {target.forceAdd(id);target.tryMerge(id);if(target.inBench().some(u=>u.y<0))throw new Error('Mixed reward cannot merge');}
    };
    // Plan against detached ownership first; no pending reward or wallet changes during the roll.
    for(let step=0;remaining>0&&step<128;step++){
      const units=roster.filter(u=>stock.canDraw(u.id)&&stock.count(u.id)>0&&(lootRates??rates)[validCost(u.cost)-1]>0&&COST_PRICE[validCost(u.cost)]<=remaining
        &&(owned.inBench().length<this.benchSlots||owned.purchaseUpgradeStar(u.id)!==null));
      const equipment=gear.filter(e=>e.price<=remaining&&(!lootRates||lootRates[e.quality-1]>0));
      const kinds=['units','equipment','health'].filter(k=>k==='units'?units.length:k==='equipment'?equipment.length:capacity>0&&remaining>=healthPrice);
      if(goldEligible)kinds.push('gold');
      if(!kinds.length)break;
      const kind=kinds[rng.int(0,kinds.length-1)];
      if(kind==='units'){
        const costs=[...new Set(units.map(u=>validCost(u.cost)))],weights=lootRates??rates;let roll=rng.next()*costs.reduce((sum,c)=>sum+weights[c-1],0);
        const cost=costs.find(c=>{roll-=weights[c-1];return roll<0})??costs[costs.length-1];
        const choices=units.filter(u=>validCost(u.cost)===cost),unit=choices[rng.int(0,choices.length-1)];
        stock.take(unit.id);deliver(owned,unit.id);result.units.push(unit.id);remaining-=COST_PRICE[cost];
      }else if(kind==='equipment'){
        const quality=lootRates?rollShopCost(lootRates.map((rate,index)=>equipment.some(item=>item.quality===index+1)?rate:0),()=>rng.next()):undefined;
        const choices=quality?equipment.filter(item=>item.quality===quality):equipment;
        const item=choices[rng.int(0,choices.length-1)];result.equipmentIds.push(item.id);remaining-=item.price;
      }else if(kind==='health'){result.health++;capacity--;remaining-=healthPrice;}
      else{result.gold++;remaining--;}
    }
    result.gold+=remaining;
    if(!Number.isSafeInteger(this.economy.gold+result.gold))throw new Error('Mixed reward gold overflow');
    this.owned.transaction(()=>{for(const id of result.units)deliver(this.owned,id);result.equipmentStart=this.owned.equipmentReserve.length;this.owned.equipmentReserve.push(...result.equipmentIds);});
    for(const id of returnedCards)this.pool.give(id);
    for(const id of result.units)if(!this.pool.take(id))throw new Error('Mixed reward pool changed');
    this.economy.add(result.gold);
    if(source==='stage'){this.state.unitReserve=reserve;this.state.unitCredit=0;this.state.equipmentCredit=0;}
    return result;
  }
  act(action: StageChoice, wave: WaveConfig, healthCapacity = 0): { ok: boolean; error?: string; completeShop?: boolean; stageReward?: StageRewardGrant } {
    const p = this.state.pending;
    if (!p || p.waveId !== wave.id || p.id !== action.rewardId) return { ok: false, error: 'stale_stage_reward' };
    if(p.kind==='mixedChest'||(this.rules.chestReward&&(p.kind==='bossChoice'||p.kind==='unitBundle'))){
      if(action.choice!=='claim')return {ok:false,error:'invalid_reward_choice'};
      const reward=this.mixedReward(p.kind==='unitBundle'?0:p.value,wave.id,healthCapacity,p.kind==='unitBundle'?p.units:[]);
      delete this.state.pending;
      return {ok:true,stageReward:reward};
    }else if (p.kind === 'bossChoice') {
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
      if(action.choice==='refresh'){
        const price=stageShopRefreshPrice(p.refreshes,this.rules.shop.refresh);
        if(this.economy.gold<price)return {ok:false,error:'not_enough_gold'};
        const next=this.rollShop(wave,(p.refreshes??0)+1);
        if(!this.economy.spend(price))return {ok:false,error:'not_enough_gold'};
        this.state.pending=next;return {ok:true};
      }
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
    if (this.state.pending?.kind === 'unitBundle'||this.state.pending?.kind==='mixedChest') return;
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
