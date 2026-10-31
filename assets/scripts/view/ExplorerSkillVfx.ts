import { Node, Graphics, Color, UITransform, Vec3 } from 'cc';
import type { BattleEvent, Pos, RopeHuntRuntime } from '../battle/types';
import { offsetToWorld } from '../battle/HexMath';
import { ropeHuntPoint, ropeHuntHookProgress } from '../battle/RopeHunt';

type Burst = Extract<BattleEvent,{t:'sand_compass'}>;
type Shot = Extract<BattleEvent,{t:'rope_shot'}>;
/** All movement, shield and projectile visuals are driven by the replay clock. */
export class ExplorerSkillVfx {
  private root:Node;
  private graphics:Graphics;
  private guards=new Map<number,{target:number;end:number}>();
  private charges=new Map<number,{start:number;end:number}>();
  private ropes=new Map<number,RopeHuntRuntime>();
  private bursts:Burst[]=[];
  private shots:Shot[]=[];
  private auras=new Map<number,{node:Node;g:Graphics}>();
  private ended=false;
  constructor(parent:Node,private cell:number,private tickMs:number,
    private owner:(id:number)=>Node|undefined,private logical:(p:Pos)=>Vec3,private casting:(id:number)=>boolean){
    this.root=new Node('explorerSkillVfx');parent.addChild(this.root);this.root.layer=parent.layer;
    this.root.addComponent(UITransform);this.graphics=this.root.addComponent(Graphics);
  }
  setVisible(visible:boolean):void {
    this.root.active=visible;for(const aura of this.auras.values())aura.node.active=visible;
  }
  play(e:BattleEvent):void{
    if(this.ended)return;
    if(e.t==='cast'&&['sand_compass','rope_shadow_hunt'].includes(e.skillId))
      this.charges.set(e.id,{start:e.tick,end:e.tick+Math.max(1,Math.round((e.duration??0)*1000/this.tickMs))});
    if(e.t==='compass_guard')this.guards.set(e.serial,{target:e.id,end:e.untilTick});
    if(e.t==='compass_guard_end')this.guards.delete(e.serial);
    if(e.t==='sand_compass'){this.charges.delete(e.id);this.bursts.push(e);}
    if(e.t==='rope_swing'){
      this.charges.delete(e.id);
      this.ropes.set(e.id,{from:e.from,edge:e.edge,startTick:e.tick,hookTicks:e.hookTicks,endTick:e.tick+e.durationTicks,
        nextShot:0,intervalTicks:1,shotsRemaining:0,skillId:'rope_shadow_hunt',raw:0});
    }
    if(e.t==='rope_shot')this.shots.push(e);
    if(e.t==='rope_return')this.ropes.delete(e.id);
    if(e.t==='death'){
      this.charges.delete(e.id);this.ropes.delete(e.id);
      for(const [key,guard]of this.guards)if(guard.target===e.id)this.guards.delete(key);
    }
    if(e.t==='end')this.clear();
  }
  update(tick:number):void{
    const g=this.graphics;g.clear();for(const a of this.auras.values())a.g.clear();
    if(this.ended)return;
    for(const [id,charge]of this.charges){
      if(tick>=charge.end||!this.casting(id)){this.charges.delete(id);continue;}
      const a=this.aura(id);if(!a)continue;
      const p=(tick-charge.start)/(charge.end-charge.start),r=this.cell*(.2+p*.35);
      a.lineWidth=3;a.strokeColor=new Color(255,220,142,230);a.ellipse(0,-this.cell*.36,r,r*.38);a.stroke();
      for(let n=0;n<4;n++){
        const angle=n*Math.PI/2+p*Math.PI/2,x=Math.cos(angle)*r,y=-this.cell*.36+Math.sin(angle)*r*.38;
        a.moveTo(x-4,y);a.lineTo(x,y+6);a.lineTo(x+4,y);a.stroke();
      }
      this.compass(a,0,this.cell*.48,this.cell*(.18+p*.12),p*Math.PI,Math.round(160+p*95));
    }
    const targets=new Set<number>();
    for(const [serial,guard]of this.guards){if(tick>=guard.end)this.guards.delete(serial);else targets.add(guard.target);}
    for(const id of targets){
      const a=this.aura(id);if(!a)continue;
      const pulse=1+Math.sin(tick*this.tickMs/240)*.02,w=this.cell*.56*pulse,h=this.cell*.72;
      a.lineWidth=3;a.strokeColor=new Color(255,215,132,220);a.fillColor=new Color(229,187,104,20);
      a.moveTo(-w,h*.7);a.lineTo(0,h);a.lineTo(w,h*.7);a.lineTo(w*.82,-h*.35);a.lineTo(0,-h*.6);a.lineTo(-w*.82,-h*.35);a.close();a.fill();a.stroke();
      a.strokeColor=new Color(107,224,203,190);a.ellipse(0,-this.cell*.37,w,this.cell*.17);a.stroke();
      this.compass(a,0,h*.52,this.cell*.19,tick*this.tickMs/2600,210);
    }
    this.bursts=this.bursts.filter(e=>(tick-e.tick)*this.tickMs<900);
    for(const e of this.bursts){
      const age=(tick-e.tick)*this.tickMs/900,from=offsetToWorld(e.from.x,e.from.y,1,0,0),to=offsetToWorld(e.toward.x,e.toward.y,1,0,0);
      const angle=Math.atan2(to.y-from.y,to.x-from.x),r=e.radius*Math.sqrt(3)*Math.min(1,age*2.5+.08),alpha=Math.round(220*Math.sin(Math.PI*Math.min(1,age)));
      const centre=this.logical(from),points=Array.from({length:33},(_,n)=>{
        const a=angle-Math.PI/2+n*Math.PI/32;return this.logical({x:from.x+Math.cos(a)*r,y:from.y+Math.sin(a)*r});
      });
      g.moveTo(centre.x,centre.y);for(const p of points)g.lineTo(p.x,p.y);g.close();
      g.fillColor=new Color(220,181,102,Math.round(alpha*.25));g.fill();
      g.lineWidth=4;g.strokeColor=new Color(255,221,147,alpha);g.moveTo(points[0].x,points[0].y);
      for(const p of points.slice(1))g.lineTo(p.x,p.y);g.stroke();
      for(let n=0;n<points.length;n+=4){const p=points[n];g.fillColor=new Color(255,232,179,alpha);g.circle(p.x,p.y,2.5);g.fill();}
      // Parallel sand fronts reveal the full half-circle instead of reading as a thin border.
      for(const ratio of [.52,.78]){
        g.lineWidth=2;g.strokeColor=new Color(238,196,116,Math.round(alpha*.65));
        for(let n=0;n<=24;n++){
          const a=angle-Math.PI/2+n*Math.PI/24,p=this.logical({x:from.x+Math.cos(a)*r*ratio,y:from.y+Math.sin(a)*r*ratio});
          if(n===0)g.moveTo(p.x,p.y);else g.lineTo(p.x,p.y);
        }g.stroke();
      }
      for(let n=0;n<18;n++){
        const a=angle-Math.PI/2+(n+.5)*Math.PI/18,rad=r*(.38+(n%3)*.21);
        const p=this.logical({x:from.x+Math.cos(a)*rad,y:from.y+Math.sin(a)*rad});
        g.fillColor=new Color(255,230,174,Math.round(alpha*.8));g.circle(p.x,p.y,1.5+n%2);g.fill();
      }
    }
    for(const [id,state]of this.ropes){
      if(tick>=state.endTick){this.ropes.delete(id);continue;}
      const p=this.owner(id)?.position??this.logical(ropeHuntPoint(state,tick));
      const edge=this.logical(offsetToWorld(state.edge.x,state.edge.y,1,0,0)),origin=this.logical(offsetToWorld(state.from.x,state.from.y,1,0,0));
      const flight=ropeHuntHookProgress(state,tick),eased=1-(1-flight)**2;
      edge.x=origin.x+(edge.x-origin.x)*eased;edge.y=origin.y+(edge.y-origin.y)*eased+this.cell*(.25+Math.sin(flight*Math.PI)*.2);
      const hand={x:p.x,y:p.y+this.cell*.25},mid={x:(edge.x+hand.x)/2,y:(edge.y+hand.y)/2-this.cell*.15};
      g.lineWidth=4;g.strokeColor=new Color(83,64,39,230);g.moveTo(edge.x,edge.y);g.quadraticCurveTo(mid.x,mid.y,hand.x,hand.y);g.stroke();
      g.lineWidth=1.5;g.strokeColor=new Color(240,211,156,255);g.moveTo(edge.x,edge.y);g.quadraticCurveTo(mid.x,mid.y,hand.x,hand.y);g.stroke();
      // Three-pronged grappling hook, with an arc wake behind the swinging carrier.
      g.lineWidth=2.5;g.strokeColor=new Color(248,224,169,255);
      g.moveTo(edge.x,edge.y-9);g.lineTo(edge.x,edge.y+9);g.stroke();
      g.moveTo(edge.x-9,edge.y+4);g.quadraticCurveTo(edge.x-8,edge.y-10,edge.x,edge.y-5);
      g.quadraticCurveTo(edge.x+8,edge.y-10,edge.x+9,edge.y+4);g.stroke();
      const trailTicks=Math.round(400/this.tickMs);
      for(let n=1;n<=7;n++){
        const t=tick-n*trailTicks/7;if(t<state.startTick+state.hookTicks)continue;
        const q=this.logical(ropeHuntPoint(state,t));
        g.fillColor=new Color(125,214,209,Math.round(145*(1-n/8)));g.ellipse(q.x,q.y-this.cell*.22,this.cell*.18,this.cell*.07);g.fill();
      }
    }
    this.shots=this.shots.filter(e=>tick-e.tick<(e.flightTicks??4));
    for(const shot of this.shots){
      const p=Math.max(0,Math.min(1,(tick-shot.tick)/(shot.flightTicks??4))),from=this.logical(shot.from),to=this.logical(offsetToWorld(shot.to.x,shot.to.y,1,0,0));
      from.y+=this.cell*.25;to.y+=this.cell*.25;
      const x=from.x+(to.x-from.x)*p,y=from.y+(to.y-from.y)*p;
      g.lineWidth=3;g.strokeColor=new Color(255,224,152,240);g.moveTo(x-(to.x-from.x)*.13,y-(to.y-from.y)*.13);g.lineTo(x,y);g.stroke();
      g.fillColor=new Color(255,246,218,255);g.circle(x,y,3);g.fill();
      if(p<.55){
        const r=this.cell*(.09+(1-p)*.1),alpha=Math.round(255*(1-p/.55));
        this.compass(g,from.x,from.y,r,Math.atan2(to.y-from.y,to.x-from.x),alpha);
      }
      if(p>.7){
        const alpha=Math.round(240*(p-.7)/.3),r=this.cell*(.08+p*.09);
        g.strokeColor=new Color(255,225,163,alpha);g.lineWidth=2;
        for(let n=0;n<5;n++){const a=n*Math.PI*2/5;g.moveTo(to.x+Math.cos(a)*r*.35,to.y+Math.sin(a)*r*.35);g.lineTo(to.x+Math.cos(a)*r,to.y+Math.sin(a)*r);g.stroke();}
      }
    }
  }
  private compass(g:Graphics,x:number,y:number,r:number,angle:number,alpha:number):void{
    g.lineWidth=2;g.strokeColor=new Color(255,221,147,alpha);g.circle(x,y,r);g.stroke();
    for(let n=0;n<4;n++){
      const a=angle+n*Math.PI/2,dx=Math.cos(a),dy=Math.sin(a),w=r*.2;
      g.fillColor=new Color(n%2?102:255,n%2?218:233,n%2?205:175,alpha);
      g.moveTo(x+dx*r*1.35,y+dy*r*1.35);g.lineTo(x-dy*w,y+dx*w);g.lineTo(x-dx*r*.3,y-dy*r*.3);g.lineTo(x+dy*w,y-dx*w);g.close();g.fill();
    }
  }
  clear():void{
    this.ended=true;this.guards.clear();this.charges.clear();this.ropes.clear();this.bursts=[];this.shots=[];this.graphics.clear();
    for(const a of this.auras.values())if(a.node.isValid){a.g.clear();a.node.active=false;}
  }
  destroy():void{this.clear();for(const a of this.auras.values())if(a.node.isValid)a.node.destroy();this.auras.clear();if(this.root.isValid)this.root.destroy();}
  private aura(id:number):Graphics|undefined{
    const owner=this.owner(id);if(!owner?.isValid)return;
    let a=this.auras.get(id);
    if(!a){const node=new Node(`expeditionGuard_${id}`);owner.addChild(node);node.layer=owner.layer;node.addComponent(UITransform).setContentSize(this.cell*2,this.cell*2);a={node,g:node.addComponent(Graphics)};this.auras.set(id,a);}
    a.node.active=true;return a.g;
  }
}
