import type { Rng } from './Rng';

export const OPENING_ENCOUNTER_IDS = ['inspiration', 'stipend', 'tempered', 'bounty', 'study', 'renewal'] as const;
export type OpeningEncounterId = typeof OPENING_ENCOUNTER_IDS[number];
export interface OpeningEncounterRules {
  name: string;
  refreshesPerLevel: number;
  incomeStartStage: number;
  incomePerStage: number;
  survivorMaxHp: number;
  victoryGold: number;
  battleExp: number;
  victoryHeal: number;
}
export interface OpeningEncounterState {
  selected?: OpeningEncounterId;
  freeRefreshes: number;
  lastIncomeStage: number;
  offered: OpeningEncounterId[];
}
export function drawOpeningEncounters(rng: Rng): OpeningEncounterId[] {
  const pool: OpeningEncounterId[] = [...OPENING_ENCOUNTER_IDS];
  const result: OpeningEncounterId[] = [];
  while (result.length < 3) result.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  return result;
}
export function openingEncounterChoices(rules: OpeningEncounterRules) {
  return [
    { id: 'inspiration' as const, name: '灵感迸发', description: `每次升级获得${rules.refreshesPerLevel}次免费刷新，可累积使用。` },
    { id: 'stipend' as const, name: '行旅津贴', description: `从第${rules.incomeStartStage}阶段开始，每阶段获得${rules.incomePerStage}金币。` },
    { id: 'tempered' as const, name: '百战淬体', description: `战斗结束，己方存活棋子获得${rules.survivorMaxHp}点永久最大生命值。` },
    { id: 'bounty' as const, name: '凯旋馈赠', description: `每次战斗胜利，额外获得${rules.victoryGold}金币。` },
    { id: 'study' as const, name: '勤学苦练', description: `每场战斗结束，额外获得${rules.battleExp}点经验，胜负均可。` },
    { id: 'renewal' as const, name: '复苏之风', description: `每次战斗胜利，恢复${rules.victoryHeal}点玩家生命，不超过生命上限。` },
  ];
}
