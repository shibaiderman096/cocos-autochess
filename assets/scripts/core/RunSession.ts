import { BattleSim } from '../battle/BattleSim';
import { freshMerchantServices, restoreMerchantServices, forgedItem, forgeCandidates, forgePrice, dicePayout, validDicePicks, diceMultiplier } from './MerchantServices';
import type { DiceBet } from './MerchantServices';
import { resolveTraits } from '../battle/Traits';
import { freshExplorerProgress, validateExplorerProgress, settleExplorerProgress, isExplorerBattle } from './ExplorerProgress';
import type { Placement } from '../battle/BattleSim';
import { MAX_EQUIPMENT } from '../battle/types';
import type { ExplorerTraitEffect } from '../battle/types';
import { ConfigManager } from './ConfigManager';
import { CardPool } from './CardPool';
import { EconomySystem, EARLY_STAGE_GOLD } from './EconomySystem';
import { LevelSystem, EXP_PER_BATTLE, EXP_PURCHASE, MAX_LEVEL,LEVEL_UP_EXP } from './LevelSystem';
import { OwnedUnits } from './OwnedUnits';
import { ShopSystem,REFRESH_COST } from './ShopSystem';
import { COST_PRICE, validCost } from './ShopConfig';
import { RoundFlow } from './RoundFlow';
import type { WaveConfig } from './RoundFlow';
import { buildMonsterUnits, buildRunWaves, DEFAULT_STAGE_COUNT, MAX_STAGE_COUNT, stageRoundCount } from './RunSetup';
import type { RunConfig } from './RunSetup';
import { freshSaveV2, migrateSaveV2, restoreShopState } from './ShopSave';
import type { SaveDataV2 } from './ShopSave';
import { RunRandomContext, RUN_RULES_VERSION, DEFAULT_RUN_SEED } from './RunRandomContext';
import type { ActionResult, RunAction, RunPlayerPort, RunSessionOptions, RunSessionState, SessionSettlement } from './RunSessionTypes';
import { stableEnemyJson, combatConfigurationIdentity, sameCombatConfigurationIdentity } from './EnemyGenerationTypes';
import type { EnemyGenerationOptions } from './RunSetup';
import { EnemyFormation,compatibilityFormation } from './EnemyFormation';
import { FORMATION_VERSION } from './EnemyFormationTypes';
import type { EnemyFormationResult,PlayerFormationSnapshot } from './EnemyFormationTypes';
import { formationSettings } from './FormationPolicy';
import { extractFormationTemplates } from './FormationTemplates';
import { resolveEnemyRole } from './EnemyRoles';
import { EnemyPowerModel } from './EnemyPowerModel';
import { equipmentIdentity,sameEquipmentIdentity,validateEquipmentPolicy } from './EquipmentPolicy';
import type { EquipmentPolicyConfig,PendingEquipmentReward } from './EquipmentPolicyTypes';
import { createEquipmentReward } from './EquipmentReward';
import type { BotPlayerPort,BotCatalog } from './BotObservation';
import { StageProgression, freshStageProgress, isChestlessBoss, explorerLootQualityRates } from './StageProgression';
import type { StageChoice, StagePending } from './StageProgression';
import { traitEmblemChoices } from './TraitEmblem';
import type { PendingTraitChoice } from './TraitEmblem';
import { drawOpeningEncounters, LEGACY_OPENING_ENCOUNTERS, OPENING_ENCOUNTER_IDS, openingEncounterChoices } from './OpeningEncounter';

const ok = (): ActionResult => ({ ok: true });
const fail = (error: string): ActionResult => ({ ok: false, error });

/** Pure orchestration shared by Cocos and headless tools. All numeric rules stay in existing systems. */
export class RunSession {
  readonly save: SaveDataV2;
  readonly random: RunRandomContext;
  readonly economy: EconomySystem;
  readonly level: LevelSystem;
  readonly pool: CardPool;
  readonly owned: OwnedUnits;
  readonly shop: ShopSystem;
  flow: RoundFlow;
  waves: WaveConfig[];
  private activeBattle: BattleSim | null = null;
  private activeExplorer?: ExplorerTraitEffect;
  private activeBattleIds = new Map<number, number>();
  private generation: EnemyGenerationOptions;
  private equipmentPolicy?:EquipmentPolicyConfig;
  private stageProgression?: StageProgression;
  private formationEngine?:EnemyFormation;
  private previewFormation?:{waveId:number;result:EnemyFormationResult};
  private lockedFormation?:{waveId:number;result:EnemyFormationResult};

