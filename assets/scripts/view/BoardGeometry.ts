import { SQRT3 } from '../battle/HexMath';

export interface BoardPoint { x: number; y: number }
export interface BoardCell { x: number; y: number; center: BoardPoint; polygon: BoardPoint[] }

/** Presentation projection only: combat keeps the original odd-r hex coordinates. */
export class BoardGeometry {
  readonly cells: BoardCell[] = [];
  readonly width: number;
  readonly height: number;

  constructor(readonly columns: number, readonly rows: number, readonly size: number) {
    const centerX = size * SQRT3 * (columns - 0.5) / 2;
    const centerY = size * 1.5 * (rows - 1) / 2;
    const rawHeight = size * (1.5 * (rows - 1) + 2);
    const project = (x: number, y: number): BoardPoint => ({
      x: (x - centerX) * (1 - 0.12 * (y - centerY) / rawHeight),
      y: (y - centerY) * 0.6,
    });
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
      const cx = size * SQRT3 * (x + 0.5 * (y & 1)), cy = size * 1.5 * y;
      const polygon = Array.from({ length: 6 }, (_, i) => {
        const angle = Math.PI / 6 + i * Math.PI / 3;
        const p = project(cx + size * Math.cos(angle), cy + size * Math.sin(angle));
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
        return p;
      });
      this.cells.push({ x, y, center: project(cx, cy), polygon });
    }
    this.width = maxX - minX;
    this.height = maxY - minY;
  }

  cellAt(x: number, y: number): BoardCell | null {
    for (const cell of this.cells) {
      let positive = false, negative = false;
      for (let i = 0; i < 6; i++) {
        const a = cell.polygon[i], b = cell.polygon[(i + 1) % 6];
        const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (cross > 0.001) positive = true;
        if (cross < -0.001) negative = true;
      }
      if (!(positive && negative)) return cell;
    }
    return null;
  }

  /** Same projection as cell centers, including endpoints between or beyond cells. */
  projectLogical(p: BoardPoint): BoardPoint {
    const cx=this.size*SQRT3*(this.columns-.5)/2,cy=this.size*1.5*(this.rows-1)/2;
    const height=this.size*(1.5*(this.rows-1)+2);
    return {x:(p.x*this.size-cx)*(1-.12*(p.y*this.size-cy)/height),y:(p.y*this.size-cy)*.6};
  }
}
