import { Rng } from './Rng';

export const RUN_RULES_VERSION = 1;
export const DEFAULT_RUN_SEED = 1;
/** Entropy is sampled only when the UI starts a new run; simulations always receive a persisted seed. */
export function freshRunSeed(previous?: number): number {
  const seed = (Math.floor(Math.random() * 0x100000000) ^ Date.now()) >>> 0;
  return seed === previous ? (seed + 1) >>> 0 : seed;
}
export type RandomSubsystem = 'shop' | 'battle' | 'enemy' | 'formation' | 'reward' | 'bot' | 'encounter' | 'starter' | 'forge' | 'dice';

export function isRunSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

/** Versioned FNV-1a plus an integer avalanche; no process/string-hash implementation dependency. */
export function deriveSeed(runSeed: number, subsystem: RandomSubsystem, waveId: number, index = 0): number {
  if (!isRunSeed(runSeed) || !Number.isSafeInteger(waveId) || waveId < 1 || !Number.isSafeInteger(index) || index < 0) {
    throw new Error('Invalid random context');
  }
  const input = `run-rng-v1|${runSeed}|${subsystem}|${waveId}|${index}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) h = Math.imul(h ^ input.charCodeAt(i), 0x01000193);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) || 1;
}

/** Each request creates an independent local stream; repeatable actions persist their own indices. */
export class RunRandomContext {
  constructor(readonly runSeed: number) {
    if (!isRunSeed(runSeed)) throw new Error('runSeed must be a uint32 integer');
  }
  seed(subsystem: RandomSubsystem, waveId: number, index = 0): number {
    return deriveSeed(this.runSeed, subsystem, waveId, index);
  }
  stream(subsystem: RandomSubsystem, waveId: number, index = 0): Rng {
    return new Rng(this.seed(subsystem, waveId, index));
  }
}
