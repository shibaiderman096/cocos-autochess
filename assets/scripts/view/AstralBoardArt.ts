import { Node, UIOpacity } from 'cc';
import type { AstralField } from '../battle/types';
import { BoardGeometry } from './BoardGeometry';
import { projectBoardPoint } from './BoardPresentation';
import { FX_SPRITE } from './ArtPaths';
import { astralSprite } from './AstralArt';

/** Painted home tiles stay below units and targeting; only replay time drives their light. */
export class AstralBoardArt {
  private generation = 0;
  private tiles: Array<{ node: Node; phase: number }> = [];
  private rings: Node[] = [];
  private stopped = false;
  constructor(private root: Node) {}

  show(fields: readonly AstralField[], geometry: BoardGeometry): void {
    this.clear(); this.stopped = false;
    const generation = this.generation, alive = () => generation === this.generation && this.root.isValid;
    for (const field of fields) {
      const polygons = field.cells.map(pos => geometry.cells.find(c => c.x === pos.x && c.y === pos.y))
        .filter((cell): cell is typeof geometry.cells[number] => !!cell);
      if (field.effect.meteor && polygons.length) {
        const points = polygons.flatMap(c => c.polygon.map(projectBoardPoint));
        const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x));
        const bottom = Math.min(...points.map(p => p.y)), top = Math.max(...points.map(p => p.y));
        const plane = new Node('astralFieldPlane'); this.root.addChild(plane); plane.layer = this.root.layer;
        plane.setPosition((left + right) / 2, (bottom + top) / 2);
        plane.setScale(1, (top - bottom) / (right - left), 1);
        const ring = astralSprite(plane, 'astralFieldRing', FX_SPRITE.astralRing, right - left, right - left, alive).node;
        ring.getComponent(UIOpacity)!.opacity = 115; this.rings.push(ring);
      }
      for (const cell of polygons) {
        const center = projectBoardPoint(cell.center), points = cell.polygon.map(projectBoardPoint);
        const width = (Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x))) * .92;
        const height = (Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y))) * .92;
        const node = astralSprite(this.root, 'astralTile', FX_SPRITE.astralTile, width, height, alive).node;
        node.setPosition(center.x, center.y); node.getComponent(UIOpacity)!.opacity = 180;
        this.tiles.push({ node, phase: cell.x * .71 + cell.y * .43 });
      }
    }
  }
  update(tick: number, tickMs: number): void {
    if (this.stopped) return;
    const seconds = tick * tickMs / 1000;
    for (const { node, phase } of this.tiles) node.getComponent(UIOpacity)!.opacity = Math.round(180 + 20 * Math.sin(seconds * 1.5 + phase));
    for (const ring of this.rings) {
      ring.angle = -seconds * 5;
      ring.getComponent(UIOpacity)!.opacity = Math.round(100 + 30 * Math.sin(seconds * Math.PI * 2 / 5));
    }
  }
  stop(): void { this.stopped = true; for (const ring of this.rings) ring.active = false; }
  clear(): void {
    this.generation++;
    for (const child of [...this.root.children]) { child.removeFromParent(); child.destroy(); }
    this.tiles.length = 0; this.rings.length = 0;
  }
}
