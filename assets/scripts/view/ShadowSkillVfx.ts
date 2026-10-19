import { Node, Sprite, SpriteFrame, UITransform, UIOpacity, Vec3, Color, resources } from 'cc';
import type { ShadowPulseEffect } from '../battle/types';
import { FX_SPRITE } from './ArtPaths';

type Motion = 'burst' | 'travel' | 'orbit' | 'shield' | 'slash' | 'collapse' | 'ghost';
interface Layer {
  path: string; motion: Motion; from: Vec3; to?: Vec3; start: number; seconds: number;
  width: number; height: number; angle?: number; spin?: number; opacity?: number;
  follow?: number; phase?: number; tag?: string; tint?: Color;
}
interface Slot { node: Node; sprite: Sprite; opacity: UIOpacity; lease: number; layer?: Layer }
const MAX_LAYERS = 160;

/** Cosmetic timelines follow the replay clock, including pause, stepping and playback speed. */
export class ShadowSkillVfx {
  private slots: Slot[] = [];
  private frames = new Map<string, SpriteFrame>();
  constructor(private root: Node, private cell: number, private tickMs: number, private unitNode: (id: number) => Node | undefined) {}

  private add(layer: Layer): void {
    if (!this.root.isValid) return;
    let slot = this.slots.find(item => !item.layer);
    if (!slot) {
      if (this.slots.length >= MAX_LAYERS) return;
      const node = new Node('shadowSkillVfx'); this.root.addChild(node);
      node.addComponent(UITransform);
      const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      slot = { node, sprite, opacity: node.addComponent(UIOpacity), lease: 0 }; this.slots.push(slot);
    }
    const current = slot, lease = ++current.lease;
    current.layer = layer; current.node.active = false; current.node.angle = 0;
    current.node.setScale(1, 1, 1); current.node.setPosition(layer.from);
    current.sprite.color = layer.tint ?? new Color(255,255,255); current.sprite.spriteFrame = null;
    current.opacity.opacity = 0;
    current.node.getComponent(UITransform)!.setContentSize(this.cell * layer.width, this.cell * layer.height);
    const frame = this.frames.get(layer.path);
    if (frame) current.sprite.spriteFrame = frame;
    else resources.load(layer.path, SpriteFrame, (error, loaded) => {
      if (error || !this.root.isValid || !current.node.isValid) return;
      this.frames.set(layer.path, loaded);
      if (current.lease === lease && current.layer === layer) current.sprite.spriteFrame = loaded;
    });
  }

  private ring(pos: Vec3, tick: number, size: number, seconds = .65, delay = 0, collapse = false): void {
    this.add({ path: FX_SPRITE.shadowCorruption, motion: collapse ? 'collapse' : 'burst', from: pos.clone(),
      start: tick + delay * 1000 / this.tickMs, seconds, width: size, height: size * .62, spin: collapse ? -100 : 40, opacity: 175 });
  }
  private slash(from: Vec3, pos: Vec3, tick: number, large = false, tilt = 0): void {
    const angle = Math.atan2(pos.y - from.y, pos.x - from.x) * 180 / Math.PI;
    this.add({ path: FX_SPRITE.shadowSlash, motion: 'slash', from: pos.clone(), start: tick, seconds: large ? .55 : .32,
      width: large ? 2.8 : 1.8, height: large ? 1.4 : .9, angle: angle + 90 + tilt, spin: large ? 30 : -45,
      opacity: 230 });
  }
  private bolt(from: Vec3, to: Vec3, tick: number, large = false, delay = 0): void {
    this.add({ path: FX_SPRITE.shadowProjectile, motion: 'travel', from: from.clone(), to: to.clone(),
      start: tick + delay * 1000 / this.tickMs, seconds: large ? .22 : .32, width: large ? 2.2 : 1.6, height: large ? .85 : .5,
      angle: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI, opacity: large ? 255 : 200 });
  }

