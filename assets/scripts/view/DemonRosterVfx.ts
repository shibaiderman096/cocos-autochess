import {Node,UITransform,Sprite,SpriteFrame,Texture2D,UIOpacity,Rect,Size,Vec3,resources} from 'cc';
import type {BattleEvent,Pos} from '../battle/types';
import {FX_SPRITE} from './ArtPaths';

type Atlas='redhornFervor'|'hellhoundBreath'|'abyssVerdict'|'infernalAxe'|'ravenTheft'|'demonGunfire'|'thornPull';
interface Effect {
  key:string;id:number;atlas:Atlas;row:number;start:number;end:number;size:number;height?:number;
  point?:Pos;from?:Pos;angle?:number;anchor?:number;loop?:boolean;charge?:string;alpha?:number;
  tetherTarget?:number;
}
interface Slot { node:Node;sprites:Sprite[];blends:UIOpacity[];opacity:UIOpacity;key?:string;used:boolean }
const ASSETS:Record<string,Atlas>={redhorn_fervor:'redhornFervor',hellhound_breath:'hellhoundBreath',abyss_verdict:'abyssVerdict',infernal_axe_spin:'infernalAxe',raven_soul_theft:'ravenTheft',infernal_gunfire:'demonGunfire',thornchain_pull:'thornPull'};

