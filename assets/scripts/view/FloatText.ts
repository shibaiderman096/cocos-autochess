import { _decorator, Component, Node, Label, UITransform, UIOpacity, Tween, tween, Vec3, Color } from 'cc';

const { ccclass } = _decorator;

/** 伤害类型 → 飘字颜色 */
const DMG_COLOR: Record<string, Color> = {
  physical: new Color(255, 151, 64, 255),
  magic:    new Color(80, 180, 255, 255),
  true:     new Color(255, 255, 255, 255),
};

export interface FloatTextStyle {
  critical?: boolean;
  /** 仅伤害数字按此值缩放；治疗、护盾与状态文字维持固定字号。 */
  damage?: number;
  /** 攻击来源指向受击者的横向方向；同列攻击交替向两侧散开。 */
  direction?: number;
}

/**
 * 飘字（M1 第 9 项）。
 * - 伤害数字弹出后沿受击方向斜向散开，随后回落淡出
 * - 伤害越高字号越大；暴击额外加粗、放大
 * - 物理伤害橙色、魔法伤害蓝色、真实伤害白色
 * - 用对象池复用节点
 */
@ccclass('FloatText')
export class FloatText extends Component {
  private static sequence = 0;
  private label: Label;
  private opacity: UIOpacity;

  onLoad() {
    this.label = this.getComponent(Label) ?? this.node.addComponent(Label);
    this.opacity = this.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
    this.label.fontSize = 22;
    this.label.lineHeight = 26;
    this.label.color = Color.WHITE;
    this.getComponent(UITransform) ?? this.node.addComponent(UITransform);
  }

  show(text: string, color: Color, startPos: Vec3, parent: Node, style: FloatTextStyle = {}): void {
    Tween.stopAllByTarget(this.node);
    Tween.stopAllByTarget(this.opacity);
    if (this.node.parent) this.node.removeFromParent();
    parent.addChild(this.node);
    const isDamage = style.damage !== undefined;
    const critical = !!style.critical;
    const lane = isDamage ? FloatText.sequence++ % 4 : 0;
    const direction = Math.sign(style.direction ?? 0) || (lane % 2 === 0 ? -1 : 1);
    const spread = direction * (30 + lane * 8 + (critical ? 12 : 0));
    this.node.setPosition(startPos.x + (isDamage ? direction * (8 + lane * 4) : 0),
      startPos.y + 24 + (isDamage ? lane * 5 : 0), 0);
    this.node.setScale(isDamage ? 0.65 : 1, isDamage ? 0.65 : 1, 1);
    this.label.string = text;
    this.label.color = color;
    this.label.fontSize = isDamage ? FloatText.fontSizeForDamage(style.damage!, critical) : 22;
    this.label.lineHeight = this.label.fontSize + 6;
    this.label.isBold = critical;
    this.opacity.opacity = 255;

    if (isDamage) {
      tween(this.node)
        .by(0.16, { position: new Vec3(spread * 0.35, critical ? 36 : 28, 0) }, { easing: 'quadOut' })
        .by(0.48, { position: new Vec3(spread * 0.65, -12, 0) }, { easing: 'quadIn' })
        .start();
      const peak = critical ? 1.2 : 1.08;
      tween(this.node)
        .to(0.1, { scale: new Vec3(peak, peak, 1) }, { easing: 'backOut' })
        .to(0.14, { scale: Vec3.ONE })
        .start();
    } else {
      tween(this.node).by(0.64, { position: new Vec3(0, 50, 0) }).start();
    }
    tween(this.opacity)
      .delay(0.3)
      .to(0.34, { opacity: 0 })
      .call(() => {
        if (this.node.parent) this.node.removeFromParent();
        FloatTextPool.return(this);
      })
      .start();
  }

  static fontSizeForDamage(damage: number, critical = false): number {
    // 对数缩放保留小伤害的可读性，也防止高星技能数字盖住战场。
    const amount = Number.isFinite(damage) ? Math.max(0, damage) : 0;
    const base = Math.min(40, 20 + 4 * Math.log2(1 + amount / 50));
    return Math.round(base + (critical ? 6 : 0));
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
    while (ft && !ft.isValid) ft = this._pool.pop();
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
