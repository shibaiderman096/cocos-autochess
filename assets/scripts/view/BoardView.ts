import { _decorator, Component, Graphics, Vec3, Color } from 'cc';
import { Grid } from '../battle/Grid';

const { ccclass, property } = _decorator;

/**
 * 棋盘绘制（M1 占位版）。
 * - 挂在一个空 Node 上（节点需有 Graphics 组件，或由本脚本自动添加）。
 * - 自动画 8×8 格子：下 4 行偏暖 = 己方，上 4 行偏冷 = 敌方。
 * - 提供 cellToWorld / worldToCell 互转，供 UnitView 定位。
 */
@ccclass('BoardView')
export class BoardView extends Component {
  @property
  cellSize = 64; // 每格像素（世界单位）

  @property
  boardWidth = 8;

  @property
  boardHeight = 8;

  grid: Grid;
  private g: Graphics;

  start() {
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.redraw();
  }

  redraw() {
    const g = this.g;
    g.clear();
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const own = y < this.boardHeight / 2;
        const base = own ? new Color(168, 130, 90, 255) : new Color(96, 120, 150, 255);
        const dark = (x + y) % 2 === 0;
        g.fillColor = dark
          ? base
          : new Color(Math.max(0, base.r - 18), Math.max(0, base.g - 18), Math.max(0, base.b - 18), 255);
        g.rect(
          -halfW + x * this.cellSize,
          halfH - (y + 1) * this.cellSize,
          this.cellSize,
          this.cellSize,
        );
        g.fill();
      }
    }
    // 外框
    g.strokeColor = new Color(40, 30, 20, 255);
    g.lineWidth = 3;
    g.rect(-halfW, -halfH, this.boardWidth * this.cellSize, this.boardHeight * this.cellSize);
    g.stroke();
  }

  /** 格子坐标（逻辑）→ 本地世界坐标 */
  cellToWorld(x: number, y: number): Vec3 {
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    return new Vec3(
      -halfW + (x + 0.5) * this.cellSize,
      halfH - (y + 0.5) * this.cellSize,
      0,
    );
  }

  /** 本地世界坐标 → 格子坐标；出界返回 null */
  worldToCell(wx: number, wy: number): { x: number; y: number } | null {
    const halfW = (this.boardWidth * this.cellSize) / 2;
    const halfH = (this.boardHeight * this.cellSize) / 2;
    const fx = (wx + halfW) / this.cellSize - 0.5;
    const fy = (halfH - wy) / this.cellSize - 0.5;
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x < 0 || y < 0 || x >= this.boardWidth || y >= this.boardHeight) return null;
    return { x, y };
  }
}
