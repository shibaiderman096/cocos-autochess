import { Node, Graphics, Color, UITransform } from 'cc';
import type { BattleEvent } from '../battle/types';

interface InspireMark { target: number; start: number; end: number; source: number }
interface Flight {
  source:number; target:number; start:number; kind:'star'|'vial';
  from:{x:number;y:number}; to:{x:number;y:number};
}

/** Compass and lantern effects follow the fixed replay clock, including pause and speed changes. */
export class ExplorerUnitVfx {
  private root: Node;
  private graphics: Graphics;
  private drawings = new Map<number,{node:Node;graphics:Graphics}>();
  private marks = new Map<string, InspireMark>();
  private doses: Array<{id:number;target:number;start:number;end:number}> = [];
  private flights: Flight[] = [];
  private brewing = new Map<number,{start:number;end:number}>();
  private ended = false;
  constructor(parent: Node, private cell: number, private tickMs: number,
    private owner: (id: number) => Node | undefined,
    private guards: () => { id: number; missing: number }[],
    private hunters: () => {id:number;active:boolean;windup:number|null}[] = ()=>[],
    private casting: (id:number)=>boolean = ()=>true) {
    this.root = new Node('explorerUnitVfx');
    parent.addChild(this.root);this.root.layer=parent.layer;this.root.addComponent(UITransform);
    this.graphics=this.root.addComponent(Graphics);
  }
  private drawing(id:number):Graphics|undefined {
    const owner=this.owner(id);if(!owner?.isValid)return;
    let drawing=this.drawings.get(id);
    if(!drawing){
      const node=new Node(`explorerAura_${id}`);owner.addChild(node);node.layer=owner.layer;
      node.addComponent(UITransform).setContentSize(this.cell*3,this.cell*3);
      drawing={node,graphics:node.addComponent(Graphics)};this.drawings.set(id,drawing);
    }
    drawing.node.active=true;return drawing.graphics;
  }
  setVisible(visible:boolean):void {
    this.root.active=visible;for(const drawing of this.drawings.values())drawing.node.active=visible;
  }
  play(e: BattleEvent): void {
    if(this.ended)return;
    if(e.t==='inspiration')for(const target of e.targets){
      this.marks.set(`${e.id}:${target}`,{target,source:e.id,start:e.tick,end:e.tick+e.durationTicks});
      if(target!==e.id)this.launch(e.id,target,e.tick,'star');
    }
    if(e.t==='cast'&&e.skillId==='wayward_corrosion')
      this.brewing.set(e.id,{start:e.tick,end:e.tick+Math.max(1,Math.round((e.duration??.4)*1000/this.tickMs))});
    if(e.t==='corrosion_dose'){
      this.brewing.delete(e.id);this.launch(e.id,e.target,e.tick,'vial');
      this.doses.push({id:e.id,target:e.target,start:e.tick,end:e.tick+e.durationTicks});
    }
    if(e.t==='death')for(const [key,mark]of this.marks)if(mark.target===e.id)this.marks.delete(key);
    if(e.t==='death'){
      this.doses=this.doses.filter(d=>d.target!==e.id);
      this.flights=this.flights.filter(f=>f.target!==e.id);this.brewing.delete(e.id);
    }
    if(e.t==='end')this.clear();
  }
  update(tick: number): void {
    this.graphics.clear();
    for(const drawing of this.drawings.values())drawing.graphics.clear();
    if(this.ended)return;
    for(const [key,mark]of this.marks){
      if(tick>=mark.end){this.marks.delete(key);continue;}
      const g=this.drawing(mark.target);if(!g)continue;const p={x:0,y:0};
      const remain=Math.max(0,Math.min(1,(mark.end-tick)/(mark.end-mark.start)));
      const age=Math.max(0,(tick-mark.start)*this.tickMs/1000);
      const radius=this.cell*(.48+Math.min(1,age*3)*.12),alpha=Math.round(235*remain);
      g.lineWidth=3;g.strokeColor=new Color(104,225,208,alpha);
      g.ellipse(p.x,p.y-this.cell*.38,radius,radius*.38);g.stroke();
      if(mark.source===mark.target){
        // A readable rotating compass opens the spell; its needle stays in the fading aura.
        g.strokeColor=new Color(255,229,163,alpha);g.lineWidth=2;
        g.ellipse(0,-this.cell*.38,radius*.78,radius*.3);g.stroke();
        const needle=age*.8,dx=Math.cos(needle)*radius*.65,dy=Math.sin(needle)*radius*.24;
        g.moveTo(-dx,-this.cell*.38-dy);g.lineTo(dx,-this.cell*.38+dy);g.stroke();
      }
      // Four clear compass points rather than a text label; retain a quiet ring as the buff fades.
      g.strokeColor=new Color(255,217,125,alpha);g.lineWidth=3;
      for(let n=0;n<4;n++){
        const a=n*Math.PI/2+age*.3,dx=Math.cos(a),dy=Math.sin(a)*.38;
        const x=p.x+dx*radius,y=p.y-this.cell*.38+dy*radius;
        g.moveTo(x-dy*6,y+dx*3);g.lineTo(x+dx*7,y+dy*7);g.lineTo(x+dy*6,y-dx*3);g.stroke();
      }
      const rise=(age*.7)%1,y=p.y+this.cell*(.35+rise*.25);
      g.strokeColor=new Color(255,227,155,Math.round(alpha*(1-rise)*.9));
      g.moveTo(p.x-6,y-4);g.lineTo(p.x,y+2);g.lineTo(p.x+6,y-4);g.stroke();
      if(mark.source===mark.target&&age<.65){
        g.strokeColor=new Color(255,222,145,Math.round(220*(1-age/.65)));
        g.ellipse(p.x,p.y-this.cell*.12,this.cell*(.2+age),this.cell*(.08+age*.38));g.stroke();
      }
    }
    for(const guard of this.guards()){
      const g=this.drawing(guard.id);if(!g)continue;const p={x:0,y:0};
      const amount=Math.max(0,Math.min(1,guard.missing)),pulse=1+Math.sin(tick*this.tickMs/400)*.025;
      const w=this.cell*(.44+amount*.08)*pulse,h=this.cell*1.1,y=p.y+this.cell*.18;
      g.lineWidth=2+amount*2;g.strokeColor=new Color(255,215,117,Math.round(90+amount*165));
      g.fillColor=new Color(255,198,74,Math.round(8+amount*28));
      g.moveTo(p.x-w,y+h*.36);g.lineTo(p.x,y+h*.49);g.lineTo(p.x+w,y+h*.36);
      g.lineTo(p.x+w*.85,y-h*.2);g.lineTo(p.x,y-h*.48);g.lineTo(p.x-w*.85,y-h*.2);g.close();g.fill();g.stroke();
      g.strokeColor=new Color(133,229,217,Math.round(65+amount*135));
      g.ellipse(p.x,p.y-this.cell*.38,this.cell*.6,this.cell*.2);g.stroke();
      if(amount>.05){
        g.fillColor=new Color(255,230,161,Math.round(90+amount*150));
        g.circle(p.x,y+h*.49,3+amount*2);g.fill();
      }
      // The lantern remains outside the face; its light grows as health is lost.
      const lx=-this.cell*.58,ly=this.cell*(.42+Math.sin(tick*this.tickMs/650)*.035),s=this.cell*.19;
      g.fillColor=new Color(255,203,93,Math.round(14+amount*40));g.circle(lx,ly,s*1.7);g.fill();
      g.strokeColor=new Color(255,224,155,Math.round(145+amount*100));g.lineWidth=2;
      g.moveTo(lx-s*.3,ly+s);g.bezierCurveTo(lx-s*.65,ly+s*2,lx+s*.65,ly+s*2,lx+s*.3,ly+s);g.stroke();
      g.fillColor=new Color(255,210,110,Math.round(70+amount*120));
      g.moveTo(lx-s*.65,ly+s*.8);g.lineTo(lx+s*.65,ly+s*.8);g.lineTo(lx+s*.5,ly-s);g.lineTo(lx-s*.5,ly-s);g.close();g.fill();g.stroke();
      g.moveTo(lx,ly+s*.8);g.lineTo(lx,ly-s);g.stroke();
      this.star(g,lx,ly,s*.48,new Color(255,249,209,240));
    }
    for(const hunter of this.hunters()){
      if(!hunter.active&&hunter.windup===null)continue;
      const g=this.drawing(hunter.id);if(!g)continue;
      const phase=tick*this.tickMs/1000,charge=hunter.windup??1;
      g.lineWidth=3;g.strokeColor=new Color(161,225,248,Math.round(170+charge*80));
      // Two broad flag ribbons curl around the carrier, with an open centre for the illustration.
      for(let ribbon=0;ribbon<2;ribbon++){
        const a=phase*2+ribbon*Math.PI,w=this.cell*(.62+charge*.15),y=this.cell*(.1+ribbon*.25);
        g.moveTo(-w,y+Math.sin(a)*7);
        g.bezierCurveTo(-w*.25,y+this.cell*.25,w*.35,y-this.cell*.23,w,y+Math.cos(a)*8);g.stroke();
        g.fillColor=new Color(255,219,143,210);
        const x=Math.sin(a)*w;g.moveTo(x,y+8);g.lineTo(x+4,y+2);g.lineTo(x,y-4);g.lineTo(x-4,y+2);g.close();g.fill();
      }
      g.strokeColor=new Color(255,221,152,220);g.ellipse(0,-this.cell*.3,this.cell*(.3+charge*.2),this.cell*.16);g.stroke();
      // A raised spear pennant unfurls during the windup, followed by circulating wind arrows.
      const x=-this.cell*.56,y=this.cell*.25,h=this.cell*(.45+charge*.35);
      g.strokeColor=new Color(255,225,161,240);g.lineWidth=2.5;g.moveTo(x,y-.12*this.cell);g.lineTo(x,y+h);g.stroke();
      this.star(g,x,y+h,this.cell*.09,new Color(255,237,190,255));
      g.fillColor=new Color(119,192,223,Math.round(100+charge*85));
      g.moveTo(x,y+h*.85);g.lineTo(x+this.cell*(.2+charge*.25),y+h*.72+Math.sin(phase*3)*3);
      g.lineTo(x+this.cell*.22,y+h*.45);g.lineTo(x,y+h*.5);g.close();g.fill();
      if(hunter.active)for(let n=0;n<3;n++){
        const a=-phase*2+n*Math.PI*2/3,cx=Math.cos(a)*this.cell*.72,cy=-this.cell*.25+Math.sin(a)*this.cell*.22;
        g.strokeColor=new Color(177,236,251,200);g.moveTo(cx-9,cy-3);g.lineTo(cx,cy);g.lineTo(cx-7,cy+5);g.stroke();
      }
    }
    for(const [id,charge]of this.brewing){
      if(tick>=charge.end||!this.casting(id)){this.brewing.delete(id);continue;}
      const g=this.drawing(id);if(!g)continue;
      const p=(tick-charge.start)/(charge.end-charge.start);
      this.vial(g,this.cell*(.42+Math.sin(p*Math.PI)*.15),this.cell*(.3+p*.35),this.cell*.16,240);
    }
    this.doses=this.doses.filter(d=>tick<d.end);
    for(const [index,dose]of this.doses.entries()){
      const g=this.drawing(dose.target);if(!g)continue;
      const age=(tick-dose.start)*this.tickMs/1000;
      g.lineWidth=2;g.strokeColor=new Color(190,107,236,190);
      g.ellipse(0,-this.cell*.3,this.cell*.45,this.cell*.15);g.stroke();
      const pulse=(age%1),r=this.cell*(.15+pulse*.35);
      g.strokeColor=new Color(195,120,241,Math.round(180*(1-pulse)));g.ellipse(0,-this.cell*.3,r,r*.36);g.stroke();
      for(let n=0;n<3;n++){
        const phase=(age*.6+n/3+index*.17)%1,x=Math.sin(age*2+n*2+index)*this.cell*.24;
        g.fillColor=new Color(185,115,241,Math.round(190*(1-phase)));
        g.circle(x,this.cell*(-.2+phase*.9),2+(1-phase)*2);g.fill();
      }
    }
    this.flights=this.flights.filter(f=>(tick-f.start)*this.tickMs<650);
    for(const f of this.flights){
      const p=Math.max(0,(tick-f.start)*this.tickMs/450),g=this.graphics;
      if(p<1){
        const x=f.from.x+(f.to.x-f.from.x)*p,y=f.from.y+(f.to.y-f.from.y)*p+Math.sin(p*Math.PI)*this.cell*.7;
        const alpha=Math.round(240*(1-p*.35));g.lineWidth=2;
        g.strokeColor=f.kind==='vial'?new Color(185,120,235,alpha):new Color(127,225,212,alpha);
        g.moveTo(f.from.x,f.from.y);g.quadraticCurveTo((f.from.x+f.to.x)/2,(f.from.y+f.to.y)/2+this.cell*1.1,x,y);g.stroke();
        if(f.kind==='vial')this.vial(g,x,y,this.cell*.15,255);
        else this.star(g,x,y,this.cell*.13,new Color(255,226,151,255));
      }else if(f.kind==='vial'){
        const fade=Math.max(0,1-(p-1)/(.2/.45));
        for(let n=0;n<7;n++){
          const a=n*Math.PI*2/7,r=this.cell*(.2+(1-fade)*.45);
          this.star(g,f.to.x+Math.cos(a)*r,f.to.y+Math.sin(a)*r*.5,this.cell*.05,new Color(205,144,246,Math.round(230*fade)));
        }
      }
    }
  }
  private launch(source:number,target:number,start:number,kind:Flight['kind']):void{
    const a=this.owner(source),b=this.owner(target);if(!a?.isValid||!b?.isValid)return;
    this.flights.push({source,target,start,kind,from:{x:a.position.x,y:a.position.y+this.cell*.35},to:{x:b.position.x,y:b.position.y+this.cell*.15}});
  }
  brewProgress(id:number,tick:number):number|null{
    const charge=this.brewing.get(id);
    return charge&&tick<charge.end&&this.casting(id)?Math.max(0,Math.min(1,(tick-charge.start)/(charge.end-charge.start))):null;
  }
  private star(g:Graphics,x:number,y:number,r:number,color:Color):void{
    g.fillColor=color;g.moveTo(x,y+r);g.lineTo(x+r*.28,y+r*.25);g.lineTo(x+r,y);g.lineTo(x+r*.28,y-r*.25);
    g.lineTo(x,y-r);g.lineTo(x-r*.28,y-r*.25);g.lineTo(x-r,y);g.lineTo(x-r*.28,y+r*.25);g.close();g.fill();
  }
  private vial(g:Graphics,x:number,y:number,r:number,alpha:number):void{
    g.fillColor=new Color(46,25,68,alpha);g.strokeColor=new Color(228,189,255,alpha);g.lineWidth=2;
    g.moveTo(x-r*.32,y+r*.9);g.lineTo(x+r*.32,y+r*.9);g.lineTo(x+r*.32,y+r*.38);
    g.bezierCurveTo(x+r*1.4,y-r*.35,x+r*.7,y-r,x,y-r);
    g.bezierCurveTo(x-r*.7,y-r,x-r*1.4,y-r*.35,x-r*.32,y+r*.38);g.close();g.fill();g.stroke();
    g.fillColor=new Color(173,99,230,alpha);g.ellipse(x,y-r*.36,r*.63,r*.42);g.fill();
    g.fillColor=new Color(245,210,136,alpha);g.rect(x-r*.43,y+r*.85,r*.86,r*.25);g.fill();
    this.star(g,x+r*.13,y-r*.16,r*.27,new Color(244,222,255,alpha));
  }
  clear(): void {this.ended=true;this.marks.clear();this.doses.length=0;this.flights=[];this.brewing.clear();this.graphics.clear();for(const drawing of this.drawings.values()){if(drawing.node.isValid){drawing.graphics.clear();drawing.node.active=false;}}}
  destroy(): void {this.clear();for(const drawing of this.drawings.values())if(drawing.node.isValid)drawing.node.destroy();this.drawings.clear();if(this.root.isValid)this.root.destroy();}
}
