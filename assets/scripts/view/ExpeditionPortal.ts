import { _decorator, Component, Node, Graphics, Color, UITransform, UIOpacity, Vec3 } from 'cc';
import { label } from '../ui/BattleUI';

const { ccclass } = _decorator;

/** A board-space touch target; progression remains owned by RunSession. */
@ccclass('ExpeditionPortal')
export class ExpeditionPortal extends Component {
  private glow: UIOpacity;
  private elapsed = 0;
  init(position: Vec3, enter: () => void): void {
    this.node.setPosition(position.x, position.y + 30, 0);
    this.node.addComponent(UITransform).setContentSize(200, 250);
    this.glow = this.node.addComponent(UIOpacity);
    const g = this.node.addComponent(Graphics);
    g.fillColor = new Color(11, 28, 48, 235); g.ellipse(0, 12, 42, 63); g.fill();
    for (let i = 0; i < 4; i++) {
      g.strokeColor = new Color(84 + i * 24, 190 + i * 12, 232, 200 - i * 35);
      g.lineWidth = i === 0 ? 4 : 2; g.ellipse(0, 12, 44 + i * 6, 65 + i * 6); g.stroke();
    }
    g.strokeColor = new Color(212, 183, 116); g.lineWidth = 3;
    g.moveTo(-14, 13); g.lineTo(14, 13); g.lineTo(5, 23); g.moveTo(14, 13); g.lineTo(5, 3); g.stroke();
    g.fillColor = new Color(10, 29, 43, 245); g.rect(-102, -120, 204, 58); g.fill();
    g.strokeColor = new Color(100, 172, 190); g.lineWidth = 1; g.rect(-102, -120, 204, 58); g.stroke();
    label(this.node, '传送门', 0, -81, 20, new Color(235, 222, 176), 170);
    label(this.node, '点击进入下一阶段', 0, -106, 14, new Color(152, 225, 231), 200);
    this.node.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; enter(); });
  }
  update(dt: number): void {
    this.elapsed += dt;
    if (this.glow) this.glow.opacity = 235 + Math.sin(this.elapsed * 2) * 20;
  }
}
