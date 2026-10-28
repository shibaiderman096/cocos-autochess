import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { ConfigManager } from '../assets/scripts/core/ConfigManager';
import type { UnitConfigData, SkillConfigData, BattleConfigData } from '../assets/scripts/core/ConfigManager';
import type { EquipmentConfigData } from '../assets/scripts/battle/types';
import { RunSession } from '../assets/scripts/core/RunSession';
import { RUN_RULES_VERSION } from '../assets/scripts/core/RunRandomContext';
import { COST_PRICE, COST_SELL } from '../assets/scripts/core/ShopConfig';
import type { RunConfig } from '../assets/scripts/core/RunSetup';
import type { WaveConfig } from '../assets/scripts/core/RoundFlow';
import type { RunSimulationReport, RunWaveReport } from '../assets/scripts/core/RunSessionTypes';
import { MinimalBaselineBot } from './bots/minimal-baseline';
import type { EnemyDifficultyConfig, EnemyGenerationMode } from '../assets/scripts/core/EnemyGenerationTypes';
import type { EnemyPowerData } from '../assets/scripts/core/EnemyPowerTypes';
import type { EnemyFormationConfig,EnemyRoleConfig,FormationOverride } from '../assets/scripts/core/EnemyFormationTypes';
import type { EquipmentPolicyConfig } from '../assets/scripts/core/EquipmentPolicyTypes';
import type {BotId,BotConfig} from './bots/types';
import type {BotPlayerPort} from '../assets/scripts/core/BotObservation';
import {createBot,loadBotConfigs} from './bots/factory';
import {ownedQuality,roleOf,unitConfig} from './bots/evaluation';
import {assertLegalSession,equipmentCount} from './bots/legality';
import {publicEconomySnapshot} from './balance/bot-economy-metrics';
import type {BotEconomyDiagnostics} from './balance/bot-economy-metrics';

export interface RunInputs {
  units: UnitConfigData[];
  skills: Record<string, SkillConfigData>;
  battle: BattleConfigData;
  run: RunConfig;
  waves: WaveConfig[];
  equipment: EquipmentConfigData[];
}
export interface SimulationOptions { runSeed: number; stageCount?: number; maxStage?: number; maxWaves?: number;
  bot?:BotId;botConfig?:BotConfig;audit?:boolean;economyAudit?:boolean;
  equipmentPolicy?:EquipmentPolicyConfig|false;
  enemyGenerationMode?: EnemyGenerationMode; enemyDifficulty?: EnemyDifficultyConfig; enemyPower?: EnemyPowerData;
  formation?:FormationOverride;formationConfig?:EnemyFormationConfig;enemyRoles?:EnemyRoleConfig }

export function loadEquipmentInputs(root=resolve(__dirname,'..')):{equipmentPolicy:EquipmentPolicyConfig} {
  return {equipmentPolicy:JSON.parse(readFileSync(resolve(root,'assets/resources/config/equipment-policy.json'),'utf8'))};
}

export function loadFormationInputs(root=resolve(__dirname,'..')):{formationConfig:EnemyFormationConfig;enemyRoles:EnemyRoleConfig} {
  const load=(name:string)=>JSON.parse(readFileSync(resolve(root,'assets/resources/config',name+'.json'),'utf8'));
  return {formationConfig:load('enemy-formation'),enemyRoles:load('enemy-roles')};
}

/** Kept separate so the six P0/P1-B calibration inputs retain their exact shape and hashes. */
export function loadEnemyGenerationInputs(root=resolve(__dirname,'..')):{enemyDifficulty:EnemyDifficultyConfig;enemyPower:EnemyPowerData} {
  const load=(name:string)=>JSON.parse(readFileSync(resolve(root,'assets/resources/config',name+'.json'),'utf8'));
  return {enemyDifficulty:load('enemy-difficulty'),enemyPower:load('enemy-power')};
}

