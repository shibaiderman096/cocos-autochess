import { _decorator, Component, Graphics, Node, Vec3, Color, UITransform } from 'cc';
import { Grid } from '../battle/Grid';
import { SQRT3 } from '../battle/HexMath';

const { ccclass, property } = _decorator;

/**
 * 六边形棋盘渲染（平顶六边形，odd-q offset）。
 * - 所有格子世界坐标按实际包围盒居中（画布中心 = 棋盘中心）。
 * - cellToWorld 用预计算表；worldToCell 用像素最近邻（与视觉绝对一致）。
 * - 自动把本节点 UITransform 的 contentSize 设为棋盘包围盒，供触摸命中。
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
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.buildHexGrid();
  }

  /** odd-q 平顶六边形原始坐标（未居中） */
  private rawCellPos(x: number, y: number): { x: number; y: number } {
    return {
      x: this.hexSize * 1.5 * x,
      y: this.hexSize * SQRT3 * (y + x / 2),
    };
  }

  private buildHexGrid() {
    this.cellWorlds.clear();

    // 计算包围盒
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const p = this.rawCellPos(x, y);
        minX = Math.min(minX, p.x - this.hexSize);
        maxX = Math.max(maxX, p.x + this.hexSize);
        minY = Math.min(minY, p.y - this.hexSize);
        maxY = Math.max(maxY, p.y + this.hexSize);
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    // 居中后的格子坐标表
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const p = this.rawCellPos(x, y);
        this.cellWorlds.set(`${x},${y}`, { x: p.x - cx, y: p.y - cy });
      }
    }
    this.boardPixelW = maxX - minX;
    this.boardPixelH = maxY - minY;

    // 本节点 UITransform 覆盖棋盘包围盒，触摸事件才能命中
    const ut = this.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ut.setContentSize(this.boardPixelW, this.boardPixelH);

    this.redraw();
  }

  /** 画一个平顶六边形路径 */
  private hexPath(g: Graphics, cx: number, cy: number, size: number) {
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i;
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
        this.hexPath(g, w.x, w.y, this.hexSize * 0.92);
        g.fill();
        g.strokeColor = new Color(40, 30, 20, 120);
        g.lineWidth = 1.5;
        this.hexPath(g, w.x, w.y, this.hexSize * 0.92);
        g.stroke();
      }
    }

    // 己方/敌方分界线（沿 y = ownRows-0.5 行的横向中线）
    const left = this.cellWorlds.get(`0,${ownRows - 1}`)!;
    const right = this.cellWorlds.get(`${this.boardWidth - 1},${ownRows}`)!;
    const midLineY = (left.y + right.y) / 2 + this.hexSize * 0.3;
    const lx = this.cellWorlds.get('0,0')!.x - this.hexSize;
    const rx = this.cellWorlds.get(`${this.boardWidth - 1},0`)!.x + this.hexSize;
    g.strokeColor = new Color(255, 220, 120, 160);
    g.lineWidth = 2;
    g.moveTo(lx, midLineY);
    g.lineTo(rx, midLineY);
    g.stroke();
  }

  /** 格子坐标 → 本地世界坐标（预计算表，与绘制完全一致） */
  cellToWorld(x: number, y: number): Vec3 {
    const cached = this.cellWorlds.get(`${x},${y}`);
    if (cached) return new Vec3(cached.x, cached.y, 0);
    return new Vec3(0, 0, 0);
  }

  /**
   * 本地世界坐标 → 最近格子；距离超过 maxDist（默认 1.2 倍 hexSize）视为棋盘外返回 null。
   * 像素最近邻保证与视觉完全一致。
   */
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
