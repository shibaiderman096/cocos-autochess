/**
 * 六边形数学（纯逻辑，无 cc 依赖）。
 * 平顶六边形 + odd-q offset 坐标系。
 * offset (col, row) 用于棋盘布局；axial (q, r) 用于距离和寻路。
 */

import { Pos } from './types';

export const SQRT3 = Math.sqrt(3);

/** 6 邻居方向（odd-q offset，固定顺序保证确定性） */
export const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],  // N
  [1, -1],  // NE
  [1, 0],   // SE
  [0, 1],   // S
  [-1, 1],  // SW
  [-1, 0],  // NW
];

/** offset (col, row) → axial (q, r)，odd-q */
export function offsetToAxial(col: number, row: number): { q: number; r: number } {
  const q = col;
  const r = row - (col - (col & 1)) / 2;
  return { q, r };
}

/** axial (q, r) → offset (col, row)，odd-q */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  const col = q;
  const row = r + (q - (q & 1)) / 2;
  return { col, row };
}

/** cube round：将浮点 axial 坐标四舍五入到最近格 */
function cubeRound(qf: number, rf: number): { q: number; r: number } {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);
  const xd = Math.abs(rx - xf);
  const yd = Math.abs(ry - yf);
  const zd = Math.abs(rz - zf);
  if (xd > yd && xd > zd) rx = -ry - rz;
  else if (yd > zd) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

/** 六边形距离（替代曼哈顿距离） */
export function hexDist(a: Pos, b: Pos): number {
  const ax = offsetToAxial(a.x, a.y);
  const bx = offsetToAxial(b.x, b.y);
  // cube distance
  const acx = ax.q, acz = ax.r, acy = -acx - acz;
  const bcx = bx.q, bcz = bx.r, bcy = -bcx - bcz;
  return Math.max(
    Math.abs(acx - bcx),
    Math.abs(acy - bcy),
    Math.abs(acz - bcz),
  );
}

/** 6 邻居 */
export function hexNeighbors(x: number, y: number): Pos[] {
  return HEX_DIRS.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

// ─── offset ↔ world（平顶六边形） ───

/** offset (col, row) → 本地世界坐标 */
export function offsetToWorld(
  col: number, row: number,
  hexSize: number,
  offsetX: number, offsetY: number,
): { x: number; y: number } {
  const { q, r } = offsetToAxial(col, row);
  return {
    x: offsetX + hexSize * 1.5 * q,
    y: offsetY + hexSize * SQRT3 * (r + q / 2),
  };
}

/** 本地世界坐标 → 最近 offset (col, row) */
export function worldToOffset(
  wx: number, wy: number,
  hexSize: number,
  offsetX: number, offsetY: number,
): { col: number; row: number } {
  const qf = (wx - offsetX) / (hexSize * 1.5);
  const rf = (wy - offsetY) / (hexSize * SQRT3) - qf / 2;
  const rounded = cubeRound(qf, rf);
  return axialToOffset(rounded.q, rounded.r);
}
