import { UnitConfigData } from './ConfigManager';
import { WaveConfig } from './RoundFlow';

export const MIN_STAGE_COUNT = 3;
export const DEFAULT_STAGE_COUNT = 3;
export const MAX_STAGE_COUNT = 99;
export interface RunConfig {
  roundsPerStage: number;
  stageStatGrowth: number;
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

/** Intro monsters occupy stage one; every later stage has a complete ten-round sequence. */
export function buildRunWaves(stageCount: number, config: RunConfig, templates: WaveConfig[]): WaveConfig[] {
  if (!config.introWaves.length || !templates.length || config.roundsPerStage < 1) throw new Error('Invalid run configuration');
  const waves: WaveConfig[] = [];
  const add = (template: WaveConfig, stage: number, round: number, roundsInStage: number, multiplier: number) => {
    waves.push({ id: waves.length + 1, name: template.name, stage, round, roundsInStage,
      enemies: template.enemies.map(e => ({ ...e, statMultiplier: Number((e.statMultiplier * multiplier).toFixed(4)) })) });
  };
  config.introWaves.forEach((wave, i) => add(wave, 1, i + 1, config.introWaves.length, 1));
  for (let stage = 2; stage <= normalizeStageCount(stageCount); stage++) {
    for (let round = 1; round <= config.roundsPerStage; round++) {
      const template = templates[Math.floor((round - 1) * templates.length / config.roundsPerStage)];
      add(template, stage, round, config.roundsPerStage, 1 + (stage - 2) * config.stageStatGrowth);
    }
  }
  return waves;
}