/** Painted demon spells, pooled and driven entirely by the shared simulation clock. */
export class DemonRosterVfx {
  private root:Node;
  private frames=new Map<Atlas,SpriteFrame[]>();
  private effects=new Map<string,Effect>();
  private slots:Slot[]=[];
  private ended=false;
  private disposed=false;
  private lastTick=0;
  private serial=0;
  constructor(parent:Node,private cell:number,private tickMs:number,private owner:(id:number)=>Node|undefined,
    private cellPoint:(point:Pos)=>Vec3,private casting:(id:number,skillId:string)=>boolean,assets:Atlas[]){
    this.root=new Node('demonRosterPaintedVfx');parent.addChild(this.root);this.root.layer=parent.layer;this.root.addComponent(UITransform);
    for(const asset of new Set(assets))resources.load(FX_SPRITE[asset].replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||this.ended||!this.root.isValid)return;
      const w=texture.width/4,h=texture.height/3,frames:SpriteFrame[]=[];
      for(let i=0;i<12;i++){
        const frame=new SpriteFrame();frame.texture=texture;frame.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);frame.originalSize=new Size(w,h);frames.push(frame);
      }
      this.frames.set(asset,frames);this.update(this.lastTick);
    });
  }
  static asset(skillId:string):Atlas|undefined{return ASSETS[skillId];}
  get ravenReady():boolean{return this.frames.has('ravenTheft');}
  private add(id:number,tick:number,atlas:Atlas,row:number,seconds:number,size:number,extra:Partial<Effect>={}):void {
    const effect:Effect={key:`${id}:${tick}:${this.serial++}`,id,start:tick,end:tick+seconds*1000/this.tickMs,atlas,row,size,...extra};
    this.effects.set(effect.key,effect);
  }
  private angle(from:Pos,to:Pos):number {
    const a=this.cellPoint(from),b=this.cellPoint(to);return Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  }
  play(e:BattleEvent):void {
    if(this.ended||this.disposed)return;
    if(e.t==='cast'){
      const asset=ASSETS[e.skillId??''];if(asset)this.add(e.id,e.tick,asset,0,e.duration??.4,1.9,{key:`charge:${e.id}`,charge:e.skillId});
    }
    if(e.t==='demon_fervor'){
      this.effects.delete(`charge:${e.id}`);this.add(e.id,e.tick,'redhornFervor',1,.5,2.6);
      this.add(e.id,e.tick,'redhornFervor',2,(e.untilTick-e.tick)*this.tickMs/1000,2,{key:`fervor:${e.id}`,loop:true,alpha:.9});
    }
    if(e.t==='hellhound_breath'){
      this.effects.delete(`charge:${e.id}`);
      this.add(e.id,e.tick,'hellhoundBreath',1,.65,(e.radius+.7)/(.6875),{point:e.from,angle:this.angle(e.from,e.toward),anchor:40/256,height:2});
    }
    if(e.t==='demon_burn')this.add(e.id,e.tick,'hellhoundBreath',2,(e.untilTick-e.tick)*this.tickMs/1000,1.65,
      {key:`burn:${e.source}:${e.id}`,loop:true,alpha:.78});
    if(e.t==='abyss_verdict'){
      this.effects.delete(`charge:${e.id}`);
      this.add(e.id,e.tick,'abyssVerdict',1,.6,2.7,{point:e.to,angle:this.angle(e.from,e.to)+45});
    }
    if(e.t==='abyss_siphon')this.add(e.id,e.tick,'abyssVerdict',2,.65,1.65,{from:e.from});
    if(e.t==='infernal_spin'){
      this.effects.delete(`charge:${e.id}`);
      this.add(e.id,e.tick,'infernalAxe',1,e.durationTicks*this.tickMs/1000,(e.radius*2+1)*1.4,
        {key:`spin:${e.id}`,point:e.center,height:(e.radius*2+1),angle:this.angle(e.center,e.toward)});
    }
    if(e.t==='infernal_spin_end')this.effects.delete(`spin:${e.id}`);
    if(e.t==='infernal_spin_heal')this.add(e.id,e.tick,'infernalAxe',2,.5,1.35,{from:e.from});
    if(e.t==='raven_flight'){
      this.effects.delete(`charge:${e.id}`);
      this.add(e.id,e.tick,'ravenTheft',1,e.durationTicks*this.tickMs/1000,2,{key:`raven:${e.id}`,angle:this.angle(e.from,e.to),loop:true});
    }
    if(e.t==='raven_end'){
      this.effects.delete(`raven:${e.id}`);this.add(e.id,e.tick,'ravenTheft',2,.5,2.1,{point:e.to});
    }
    if(e.t==='raven_theft')this.add(e.id,e.tick,'ravenTheft',2,.65,1.35,{from:e.from});
    if(e.t==='demon_gunfire'){
      this.effects.delete(`charge:${e.id}`);
      this.add(e.id,e.tick,'demonGunfire',0,e.durationTicks*this.tickMs/1000,1.6,{key:`gunfire:${e.id}`,loop:true,alpha:.6});
    }
    if(e.t==='demon_gunfire_end')this.effects.delete(`gunfire:${e.id}`);
    if(e.t==='demon_volley'){
      const angle=this.angle(e.from,e.to),spread=Math.min(.4,.035*Math.max(0,e.count-1));
      for(let i=0;i<e.count;i++){
        const start=e.tick+(e.count>1?i*spread/(e.count-1):0)*1000/this.tickMs;
        this.add(e.id,start,'demonGunfire',1,.14,1.2,{point:e.from,angle});
        this.add(e.id,start,'demonGunfire',2,.22,1.25,{point:e.to,from:e.from,angle,anchor:216/256,height:.7});
      }
    }
    if(e.t==='thorn_whip'){
      this.effects.delete(`charge:${e.id}`);
      const a=this.cellPoint(e.from),b=this.cellPoint(e.to),size=Math.hypot(b.x-a.x,b.y-a.y)/this.cell/(176/256);
      this.add(e.id,e.tick,'thornPull',1,.3,size,{tetherTarget:e.target,angle:this.angle(e.from,e.to),anchor:40/256,height:1.5});
      this.add(e.target,e.tick,'thornPull',2,.55,1.7);
    }
    if(e.t==='death'){
      for(const [key,effect]of this.effects)if(effect.id===e.id)this.effects.delete(key);
      this.update(this.lastTick);
    }
    if(e.t==='end'){this.ended=true;this.clear();}
  }
  private paint(effect:Effect,position:Vec3,phase:number,alpha:number):void {
    const frames=this.frames.get(effect.atlas);if(!frames)return;
    let slot=this.slots.find(s=>s.key===effect.key)??this.slots.find(s=>s.key===undefined);
    if(!slot){
      if(this.slots.length>=192)return;
      const node=new Node('demonSpellCel');this.root.addChild(node);node.layer=this.root.layer;node.addComponent(UITransform);
      const sprites:Sprite[]=[],blends:UIOpacity[]=[];
      for(let i=0;i<2;i++){
        const cel=new Node('paintedCel');node.addChild(cel);cel.layer=node.layer;cel.addComponent(UITransform);
        const sprite=cel.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        sprites.push(sprite);blends.push(cel.addComponent(UIOpacity));
      }
      slot={node,sprites,blends,opacity:node.addComponent(UIOpacity),used:false};this.slots.push(slot);
    }
    slot.key=effect.key;slot.used=true;
    const frameIndex=effect.loop?Math.max(0,phase)%4:Math.max(0,Math.min(3,phase)),index=Math.floor(frameIndex),blend=frameIndex-index,next=effect.loop?(index+1)%4:Math.min(3,index+1);
    for(let i=0;i<2;i++){
      const transform=slot.sprites[i].node.getComponent(UITransform)!;
      transform.setAnchorPoint(effect.anchor??.5,.5);transform.setContentSize(effect.size*this.cell,(effect.height??effect.size)*this.cell);
      const frame=frames[effect.row*4+(i?next:index)];if(slot.sprites[i].spriteFrame!==frame)slot.sprites[i].spriteFrame=frame;
      slot.blends[i].opacity=Math.round(255*(i?blend:1-blend));
    }
    slot.node.setPosition(position);slot.node.angle=effect.angle??0;slot.node.active=true;slot.opacity.opacity=Math.round(255*alpha);
  }
  update(tick:number):void {
    this.lastTick=tick;if(this.disposed||this.ended)return;
    for(const slot of this.slots)slot.used=false;
    for(const [key,effect]of this.effects){
      if(tick>=effect.end||(effect.charge&&!this.casting(effect.id,effect.charge))){this.effects.delete(key);continue;}
      if(tick<effect.start)continue;
      const node=this.owner(effect.id),position=effect.point?this.cellPoint(effect.point):node?.isValid?node.position.clone():undefined;
      if(!position)continue;
      if(effect.tetherTarget!==undefined){
        const target=this.owner(effect.tetherTarget);
        if(target?.isValid){
          const dx=target.position.x-position.x,dy=target.position.y-position.y;
          effect.size=Math.hypot(dx,dy)/this.cell/(176/256);effect.angle=Math.atan2(dy,dx)*180/Math.PI;
        }
      }
      const progress=Math.max(0,Math.min(1,(tick-effect.start)/(effect.end-effect.start)));
      if(effect.from)Vec3.lerp(position,this.cellPoint(effect.from),position,Math.min(1,progress*1.6));
      if(!effect.point)position.y+=this.cell*.3;
      if(effect.point&&((effect.atlas==='demonGunfire'&&effect.row>0)||(effect.atlas==='hellhoundBreath'&&effect.row===1)))position.y+=this.cell*.4;
      const phase=effect.loop?((tick-effect.start)*this.tickMs/250)%4:progress*3;
      const alpha=Math.min(1,progress*12)*Math.min(1,(1-progress)*(effect.loop?16:5))*(effect.alpha??1);
      this.paint(effect,position,phase,alpha);
    }
    for(const slot of this.slots)if(!slot.used){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
  }
  clear():void {
    this.effects.clear();for(const slot of this.slots){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
    if(this.root.isValid)this.root.active=false;
  }
  destroy():void {
    this.disposed=true;this.clear();for(const slot of this.slots)for(const sprite of slot.sprites)sprite.spriteFrame=null;
    if(this.root.isValid)this.root.destroy();for(const frames of this.frames.values())for(const frame of frames)frame.destroy();
    this.frames.clear();this.slots=[];
  }
}
