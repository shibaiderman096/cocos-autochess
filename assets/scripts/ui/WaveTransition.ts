import { BlockInputEvents, Color, Graphics, Label, Node, Tween, tween, UIOpacity, UITransform, Vec3 } from 'cc';
import type { WaveConfig } from '../core/RoundFlow';

/** Visual-only curtain: the caller changes rounds once, at full coverage. */
export class WaveTransition {
  private root: Node;
  private content: Node;
  private opacity: UIOpacity;
  private round: Label;
  private encounter: Label;

  constructor(parent: Node) {
    this.root = new Node('waveTransition');
    parent.addChild(this.root);
    this.root.addComponent(UITransform).setContentSize(1280, 720);
    this.root.addComponent(BlockInputEvents);
    this.opacity = this.root.addComponent(UIOpacity);
    const curtain = this.root.addComponent(Graphics);
    curtain.fillColor = new Color(7, 16, 24, 250);
    curtain.rect(-640, -360, 1280, 720); curtain.fill();

    this.content = new Node('destination'); this.root.addChild(this.content);
    const frame = this.content.addComponent(Graphics);
    frame.fillColor = new Color(15, 35, 45, 245);
    frame.moveTo(-310, -92); frame.lineTo(278, -92); frame.lineTo(310, 0);
    frame.lineTo(278, 92); frame.lineTo(-310, 92); frame.lineTo(-278, 0);
    frame.close(); frame.fill();
    frame.strokeColor = new Color(204, 174, 109, 180); frame.lineWidth = 2;
    frame.moveTo(-236, 92); frame.lineTo(236, 92);
    frame.moveTo(-236, -92); frame.lineTo(236, -92); frame.stroke();
    this.text('下一关', 115, 17, new Color(204, 174, 109));
    this.round = this.text('', 25, 48, new Color(234, 229, 207));
    this.encounter = this.text('', -42, 21, new Color(113, 207, 203));
    this.root.active = false;
  }

  private text(value: string, y: number, size: number, color: Color): Label {
    const node = new Node('text'); this.content.addChild(node); node.setPosition(0, y, 0);
    node.addComponent(UITransform).setContentSize(490, size + 16);
    const label = node.addComponent(Label);
    label.string = value; label.fontSize = size; label.lineHeight = size + 6;
    label.color = color; label.isBold = true;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
  }

  play(onCovered: () => WaveConfig, onComplete: () => void): void {
    this.stop();
    this.round.string = ''; this.encounter.string = '';
    this.opacity.opacity = 0; this.content.setPosition(-40, 0, 0);
    this.content.setScale(0.96, 0.96, 1);
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    this.root.active = true;
    tween(this.opacity)
      .delay(1.3)
      .to(0.22, { opacity: 255 })
      .call(() => {
        const wave = onCovered();
        this.round.string = wave.stage ? `${wave.stage} - ${wave.round}` : String(wave.id);
        this.encounter.string = wave.name;
        tween(this.content).to(0.3, { position: new Vec3(0, 0, 0), scale: new Vec3(1, 1, 1) }, { easing: 'sineOut' }).start();
      })
      .delay(0.42)
      .to(0.28, { opacity: 0 })
      .call(() => { this.root.active = false; onComplete(); })
      .start();
  }

  stop(): void {
    Tween.stopAllByTarget(this.opacity); Tween.stopAllByTarget(this.content);
    this.root.active = false;
  }
}
