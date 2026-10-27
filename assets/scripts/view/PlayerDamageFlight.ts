import { _decorator, Component, Node, UITransform, Sprite, SpriteFrame, Texture2D, Rect, Size, Vec3, UIOpacity, BlockInputEvents, Label, Color, resources } from 'cc';
import { FX_SPRITE } from './ArtPaths';

const { ccclass } = _decorator;
interface Orb { node:Node; sprite:Sprite; opacity:UIOpacity }
const clamp=(n:number)=>Math.max(0,Math.min(1,n));

/** Cosmetic settlement only. Health is already committed by RunSession before this starts. */
@ccclass('PlayerDamageFlight')
export class PlayerDamageFlight extends Component {
  private frames:SpriteFrame[]=[];
  private sparks:Orb[]=[];
  private core:Orb|null=null;
  private number:Label|null=null;
  private elapsed=0;
  private waiting=0;
  private stopped=false;
  private impacted=false;
  private sources:Vec3[]=[];
  private gather=new Vec3();
  private target:(()=>Vec3)|null=null;
  private impact:(()=>void)|null=null;
  private finish:(()=>void)|null=null;

  static preload():void { resources.load(FX_SPRITE.playerDamage.replace('/spriteFrame','/texture'),Texture2D,()=>{}); }
  play(sources:Vec3[],target:()=>Vec3,damage:number,impact:()=>void,finish:()=>void):void {
    this.sources=sources.map(p=>p.clone());this.target=target;this.impact=impact;this.finish=finish;
    this.node.addComponent(BlockInputEvents);
    const bounds=this.node.getComponent(UITransform)!.contentSize;
    if(this.sources.length){
      for(const p of this.sources){this.gather.x+=p.x/this.sources.length;this.gather.y+=p.y/this.sources.length;}
      this.gather.y=Math.min(bounds.height/2-115,this.gather.y+42);
    }
    this.gather.x=Math.max(-bounds.width/2+100,Math.min(bounds.width/2-100,this.gather.x));
    this.sparks=this.sources.map((_,i)=>this.orb(`enemyDamageEnergy_${i}`,70));
    this.core=this.orb('playerDamageOrb',110);
    const text=new Node('playerDamageNumber');text.layer=this.node.layer;this.node.addChild(text);
    text.addComponent(UITransform).setContentSize(150,52);text.addComponent(UIOpacity).opacity=0;
    this.number=text.addComponent(Label);this.number.string=`−${damage}`;this.number.fontSize=36;this.number.lineHeight=44;
    this.number.isBold=true;this.number.color=new Color(255,132,119);text.active=false;
    resources.load(FX_SPRITE.playerDamage.replace('/spriteFrame','/texture'),Texture2D,(error,texture)=>{
      if(this.stopped||!this.isValid)return;
      if(error){this.complete();return;}
      const w=texture.width/4,h=texture.height/2;
      for(let i=0;i<8;i++){
        const f=new SpriteFrame();f.texture=texture;f.rect=new Rect(i%4*w,Math.floor(i/4)*h,w,h);f.originalSize=new Size(w,h);this.frames.push(f);
      }
    });
  }
  private orb(name:string,size:number):Orb {
    const node=new Node(name);node.layer=this.node.layer;this.node.addChild(node);node.addComponent(UITransform).setContentSize(size,size);
    const sprite=node.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
    const opacity=node.addComponent(UIOpacity);node.active=false;return {node,sprite,opacity};
  }
  private draw(orb:Orb,point:Vec3,cel:number,size:number,alpha=1,angle=0):void {
    // Cel five contains a leftward tail; register its bright head on the actual flight path.
    const head=cel===4?32*size:0,radians=angle*Math.PI/180;
    orb.node.active=true;orb.node.setPosition(point.x-Math.cos(radians)*head,point.y-Math.sin(radians)*head,0);orb.node.setScale(size,size,1);orb.node.angle=angle;
    orb.sprite.spriteFrame=this.frames[Math.max(0,Math.min(7,Math.floor(cel)))];orb.opacity.opacity=Math.round(clamp(alpha)*255);
  }
  private point(a:Vec3,b:Vec3,t:number,bend:number):Vec3 {
    const u=1-t;return new Vec3(u*u*a.x+2*u*t*((a.x+b.x)/2+bend)+t*t*b.x,
      u*u*a.y+2*u*t*((a.y+b.y)/2+Math.abs(bend)*.6)+t*t*b.y,0);
  }
  update(dt:number):void {
    if(this.stopped||!this.target||!this.core)return;
    const delta=Number.isFinite(dt)?Math.max(0,dt):0;
    if(!this.frames.length){this.waiting+=delta;if(this.waiting>=2)this.complete();return;}
    this.elapsed+=delta;const t=this.elapsed,to=this.target();
    for(let i=0;i<this.sparks.length;i++){
      const orb=this.sparks[i],age=t-Math.min(i*.035,.2),p=clamp((age-.15)/.62);
      if(age<0||age>.77){orb.node.active=false;continue;}
      const pos=this.point(this.sources[i],this.gather,p,(i%2?1:-1)*(25+i*3));
      this.draw(orb,pos,Math.min(3,age/.77*4),.65+.25*p,Math.min(1,age*10)*(1-p*.3));
    }
    if(t<.96){
      this.draw(this.core,this.gather,Math.min(3,t/.96*4),.25+clamp(t/.96)*.8,clamp((t-.18)*3));
    }else if(t<1.58){
      const p=clamp((t-.96)/.62),pos=this.point(this.gather,to,p,45);
      this.draw(this.core,pos,4,.92,1,Math.atan2(to.y-this.gather.y,to.x-this.gather.x)*180/Math.PI);
    }else{
      this.applyImpact();const p=clamp((t-1.58)/.52);
      this.draw(this.core,to,5+p*3,.7+p*.2,1-p);
      if(this.number){
        this.number.node.active=true;this.number.node.setPosition(to.x-30,to.y-35+p*22,0);
        this.number.node.getComponent(UIOpacity)!.opacity=Math.round((1-p)*255);
      }
    }
    if(t>=2.1)this.complete();
  }
  private applyImpact():void {if(this.impacted)return;this.impacted=true;const callback=this.impact;this.impact=null;callback?.();}
  private complete():void {
    if(this.stopped)return;this.applyImpact();const callback=this.finish;this.finish=null;this.cancel();
    callback?.();if(this.node.isValid)this.node.destroy();
  }
  cancel():void {
    this.stopped=true;this.impact=null;this.finish=null;this.target=null;
    for(const frame of this.frames)frame.destroy();this.frames=[];
    for(const orb of this.sparks)if(orb.node.isValid)orb.node.destroy();this.sparks=[];
    if(this.core?.node.isValid)this.core.node.destroy();this.core=null;
    if(this.number?.node.isValid)this.number.node.destroy();this.number=null;
  }
  onDestroy():void {this.cancel();}
}
