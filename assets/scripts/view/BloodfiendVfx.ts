import { Node, Sprite, SpriteFrame, Texture2D, Rect, Size, UITransform, UIOpacity, Vec3, resources } from 'cc';
import type { BattleEvent } from '../battle/types';
import { FX_SPRITE } from './ArtPaths';

type Art = 'crimsonUpheaval' | 'bloodlineSiphon' | 'voidscarTransit' | 'frostbloodRoar' | 'scarletAid' | 'bloodRebirth' | 'bloodCleave' | 'bloodfiendRevel';
interface State { alive: boolean; charging?: string; skillId?: string; rebirthing?: boolean }
interface Layer {
  art: Art; tick: number; seconds: number; from: Vec3; to?: number;
  owner: number; size: number; height?: number; angle: number;
  motion: 'charge' | 'burst' | 'siphon' | 'roar' | 'ward' | 'rebirth'; follow?: number; skillId?: string; persistAfterOwnerDeath?: boolean;
}
interface Slot { node: Node; sprites: Sprite[]; blends: UIOpacity[]; opacity: UIOpacity; layer?: Layer; frame: number }
const angleTo=(a:Vec3,b:Vec3)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;

/** Painted eight-cel spell timelines, owned exclusively by the deterministic replay clock. */
export class BloodfiendVfx {
  private frames=new Map<Art,SpriteFrame[]>();
  private slots:Slot[]=[];
  private disposed=false;
  private ended=false;
  constructor(private root:Node,private cell:number,private tickMs:number,
    private project:(x:number,y:number)=>Vec3,private node:(id:number)=>Node|undefined,private state:(id:number)=>State|undefined,
    private lineEnd:(from:{x:number;y:number},toward:{x:number;y:number},length:number)=>Vec3) {
    for(const art of ['crimsonUpheaval','bloodlineSiphon','voidscarTransit','frostbloodRoar','scarletAid','bloodRebirth','bloodCleave','bloodfiendRevel'] as Art[])
      resources.load(FX_SPRITE[art].replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
        if(error||this.disposed||!this.root.isValid)return;
        const frames:SpriteFrame[]=[];
        for(let i=0;i<8;i++){
          const f=new SpriteFrame(),w=texture.width/4,h=texture.height/2;
          f.texture=texture;f.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);f.originalSize=new Size(w,h);frames.push(f);
        }
        this.frames.set(art,frames);
      });
  }
  private add(layer:Layer):void {
    if(this.disposed||this.ended||!this.root.isValid)return;
    let slot=this.slots.find(s=>!s.layer);
    if(!slot){
      if(this.slots.length>=96)return;
      const n=new Node('bloodfiendVfx');this.root.addChild(n);n.addComponent(UITransform);
      const sprites:Sprite[]=[],blends:UIOpacity[]=[];
      for(let i=0;i<2;i++){
        const cel=new Node('bloodfiendCel');n.addChild(cel);cel.addComponent(UITransform);
        const s=cel.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.trim=false;sprites.push(s);blends.push(cel.addComponent(UIOpacity));
      }
      slot={node:n,sprites,blends,opacity:n.addComponent(UIOpacity),frame:0};this.slots.push(slot);
    }
    slot.layer=layer;slot.node.active=false;slot.node.setPosition(layer.from);slot.node.angle=layer.angle;slot.node.setScale(1,1,1);
    for(let i=0;i<2;i++){
      slot.sprites[i].spriteFrame=null;slot.blends[i].opacity=0;
      slot.sprites[i].node.getComponent(UITransform)!.setContentSize(this.cell*layer.size,this.cell*(layer.height??layer.size));
    }
  }
  play(e:BattleEvent):void {
    if(this.disposed||this.ended)return;
    if(e.t==='end'){this.clear();this.ended=true;return;}
    if(e.t==='death'){this.cancel(e.id);return;}
    if(e.t==='bloodfiend_revel'){
      const from=this.node(e.id)?.position;
      // Coalesce same-tick kills visually; independent four-second gameplay stacks stay in the sim.
      if(from&&!this.slots.some(s=>s.layer?.art==='bloodfiendRevel'&&s.layer.owner===e.id&&s.layer.tick===e.tick))
        this.add({art:'bloodfiendRevel',owner:e.id,from:from.clone(),follow:e.id,tick:e.tick,seconds:.8,size:1.75,angle:0,motion:'burst'});
    }else if(e.t==='blood_rebirth'){
      const from=this.node(e.id)?.position;
      if(from)this.add({art:'bloodRebirth',owner:e.id,from:from.clone(),follow:e.id,tick:e.tick,
        seconds:(e.untilTick-e.tick)*this.tickMs/1000,size:1.8,height:2.2,angle:0,motion:'rebirth'});
    }else if(e.t==='blood_cleave_charge'){
      const from=this.node(e.id)?.position,to=this.node(e.target)?.position;
      for(const slot of this.slots)if(slot.layer?.owner===e.id&&slot.layer.art==='bloodCleave'&&slot.layer.motion==='charge')this.release(slot);
      if(from)this.add({art:'bloodCleave',owner:e.id,from:from.clone(),follow:e.id,tick:e.tick,
        seconds:(e.untilTick-e.tick)*this.tickMs/1000,size:1.3,angle:to?angleTo(from,to):0,motion:'charge',skillId:'blood_sovereignty'});
    }else if(e.t==='blood_cleave'){
      const from=this.project(e.from.x,e.from.y),to=this.lineEnd(e.from,e.toward,e.length+2);
      this.add({art:'bloodCleave',owner:e.id,from:new Vec3((from.x+to.x)/2,(from.y+to.y)/2,0),tick:e.tick,
        seconds:.55,size:Math.hypot(to.x-from.x,to.y-from.y)/this.cell,height:1.2,angle:angleTo(from,to),motion:'roar'});
    }else if(e.t==='cast'&&e.skillId==='blood_sovereignty'){
      const from=this.node(e.id)?.position;
      if(from)this.add({art:'bloodRebirth',owner:e.id,from:from.clone(),follow:e.id,tick:e.tick,seconds:.4,size:1.25,angle:0,motion:'burst'});
    }else if(e.t==='blood_aid'){
      this.add({art:'scarletAid',owner:e.id,from:this.project(e.from.x,e.from.y),tick:e.tick,seconds:.45,size:1.45,angle:0,motion:'burst'});
      this.add({art:'scarletAid',owner:e.id,from:this.project(e.to.x,e.to.y),tick:e.tick,seconds:.5,size:1.6,angle:0,motion:'burst'});
      if(e.phase==='arrive'){
        const target=this.node(e.target)?.position;
        if(target)this.add({art:'scarletAid',owner:e.id,from:target.clone(),follow:e.target,tick:e.tick,
          seconds:(e.untilTick-e.tick)*this.tickMs/1000,size:1.75,angle:0,motion:'ward',persistAfterOwnerDeath:true});
      }
    }else if(e.t==='skill_impact'&&e.skillId==='scarlet_aid_dance'){
      const target=this.node(e.target)?.position;if(target)this.add({art:'scarletAid',owner:e.id,from:target.clone(),tick:e.tick,seconds:.3,size:.85,angle:0,motion:'burst'});
    }else if(e.t==='cast'&&(e.skillId==='crimson_upheaval'||e.skillId==='frostblood_roar')){
      const from=this.node(e.id)?.position,to=this.node(e.target)?.position;if(!from)return;
      this.add({art:e.skillId==='crimson_upheaval'?'crimsonUpheaval':'frostbloodRoar',owner:e.id,from:from.clone(),follow:e.id,
        tick:e.tick,seconds:e.duration??.6,size:1.4,angle:to?angleTo(from,to)-(e.skillId==='crimson_upheaval'?45:0):0,motion:'charge',skillId:e.skillId});
    }else if(e.t==='skill_impact'&&(e.skillId==='crimson_upheaval'||e.skillId==='bloodline_siphon')){
      const from=this.node(e.id)?.position,to=this.node(e.target)?.position;if(!from||!to)return;
      if(e.skillId==='crimson_upheaval')this.add({art:'crimsonUpheaval',owner:e.id,from:to.clone(),tick:e.tick,seconds:.55,size:2.0,angle:angleTo(from,to)-45,motion:'burst'});
      else {
        this.add({art:'bloodlineSiphon',owner:e.id,from:to.clone(),to:e.id,tick:e.tick,seconds:.5,size:1.15,angle:angleTo(to,from),motion:'siphon'});
        this.add({art:'bloodlineSiphon',owner:e.id,from:from.clone(),follow:e.id,tick:e.tick+6,seconds:.5,size:1.3,angle:0,motion:'burst'});
      }
    }else if(e.t==='skill_pulse'&&e.skillId==='voidscar_transit'&&(e.effect==='void'||e.effect==='voidMark')){
      const from=this.node(e.id)?.position,to=this.project(e.center.x,e.center.y);if(!from)return;
      this.add({art:'voidscarTransit',owner:e.id,from:to,tick:e.tick,seconds:e.effect==='voidMark'?.65:.35,size:e.effect==='voidMark'?2.3:1.9,angle:angleTo(from,to),motion:'burst'});
    }else if(e.t==='line_roar'){
      const from=this.project(e.from.x,e.from.y),to=this.lineEnd(e.from,e.toward,e.length),angle=angleTo(from,to);
      const distance=Math.hypot(to.x-from.x,to.y-from.y);
      this.add({art:'frostbloodRoar',owner:e.id,from:new Vec3((from.x+to.x)/2,(from.y+to.y)/2,0),
        tick:e.tick,seconds:.65,size:distance/this.cell,height:1.5,angle,motion:'roar'});
    }
  }
  update(tick:number):void {
    for(const slot of this.slots){
      const l=slot.layer;if(!l)continue;
      const age=(tick-l.tick)*this.tickMs/1000,p=age/l.seconds;
      if(p>=1||(l.motion==='charge'&&(!this.state(l.owner)?.alive||this.state(l.owner)?.charging!==l.skillId))
        ||(l.motion==='rebirth'&&!this.state(l.owner)?.rebirthing)){this.release(slot);continue;}
      if(p<0){slot.node.active=false;continue;}
      const frames=this.frames.get(l.art);if(!frames){slot.node.active=false;continue;}
      const position=l.follow===undefined?l.from:this.node(l.follow)?.position;
      if(!position){this.release(slot);continue;}
      let x=position.x,y=position.y;
      if(l.motion==='siphon'){
        const to=this.node(l.to!)?.position;if(!to){this.release(slot);continue;}
        x=l.from.x+(to.x-l.from.x)*p;y=l.from.y+(to.y-l.from.y)*p+Math.sin(p*Math.PI)*this.cell*.25;
      }
      const cel=l.motion==='ward'?3+Math.sin(age*3)*.8:l.motion==='charge'?Math.min(2,p*3):Math.min(7,p*8),index=Math.floor(cel),blend=cel-index;
      slot.frame=index;slot.sprites[0].spriteFrame=frames[index];slot.sprites[1].spriteFrame=frames[Math.min(7,index+1)];
      slot.blends[0].opacity=Math.round((1-blend)*255);slot.blends[1].opacity=Math.round(blend*255);
      slot.node.active=true;slot.node.setPosition(x,y,0);
      const scale=l.motion==='ward'?1+Math.sin(age*3)*.025:l.motion==='charge'?.55+.45*p:1;slot.node.setScale(scale,scale,1);slot.node.angle=l.angle;
      slot.opacity.opacity=Math.round(255*(l.motion==='ward'?.5*Math.min(1,age*8,(1-p)*8):l.motion==='charge'?.55+.45*p:Math.min(1,p*12,(1-p)*8)));
    }
  }
  private release(s:Slot):void {s.layer=undefined;s.node.active=false;s.opacity.opacity=0;}
  cancel(id:number):void {for(const s of this.slots)if((s.layer?.owner===id&&!s.layer.persistAfterOwnerDeath)||s.layer?.follow===id||s.layer?.to===id)this.release(s);}
  clear():void {for(const s of this.slots)this.release(s);}
  destroy():void {this.disposed=true;this.clear();for(const s of this.slots)if(s.node.isValid)s.node.destroy();this.slots=[];for(const frames of this.frames.values())for(const frame of frames)frame.destroy();this.frames.clear();}
}
