import { RunRandomContext } from './RunRandomContext';

export type StageEncounterKind = 'normal' | 'monster' | 'elite' | 'specialShop' | 'boss';

/** Seeded stage layout, independent of shops, combat RNG, and campaign length. */
export function planStageEncounters(stage: number, rounds: number, random: RunRandomContext, startStage = 4): StageEncounterKind[] {
  if (![stage, rounds, startStage].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid stage encounter layout');
  if (stage === 1) return Array(rounds).fill('monster');
  const plan: StageEncounterKind[] = Array(rounds).fill('normal');
  if (stage < 2) return plan;
  if (stage === 2 || stage === 3) {
    if (rounds < 3) throw new Error('Early stage encounters require at least three rounds');
    const rng = random.stream('encounter', stage);
    const early = Math.max(1, Math.floor(rounds / 3));
    plan[rng.int(0, early - 1)] = 'monster';
    if (stage === 3) plan[rng.int(early, Math.min(rounds - 2, Math.ceil(rounds * 2 / 3) - 1))] = 'specialShop';
    return plan;
  }
  if (stage < startStage) return plan;
  if (rounds < 5) throw new Error('Stage encounters require at least five rounds');
  const rng = random.stream('encounter', stage);
  const early = Math.max(1, Math.floor(rounds / 3));
  plan[rng.int(0, early - 1)] = 'monster';
  const middle = Array.from({ length: Math.min(rounds - 2, Math.ceil(rounds * 2 / 3)) - early }, (_, i) => early + i);
  for (let i = middle.length - 1; i > 0; i--) {
    const j = rng.int(0, i); [middle[i], middle[j]] = [middle[j], middle[i]];
  }
  plan[middle[0]] = 'elite';
  plan[middle[1]] = 'specialShop';
  plan[rounds - 1] = 'boss';
  return plan;
}