export function loadRunInputs(root = resolve(__dirname, '..')): RunInputs {
  const load = (name: string) => JSON.parse(readFileSync(resolve(root, 'assets/resources/config', name + '.json'), 'utf8'));
  return { units: load('units'), skills: load('skills'), battle: load('battle'), run: load('run'), waves: load('waves'), equipment: load('equipment') };
}
export function createErrorReport(options: SimulationOptions, error: unknown): RunSimulationReport {
  return { schemaVersion: 1, runSeed: options.runSeed, rulesVersion: RUN_RULES_VERSION, bot: 'MinimalBaselineBot',
    enemyGenerationMode:options.enemyGenerationMode??'budget-v1',
    stageCount: options.stageCount ?? 99, maxStage: options.maxStage ?? options.stageCount ?? 99,
    maxWaves: options.maxWaves ?? null, configHash: '', result: 'SIMULATION_ERROR', gameResult: null,
    endState: null, waves: [], error: error instanceof Error ? error.message : String(error) };
}

/** No timers, wall clock, fake victories, bonus grants or duplicated economy/battle algorithms. */
export function runSimulation(inputs: RunInputs, options: SimulationOptions): RunSimulationReport {
  const report = createErrorReport(options, 'Simulation did not initialize');
  delete report.error;
  let session: RunSession | undefined;
  try {
    const stageCount = options.stageCount ?? 99, maxStage = options.maxStage ?? stageCount;
    if (!Number.isInteger(stageCount) || stageCount < 3 || stageCount > 99) throw new Error('stageCount must be an integer from 3 to 99');
    if (!Number.isInteger(maxStage) || maxStage < 1 || maxStage > stageCount) throw new Error('maxStage must be an integer within the campaign');
    if (options.maxWaves !== undefined && (!Number.isSafeInteger(options.maxWaves) || options.maxWaves < 1)) throw new Error('maxWaves must be a positive integer');
    for (const key of ['boardWidth', 'boardHeight', 'ownRows', 'maxTicks'] as const) {
      if (!Number.isSafeInteger(inputs.battle[key]) || inputs.battle[key] < 1) throw new Error(`Invalid battle ${key}`);
    }
    if (inputs.battle.ownRows >= inputs.battle.boardHeight || !Number.isFinite(inputs.battle.tickMs) || inputs.battle.tickMs <= 0) throw new Error('Invalid battle geometry/tickMs');
    const mode=options.enemyGenerationMode??'budget-v1';
    if(mode!=='budget-v1')throw new Error('Unsupported enemy mode');
    const override=options.formation??'auto';
    const formation={...loadFormationInputs(),...(options.formationConfig?{formationConfig:options.formationConfig}:{}),...(options.enemyRoles?{enemyRoles:options.enemyRoles}:{})};
    const generation={...loadEnemyGenerationInputs(),...(options.enemyDifficulty?{enemyDifficulty:options.enemyDifficulty}:{}),...(options.enemyPower?{enemyPower:options.enemyPower}:{})};
    const equipment=options.equipmentPolicy===false?{}:options.equipmentPolicy?{equipmentPolicy:options.equipmentPolicy}:loadEquipmentInputs();
    const simulationConfig = {inputs,...generation,...formation,...equipment,override};
    report.configHash = createHash('sha256').update(JSON.stringify({config:simulationConfig,shopPricing:{buy:COST_PRICE,sell:COST_SELL}})).digest('hex');
    const cfg = new ConfigManager(); cfg.setUnits(inputs.units); cfg.setSkills(inputs.skills);
    cfg.setBattle(inputs.battle); cfg.setEquipment(inputs.equipment);
    session = new RunSession(cfg, inputs.run, inputs.waves, { runSeed: options.runSeed, stageCount,enemyGenerationMode:mode,...generation,...formation,...equipment,formation:override });
    Object.assign(report,{enemyGenerationVersion:session.save.enemyGenerationVersion,powerModelVersion:session.save.powerModelVersion,
      enemyEquipmentVersion:session.save.enemyEquipmentVersion,equipmentRewardVersion:session.save.equipmentRewardVersion,
      powerModelCalibrationHash:session.save.powerModelCalibrationHash,difficultyConfigVersion:session.save.difficultyConfigVersion});
    if (inputs.run.stageEncounters) report.stageRewardVersion = inputs.run.stageEncounters.version;
    report.formationVersion=session.save.formationVersion;report.formationOverride=session.save.formationOverride;
    if(session.save.balanceVersion!==undefined)report.balanceVersion=session.save.balanceVersion;
    const bot = new MinimalBaselineBot();
    const formal=options.bot&&options.bot!=='minimal'?createBot(options.bot,options.botConfig):undefined;
    const formalConfig=formal?(options.botConfig??loadBotConfigs()[formal.id]):undefined;
    if(formal){report.bot=formal.id==='weak'?'WeakBot':formal.id==='medium'?'MediumBot':'StrongBot';report.botVersion=formal.version;report.botConfigHash=formal.configHash;}
    let spending={refreshSpending:0,xpSpending:0,unitSpending:0,saleIncome:0};
    let economyAudit:BotEconomyDiagnostics|undefined;
    const basePort=formal?session.botPort():undefined;
    const formalPort:BotPlayerPort|undefined=basePort?{observe:()=>basePort.observe(),act:action=>{
      const before=session!.economy.gold,equipmentBefore=equipmentCount(session!),stageBefore=session!.pendingStageReward;
      const discarded=economyAudit&&action.type==='refresh'?publicEconomySnapshot(basePort.observe(),formalConfig!,formal!.id==='weak'):undefined;
      const boughtId=action.type==='buy'?session!.shop.slots[action.index]?.unitId:null;
      const result=basePort.act(action),delta=before-session!.economy.gold;
      if(result.ok){if(action.type==='buy')spending.unitSpending+=delta;if(action.type==='buyExp')spending.xpSpending+=delta;
        if(action.type==='stageChoice'&&action.choice==='buy'&&stageBefore?.kind==='specialShop'&&stageBefore.offers[action.index!]?.kind==='unit')spending.unitSpending+=delta;
        if(action.type==='refresh'||(action.type==='stageChoice'&&action.choice==='refresh'))spending.refreshSpending+=delta;if(action.type==='sell')spending.saleIncome-=delta;}
      if(economyAudit){economyAudit.goldPeak=Math.max(economyAudit.goldPeak,session!.economy.gold);
        if(result.ok&&discarded){economyAudit.ignoredUsefulOffers+=discarded.offers.length;economyAudit.missedImmediate2Star+=discarded.offers.filter(s=>s.completes2).length;}
        if(result.ok&&boughtId==='iron_golem')economyAudit.ironGolemPurchases++;
        if(!result.ok&&result.error==='bench_full')economyAudit.benchFullEvents++;}
      const stageEquipment = action.type==='stageChoice' && (stageBefore?.kind==='specialShop'&&action.choice==='buy'&&stageBefore.offers[action.index!]?.kind==='equipment');
      const grant=result.stageReward;
      const grantedEquipment=result.ok?(grant?.kind==='mixed'?grant.equipmentIds.length:action.type==='claimEquipmentReward'||stageEquipment?1:0):0;
      const consumedEquipment=result.ok&&(result.copiedUnitId||action.type==='recycleEquipment')?1:0;
      if(options.audit!==false){assertLegalSession(session!);if(equipmentCount(session!)!==equipmentBefore+grantedEquipment-consumedEquipment)throw Error('BOT_LEGALITY: equipment conservation');}
      return result;
    }}:undefined;
    while (true) {
      if (session.flow.phase === 'ended') {
        report.result = session.flow.result === 'defeat' ? 'PLAYER_DEAD' : 'RUN_COMPLETED'; break;
      }
      const wave = session.flow.wave, before = session.state, shop = session.shop.snapshot();
      spending={refreshSpending:0,xpSpending:0,unitSpending:0,saleIncome:0};
      if(formal&&options.economyAudit){const initial=publicEconomySnapshot(formalPort!.observe(),formalConfig!,formal.id==='weak');
        economyAudit={before:initial,after:initial,goldPeak:before.gold,benchFullEvents:initial.bench>=session.save.benchSlots?1:0,
          ignoredUsefulOffers:0,missedImmediate2Star:0,populationOpportunityMissed:0,ironGolemPurchases:0};}
      const positions=new Map(session.owned.onBoard().map(u=>[u.uid,u.x+','+u.y]));
      const actions = wave.encounterKind==='specialShop'?[]:formal?formal.prepare(formalPort!):bot.prepare(session.playerPort()), atBattle = session.state;
      const observed=formalPort?.observe();
      if(economyAudit&&observed){economyAudit.after=publicEconomySnapshot(observed,formalConfig!,formal!.id==='weak');
        economyAudit.ignoredUsefulOffers+=economyAudit.after.offers.length;
        economyAudit.missedImmediate2Star+=economyAudit.after.offers.filter(s=>s.completes2).length;
        economyAudit.populationOpportunityMissed=Number(economyAudit.after.populationOpportunity);
        economyAudit.after.unusedGoldReason=economyAudit.after.gold<=economyAudit.after.reserveGold?['INTEREST_RESERVE']:
          [...(!economyAudit.after.benchUnitCouldDeploy?['NO_BENCH_UPGRADE']:[]),...(!economyAudit.after.offers.length?['NO_USEFUL_SHOP_OPTION']:[]),
            ...(economyAudit.after.level>=economyAudit.after.legacyLevelTarget?['LEGACY_LEVEL_TARGET']:[]),...(!economyAudit.after.rollWanted?['CORE_ALREADY_STABLE']:[])];}
      if(economyAudit&&formal?.diagnostics){const d=formal.diagnostics;
        economyAudit.mode=d.mode;economyAudit.policy=d.policy;economyAudit.after.unusedGoldReason=d.unusedGoldReason;
        const policy=d.policy as {initial:{reserveGold:number;spendableGold:number};final:{reserveGold:number;spendableGold:number;levelUpAllowed:boolean}};
        Object.assign(economyAudit.before,{reserveGold:policy.initial.reserveGold,spendableGold:policy.initial.spendableGold});
        Object.assign(economyAudit.after,{reserveGold:policy.final.reserveGold,spendableGold:policy.final.spendableGold});
        economyAudit.populationOpportunityMissed=Number(policy.final.levelUpAllowed);}
      const ranked=observed?.units.filter(u=>u.location==='board').sort((a,b)=>ownedQuality(b,observed)-ownedQuality(a,observed)||a.uid-b.uid)??[];
      const carry=ranked.find(u=>roleOf(unitConfig(u.unitId,observed!),observed!)!=='tank')??ranked[0],tank=ranked.find(u=>roleOf(unitConfig(u.unitId,observed!),observed!)==='tank');
      const playerEquipmentInventory=[...session.owned.equipmentReserve];
      const playerUnits = session.owned.snapshot();
      const shopAtBattle = session.shop.snapshot();
      const seed = session.battleSeed;
      let result: {winner:0|1|-1;ticks:number}, settlement: import('../assets/scripts/core/RunSessionTypes').SessionSettlement | null;
      let stageReward = session.pendingStageReward;
      if(wave.encounterKind==='specialShop') {
        actions.push(...(formal?formal.claimRewards(formalPort!):bot.claimRewards(session.playerPort())));
        result={winner:-1,ticks:0};
        settlement=session.flow.lastSettlement&&session.save.lastReward?{round:session.flow.lastSettlement,reward:session.save.lastReward}:null;
      } else {
        const sim=session.startBattle();if(!sim)throw new Error(`Cannot start battle at wave ${wave.id}`);
        result=sim.run();settlement=session.settleBattle();
        stageReward = session.pendingStageReward;
      }
      if (!settlement) throw new Error(`Cannot settle wave ${wave.id}`);
      actions.push(...(formal?formal.claimRewards(formalPort!):bot.claimRewards(session.playerPort())));
      const after = session.state;
      const finalized=session.formation,fd=finalized.diagnostics;
      const record: RunWaveReport & {botEconomy?:BotEconomyDiagnostics} = {
        ...(stageReward ? { stageReward } : {}),
        ...(economyAudit?{botEconomy:economyAudit}:{}),
        ...(formal?{botMetrics:{...spending,formationChanges:session.owned.onBoard().filter(u=>positions.has(u.uid)&&positions.get(u.uid)!==u.x+','+u.y).length,
          mainCarryUid:carry?.uid??null,mainCarryUnitId:carry?.unitId??null,mainCarryStar:carry?.star??null,mainTankUid:tank?.uid??null,mainTankUnitId:tank?.unitId??null,mainTankStar:tank?.star??null,
          carryItems:carry?.equipment?.length??0,tankItems:tank?.equipment?.length??0,enemySurvivors:settlement.round.enemySurvivors,
          failedActions:actions.filter(a=>!a.result.ok).length,rewardsClaimed:actions.filter(a=>(a.action.type==='claimEquipmentReward'||(a.action.type==='stageChoice'&&a.action.choice==='claim'))&&a.result.ok).length}}:{}),
        ...(session.save.equipmentRewardVersion==='none'?{}:{equipmentReward:session.save.lastEquipmentReward,
          rewardTriggered:session.save.lastEquipmentReward?.rewardTriggered??false,rewardId:session.save.lastEquipmentReward?.rewardId,
          rewardCandidates:session.save.lastEquipmentReward?.rewardCandidates??[],rewardChoice:session.save.lastEquipmentReward?.rewardChoice,
          guaranteeState:{...session.save.equipmentProgress.guaranteeSatisfied},playerEquipmentInventory,
          playerEquippedItems:playerUnits.flatMap(u=>u.equipment??[]),
          playerEquipmentCount:playerEquipmentInventory.length+playerUnits.reduce((n,u)=>n+(u.equipment?.length??0),0)}),
        ...wave.budget,globalWaveId:wave.id,budgetWaveIndex:wave.budget?.budgetWaveIndex??0,
        ...(wave.enemyUpgrade ? { enemyUpgrade: wave.enemyUpgrade } : {}),
        ...(wave.goldBudget ? { goldBudget: wave.goldBudget } : {}),
        enemyGenerationMode:mode,waveKind:wave.waveKind??(wave.stage===1?'intro':'normal'),encounterKind:wave.encounterKind,enemyBudget:wave.budget??null,
        formationVersion:finalized.version,formationLevel:finalized.level,formationStrength:finalized.strength,roleCounts:fd.roleCounts,
        templateId:fd.templateId,templateUsed:fd.templateUsed,formationScore:fd.score.total,spacingViolations:fd.spacingViolations,
        fallbackSteps:fd.fallbackSteps,playerSnapshotHash:fd.playerSnapshotHash,formationDiagnostics:fd,
        waveId: wave.id, stage: wave.stage!, round: wave.round!, hpBefore: before.playerHp, hpAfter: after.playerHp,
        goldBefore: before.gold, goldAtBattle: atBattle.gold, goldAfter: after.gold,
        levelAtBattle: atBattle.level, xpAtBattle: atBattle.xp, level: after.level, xp: after.xp,
        shop, shopAtBattle, playerUnits: playerUnits.filter(u => u.location === 'board'), benchUnits: playerUnits.filter(u => u.location === 'bench'),
        enemies: finalized.placements, actions,
        battle: { seed, result: result.winner, ticks: result.ticks, duration: result.ticks * cfg.battle.tickMs / 1000,
          damageTaken: settlement.round.healthLost }, reward: settlement.reward,
      };
      report.waves.push(record);
      if (after.phase === 'ended') continue;
      if ((options.maxWaves !== undefined && report.waves.length >= options.maxWaves)
        || (wave.stage === maxStage && wave.round === wave.roundsInStage)) {
        report.result = 'MAX_WAVE_REACHED'; break;
      }
      if (!(session.portalAvailable?session.enterPortal():session.nextWave())) throw new Error(`Cannot advance from wave ${wave.id}`);
    }
  } catch (error) {
    report.result = 'SIMULATION_ERROR'; report.error = error instanceof Error ? error.message : String(error);
  }
  report.endState = session?.state ?? null;
  report.gameResult = session?.flow.result ?? null;
  return report;
}
