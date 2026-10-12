import { Pos } from './types';
import { hexDist, hexNeighbors } from './HexMath';

export { hexDist as dist } from './HexMath';

/**
 * 六边形 BFS，返回朝 goalTest 满足的格子前进的下一步。
 * blocked 由调用方提供（占位格子为 true）。
 * hexNeighbors 固定顺序保证同种子结果可复现。
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
    for (const n of hexNeighbors(c.x, c.y)) {
      if (n.x < 0 || n.y < 0 || n.x >= w || n.y >= h) continue;
      const k = key(n.x, n.y);
      if (prev.has(k) || blocked(n.x, n.y)) continue;
      prev.set(k, key(c.x, c.y));
      q.push(n);
    }
  }
  return null;
}
