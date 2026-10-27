import { BlockInputEvents, Color, Graphics, Label, Node, UIOpacity, UITransform, view } from 'cc';
import type { WaveConfig } from '../core/RoundFlow';

/** Visual-only curtain: the caller changes rounds once, at full coverage. */
export class WaveTransition {
  private root: Node;
  private content: Node;
  private opacity: UIOpacity;
  private round: Label;
  private encounter: Label;
  private curtain: Graphics;
  private phase: 'idle' | 'wait' | 'cover' | 'hold' | 'reveal' = 'idle';
  private elapsed = 0;
  private onCovered: (() => WaveConfig) | null = null;
  private onComplete: (() => void) | null = null;

  constructor(parent: Node) {
    this.root = new Node('waveTransition');
    parent.addChild(this.root);
    this.root.addComponent(UITransform);
    this.root.addComponent(BlockInputEvents);
    this.opacity = this.root.addComponent(UIOpacity);
    this.curtain = this.root.addComponent(Graphics);

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
    const width=Math.max(1280,view.getVisibleSize?.().width??1280);
    this.root.getComponent(UITransform)!.setContentSize(width,720);
    this.curtain.clear();this.curtain.fillColor=new Color(7,16,24,255);
    this.curtain.rect(-width/2,-360,width,720);this.curtain.fill();
    this.round.string = ''; this.encounter.string = '';
    this.opacity.opacity = 0; this.content.setPosition(-40, 0, 0);
    this.content.setScale(0.96, 0.96, 1);
    this.root.setSiblingIndex(this.root.parent!.children.length - 1);
    this.root.active = true;
    this.onCovered=onCovered;this.onComplete=onComplete;this.phase='wait';this.elapsed=0;
  }
  /** Bound visual time per frame so a slow mobile board rebuild cannot skip the destination card. */
  update(dt: number): void {
    if(this.phase==='idle')return;
    this.elapsed+=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
    if(this.phase==='wait'){
      if(this.elapsed>=1.3){this.phase='cover';this.elapsed=0;}
    }else if(this.phase==='cover'){
      const p=Math.min(1,this.elapsed/.24);this.opacity.opacity=Math.round(255*p);
      if(p===1){
        this.phase='hold';this.elapsed=0;
        const covered=this.onCovered;this.onCovered=null;
        const wave=covered?.();
        if(wave){this.round.string=wave.stage?`${wave.stage} - ${wave.round}`:String(wave.id);this.encounter.string=wave.name;}
      }
    }else if(this.phase==='hold'){
      const p=Math.min(1,this.elapsed/.3),ease=1-(1-p)**3;
      this.content.setPosition(-40*(1-ease),0,0);this.content.setScale(.96+.04*ease,.96+.04*ease,1);
      if(this.elapsed>=.8){this.phase='reveal';this.elapsed=0;}
    }else{
      const p=Math.min(1,this.elapsed/.3);this.opacity.opacity=Math.round(255*(1-p));
      if(p===1){const done=this.onComplete;this.stop();done?.();}
    }
  }
  stop(): void {
    this.phase='idle';this.elapsed=0;this.onCovered=null;this.onComplete=null;
    this.root.active = false;
  }
}