  charge(owner: number, pos: Vec3, tick: number, seconds: number): void {
    this.add({ path: FX_SPRITE.shadowCorruption, motion: 'collapse', from: pos.clone(), start: tick,
      seconds: Math.max(.1, seconds), width: 1.7, height: 1, follow: owner, spin: 100, opacity: 150 });
  }
  basicMelee(from: Vec3, target: Vec3, tick: number): void {
    this.add({path:FX_SPRITE.shadowSlash,motion:'slash',from:target.clone(),start:tick,seconds:.22,
      width:1.2,height:.6,angle:Math.atan2(target.y-from.y,target.x-from.x)*180/Math.PI+90,spin:22,opacity:225});
  }
  teleport(owner: number, path: string | undefined, from: Vec3, to: Vec3, tick: number): void {
    if (!path) return;
    for (const fraction of [0,.35,.7]) {
      const pos = from.clone(); Vec3.lerp(pos, from, to, fraction);
      this.add({ path, motion: 'ghost', from: pos, start: tick, seconds: .38 - fraction * .12,
        width: .85, height: 1.15, tint: new Color(160,100,230), opacity: 125 });
    }
    this.ring(to,tick,1,.35);
  }
  boardPulse(tick: number, width: number): void {
    this.add({ path: FX_SPRITE.shadowCorruption, motion: 'burst', from: new Vec3(), start: tick,
      seconds: .45, width: width * 1.05, height: width * .62, opacity: 65 });
  }

  play(effect: ShadowPulseEffect, owner: number, from: Vec3, pos: Vec3, tick: number, radius: number, duration = 0, selfCast?: boolean): void {
    const self = selfCast ?? Math.hypot(pos.x-from.x,pos.y-from.y) < this.cell * .2;
    switch (effect) {
      case 'bulwark':
        this.cancel(owner,'shield');
        this.add({path:FX_SPRITE.shadowBarrier,motion:'shield',from:pos.clone(),start:tick,seconds:duration||4,
          width:1.3,height:1.65,follow:owner,tag:'shield',opacity:145});this.ring(pos,tick,1.7);break;
      case 'bulwarkBurst': this.cancel(owner,'shield');this.ring(pos,tick,2*radius+1,.7);this.ring(pos,tick,2,.4,.1);break;
      case 'domain':
        this.cancel(owner,'domain');
        for(let i=0;i<3;i++)this.add({path:FX_SPRITE.shadowLantern,motion:'orbit',from:pos.clone(),start:tick,seconds:duration||4,
          width:.45,height:.6,follow:owner,phase:i*Math.PI*2/3,tag:'domain',opacity:210});break;
      case 'piercing': this.bolt(from,pos,tick);this.bolt(from,pos,tick,false,.07);this.ring(pos,tick,.9,.4,.2);break;
      case 'flurry': this.slash(from,pos,tick,false,tick%2===0?-20:20);this.ring(pos,tick,.8,.3);break;
      case 'cleave': this.slash(from,pos,tick,true);this.ring(pos,tick,2.5,.55,.1);break;
      case 'empower':
        if(self){
          this.cancel(owner,'empower');
          for(let i=0;i<2;i++)this.add({path:FX_SPRITE.shadowProjectile,motion:'orbit',from:pos.clone(),start:tick,seconds:duration||6,
            width:.7,height:.25,follow:owner,phase:i*Math.PI,tag:'empower',opacity:190});
        }else{this.slash(from,pos,tick);this.ring(pos,tick,1,.35);}break;
      case 'flameBurst': this.cancel(owner,'empower');this.ring(pos,tick,2*radius+1,.75);this.slash(from,pos,tick,true);break;
      case 'execute': this.ring(pos,tick,1.5,.28,0,true);this.bolt(from,pos,tick,true);this.ring(pos,tick,2,.55,.16);break;
      case 'lanterns': {
        const high=pos.clone();high.y+=this.cell*1.6;
        this.add({path:FX_SPRITE.shadowLantern,motion:'travel',from:high,to:pos.clone(),start:tick,seconds:.25,width:1,height:1.3,opacity:245});
        this.ring(pos,tick,2*radius+1,.65,.18);this.ring(pos,tick,1.5,.5,.25);break;
      }
      case 'blackstars': {
        const high=pos.clone();high.y+=this.cell*3;
        this.bolt(high,pos,tick,true);this.ring(pos,tick,2*radius+1,.5,.12);break;
      }
      case 'collapse': this.ring(pos,tick,2*radius+1,.35,0,true);this.ring(pos,tick,2*radius+1,.8,.2);
        this.slash(from,pos,tick,true,45);this.slash(from,pos,tick,true,-45);break;
      case 'void': this.ring(pos,tick,1.5,.3,0,true);this.slash(from,pos,tick);break;
      case 'voidMark': this.ring(pos,tick,1.4,.25,0,true);this.ring(pos,tick,2,.55,.1);break;
    }
  }

