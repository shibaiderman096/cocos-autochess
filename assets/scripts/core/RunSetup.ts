import { UnitConfigData, combatAttributes } from './ConfigManager';
import { WaveConfig } from './RoundFlow';

export const MIN_STAGE_COUNT = 3;
export const DEFAULT_STAGE_COUNT = 3;
export const MAX_STAGE_COUNT = 99;
export interface RunConfig {
  roundsPerStage: number;
  roundsPerStageGrowth?: number;
  maxRoundsPerStage?: number;
  monsterStatScale: number;
  monsterAttackSpeed: number;
  enemyProgression: {
    initialPopulation: number; populationEveryRounds: number; populationCap: number;
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
  return Number.isFinite(n) ? Math.max(MIN_STAGE_COUNT, Math.min(MAX_STAGE_COUNT, Math.floor(n))) : DEFAULT_STAGE_COUNT;
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

/** Monsters share a one-cost baseline; identity, range and art remain creature-specific. */
export function buildMonsterUnits(config: RunConfig, roster: UnitConfigData[]): UnitConfigData[] {
  const base = roster.find(u => u.id === config.starterUnitId && u.cost === 1);
  if (!base || !Number.isFinite(config.monsterStatScale) || config.monsterStatScale <= 0 || config.monsterStatScale > 1) throw new Error('Invalid monster baseline');
  const multiplier = config.monsterStatScale;
  if (!Number.isFinite(config.monsterAttackSpeed) || config.monsterAttackSpeed <= 0) throw new Error('Invalid monster attack speed');
  const attributes = combatAttributes(base);
  return config.monsters.map(monster => ({ ...monster, skillId: undefined,
    hp: Math.round(base.hp * multiplier), atk: base.atk * multiplier, armor: base.armor * multiplier,
    mr: base.mr * multiplier, atkSpeed: config.monsterAttackSpeed,
    maxMana: base.maxMana * multiplier, startMana: base.startMana * multiplier, manaPerHit: base.manaPerHit * multiplier,
    spellPower: attributes.spellPower * multiplier, critChance: attributes.critChance * multiplier,
    lifesteal: attributes.lifesteal * multiplier, damageAmp: attributes.damageAmp * multiplier,
    damageReduction: attributes.damageReduction * multiplier }));
}

/** Enemy growth uses shared unit configs, cost, star and population instead of base-stat multipliers. */
export function buildRunWaves(stageCount: number, config: RunConfig, templates: WaveConfig[], roster: UnitConfigData[]): WaveConfig[] {
  runRoundCount(stageCount, config);
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
  const waves: WaveConfig[] = [];
  config.introWaves.forEach((wave, i) => waves.push({ ...wave, id: waves.length + 1, stage: 1, round: i + 1,
    roundsInStage: config.introWaves.length, enemies: wave.enemies.map(e => ({ ...e, star: 1, statMultiplier: 1 })) }));
  let completedRounds = 0;
  for (let stage = 2; stage <= normalizeStageCount(stageCount); stage++) {
    const template = templates[Math.min(stage - 2, templates.length - 1)];
    const tier = growth.tiers.filter(t => t.stage <= stage).slice(-1)[0];
    const cost = Math.max(...roster.filter(u => (u.cost ?? 1) <= tier.cost).map(u => u.cost ?? 1));
    const units = roster.filter(u => (u.cost ?? 1) === cost);
    if (!units.length) throw new Error('Invalid run configuration: no units for enemy cost tier');
    const lateStages = Math.max(0, stage - growth.lateStartStage + 1);
    const damageAmp = Number((lateStages * growth.damageAmpPerStage).toFixed(4));
    const damageReduction = Number(Math.min(growth.damageReductionCap, lateStages * growth.damageReductionPerStage).toFixed(4));
    const rounds = stageRoundCount(stage, config);
    for (let round = 1; round <= rounds; round++) {
      const population = Math.min(growth.populationCap, growth.initialPopulation + Math.floor(completedRounds / growth.populationEveryRounds));
      waves.push({ id: waves.length + 1, name: template.name, stage, round, roundsInStage: rounds,
        enemies: Array.from({ length: population }, (_, i) => ({ unitId: units[i % units.length].id, star: tier.star,
          ...growth.cells[i], statMultiplier: 1, damageAmp, damageReduction })) });
      completedRounds++;
    }
  }
  return waves;
}
