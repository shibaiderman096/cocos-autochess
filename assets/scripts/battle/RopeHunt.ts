import { configuredSkillDamage, SkillConfigData } from '../core/ConfigManager';
import { hexDist, offsetToWorld } from './HexMath';
import type { BattleEvent, Pos, RopeHuntRuntime } from './types';
import type { Unit } from './Unit';

/** The carrier waits for the hook to latch, reels toward the edge, then swings home. */
export function ropeHuntPoint(state: RopeHuntRuntime, tick: number): Pos {
  const a=offsetToWorld(state.from.x,state.from.y,1,0,0),b=offsetToWorld(state.edge.x,state.edge.y,1,0,0);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  const launch=state.startTick+state.hookTicks;
  const t=Math.max(0,Math.min(1,(tick-launch)/Math.max(1,state.endTick-launch)));
  const out=(1-Math.cos(t*Math.PI*2))/2,bend=Math.sin(t*Math.PI*2)*Math.min(length*.25,.8);
  return {x:a.x+dx*out-dy/length*bend,y:a.y+dy*out+dx/length*bend};
}
export function ropeHuntHookProgress(state:RopeHuntRuntime,tick:number):number {
  return Math.max(0,Math.min(1,(tick-state.startTick)/Math.max(1,state.hookTicks)));
}
/** Prefer distant diagonal anchors; deterministic ties keep replays identical. */
export function ropeHuntEdge(from:Pos,width:number,height:number):Pos|undefined {
  const a=offsetToWorld(from.x,from.y,1,0,0);
  const candidates=Array.from({length:width*height},(_,i)=>({x:i%width,y:Math.floor(i/width)}))
    .filter(p=>(p.x===0||p.y===0||p.x===width-1||p.y===height-1)&&hexDist(p,from)>0)
    .map(p=>{const b=offsetToWorld(p.x,p.y,1,0,0),dx=b.x-a.x,dy=b.y-a.y;return {p,dx,dy,length:Math.hypot(dx,dy)};});
  const diagonal=candidates.filter(c=>Math.min(Math.abs(c.dx),Math.abs(c.dy))/c.length>=Math.sin(Math.PI/9));
  return (diagonal.length?diagonal:candidates).sort((a,b)=>b.length-a.length||a.p.y-b.p.y||a.p.x-b.p.x)[0]?.p;
}
interface Host {
  units: Unit[];events: BattleEvent[];now():number;width():number;height():number;
  targetable(unit:Unit):boolean;damage(source:Unit,target:Unit,raw:number,skillId:string):void;
}
export class RopeHunt {
  constructor(private host:Host,private tickMs:number) {}
  start(source:Unit,skill:SkillConfigData):void {
    const edge=ropeHuntEdge(source.pos,this.host.width(),this.host.height());
    if(!edge)return;
    const spec=skill.ropeHunt!,tick=this.host.now(),durationTicks=Math.max(1,Math.round(spec.durationSeconds*1000/this.tickMs));
    const intervalTicks=Math.max(1,Math.round(spec.intervalSeconds*1000/this.tickMs));
    // Hook flight occupies the first firing interval and retains the authored total duration/shot schedule.
    const hookTicks=Math.min(intervalTicks,Math.max(0,durationTicks-1));
    source.ropeHunt={from:source.pos,edge,startTick:tick,hookTicks,endTick:tick+durationTicks,nextShot:tick+intervalTicks,
      intervalTicks,shotsRemaining:spec.shotCount,skillId:skill.id,raw:configuredSkillDamage(skill,source.star,source.skillScale)};
    this.host.events.push({t:'rope_swing',tick,id:source.id,from:source.pos,edge,hookTicks,durationTicks});
  }
  busy(unit:Unit):boolean {return !!unit.ropeHunt;}
  update():void {
    const tick=this.host.now();
    for(const source of this.host.units){
      const state=source.ropeHunt;if(!state)continue;
      if(!source.alive||source.hp<=0){source.ropeHunt=null;continue;}
      if(tick<source.stunnedUntilTick||tick<source.fearUntilTick){this.stop(source);continue;}
      const p=ropeHuntPoint(state,tick),cell=this.freeCells(source).sort((a,b)=>this.distance(a,p)-this.distance(b,p)||a.y-b.y||a.x-b.x)[0];
      if(cell){source.x=cell.x;source.y=cell.y;}
      while(tick>=state.nextShot&&state.shotsRemaining>0&&state.nextShot<=state.endTick){
        const enemy=this.host.units.filter(e=>e.side!==source.side&&e.hp>0&&this.host.targetable(e)&&source.canSelectEnemy(e))
          .sort((a,b)=>a.hp/a.cfg.hp-b.hp/b.cfg.hp||hexDist(source.pos,a.pos)-hexDist(source.pos,b.pos)||a.id-b.id)[0];
        if(enemy){
          this.host.events.push({t:'rope_shot',tick,id:source.id,target:enemy.id,from:p,to:enemy.pos});
          this.host.damage(source,enemy,state.raw,state.skillId);
        }
        state.shotsRemaining--;state.nextShot+=state.intervalTicks;
      }
      if(tick>=state.endTick)this.stop(source);
    }
  }
  stop(source:Unit):void {
    const state=source.ropeHunt;if(!state)return;
    source.ropeHunt=null;
    if(!source.alive||source.hp<=0)return;
    const to=this.freeCells(source).sort((a,b)=>hexDist(a,state.from)-hexDist(b,state.from)||a.y-b.y||a.x-b.x)[0]??source.pos;
    source.x=to.x;source.y=to.y;
    this.host.events.push({t:'rope_return',tick:this.host.now(),id:source.id,to});
  }
  clear():void {for(const unit of this.host.units)this.stop(unit);}
  private cells():Pos[]{return Array.from({length:this.host.width()*this.host.height()},(_,i)=>({x:i%this.host.width(),y:Math.floor(i/this.host.width())}));}
  private freeCells(source:Unit):Pos[]{return this.cells().filter(p=>!this.host.units.some(u=>u!==source&&u.alive&&u.hp>0&&u.x===p.x&&u.y===p.y));}
  private distance(cell:Pos,point:Pos):number{const p=offsetToWorld(cell.x,cell.y,1,0,0);return (p.x-point.x)**2+(p.y-point.y)**2;}
}
