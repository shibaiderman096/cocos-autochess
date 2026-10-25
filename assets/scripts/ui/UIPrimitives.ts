import { Node, UITransform, Label, Graphics, Color } from 'cc';
import { GameAudio } from '../view/GameAudio';
import { setUISkin } from './UISkin';
import type { UISkinKey } from '../view/ArtPaths';

const INK = new Color(13, 27, 35), GOLD = new Color(204, 174, 109);
const TEXT = new Color(233, 231, 210), MUTED = new Color(133, 161, 164);

export function label(parent: Node, text: string, x: number, y: number, size = 18, color = TEXT, width = 240): Label {
  const n = new Node('text'); n.addComponent(UITransform).setContentSize(width, size * 2 + 8);
  const l = n.addComponent(Label); l.string = text; l.fontSize = size; l.lineHeight = size + 5; l.color = color;
  parent.addChild(n); n.setPosition(x, y, 0); return l;
}
function polygon(g: Graphics, points: number[][], fill: Color, stroke?: Color): void {
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.close(); g.fillColor = fill; g.fill();
  if (stroke) { g.strokeColor = stroke; g.lineWidth = 1; g.stroke(); }
}
export function paintPanel(g: Graphics, w: number, h: number, fill = INK, edge = GOLD): void {
  g.clear(); const x = w / 2, y = h / 2, cut = 7;
  polygon(g, [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]], fill, edge);
  g.strokeColor = new Color(edge.r, edge.g, edge.b, 60);
  g.rect(-x + 4, -y + 4, w - 8, h - 8); g.stroke();
}
export function panel(parent: Node, name: string, x: number, y: number, w: number, h: number, fill = INK, edge = GOLD, skin: UISkinKey | null = 'panel_ink'): Node {
  const n = new Node(name); n.addComponent(UITransform).setContentSize(w, h);
  const g = n.addComponent(Graphics); paintPanel(g, w, h, fill, edge);
  if (skin) setUISkin(n, skin, g);
  parent.addChild(n); n.setPosition(x, y, 0); return n;
}
export function button(parent: Node, text: string, x: number, y: number, w: number, h: number, action: () => void, primary = false): Node {
  const n = panel(parent, 'button', x, y, w, h, primary ? new Color(44, 77, 76) : new Color(24, 44, 51), primary ? GOLD : new Color(90, 123, 123), primary ? 'btn_primary' : 'btn_secondary');
  label(n, text, 0, 0, primary ? 22 : 17, primary ? TEXT : MUTED, w - 10);
  n.on(Node.EventType.TOUCH_END, () => { GameAudio.play('click'); action(); }); return n;
}

