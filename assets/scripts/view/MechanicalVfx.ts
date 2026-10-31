import { Node, Sprite, SpriteFrame, Texture2D, Rect, Size, UITransform, UIOpacity, Vec3, resources } from 'cc';
import type { BattleEvent } from '../battle/types';
import { FX_SPRITE } from './ArtPaths';

export interface MechanicalVfxState {
  alive: boolean; skillId?: string; wall: boolean; airborne: boolean; dashing: boolean;
  charging?: string; overclockUntil: number; burning: boolean;
}
type Motion = 'burst' | 'slash' | 'beam' | 'missile' | 'charge' | 'wall' | 'overclock' | 'burn' | 'air' | 'trail';
type Tag = 'wall' | 'overclock' | 'burn' | 'air' | 'charge' | 'hunt' | 'dash';
interface Layer {
  row: number; motion: Motion; start: number; seconds: number; from: Vec3; to?: Vec3;
  size: number; height?: number; angle?: number; opacity?: number; follow?: number;
  source?: number; tag?: Tag; key?: string; ground?: boolean; skillId?: string;
  activation?: boolean;
}
interface Slot {
  node: Node; art: Sprite[]; blend: UIOpacity[]; opacity: UIOpacity; layer?: Layer;
}
const MAX_LAYERS = 160;
// The painted rows have different transparent margins; use their actual gutters, not height/8.
const ROW_EDGES = [0,198,384,565,737,918,1124,1332,1536];
const angleTo = (a: Vec3, b: Vec3): number => Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;

