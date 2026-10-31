import { Node, Sprite, SpriteFrame, UIOpacity, UITransform, Vec3 } from 'cc';
import type { BattleEvent } from '../battle/types';
import { FX_SPRITE } from './ArtPaths';
import { loadArtSprite } from './ArtSpriteLoader';

interface Motion {
  source: number; start: number; duration: number; travel?: number;
  from: Vec3; to: Vec3; rush: boolean; trail: boolean;
}
interface Slot extends AnimatedSprite { path: string; firstFrame: number; motion?: Motion }
interface AnimatedSprite { node: Node; sprite: Sprite; frames: (SpriteFrame | undefined)[]; frameIndex: number }
interface MoonSlot extends AnimatedSprite { source: number; start: number; flightTicks:number; from: Vec3; to: Vec3; active: boolean }
interface NebulaSlot extends AnimatedSprite { start: number; duration: number; active: boolean; gravity: boolean; source: number }

/** Painted effects only. Damage, displacement and control are owned by BattleSim. */
export class AstralUnitVfx {
  private slots: Slot[] = [];
  private moonSlots: MoonSlot[] = [];
  private nebulaSlots: NebulaSlot[] = [];
  private groundRoot?: Node;
  private ended = false;
  private disposed = false;
  constructor(private root: Node, private cell: number, private tickMs: number,
    private project: (x:number,y:number)=>Vec3, private owner: (id:number)=>Node|undefined,
    private skill: (id:number)=>string|undefined) {}

  private animatedSprite(parent: Node, name: string, path: string, width: number, height: number,
    columns = 4, rows = 2, firstFrame = 0): AnimatedSprite {
    const node = new Node(name); parent.addChild(node); node.layer = this.root.layer;
    node.addComponent(UITransform).setContentSize(width, height); node.addComponent(UIOpacity);
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
    const animation: AnimatedSprite = { node, sprite, frames: [], frameIndex: 0 };
    for (let i = 0; i < 8; i++) loadArtSprite(`${path}#${firstFrame + i},${columns},${rows}`, (err, frame) => {
      if (err || !frame || this.disposed || !node.isValid) return;
      animation.frames[i] = frame;
      // Loading while paused must display the requested phase, never an older callback's frame.
      if (animation.frameIndex === i) sprite.spriteFrame = frame;
    });
    return animation;
  }

  private frame(slot: AnimatedSprite, index: number): void {
    slot.frameIndex = index;
    slot.sprite.spriteFrame = slot.frames[index] ?? null;
  }

  private moonArrow(source: number, tick: number, from: Vec3, to: Vec3,flightTicks=240/this.tickMs): void {
    let slot = this.moonSlots.find(s=>!s.active);
    if (!slot) {
      if (this.moonSlots.length >= 24 || !this.root.isValid) return;
      slot = Object.assign(this.animatedSprite(this.root, 'moonArcArrow', FX_SPRITE.moonArrowSheet, this.cell*1.7, this.cell*1.1),
        {source, start:tick, flightTicks,from, to, active:false}); this.moonSlots.push(slot);
    }
    Object.assign(slot,{source,start:tick,flightTicks,from:from.clone(),to:to.clone(),active:true});
    slot.node.active = false;
  }

  private nebula(e: Extract<BattleEvent,{t:'nebula'|'gravity_field'}>): void {
    const gravity=e.t==='gravity_field';
    if(gravity)for(const s of this.nebulaSlots)if(s.gravity&&s.source===e.id){s.active=false;s.node.active=false;}
    let slot=this.nebulaSlots.find(s=>!s.active&&s.gravity===gravity);
    if(!slot){
      if(this.nebulaSlots.length>=16||!this.root.isValid)return;
      if(!this.groundRoot){
        this.groundRoot=new Node('astralGroundFields');
        this.groundRoot.layer=this.root.layer;
        const board=this.root.parent,units=board?.getChildByName('units');
        (units&&board?board:this.root).addChild(this.groundRoot);
        if(units)this.groundRoot.setSiblingIndex(units.getSiblingIndex());
      }
      slot=Object.assign(this.animatedSprite(this.groundRoot,gravity?'gravityCollapse':'nebulaTide',
        gravity?FX_SPRITE.gravityCollapseSheet:FX_SPRITE.nebulaTideSheet,this.cell*3.4,this.cell*2.1),
        {start:e.tick,duration:e.durationTicks,active:false,gravity,source:e.id});this.nebulaSlots.push(slot);
    }
    Object.assign(slot,{start:e.tick,duration:e.durationTicks,active:true,source:e.id});
    slot.node.setPosition(this.project(e.center.x,e.center.y));slot.node.setScale(e.radius,e.radius,1);slot.node.active=false;
  }

  private add(path: string, name: string, from: Vec3, to: Vec3, source: number, tick: number,
    seconds: number, width: number, height: number, trail=false, travel?: number, firstFrame = 0): void {
    if(this.ended||this.disposed||!this.root.isValid)return;
    let slot=this.slots.find(s=>s.path===path&&s.firstFrame===firstFrame&&!s.motion);
    if(!slot){
      if(this.slots.length>=24)return;
      slot=Object.assign(this.animatedSprite(this.root,name,path,width*this.cell,height*this.cell,4,4,firstFrame),{path,firstFrame});
      this.slots.push(slot);
    }
    slot.sprite.node.getComponent(UITransform)!.setContentSize(width*this.cell,height*this.cell);
    slot.motion={source,start:tick,duration:seconds*1000/this.tickMs,from:from.clone(),to:to.clone(),
      trail,rush:travel!==undefined,travel};
    slot.sprite.node.active=false;
  }

