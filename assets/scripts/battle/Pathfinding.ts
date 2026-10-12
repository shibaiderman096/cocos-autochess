import { Pos } from './types';

const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [-1, 0], [1, 0], [0, 1]];

export const dist = (a: Pos, b: Pos): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * BFS，返回朝 goalTest 满足的格子前进的下一步。
 * blocked 由调用方提供（占位格子为 true）。
 * DIRS 固定顺序保证同种子结果可复现。
 */
export function nextStep(
  from: Pos,
  w: number,
  h: number,
  blocked: (x: number, y: number) => boolean,
  goalTest: (x: number, y: number) => boolean,
): Pos | null {
  const key = (x: number, y: number) => y * w + x;
  const startKey = key(from.x, from.y);
  const prev = new Map<number, number>();
  const q: Pos[] = [from];
  prev.set(startKey, -1);

  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (goalTest(c.x, c.y)) {
      if (key(c.x, c.y) === startKey) return null; // 已在目标区
      let k = key(c.x, c.y);
      while (prev.get(k) !== startKey) k = prev.get(k)!;
      return { x: k % w, y: Math.floor(k / w) };
    }
    for (const [dx, dy] of DIRS) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const k = key(nx, ny);
      if (prev.has(k) || blocked(nx, ny)) continue;
      prev.set(k, key(c.x, c.y));
      q.push({ x: nx, y: ny });
    }
  }
  return null;
}
