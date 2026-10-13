import { Color, Graphics } from 'cc';

export const STAR_RING_COLORS = [
  new Color(245, 247, 244),
  new Color(166, 181, 198),
  new Color(242, 196, 80),
];

/** Draw the same star base for field units, bench units, and shop portraits. */
export function drawStarRing(g: Graphics, size: number, star: number): void {
  const rank = Math.max(1, Math.min(3, star));
  const y = -size * 0.42, rx = size * 0.38, ry = size * 0.105;
  g.clear();
  g.fillColor = new Color(17, 31, 35);
  g.ellipse(0, y, rx, ry); g.fill();
  g.strokeColor = STAR_RING_COLORS[rank - 1]; g.lineWidth = rank === 1 ? 1.5 : 2.5;
  g.ellipse(0, y, rx, ry); g.stroke();
  if (rank > 1) {
    g.strokeColor = rank === 3 ? new Color(255, 233, 160) : new Color(233, 239, 245);
    g.lineWidth = 0.8; g.ellipse(0, y, rx - 3, Math.max(1, ry - 2)); g.stroke();
  }
}
