import { UnitConfigData, combatAttributes } from './ConfigManager';
import { WaveConfig } from './RoundFlow';
import { RunRandomContext } from './RunRandomContext';
import type { EnemyDifficultyConfig, EnemyGenerationMode } from './EnemyGenerationTypes';
import type { EnemyPowerData } from './EnemyPowerTypes';
import type { EquipmentPolicyConfig } from './EquipmentPolicyTypes';
import type { EnemyRoleConfig } from './EnemyFormationTypes';
import { planStageEncounters } from './StageEncounters';
import type { StageEncounterRules } from './StageProgression';
import { applyEnemyUpgrades } from './EnemyUpgrades';
import { generateGoldArmy, validateEnemyGoldRules } from './EnemyGoldArmy';
import type { EnemyGoldRules } from './EnemyGoldArmy';
import type { TraitConfigData } from '../battle/types';

export const MIN_STAGE_COUNT = 3;
export const DEFAULT_STAGE_COUNT = 10;
/** UI/debug stage picker limit; living expeditions can continue beyond this value. */
export const MAX_STAGE_COUNT = 99;
export interface RunConfig {
  enemyGoldBudget?: EnemyGoldRules;
  endlessProgression?: { startStage: number; damageAmpPerRound: number; damageReductionPerStage: number; damageReductionCap: number };
  openingEncounter?: import('./OpeningEncounter').OpeningEncounterRules;
  starterSelection?: 'random-one-cost';
  monsterTemplate?: Pick<UnitConfigData, 'hp' | 'atk' | 'armor' | 'mr' | 'atkSpeed' | 'critChance'>;
  stageEncounters?: StageEncounterRules;
  roundsPerStage: number;
  roundsPerStageGrowth?: number;
  maxRoundsPerStage?: number;
  monsterStatScale: number;
  monsterAttackSpeed: number;
  enemyProgression: {
    initialPopulation: number; populationEveryRounds: number; populationCap: number;
    populationSchedule?: { milestones: Array<{ stage: number; round: number; population: number }>; perStageAfterLast: number };
    lateStartStage: number; damageAmpPerStage: number; damageReductionPerStage: number; damageReductionCap: number;
    tiers: Array<{ stage: number; cost: number; star: number }>;
    cells: Array<{ x: number; y: number }>;
  };
  starterUnitId: string;
  monsters: UnitConfigData[];
  introWaves: WaveConfig[];
}

export function normalizeStageCount(value: unknown): number {
  const n = Number(value);
  return Number.isSafeInteger(Math.floor(n)) ? Math.max(MIN_STAGE_COUNT,Math.floor(n)) : DEFAULT_STAGE_COUNT;
}

export function runRoundCount(stageCount: number, config: RunConfig): number {
  let count = config.introWaves.length;
  for (let stage = 2; stage <= normalizeStageCount(stageCount); stage++) count += stageRoundCount(stage, config);
  if (!Number.isSafeInteger(count)) throw new Error('Invalid run configuration: round count exceeds safe range');
  return count;
}

export function stageRoundCount(stage: number, config: RunConfig): number {
  const growth = config.roundsPerStageGrowth ?? 1, cap = config.maxRoundsPerStage ?? 10;
  if (![config.roundsPerStage, growth, cap].every(Number.isSafeInteger) || config.roundsPerStage < 1
    || growth < 0 || cap < config.roundsPerStage || cap > 10) throw new Error('Invalid run configuration: roundsPerStage');
  return stage <= 1 ? config.introWaves.length : Math.min(cap, config.roundsPerStage + (stage - 2) * growth);
}

/** Authored stage/round thresholds; old configurations keep their round-based curve. */
function enemyPopulation(stage: number, round: number, completedRounds: number, config: RunConfig): number {
  const growth = config.enemyProgression, schedule = growth.populationSchedule;
  if (!schedule) return Math.min(growth.populationCap, growth.initialPopulation + Math.floor(completedRounds / growth.populationEveryRounds));
  const milestone = schedule.milestones.filter(m => m.stage < stage || (m.stage === stage && m.round <= round)).slice(-1)[0];
  const last = schedule.milestones[schedule.milestones.length - 1];
  return Math.min(growth.populationCap, milestone.population + Math.max(0, stage - last.stage) * schedule.perStageAfterLast);
}

