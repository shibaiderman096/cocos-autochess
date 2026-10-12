/**
 * 六边形数学（纯逻辑，无 cc 依赖）。
 * 尖顶六边形 + odd-r offset 坐标系：
 * - 每行水平对齐并排，奇数行横向错开半格（棋盘整体呈矩形蜂窝）。
 * - offset (col, row) 用于棋盘布局；axial (q, r) 用于距离和寻路。
 */

import { Pos } from './types';

export const SQRT3 = Math.sqrt(3);

/** 6 邻居方向（axial 坐标，固定顺序保证确定性） */
export const HEX_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],   // E
  [1, -1],  // NE
  [0, -1],  // N
  [-1, 0],  // W
  [-1, 1],  // SW
  [0, 1],   // S
];

/** offset (col, row) → axial (q, r)，odd-r */
export function offsetToAxial(col: number, row: number): { q: number; r: number } {
  const q = col - (row - (row & 1)) / 2;
  return { q: q, r: row };
}

/** axial (q, r) → offset (col, row)，odd-r */
export function axialToOffset(q: number, r: number): { col: number; row: number } {
  const col = q + (r - (r & 1)) / 2;
  return { col: col, row: r };
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

/** 六边形距离（cube 坐标，替代曼哈顿距离） */
export function hexDist(a: Pos, b: Pos): number {
  const ax = offsetToAxial(a.x, a.y);
  const bx = offsetToAxial(b.x, b.y);
  const acy = -ax.q - ax.r;
  const bcy = -bx.q - bx.r;
  return Math.max(
    Math.abs(ax.q - bx.q),
    Math.abs(acy - bcy),
    Math.abs(ax.r - bx.r),
  );
}

/** 6 邻居（offset 坐标） */
export function hexNeighbors(x: number, y: number): Pos[] {
  const ax = offsetToAxial(x, y);
  return HEX_DIRS.map(([dq, dr]) => {
    const n = axialToOffset(ax.q + dq, ax.r + dr);
    return { x: n.col, y: n.row };
  });
}

// ─── offset ↔ world（尖顶六边形，odd-r） ───

/**
 * offset (col, row) → 本地世界坐标（未居中，y 向上为正）。
 * 行水平对齐：同行 y 相同；奇数行右移半格。
 */
export function offsetToWorld(
  col: number, row: number,
  hexSize: number,
  offsetX: number, offsetY: number,
): { x: number; y: number } {
  return {
    x: offsetX + hexSize * SQRT3 * (col + 0.5 * (row & 1)),
    y: offsetY + hexSize * 1.5 * row,
  };
}

/** 本地世界坐标 → 最近 offset (col, row) */
export function worldToOffset(
  wx: number, wy: number,
  hexSize: number,
  offsetX: number, offsetY: number,
): { col: number; row: number } {
  const lx = wx - offsetX;
  const ly = wy - offsetY;
  const qf = (SQRT3 / 3 * lx - 1 / 3 * ly) / hexSize;
  const rf = (2 / 3 * ly) / hexSize;
  const rounded = cubeRound(qf, rf);
  return axialToOffset(rounded.q, rounded.r);
}
