import { UnitConfigData, combatAttributes } from './ConfigManager';
import { WaveConfig } from './RoundFlow';
import { EnemyGenerator } from './EnemyGenerator';
import { EnemyBudget, classifyWave } from './EnemyBudget';
import type { WaveBudgetBounds } from './EnemyBudget';
import { RunRandomContext } from './RunRandomContext';
import type { EnemyDifficultyConfig, EnemyGenerationMode } from './EnemyGenerationTypes';
import type { EnemyPowerData } from './EnemyPowerTypes';
import type { EquipmentPolicyConfig } from './EquipmentPolicyTypes';
import type { EnemyRoleConfig } from './EnemyFormationTypes';
import { planStageEncounters } from './StageEncounters';
import type { StageEncounterRules } from './StageProgression';

export const MIN_STAGE_COUNT = 3;
export const DEFAULT_STAGE_COUNT = 3;
export const MAX_STAGE_COUNT = 99;
export interface RunConfig {
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

/** Four-argument calls retain the legacy public contract; sessions explicitly select their saved mode. */
export interface EnemyGenerationOptions { mode:EnemyGenerationMode; runSeed?:number; difficulty?:EnemyDifficultyConfig; power?:EnemyPowerData;
  earlyEncounterLayout?: 'legacy' | 'random-rounds-v1';
  equipmentPolicy?:EquipmentPolicyConfig;
  equipmentRoles?:EnemyRoleConfig;
  /** Optional offline timing observer. Timing is never read by the generator or serialized into waves. */
  onWave?: (globalWaveId:number,phase:'start'|'end')=>void }
export function buildRunWaves(stageCount:number,config:RunConfig,templates:WaveConfig[],roster:UnitConfigData[],generation?:EnemyGenerationOptions):WaveConfig[] {
  const strong = config.stageEncounters?.strongMonster;
  if (strong && (!Number.isSafeInteger(strong.startStage) || strong.startStage < 4
    || !Number.isSafeInteger(strong.everyStages) || strong.everyStages < 1
    || !Number.isFinite(strong.statGrowth) || strong.statGrowth < 0
    || !config.monsters.some(m => m.id === strong.unitId && m.monsterTier === 'strong')))
    throw new Error('Invalid strong monster encounter configuration');
  const encounterRandom = new RunRandomContext(generation?.runSeed ?? 1);
  const decorate = (wave: WaveConfig): WaveConfig => {
    const rules = config.stageEncounters; if (!rules) return wave;
    const kind = planStageEncounters(wave.stage!, wave.roundsInStage!, encounterRandom, rules.startStage, generation?.earlyEncounterLayout !== 'legacy')[wave.round! - 1];
    const result = { ...wave, encounterKind: kind, waveKind: wave.stage === 1 ? 'intro' as const : kind === 'elite' || kind === 'boss' ? kind : 'normal' as const };
    if (kind === 'specialShop') return { ...result, name: '特殊商店', enemies: [], budget: undefined };
    if (kind === 'monster' && wave.stage! > 1) {
      if (strong && wave.stage! >= strong.startStage && (wave.stage! - strong.startStage) % strong.everyStages === 0) {
        return { ...result, name: '末影巨龙巢穴', budget: undefined, enemies: [{ unitId: strong.unitId,
          x: 3, y: 6, star: 1, statMultiplier: 1 + (wave.stage! - strong.startStage) * strong.statGrowth }] };
      }
      const rng = encounterRandom.stream('encounter', wave.id, 4501);
      const ordinary = config.monsters.filter(m => m.monsterTier !== 'strong');
      return { ...result, name: '野怪营地', budget: undefined, enemies: wave.enemies.map((_e, i) => ({ unitId: ordinary[rng.int(0, ordinary.length - 1)].id,
        ...config.enemyProgression.cells[i], star: 1, statMultiplier: 1 + (wave.stage! - 1) * rules.monsterStatGrowth })) };
    }
    return { ...result, name: kind === 'boss' ? '关底首领' : kind === 'elite' ? '精英守卫' : wave.name };
  };
  if(!generation||generation.mode==='legacy')return buildLegacyRunWaves(stageCount,config,templates,roster).map(decorate);
  if(generation.mode!=='budget-v1'||!generation.difficulty||!generation.power)throw new Error('budget-v1 requires its difficulty configuration and calibrated power model');
  const legacy=buildLegacyRunWaves(MIN_STAGE_COUNT,config,templates,roster);
  if(config.enemyProgression.populationCap!==generation.difficulty.maxPopulation)throw new Error('Enemy population policy must retain the existing curve');
  const generator=new EnemyGenerator(generation.difficulty,generation.power,roster,new RunRandomContext(generation.runSeed??1),generation.equipmentPolicy,generation.equipmentRoles);
  const canonicalRoster=roster.slice().sort((a,b)=>a.id===config.starterUnitId?-1:b.id===config.starterUnitId?1:a.id<b.id?-1:a.id>b.id?1:0);
  const baseline=buildLegacyRunWaves(MIN_STAGE_COUNT,config,templates,canonicalRoster).find(w=>w.stage===2&&w.round===1)!;
  const b0=generator.model.estimateTeamPower(baseline.enemies.map(e=>({unitId:e.unitId,cost:roster.find(u=>u.id===e.unitId)?.cost,star:e.star,equipment:e.equipment??[]}))).power;
  const bounds:WaveBudgetBounds[]=[];let w=0;
  // One complete stage of lookahead makes the last selected stage independent of campaign length.
  for(let stage=2;stage<=MAX_STAGE_COUNT+1;stage++){
    const rounds=stageRoundCount(stage,config);
    const encounters = config.stageEncounters ? planStageEncounters(stage, rounds, encounterRandom, config.stageEncounters.startStage, generation.earlyEncounterLayout !== 'legacy') : undefined;
    for(let round=1;round<=rounds;round++){
      const encounter = encounters?.[round - 1];
      const kind = encounters ? (encounter === 'elite' || encounter === 'boss' ? encounter : 'normal') : classifyWave(stage,round,rounds,generation.difficulty) as 'normal'|'elite'|'boss';
      const population=Math.min(config.enemyProgression.populationCap,config.enemyProgression.initialPopulation+Math.floor(w/config.enemyProgression.populationEveryRounds));
      const interval=generator.bounds(stage,kind,population);w++;
      bounds.push({globalWaveId:config.introWaves.length+w,budgetWaveIndex:w,stage,round,rounds,population,kind,...interval});
    }
  }
  const budget=new EnemyBudget(b0,generation.difficulty,bounds);
  const waves:WaveConfig[]=legacy.filter(w=>w.stage===1).map(w=>decorate({...w,waveKind:'intro',enemyGenerationMode:'budget-v1'}));
  for(const b of bounds.filter(v=>v.stage<=normalizeStageCount(stageCount))){
    generation.onWave?.(b.globalWaveId,'start');
    const generated=generator.generate(budget.calculate(b),b.population,config.enemyProgression.cells);
    generation.onWave?.(b.globalWaveId,'end');
    waves.push(decorate({id:b.globalWaveId,name:templates[Math.min(b.stage-2,templates.length-1)].name,stage:b.stage,round:b.round,roundsInStage:b.rounds,
      waveKind:b.kind,enemyGenerationMode:'budget-v1',enemies:generated.enemies,budget:JSON.parse(JSON.stringify(generated.diagnostics))}));
  }
  return waves;
}

/** Legacy body retained for byte-equivalent P0 enemies, including its late free scaling. */
export function buildLegacyRunWaves(stageCount: number, config: RunConfig, templates: WaveConfig[], roster: UnitConfigData[]): WaveConfig[] {
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
