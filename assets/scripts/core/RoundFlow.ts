import { Side } from '../battle/types';

export type RoundPhase = 'prepare' | 'battle' | 'settlement' | 'ended';
export type RunResult = 'victory' | 'defeat' | null;
export interface WaveEnemy { unitId: string; x: number; y: number; star: number; statMultiplier: number }
export interface WaveConfig { id: number; name: string; enemies: WaveEnemy[] }
export interface RoundSettlement {
  waveId: number; winner: Side | -1; enemySurvivors: number;
  healthLost: number; healthRemaining: number; runResult: RunResult;
}
export interface RoundSnapshot {
  phase: RoundPhase; waveIndex: number; health: number; result: RunResult;
  lastSettlement: RoundSettlement | null;
}

/** Pure TS run state; settling a wave is idempotent and advancing requires settlement. */
export class RoundFlow {
  private state: RoundSnapshot;
  constructor(readonly waves: WaveConfig[], private rules: { initialHealth: number; lossPerEnemy: number }, saved?: RoundSnapshot) {
    if (!waves.length) throw new Error('RoundFlow requires at least one wave');
    this.state = saved ? {
      ...saved, waveIndex: Math.max(0, Math.min(waves.length - 1, saved.waveIndex)),
      health: Math.max(0, Math.min(rules.initialHealth, saved.health)),
      lastSettlement: saved.lastSettlement ? { ...saved.lastSettlement } : null,
    } : this.freshState();
    // An interrupted battle resumes at preparation with no rewards or health loss.
    if (this.state.phase === 'battle') this.state.phase = 'prepare';
    if (this.state.phase === 'prepare') { this.state.result = null; this.state.lastSettlement = null; }
    if (this.state.phase === 'ended' && this.state.health > 0 && this.state.waveIndex !== waves.length - 1) {
      this.state.phase = 'prepare'; this.state.result = null; this.state.lastSettlement = null;
    }
    if (this.state.phase === 'ended' && this.state.health > 0) this.state.result = 'victory';
    if (this.state.phase === 'settlement' && this.state.waveIndex === waves.length - 1) {
      this.state.phase = 'ended'; this.state.result = this.state.health > 0 ? 'victory' : 'defeat';
    }
    if (this.state.health === 0) { this.state.phase = 'ended'; this.state.result = 'defeat'; }
  }
  private freshState(): RoundSnapshot {
    return { phase:'prepare', waveIndex:0, health:this.rules.initialHealth, result:null, lastSettlement:null };
  }
  get phase(): RoundPhase { return this.state.phase; }
  get health(): number { return this.state.health; }
  get waveIndex(): number { return this.state.waveIndex; }
  get wave(): WaveConfig { return this.waves[this.waveIndex]; }
  get result(): RunResult { return this.state.result; }
  get lastSettlement(): RoundSettlement | null { return this.state.lastSettlement ? { ...this.state.lastSettlement } : null; }
  startBattle(): boolean {
    if (this.phase !== 'prepare') return false;
    this.state.phase = 'battle'; return true;
  }
  settle(winner: Side | -1, survivors: number): RoundSettlement | null {
    if (this.phase !== 'battle') return null;
    const enemySurvivors = Math.max(0, Math.floor(survivors));
    const healthLost = winner === 0 ? 0 : Math.min(this.health, enemySurvivors * this.rules.lossPerEnemy);
    this.state.health -= healthLost;
    this.state.result = this.health === 0 ? 'defeat' : this.waveIndex === this.waves.length - 1 ? 'victory' : null;
    this.state.phase = this.result ? 'ended' : 'settlement';
    return this.state.lastSettlement = { waveId:this.wave.id, winner, enemySurvivors, healthLost,
      healthRemaining:this.health, runResult:this.result };
  }
  nextWave(): boolean {
    if (this.phase !== 'settlement') return false;
    this.state.waveIndex++; this.state.phase = 'prepare'; this.state.lastSettlement = null; return true;
  }
  restart(): void { this.state = this.freshState(); }
  snapshot(): RoundSnapshot {
    return { ...this.state, lastSettlement:this.lastSettlement ? { ...this.lastSettlement } : null };
  }
}
