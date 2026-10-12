import { _decorator, Component, Graphics, Node, Vec3, Color, UITransform } from 'cc';
import { Grid } from '../battle/Grid';
import { offsetToWorld, worldToOffset, SQRT3 } from '../battle/HexMath';

const { ccclass, property } = _decorator;

/**
 * 六边形棋盘渲染（平顶六边形，odd-q offset）。
 * - Graphics 绘制蜂窝格子，己方区暖色、敌方区冷色。
 * - cellToWorld / worldToCell 使用 HexMath 统一坐标转换。
 */
@ccclass('BoardView')
export class BoardView extends Component {
  @property
  hexSize = 36; // 六边形外接圆半径（中心到顶点）

  @property
  boardWidth = 8;

  @property
  boardHeight = 6;

  grid: Grid;
  private g: Graphics;
  private tilesRoot: Node;

  /** 缓存所有格子的世界坐标，供 worldToCell 快速查找 */
  private cellWorlds: Map<string, { x: number; y: number }> = new Map();

  start() {
    this.grid = new Grid(this.boardWidth, this.boardHeight);
    this.tilesRoot = new Node('tiles');
    this.tilesRoot.addComponent(UITransform);
    this.node.addChild(this.tilesRoot);
    this.g = this.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    this.buildHexGrid();
  }

  private getOffset(): { ox: number; oy: number } {
    const totalW = this.hexSize * 1.5 * (this.boardWidth - 1);
    const totalH = this.hexSize * SQRT3 * (this.boardHeight - 0.5);
    return { ox: -totalW / 2, oy: totalH / 2 };
  }

  private buildHexGrid() {
    this.cellWorlds.clear();
    this.tilesRoot.destroyAllChildren();
    const { ox, oy } = this.getOffset();

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const w = offsetToWorld(x, y, this.hexSize, ox, oy);
        this.cellWorlds.set(`${x},${y}`, w);
      }
    }
    this.redraw();
  }

  /** 画一个平顶六边形路径 */
  private hexPath(g: Graphics, cx: number, cy: number, size: number) {
    // 平顶六边形 6 个顶点
    const pts: [number, number][] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i; // 0, 60, 120, 180, 240, 300
      pts.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
    }
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.close();
  }

  redraw() {
    const g = this.g;
    g.clear();
    const { ox, oy } = this.getOffset();
    const ownRows = this.boardHeight / 2;

    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const w = offsetToWorld(x, y, this.hexSize, ox, oy);
        const own = y < ownRows;
        const checker = (x + y) % 2 === 0;
        const base = own
          ? (checker ? new Color(168, 130, 90, 235) : new Color(150, 112, 72, 235))
          : (checker ? new Color(96, 120, 150, 235) : new Color(78, 102, 132, 235));
        g.fillColor = base;
        this.hexPath(g, w.x, w.y, this.hexSize * 0.92);
        g.fill();
        // 描边
        g.strokeColor = new Color(40, 30, 20, 120);
        g.lineWidth = 1.5;
        this.hexPath(g, w.x, w.y, this.hexSize * 0.92);
        g.stroke();
      }
    }

    // 中线
    const midY = offsetToWorld(0, ownRows, this.hexSize, ox, oy).y;
    const midY2 = offsetToWorld(this.boardWidth - 1, ownRows - 1, this.hexSize, ox, oy).y;
    const midLineY = (midY + midY2) / 2;
    g.strokeColor = new Color(255, 220, 120, 160);
    g.lineWidth = 2;
    const leftX = offsetToWorld(0, 0, this.hexSize, ox, oy).x - this.hexSize;
    const rightX = offsetToWorld(this.boardWidth - 1, 0, this.hexSize, ox, oy).x + this.hexSize;
    g.moveTo(leftX, midLineY);
    g.lineTo(rightX, midLineY);
    g.stroke();
  }

  /** 格子坐标 → 本地世界坐标 */
  cellToWorld(x: number, y: number): Vec3 {
    const cached = this.cellWorlds.get(`${x},${y}`);
    if (cached) return new Vec3(cached.x, cached.y, 0);
    const { ox, oy } = this.getOffset();
    const w = offsetToWorld(x, y, this.hexSize, ox, oy);
    return new Vec3(w.x, w.y, 0);
  }

  /** 本地世界坐标 → 最近格子坐标；出界返回 null */
  worldToCell(wx: number, wy: number): { x: number; y: number } | null {
    const { ox, oy } = this.getOffset();
    const off = worldToOffset(wx, wy, this.hexSize, ox, oy);
    if (this.grid.inBounds(off.col, off.row)) return { x: off.col, y: off.row };
    // 找最近的有效格
    let best: { x: number; y: number } | null = null;
    let bd = Infinity;
    for (let y = 0; y < this.boardHeight; y++) {
      for (let x = 0; x < this.boardWidth; x++) {
        const c = this.cellWorlds.get(`${x},${y}`)!;
        const dx = c.x - wx, dy = c.y - wy;
        const d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    return best;
  }

  /** 己方半场判定 */
  isOwnCell(y: number): boolean {
    return this.grid.isOwnHalf(y);
  }
}
