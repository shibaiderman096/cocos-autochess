import { offsetToWorld, worldToOffset } from './HexMath';
import { Pos } from './types';

/** First occupied hex on the finite muzzle-to-target segment; allies are filtered by the caller. */
export function firstRailTarget<T extends { id: number; pos: Pos }>(from: Pos, to: Pos, enemies: T[]): T | undefined {
  const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(to.x, to.y, 1, 0, 0);
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 20));
  for (let i = 1; i <= steps; i++) {
    const cell = worldToOffset(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps, 1, 0, 0);
    if (cell.col === from.x && cell.row === from.y) continue;
    const hit = enemies.filter(e => e.pos.x === cell.col && e.pos.y === cell.row).sort((x, y) => x.id - y.id)[0];
    if (hit) return hit;
  }
  return undefined;
}