  constructor(readonly cfg: ConfigManager, readonly runConfig: RunConfig, private templates: WaveConfig[], options: RunSessionOptions = {}) {
    const encounterRules = runConfig.openingEncounter;
    if (encounterRules && (!encounterRules.name || ![encounterRules.refreshesPerLevel, encounterRules.incomeStartStage, encounterRules.incomePerStage, encounterRules.survivorMaxHp,
      encounterRules.victoryGold, encounterRules.battleExp, encounterRules.victoryHeal].every(n => Number.isSafeInteger(n) && n > 0))) throw new Error('Invalid opening encounter rules');
    const loaded = options.save !== undefined;
    this.save = loaded ? migrateSaveV2(options.save) : freshSaveV2(options.stageCount ?? DEFAULT_STAGE_COUNT, options.runSeed ?? DEFAULT_RUN_SEED, options.enemyGenerationMode ?? 'budget-v1');
    this.save.merchantServices ??= freshMerchantServices();
    restoreMerchantServices(cfg, this.save.merchantServices);
    this.save.explorerProgress ??= freshExplorerProgress();
    validateExplorerProgress(this.save.explorerProgress);
    if (loaded && options.runSeed !== undefined && options.runSeed !== this.save.runSeed) throw new Error('Cannot replace the seed of a saved run');
    if (this.save.rulesVersion !== RUN_RULES_VERSION) throw new Error(`Unsupported run rules version: ${this.save.rulesVersion}`);
    if (this.save.earlyEncounterLayout !== undefined && this.save.earlyEncounterLayout !== 'random-rounds-v1') throw new Error('Unsupported early encounter layout');
    const mode=this.save.enemyGenerationVersion;
    if(!['legacy','budget-v1'].includes(mode))throw new Error('Unsupported enemy generation version: '+mode);
    if(loaded&&options.enemyGenerationMode!==undefined&&options.enemyGenerationMode!==mode)throw new Error('Cannot replace saved enemy generation mode');
    if(mode==='budget-v1'){
      const power=options.enemyPower,difficulty=options.enemyDifficulty;
      if(!power||!difficulty)throw new Error('budget-v1 requires calibrated enemy power and difficulty data');
      const balanceVersion=difficulty.balanceVersion??'p3-baseline';
      const unbound=this.save.difficultyConfigIdentity===undefined&&(this.save.round?.waveIndex??0)===0;
      if(loaded&&(!unbound||this.save.balanceVersion!==undefined)&&(this.save.balanceVersion??'p3-baseline')!==balanceVersion)throw new Error('Saved balance version mismatch');
      if(balanceVersion!=='p3-baseline')this.save.balanceVersion=balanceVersion;
      if(this.save.powerModelVersion!==power.version||this.save.powerModelCalibrationHash!==power.calibrationHash
        ||this.save.difficultyConfigVersion!==difficulty.version)throw new Error('Saved enemy power / difficulty version mismatch');
      const roster=cfg.allUnits().slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
      const skills=Object.fromEntries(Array.from(new Set(roster.map(u=>u.skillId).filter((id):id is string=>!!id))).sort().map(id=>[id,cfg.getSkill(id)]));
      const identity=combatConfigurationIdentity({difficulty,run:runConfig,units:roster,battle:cfg.battle,skills,equipment:cfg.allEquipment().slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)});
      if(this.save.difficultyConfigIdentity!==undefined&&!sameCombatConfigurationIdentity(this.save.difficultyConfigIdentity,identity))throw new Error('Saved enemy difficulty configuration mismatch');
      if(loaded&&this.save.difficultyConfigIdentity===undefined&&(this.save.round?.waveIndex??0)>0)throw new Error('Saved enemy difficulty identity missing');
      this.save.difficultyConfigIdentity=identity;
    }
    this.generation={mode,runSeed:this.save.runSeed,earlyEncounterLayout:this.save.earlyEncounterLayout ?? 'legacy',difficulty:options.enemyDifficulty&&JSON.parse(JSON.stringify(options.enemyDifficulty)),
      traits: JSON.parse(JSON.stringify(cfg.battle.traits??[])),
      power:options.enemyPower&&JSON.parse(JSON.stringify(options.enemyPower))};
    this.configureEquipment(options,loaded);
    this.random = new RunRandomContext(this.save.runSeed);
    this.configureFormation(options,loaded);
    this.cfg.setEnemyUnits(buildMonsterUnits(runConfig, cfg.allUnits()));
    this.waves = buildRunWaves(this.save.stageCount, runConfig, templates, cfg.allUnits(), this.generation);
    this.migrateRoundIndex();
    this.flow = new RoundFlow(this.waves, this.roundRules, this.save.round ?? undefined);
    this.extendEndlessWaves();
    if (options.openingEncounter && runConfig.openingEncounter && !this.save.openingEncounter
      && this.flow.wave.stage === 1 && this.flow.wave.round === 1 && this.flow.phase === 'prepare') {
      this.save.openingEncounter = { freeRefreshes: 0, lastIncomeStage: 1, offered: drawOpeningEncounters(this.random.stream('encounter', 1, 4100)) };
    }
    const opening = this.save.openingEncounter;
    if (opening) {
      opening.offered ??= [...LEGACY_OPENING_ENCOUNTERS];
      if (!encounterRules || !Array.isArray(opening.offered) || opening.offered.length !== 3 || new Set(opening.offered).size !== 3
        || opening.offered.some(id => !OPENING_ENCOUNTER_IDS.includes(id))
        || (opening.selected !== undefined && !opening.offered.includes(opening.selected))) throw new Error('Invalid saved opening encounter choices');
    }
    this.validateEquipmentProgress();
    this.save.floor = this.flow.wave.stage!;
    this.economy = new EconomySystem(undefined, this.save);
    // Older saves do not receive retroactive income for stages they have already passed.
    this.save.earlyGoldStages ??= [2, 3].filter(stage => stage < this.flow.wave.stage!
      || (stage === this.flow.wave.stage && (this.flow.wave.round! > 1 || this.flow.phase !== 'prepare')));
    this.grantStageSubsidy();
    this.level = new LevelSystem(this.save);
    const restoreShop = loaded && (this.save.shopReserved || this.save.shop.some(s => s.unitId));
    const needsStarter = !loaded || (!this.save.shopReserved && this.save.owned.length === 0);
    if (runConfig.stageEncounters) this.save.stageProgress ??= freshStageProgress();
    restoreShopState(this.save, cfg.allUnits(), cfg.battle.boardWidth, cfg.battle.ownRows);
    for (const unit of this.save.owned) unit.equipment = cfg.getEquipmentReserve(unit.equipment ?? []).slice(0, MAX_EQUIPMENT).map(item => item.id);
    this.save.equipmentReserve = cfg.getEquipmentReserve(this.save.equipmentReserve ?? []).map(item => item.id);
    if (this.save.unlockedUnits !== undefined && (!Array.isArray(this.save.unlockedUnits)
      || new Set(this.save.unlockedUnits).size !== this.save.unlockedUnits.length
      || this.save.unlockedUnits.some(id => !cfg.allUnits().some(u => u.id === id && u.specialShopUnlock)))) throw new Error('Invalid unlocked unit save');
    this.pool = new CardPool(cfg.allUnits(), this.save.pool, this.save.unlockedUnits);
    this.owned = new OwnedUnits(this.save.owned, this.save.nextOwnedUid, () => this.flow.phase !== 'battle',units=>{
      const deployed=units.filter(u=>u.location==='board');
      return deployed.length<=this.level.level+deployed.reduce((sum,u)=>sum+this.equipmentPopulationBonus(u.equipment),0);
    });
    this.owned.equipmentReserve = [...(this.save.equipmentReserve ?? [])];
    this.level.populationBonus=()=>this.owned.onBoard().reduce((sum,u)=>sum+this.equipmentPopulationBonus(u.equipment),0);
    if(this.owned.all().some(u=>this.cfg.getEquipment(u.equipment).some(item=>item.consumable)))throw new Error('Consumables cannot occupy equipment slots');
    this.validateTraitChoice();
    if (needsStarter) {
      const candidates = cfg.allUnits().filter(u => u.cost === 1 && this.pool.count(u.id) > 0).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const id = runConfig.starterSelection === 'random-one-cost'
        ? candidates[this.random.stream('starter', 1).int(0, candidates.length - 1)]?.id : runConfig.starterUnitId;
      if (!id) throw new Error('No one-cost starter available');
      if (cfg.getUnit(id).cost !== 1) throw new Error('Starter must be a one-cost unit');
      if (this.pool.take(id) && !this.owned.addToBench(id, this.save.benchSlots)) this.pool.give(id);
    }
    this.shop = new ShopSystem(this.pool, this.owned, this.economy, new Map(cfg.allUnits().map(u => [u.id, u])),
      this.random.stream('shop', this.flow.wave.id, restoreShop ? this.save.shopRollIndex : 0),
      () => this.level.level, this.save.benchSlots, restoreShop ? this.save.shop : undefined, this.save.shopReserved);
    if (!restoreShop) this.save.shopRollIndex = 0;
    this.shop.locked = this.save.shopLocked;
    if (runConfig.stageEncounters) {
      if (!this.save.equipmentTierVersion && cfg.allEquipment().every(item => item.specialShopOnly || this.stageEquipmentTiers[item.id] === 'basic')) {
        const pending = this.save.stageProgress?.pending;
        if (pending?.kind === 'specialShop' && Array.isArray(pending.offers)) {
          for (const offer of pending.offers) if (offer?.kind === 'equipment' && this.stageEquipmentTiers[offer.id] === 'basic'
            && Object.values(runConfig.stageEncounters.shop.equipmentPrices).includes(offer.price))
            offer.price = cfg.equipmentPrice(offer.id, runConfig.stageEncounters.shop.equipmentPrices.basic);
        }
        this.save.equipmentTierVersion = 'all-basic-v1';
      }
      this.stageProgression = new StageProgression(runConfig.stageEncounters, this.save.stageProgress!, cfg,
        this.pool, this.owned, this.economy, this.random, this.save.benchSlots, this.stageEquipmentTiers, () => this.level.level);
      const pendingShop = this.save.stageProgress?.pending, prices = runConfig.stageEncounters.shop.equipmentPrices;
      if (pendingShop?.kind === 'specialShop') for (const offer of pendingShop.offers) {
        if (offer.kind !== 'equipment') continue;
        const tier = this.stageEquipmentTiers[offer.id];
        if (offer.id === 'replicator_firmament' && offer.price === 6 && cfg.getEquipmentReserve([offer.id])[0]?.shopPrice === 8) offer.price = 8;
        // Adopt the authored 3→6 / 8→10 price update without charging or rerolling saved merchandise.
        if ((tier === 'basic' && cfg.getEquipmentReserve([offer.id])[0]?.shopPrice === undefined && offer.price === 3 && prices.basic === 6)
          || (tier === 'special' && cfg.getEquipmentReserve([offer.id])[0]?.shopPrice === undefined && offer.price === 8 && prices.special === 10)) offer.price = prices[tier];
      }
      this.validateStageReward();
      // Retire only a validated, unopened 10-10 chest from older saves; keep the rest of the run.
      if (isChestlessBoss(this.flow.wave) && this.flow.lastSettlement?.winner === 0
        && ['bossChoice', 'equipmentChoice'].includes(this.save.stageProgress?.pending?.kind ?? '')) delete this.save.stageProgress!.pending;
      if (this.flow.phase === 'prepare') this.stageProgression.enter(this.flow.wave);
    }
    const unfinishedBet = this.save.merchantServices!.dice;
    if(unfinishedBet&&!unfinishedBet.settled&&(!this.merchantAvailable()||unfinishedBet.waveId!==this.flow.wave.id))throw new Error('Invalid pending merchant bet');
    const forgedInventory=[...(this.save.equipmentReserve??[]),...this.save.owned.flatMap(u=>u.equipment??[])].filter(id=>!!this.save.merchantServices!.forged[id]);
    if(new Set(forgedInventory).size!==forgedInventory.length)throw new Error('Duplicate forged equipment instance');
    this.snapshot();
  }

  private configureEquipment(options:RunSessionOptions,loaded:boolean):void {
    const c=options.equipmentPolicy;
    if(!loaded&&c){this.save.enemyEquipmentVersion=this.save.enemyGenerationVersion==='budget-v1'?c.enemyVersion:'none';this.save.equipmentRewardVersion=c.rewardVersion;}
    if(!['none','equipment-policy-v1'].includes(this.save.enemyEquipmentVersion)||!['none','equipment-reward-v1'].includes(this.save.equipmentRewardVersion))throw new Error('Unsupported saved equipment version');
    if(this.save.enemyEquipmentVersion==='none'&&this.save.equipmentRewardVersion==='none')return;
    if(!c)throw new Error('Saved equipment rules require equipment policy configuration');
    validateEquipmentPolicy(c,this.cfg.allEquipment(),options.enemyPower);
    const identity=equipmentIdentity(c,this.cfg.allEquipment(),options.enemyRoles);
    const menuNewGame=loaded&&!this.save.round&&!this.save.owned.length&&!this.save.shopReserved&&this.save.equipmentConfigIdentity===undefined;
    if(loaded&&!menuNewGame&&!sameEquipmentIdentity(this.save.equipmentConfigIdentity!,identity))throw new Error('Saved equipment configuration mismatch');
    if (loaded && this.save.equipmentConfigIdentity && c.enemy.equipmentEconomy
      && !JSON.parse(this.save.equipmentConfigIdentity).policy?.enemy?.equipmentEconomy) this.save.equipmentConfigIdentity = identity;
    this.save.equipmentConfigIdentity=this.save.equipmentConfigIdentity??identity;this.equipmentPolicy=JSON.parse(JSON.stringify(c));
    if(this.save.enemyEquipmentVersion!=='none'){
      this.generation.equipmentPolicy=this.equipmentPolicy;
      this.generation.equipmentRoles=options.enemyRoles&&JSON.parse(JSON.stringify(options.enemyRoles));
    }
  }
  private validateEquipmentProgress():void {
    const p=this.save.equipmentProgress,bad=()=>{throw new Error('Invalid saved equipment reward progression');};
    if(!p||![p.lastClaimedWaveId,p.lastEvaluatedWaveId].every(n=>Number.isSafeInteger(n)&&n>=0)||p.lastClaimedWaveId>p.lastEvaluatedWaveId
      ||!p.guaranteeSatisfied||Array.isArray(p.guaranteeSatisfied)||typeof p.guaranteeSatisfied!=='object'
      ||Object.entries(p.guaranteeSatisfied).some(([k,v])=>!/^\d+$/.test(k)||Number(k)<1||typeof v!=='boolean'))bad();
    const pending=p.pending;
    if(pending){const w=this.flow.wave;
      if(!this.equipmentPolicy||this.save.equipmentRewardVersion==='none'||pending.claimed!==false||pending.waveId!==w.id
        ||pending.stage!==w.stage||pending.round!==w.round||pending.waveId<=p.lastClaimedWaveId||pending.waveId!==p.lastEvaluatedWaveId
        ||pending.rewardId!==`${this.save.equipmentRewardVersion}:${this.save.runSeed}:${w.id}`||!['elite','boss','guarantee'].includes(pending.source)
        ||!['settlement','ended'].includes(this.flow.phase)||this.flow.lastSettlement?.winner!==0
        ||!Array.isArray(pending.candidates)||!pending.candidates.length||pending.candidates.length>this.equipmentPolicy.reward.choices
        ||new Set(pending.candidates).size!==pending.candidates.length||this.cfg.getEquipmentReserve(pending.candidates).length!==pending.candidates.length)bad();
    }
  }
  get pendingEquipmentReward():PendingEquipmentReward|undefined {return this.save.equipmentProgress.pending&&JSON.parse(JSON.stringify(this.save.equipmentProgress.pending));}
  private get roundRules(){return {...this.cfg.battle,continueAtBoundary:!!this.runConfig.endlessProgression};}
  /** A cleared campaign boundary waits for a deliberate portal click, including after loading. */
  get portalAvailable(): boolean {
    const wave = this.flow.wave;
    return !!this.runConfig.endlessProgression && this.flow.phase === 'settlement' && this.flow.health > 0
      && !!this.flow.lastSettlement && wave.stage === DEFAULT_STAGE_COUNT && wave.encounterKind === 'boss'
      && wave.round === wave.roundsInStage;
  }
  enterPortal(): boolean {
    if (!this.portalAvailable || this.save.pendingTraitChoice || this.pendingStageReward || this.pendingEquipmentReward) return false;
    const snapshot = this.flow.snapshot(), nextStage = this.flow.wave.stage! + 1;
    const horizon=Math.max(nextStage,this.save.stageCount),waves = buildRunWaves(horizon, this.runConfig, this.templates, this.cfg.allUnits(), this.generation);
    this.waves = waves; this.save.stageCount = horizon;
    this.flow = new RoundFlow(waves, this.roundRules, { ...snapshot, phase: 'settlement', result: null,
      lastSettlement: snapshot.lastSettlement && { ...snapshot.lastSettlement, runResult: null } });
    return this.advanceWave();
  }
  /** Beyond the one-time stage-10 portal, cleared boundaries continue like ordinary rounds. */
  private extendEndlessWaves(): boolean {
    const wave = this.flow.wave;
    if (!this.runConfig.endlessProgression || this.flow.phase !== 'settlement' || this.flow.health <= 0
      || !this.flow.lastSettlement || wave.stage === DEFAULT_STAGE_COUNT || this.flow.waveIndex !== this.waves.length - 1) return false;
    const snapshot = this.flow.snapshot(), nextStage = wave.stage! + 1;
    this.waves = buildRunWaves(nextStage, this.runConfig, this.templates, this.cfg.allUnits(), this.generation);
    this.save.stageCount = nextStage;
    this.flow = new RoundFlow(this.waves, this.roundRules, { ...snapshot, phase:'settlement', result:null,
      lastSettlement:snapshot.lastSettlement && { ...snapshot.lastSettlement, runResult:null } });
    return true;
  }
  canAdvanceWave():boolean {return !this.portalAvailable&&!this.save.pendingTraitChoice&&!this.save.equipmentProgress.pending&&!this.pendingStageReward&&this.flow.phase==='settlement';}
  get pendingStageReward(): StagePending | undefined { const p = this.save.stageProgress?.pending; return p && JSON.parse(JSON.stringify(p)); }
  private get stageEquipmentTiers(): Record<string, import('./EquipmentPolicyTypes').EquipmentTier> {
    return this.equipmentPolicy?.tiers ?? Object.fromEntries(this.cfg.allEquipment().map(item => [item.id, item.specialShopOnly ? 'special' : this.runConfig.stageEncounters?.basicEquipmentIds.includes(item.id) ? 'basic' : 'advanced']));
  }
  private validateStageReward(): void {
    const p = this.save.stageProgress?.pending; if (!p) return;
    const w = this.flow.wave, rules = this.runConfig.stageEncounters!, bad = () => { throw new Error('Invalid pending stage reward'); };
    if (p.waveId !== w.id || typeof p.id !== 'string' || !p.id.startsWith(`${rules.version}:${this.save.runSeed}:${w.id}:`)) bad();
    if (p.kind === 'specialShop') {
      if (w.encounterKind !== 'specialShop' || this.flow.phase !== 'prepare' || !Array.isArray(p.offers) || p.offers.length !== rules.shop.slots) bad();
      for (const offer of p.offers) {
        if (!offer || !['unit', 'equipment'].includes(offer.kind) || typeof offer.bought !== 'boolean') bad();
        const price = offer.kind === 'unit' ? COST_PRICE[validCost(this.cfg.getUnit(offer.id).cost)] : this.cfg.equipmentPrice(offer.id, rules.shop.equipmentPrices[this.stageEquipmentTiers[offer.id]]);
        if (offer.price !== price || !Number.isSafeInteger(price) || price <= 0) bad();
      }
    } else {
      if (!['settlement', 'ended'].includes(this.flow.phase) || this.flow.lastSettlement?.winner !== 0) bad();
      // Already issued chests retain their previous 2/4/6/8/10 budget on upgrade.
      const previousValue=Math.min(10,2*w.stage!);
      const validValue=(value:number,current:number,previous=previousValue)=>value===current||value===previous;
      if(p.kind==='mixedChest'){
        if(p.source!==w.encounterKind||isChestlessBoss(w)||!validValue(p.value,this.stageProgression!.chestValue(w),w.encounterKind==='elite'?previousValue/2:previousValue))bad();
      }else if (p.kind === 'bossChoice') { if (w.encounterKind !== 'boss' || !validValue(p.value,this.stageProgression!.value(w.stage!))) bad(); }
      else if (p.kind === 'equipmentChoice') {
        if (w.encounterKind !== 'boss' || !Array.isArray(p.candidates) || ![4, 5].includes(p.candidates.length) || new Set(p.candidates).size !== p.candidates.length || p.candidates.some(id => !rules.basicEquipmentIds.includes(id))) bad();
      } else if (p.kind === 'unitBundle') {
        if (!['monster', 'boss'].includes(w.encounterKind!) || !validValue(p.value,this.stageProgression!.value(w.stage!)) || !Array.isArray(p.units)
          || !Number.isSafeInteger(p.deferredValue) || p.deferredValue < 0 || p.units.reduce((n, id) => n + COST_PRICE[validCost(this.cfg.getUnit(id).cost)], p.deferredValue) !== p.value) bad();
        const reserved = this.save.stageProgress!.unitReserve.slice();
        for (const id of p.units) { const i = reserved.indexOf(id); if (i < 0) bad(); reserved.splice(i, 1); }
      } else bad();
    }
  }
  claimStageReward(action: StageChoice): ActionResult {
    if (this.save.merchantServices?.dice && !this.save.merchantServices.dice.settled) return fail('dice_rolling');
    if (this.save.pendingTraitChoice) return fail('trait_choice_pending');
    if (!this.stageProgression) return fail('stage_rewards_disabled');
    const result = this.stageProgression.act(action, this.flow.wave,this.cfg.battle.initialHealth-this.flow.health);
    if (!result.ok) return result;
    if (result.stageReward?.kind === 'health') result.stageReward.amount = this.flow.restoreHealth(result.stageReward.amount);
    if(result.stageReward?.kind==='mixed')result.stageReward.health=this.flow.restoreHealth(result.stageReward.health);
    if (result.completeShop) {
      if (!this.flow.completeEncounter()) throw new Error('Cannot complete shop encounter');
      this.extendEndlessWaves();
      const state = this.economy.snapshot();
      this.save.lastReward = { expGained: 0, levelUps: 0, breakdown: { floorIncome: 0, winBonus: 0, interest: 0, streakBonus: 0, extraIncome: 0,
        total: 0, goldBefore: state.gold, goldAfter: state.gold, winStreak: state.winStreak, loseStreak: state.loseStreak } };
    }
    this.snapshot(); return { ok: true, ...(result.stageReward ? { stageReward: result.stageReward } : {}) };
  }
  private merchantAvailable(): boolean {
    return this.flow.phase === 'prepare' && this.flow.wave.encounterKind === 'specialShop'
      && this.pendingStageReward?.kind === 'specialShop' && !this.save.pendingTraitChoice;
  }
  get merchantDice(): DiceBet | undefined {
    const bet = this.save.merchantServices!.dice;
    return bet?.waveId === this.flow.wave.id ? { ...bet, picks: [...bet.picks] } : undefined;
  }
  forgeLevel(id: string): number { return this.save.merchantServices!.forged[id]?.upgrades.length ?? 0; }
  canForge(id: string): boolean {
    return !!this.save.merchantServices!.forged[id] || this.cfg.allEquipment().some(e => e.id === id && id.startsWith('basic_') && !e.consumable && !e.traitChoice);
  }
  enhanceEquipment(reserveIndex: number, expectedId: string): ActionResult {
    if (!this.merchantAvailable() || (this.merchantDice && !this.merchantDice.settled)) return fail('merchant_unavailable');
    if (!Number.isInteger(reserveIndex) || reserveIndex < 0 || this.owned.equipmentReserve[reserveIndex] !== expectedId || !this.canForge(expectedId)) return fail('invalid_equipment');
    const state = this.save.merchantServices!, previous = state.forged[expectedId], level = this.forgeLevel(expectedId), cost = forgePrice(level);
    if (!Number.isSafeInteger(cost) || !Number.isSafeInteger(state.forgeRoll + 1) || !Number.isSafeInteger(state.nextUid + 1)) return fail('attribute_overflow');
    if (this.economy.gold < cost) return fail('not_enough_gold');
    const item = this.cfg.getEquipmentReserve([expectedId])[0], candidates = forgeCandidates(item, level);
    if (!candidates.length) return fail('invalid_equipment');
    const stat = candidates[this.random.stream('forge', this.flow.wave.id, state.forgeRoll).int(0, candidates.length - 1)];
    const id = previous ? expectedId : `forged_${state.nextUid}`;
    const record = { baseId: previous?.baseId ?? expectedId, upgrades: [...(previous?.upgrades ?? []), stat] };
    let upgraded; try { upgraded = forgedItem(this.cfg, id, record); } catch { return fail('attribute_overflow'); }
    if (!this.economy.spend(cost)) return fail('not_enough_gold');
    state.forged[id] = record; state.forgeRoll++; if (!previous) state.nextUid++;
    this.cfg.registerRunEquipment(upgraded); this.owned.equipmentReserve[reserveIndex] = id;
    this.snapshot(); return ok();
  }
  beginDiceBet(stake: number, picks: number[]): ActionResult {
    if (!this.merchantAvailable() || (this.merchantDice && !this.merchantDice.settled)) return fail('merchant_unavailable');
    if (![1,5,10].includes(stake) || !validDicePicks(picks)) return fail('invalid_bet');
    const state = this.save.merchantServices!;
    const maximumGold=this.economy.gold+stake*(diceMultiplier(picks.length)-1);
    if (!Number.isSafeInteger(state.diceRoll + 1) || !Number.isSafeInteger(maximumGold) || maximumGold > 999999) return fail('attribute_overflow');
    if (!this.economy.spend(stake)) return fail('not_enough_gold');
    const face = this.random.stream('dice', this.flow.wave.id, state.diceRoll).int(1, 6);
    state.dice = { id: ++state.diceRoll, waveId: this.flow.wave.id, stake, picks: [...picks].sort((a,b)=>a-b), face, settled: false };
    this.snapshot(); return ok();
  }
  finishDiceBet(id: number): ActionResult {
    const bet = this.merchantDice;
    if (!this.merchantAvailable() || !bet || bet.id !== id || bet.settled) return fail('invalid_bet');
    const payout = dicePayout(bet);
    if (!Number.isSafeInteger(this.economy.gold + payout)) return fail('attribute_overflow');
    this.save.merchantServices!.dice!.settled = true; this.economy.gold += payout;
    this.snapshot(); return ok();
  }
  get explorerPoints(): number { return this.save.explorerProgress!.points; }
  get explorerChestQualityRates(): number[] {
    return explorerLootQualityRates(this.explorerPoints,this.runConfig.stageEncounters?.chestReward);
  }
  get explorerChestValue(): number {
    const effect=this.cfg.battle.traits?.find(t=>t.id==='explorer')?.breakpoints[0]?.explorer;
    return Math.ceil(this.explorerPoints*(effect?.rewardValuePerPoint??0));
  }
  get explorerChestVisible(): boolean {
    const active=resolveTraits(this.cfg.battle.traits??[],this.owned.onBoard().map(u=>this.cfg.equipmentStats(this.cfg.getUnit(u.unitId),u.equipment)),this.cfg.allUnits())
      .some(t=>!!t.active?.explorer);
    return this.explorerPoints>0||active;
  }
  get explorerChestOpenable(): boolean {
    return this.explorerChestVisible&&this.explorerPoints>0&&this.flow.phase!=='battle'&&!this.flow.result
      &&!this.pendingOpeningEncounter&&!this.save.pendingTraitChoice;
  }
  openExplorerChest(): ActionResult {
    if(!this.explorerChestOpenable||!this.stageProgression)return fail('explorer_chest_unavailable');
    const reward=this.stageProgression.grantExplorerReward(this.explorerChestValue,this.flow.wave.id,this.cfg.battle.initialHealth-this.flow.health,this.explorerPoints);
    reward.health=this.flow.restoreHealth(reward.health);
    this.save.explorerProgress!.points=0;this.save.explorerProgress!.lastOpenedWaveId=this.flow.wave.id;
    this.snapshot();return {ok:true,stageReward:reward};
  }
  claimEquipmentReward(index:number):ActionResult {
    const progress=this.save.equipmentProgress,pending=progress.pending;
    if(!pending||pending.claimed||pending.waveId<=progress.lastClaimedWaveId)return fail('no_pending_equipment_reward');
    if(!Number.isInteger(index)||index<0||index>=pending.candidates.length)return fail('invalid_reward_choice');
    const id=pending.candidates[index];if(!this.cfg.getEquipmentReserve([id]).length)return fail('invalid_equipment');
    // The existing reserve is unbounded; its 24 UI slots are paged, not an inventory cap.
    this.owned.equipmentReserve.push(id);progress.lastClaimedWaveId=pending.waveId;progress.guaranteeSatisfied[pending.stage]=true;
    delete progress.pending;
    if(this.save.lastEquipmentReward)this.save.lastEquipmentReward.rewardChoice=id;
    this.snapshot();return ok();
  }

  private configureFormation(options:RunSessionOptions,loaded:boolean):void {
    if(!['l0-compat',FORMATION_VERSION].includes(this.save.formationVersion))throw new Error('Unsupported saved formation version');
    const requested=options.formation??this.save.formationOverride;
    if(!['auto','L0','L1','L2','L3'].includes(requested))throw new Error('Unsupported saved formation level');
    const unbound=(this.save.round?.waveIndex??0)===0&&this.save.formationConfigIdentity===undefined;
    if(loaded&&options.formation!==undefined&&requested!==this.save.formationOverride&&!unbound)throw new Error('Cannot replace saved formation rules');
    if(!loaded||unbound){
      this.save.formationOverride=requested;
      if(requested==='L0')this.save.formationVersion='l0-compat';
      else if(options.formation!==undefined)this.save.formationVersion=FORMATION_VERSION;
    }
    if(this.save.formationVersion==='l0-compat'){
      if(requested!=='L0')throw new Error('Legacy formation save is pinned to L0');return;
    }
    if(this.save.formationVersion!==FORMATION_VERSION)throw new Error('Unsupported saved formation version');
    if(!options.formationConfig||!options.enemyRoles||!options.enemyPower)throw new Error('Formation requires versioned config, roles and power model');
    if(this.cfg.battle.boardWidth!==7||this.cfg.battle.boardHeight!==8||this.cfg.battle.ownRows!==4)throw new Error('Formation requires current 7x8 odd-r board');
    const roster=this.cfg.allUnits(),skills=Object.fromEntries(Array.from(new Set(roster.map(u=>u.skillId).filter((id):id is string=>!!id))).sort().map(id=>[id,this.cfg.getSkill(id)]));
    let savedFormationIdentity:string|undefined;
    if(this.save.formationConfigIdentity!==undefined){
      try{savedFormationIdentity=JSON.parse(this.save.formationConfigIdentity).formation;}catch{throw new Error('Saved formation configuration mismatch');}
      if(typeof savedFormationIdentity!=='string')throw new Error('Saved formation configuration mismatch');
    }
    const engine=new EnemyFormation(options.formationConfig,options.enemyRoles,roster,skills,new EnemyPowerModel(options.enemyPower),this.runConfig.enemyProgression.cells,savedFormationIdentity);
    const identity=stableEnemyJson({formation:engine.identity,templates:extractFormationTemplates(this.templates),override:requested,
      model:{version:options.enemyPower.version,calibrationHash:options.enemyPower.calibrationHash}});
    if(this.save.formationConfigIdentity!==undefined&&this.save.formationConfigIdentity!==identity)throw new Error('Saved formation configuration mismatch');
    if(loaded&&!unbound&&this.save.formationConfigIdentity===undefined)throw new Error('Saved formation identity missing');
    this.save.formationConfigIdentity=identity;this.formationEngine=engine;
  }
  playerFormationSnapshot():PlayerFormationSnapshot {
    if(!this.formationEngine)throw new Error('Player formation snapshot requires formation configuration');
    return {units:this.owned.onBoard().map(u=>{const cfg=this.cfg.getUnit(u.unitId),skill=cfg.skillId?{[cfg.skillId]:this.cfg.getSkill(cfg.skillId)}:{};
      const role=resolveEnemyRole(cfg,skill,this.formationEngine!.roles);
      return {unitId:u.unitId,star:u.star,equipment:[...(u.equipment??[])],x:u.x,y:u.y,role:role.role,range:cfg.range,tags:role.tags};})
      .sort((a,b)=>a.y-b.y||a.x-b.x||(a.unitId<b.unitId?-1:a.unitId>b.unitId?1:0))};
  }
  private solveFormation(final:boolean):EnemyFormationResult {
    const wave=this.flow.wave,engine=this.formationEngine;
    if(wave.goldBudget||!engine||wave.encounterKind==='monster'||wave.encounterKind==='specialShop')return compatibilityFormation(wave.enemies);
    const kind=wave.waveKind??(wave.stage===1?'intro':'normal');
    let settings=formationSettings(engine.config,wave.stage!,wave.round!,wave.roundsInStage!,kind,this.save.formationOverride);
    const targeted=final&&settings.level==='L3';
    if(!final&&settings.level==='L3')settings={...settings,level:'L2',strength:settings.spacingStrength,counterStrength:0};
    const templates=extractFormationTemplates(this.templates),template=templates[Math.min(wave.stage!-2,templates.length-1)];
    return engine.solve({runSeed:this.save.runSeed,globalWaveId:wave.id,stage:wave.stage!,round:wave.round!,roundsInStage:wave.roundsInStage!,waveKind:kind,
      settings,enemies:wave.enemies,template,playerSnapshot:targeted?this.playerFormationSnapshot():undefined});
  }
  private currentFormation():EnemyFormationResult {
    const id=this.flow.wave.id;
    if(this.lockedFormation?.waveId===id)return this.lockedFormation.result;
    if(this.previewFormation?.waveId!==id)this.previewFormation={waveId:id,result:this.solveFormation(false)};
    return this.previewFormation.result;
  }
  get formation():EnemyFormationResult {return JSON.parse(JSON.stringify(this.currentFormation()));}

  private migrateRoundIndex(): void {
    if (this.save.runRulesVersion < 2 && this.save.round) {
      const index = this.save.round.waveIndex, intro = this.runConfig.introWaves.length;
      if (index >= intro) {
        const stage = Math.min(this.save.stageCount, 2 + Math.floor((index - intro) / 10));
        const stageWaves = this.waves.filter(w => w.stage === stage);
        const wave = stageWaves[Math.min(stageWaves.length, (index - intro) % 10 + 1) - 1];
        this.save.round.waveIndex = this.waves.indexOf(wave);
        if (this.save.round.lastSettlement) Object.assign(this.save.round.lastSettlement, { waveId: wave.id, stage, round: wave.round });
      }
    }
    this.save.runRulesVersion = 2;
  }

  get state(): RunSessionState {
    return { runSeed: this.save.runSeed, rulesVersion: this.save.rulesVersion, stage: this.flow.wave.stage!, round: this.flow.wave.round!,
      waveId: this.flow.wave.id, playerHp: this.flow.health, gold: this.economy.gold, level: this.level.level,
      xp: this.level.exp, phase: this.flow.phase, result: this.flow.result };
  }
  get incomePreview() {
    const preview = this.economy.preview(this.flow.wave.stage!,this.save.openingEncounter?.selected==='bounty'?this.runConfig.openingEncounter!.victoryGold:0,this.flow.wave.encounterKind!=='monster');
    if (this.flow.wave.round === 1 && this.save.earlyGoldStages!.includes(this.flow.wave.stage!))
      preview.entrySubsidy = EARLY_STAGE_GOLD[this.flow.wave.stage!];
    return preview;
  }
  get battle(): BattleSim | null { return this.activeBattle; }
  /** Opening encounters replace the ordinary shop for the whole first round. */
  get openingShopLocked(): boolean { return !!this.save.openingEncounter && this.flow.wave.stage === 1 && this.flow.wave.round === 1; }
  get unitSellingLocked(): boolean { return this.flow.wave.stage === 1 && this.flow.wave.round === 1; }
  get pendingOpeningEncounter(): boolean { return !!this.save.openingEncounter && !this.save.openingEncounter.selected; }
  get freeRefreshes(): number { return this.save.openingEncounter?.freeRefreshes ?? 0; }
  get openingEncounterOptions() {
    const rules = this.runConfig.openingEncounter, state = this.save.openingEncounter;
    if (!rules || !state) return [];
    const choices = openingEncounterChoices(rules);
    return state.offered!.map(id => choices.find(choice => choice.id === id)!);
  }
  chooseOpeningEncounter(id: import('./OpeningEncounter').OpeningEncounterId): ActionResult {
    if (!this.pendingOpeningEncounter || this.flow.phase !== 'prepare' || this.flow.wave.stage !== 1 || this.flow.wave.round !== 1
      || !this.save.openingEncounter!.offered!.includes(id)) return fail('invalid_encounter_choice');
    this.save.openingEncounter!.selected = id; this.snapshot(); return ok();
  }
  private rewardLevelUps(count: number): void {
    if (this.save.openingEncounter?.selected === 'inspiration')
      this.save.openingEncounter.freeRefreshes += count * this.runConfig.openingEncounter!.refreshesPerLevel;
  }
  private grantStageSubsidy(): void {
    const stage = this.flow.wave.stage!, amount = EARLY_STAGE_GOLD[stage];
    if (!amount || this.flow.phase !== 'prepare' || this.flow.wave.round !== 1 || this.save.earlyGoldStages!.includes(stage)) return;
    this.economy.add(amount);
    this.save.earlyGoldStages!.push(stage);
  }
  private enterEncounterStage(): void {
    this.grantStageSubsidy();
    const state = this.save.openingEncounter, rules = this.runConfig.openingEncounter;
    if (state?.selected !== 'stipend' || !rules || this.flow.wave.stage! <= state.lastIncomeStage) return;
    if (this.flow.wave.stage! >= rules.incomeStartStage) this.economy.add(rules.incomePerStage);
    state.lastIncomeStage = this.flow.wave.stage!;
  }
  get battleSeed(): number { return this.random.seed('battle', this.flow.wave.id); }
  private get canTrade(): boolean { return !this.save.pendingTraitChoice && (this.flow.phase === 'prepare' || this.flow.phase === 'battle'); }

  get pendingTraitChoice(): PendingTraitChoice | undefined {
    return this.save.pendingTraitChoice && JSON.parse(JSON.stringify(this.save.pendingTraitChoice));
  }
  private validateTraitChoice(): void {
    const p = this.save.pendingTraitChoice;
    if (!p) return;
    const unit = this.owned.get(p.uid);
    if (this.flow.phase !== 'prepare' || !unit || !Number.isInteger(p.slot) || p.slot < 0
      || unit.equipment?.[p.slot] !== p.equipmentId || !this.cfg.getEquipmentReserve([p.equipmentId])[0]?.traitChoice
      || !Array.isArray(p.candidates) || p.candidates.length !== 4 || new Set(p.candidates).size !== 4
      || p.candidates.some(id => !this.cfg.battle.traits?.some(trait => trait.id === id))) throw new Error('Invalid saved trait choice');
  }
  chooseEquipmentTrait(index: number): ActionResult {
    const p = this.save.pendingTraitChoice;
    if (!p || this.flow.phase !== 'prepare' || !Number.isInteger(index) || !p.candidates[index]) return fail('invalid_trait_choice');
    this.validateTraitChoice();
    const unit = this.owned.get(p.uid)!;
    unit.equipment![p.slot] = `${p.equipmentId}__${p.candidates[index]}`;
    delete this.save.pendingTraitChoice;
    this.snapshot(); return ok();
  }

  buyShopSlot(index: number): ActionResult {
    if (this.openingShopLocked || this.pendingStageReward?.kind === 'specialShop') return fail('shop_occupied');
    if (!this.canTrade) return fail('fighting');
    if (!Number.isInteger(index)) return fail('slot_empty');
    const result = this.shop.buy(index);
    return result.error ? fail(result.error) : { ok: true, ...result };
  }
  refreshShop(): ActionResult {
    if (this.openingShopLocked || this.pendingStageReward?.kind === 'specialShop') return fail('shop_occupied');
    if (!this.canTrade) return fail('fighting');
    const index = this.save.shopRollIndex + 1;
    this.shop.setRollRng(this.random.stream('shop', this.flow.wave.id, index));
    const free = this.freeRefreshes > 0;
    const error = this.shop.refresh(free);
    if (error) return fail(error);
    if (free) this.save.openingEncounter!.freeRefreshes--;
    this.save.shopRollIndex = index;
    return ok();
  }
  toggleShopLock(): ActionResult {
    if (this.openingShopLocked || this.pendingStageReward?.kind === 'specialShop') return fail('shop_occupied');
    if (!this.canTrade) return fail('fighting');
    this.shop.locked = !this.shop.locked; return ok();
  }
  buyExp(): ActionResult {
    if (this.pendingOpeningEncounter) return fail('encounter_pending');
    if (this.openingShopLocked) return fail('shop_occupied');
    if (!this.canTrade) return fail('fighting');
    if (this.level.level >= MAX_LEVEL) return fail('max_level');
    if (!this.economy.spend(EXP_PURCHASE.gold)) return fail('not_enough_gold');
    this.rewardLevelUps(this.level.addExp(EXP_PURCHASE.exp).length); return ok();
  }
  private equipmentPopulationBonus(ids: string[] = []): number {
    return this.cfg.getEquipment(ids).reduce((sum,item)=>sum+(item.unitCapBonus??0),0);
  }
  /** Includes a crown entering/leaving deployment, including board/bench swaps. */
  unitCapAfterMove(uid:number,to:{location:'board'|'bench';x:number;y:number}):number {
    const u=this.owned.get(uid);if(!u||u.location===to.location)return this.level.unitCap;
    const other=to.location==='board'?this.owned.atBoard(to.x,to.y):this.owned.atBench(to.y);
    const difference=this.equipmentPopulationBonus(u.equipment)-this.equipmentPopulationBonus(other?.equipment);
    return this.level.unitCap+(to.location==='board'?difference:-difference);
  }
  moveUnit(uid: number, to: { location: 'board' | 'bench'; x: number; y: number }): ActionResult {
    const u = this.owned.get(uid);
    if (!u) return fail('not_owned');
    if (!to || !['board', 'bench'].includes(to.location) || !Number.isInteger(to.x) || !Number.isInteger(to.y)) return fail('invalid_position');
    if (!this.canTrade) return fail('fighting');
    // In battle only reserve-to-reserve rearrangement is legal; the combat snapshot is fixed.
    if (this.flow.phase === 'battle' && (u.location === 'board' || to.location === 'board')) return fail('fighting');
    if (to.location === 'bench') {
      if (to.x !== -1 || to.y < 0 || to.y >= this.save.benchSlots) return fail('invalid_position');
    } else {
      if (to.x < 0 || to.x >= this.cfg.battle.boardWidth || to.y < 0 || to.y >= this.cfg.battle.ownRows) return fail('invalid_position');
    }
    const other=to.location==='board'?this.owned.atBoard(to.x,to.y):this.owned.atBench(to.y);
    const population=this.owned.onBoard().length+(u.location===to.location||other?0:to.location==='board'?1:-1);
    if(population>this.unitCapAfterMove(uid,to))return fail('population_cap');
    try {
      return this.owned.transaction(()=>{
        if(!this.owned.move(uid,to))return fail('invalid_position');
        if(this.owned.onBoard().length>this.level.unitCap)throw new Error('population_cap');
        return ok();
      });
    }catch{return fail('population_cap');}
  }
  sellUnit(uid: number): ActionResult {
    if (this.unitSellingLocked) return fail('opening_sell_locked');
    const unit = this.owned.get(uid);
    if (!this.canTrade || (this.flow.phase === 'battle' && unit?.location === 'board')) return fail('fighting');
    if(unit?.location==='board'&&this.owned.onBoard().length-1>this.level.unitCap-this.equipmentPopulationBonus(unit.equipment))return fail('population_cap');
    const sold = this.shop.sell(uid);
    return sold ? { ok: true, gold: sold.gold } : fail('not_owned');
  }
  equipItem(uid: number, reserveIndex: number): ActionResult {
    if (this.save.pendingTraitChoice) return fail('trait_choice_pending');
    if (this.flow.phase !== 'prepare') return fail('fighting');
    if (!Number.isInteger(reserveIndex) || reserveIndex < 0) return fail('invalid_equipment');
    const id = this.owned.equipmentReserve[reserveIndex];
    if (!id || !this.cfg.getEquipmentReserve([id]).length) return fail('invalid_equipment');
    const target=this.owned.get(uid);if(!target)return fail('not_owned');
    const item=this.cfg.getEquipment([id])[0];
    if (item.consumable?.kind === 'permanentStat') {
      const { stat, amount } = item.consumable;
      const totalKey = stat === 'hp' ? 'permanentMaxHp' : stat === 'physicalPower' ? 'permanentPhysicalPower' : 'permanentSpellPower';
      const sourceKey = stat === 'hp' ? 'itemHealth' : stat === 'physicalPower' ? 'itemPhysicalPower' : 'itemSpellPower';
      const total = (target[totalKey] ?? 0) + amount, source = (target[sourceKey] ?? 0) + amount;
      if (!Number.isSafeInteger(total) || !Number.isSafeInteger(source)) return fail('attribute_overflow');
      target[totalKey] = total; target[sourceKey] = source;
      this.owned.equipmentReserve.splice(reserveIndex, 1);
      return ok();
    }
    if(item.consumable?.kind === 'copyUnit'){
      if(this.cfg.getUnit(target.unitId).cost>item.consumable.maxCost)return fail('copy_cost_limit');
      if(this.pool.count(target.unitId)<1)return fail('pool_empty');
      const deliver=(owned:OwnedUnits)=>{
        owned.equipmentReserve.splice(reserveIndex,1);
        if(owned.inBench().length<this.save.benchSlots){
          if(!owned.addToBench(target.unitId,this.save.benchSlots))throw new Error('bench_full');
        }else{owned.forceAdd(target.unitId);owned.tryMerge(target.unitId);if(owned.inBench().some(u=>u.y<0))throw new Error('bench_full');}
      };
      const projected=new OwnedUnits(this.owned.snapshot(),this.owned.nextUnitUid,()=>true,this.owned.canMergeResult);projected.equipmentReserve=[...this.owned.equipmentReserve];
      try{deliver(projected);}catch{return fail('bench_full');}
      const projectedCap=this.level.level+projected.onBoard().reduce((sum,u)=>sum+this.equipmentPopulationBonus(u.equipment),0);
      if(projected.onBoard().length>projectedCap)return fail('population_cap');
      this.owned.transaction(()=>deliver(this.owned));
      if(!this.pool.take(target.unitId))throw new Error('Copy target stock changed');
      return {ok:true,copiedUnitId:target.unitId};
    }
    const needsChoice = item.traitChoice;
    const candidates = needsChoice ? traitEmblemChoices(this.cfg, this.owned.all(), uid,
      this.random.stream('reward', this.flow.wave.id, 5100 + (this.save.traitChoiceRoll ?? 0))) : [];
    if (needsChoice && candidates.length !== 4) return fail('insufficient_traits');
    if (!this.owned.equip(uid, id)) return fail('equipment_full');
    if (needsChoice) {
      this.save.traitChoiceRoll = (this.save.traitChoiceRoll ?? 0) + 1;
      this.save.pendingTraitChoice = { uid, slot: this.owned.get(uid)!.equipment!.length - 1, equipmentId: id, candidates };
    }
    this.owned.equipmentReserve.splice(reserveIndex, 1); return ok();
  }
  unequipItem(uid: number, slot: number): ActionResult {
    if (this.save.pendingTraitChoice) return fail('trait_choice_pending');
    if (this.flow.phase !== 'prepare') return fail('fighting');
    const unit=this.owned.get(uid),id=unit?.equipment?.[slot];
    if(id&&unit?.location==='board'&&this.owned.onBoard().length>this.level.unitCap-this.equipmentPopulationBonus([id]))return fail('population_cap');
    return this.owned.unequip(uid, slot) ? ok() : fail('invalid_equipment');
  }
  equipmentRecycleGold(reserveIndex: number): number {
    if (!Number.isInteger(reserveIndex) || reserveIndex < 0) return 0;
    const id = this.owned.equipmentReserve[reserveIndex];
    if (!id) return 0;
    const item = this.cfg.getEquipmentReserve([id])[0];
    if (!item) return 0;
    const tier = this.equipmentPolicy?.tiers[id] ?? (item.specialShopOnly ? 'special' : 'basic');
    const price = this.cfg.equipmentPrice(id, this.runConfig.stageEncounters?.shop.equipmentPrices[tier] ?? 0);
    return Number.isSafeInteger(price) && price > 0 ? Math.floor(price / 2) : 0;
  }
  recycleEquipment(reserveIndex: number, equipmentId: string): ActionResult {
    if (this.save.pendingTraitChoice) return fail('trait_choice_pending');
    if (this.pendingOpeningEncounter) return fail('encounter_pending');
    if (this.flow.phase !== 'prepare') return fail('fighting');
    if (!Number.isInteger(reserveIndex) || reserveIndex < 0 || !equipmentId
      || this.owned.equipmentReserve[reserveIndex] !== equipmentId) return fail('invalid_equipment');
    const gold = this.equipmentRecycleGold(reserveIndex);
    if (gold <= 0 || !Number.isSafeInteger(this.economy.gold + gold)) return fail('invalid_equipment');
    this.owned.equipmentReserve.splice(reserveIndex, 1);
    this.economy.gold += gold;
    return { ok: true, gold };
  }
  act(action: RunAction): ActionResult {
    const result = this.applyAction(action);
    if (result.ok && !this.save.pendingTraitChoice && this.flow.phase !== 'battle') this.stageProgression?.collect(this.flow.wave);
    return result;
  }
  private applyAction(action: RunAction): ActionResult {
    switch (action.type) {
      case 'openExplorerChest': return this.openExplorerChest();
      case 'chooseEquipmentTrait': return this.chooseEquipmentTrait(action.index);
      case 'chooseOpeningEncounter': return this.chooseOpeningEncounter(action.id);
      case 'buy': return this.buyShopSlot(action.index);
      case 'refresh': return this.refreshShop();
      case 'lock': return this.toggleShopLock();
      case 'buyExp': return this.buyExp();
      case 'move': return this.moveUnit(action.uid, action.to);
      case 'sell': return this.sellUnit(action.uid);
      case 'equip': return this.equipItem(action.uid, action.reserveIndex);
      case 'unequip': return this.unequipItem(action.uid, action.slot);
      case 'recycleEquipment': return this.recycleEquipment(action.reserveIndex, action.equipmentId);
      case 'claimEquipmentReward':return this.claimEquipmentReward(action.index);
      case 'stageChoice': return this.claimStageReward(action);
      default: return fail('invalid_action');
    }
  }
  playerPort(): RunPlayerPort {
    return { act: action => this.act(action), observe: () => ({ state: this.state, unitCap: this.level.unitCap,
      explorerPoints:this.explorerPoints,explorerChestValue:this.explorerChestValue,
      ...(this.pendingTraitChoice ? { pendingTraitChoice: this.pendingTraitChoice } : {}),
      ...(this.pendingOpeningEncounter ? { pendingOpeningEncounter: true } : {}), freeRefreshes: this.freeRefreshes,
      boardWidth: this.cfg.battle.boardWidth, ownRows: this.cfg.battle.ownRows, benchSlots: this.save.benchSlots,
      shop: this.shop.snapshot().map(slot => { const cost = slot.unitId ? validCost(this.cfg.getUnit(slot.unitId).cost ?? 1) : 1;
        return { ...slot, cost, price: slot.unitId ? COST_PRICE[cost] : 0 }; }), shopLocked: this.shop.locked,
      units: this.owned.snapshot().map(u => ({ ...u, cost: this.cfg.getUnit(u.unitId).cost ?? 1 })),
      equipmentReserve: [...this.owned.equipmentReserve],...(this.pendingEquipmentReward?{pendingEquipmentReward:this.pendingEquipmentReward}:{}),
      ...(this.pendingStageReward ? { pendingStageReward: this.pendingStageReward } : {}),
      unitRewardReserve: [...(this.save.stageProgress?.unitReserve ?? [])], deferredUnitValue: this.save.stageProgress?.unitCredit ?? 0 }) };
  }

  /** Opt-in richer public surface for formal bots. The original player port retains its P1-A contract. */
  botPort():BotPlayerPort {
    const freeze=<T>(value:T):T=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
    const units=this.cfg.allUnits(),skills=Object.fromEntries(Array.from(new Set(units.map(u=>u.skillId).filter((id):id is string=>!!id))).sort().map(id=>[id,this.cfg.getSkill(id)]));
    const catalog:BotCatalog=freeze(JSON.parse(JSON.stringify({units,skills,equipment:this.cfg.allEquipment(),economy:this.economy.config,
      levelUpExp:[...LEVEL_UP_EXP],xpPurchase:EXP_PURCHASE,refreshCost:REFRESH_COST,initialHealth:this.cfg.battle.initialHealth,maxEquipment:MAX_EQUIPMENT})));
    const player=this.playerPort();let preview:{id:number;placements:WaveConfig['enemies']}|undefined;
    return {act:action=>player.act(action),observe:()=>{
      if(preview?.id!==this.flow.wave.id)preview={id:this.flow.wave.id,placements:freeze(this.formation.placements)};
      return {...player.observe(),catalog,currentEnemyPreview:preview.placements,waveKind:this.flow.wave.waveKind??(this.flow.wave.stage===1?'intro':'normal')};
    }};
  }

  /** Preview creates a throwaway BattleSim. It never consumes any stream or replaces an active battle. */
  createPreview(): { sim: BattleSim; battleIds: Map<number, number> } {
    const placements: Placement[] = this.currentFormation().placements.map(e => ({ cfg: this.cfg.getUnit(e.unitId), side: 1,
      x: e.x, y: e.y, star: e.star, statMultiplier: e.statMultiplier, healthMultiplier: e.healthMultiplier, damageAmp: e.damageAmp, damageReduction: e.damageReduction, equipment:e.equipment }));
    const battleIds = new Map<number, number>();
    for (const u of this.owned.onBoard().slice().sort((a, b) => a.uid - b.uid)) {
      battleIds.set(u.uid, placements.length + 1);
      placements.push({ cfg: this.cfg.getUnit(u.unitId), side: 0, x: u.x, y: u.y, star: u.star, equipment: u.equipment, permanentMaxHp: u.permanentMaxHp, soulLampHealth: u.soulLampHealth, permanentSpellPower: u.permanentSpellPower, permanentPhysicalPower:u.permanentPhysicalPower });
    }
    return { sim: new BattleSim(this.cfg, placements, { seed: this.battleSeed, astralSeed: this.save.runSeed, w: this.cfg.battle.boardWidth,
      h: this.cfg.battle.boardHeight, maxTicks: this.cfg.battle.maxTicks }), battleIds };
  }
  startBattle(): BattleSim | null {
    if (this.pendingOpeningEncounter) return null;
    if (this.save.pendingTraitChoice||this.pendingStageReward||this.flow.wave.encounterKind==='specialShop'||this.save.equipmentProgress.pending||this.flow.phase !== 'prepare' || !this.owned.onBoard().length || this.owned.onBoard().length > this.level.unitCap) return null;
    this.lockedFormation={waveId:this.flow.wave.id,result:this.solveFormation(true)};
    const { sim, battleIds } = this.createPreview();
    if (!this.flow.startBattle()) return null;
    this.activeExplorer=isExplorerBattle(this.flow.wave,this.cfg.allUnits())
      ? resolveTraits(this.cfg.battle.traits??[],sim.units.filter(u=>u.side===0).map(u=>u.cfg),this.cfg.allUnits())
        .find(t=>!!t.active?.explorer)?.active?.explorer : undefined;
    if(this.activeExplorer)this.activeExplorer={...this.activeExplorer};
    this.activeBattleIds = battleIds; this.activeBattle = sim; sim.start(); return sim;
  }
  settleBattle(extraIncome = 0): SessionSettlement | null {
    const sim = this.activeBattle;
    if (!sim?.finished || this.flow.phase !== 'battle') return null;
    if (!Number.isSafeInteger(extraIncome) || extraIncome < 0) throw new Error('Invalid extra income');
    const round = this.flow.settle(sim.winner, sim.units.filter(u => u.side === 1 && u.alive).length);
    if (!round) return null;
    settleExplorerProgress(this.save.explorerProgress!,this.activeExplorer,sim.alliedKillCounts[0],sim.winner,this.flow.wave.id);
    if (this.extendEndlessWaves()) round.runResult = null;
    for (const [uid, battleId] of this.activeBattleIds) {
      const owned = this.owned.get(uid), combat = sim.units.find(unit => unit.id === battleId && unit.side === 0);
      if (owned && combat && combat.permanentSpellPowerGained > 0)
        owned.permanentSpellPower = (owned.permanentSpellPower ?? 0) + combat.permanentSpellPowerGained;
      if (owned && combat && combat.permanentPhysicalPowerGained > 0)
        owned.permanentPhysicalPower = (owned.permanentPhysicalPower ?? 0) + combat.permanentPhysicalPowerGained;
      if (owned && combat && combat.permanentHealthGained > 0) {
        owned.permanentMaxHp = (owned.permanentMaxHp ?? 0) + combat.permanentHealthGained;
        owned.soulLampHealth = (owned.soulLampHealth ?? 0) + combat.permanentHealthGained;
      }
    }
    if (this.save.openingEncounter?.selected === 'tempered') {
      for (const [uid, battleId] of this.activeBattleIds) {
        const unit = this.owned.get(uid);
        if (unit && sim.units.some(u => u.id === battleId && u.side === 0 && u.alive))
          unit.permanentMaxHp = (unit.permanentMaxHp ?? 0) + this.runConfig.openingEncounter!.survivorMaxHp;
      }
    }
    const selected = this.save.openingEncounter?.selected, rules = this.runConfig.openingEncounter;
    const encounterGold = selected === 'bounty' && sim.winner === 0 ? rules!.victoryGold : 0;
    const expGained = EXP_PER_BATTLE + (selected === 'study' ? rules!.battleExp : 0);
    if (selected === 'renewal' && sim.winner === 0) this.flow.restoreHealth(rules!.victoryHeal);
    const breakdown = this.economy.settleBattle(this.flow.wave.stage!, { winner: sim.winner, extraIncome: extraIncome + encounterGold, countsForStreak:this.flow.wave.encounterKind!=='monster' });
    const ups = this.level.addExp(expGained);
    this.rewardLevelUps(ups.length);
    this.save.lastReward = { breakdown, expGained, levelUps: ups.length };
    this.stageProgression?.settle(this.flow.wave, sim.winner);
    if(!this.stageProgression&&this.equipmentPolicy&&this.save.equipmentRewardVersion!=='none'&&!isChestlessBoss(this.flow.wave)){
      const w=this.flow.wave;
      // Legacy waves have no classification. Only explicit configured Elite/Boss victories qualify.
      this.save.lastEquipmentReward=createEquipmentReward(this.equipmentPolicy,this.random,w,sim.winner,this.save.equipmentProgress);
    }
    this.snapshot();
    return { round, reward: this.save.lastReward };
  }
  nextWave(): boolean {
    if(!this.canAdvanceWave())return false;
    return this.advanceWave();
  }
  private advanceWave():boolean{
    if (!this.flow.nextWave()) return false;
    this.activeBattle = null;
    this.previewFormation=undefined;this.lockedFormation=undefined;
    this.save.floor = this.flow.wave.stage!; this.save.lastReward = undefined; this.save.shopRollIndex = 0;
    this.save.lastEquipmentReward=undefined;
    this.shop.setRollRng(this.random.stream('shop', this.flow.wave.id));
    this.shop.nextRound(); this.enterEncounterStage(); this.stageProgression?.enter(this.flow.wave); this.snapshot(); return true;
  }
  /** Existing debug jump only; deliberately absent from the player/bot port. */
  debugJump(stage: number, round: number): boolean {
    if (this.pendingOpeningEncounter) return false;
    if(this.save.pendingTraitChoice||this.save.equipmentProgress.pending||this.pendingStageReward)return false;
    if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE_COUNT || !Number.isInteger(round)
      || round < 1 || round > stageRoundCount(stage, this.runConfig)) return false;
    const stageCount = Math.max(this.save.stageCount, stage);
    const waves = buildRunWaves(stageCount, this.runConfig, this.templates, this.cfg.allUnits(), this.generation);
    const waveIndex = waves.findIndex(w => w.stage === stage && w.round === round);
    this.waves = waves; this.save.stageCount = stageCount;
    this.flow = new RoundFlow(waves, this.roundRules, { phase: 'prepare', waveIndex,
      health: this.flow.health || this.cfg.battle.initialHealth, result: null, lastSettlement: null });
    this.activeBattle = null;this.previewFormation=undefined;this.lockedFormation=undefined;
    this.save.floor = stage; this.save.lastReward = undefined; this.save.shopRollIndex = 0;
    this.enterEncounterStage(); this.stageProgression?.enter(this.flow.wave); this.snapshot(); return true;
  }
  snapshot(): SaveDataV2 {
    this.save.unlockedUnits = this.pool.unlockedSpecialUnits(this.cfg.allUnits());
    this.owned.mergeAll();
    this.stageProgression?.collect(this.flow.wave);
    Object.assign(this.save, this.economy.snapshot(), this.level.snapshot(), { shop: this.shop.snapshot(), shopReserved: true,
      owned: this.owned.snapshot(), nextOwnedUid: this.owned.nextUnitUid, equipmentReserve: [...this.owned.equipmentReserve],
      pool: this.pool.snapshot(), round: this.flow.snapshot(), shopLocked: this.shop.locked, floor: this.flow.wave.stage! });
    // The exported snapshot is detached from the live session.
    return JSON.parse(JSON.stringify(this.save)) as SaveDataV2;
  }
}
