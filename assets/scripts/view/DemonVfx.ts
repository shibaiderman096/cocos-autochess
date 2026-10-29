import {Node,UITransform,Sprite,SpriteFrame,Texture2D,UIOpacity,Rect,Size,Vec3,resources} from 'cc';
import type {BattleEvent,Pos} from '../battle/types';
import {FX_SPRITE} from './ArtPaths';

interface Effect { key:string; id:number; row:number; start:number; end:number; size:number; point?:Pos; follow?:boolean; shield?:boolean }
interface Slot { node:Node; sprites:Sprite[]; blends:UIOpacity[]; opacity:UIOpacity; key?:string; used:boolean }

/** Painted portal, leap, impact and shield cels. All timings follow the battle clock. */
export class DemonVfx {
  private root:Node;
  private frames:SpriteFrame[]=[];
  private slots:Slot[]=[];
  private effects:Effect[]=[];
  private disposed=false;
  private ended=false;
  private lastTick=0;
  constructor(parent:Node,private cell:number,private tickMs:number,private owner:(id:number)=>Node|undefined,
    private cellPoint:(p:Pos)=>Vec3,private shielded:(id:number)=>boolean){
    this.root=new Node('demonPaintedVfx');parent.addChild(this.root);this.root.layer=parent.layer;
    this.root.addComponent(UITransform);this.root.active=false;
    resources.load(FX_SPRITE.demonAzaroth.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||this.ended||!this.root.isValid)return;
      const w=texture.width/4,h=texture.height/4;
      for(let i=0;i<16;i++){
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);
        f.originalSize=new Size(w,h);this.frames.push(f);
      }
      this.update(this.lastTick);
    });
  }
  private add(id:number,tick:number,row:number,seconds:number,size:number,point?:Pos,follow=false,shield=false):void {
    this.effects.push({key:`${row}:${id}:${tick}:${this.effects.length}`,id,row,start:tick,end:tick+seconds*1000/this.tickMs,size,point,follow,shield});
  }
  play(e:BattleEvent):void {
    if(this.disposed||this.ended)return;
    if(e.t==='demon_summon')this.add(e.id,e.tick,0,1.2,3,e.pos);
    if(e.t==='cast'&&e.skillId==='infernal_cataclysm')this.add(e.id,e.tick,0,e.duration??.6,2.4,undefined,true);
    if(e.t==='demon_leap')this.add(e.id,e.tick,1,e.durationTicks*this.tickMs/1000,2.6,undefined,true);
    if(e.t==='demon_impact')this.add(e.id,e.tick,2,1,(e.radius*2+1)*1.4,e.center);
    if(e.t==='shield'&&e.id===e.source&&this.shielded(e.id))this.add(e.id,e.tick,3,4,2.6,undefined,true,true);
    if(e.t==='demon_power')this.add(e.id,e.tick,3,.6,1.7,undefined,true);
    if(e.t==='death'){
      this.effects=this.effects.filter(effect=>effect.id!==e.id||!effect.follow);this.update(this.lastTick);
    }
    if(e.t==='end'){this.ended=true;this.clear();}
  }
  private paint(effect:Effect,p:Vec3,phase:number,alpha:number):void {
    let slot=this.slots.find(s=>s.key===effect.key)??this.slots.find(s=>s.key===undefined);
    if(!slot){
      if(this.slots.length>=96)return;
      const node=new Node('demonPaintedSpell');this.root.addChild(node);node.layer=this.root.layer;
      node.addComponent(UITransform);const opacity=node.addComponent(UIOpacity),sprites:Sprite[]=[],blends:UIOpacity[]=[];
      for(let i=0;i<2;i++){
        const cel=new Node('demonPaintedCel');node.addChild(cel);cel.layer=node.layer;cel.addComponent(UITransform);
        const sprite=cel.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        sprites.push(sprite);blends.push(cel.addComponent(UIOpacity));
      }
      slot={node,sprites,blends,opacity,used:false};this.slots.push(slot);
    }
    slot.key=effect.key;slot.used=true;
    const cel=Math.max(0,Math.min(3,phase)),index=Math.floor(cel),blend=cel-index,next=Math.min(3,index+1);
    for(let i=0;i<2;i++){
      const transform=slot.sprites[i].node.getComponent(UITransform)!;
      transform.setContentSize(this.cell*effect.size,this.cell*effect.size*((effect.row===0||effect.row===2) ? .72 : 1));
      const frame=this.frames[effect.row*4+(i?next:index)];
      if(slot.sprites[i].spriteFrame!==frame)slot.sprites[i].spriteFrame=frame;
      slot.blends[i].opacity=Math.round(255*(i?blend:1-blend));
    }
    slot.node.setPosition(p.x,p.y+(effect.row===3?this.cell*.4:0),0);slot.node.active=true;
    slot.opacity.opacity=Math.round(255*Math.max(0,Math.min(1,alpha)));
  }
  update(tick:number):void {
    this.lastTick=tick;if(this.ended||this.disposed)return;
    const ready=this.frames.length===16;this.root.active=ready;
    this.effects=this.effects.filter(e=>tick<e.end&&(!e.shield||this.shielded(e.id)));
    for(const slot of this.slots)slot.used=false;
    if(ready)for(const effect of this.effects){
      if(tick<effect.start)continue;
      const node=effect.follow?this.owner(effect.id):undefined;
      const p=effect.point?this.cellPoint(effect.point):node?.isValid?node.position:undefined;
      if(!p)continue;
      const progress=Math.max(0,Math.min(1,(tick-effect.start)/(effect.end-effect.start)));
      const phase=effect.shield?(tick-effect.start)*this.tickMs/350%3:progress*3;
      const alpha=Math.min(1,progress*10)*Math.min(1,(1-progress)*(effect.shield?12:4));
      this.paint(effect,p,phase,alpha);
    }
    for(const slot of this.slots)if(!slot.used){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
  }
  clear():void {
    this.effects=[];for(const slot of this.slots){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
    if(this.root.isValid)this.root.active=false;
  }
  destroy():void {
    this.disposed=true;this.clear();
    for(const slot of this.slots)for(const sprite of slot.sprites)sprite.spriteFrame=null;
    if(this.root.isValid)this.root.destroy();
    for(const frame of this.frames)frame.destroy();this.frames=[];this.slots=[];
  }
}
