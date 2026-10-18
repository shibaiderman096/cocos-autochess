import { BattleSim } from '../battle/BattleSim';
import type { Placement } from '../battle/BattleSim';
import { MAX_EQUIPMENT } from '../battle/types';
import { ConfigManager } from './ConfigManager';
import { CardPool } from './CardPool';
import { EconomySystem } from './EconomySystem';
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
import { StageProgression, freshStageProgress } from './StageProgression';
import type { StageChoice, StagePending } from './StageProgression';

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
  private generation: EnemyGenerationOptions;
  private equipmentPolicy?:EquipmentPolicyConfig;
  private stageProgression?: StageProgression;
  private formationEngine?:EnemyFormation;
  private previewFormation?:{waveId:number;result:EnemyFormationResult};
  private lockedFormation?:{waveId:number;result:EnemyFormationResult};

  constructor(readonly cfg: ConfigManager, readonly runConfig: RunConfig, private templates: WaveConfig[], options: RunSessionOptions = {}) {
    const loaded = options.save !== undefined;
    this.save = loaded ? migrateSaveV2(options.save) : freshSaveV2(options.stageCount ?? DEFAULT_STAGE_COUNT, options.runSeed ?? DEFAULT_RUN_SEED, options.enemyGenerationMode ?? 'budget-v1');
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
      this.save.difficultyConfigIdentity??=identity;
    }
    this.generation={mode,runSeed:this.save.runSeed,earlyEncounterLayout:this.save.earlyEncounterLayout ?? 'legacy',difficulty:options.enemyDifficulty&&JSON.parse(JSON.stringify(options.enemyDifficulty)),
      power:options.enemyPower&&JSON.parse(JSON.stringify(options.enemyPower))};
    this.configureEquipment(options,loaded);
    this.random = new RunRandomContext(this.save.runSeed);
    this.configureFormation(options,loaded);
    this.cfg.setEnemyUnits(buildMonsterUnits(runConfig, cfg.allUnits()));
    this.waves = buildRunWaves(this.save.stageCount, runConfig, templates, cfg.allUnits(), this.generation);
    this.migrateRoundIndex();
    this.flow = new RoundFlow(this.waves, cfg.battle, this.save.round ?? undefined);
    this.validateEquipmentProgress();
    this.save.floor = this.flow.wave.stage!;
    this.economy = new EconomySystem(undefined, this.save);
    this.level = new LevelSystem(this.save);
    const restoreShop = loaded && (this.save.shopReserved || this.save.shop.some(s => s.unitId));
    const needsStarter = !loaded || (!this.save.shopReserved && this.save.owned.length === 0);
    if (runConfig.stageEncounters) this.save.stageProgress ??= freshStageProgress();
    restoreShopState(this.save, cfg.allUnits(), cfg.battle.boardWidth, cfg.battle.ownRows);
    for (const unit of this.save.owned) unit.equipment = cfg.getEquipmentReserve(unit.equipment ?? []).slice(0, MAX_EQUIPMENT).map(item => item.id);
    this.save.equipmentReserve = cfg.getEquipmentReserve(this.save.equipmentReserve ?? []).map(item => item.id);
    this.pool = new CardPool(cfg.allUnits(), this.save.pool);
    this.owned = new OwnedUnits(this.save.owned, this.save.nextOwnedUid);
    this.owned.equipmentReserve = [...(this.save.equipmentReserve ?? [])];
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
      this.stageProgression = new StageProgression(runConfig.stageEncounters, this.save.stageProgress!, cfg,
        this.pool, this.owned, this.economy, this.random, this.save.benchSlots, this.stageEquipmentTiers, () => this.level.level);
      this.validateStageReward();
      this.stageProgression.resume(this.flow.wave);
      if (this.flow.phase === 'prepare') this.stageProgression.enter(this.flow.wave);
    }
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
  canAdvanceWave():boolean {return !this.save.equipmentProgress.pending&&!this.pendingStageReward&&this.flow.phase==='settlement';}
  get pendingStageReward(): StagePending | undefined { const p = this.save.stageProgress?.pending; return p && JSON.parse(JSON.stringify(p)); }
  private get stageEquipmentTiers(): Record<string, import('./EquipmentPolicyTypes').EquipmentTier> {
    return this.equipmentPolicy?.tiers ?? Object.fromEntries(this.cfg.allEquipment().map(item => [item.id, this.runConfig.stageEncounters?.basicEquipmentIds.includes(item.id) ? 'basic' : 'advanced']));
  }
  private validateStageReward(): void {
    const p = this.save.stageProgress?.pending; if (!p) return;
    const w = this.flow.wave, rules = this.runConfig.stageEncounters!, bad = () => { throw new Error('Invalid pending stage reward'); };
    if (p.waveId !== w.id || typeof p.id !== 'string' || !p.id.startsWith(`${rules.version}:${this.save.runSeed}:${w.id}:`)) bad();
    if (p.kind === 'specialShop') {
      if (w.encounterKind !== 'specialShop' || this.flow.phase !== 'prepare' || !Array.isArray(p.offers) || p.offers.length !== rules.shop.slots) bad();
      for (const offer of p.offers) {
        if (!offer || !['unit', 'equipment'].includes(offer.kind) || typeof offer.bought !== 'boolean') bad();
        const price = offer.kind === 'unit' ? COST_PRICE[validCost(this.cfg.getUnit(offer.id).cost)] : rules.shop.equipmentPrices[this.stageEquipmentTiers[offer.id]];
        if (offer.price !== price || !Number.isSafeInteger(price) || price <= 0) bad();
      }
    } else {
      if (!['settlement', 'ended'].includes(this.flow.phase) || this.flow.lastSettlement?.winner !== 0) bad();
      if (p.kind === 'bossChoice') { if (w.encounterKind !== 'boss' || p.value !== this.stageProgression!.value(w.stage!)) bad(); }
      else if (p.kind === 'equipmentChoice') {
        if (w.encounterKind !== 'boss' || !Array.isArray(p.candidates) || p.candidates.length !== 4 || new Set(p.candidates).size !== 4 || p.candidates.some(id => !rules.basicEquipmentIds.includes(id))) bad();
      } else if (p.kind === 'unitBundle') {
        if (!['monster', 'boss'].includes(w.encounterKind!) || p.value !== this.stageProgression!.value(w.stage!) || !Array.isArray(p.units)
          || !Number.isSafeInteger(p.deferredValue) || p.deferredValue < 0 || p.units.reduce((n, id) => n + COST_PRICE[validCost(this.cfg.getUnit(id).cost)], p.deferredValue) !== p.value) bad();
        const reserved = this.save.stageProgress!.unitReserve.slice();
        for (const id of p.units) { const i = reserved.indexOf(id); if (i < 0) bad(); reserved.splice(i, 1); }
      } else bad();
    }
  }
  claimStageReward(action: StageChoice): ActionResult {
    if (!this.stageProgression) return fail('stage_rewards_disabled');
    const result = this.stageProgression.act(action, this.flow.wave);
    if (!result.ok) return result;
    if (result.completeShop) {
      if (!this.flow.completeEncounter()) throw new Error('Cannot complete shop encounter');
      const state = this.economy.snapshot();
      this.save.lastReward = { expGained: 0, levelUps: 0, breakdown: { floorIncome: 0, winBonus: 0, interest: 0, streakBonus: 0, extraIncome: 0,
        total: 0, goldBefore: state.gold, goldAfter: state.gold, winStreak: state.winStreak, loseStreak: state.loseStreak } };
    }
    this.snapshot(); return { ok: true };
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
    if(!engine||wave.encounterKind==='monster'||wave.encounterKind==='specialShop')return compatibilityFormation(wave.enemies);
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
  get battle(): BattleSim | null { return this.activeBattle; }
  get battleSeed(): number { return this.random.seed('battle', this.flow.wave.id); }
  private get canTrade(): boolean { return this.flow.phase === 'prepare' || this.flow.phase === 'battle'; }

  buyShopSlot(index: number): ActionResult {
    if (!this.canTrade) return fail('fighting');
    if (!Number.isInteger(index)) return fail('slot_empty');
    const result = this.shop.buy(index);
    return result.error ? fail(result.error) : { ok: true, ...result };
  }
  refreshShop(): ActionResult {
    if (!this.canTrade) return fail('fighting');
    const index = this.save.shopRollIndex + 1;
    this.shop.setRollRng(this.random.stream('shop', this.flow.wave.id, index));
    const error = this.shop.refresh();
    if (error) return fail(error);
    this.save.shopRollIndex = index;
    return ok();
  }
  toggleShopLock(): ActionResult {
    if (!this.canTrade) return fail('fighting');
    this.shop.locked = !this.shop.locked; return ok();
  }
  buyExp(): ActionResult {
    if (!this.canTrade) return fail('fighting');
    if (this.level.level >= MAX_LEVEL) return fail('max_level');
    if (!this.economy.spend(EXP_PURCHASE.gold)) return fail('not_enough_gold');
    this.level.addExp(EXP_PURCHASE.exp); return ok();
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
      if (u.location === 'bench' && !this.owned.atBoard(to.x, to.y) && this.owned.onBoard().length >= this.level.unitCap) return fail('population_cap');
    }
    return this.owned.move(uid, to) ? ok() : fail('invalid_position');
  }
  sellUnit(uid: number): ActionResult {
    const unit = this.owned.get(uid);
    if (!this.canTrade || (this.flow.phase === 'battle' && unit?.location === 'board')) return fail('fighting');
    const sold = this.shop.sell(uid);
    return sold ? { ok: true, gold: sold.gold } : fail('not_owned');
  }
  equipItem(uid: number, reserveIndex: number): ActionResult {
    if (this.flow.phase !== 'prepare') return fail('fighting');
    if (!Number.isInteger(reserveIndex) || reserveIndex < 0) return fail('invalid_equipment');
    const id = this.owned.equipmentReserve[reserveIndex];
    if (!id || !this.cfg.getEquipmentReserve([id]).length) return fail('invalid_equipment');
    if (!this.owned.equip(uid, id)) return fail('equipment_full');
    this.owned.equipmentReserve.splice(reserveIndex, 1); return ok();
  }
  unequipItem(uid: number, slot: number): ActionResult {
    if (this.flow.phase !== 'prepare') return fail('fighting');
    return this.owned.unequip(uid, slot) ? ok() : fail('invalid_equipment');
  }
  act(action: RunAction): ActionResult {
    const result = this.applyAction(action);
    if (result.ok && this.flow.phase !== 'battle') this.stageProgression?.collect(this.flow.wave);
    return result;
  }
  private applyAction(action: RunAction): ActionResult {
    switch (action.type) {
      case 'buy': return this.buyShopSlot(action.index);
      case 'refresh': return this.refreshShop();
      case 'lock': return this.toggleShopLock();
      case 'buyExp': return this.buyExp();
      case 'move': return this.moveUnit(action.uid, action.to);
      case 'sell': return this.sellUnit(action.uid);
      case 'equip': return this.equipItem(action.uid, action.reserveIndex);
      case 'unequip': return this.unequipItem(action.uid, action.slot);
      case 'claimEquipmentReward':return this.claimEquipmentReward(action.index);
      case 'stageChoice': return this.claimStageReward(action);
      default: return fail('invalid_action');
    }
  }
  playerPort(): RunPlayerPort {
    return { act: action => this.act(action), observe: () => ({ state: this.state, unitCap: this.level.unitCap,
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
      x: e.x, y: e.y, star: e.star, statMultiplier: e.statMultiplier, damageAmp: e.damageAmp, damageReduction: e.damageReduction, equipment:e.equipment }));
    const battleIds = new Map<number, number>();
    for (const u of this.owned.onBoard().slice().sort((a, b) => a.uid - b.uid)) {
      battleIds.set(u.uid, placements.length + 1);
      placements.push({ cfg: this.cfg.getUnit(u.unitId), side: 0, x: u.x, y: u.y, star: u.star, equipment: u.equipment });
    }
    return { sim: new BattleSim(this.cfg, placements, { seed: this.battleSeed, w: this.cfg.battle.boardWidth,
      h: this.cfg.battle.boardHeight, maxTicks: this.cfg.battle.maxTicks }), battleIds };
  }
  startBattle(): BattleSim | null {
    if (this.pendingStageReward||this.flow.wave.encounterKind==='specialShop'||this.save.equipmentProgress.pending||this.flow.phase !== 'prepare' || !this.owned.onBoard().length || this.owned.onBoard().length > this.level.unitCap) return null;
    this.lockedFormation={waveId:this.flow.wave.id,result:this.solveFormation(true)};
    const { sim } = this.createPreview();
    if (!this.flow.startBattle()) return null;
    this.activeBattle = sim; sim.start(); return sim;
  }
  settleBattle(extraIncome = 0): SessionSettlement | null {
    const sim = this.activeBattle;
    if (!sim?.finished || this.flow.phase !== 'battle') return null;
    if (!Number.isSafeInteger(extraIncome) || extraIncome < 0) throw new Error('Invalid extra income');
    const round = this.flow.settle(sim.winner, sim.units.filter(u => u.side === 1 && u.alive).length);
    if (!round) return null;
    const breakdown = this.economy.settleBattle(this.flow.wave.stage!, { winner: sim.winner, extraIncome });
    const ups = this.level.addExp(EXP_PER_BATTLE);
    this.save.lastReward = { breakdown, expGained: EXP_PER_BATTLE, levelUps: ups.length };
    this.stageProgression?.settle(this.flow.wave, sim.winner);
    if(!this.stageProgression&&this.equipmentPolicy&&this.save.equipmentRewardVersion!=='none'){
      const w=this.flow.wave;
      // Legacy waves have no classification. Only explicit configured Elite/Boss victories qualify.
      this.save.lastEquipmentReward=createEquipmentReward(this.equipmentPolicy,this.random,w,sim.winner,this.save.equipmentProgress);
    }
    this.snapshot();
    return { round, reward: this.save.lastReward };
  }
  nextWave(): boolean {
    if(!this.canAdvanceWave())return false;
    if (!this.flow.nextWave()) return false;
    this.activeBattle = null;
    this.previewFormation=undefined;this.lockedFormation=undefined;
    this.save.floor = this.flow.wave.stage!; this.save.lastReward = undefined; this.save.shopRollIndex = 0;
    this.save.lastEquipmentReward=undefined;
    this.shop.setRollRng(this.random.stream('shop', this.flow.wave.id));
    this.shop.nextRound(); this.stageProgression?.enter(this.flow.wave); this.snapshot(); return true;
  }
  /** Existing debug jump only; deliberately absent from the player/bot port. */
  debugJump(stage: number, round: number): boolean {
    if(this.save.equipmentProgress.pending||this.pendingStageReward)return false;
    if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE_COUNT || !Number.isInteger(round)
      || round < 1 || round > stageRoundCount(stage, this.runConfig)) return false;
    const stageCount = Math.max(this.save.stageCount, stage);
    const waves = buildRunWaves(stageCount, this.runConfig, this.templates, this.cfg.allUnits(), this.generation);
    const waveIndex = waves.findIndex(w => w.stage === stage && w.round === round);
    this.waves = waves; this.save.stageCount = stageCount;
    this.flow = new RoundFlow(waves, this.cfg.battle, { phase: 'prepare', waveIndex,
      health: this.flow.health || this.cfg.battle.initialHealth, result: null, lastSettlement: null });
    this.activeBattle = null;this.previewFormation=undefined;this.lockedFormation=undefined;
    this.save.floor = stage; this.save.lastReward = undefined; this.save.shopRollIndex = 0;
    this.stageProgression?.enter(this.flow.wave); this.snapshot(); return true;
  }
  snapshot(): SaveDataV2 {
    this.stageProgression?.collect(this.flow.wave);
    Object.assign(this.save, this.economy.snapshot(), this.level.snapshot(), { shop: this.shop.snapshot(), shopReserved: true,
      owned: this.owned.snapshot(), nextOwnedUid: this.owned.nextUnitUid, equipmentReserve: [...this.owned.equipmentReserve],
      pool: this.pool.snapshot(), round: this.flow.snapshot(), shopLocked: this.shop.locked, floor: this.flow.wave.stage! });
    // The exported snapshot is detached from the live session.
    return JSON.parse(JSON.stringify(this.save)) as SaveDataV2;
  }
}
