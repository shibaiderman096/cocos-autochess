import {Node, UITransform, Color, Label, isValid} from 'cc';
import {button, label, panel} from './UIPrimitives';
import {QUALITY_COLORS} from '../core/EquipmentQuality';
import {SHOP_REWARD_AREA} from './BattleUILayout';

/** Inspection does not roll rewards; only the explicit button starts opening the chest. */
export class ExplorerChestPanel {
  private root: Node | null = null;
  private idle = 0;
  private hidden:Node[]=[];
  get visible(): boolean { return !!this.root?.active; }

  constructor(private parent: Node,private onHide:()=>void=()=>{}) {}

  show(points: number, rates: readonly number[], openable: boolean, open: () => void): void {
    this.hide(); this.idle = 0;
    const root = this.root = new Node('explorerChestInspector');
    this.parent.addChild(root);
    const a=SHOP_REWARD_AREA;
    root.setPosition(a.x,a.y,0);root.addComponent(UITransform).setContentSize(a.width,a.height);
    this.hideOtherContent();
    const body=panel(root,'explorerChestInspectorBody',0,0,a.width,a.height,new Color(13,27,35,255),new Color(204,174,109),'panel_dock');
    for(const type of [Node.EventType.TOUCH_START,Node.EventType.TOUCH_MOVE,Node.EventType.TOUCH_END])
      body.on(type,(e:any)=>{e.propagationStopped=true;this.idle=0;});
    label(body,'探险宝箱',-265,49,23,new Color(233,231,210),210).isBold=true;
    label(body,String(points),-265,-9,32,new Color(255,224,146),210).node.name='explorerInspectorLayers';
    rates.forEach((rate,i)=>{
      const cell=label(body,`${Math.round(rate)}%`,-70+i*85,22,21,new Color(...QUALITY_COLORS[i]),82);
      cell.node.name=`explorerOdds${i+1}`;cell.enableWrapText=false;cell.overflow=Label.Overflow.SHRINK;
    });
    button(body,openable?'打开':points>0?'暂不可打开':'尚未积累探险值',100,-47,260,46,()=>{
      this.idle=0;
      if(!openable||this.root!==root)return;
      this.hide();open();
    },openable).name='openExplorerChest';
    button(body,'×',365,62,36,36,()=>this.hide()).name='closeExplorerChest';
  }

  private hideOtherContent():void {
    for(const node of this.parent.children)if(node!==this.root&&node.active){
      if(!this.hidden.includes(node))this.hidden.push(node);node.active=false;
    }
  }

  update(dt:number):void {
    if(!this.visible)return;
    this.hideOtherContent();
    this.idle+=Math.max(0,dt);if(this.idle>=4)this.hide();
  }

  hide(notify=true):void {
    const wasVisible=!!this.root;
    if(this.root){this.root.active=false;this.root.destroy();this.root=null;}
    for(const node of this.hidden)if(isValid(node,true))node.active=true;
    this.hidden=[];
    this.idle=0;
    if(wasVisible&&notify)this.onHide();
  }
}
