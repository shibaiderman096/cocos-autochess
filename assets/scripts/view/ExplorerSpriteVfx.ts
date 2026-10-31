import { Node, Sprite, SpriteFrame, Texture2D, UITransform, UIOpacity, Vec3, Rect, Size, Graphics, Color, resources } from 'cc';
import type { BattleEvent, Pos, RopeHuntRuntime } from '../battle/types';
import type { Unit } from '../battle/Unit';
import { offsetToWorld } from '../battle/HexMath';
import { ropeHuntHookProgress } from '../battle/RopeHunt';
import { FX_SPRITE } from './ArtPaths';

type Art = 'fox'|'lantern'|'wind'|'alchemy'|'sand'|'rope';
type Motion = 'burst'|'charge'|'ward'|'flask'|'swing'|'passive'|'flash'|'grapple';
interface Layer {
  art:Art; motion:Motion; owner:number; tick:number; seconds:number; from:Vec3;
  width:number; height?:number; angle?:number; follow?:number; target?:number; skill?:string;
  startFrame?:number; endFrame?:number; alpha?:number; serial?:number; sourceSurvives?:boolean; anchorY?:number;
}
interface Slot {node:Node; sprites:Sprite[]; blends:UIOpacity[]; opacity:UIOpacity; frame:number; layer?:Layer}
const PATHS:Record<Art,string> = {
  fox:FX_SPRITE.explorerInspiration, lantern:FX_SPRITE.explorerLantern, wind:FX_SPRITE.explorerWind,
  alchemy:FX_SPRITE.explorerCorrosion, sand:FX_SPRITE.explorerSand, rope:FX_SPRITE.explorerRope,
};
const CAST_ART:Record<string,Art> = {windward_hunt:'wind',wayward_corrosion:'alchemy',sand_compass:'sand',rope_shadow_hunt:'rope'};

