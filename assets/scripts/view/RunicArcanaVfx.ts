import {Node,UITransform,Sprite,SpriteFrame,Texture2D,UIOpacity,Rect,Size,Vec3,resources} from 'cc';
import type {BattleEvent,Pos} from '../battle/types';
import {FX_SPRITE} from './ArtPaths';

type Charge={id:number;start:number;end:number;wave:boolean};
type Missiles=Extract<BattleEvent,{t:'runic_missiles'}>;
type Wave=Extract<BattleEvent,{t:'runic_wave'}>;
interface Slot {
  node:Node; sprites:Sprite[]; blends:UIOpacity[]; opacity:UIOpacity;
  key?:string; used:boolean; row:number; frameIndex:number;
}
const BEAM_START=40/256, ART_WIDTH=176/256, COMET_TIP=216/256;

/** Painted cels share the battle clock; interpolation and asset loading never settle damage. */
export class RunicArcanaVfx {
  private root:Node;
  private frames:SpriteFrame[]=[];
  private cores:SpriteFrame[]=[];
  private slots:Slot[]=[];
  private runes=new Map<number,number>();
  private charges=new Map<number,Charge>();
  private missiles:Missiles[]=[];
  private waves:Wave[]=[];
  private ended=false;
  private disposed=false;
  private lastTick=0;
  constructor(parent:Node,private cell:number,private tickMs:number,private owner:(id:number)=>Node|undefined,
    private cellPoint:(p:Pos)=>Vec3,private casting:(id:number)=>boolean,
    private lineEnd:(from:Pos,toward:Pos,length:number)=>Vec3){
    this.root=new Node('runicArcanaVfx');parent.addChild(this.root);this.root.layer=parent.layer;
    this.root.addComponent(UITransform);this.root.active=false;
    resources.load(FX_SPRITE.runicArcana.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(error||this.disposed||this.ended||!this.root.isValid)return;
      const w=texture.width/4,h=texture.height/4;
      for(let i=0;i<16;i++){
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);
        f.originalSize=new Size(w,h);this.frames.push(f);
      }
      // Use the painted ribbon itself for the bright core, independently of the emitter's tall seal.
      for(let i=0;i<4;i++){
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i*w+w*96/256,3*h+h*112/256,w*120/256,h*32/256);
        f.originalSize=new Size(w*120/256,h*32/256);this.cores.push(f);
      }
      this.update(this.lastTick);
    });
  }
  get ready():boolean{return this.frames.length===16;}
  play(e:BattleEvent):void {
    if(this.ended||this.disposed)return;
    if(e.t==='cast'&&e.skillId==='runic_arcana')
      this.charges.set(e.id,{id:e.id,start:e.tick,end:e.tick+(e.duration??.4)*1000/this.tickMs,wave:(e.duration??0)>1});
    if(e.t==='runic_runes'){if(e.count)this.runes.set(e.id,e.count);else this.runes.delete(e.id);}
    if(e.t==='runic_missiles'){this.charges.delete(e.id);this.missiles.push(e);}
    if(e.t==='runic_wave'){this.charges.delete(e.id);this.waves.push(e);}
    if(e.t==='death'){this.charges.delete(e.id);this.runes.delete(e.id);this.update(this.lastTick);}
    if(e.t==='end'){this.ended=true;this.clear();}
  }

  private paint(key:string,row:number,phase:number,x:number,y:number,width:number,height:number,
    alpha=1,angle=0,anchorX=.5,loop=false,core=false):void {
    if(!this.ready)return;
    let slot=this.slots.find(s=>s.key===key)??this.slots.find(s=>s.key===undefined);
    if(!slot){
      if(this.slots.length>=192)return;
      const node=new Node('runicPaintedSpell');this.root.addChild(node);node.layer=this.root.layer;
      node.addComponent(UITransform);const opacity=node.addComponent(UIOpacity);
      const sprites:Sprite[]=[],blends:UIOpacity[]=[];
      for(let i=0;i<2;i++){
        const cel=new Node('runicPaintedCel');node.addChild(cel);cel.layer=node.layer;cel.addComponent(UITransform);
        const sprite=cel.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        sprites.push(sprite);blends.push(cel.addComponent(UIOpacity));
      }
      slot={node,sprites,blends,opacity,used:false,row,frameIndex:0};this.slots.push(slot);
    }
    slot.key=key;slot.used=true;slot.row=row;
    const cel=loop?phase%4:Math.max(0,Math.min(3,phase)),index=Math.floor(cel),blend=cel-index;
    slot.frameIndex=row*4+index;
    const next=loop?(index+1)%4:Math.min(3,index+1);
    for(let i=0;i<2;i++){
      const transform=slot.sprites[i].node.getComponent(UITransform)!;
      transform.setAnchorPoint(anchorX,.5);transform.setContentSize(width,height);
      const frame=core?this.cores[i?next:index]:this.frames[row*4+(i?next:index)];
      if(slot.sprites[i].spriteFrame!==frame)slot.sprites[i].spriteFrame=frame;
      slot.blends[i].opacity=Math.round(255*(i?blend:1-blend));
    }
    slot.node.setPosition(x,y,0);slot.node.angle=angle;slot.node.active=true;
    slot.opacity.opacity=Math.round(255*Math.max(0,Math.min(1,alpha)));
  }

  update(tick:number):void {
    this.lastTick=tick;if(this.ended||this.disposed)return;
    this.root.active=this.ready;for(const slot of this.slots)slot.used=false;
    const seconds=tick*this.tickMs/1000;
    for(const [id,count]of this.runes){
      const owner=this.owner(id);if(!owner?.isValid)continue;const p=owner.position;
      for(let n=0;n<count;n++){
        const a=seconds*.9+n*Math.PI*2/3;
        this.paint(`rune:${id}:${n}`,1,seconds*3+n,p.x+Math.cos(a)*this.cell*.7,
          p.y+this.cell*(.5+Math.sin(a)*.28),this.cell*.7,this.cell*.7,.94,Math.sin(a)*8,.5,true);
      }
    }
    for(const [id,c]of this.charges){
      if(tick>=c.end||!this.casting(id)){this.charges.delete(id);continue;}
      const node=this.owner(id);if(!node?.isValid)continue;
      const p=node.position,progress=Math.max(0,Math.min(1,(tick-c.start)/(c.end-c.start)));
      const size=this.cell*((c.wave?2.5:1.65)+progress*.5);
      this.paint(`charge:${id}`,0,progress*3,p.x,p.y+this.cell*.45,size,size,.5+progress*.5);
    }
    this.missiles=this.missiles.filter(e=>(tick-e.tick)*this.tickMs<750);
    for(const e of this.missiles){
      const from=this.cellPoint(e.from),to=this.cellPoint(e.to),dx=to.x-from.x,dy=to.y-from.y;
      const len=Math.max(1,Math.hypot(dx,dy));
      for(let shot=0;shot<e.count;shot++){
        const flight=(e.flightTicks??8)*this.tickMs,stagger=(e.staggerTicks??1)*this.tickMs;
        const age=(tick-e.tick)*this.tickMs-shot*stagger;
        if(age<0||age>=flight+180)continue;
        const bend=(shot-1)*this.cell*.8;
        if(age<flight){
          const p=age/flight,curve=Math.sin(p*Math.PI);
          const x=from.x+dx*p-dy/len*curve*bend,y=from.y+dy*p+this.cell*.4+dx/len*curve*bend;
          const tangentX=dx-dy/len*Math.cos(p*Math.PI)*Math.PI*bend;
          const tangentY=dy+dx/len*Math.cos(p*Math.PI)*Math.PI*bend;
          this.paint(`missile:${e.id}:${e.tick}:${shot}`,2,Math.min(3,p*4),x,y,this.cell*1.45,this.cell*1.45,
            Math.min(1,age/60),Math.atan2(tangentY,tangentX)*180/Math.PI,COMET_TIP);
        }else{
          const p=(age-flight)/180,size=this.cell*(.75+p*.45);
          this.paint(`impact:${e.id}:${e.tick}:${shot}`,1,p*3,to.x,to.y+this.cell*.4,size,size,1-p,shot*35);
        }
      }
    }
    this.waves=this.waves.filter(e=>(tick-e.tick)*this.tickMs<900);
    for(const e of this.waves){
      const a=this.cellPoint(e.from),b=this.lineEnd(e.from,e.toward,e.length),dx=b.x-a.x,dy=b.y-a.y;
      const age=(tick-e.tick)*this.tickMs/1000,progress=Math.max(0,Math.min(1,age/.25));
      const length=Math.hypot(dx,dy)*progress,alpha=Math.min(1,age/.06)*Math.max(0,1-age/.9);
      this.paint(`wave:${e.id}:${e.tick}`,3,age/.9*3,a.x,a.y+this.cell*.4,length/ART_WIDTH,this.cell*e.width*4.4,
        alpha,Math.atan2(dy,dx)*180/Math.PI,BEAM_START);
      this.paint(`waveCore:${e.id}:${e.tick}`,3,age/.9*3,a.x,a.y+this.cell*.4,length,this.cell*e.width*.85,
        alpha*.9,Math.atan2(dy,dx)*180/Math.PI,0,false,true);
      if(age<.35)this.paint(`release:${e.id}:${e.tick}`,0,3,a.x,a.y+this.cell*.4,
        this.cell*2.5,this.cell*2.5,(1-age/.35)*.8);
    }
    for(const slot of this.slots)if(!slot.used){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
  }
  clear():void {
    this.runes.clear();this.charges.clear();this.missiles=[];this.waves=[];
    for(const slot of this.slots){slot.key=undefined;slot.node.active=false;slot.opacity.opacity=0;}
    if(this.root.isValid)this.root.active=false;
  }
  destroy():void {
    this.disposed=true;this.clear();
    for(const slot of this.slots)for(const sprite of slot.sprites)sprite.spriteFrame=null;
    if(this.root.isValid)this.root.destroy();
    for(const frame of [...this.frames,...this.cores])frame.destroy();this.frames=[];this.cores=[];this.slots=[];
  }
}