/** Whole mirror pairs preserve population; odd counts add the authored center cell. */
export function monsterFormationGroups(count: number, layout: NonNullable<StageEncounterRules['monsterFormation']>): Array<Array<{ x: number; y: number }>> {
  const valid = (p: { x: number; y: number }) => p && Number.isSafeInteger(p.x) && Number.isSafeInteger(p.y) && p.x >= 0 && p.y >= 0;
  if (!Number.isSafeInteger(count) || count < 1 || !layout || !valid(layout.center) || !Array.isArray(layout.pairs)
    || layout.pairs.length < Math.floor(count / 2)) throw new Error('Invalid monster formation');
  const axis = 2 * layout.center.x + (layout.center.y & 1);
  const occupied = new Set([`${layout.center.x},${layout.center.y}`]);
  for (const pair of layout.pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(p => !valid(p)) || pair[0].y !== pair[1].y
      || pair[0].x + pair[1].x + (pair[0].y & 1) !== axis) throw new Error('Invalid monster formation mirror pair');
    for (const p of pair) {
      const key = `${p.x},${p.y}`;
      if (occupied.has(key)) throw new Error('Invalid monster formation overlap');
      occupied.add(key);
    }
  }
  return [...(count % 2 ? [[{ ...layout.center }]] : []), ...layout.pairs.slice(0, Math.floor(count / 2)).map(pair => pair.map(p => ({ ...p })))];
}

/** Monsters share a one-cost baseline; identity, range and art remain creature-specific. */
export function buildMonsterUnits(config: RunConfig, roster: UnitConfigData[]): UnitConfigData[] {
  const strong = config.monsters.filter(monster => monster.monsterTier === 'strong')
    .map(monster => ({ ...monster, ...combatAttributes(monster) }));
  const ordinary = config.monsters.filter(monster => monster.monsterTier !== 'strong');
  if (config.monsterTemplate) {
    const template = config.monsterTemplate;
    if (!['hp', 'atk', 'armor', 'mr', 'atkSpeed', 'critChance'].every(key => Number.isFinite(template[key]))
      || template.hp <= 0 || template.atk < 0 || template.armor < 0 || template.mr < 0 || template.atkSpeed <= 0 || template.critChance! < 0 || template.critChance! > 1) throw new Error('Invalid monster template');
    return [...ordinary.map(monster => ({ ...monster, ...template, skillId: undefined,
      maxMana: 0, startMana: 0, manaPerHit: 0, physicalPower: 0, spellPower: 0, lifesteal: 0, damageAmp: 0, damageReduction: 0 })), ...strong];
  }
  const base = roster.find(u => u.id === config.starterUnitId && u.cost === 1);
  if (!base || !Number.isFinite(config.monsterStatScale) || config.monsterStatScale <= 0 || config.monsterStatScale > 1) throw new Error('Invalid monster baseline');
  const multiplier = config.monsterStatScale;
  if (!Number.isFinite(config.monsterAttackSpeed) || config.monsterAttackSpeed <= 0) throw new Error('Invalid monster attack speed');
  const attributes = combatAttributes(base);
  return [...ordinary.map(monster => ({ ...monster, skillId: undefined,
    hp: Math.round(base.hp * multiplier), atk: base.atk * multiplier, armor: base.armor * multiplier,
    mr: base.mr * multiplier, atkSpeed: config.monsterAttackSpeed,
    maxMana: base.maxMana * multiplier, startMana: base.startMana * multiplier, manaPerHit: base.manaPerHit * multiplier,
    physicalPower: attributes.physicalPower * multiplier, spellPower: attributes.spellPower * multiplier, critChance: monster.critChance ?? 0.25,
    lifesteal: attributes.lifesteal * multiplier, damageAmp: attributes.damageAmp * multiplier,
    damageReduction: attributes.damageReduction * multiplier })), ...strong];
}

