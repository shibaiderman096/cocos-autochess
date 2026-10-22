import { _decorator, Component, Node, Vec3, Quat, Graphics, Color, UITransform, Animation, AnimationState } from 'cc';
import { RUINS_MOTIONS } from './FloatingRuinsP2Bindings';
import { RuinsMotionSpec, RuinsPose, RuinsQuality, motionPose, crystalBreath, overlaySafe } from './FloatingRuinsMotion';
import { BoardProjectionAdapter } from './BoardProjectionAdapter';
const { ccclass } = _decorator;
interface Binding { node: Node; spec: RuinsMotionSpec; base: RuinsPose; animation?: Animation; state?: AnimationState }

/** Owns only the 17 exported PIV transforms and one independent, non-interactive UI overlay. */
@ccclass('FloatingRuinsEnvironmentAnimator')
export class FloatingRuinsEnvironmentAnimator extends Component {
  quality: RuinsQuality = 'high';
  playing = true;
  private mode: '2d' | '3d' = '3d';
  private bindings: Binding[] = [];
  private overlay: Graphics | null = null;
  private elapsed = 0;
  private lastTime: number | null = null;
  private lastDraw = -Infinity;
  private disposed = false;
  private readonly point = new Vec3();
  private readonly glowCenter = new Vec3(0,.24,0);
  private readonly rotation = new Quat();
  private readonly color = new Color(69,218,219,40);
  private readonly adapter = new BoardProjectionAdapter();
  private projector: ((p:{x:number;y:number;z:number})=>{x:number;y:number}) | null = null;
  setProjector(projector:(p:{x:number;y:number;z:number})=>{x:number;y:number}):void {this.projector=projector;}
  private project(p:{x:number;y:number;z:number}):{x:number;y:number} {return this.projector?this.projector(p):this.adapter.toBoard(p);}
  /** Monotonic wall clock, independent of battle ticks, speed, RNG and save state. */
  private now(): number { return performance.now()/1000; }
  get elapsedSeconds(): number { return this.elapsed; }
  bind(model: Node, board: Node, requireClips = false): void {
    this.dispose(); this.disposed=false; this.elapsed=0; this.lastTime=null; this.lastDraw=-Infinity;
    const all: Node[]=[];
    const visit=(n:Node):void=>{all.push(n);n.children.forEach(visit);};visit(model);
    // Validate all bindings before capturing or changing any node; never animate partial/misnamed exports.
    const found=RUINS_MOTIONS.map(spec=>{
      const matches=all.filter(n=>n.name===spec.name);
      if(matches.length!==1 || !matches[0].children.length) throw Error('P2 pivot missing/ambiguous/empty: '+spec.name);
      const node=matches[0], animation=Animation && node.getComponent?.(Animation);
      const clip=animation?.defaultClip;
      if(requireClips && (!clip || clip.name!==spec.name || clip.duration<=0 || clip.enableTrsBlending))
        throw Error('Background animation clip missing/invalid: '+spec.name);
      const state=clip?(animation!.getState(clip.name)||animation!.createState(clip)):undefined;
      if(requireClips && !state)throw Error('Background animation state missing: '+spec.name);
      animation?.stop();
      return {node,spec,animation:animation??undefined,state};
    });
    if(all.filter(n=>n.name.startsWith('PIV_')).length!==17)throw Error('P2 requires the verified 17-pivot P1 export');
    this.bindings=found.map(({node,spec,animation,state})=>({node,spec,animation,state,base:{
      position:[node.position.x,node.position.y,node.position.z],
      rotation:[node.rotation.x,node.rotation.y,node.rotation.z,node.rotation.w],
      scale:[node.scale.x,node.scale.y,node.scale.z]}}));
    const n=new Node('floatingRuinsP2Overlay');n.layer=board.layer;board.addChild(n);n.setSiblingIndex(1);
    n.addComponent(UITransform).setContentSize(1024,768);
    this.overlay=n.addComponent(Graphics);this.overlay.lineWidth=1.4;
    // No touch listeners, timers, tweens, material writes or particle emitter nodes.
    this.applyState();
  }
  private activeMotion(): boolean {return !this.disposed && this.enabledInHierarchy && this.mode==='3d' && this.quality!=='off' && this.playing;}
  private syncClock(): void {
    const now=this.now();
    if(this.lastTime!==null && this.activeMotion())this.elapsed+=Math.max(0,now-this.lastTime);
    this.lastTime=now;
  }
  setQuality(quality: RuinsQuality): void {this.syncClock();this.quality=quality;this.lastDraw=-Infinity;this.applyState();}
  setPlaying(playing: boolean): void {this.syncClock();this.playing=playing;this.applyState();}
  setVisualMode(mode: '2d' | '3d'): void {this.syncClock();this.mode=mode;this.applyState();}
  private restore(): void {
    for(const {node,base} of this.bindings)if(node.isValid){
      node.setPosition(...base.position);node.setRotation(this.rotation.set(...base.rotation));node.setScale(...base.scale);
    }
  }
  private applyState(): void {
    const visible=!this.disposed && this.enabledInHierarchy && this.mode==='3d' && this.quality!=='off';
    if(!visible){this.restore();this.overlay?.clear();if(this.overlay)this.overlay.node.active=false;return;}
    if(this.overlay)this.overlay.node.active=true;
    this.applyPose();this.drawOverlay();
  }
  private applyPose(): void {
    for(const binding of this.bindings)if(binding.node.isValid){
      const {node,spec,base,animation}=binding;
      // Animation.onLoad may recreate states when an inactive model first becomes active.
      const state=animation?.defaultClip?animation.getState(animation.defaultClip.name)||animation.createState(animation.defaultClip):undefined;
      binding.state=state;
      if(state){
        const clip=animation!.defaultClip!;
        // Cocos owns interpolation of editor-authored keys. Never enqueue automatic playback.
        // Absolute sampling keeps pause/off/re-entry independent from battle Tick and speed.
        state.setTime((this.elapsed*clip.speed)%clip.duration);state.sample();continue;
      }
      // Retained only for historical model fixtures; production requires all 17 authored clips.
      const p=motionPose(spec,base,this.elapsed);
      node.setPosition(...p.position);node.setRotation(this.rotation.set(...p.rotation));node.setScale(...p.scale);
    }
  }
  update(): void {
    this.syncClock();if(!this.activeMotion())return;
    this.applyPose();
    if(this.elapsed-this.lastDraw>=(this.quality==='high'?1/30:1/15)){this.drawOverlay();this.lastDraw=this.elapsed;}
  }
  private dot(x:number,y:number,r:number,alpha:number):void {
    if(!this.overlay || !overlaySafe(x,y,r))return;
    this.color.set(76,218,224,Math.round(alpha));this.overlay.fillColor=this.color;
    this.overlay.circle(x,y,r);this.overlay.fill();
  }
  private drawOverlay(): void {
    const g=this.overlay;if(!g)return;g.clear();
    if(this.quality==='off' || this.mode!=='3d')return;
    // All visual samples use the same fixed RT mapping. Every primitive is clipped with its full radius.
    for(const binding of this.bindings){
      const {node,spec}=binding;
      if(spec.kind==='crystal'){
        Vec3.transformMat4(this.point,this.glowCenter,node.worldMatrix);
        const p=this.project(this.point),a=crystalBreath(spec,this.elapsed)*100;
        if(this.quality==='high')this.dot(p.x,p.y,10,a*.3);
        this.dot(p.x,p.y,5,a*.6);this.dot(p.x,p.y,2,a);
      }else if(spec.kind==='ring'){
        // Short flowing arc on the actual rotating elliptical ring plane, never above the operation area.
        for(let i=0;i<(this.quality==='high'?16:6);i++){
          const a=this.elapsed*Math.PI*2/7+i*.018+spec.phase;
          this.point.set(spec.radiusX!*Math.cos(a),0,spec.radiusZ!*Math.sin(a));
          Vec3.transformMat4(this.point,this.point,node.worldMatrix);
          const p=this.project(this.point);
          this.dot(p.x,p.y,1.3,28+i);
        }
      }
    }
    const count=this.quality==='high'?16:4;
    for(let i=0;i<count;i++){
      const cycle=5+(i%5)*.7,phase=((this.elapsed/cycle+i*.381966)%1+1)%1;
      const side=i%2?-1:1,x=side*(373+12*Math.sin(i*2.4+phase*Math.PI*2)),y=-160+320*phase;
      this.dot(x,y,this.quality==='high'?1.5:1,52*Math.sin(Math.PI*phase)**2);
    }
  }
  diagnostics(): unknown {return {elapsed:this.elapsed,quality:this.quality,playing:this.playing,mode:this.mode,
    driver:this.bindings.length===17&&this.bindings.every(b=>b.state)?'cocos-animation-clip':'procedural-legacy',clips:this.bindings.filter(b=>b.state).length,
    bound:this.bindings.length,overlays:this.overlay?.isValid?1:0,particleBudget:this.quality==='off'?0:this.quality==='high'?16:4,
    poses:this.bindings.map(({node,spec})=>({name:spec.name,position:[node.position.x,node.position.y,node.position.z],rotation:[node.rotation.x,node.rotation.y,node.rotation.z,node.rotation.w]}))};}
  onEnable():void {this.lastTime=null;if(this.bindings.length)this.applyState();}
  onDisable():void {
    this.lastTime=null;this.restore();
    if(this.overlay?.node?.isValid){this.overlay.clear();this.overlay.node.active=false;}
  }
  dispose():void {
    this.restore();
    // Children can already be gone when the owning Canvas components are destroyed.
    const overlay=this.overlay;this.overlay=null;
    this.bindings=[];this.disposed=true;this.lastTime=null;
    if(overlay?.node?.isValid){
      overlay.clear();overlay.node.active=false;overlay.node.removeFromParent();overlay.node.destroy();
    }
  }
  onDestroy():void {this.dispose();}
}
