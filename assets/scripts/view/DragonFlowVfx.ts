import {Node,UITransform,Sprite,SpriteFrame,Texture2D,UIOpacity,Rect,Size,Vec3,resources} from 'cc';
import type {BattleEvent,Pos} from '../battle/types';
type Effect={id:number;start:number;end:number;row:number;from?:Pos;to?:Pos};
/** Painted frames follow replay ticks; visual callbacks never settle combat. */
export class DragonFlowVfx {
  private root:Node;private frames:SpriteFrame[]=[];private effects:Effect[]=[];
  private slots:{node:Node;sprite:Sprite;opacity:UIOpacity}[]=[];private disposed=false;
  constructor(parent:Node,private cell:number,private tickMs:number,private owner:(id:number)=>Node|undefined,
    private point:(p:Pos)=>Vec3,private lineEnd:(from:Pos,to:Pos,length:number)=>Vec3){
    this.root=new Node('dragonFlowVfx');parent.addChild(this.root);this.root.layer=parent.layer;
    resources.load('art/fx/cloud_dragon_flow/texture',Texture2D,(error,texture)=>{
      if(error||this.disposed)return;
      for(let i=0;i<8;i++){const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i%4*texture.width/4,Math.floor(i/4)*texture.height/2,texture.width/4,texture.height/2);f.originalSize=new Size(texture.width/4,texture.height/2);this.frames.push(f);}
    });
  }
  play(e:BattleEvent):void {
    if(e.t==='cast'&&e.skillId==='cloud_dragon_flow')this.effects.push({id:e.id,start:e.tick,end:e.tick+(e.duration??.6)*1000/this.tickMs,row:0});
    if(e.t==='dragon_form'&&e.active)this.effects.push({id:e.id,start:e.tick,end:e.tick+600/this.tickMs,row:0});
    if(e.t==='dragon_breath')this.effects.push({id:e.id,start:e.tick,end:e.tick+e.durationTicks,row:1,from:e.from,to:e.to});
    if(e.t==='death')this.effects=this.effects.filter(f=>f.id!==e.id);
    if(e.t==='end'){this.effects=[];this.slots.forEach(s=>s.node.active=false);}
  }
  update(tick:number):void {
    this.effects=this.effects.filter(f=>tick<f.end);this.slots.forEach(s=>s.node.active=false);
    if(this.frames.length!==8)return;
    this.effects.forEach((f,i)=>{
      let slot=this.slots[i];if(!slot){const node=new Node('cloudDragonPaint');node.layer=this.root.layer;this.root.addChild(node);node.addComponent(UITransform);const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;slot={node,sprite,opacity:node.addComponent(UIOpacity)};this.slots.push(slot);}
      slot.node.active=true;const phase=Math.max(0,Math.min(.999,(tick-f.start)/(f.end-f.start)));slot.sprite.spriteFrame=this.frames[f.row*4+Math.floor(phase*4)];
      if(f.row===1){const a=this.owner(f.id)?.position??this.point(f.from!),b=this.lineEnd(f.from!,f.to!,3),dx=b.x-a.x,dy=b.y-a.y;
        const length=Math.hypot(dx,dy);slot.node.setPosition((a.x+b.x)/2,(a.y+b.y)/2+this.cell*.35,0);slot.node.angle=Math.atan2(dy,dx)*180/Math.PI;slot.node.getComponent(UITransform)!.setContentSize(length,this.cell*1.15);
      }else{const owner=this.owner(f.id);if(!owner){slot.node.active=false;return;}slot.node.setPosition(owner.position.x,owner.position.y+this.cell*.5,0);slot.node.angle=phase*45;slot.node.getComponent(UITransform)!.setContentSize(this.cell*1.7,this.cell*1.7);}
      slot.opacity.opacity=Math.round(255*Math.min(1,(1-phase)*4));
    });
  }
  destroy():void{this.disposed=true;this.effects=[];this.root.destroy();this.frames.forEach(f=>f.destroy());this.frames=[];}
}
