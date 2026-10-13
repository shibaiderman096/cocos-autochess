import { UnitConfigData } from './ConfigManager';
import { WaveConfig } from './RoundFlow';

export const MIN_STAGE_COUNT = 3;
export const DEFAULT_STAGE_COUNT = 3;
export const MAX_STAGE_COUNT = 99;
export interface RunConfig {
  roundsPerStage: number;
  /** Fixed increase in base stats per stage, independent of the chosen run length. */
  stageStatGrowth: number;
  /** Small additive stat increase per subround within the same stage. */
  roundStatGrowth: number;
  starterUnitId: string;
  monsters: UnitConfigData[];
  introWaves: WaveConfig[];
}

export function normalizeStageCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(MIN_STAGE_COUNT, Math.min(MAX_STAGE_COUNT, Math.floor(n))) : DEFAULT_STAGE_COUNT;
}

export function runRoundCount(stageCount: number, config: RunConfig): number {
  return config.introWaves.length + (normalizeStageCount(stageCount) - 1) * config.roundsPerStage;
}

/** Stage armies advance once per stage; the strongest army remains and keeps scaling. */
export function buildRunWaves(stageCount: number, config: RunConfig, templates: WaveConfig[]): WaveConfig[] {
  if (!config.introWaves.length || !templates.length || !Number.isInteger(config.roundsPerStage) || config.roundsPerStage < 1
    || !Number.isFinite(config.stageStatGrowth) || !Number.isFinite(config.roundStatGrowth) || config.roundStatGrowth <= 0
    || config.stageStatGrowth <= (config.roundsPerStage - 1) * config.roundStatGrowth) {
    throw new Error('Invalid run configuration: stage growth must exceed total subround growth');
  }
  const waves: WaveConfig[] = [];
  const add = (template: WaveConfig, stage: number, round: number, roundsInStage: number, multiplier: number) => {
    waves.push({ id: waves.length + 1, name: template.name, stage, round, roundsInStage,
      enemies: template.enemies.map(e => ({ ...e, statMultiplier: Number((e.statMultiplier * multiplier).toFixed(4)) })) });
  };
  config.introWaves.forEach((wave, i) => add(wave, 1, i + 1, config.introWaves.length, 1 + i * config.roundStatGrowth));
  for (let stage = 2; stage <= normalizeStageCount(stageCount); stage++) {
    const template = templates[Math.min(stage - 2, templates.length - 1)];
    for (let round = 1; round <= config.roundsPerStage; round++) {
      const multiplier = 1 + (stage - 2) * config.stageStatGrowth + (round - 1) * config.roundStatGrowth;
      add(template, stage, round, config.roundsPerStage, multiplier);
    }
  }
  return waves;
}
