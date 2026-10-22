import { Rng } from '../core/Rng';
import { hexDist } from './HexMath';
import type { Pos, Side } from './types';

/** A dedicated stream keeps formation previews stable and never consumes combat RNG. */
export function astralCells(seed: number, side: Side, width: number, height: number, ownRows: number, count: number | 'all'): Pos[] {
  const rows = Math.min(ownRows, height);
  const cells: Pos[] = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < width; x++) {
    cells.push({ x, y: side === 0 ? y : height - 1 - y });
  }
  const rng = new Rng((seed ^ 0x41535452 ^ Math.imul(side + 1, 0x9e3779b9)) >>> 0);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, count === 'all' ? cells.length : count).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Consider every legal cell, including empty centers between enemies. Ties use row then column. */
export function densestAstralCenter(targets: readonly Pos[], width: number, height: number, radius: number): Pos | null {
  let best: Pos | null = null, hits = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const center = { x, y }, count = targets.filter(target => hexDist(center, target) <= radius).length;
    if (count > hits) { best = center; hits = count; }
  }
  return best;
}