/** Current seeded enemy generation options. */
export interface EnemyGenerationOptions { mode:EnemyGenerationMode; runSeed?:number; difficulty?:EnemyDifficultyConfig; power?:EnemyPowerData;
  traits?: TraitConfigData[];
  equipmentPolicy?:EquipmentPolicyConfig;
  equipmentRoles?:EnemyRoleConfig;
  /** Optional offline timing observer. Timing is never read by the generator or serialized into waves. */
  onWave?: (globalWaveId:number,phase:'start'|'end')=>void }
export function buildRunWaves(stageCount:number,config:RunConfig,templates:WaveConfig[],roster:UnitConfigData[],generation?:EnemyGenerationOptions):WaveConfig[] {
  const endless = config.endlessProgression;
  if (endless && (!Number.isSafeInteger(endless.startStage) || endless.startStage < 2
    || ![endless.damageAmpPerRound, endless.damageReductionPerStage, endless.damageReductionCap].every(n => Number.isFinite(n) && n >= 0 && n <= 1)))
    throw new Error('Invalid endless progression');
  const strong = config.stageEncounters?.strongMonster;
  if (strong && (!Number.isSafeInteger(strong.startStage) || strong.startStage < 4
    || !Number.isSafeInteger(strong.everyStages) || strong.everyStages < 1
    || !Number.isFinite(strong.statGrowth) || strong.statGrowth < 0
    || !Array.isArray(strong.unitIds) || !strong.unitIds.length || new Set(strong.unitIds).size !== strong.unitIds.length
    || strong.unitIds.some(id => !config.monsters.some(m => m.id === id && m.monsterTier === 'strong'))))
    throw new Error('Invalid strong monster encounter configuration');
  const encounterRandom = new RunRandomContext(generation?.runSeed ?? 1);
  const encounterPlans=new Map<number,ReturnType<typeof planStageEncounters>>();
  const stagePlan=(stage:number)=>{
    if(!config.stageEncounters||stage===1)return undefined;
    let plan=encounterPlans.get(stage);
    if(!plan){plan=planStageEncounters(stage,stageRoundCount(stage,config),encounterRandom,config.stageEncounters.startStage);encounterPlans.set(stage,plan);}
    return plan;
  };
  const progressionRounds=(stage:number,through:number)=>stagePlan(stage)?.slice(0,through).filter(kind=>kind!=='specialShop').length??through;
  const monsterFormation = config.stageEncounters?.monsterFormation;
  if (monsterFormation) monsterFormationGroups(config.enemyProgression.populationCap, monsterFormation);
  const escorts = strong?.escorts;
  if (escorts && strong) {
    const counts = [escorts.initialCount, escorts.countPerEncounter, escorts.maxCount];
    if (counts.some(n => !Number.isSafeInteger(n) || n < 2 || n % 2 !== 0)
      || escorts.initialCount > escorts.maxCount || escorts.maxCount + 1 > config.enemyProgression.populationCap
      || !escorts.unitIdsByLeader || strong.unitIds.some(id => {
        const ids = escorts.unitIdsByLeader[id];
        return !Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
          || ids.some(unitId => !config.monsters.some(m => m.id === unitId && m.monsterTier !== 'strong' && m.range === 1));
      })) throw new Error('Invalid strong monster escorts');
    const formation = { center: monsterFormation?.center ?? { x: 3, y: 6 }, pairs: escorts.pairs };
    monsterFormationGroups(escorts.maxCount + 1, formation);
    if (escorts.pairs.some(pair => pair.some(p => p.y >= formation.center.y))) throw new Error('Invalid strong monster frontline');
  }
  const decorateEncounter = (wave: WaveConfig): WaveConfig => {
    const rules = config.stageEncounters; if (!rules) return wave;
    const kind = planStageEncounters(wave.stage!, wave.roundsInStage!, encounterRandom, rules.startStage)[wave.round! - 1];
    const result = { ...wave, encounterKind: kind, waveKind: wave.stage === 1 ? 'intro' as const : kind === 'elite' || kind === 'boss' ? kind : 'normal' as const };
    if (kind === 'specialShop') return { ...result, name: '秘境行商', enemies: [], budget: undefined };
    if (kind === 'monster' && wave.stage! > 1) {
      if (strong && wave.stage! >= strong.startStage && (wave.stage! - strong.startStage) % strong.everyStages === 0) {
        const rng = encounterRandom.stream('encounter', wave.id, 4502);
        const unitId = strong.unitIds[rng.int(0, strong.unitIds.length - 1)];
        const monster = config.monsters.find(m => m.id === unitId)!;
        const leader = { unitId, ...(monsterFormation?.center ?? { x: 3, y: 6 }), star: 1,
          statMultiplier: 1 + (wave.stage! - strong.startStage) * strong.statGrowth };
        const guards: WaveConfig['enemies'] = [];
        if (escorts) {
          const count = Math.min(escorts.maxCount, escorts.initialCount
            + Math.floor((wave.stage! - strong.startStage) / strong.everyStages) * escorts.countPerEncounter);
          const guardRandom = encounterRandom.stream('encounter', wave.id, 4503), ids = escorts.unitIdsByLeader[unitId];
          for (const pair of escorts.pairs.slice(0, count / 2)) {
            const guardId = ids[guardRandom.int(0, ids.length - 1)];
            guards.push(...pair.map(cell => ({ unitId: guardId, ...cell, star: 1,
              statMultiplier: 1 + (wave.stage! - 1) * rules.monsterStatGrowth })));
          }
        }
        return { ...result, name: `${monster.name}巢穴`, budget: undefined, enemies: [leader, ...guards] };
      }
      const rng = encounterRandom.stream('encounter', wave.id, 4501);
      const ordinary = config.monsters.filter(m => m.monsterTier !== 'strong');
      const groups = monsterFormation ? monsterFormationGroups(wave.enemies.length, monsterFormation)
        : wave.enemies.map((_e, i) => [config.enemyProgression.cells[i]]);
      return { ...result, name: '野怪营地', budget: undefined, enemies: groups.flatMap(cells => {
        const pool = monsterFormation ? ordinary.filter(m => (m.range === 1) === (cells[0].y < monsterFormation.center.y)) : ordinary;
        const candidates = pool.length ? pool : ordinary;
        const unitId = candidates[rng.int(0, candidates.length - 1)].id;
        return cells.map(cell => ({ unitId, ...cell, star: 1, statMultiplier: 1 + (wave.stage! - 1) * rules.monsterStatGrowth }));
      }) };
    }
    return { ...result, name: kind === 'boss' ? '关底首领' : kind === 'elite' ? '精英守卫' : wave.name };
  };
  const decorate = (wave: WaveConfig): WaveConfig => {
    const encounter = decorateEncounter(wave);
    const result = generation?.equipmentPolicy ? applyEnemyUpgrades(encounter, generation.equipmentPolicy, roster, encounterRandom, generation.equipmentRoles) : encounter;
    if (!endless || wave.stage! < endless.startStage) return result;
    let rounds = progressionRounds(wave.stage!,wave.round!);
    for (let stage = endless.startStage; stage < wave.stage!; stage++) rounds += progressionRounds(stage,stageRoundCount(stage,config));
    const damageAmp = Number((rounds * endless.damageAmpPerRound).toFixed(4));
    const damageReduction = Number(Math.min(endless.damageReductionCap,
      (wave.stage! - endless.startStage + 1) * endless.damageReductionPerStage).toFixed(4));
    return { ...result, enemies: result.enemies.map(enemy => ({ ...enemy, damageAmp, damageReduction })) };
  };
  if(generation&&generation.mode!=='budget-v1')throw new Error('Unsupported enemy generation mode');
  if(config.enemyGoldBudget){
    validateEnemyGoldRules(config.enemyGoldBudget);
    const waves=buildIntroWaves(config,templates,roster)
      .map(w=>decorate({...w,waveKind:'intro',enemyGenerationMode:'budget-v1'}));
    let completed=0;
    for(let stage=2;stage<=normalizeStageCount(stageCount);stage++){
      const rounds=stageRoundCount(stage,config);
      const encounters=config.stageEncounters?planStageEncounters(stage,rounds,encounterRandom,config.stageEncounters.startStage):undefined;
      for(let round=1;round<=rounds;round++){
        const encounter=encounters?.[round-1],kind=encounter==='elite'||encounter==='boss'?encounter:'normal';
        generation?.onWave?.(waves.length+1,'start');
        const generated=generateGoldArmy(config.enemyGoldBudget,stage,completed,waves.length+1,kind,enemyPopulation(stage,round,completed,config),roster,generation?.traits??[],encounterRandom);
        generation?.onWave?.(waves.length+1,'end');
        const wave=decorate({id:waves.length+1,name:templates[Math.min(stage-2,templates.length-1)].name,stage,round,roundsInStage:rounds,
          waveKind:kind,enemyGenerationMode:'budget-v1',enemies:generated.enemies,goldBudget:generated.diagnostics});
        if(wave.encounterKind==='monster'||wave.encounterKind==='specialShop')delete wave.goldBudget;
        waves.push(wave);
        if(encounter!=='specialShop')completed++;
      }
    }
    return waves;
  }
  throw new Error('budget-v1 requires enemyGoldBudget configuration');
}

