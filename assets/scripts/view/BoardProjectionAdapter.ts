import { BoardGeometry, BoardPoint } from './BoardGeometry';

export interface BoardGroundPoint { x: number; y: number; z: number }

/** Visual-only inverse projection. BoardGeometry remains the authority for input. */
export class BoardProjectionAdapter {
  static readonly pixelsPerMeter = 100;
  static readonly pitchSin = 0.6;
  static readonly pitchCos = 0.8;
  static readonly textureWidth = 1024;
  static readonly textureHeight = 768;
  readonly geometry: BoardGeometry;

  constructor(columns = 7, rows = 8, size = 48) {
    this.geometry = new BoardGeometry(columns, rows, size);
  }

  toGround(p: BoardPoint): BoardGroundPoint {
    return { x: p.x / BoardProjectionAdapter.pixelsPerMeter, y: 0,
      z: -p.y / (BoardProjectionAdapter.pixelsPerMeter * BoardProjectionAdapter.pitchSin) };
  }

  toBoard(p: BoardGroundPoint): BoardPoint {
    return { x: p.x * BoardProjectionAdapter.pixelsPerMeter,
      y: (p.y * BoardProjectionAdapter.pitchCos - p.z * BoardProjectionAdapter.pitchSin)
        * BoardProjectionAdapter.pixelsPerMeter };
  }

  tileName(x: number, y: number): string {
    return `SM_Hex_R${String(y).padStart(2, '0')}_C${String(x).padStart(2, '0')}`;
  }

  manifest() {
    return { schema: 1, columns: this.geometry.columns, rows: this.geometry.rows, size: this.geometry.size,
      pixelsPerMeter: BoardProjectionAdapter.pixelsPerMeter, pitchSin: BoardProjectionAdapter.pitchSin,
      pitchCos: BoardProjectionAdapter.pitchCos,
      cells: this.geometry.cells.map(cell => ({ name: this.tileName(cell.x, cell.y), x: cell.x, y: cell.y,
        center: cell.center, polygon: cell.polygon, groundCenter: this.toGround(cell.center),
        groundPolygon: cell.polygon.map(p => this.toGround(p)) })) };
  }
}
