import { _decorator, Component, Graphics, Node, Vec3, Color, UITransform } from 'cc';
import { Grid } from '../battle/Grid';
import { SQRT3 } from '../battle/HexMath';

const { ccclass, property } = _decorator;

/**
 * 六边形棋盘渲染（尖顶六边形，odd-r）。
 * - 行水平对齐并排，奇数行横向错开半格 → 整体呈矩形蜂窝。
 * - 包围盒居中；cellToWorld 用预计算表；worldToCell 像素最近邻。
 */
@ccclass('BoardView')
export class BoardView extends Component {
  @property
  hexSize = 36;

  @property
  boardWidth = 8;

  @property
  boardHeight = 6;

  grid: Grid;
  private g: Graphics;
  private cellWorlds = new Map<string, { x: number; y: number }>();
  boardPixelW = 0;
  boardPixelH = 0;

  start() {
    this.initialize(this.boardWidth, this.boardHeight, this.hexSize);
  }

  /** Stage 加载配置后立即初始化，避免等待 start 导致棋子坐标尚未生成。 */
  initialize(width: number, height: number, hexSize: number): void {
    this.boardWidth = width;
    this.boardHeight = height;
    this.hexSize = hexSize;
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.buildHexGrid();
  }

  /** odd-r 尖顶六边形原始坐标（未居中，y 向上） */
  private rawCellPos(x: number, y: number): { x: number; y: number } {
    return {
      x: this.hexSize * SQRT3 * (x + 0.5 * (y & 1)),
      y: this.hexSize * 1.5 * y,
    };
  }

  private buildHexGrid() {
    this.cellWorlds.clear();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const p = this.rawCellPos(x, y);
        minX = Math.min(minX, p.x - this.hexSize * SQRT3 / 2);
        maxX = Math.max(maxX, p.x + this.hexSize * SQRT3 / 2);
        minY = Math.min(minY, p.y - this.hexSize);
        maxY = Math.max(maxY, p.y + this.hexSize);
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const p = this.rawCellPos(x, y);
        this.cellWorlds.set(`${x},${y}`, { x: p.x - cx, y: p.y - cy });
      }
    }
    this.boardPixelW = maxX - minX;
    this.boardPixelH = maxY - minY;

    const ut = this.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ut.setContentSize(this.boardPixelW, this.boardPixelH);

    this.redraw();
  }

  /** 画一个尖顶六边形路径（顶点朝上/下） */
  private hexPath(g: Graphics, cx: number, cy: number, size: number) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const angle = Math.PI / 6 + (Math.PI / 3) * i; // 30°, 90°, 150°, 210°, 270°, 330°
      pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.close();
  }

  redraw() {
    const g = this.g;
    g.clear();
    const ownRows = this.boardHeight / 2;

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const w = this.cellWorlds.get(`${x},${y}`)!;
        const own = y < ownRows;
        const checker = (x + y) % 2 === 0;
        const base = own
          ? (checker ? new Color(168, 130, 90, 235) : new Color(150, 112, 72, 235))
          : (checker ? new Color(96, 120, 150, 235) : new Color(78, 102, 132, 235));
        g.fillColor = base;
        this.hexPath(g, w.x, w.y, this.hexSize * 0.94);
        g.fill();
        g.strokeColor = new Color(40, 30, 20, 120);
        g.lineWidth = 1.5;
        this.hexPath(g, w.x, w.y, this.hexSize * 0.94);
        g.stroke();
      }
    }

    // 己方/敌方分界线（水平中线）
    const midLineY = (this.cellWorlds.get(`0,${ownRows - 1}`)!.y + this.cellWorlds.get(`0,${ownRows}`)!.y) / 2;
    g.strokeColor = new Color(255, 220, 120, 160);
    g.lineWidth = 2;
    g.moveTo(-this.boardPixelW / 2, midLineY);
    g.lineTo(this.boardPixelW / 2, midLineY);
    g.stroke();  }

  /** 格子坐标 → 本地世界坐标 */
  cellToWorld(x: number, y: number): Vec3 {
    const cached = this.cellWorlds.get(`${x},${y}`);
    if (cached) return new Vec3(cached.x, cached.y, 0);
    return new Vec3(0, 0, 0);
  }

  /** 本地世界坐标 → 最近格子；距离超过 maxDist 视为棋盘外返回 null */
  worldToCell(wx: number, wy: number, maxDist = this.hexSize * 1.2): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (const [key, c] of this.cellWorlds) {
      const dx = c.x - wx, dy = c.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: Number(key.split(',')[0]), y: Number(key.split(',')[1]) }; }
    }
    if (!best) return null;
    const bc = this.cellWorlds.get(`${best.x},${best.y}`)!;
    const dist = Math.sqrt((bc.x - wx) ** 2 + (bc.y - wy) ** 2);
    if (dist > maxDist) return null;
    return best;
  }

  isOwnCell(y: number): boolean {
    return y < this.boardHeight / 2;
  }
}