/** Validate shared progression rules and construct the authored opening encounters. */
function buildIntroWaves(config: RunConfig, templates: WaveConfig[], roster: UnitConfigData[]): WaveConfig[] {
  const growth = config.enemyProgression;
  if (!config.introWaves.length || !templates.length || !roster?.length || !growth
    || ![growth.initialPopulation, growth.populationEveryRounds, growth.populationCap, growth.lateStartStage].every(n => Number.isSafeInteger(n) && n > 0)
    || growth.populationCap > 10 || growth.initialPopulation > growth.populationCap
    || ![growth.damageAmpPerStage, growth.damageReductionPerStage, growth.damageReductionCap].every(n => Number.isFinite(n) && n >= 0 && n <= 1)
    || !growth.tiers.length || growth.tiers[0].stage !== 2
    || growth.tiers.some((t, i) => ![t.stage,t.cost,t.star].every(Number.isInteger) || t.cost < 1 || t.cost > 5 || t.star < 1 || t.star > 3 || (i > 0 && t.stage <= growth.tiers[i - 1].stage))
    || growth.cells.length < growth.populationCap || new Set(growth.cells.map(p => `${p.x},${p.y}`)).size !== growth.cells.length
    || growth.cells.some(p => !Number.isInteger(p.x) || !Number.isInteger(p.y) || p.x < 0 || p.y < 0)) {
    throw new Error('Invalid run configuration: enemy progression');
  }
  const schedule = growth.populationSchedule;
  if (schedule && (!Array.isArray(schedule.milestones) || !schedule.milestones.length
    || !Number.isSafeInteger(schedule.perStageAfterLast) || schedule.perStageAfterLast < 0
    || schedule.milestones.some((m, i, all) => !m || ![m.stage, m.round, m.population].every(Number.isSafeInteger)
      || m.stage < 2 || m.stage > MAX_STAGE_COUNT || m.round < 1 || m.round > stageRoundCount(m.stage, config)
      || m.population < 1 || m.population > growth.populationCap
      || (i === 0 ? m.stage !== 2 || m.round !== 1 || m.population !== growth.initialPopulation
        : m.stage < all[i - 1].stage || (m.stage === all[i - 1].stage && m.round <= all[i - 1].round)
          || m.population < all[i - 1].population)))) throw new Error('Invalid run configuration: enemy population schedule');
  const waves: WaveConfig[] = [];
  config.introWaves.forEach((wave, i) => waves.push({ ...wave, id: waves.length + 1, stage: 1, round: i + 1,
    roundsInStage: config.introWaves.length, enemies: wave.enemies.map(e => ({ ...e, star: 1, statMultiplier: 1 })) }));
  return waves;
}
