import type { ExplorerTraitEffect } from '../battle/types';

export interface ExplorerProgress {
  points: number;
  lastSettledWaveId: number;
  lastOpenedWaveId: number;
}
export function freshExplorerProgress(): ExplorerProgress {
  return { points: 0, lastSettledWaveId: 0, lastOpenedWaveId: 0 };
}
export function isExplorerBattle(wave: {encounterKind?:string;enemies:readonly {unitId:string}[]}, roster: readonly {id:string}[]): boolean {
  if(wave.encounterKind==='monster'||wave.encounterKind==='specialShop'||!wave.enemies.length)return false;
  const ids=new Set(roster.map(unit=>unit.id));
  return wave.enemies.every(enemy=>ids.has(enemy.unitId));
}
export function validateExplorerProgress(state: ExplorerProgress): void {
  if (!state || ![state.points,state.lastSettledWaveId,state.lastOpenedWaveId].every(v=>Number.isSafeInteger(v)&&v>=0))
    throw new Error('Invalid saved explorer progress');
}
/** Called once per settled real battle; previews and manual encounters never award points. */
export function settleExplorerProgress(state: ExplorerProgress, effect: ExplorerTraitEffect | undefined, kills: number, winner: number, waveId: number): number {
  if (waveId<=state.lastSettledWaveId) return 0;
  const gain=effect?(effect.pointsPerBattle+kills*effect.pointsPerKill)*(winner===0?1:effect.lossMultiplier):0;
  if (!Number.isSafeInteger(gain)||gain<0||!Number.isSafeInteger(state.points+gain)) throw new Error('Explorer progress overflow');
  state.points+=gain;state.lastSettledWaveId=waveId;return gain;
}
