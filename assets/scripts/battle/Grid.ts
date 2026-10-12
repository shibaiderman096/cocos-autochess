/**
 * 六边形棋盘（纯逻辑，无 cc）。
 * 平顶六边形，odd-q offset 坐标。
 * 默认 8 列 × 6 行；y=0 是底部（己方），y=h-1 是顶部（敌方）。
 */
export class Grid {
  constructor(public w = 8, public h = 6) {}

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** 己方半场（下 ownRows 行） */
  isOwnHalf(y: number, ownRows = this.h / 2): boolean {
    return y < ownRows;
  }

  /** 敌方半场（上 h - ownRows 行） */
  isEnemyHalf(y: number, ownRows = this.h / 2): boolean {
    return y >= ownRows;
  }
}