/** Painted eight-cel sheets; timing, movement and cleanup follow the battle replay clock. */
export class ExplorerSpriteVfx {
  private frames = new Map<Art,SpriteFrame[]>();
  private slots:Slot[] = [];
  private root:Node;
  private lines:Graphics;
  private ropes = new Map<number,RopeHuntRuntime>();
  private shots:Extract<BattleEvent,{t:'rope_shot'}>[]=[];
  private charges=new Map<number,{start:number;end:number}>();
  private disposed=false;
  private ended=false;
  private shotFrame:SpriteFrame|null=null;
  private hookFrame:SpriteFrame|null=null;
  constructor(parent:Node,private cell:number,private tickMs:number,
    private owner:(id:number)=>Node|undefined,private units:()=>readonly Unit[],private logical:(p:Pos)=>Vec3){
    this.root=new Node('explorerPaintedVfx');parent.addChild(this.root);this.root.layer=parent.layer;
    this.root.addComponent(UITransform);
    const tether=new Node('explorerRopeLines');this.root.addChild(tether);tether.layer=parent.layer;tether.addComponent(UITransform);
    this.lines=tether.addComponent(Graphics);
    for(const art of Object.keys(PATHS) as Art[])resources.load(PATHS[art].replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||!this.root.isValid)return;
      const w=texture.width/4,h=texture.height/2,frames:SpriteFrame[]=[];
      for(let n=0;n<8;n++){
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(n%4*w,Math.floor(n/4)*h,w,h);
        f.originalSize=new Size(w,h);frames.push(f);
      }
      this.frames.set(art,frames);
      if(art==='rope'){
        // Read the painted muzzle flare directly from cel four without altering the source atlas.
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(w*3.62,h*.48,w*.37,h*.5);f.originalSize=new Size(w*.37,h*.5);this.shotFrame=f;
        const hook=new SpriteFrame();hook.texture=texture;hook.rect=new Rect(w*.42,0,w*.32,h*.4);hook.originalSize=new Size(w*.32,h*.4);this.hookFrame=hook;
      }
    });
  }
  get ready():boolean{return this.frames.size===6;}
  private unit(id:number):Unit|undefined{return this.units().find(u=>u.id===id);}
  private add(layer:Layer):void{
    if(this.ended||this.disposed)return;
    let slot=this.slots.find(s=>!s.layer);
    if(!slot){
      if(this.slots.length>=96)return;
      const node=new Node('explorerPaintedSpell');this.root.addChild(node);node.layer=this.root.layer;node.addComponent(UITransform);
      const sprites:Sprite[]=[],blends:UIOpacity[]=[];
      for(let n=0;n<2;n++){
        const cel=new Node('explorerPaintedCel');node.addChild(cel);cel.layer=node.layer;cel.addComponent(UITransform);
        const s=cel.addComponent(Sprite);s.sizeMode=Sprite.SizeMode.CUSTOM;s.trim=false;sprites.push(s);blends.push(cel.addComponent(UIOpacity));
      }
      slot={node,sprites,blends,opacity:node.addComponent(UIOpacity),frame:0};this.slots.push(slot);
    }
    slot.layer=layer;slot.node.active=false;
    for(let n=0;n<2;n++){
      const t=slot.sprites[n].node.getComponent(UITransform)!;t.setAnchorPoint(.5,layer.anchorY??.5);
      t.setContentSize(this.cell*layer.width,this.cell*(layer.height??layer.width));slot.blends[n].opacity=0;
    }
  }
  play(e:BattleEvent):void{
    if(this.ended||this.disposed)return;
    if(e.t==='end'){this.clear();this.ended=true;return;}
    if(e.t==='death'){
      this.charges.delete(e.id);this.ropes.delete(e.id);
      this.shots=this.shots.filter(s=>s.target!==e.id);
      for(const s of this.slots)if(s.layer&&(s.layer.follow===e.id||s.layer.target===e.id||(s.layer.owner===e.id&&!s.layer.sourceSurvives)))this.release(s);
      return;
    }
    const from='id'in e?this.owner(e.id)?.position:undefined;
    if(e.t==='cast'&&CAST_ART[e.skillId]&&from){
      const seconds=e.duration??.4;
      this.charges.set(e.id,{start:e.tick,end:e.tick+Math.max(1,Math.round(seconds*1000/this.tickMs))});
      this.add({art:CAST_ART[e.skillId],motion:'charge',owner:e.id,follow:e.id,from:from.clone(),tick:e.tick,seconds,width:1.4,skill:e.skillId,startFrame:0,endFrame:2,alpha:.8});
    }else if(e.t==='inspiration'&&from){
      this.add({art:'fox',motion:'burst',owner:e.id,follow:e.id,from:from.clone(),tick:e.tick,seconds:1.1,width:2,alpha:.9});
      for(const target of e.targets){
        for(const s of this.slots)if(s.layer?.art==='fox'&&s.layer.motion==='ward'&&s.layer.owner===e.id&&s.layer.follow===target)this.release(s);
        this.add({art:'fox',motion:'ward',owner:e.id,follow:target,from:from.clone(),tick:e.tick,seconds:e.durationTicks*this.tickMs/1000,width:1.45,alpha:.35,sourceSurvives:true});
      }
    }else if(e.t==='wind_hunt'&&from){
      this.add({art:'wind',motion:'ward',owner:e.id,follow:e.id,from:from.clone(),tick:e.tick,seconds:(e.untilTick-e.tick)*this.tickMs/1000,width:2.1,alpha:.7});
    }else if(e.t==='corrosion_dose'&&from){
      const to=this.owner(e.target)?.position;if(!to)return;
      this.charges.delete(e.id);
      this.add({art:'alchemy',motion:'flask',owner:e.id,target:e.target,from:from.clone(),tick:e.tick,seconds:.4,width:.85,startFrame:0,endFrame:2,sourceSurvives:true});
      this.add({art:'alchemy',motion:'burst',owner:e.id,follow:e.target,from:to.clone(),tick:e.tick+Math.round(400/this.tickMs),seconds:.8,width:1.65,startFrame:3,endFrame:7,sourceSurvives:true});
      this.add({art:'alchemy',motion:'ward',owner:e.id,follow:e.target,from:to.clone(),tick:e.tick,seconds:e.durationTicks*this.tickMs/1000,width:1.35,startFrame:4,endFrame:6,alpha:.34,sourceSurvives:true});
    }else if(e.t==='compass_guard'&&from){
      this.add({art:'lantern',motion:'ward',owner:e.source,follow:e.id,from:from.clone(),tick:e.tick,seconds:(e.untilTick-e.tick)*this.tickMs/1000,width:1.9,alpha:.48,serial:e.serial,sourceSurvives:true});
    }else if(e.t==='compass_guard_end'){
      for(const s of this.slots)if(s.layer?.serial===e.serial)this.release(s);
    }else if(e.t==='sand_compass'){
      this.charges.delete(e.id);
      const a=offsetToWorld(e.from.x,e.from.y,1,0,0),b=offsetToWorld(e.toward.x,e.toward.y,1,0,0);
      const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy)||1,r=e.radius*Math.sqrt(3),d={x:dx/n,y:dy/n};
      const origin=this.logical(a),end=this.logical({x:a.x+d.x*r,y:a.y+d.y*r});
      const left=this.logical({x:a.x-d.y*r,y:a.y+d.x*r}),right=this.logical({x:a.x+d.y*r,y:a.y-d.x*r});
      this.add({art:'sand',motion:'burst',owner:e.id,from:origin,tick:e.tick,seconds:1.15,
        width:Math.hypot(left.x-right.x,left.y-right.y)/this.cell,height:Math.hypot(end.x-origin.x,end.y-origin.y)/this.cell*1.35,
        angle:Math.atan2(end.y-origin.y,end.x-origin.x)*180/Math.PI-90,anchorY:.2,alpha:.82});
    }else if(e.t==='rope_swing'&&from){
      this.charges.delete(e.id);
      this.ropes.set(e.id,{from:e.from,edge:e.edge,startTick:e.tick,hookTicks:e.hookTicks,endTick:e.tick+e.durationTicks,nextShot:0,intervalTicks:1,shotsRemaining:0,skillId:'rope_shadow_hunt',raw:0});
      this.add({art:'rope',motion:'grapple',owner:e.id,from:from.clone(),tick:e.tick,seconds:e.durationTicks*this.tickMs/1000,width:.55,height:.69});
      this.add({art:'rope',motion:'swing',owner:e.id,follow:e.id,from:from.clone(),tick:e.tick+e.hookTicks,seconds:(e.durationTicks-e.hookTicks)*this.tickMs/1000,width:2.2,startFrame:2,endFrame:7,alpha:.72});
    }else if(e.t==='rope_shot'){
      this.shots.push(e);
      const p=this.logical(e.from),q=this.logical(offsetToWorld(e.to.x,e.to.y,1,0,0));
      this.add({art:'rope',motion:'flash',owner:e.id,from:p,tick:e.tick,seconds:.24,width:.7,height:.8,angle:Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI,alpha:1});
    }else if(e.t==='rope_return'){
      this.ropes.delete(e.id);for(const s of this.slots)if(s.layer?.owner===e.id&&['swing','grapple'].includes(s.layer.motion))this.release(s);
    }
  }
  brewProgress(id:number,tick:number):number|null{
    const c=this.charges.get(id);return c&&tick<c.end&&this.unit(id)?.pendingCast?Math.max(0,Math.min(1,(tick-c.start)/(c.end-c.start))):null;
  }
  update(tick:number):void{
    this.lines.clear();if(this.disposed||this.ended)return;
    this.root.active=this.ready;if(!this.ready)return;
    for(const [id,c]of this.charges)if(tick>=c.end||!this.unit(id)?.pendingCast)this.charges.delete(id);
    for(const u of this.units())if(u.alive&&u.hp>0&&u.lanternGuard&&!this.slots.some(s=>s.layer?.motion==='passive'&&s.layer.owner===u.id)){
      const p=this.owner(u.id)?.position;
      if(p)this.add({art:'lantern',motion:'passive',owner:u.id,follow:u.id,from:p.clone(),tick,seconds:Infinity,width:2});
    }
    for(const slot of this.slots){
      const l=slot.layer;if(!l)continue;
      const age=(tick-l.tick)*this.tickMs/1000,p=age/l.seconds,u=this.unit(l.owner);
      if(p>=1||(l.follow!==undefined&&!this.unit(l.follow)?.alive)||(l.target!==undefined&&!this.unit(l.target)?.alive)
        ||(!l.sourceSurvives&&!u?.alive)||(l.motion==='charge'&&u?.pendingCast?.skillId!==l.skill)
        ||(l.art==='wind'&&l.motion==='ward'&&!u?.windHuntActive)){this.release(slot);continue;}
      if(p<0){slot.node.active=false;continue;}
      const frames=this.frames.get(l.art);if(!frames){slot.node.active=false;continue;}
      const from=l.follow===undefined?l.from:this.owner(l.follow)?.position;
      if(!from){this.release(slot);continue;}
      let x=from.x,y=from.y,alpha=l.alpha??1,angle=l.angle??0;
      if(l.motion==='grapple'){
        const r=this.ropes.get(l.owner);if(!r){this.release(slot);continue;}
        const head=this.hookPoint(r,tick),a=this.logical(offsetToWorld(r.from.x,r.from.y,1,0,0));
        x=head.x;y=head.y;angle=Math.atan2(y-a.y-this.cell*.25,x-a.x)*180/Math.PI-90;
      }
      if(l.motion==='flask'){
        const to=this.owner(l.target!)?.position;if(!to){this.release(slot);continue;}
        x=l.from.x+(to.x-l.from.x)*p;y=l.from.y+(to.y-l.from.y)*p+Math.sin(p*Math.PI)*this.cell*.7+this.cell*.25;
      }
      if(l.motion==='ward'){
        if(l.art==='fox'){alpha*=1-p;y-=this.cell*.12;}else if(l.art==='alchemy')y-=this.cell*.12;
      }
      if(l.motion==='passive')alpha=.22+Math.max(0,Math.min(1,u?.missingHealthFraction??0))*.6;
      let cel=(l.startFrame??0)+Math.min(.9999,p)*((l.endFrame??7)-(l.startFrame??0));
      if(l.motion==='ward'||l.motion==='passive'){
        const low=l.startFrame??3,high=l.endFrame??5;
        cel=age<.55?Math.min(low,age/.55*low):low+(high-low)*(.5-.5*Math.cos((age-.55)*2.8));
        if(l.art==='alchemy')cel=Math.max(4,cel);
      }
      const index=Math.min(7,Math.floor(cel)),blend=cel-index;
      const fixed=l.motion==='flash'?this.shotFrame:l.motion==='grapple'?this.hookFrame:null;
      slot.frame=index;slot.sprites[0].spriteFrame=fixed??frames[index];
      slot.sprites[1].spriteFrame=fixed??frames[Math.min(7,index+1)];
      slot.blends[0].opacity=Math.round((1-blend)*255);slot.blends[1].opacity=Math.round(blend*255);
      slot.node.active=!!slot.sprites[0].spriteFrame;slot.node.setPosition(x,y,0);slot.node.angle=angle;
      const scale=l.motion==='charge'?.7+p*.3:l.motion==='flash'?.7+p*.6:1;
      slot.node.setScale(scale,scale,1);
      const fade=l.motion==='passive'?Math.min(1,age*5):Math.min(1,age*8,(1-p)*8);
      slot.opacity.opacity=Math.round(255*alpha*Math.max(0,fade));
    }
    this.drawTethers(tick);
  }
  private hookPoint(r:RopeHuntRuntime,tick:number):Vec3 {
    const a=this.logical(offsetToWorld(r.from.x,r.from.y,1,0,0)),b=this.logical(offsetToWorld(r.edge.x,r.edge.y,1,0,0));
    const p=ropeHuntHookProgress(r,tick),eased=1-(1-p)**2;
    return new Vec3(a.x+(b.x-a.x)*eased,a.y+(b.y-a.y)*eased+this.cell*(.25+Math.sin(p*Math.PI)*.2),0);
  }
  private drawTethers(tick:number):void{
    if(!this.ready)return;
    const g=this.lines;
    for(const [id,r]of this.ropes){
      if(tick>=r.endTick){this.ropes.delete(id);continue;}
      const p=this.owner(id)?.position;if(!p)continue;
      const edge=this.hookPoint(r,tick);
      const hand={x:p.x,y:p.y+this.cell*.25},mid={x:(edge.x+hand.x)/2,y:(edge.y+hand.y)/2-this.cell*.12};
      // A dark braid remains readable on the bright sand floor and beneath the painted wake.
      for(const [width,color]of [[5,new Color(55,41,27,255)],[2.2,new Color(255,225,162,255)]] as const){
        g.lineWidth=width;g.strokeColor=color;g.moveTo(edge.x,edge.y);g.quadraticCurveTo(mid.x,mid.y,hand.x,hand.y);g.stroke();
      }
      const a=this.logical(offsetToWorld(r.from.x,r.from.y,1,0,0)),dx=edge.x-a.x,dy=edge.y-a.y-this.cell*.25,n=Math.hypot(dx,dy)||1;
      const ux=dx/n,uy=dy/n,hook=this.cell*.13;
      for(const [width,color]of [[5,new Color(40,39,32,255)],[2.5,new Color(255,226,164,255)]] as const){
        g.lineWidth=width;g.strokeColor=color;
        g.moveTo(edge.x-ux*hook,edge.y-uy*hook);g.lineTo(edge.x+ux*hook,edge.y+uy*hook);
        g.moveTo(edge.x-uy*hook,edge.y+ux*hook);g.quadraticCurveTo(edge.x-ux*hook*1.2,edge.y-uy*hook*1.2,edge.x+uy*hook,edge.y-ux*hook);g.stroke();
      }
    }
    this.shots=this.shots.filter(s=>tick-s.tick<(s.flightTicks??4));
    for(const s of this.shots){
      const p=Math.max(0,(tick-s.tick)/(s.flightTicks??4)),a=this.logical(s.from),b=this.logical(offsetToWorld(s.to.x,s.to.y,1,0,0));
      const x=a.x+(b.x-a.x)*p,y=a.y+(b.y-a.y)*p+this.cell*.25;
      g.lineWidth=2.5;g.strokeColor=new Color(255,239,184,235);g.moveTo(x-(b.x-a.x)*.14,y-(b.y-a.y)*.14);g.lineTo(x,y);g.stroke();
    }
  }
  private release(slot:Slot):void{slot.layer=undefined;slot.node.active=false;slot.opacity.opacity=0;}
  clear():void{for(const slot of this.slots)this.release(slot);this.ropes.clear();this.shots=[];this.charges.clear();this.lines.clear();}
  destroy():void{
    this.disposed=true;this.clear();for(const frames of this.frames.values())for(const f of frames)f.destroy();this.frames.clear();
    this.shotFrame?.destroy();this.shotFrame=null;if(this.root.isValid)this.root.destroy();this.slots=[];
    this.hookFrame?.destroy();this.hookFrame=null;
  }
}
