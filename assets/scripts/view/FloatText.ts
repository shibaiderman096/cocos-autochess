import { _decorator, Component, Node, Label, UITransform, UIOpacity, tween, Vec3, Color } from 'cc';

const { ccclass } = _decorator;

/** 伤害类型 → 飘字颜色 */
const DMG_COLOR: Record<string, Color> = {
  physical: new Color(255, 255, 255, 255),
  magic:    new Color(200, 130, 255, 255),
  true:     new Color(255, 215, 0, 255),
};

/**
 * 飘字（M1 第 9 项）。
 * - 受击数字向上飘 + 淡出
 * - 物理伤害白色、魔法伤害紫色、真实伤害金色
 * - 用对象池复用节点
 */
@ccclass('FloatText')
export class FloatText extends Component {
  private label: Label;
  private opacity: UIOpacity;

  onLoad() {
    this.label = this.getComponent(Label) ?? this.node.addComponent(Label);
    this.opacity = this.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    this.label.fontSize = 22;
    this.label.lineHeight = 26;
    this.label.color = Color.WHITE;
    this.node.addComponent(UITransform);
  }

  show(text: string, color: Color, startPos: Vec3, parent: Node): void {
    if (this.node.parent) this.node.removeFromParent();
    parent.addChild(this.node);
    this.node.setPosition(startPos.x, startPos.y + 20, 0);
    this.label.string = text;
    this.label.color = color;
    this.opacity.opacity = 255;

    tween(this.node)
      .by(0.6, { position: new Vec3(0, 50, 0) })
      .start();
    tween(this.opacity)
      .delay(0.2)
      .to(0.4, { opacity: 0 })
      .call(() => {
        if (this.node.parent) this.node.removeFromParent();
        FloatTextPool.return(this);
      })
      .start();
  }

  static colorForType(dmgType: string): Color {
    return DMG_COLOR[dmgType] ?? Color.WHITE;
  }
}

/** 对象池 */
export const FloatTextPool = {
  _pool: [] as FloatText[],

  get(): FloatText {
    let ft = this._pool.pop();
    if (!ft) {
      const n = new Node('floatText');
      ft = n.addComponent(FloatText);
    }
    return ft;
  },

  return(ft: FloatText): void {
    if (this._pool.length < 30) this._pool.push(ft);
  },
};