  play(e: BattleEvent): void {
    if(e.t==='end'){this.clear();this.ended=true;return;}
    if(e.t==='death'){this.cancel(e.id);return;}
    if(this.ended||this.disposed)return;
    if(e.t==='nebula'||e.t==='gravity_field')this.nebula(e);
    if(e.t==='moon_arrow') {
      this.moonArrow(e.id,e.tick,this.project(e.from.x,e.from.y),this.project(e.to.x,e.to.y),e.flightTicks);
    }else if(e.t==='attack'&&this.skill(e.id)==='moon_triple_arrow') {
      const from=this.owner(e.id)?.position,to=this.owner(e.target)?.position;
      if(from&&to)this.moonArrow(e.id,e.tick,from,to);
    }
    if(e.t==='dash'&&this.skill(e.id)==='stellar_bulwark'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      this.add(FX_SPRITE.stellarSkillSheet,'stellarRush',from,to,e.id,e.tick,
        e.durationTicks*this.tickMs/1000+.18,2.1,.84,true,e.durationTicks,8);
    }else if(e.t==='dash'&&this.skill(e.id)==='milu_star_leap'){
      this.add(FX_SPRITE.miluSkillSheet,'miluStarTrail',this.project(e.from.x,e.from.y),this.project(e.to.x,e.to.y),e.id,e.tick,
        e.durationTicks*this.tickMs/1000+.16,1.8,.9,true,e.durationTicks);
    }else if(e.t==='dash_stop'){
      this.cancel(e.id);
    }else if(e.t==='teleport'){
      if(this.skill(e.id)==='stellar_bulwark'){this.cancel(e.id);return;}
    }else if(e.t==='skill_impact'&&e.skillId==='milu_star_leap'){
      const target=this.owner(e.target)?.position;
      if(target)this.add(FX_SPRITE.miluSkillSheet,'miluStarImpact',target,target,e.id,e.tick,.42,1.2,1.2,false,undefined,8);
    }
  }

  update(tick: number): void {
    if(this.disposed)return;
    for(const s of this.nebulaSlots){
      if(!s.active)continue;
      const p=(tick-s.start)/s.duration;
      if(p>=1){s.active=false;s.node.active=false;continue;}
      s.node.active=p>=0;
      this.frame(s,Math.floor(Math.max(0,tick-s.start)*this.tickMs/1000*12)%8);
      if(s.gravity){const owner=this.owner(s.source);if(owner)s.node.setPosition(owner.position);}
      s.node.getComponent(UIOpacity)!.opacity=Math.round(210*Math.min(1,Math.max(0,p)*12,(1-p)*12)*(1+.1*Math.sin(p*Math.PI*12)));
    }
    for (const s of this.moonSlots) {
      if (!s.active) continue;
      const p=(tick-s.start)/s.flightTicks,n=s.node;
      if(p>=1){s.active=false;n.active=false;continue;}
      n.active=p>=0;if(p<0)continue;
      this.frame(s,Math.min(7,Math.floor(p*8)));
      const dx=s.to.x-s.from.x,dy=s.to.y-s.from.y;
      n.angle=Math.atan2(dy,dx)*180/Math.PI;
      n.setPosition(s.from.x+dx*p,s.from.y+dy*p+this.cell*.2,0);
      n.getComponent(UIOpacity)!.opacity=Math.round(255*Math.min(1,(1-p)*3));
    }
    for(const slot of this.slots){
      const m=slot.motion;if(!m)continue;
      const p=(tick-m.start)/m.duration,node=slot.sprite.node;
      if(p>=1){slot.motion=undefined;node.active=false;continue;}
      node.active=p>=0;if(p<0)continue;
      this.frame(slot,Math.min(7,Math.floor(p*8)));
      const dx=m.to.x-m.from.x,dy=m.to.y-m.from.y,length=Math.hypot(dx,dy)||1;
      node.angle=m.trail?Math.atan2(dy,dx)*180/Math.PI:Math.sin(p*Math.PI)*12;
      if(m.rush){
        const travel=Math.min(1,(tick-m.start)/m.travel!);
        node.setPosition(m.from.x+dx*travel-dx/length*this.cell*.38,m.from.y+dy*travel-dy/length*this.cell*.38+this.cell*.12,0);
      }else if(m.trail)node.setPosition((m.from.x+m.to.x)/2,(m.from.y+m.to.y)/2+Math.sin(p*Math.PI)*this.cell*.1,0);
      else node.setPosition(m.to.x,m.to.y+this.cell*.18,0);
      const size=m.trail?(.85+Math.sin(p*Math.PI)*.2):(.45+Math.sin(p*Math.PI*.8)*.8);
      node.setScale(size,size,1);
      node.getComponent(UIOpacity)!.opacity=Math.round((m.rush?200:230)*Math.min(1,(1-p)*2.4));
    }
  }

  cancel(source: number): void {
    for(const s of this.nebulaSlots)if(s.gravity&&s.source===source){s.active=false;s.node.active=false;}
    for(const slot of this.slots)if(slot.motion?.source===source){slot.motion=undefined;slot.sprite.node.active=false;}
  }
  clear(): void {
    for(const s of this.nebulaSlots){s.active=false;s.node.active=false;}
    for(const s of this.moonSlots){s.active=false;s.node.active=false;}
    for(const slot of this.slots){slot.motion=undefined;slot.sprite.node.active=false;}
  }
  destroy(): void {this.disposed=true;this.clear();for(const s of this.slots)s.sprite.node.destroy();this.slots=[];
    for(const s of this.moonSlots)s.node.destroy();this.moonSlots=[];
    for(const s of this.nebulaSlots)s.node.destroy();this.nebulaSlots=[];this.groundRoot?.destroy();this.groundRoot=undefined;}
}
