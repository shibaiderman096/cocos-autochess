import { Color, Graphics } from 'cc';

export const FACTION_RING_COLORS = [
  new Color(89, 203, 176),
  new Color(229, 121, 112),
];

/** Ground rings show faction only: teal allies and red enemies. */
export function drawFactionRing(g: Graphics, size: number, side: 0 | 1): void {
  const y = -size * 0.42, rx = size * 0.38, ry = size * 0.105;
  g.clear();
  g.fillColor = new Color(17, 31, 35);
  g.ellipse(0, y, rx, ry); g.fill();
  const color = FACTION_RING_COLORS[side];
  g.strokeColor = color; g.lineWidth = 2.5;
  g.ellipse(0, y, rx, ry); g.stroke();
  g.strokeColor = new Color(color.r, color.g, color.b, 140);
  g.lineWidth = 0.8; g.ellipse(0, y, rx - 3, Math.max(1, ry - 2)); g.stroke();
}
