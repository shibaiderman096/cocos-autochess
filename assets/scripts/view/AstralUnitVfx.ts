import { Node, Sprite, UIOpacity, UITransform, Vec3 } from 'cc';
import type { BattleEvent } from '../battle/types';
import { astralSprite } from './AstralArt';
import { FX_SPRITE } from './ArtPaths';

interface Motion {
  source: number; start: number; duration: number; travel?: number;
  from: Vec3; to: Vec3; rush: boolean; trail: boolean;
}
interface Slot { sprite: Sprite; path: string; motion?: Motion }

/** Painted effects only. Damage, displacement and control are owned by BattleSim. */
export class AstralUnitVfx {
  private slots: Slot[] = [];
  private ended = false;
  private disposed = false;
  constructor(private root: Node, private cell: number, private tickMs: number,
    private project: (x:number,y:number)=>Vec3, private owner: (id:number)=>Node|undefined,
    private skill: (id:number)=>string|undefined) {}

  private add(path: string, name: string, from: Vec3, to: Vec3, source: number, tick: number,
    seconds: number, width: number, height: number, trail=false, travel?: number): void {
    if(this.ended||this.disposed||!this.root.isValid)return;
    let slot=this.slots.find(s=>s.path===path&&!s.motion);
    if(!slot){
      if(this.slots.length>=24)return;
      slot={path,sprite:astralSprite(this.root,name,path,width*this.cell,height*this.cell,()=>!this.disposed)};
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
    if(e.t==='dash'&&this.skill(e.id)==='stellar_bulwark'){
      const from=this.project(e.from.x,e.from.y),to=this.project(e.to.x,e.to.y);
      this.add(FX_SPRITE.stellarRush,'stellarRush',from,to,e.id,e.tick,
        e.durationTicks*this.tickMs/1000+.18,2.1,.84,true,e.durationTicks);
    }else if(e.t==='teleport'){
      if(this.skill(e.id)==='stellar_bulwark'){this.cancel(e.id);return;}
      if(this.skill(e.id)!=='milu_star_leap')return;
      this.add(FX_SPRITE.miluStarTrail,'miluStarTrail',this.project(e.from.x,e.from.y),this.project(e.to.x,e.to.y),e.id,e.tick,.36,1.8,.9,true);
    }else if(e.t==='skill_impact'&&e.skillId==='milu_star_leap'){
      const target=this.owner(e.target)?.position;
      if(target)this.add(FX_SPRITE.miluStarImpact,'miluStarImpact',target,target,e.id,e.tick,.42,1.2,1.2);
    }
  }

  update(tick: number): void {
    if(this.disposed)return;
    for(const slot of this.slots){
      const m=slot.motion;if(!m)continue;
      const p=(tick-m.start)/m.duration,node=slot.sprite.node;
      if(p>=1){slot.motion=undefined;node.active=false;continue;}
      node.active=p>=0;if(p<0)continue;
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
    for(const slot of this.slots)if(slot.motion?.source===source){slot.motion=undefined;slot.sprite.node.active=false;}
  }
  clear(): void { for(const slot of this.slots){slot.motion=undefined;slot.sprite.node.active=false;} }
  destroy(): void {this.disposed=true;this.clear();for(const s of this.slots)s.sprite.node.destroy();this.slots=[];}
}