/** One transparent 4×8 atlas; pooled layers and crossfades advance only with the replay tick. */
export class MechanicalVfx {
  private slots: Slot[] = [];
  private keyed = new Map<string, Slot>();
  private frames: SpriteFrame[] = [];
  private activationFrames: SpriteFrame[] = [];
  private ground: Node | null = null;
  private disposed = false;
  private ended = false;
  constructor(private root: Node, private cell: number, private tickMs: number,
    private project: (x: number, y: number) => Vec3, private owner: (id: number) => Node | undefined,
    private state: (id: number) => MechanicalVfxState | undefined) {
    resources.load(FX_SPRITE.mechanicalSkills.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||!this.root.isValid)return;
      // Raw texture rectangles avoid automatic trim changing the animation's common pivot.
      for(let row=0;row<8;row++)for(let col=0;col<4;col++){
        const frame=new SpriteFrame(),w=texture.width/4,y=ROW_EDGES[row]*texture.height/1536,h=(ROW_EDGES[row+1]-ROW_EDGES[row])*texture.height/1536;
        frame.texture=texture;frame.rect=new Rect(col*w,y,w,h);frame.originalSize=new Size(w,h);
        this.frames.push(frame);
      }
    });
    resources.load(FX_SPRITE.mechanicalOverclock.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||!this.root.isValid)return;
      for(let i=0;i<8;i++){
        const frame=new SpriteFrame(),w=texture.width/4,h=texture.height/2;
        frame.texture=texture;frame.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);frame.originalSize=new Size(w,h);
        this.activationFrames.push(frame);
      }
    });
  }
  private groundRoot(): Node {
    if(this.ground?.isValid)return this.ground;
    const n=new Node('mechanicalGround');(this.root.parent??this.root).addChild(n);
    const grid=n.parent!.getChildByName('boardGrid');
    n.setSiblingIndex(grid?n.parent!.children.indexOf(grid)+1:0);this.ground=n;return n;
  }
  private add(layer: Layer): void {
    if(this.disposed||this.ended||!this.root.isValid)return;
    if(layer.key){const previous=this.keyed.get(layer.key);if(previous){
      if(!layer.activation){previous.layer=layer;return;}
      this.release(previous);
    }}
    let slot=this.slots.find(s=>!s.layer);
    if(!slot){
      if(this.slots.length>=MAX_LAYERS)return;
      const n=new Node('mechanicalVfx');n.addComponent(UITransform);this.root.addChild(n);
      const art:Sprite[]=[],blend:UIOpacity[]=[];
      for(let i=0;i<2;i++){
        const child=new Node('mechanicalCel');n.addChild(child);child.addComponent(UITransform);
        const sprite=child.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        art.push(sprite);blend.push(child.addComponent(UIOpacity));
      }
      slot={node:n,art,blend,opacity:n.addComponent(UIOpacity)};this.slots.push(slot);
    }
    (layer.ground?this.groundRoot():this.root).addChild(slot.node);
    slot.layer=layer;slot.node.active=false;slot.node.angle=0;slot.node.setScale(1,1,1);
    slot.opacity.opacity=0;slot.node.setPosition(layer.from);
    slot.art.forEach((sprite,i)=>{
      sprite.spriteFrame=null;sprite.node.angle=0;slot!.blend[i].opacity=0;
      sprite.node.getComponent(UITransform)!.setContentSize(this.cell*layer.size,this.cell*(layer.height??layer.size*.75));
    });
    if(layer.key)this.keyed.set(layer.key,slot);
  }
  private burst(row: number,pos: Vec3,tick: number,size: number,seconds=.5,ground=false): void {
    this.add({row,motion:'burst',from:pos.clone(),start:tick,seconds,size,ground});
  }
  play(e: BattleEvent): void {
    if(this.disposed||this.ended)return;
    if(e.t==='end'){this.clear();this.ended=true;return;}
    if(e.t==='death'){this.cancel(e.id);return;}
    if(e.t==='cast'){
      const from=this.owner(e.id)?.position.clone(),to=this.owner(e.target)?.position.clone();
      if(!from)return;
      if(e.skillId==='hydraulic_bulwark'){
        this.add({row:0,motion:'wall',from,start:e.tick,seconds:Infinity,size:1.8,opacity:190,follow:e.id,source:e.id,tag:'wall',key:`wall:${e.id}`,ground:true});
        this.burst(7,from,e.tick,1.7,.45,true);
      }else if(e.skillId==='repair_protocol')this.burst(2,from,e.tick,1.2,.4);
      else if(e.skillId==='sky_annihilation')this.burst(7,from,e.tick,2.1,.45);
      else if(e.skillId==='rail_execution'||e.skillId==='rending_hunt'){
        this.add({row:e.skillId==='rail_execution'?3:4,motion:'charge',from,start:e.tick,seconds:e.duration??.3,
          size:e.skillId==='rail_execution'?1.4:1.5,angle:to&&e.skillId==='rail_execution'?angleTo(from,to):0,
          follow:e.id,source:e.id,tag:'charge',skillId:e.skillId});
        if(e.skillId==='rending_hunt'&&to)this.add({row:4,motion:'charge',from:to,start:e.tick,seconds:(e.duration??.3)+.3,
          size:1.6,follow:e.target,source:e.id,tag:'hunt',ground:true,opacity:130});
      }
    }else if(e.t==='skill_impact'){
      const from=this.owner(e.id)?.position,to=this.owner(e.target)?.position;
      if(!to)return;
      if(e.skillId==='turbo_hunt'||e.skillId==='furnace_overload')this.add({row:e.skillId==='turbo_hunt'?1:5,motion:'slash',from:to.clone(),
        start:e.tick,seconds:.48,size:e.skillId==='turbo_hunt'?2:2.6,angle:from?angleTo(from,to):0});
      else if(e.skillId==='repair_protocol'){
        this.burst(2,to,e.tick,1.9,.65);

      }else if(e.skillId==='rending_hunt'){
        this.burst(4,to,e.tick,2.8,.6,true);this.burst(4,to,e.tick+2,1.7,.45);
      }
    }else if(e.t==='repair_shot'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      this.add({row:2,motion:'missile',from,to,start:e.tick,seconds:e.flightTicks*this.tickMs/1000,size:.65});
    }else if(e.t==='rail_shot'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      const distance=Math.hypot(to.x-from.x,to.y-from.y),mid=new Vec3((from.x+to.x)/2,(from.y+to.y)/2,0);
      this.add({row:3,motion:'beam',from:mid,start:e.tick,seconds:.3,size:distance/this.cell+1.1,height:.85,angle:angleTo(from,to)});
      this.burst(3,to,e.tick,.95,.35);
    }else if(e.t==='dash'&&this.state(e.id)?.skillId==='furnace_overload'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      this.add({row:5,motion:'trail',from,to,start:e.tick,seconds:e.durationTicks*this.tickMs/1000,size:2.2,
        angle:angleTo(from,to),source:e.id,tag:'dash'});
    }else if(e.t==='missile'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      this.add({row:6,motion:'missile',from,to,start:e.tick,seconds:(e.flightTicks??5)*this.tickMs/1000,size:1.1,angle:angleTo(from,to)-90});
      this.burst(6,to,e.tick+(e.flightTicks??5),2.2,.55);
    }else if(e.t==='burn'&&this.state(e.source)?.skillId==='sky_annihilation'){
      const pos=this.owner(e.id)?.position;if(pos)this.add({row:5,motion:'burn',from:pos.clone(),start:e.tick,seconds:Infinity,
        size:1.05,opacity:160,follow:e.id,source:e.id,tag:'burn',key:`burn:${e.id}`,ground:true});
    }else if(e.t==='mechanical_overclock'){
      const pos=this.owner(e.id)?.position;
      if(pos){
        this.add({row:7,motion:'overclock',from:pos.clone(),start:e.tick,seconds:(e.untilTick-e.tick)*this.tickMs/1000,
          size:1.65,opacity:150,follow:e.id,source:e.id,tag:'overclock',key:`overclock:${e.id}`,ground:true});
        this.add({row:0,motion:'burst',activation:true,from:pos.clone(),start:e.tick,seconds:1.1,
          size:e.emergency?2.05:1.8,height:e.emergency?2.05:1.8,opacity:255,follow:e.id,source:e.id,key:`activation:${e.id}`});
      }
    }else if(e.t==='heal'){
      const skill=this.state(e.source)?.skillId,pos=this.owner(e.id)?.position;
      if(pos&&(skill==='hydraulic_bulwark'||skill==='turbo_hunt'))this.burst(2,pos,e.tick,1.25,.4);
    }
  }
  /** Airborne has no separate battle event; the authoritative snapshot owns its start/end. */
  syncUnit(id: number,tick: number): void {
    if(this.ended||this.disposed)return;
    const state=this.state(id),pos=this.owner(id)?.position;
    if(state?.alive&&state.airborne&&pos&&!this.keyed.has(`air:${id}`))this.add({row:4,motion:'air',from:pos.clone(),
      start:tick,seconds:Infinity,size:1.4,opacity:180,follow:id,source:id,tag:'air',key:`air:${id}`});
  }
  private valid(layer: Layer): boolean {
    if(layer.follow!==undefined&&(!this.owner(layer.follow)?.isValid||!this.state(layer.follow)?.alive))return false;
    if(layer.source===undefined||!layer.tag)return true;
    const s=this.state(layer.source);if(!s?.alive)return false;
    switch(layer.tag){
      case 'wall':return s.wall;
      case 'burn':return s.burning;
      case 'overclock':return s.overclockUntil>this.renderTick;
      case 'charge':return s.charging===layer.skillId;
      case 'hunt':return s.charging==='rending_hunt'||s.airborne;
      case 'air':return s.airborne;
      case 'dash':return s.dashing;
    }
  }
  private renderTick=0;
  update(tick: number): void {
    this.renderTick=tick;
    for(const slot of this.slots){
      const l=slot.layer;if(!l)continue;
      const age=(tick-l.start)*this.tickMs/1000,p=age/l.seconds;
      if(p>=1||!this.valid(l)){this.release(slot);continue;}
      const frames=l.activation?this.activationFrames:this.frames;
      if(age<0||frames.length!==(l.activation?8:32)){slot.node.active=false;continue;}
      const base=l.follow===undefined?l.from:this.owner(l.follow)!.position;
      let x=base.x,y=base.y,scale=1,angle=l.angle??0,alpha=l.opacity??235;
      const loop=['wall','overclock','burn','air'].includes(l.motion),ease=1-Math.pow(1-Math.min(1,p),3);
      // Crossfade neighboring hand-drawn cels, then apply continuous movement and light breathing.
      const last=l.activation?7:3,offset=l.activation?0:l.row*4;
      const cel=loop?1.5+Math.sin(age*7)*.5:Math.min(last,p*(l.activation?8:3)),index=Math.floor(cel),mix=cel-index;
      slot.art[0].spriteFrame=frames[offset+index];slot.art[1].spriteFrame=frames[offset+Math.min(last,index+1)];
      slot.blend[0].opacity=Math.round(255*(1-mix));slot.blend[1].opacity=Math.round(255*mix);
      if(l.motion==='missile'||l.motion==='trail'){
        const travel=Math.min(1,p);x=l.from.x+(l.to!.x-l.from.x)*travel;y=l.from.y+(l.to!.y-l.from.y)*travel;
        if(l.motion==='missile')y+=Math.sin(p*Math.PI)*this.cell*.35;
        scale=.75+Math.sin(Math.PI*p)*.2;
      }else if(l.motion==='wall'){
        scale=Math.min(1,.45+age*3.5)*(1+Math.sin(age*5)*.035);y+=this.cell*.1;
      }else if(l.motion==='overclock'){
        scale=1+Math.sin(age*7)*.06;y-=this.cell*.27;angle+=age*45;
      }else if(l.motion==='burn'){
        scale=.9+Math.sin(age*9)*.12;y-=this.cell*.18;angle+=age*70;
      }else if(l.motion==='air'){
        scale=.8+Math.sin(age*12)*.1;y+=this.cell*.75;angle-=age*300;
      }else if(l.motion==='charge'){
        scale=1.05-ease*.35;alpha*=.6+ease*.4;
      }else if(l.motion==='beam'){
        scale=1;alpha*=1-p;
      }else{
        scale=.7+ease*.5;alpha*=Math.min(1,(1-p)*4);
        if(l.motion==='slash')angle+=(-12+24*p);
      }
      if(l.ground&&(l.motion==='burst'||l.motion==='charge'))y-=this.cell*.25;
      if(loop)alpha*=Math.min(1,.5+age*5);
      slot.node.active=true;slot.node.setPosition(x,y,0);slot.node.setScale(scale,scale,1);slot.node.angle=angle;
      slot.opacity.opacity=Math.max(0,Math.min(255,Math.round(alpha)));
    }
  }
  private release(slot: Slot): void {
    if(slot.layer?.key)this.keyed.delete(slot.layer.key);
    slot.layer=undefined;slot.node.active=false;slot.opacity.opacity=0;
  }
  cancel(id: number): void {
    for(const s of this.slots)if(s.layer&&(s.layer.follow===id||s.layer.source===id))this.release(s);
  }
  clear(): void {for(const s of this.slots)this.release(s);this.keyed.clear();}
  destroy(): void {
    this.disposed=true;this.clear();for(const s of this.slots)if(s.node.isValid)s.node.destroy();this.slots=[];
    if(this.ground?.isValid)this.ground.destroy();this.ground=null;
    for(const frame of [...this.frames,...this.activationFrames])frame.destroy();this.frames=[];this.activationFrames=[];
  }
}
