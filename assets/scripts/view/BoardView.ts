import { _decorator, Component, Node, Graphics, Vec3, Color, UITransform } from 'cc';
import { Grid } from '../battle/Grid';
import { BoardGeometry, BoardPoint } from './BoardGeometry';
import { setUISkin } from '../ui/UISkin';

const { ccclass, property } = _decorator;

/** Seven columns, four rows per side; shallow perspective is entirely visual. */
@ccclass('BoardView')
export class BoardView extends Component {
  @property hexSize = 48;
  @property boardWidth = 7;
  @property boardHeight = 8;
  grid: Grid;
  private g: Graphics;
  private geometry: BoardGeometry;
  private highlight: Graphics;
  private artReady = false;
  boardPixelW = 0;
  boardPixelH = 0;

  start() {
    if (!this.geometry) this.initialize(this.boardWidth, this.boardHeight, this.hexSize);
  }

  initialize(width: number, height: number, hexSize: number): void {
    this.boardWidth = width; this.boardHeight = height; this.hexSize = hexSize;
    this.grid = new Grid(width, height);
    this.geometry = new BoardGeometry(width, height, hexSize);
    this.boardPixelW = this.geometry.width; this.boardPixelH = this.geometry.height;
    let art = this.node.getChildByName('arenaArt');
    if (!art) {
      art = new Node('arenaArt'); this.node.addChild(art);
      // Calibrate the image's play floor and joined front platform to the existing grid.
      art.addComponent(UITransform).setContentSize(1024, 862);
      art.setPosition(0, -80, 0);
      setUISkin(art, 'arena_board', undefined, () => { this.artReady = true; this.redraw(); });
    }
    let grid = this.node.getChildByName('boardGrid');
    if (!grid) { grid = new Node('boardGrid'); this.node.addChild(grid); }
    this.g = grid.getComponent(Graphics) ?? grid.addComponent(Graphics);
    let highlight = this.node.getChildByName('dragHighlight');
    if (!highlight) { highlight = new Node('dragHighlight'); this.node.addChild(highlight); }
    highlight.layer = this.node.layer;
    this.highlight = highlight.getComponent(Graphics) ?? highlight.addComponent(Graphics);
    const ut = this.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ut.setContentSize(this.boardPixelW + 80, this.boardPixelH + 80);
    this.redraw();
  }

  private polygon(points: BoardPoint[], fill: Color, stroke: Color, thickness = 1): void {
    const g = this.g;
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.close(); g.fillColor = fill; g.fill();
    g.lineWidth = thickness; g.strokeColor = stroke; g.stroke();
  }

  redraw(): void {
    const g = this.g; g.clear();
    const w = this.boardPixelW / 2 + 24, h = this.boardPixelH / 2 + 18;
    const outline = [{ x: -w, y: -h }, { x: w, y: -h }, { x: w - 25, y: h }, { x: -w + 25, y: h }];
    if (!this.artReady) {
      this.polygon(outline.map(p => ({ x: p.x, y: p.y - 14 })), new Color(9, 18, 24), new Color(22, 38, 43), 5);
      this.polygon(outline, new Color(27, 48, 51), new Color(146, 122, 71), 3);
      this.polygon(outline.map(p => ({ x: p.x * 0.98, y: p.y * 0.96 })), new Color(34, 59, 59), new Color(76, 105, 99), 1);
    }

    for (const cell of this.geometry.cells) {
      const own = this.isOwnCell(cell.y), alternate = (cell.x + cell.y) % 2;
      const points = cell.polygon.map(p => ({
        x: cell.center.x + (p.x - cell.center.x) * 0.95,
        y: cell.center.y + (p.y - cell.center.y) * 0.95,
      }));
      this.polygon(points,
        this.artReady ? (own ? new Color(31, 112, 103, 26) : new Color(36, 48, 59, 16))
          : own ? new Color(49 + alternate * 4, 80 + alternate * 4, 76 + alternate * 4) : new Color(43 + alternate * 4, 63 + alternate * 4, 65 + alternate * 4),
        this.artReady ? new Color(80, 73, 47, own ? 100 : 65)
          : own ? new Color(100, 145, 132, 155) : new Color(99, 116, 113, 100));
      const { x, y } = cell.center;
      this.polygon([{ x, y: y + 2 }, { x: x + 3, y }, { x, y: y - 2 }, { x: x - 3, y }],
        new Color(119, 148, 125, own ? 90 : 35), new Color(0, 0, 0, 0), 0);
    }
    g.strokeColor = new Color(189, 160, 94, 100); g.lineWidth = 1;
    g.moveTo(-w + 14, 0); g.lineTo(w - 14, 0); g.stroke();
    if (!this.artReady) for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const x = side * (w - (end > 0 ? 26 : 6)), y = end * h;
      this.polygon([{ x, y: y + 11 }, { x: x + 11, y }, { x, y: y - 11 }, { x: x - 11, y }],
        new Color(33, 54, 57), new Color(206, 174, 105), 2);
    }
  }

  cellToWorld(x: number, y: number): Vec3 {
    const cell = this.geometry.cells.find(c => c.x === x && c.y === y);
    return new Vec3(cell?.center.x ?? 0, cell?.center.y ?? 0, 0);
  }

  /** Overlay uses the exact same projected polygon as rendering and hit testing. */
  highlightTarget(target: { x: number; y: number } | null, allowed = true): void {
    if (!this.highlight) return;
    const g = this.highlight; g.clear();
    if (!target) return;
    const cell = this.geometry.cells.find(c => c.x === target.x && c.y === target.y);
    if (!cell) return;
    const points = cell.polygon;
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.close(); g.fillColor = allowed ? new Color(89, 203, 176, 110) : new Color(229, 100, 90, 110); g.fill();
    g.lineWidth = 3; g.strokeColor = allowed ? new Color(139, 255, 220) : new Color(255, 130, 115); g.stroke();
  }

  worldToCell(x: number, y: number): { x: number; y: number } | null {
    const cell = this.geometry.cellAt(x, y);
    return cell ? { x: cell.x, y: cell.y } : null;
  }

  isOwnCell(y: number): boolean { return y >= 0 && y < this.boardHeight / 2; }
}