  update(tick: number): void {
    for (const slot of this.slots) {
      const layer=slot.layer;if(!layer)continue;
      const age=(tick-layer.start)*this.tickMs/1000, p=age/layer.seconds;
      if(p>=1){this.release(slot);continue;}
      if(age<0){slot.node.active=false;continue;}
      const follow=layer.follow===undefined?undefined:this.unitNode(layer.follow);
      if(layer.follow!==undefined&&!follow?.isValid){this.release(slot);continue;}
      const base=follow?.position??layer.from;
      let x=base.x,y=base.y,scale=1,angle=layer.angle??0,alpha=layer.opacity??200;
      const ease=1-Math.pow(1-p,3);
      if(layer.motion==='travel'){
        const target=layer.to!;x=layer.from.x+(target.x-layer.from.x)*p;y=layer.from.y+(target.y-layer.from.y)*p;
        scale=.85+.2*p;alpha*=Math.min(1,(1-p)*5);
      }else if(layer.motion==='burst'){scale=.35+ease*.9;alpha*=Math.sin(Math.PI*Math.min(1,p*1.2))*(1-p*.6);
      }else if(layer.motion==='collapse'){scale=1.15-ease*.95;alpha*=Math.sin(Math.PI*p);
      }else if(layer.motion==='shield'){scale=Math.min(1,age/.18)*(.97+Math.sin(age*5)*.025);alpha*=Math.min(1,age/.14,(1-p)*12);y+=this.cell*.18;
      }else if(layer.motion==='orbit'){
        const phase=(layer.phase??0)+age*2.8;x+=Math.cos(phase)*this.cell*.75;y+=Math.sin(phase)*this.cell*.38+this.cell*.25;
        y+=Math.sin(age*5+(layer.phase??0))*this.cell*.06;angle+=Math.sin(age*3)*8;
        alpha*=Math.min(1,age/.12,(1-p)*10);
      }else if(layer.motion==='slash'){scale=.55+ease*.65;alpha*=Math.sin(Math.PI*Math.min(1,p*1.2));
      }else if(layer.motion==='ghost'){scale=1+p*.15;alpha*=1-p;}
      slot.node.active=!!slot.sprite.spriteFrame;slot.node.setPosition(x,y,0);slot.node.setScale(scale,scale,1);
      slot.node.angle=angle+(layer.spin??0)*p;slot.opacity.opacity=Math.max(0,Math.min(255,Math.round(alpha)));
    }
  }
  private release(slot: Slot): void {slot.layer=undefined;slot.lease++;slot.node.active=false;slot.opacity.opacity=0;}
  cancel(owner: number, tag?: string): void {
    for(const slot of this.slots)if(slot.layer?.follow===owner&&(!tag||slot.layer.tag===tag))this.release(slot);
  }
  clear(): void {for(const slot of this.slots)this.release(slot);}
  destroy(): void {this.clear();for(const slot of this.slots)if(slot.node.isValid)slot.node.destroy();this.slots=[];this.frames.clear();}
}
