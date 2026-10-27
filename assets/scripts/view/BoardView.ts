import { _decorator, Component, Node, Graphics, Vec3, Color, UITransform } from 'cc';
import { Grid } from '../battle/Grid';
import { hexDist, offsetToWorld } from '../battle/HexMath';
import type { AstralField } from '../battle/types';
import { BoardGeometry, BoardPoint } from './BoardGeometry';
import { AstralBoardArt } from './AstralBoardArt';
import { projectBoardPoint, unprojectBoardPoint, projectGroundPoint, benchGroundPoint } from './BoardPresentation';

const { ccclass, property } = _decorator;

/** Seven columns, four rows per side; shallow perspective is entirely visual. */
@ccclass('BoardView')
export class BoardView extends Component {
  @property hexSize = 48;
  @property boardWidth = 7;
  @property boardHeight = 8;
  grid: Grid;
  private geometry: BoardGeometry;
  private highlight: Graphics;
  private astralArt: AstralBoardArt | null = null;
  benchSlots = 9;
  interactionActive = false;
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
    let highlight = this.node.getChildByName('dragHighlight');
    if (!highlight) { highlight = new Node('dragHighlight'); this.node.addChild(highlight); }
    highlight.layer = this.node.layer;
    this.highlight = highlight.getComponent(Graphics) ?? highlight.addComponent(Graphics);
    const ut = this.getComponent(UITransform) ?? this.node.addComponent(UITransform);
    ut.setContentSize(this.boardPixelW + 80, this.boardPixelH + 80);
    this.setVisualMode('3d');
  }

  /** Legacy callers cannot enable a retired 2D background. Units and effects remain active. */
  setVisualMode(_mode: '2d' | '3d'): void {
    for (const name of ['arenaArt', 'boardGrid']) {
      const background = this.node.getChildByName(name);
      if (background) background.active = false;
    }
  }

  benchPosition(slot: number): Vec3 {
    const p = projectGroundPoint(benchGroundPoint(slot, this.benchSlots, this.boardPixelH));
    return new Vec3(p.x,p.y,0);
  }

  cellToWorld(x: number, y: number): Vec3 {
    const cell = this.geometry.cells.find(c => c.x === x && c.y === y);
    const p = projectBoardPoint(cell?.center ?? {x:0,y:0});
    return new Vec3(p.x,p.y,0);
  }

  /** Continuous logical coordinates share the exact floor projection used by cell centers. */
  logicalPointToWorld(point: BoardPoint): Vec3 {
    const p=projectBoardPoint(this.geometry.projectLogical(point));
    return new Vec3(p.x,p.y,0);
  }

  lineEndToWorld(from: BoardPoint, toward: BoardPoint, length: number): Vec3 {
    const a=offsetToWorld(from.x,from.y,1,0,0),b=offsetToWorld(toward.x,toward.y,1,0,0);
    const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1,d=length*Math.sqrt(3);
    const p=projectBoardPoint(this.geometry.projectLogical({x:a.x+dx/n*d,y:a.y+dy/n*d}));
    return new Vec3(p.x,p.y,0);
  }

  /** Persistent home tiles use the same perspective and hex polygons as drag targeting. */
  showAstralFields(fields: readonly AstralField[]): void {
    let node = this.node.getChildByName('astralCells');
    if (!node) { node = new Node('astralCells'); this.node.addChild(node); node.setSiblingIndex(0); }
    node.layer = this.node.layer;
    this.astralArt ??= new AstralBoardArt(node);
    this.astralArt.show(fields, this.geometry);
  }

  animateAstralFields(tick: number, tickMs: number): void { this.astralArt?.update(tick, tickMs); }
  stopAstralAnimation(): void { this.astralArt?.stop(); }
  onDestroy(): void { this.astralArt?.clear(); this.astralArt = null; }

  /** Overlay uses the exact same projected polygon as rendering and hit testing. */
  highlightTarget(target: { x: number; y: number } | null, allowed = true, attackRange = 0): void {
    if (!this.highlight) return;
    const g = this.highlight; g.clear();
    if (!target) return;
    const cell = this.geometry.cells.find(c => c.x === target.x && c.y === target.y);
    if (!cell) return;
    // Match combat's odd-r hex distance, including cells across the center line.
    if (allowed && Number.isFinite(attackRange) && attackRange > 0) {
      for (const candidate of this.geometry.cells) {
        const distance = hexDist(target, candidate);
        if (distance === 0 || distance > attackRange) continue;
        const outline = candidate.polygon.map(projectBoardPoint);
        g.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i++) g.lineTo(outline[i].x, outline[i].y);
        g.close(); g.fillColor = new Color(205, 237, 255, 70); g.fill();
        g.lineWidth = 1; g.strokeColor = new Color(220, 245, 255, 125); g.stroke();
      }
    }
    const points = cell.polygon.map(projectBoardPoint);
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.close(); g.fillColor = allowed ? new Color(89, 203, 176, 110) : new Color(229, 100, 90, 110); g.fill();
    g.lineWidth = 3; g.strokeColor = allowed ? new Color(139, 255, 220) : new Color(255, 130, 115); g.stroke();
  }

  worldToCell(x: number, y: number): { x: number; y: number } | null {
    const p = unprojectBoardPoint({x,y});
    const cell = this.geometry.cellAt(p.x, p.y);
    return cell ? { x: cell.x, y: cell.y } : null;
  }

  isOwnCell(y: number): boolean { return y >= 0 && y < this.boardHeight / 2; }
}
