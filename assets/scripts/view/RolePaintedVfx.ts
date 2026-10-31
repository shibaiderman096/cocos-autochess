import {Node,UITransform,Sprite,SpriteFrame,Texture2D,UIOpacity,Rect,Size,Vec3,resources} from 'cc';
import type {BattleEvent,Pos} from '../battle/types';
import {basicAttackLook,BASIC_ATTACK_ROW_EDGES} from './BasicAttackArt';
import type {BasicAttackAtlas} from './BasicAttackArt';
import {SoulRealmBorder} from './SoulRealmBorder';
import {FX_SPRITE} from './ArtPaths';

export type PaintedAtlas='soul'|'knight'|'dragon'|'starCards'|BasicAttackAtlas;
type Atlas=PaintedAtlas;
const rowsFor=(atlas:Atlas):number=>atlas==='soul'?2:atlas==='basicBlood'||atlas==='knight'||atlas==='dragon'||atlas==='starCards'?4:6;
const pathFor=(atlas:Atlas):string=>atlas==='soul'?'art/fx/soul_realm_vfx/texture':atlas==='knight'?'art/fx/azure_oath_vfx/texture':atlas==='dragon'?'art/fx/cloud_dragon_vfx/texture':FX_SPRITE[atlas].replace('/spriteFrame','/texture');
type Effect={source:number;target?:number;atlas:Atlas;row:number;start:number;end:number;width:number;height:number;at?:Vec3;owner?:number;from?:Vec3;to?:Vec3;angle?:number;loop?:boolean;spin?:boolean;travel?:number};
type Slot={node:Node;sprites:Sprite[];alphas:UIOpacity[];opacity:UIOpacity};
/** Painted art only. Shared replay ticks own timing; these nodes never settle combat. */
export class RolePaintedVfx {
  private realm:SoulRealmBorder|null=null;
  private root:Node;private frames=new Map<Atlas,SpriteFrame[]>();private effects:Effect[]=[];private slots:Slot[]=[];
  private disposed=false;private ended=false;private lastTick=0;
  constructor(parent:Node,private cell:number,private tickMs:number,private owner:(id:number)=>Node|undefined,
    private identity:(id:number)=>string|undefined,private point:(p:Pos)=>Vec3,private lineEnd:(from:Pos,to:Pos,length:number)=>Vec3,
    private spinning:(id:number)=>boolean,atlases:Atlas[],boardSize={columns:7,rows:8}){
    this.root=new Node('exclusiveRolePaintedVfx');this.root.layer=parent.layer;parent.addChild(this.root);
    if(atlases.includes('soul'))this.realm=new SoulRealmBorder(parent.parent??parent,boardSize.columns,boardSize.rows,cell,tickMs);
    for(const atlas of new Set(atlases))resources.load(pathFor(atlas),Texture2D,(error,texture)=>{
      if(error||this.disposed||!this.root.isValid)return;
      const frames:SpriteFrame[]=[],rows=rowsFor(atlas),edges=atlas==='soul'?[0,350,663]:BASIC_ATTACK_ROW_EDGES[atlas as BasicAttackAtlas],edgeHeight=atlas==='soul'?663:1536;
      for(let i=0;i<4*rows;i++){
        const row=Math.floor(i/4),x=Math.round(i%4*texture.width/4);
        const y=Math.round((edges?edges[row]/edgeHeight:row/rows)*texture.height);
        const w=Math.round((i%4+1)*texture.width/4)-x,h=Math.round((edges?edges[row+1]/edgeHeight:(row+1)/rows)*texture.height)-y;
        const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(x,y,w,h);frame.originalSize=new Size(w,h);frames.push(frame);
      }
      this.frames.set(atlas,frames);this.update(this.lastTick);
    });
  }
  private add(f:Effect):void{if(this.effects.length<192)this.effects.push(f);}
  play(e:BattleEvent):void{
    if(this.ended||this.disposed)return;
    this.realm?.play(e);
    if(e.t==='end'){this.ended=true;this.effects=[];this.slots.forEach(s=>s.node.active=false);return;}
    if(e.t==='stun'||e.t==='fear'||e.t==='knockup')this.effects=this.effects.filter(f=>!(f.source===e.id&&f.atlas==='starCards'&&f.row===2));
    if(e.t==='death'){this.effects=this.effects.filter(f=>f.source!==e.id&&f.owner!==e.id&&f.target!==e.id);this.update(this.lastTick);return;}
    if(e.t==='attack'){
      const id=this.identity(e.id),a=this.owner(e.id)?.position.clone(),b=this.owner(e.target)?.position.clone();if(!a||!b)return;
      const look=basicAttackLook(id);
      if(look&&!e.shadow){
        const angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
        this.add({source:e.id,target:e.target,atlas:look.atlas,row:look.row,start:e.tick,end:e.tick+look.seconds*1000/this.tickMs,
          width:look.motion==='lash'?Math.hypot(b.x-a.x,b.y-a.y)/this.cell+.35:look.width,height:look.height,angle,
          ...(look.motion==='projectile'?{from:a,to:b,travel:.75}:look.motion==='lash'?{at:new Vec3((a.x+b.x)/2,(a.y+b.y)/2,0)}:{owner:e.target})});
      }
      if(id==='blueflame_soul_knight')this.add({source:e.id,target:e.target,atlas:'soul',row:0,start:e.tick,end:e.tick+360/this.tickMs,width:2.1,height:1.65,owner:e.target,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI});
      if(id==='azure_oath_knight')this.add({source:e.id,atlas:'knight',row:0,start:e.tick,end:e.tick+300/this.tickMs,width:2,height:1.6,owner:e.target,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI});
      if(id==='cloud_dragon_priestess')this.add({source:e.id,atlas:'dragon',row:0,start:e.tick,end:e.tick+300/this.tickMs,width:1.6,height:1.2,from:a,to:b,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI});
      if(id==='star_card_magician'){
        this.add({source:e.id,target:e.target,atlas:'starCards',row:1,start:e.tick+200/this.tickMs,end:e.tick+450/this.tickMs,width:1.1,height:1.1,owner:e.target});
      }
    }
    if(e.t==='cast'&&e.skillId==='star_card_show')this.add({source:e.id,atlas:'starCards',row:2,start:e.tick,end:e.tick+(e.duration??.6)*1000/this.tickMs,width:2.1,height:2.1,owner:e.id});
    if(e.t==='unit_copy')this.add({source:e.source,atlas:'starCards',row:3,start:e.tick,end:e.tick+600/this.tickMs,width:1.6,height:2,at:this.point(e.pos)});
    if(e.t==='soul_drain'||e.t==='soul_gain'){
      const a=this.point(e.from),b=this.point(e.to);
      this.add({source:e.id,atlas:'soul',row:1,start:e.tick,end:e.tick+(e.t==='soul_drain'?600:450)/this.tickMs,width:e.t==='soul_drain'?1.2:.65,height:e.t==='soul_drain'?.85:.5,from:a,to:b,angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI});
    }
    if(e.t==='knight_action'&&e.kind!=='jump'){
      const spin=e.kind==='spin',a=this.point(e.at),b=this.lineEnd(e.at,e.toward,3);
      this.add({source:e.id,atlas:'knight',row:spin?3:e.kind==='leap'?1:2,start:e.tick,end:e.tick+(spin?e.durationTicks:450/this.tickMs),
        width:e.kind==='wave'?Math.hypot(b.x-a.x,b.y-a.y)/this.cell:3.1,height:e.kind==='wave'?1.25:2.4,
        ...(spin?{owner:e.id,loop:true,spin:true}:e.kind==='wave'?{at:new Vec3((a.x+b.x)/2,(a.y+b.y)/2,0),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI}:{at:a})});
    }
    if(e.t==='cast'&&e.skillId==='cloud_dragon_flow')this.add({source:e.id,atlas:'dragon',row:1,start:e.tick,end:e.tick+600/this.tickMs,width:2.5,height:2.8,owner:e.id});
    if(e.t==='dragon_breath'){
      const a=this.point(e.from),b=this.lineEnd(e.from,e.to,3);
      this.add({source:e.id,atlas:'dragon',row:2,start:e.tick,end:e.tick+e.durationTicks,width:Math.hypot(b.x-a.x,b.y-a.y)/this.cell,height:1.3,
        at:new Vec3((a.x+b.x)/2,(a.y+b.y)/2,0),angle:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI});
    }
    if(e.t==='dragon_shred')this.add({source:e.id,atlas:'dragon',row:3,start:e.tick,end:e.tick+220/this.tickMs,width:1.2,height:1.4,owner:e.target});
  }
  update(tick:number):void{
    if(this.disposed)return;this.lastTick=tick;this.realm?.update(tick);
    this.effects=this.effects.filter(f=>tick<f.end&&(!f.spin||this.spinning(f.source)));
    for(const s of this.slots)s.node.active=false;
    let used=0;
    for(const f of this.effects){
      if(tick<f.start)continue;const frames=this.frames.get(f.atlas);if(!frames)continue;
      let slot=this.slots[used];if(!slot){
        if(used>=96)break;
        const node=new Node('paintedRoleCel');node.layer=this.root.layer;this.root.addChild(node);node.addComponent(UITransform);
        const sprites:Sprite[]=[],alphas:UIOpacity[]=[];
        for(let i=0;i<2;i++){const cel=new Node('blend');cel.layer=node.layer;node.addChild(cel);cel.addComponent(UITransform);const sprite=cel.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;sprites.push(sprite);alphas.push(cel.addComponent(UIOpacity));}
        slot={node,sprites,alphas,opacity:node.addComponent(UIOpacity)};this.slots.push(slot);
      }
      const owner=f.owner===undefined?undefined:this.owner(f.owner);if(f.owner!==undefined&&!owner)continue;
      used++;slot.node.active=true;
      const phase=Math.max(0,Math.min(1,(tick-f.start)/(f.end-f.start))),frame=f.loop?(tick-f.start)*this.tickMs/125%4:phase*3;
      const index=Math.floor(frame),blend=frame-index,next=f.loop?(index+1)%4:Math.min(3,index+1);
      const pos=f.at?.clone()??owner?.position.clone()??new Vec3();
      if(f.from&&f.to){const travel=Math.min(1,phase/(f.travel??1));pos.x=f.from.x+(f.to.x-f.from.x)*travel;pos.y=f.from.y+(f.to.y-f.from.y)*travel;}
      pos.y+=this.cell*(f.row===3&&f.atlas==='knight'?.2:.45);slot.node.setPosition(pos);slot.node.angle=f.angle??0;
      // Painted content occupies ~2/3 of each safely padded source cell.
      for(let i=0;i<2;i++){slot.sprites[i].spriteFrame=frames[f.row*4+(i?next:index)];slot.sprites[i].node.getComponent(UITransform)!.setContentSize(f.width*this.cell/.68,f.height*this.cell/.68);slot.alphas[i].opacity=Math.round(255*(i?blend:1-blend));}
      slot.opacity.opacity=f.loop?220:Math.round(255*Math.min(1,(1-phase)*5));
    }
  }
  destroy():void{this.disposed=true;this.effects=[];this.root.destroy();this.realm?.destroy();this.realm=null;for(const frames of this.frames.values())for(const frame of frames)frame.destroy();this.frames.clear();}
}
