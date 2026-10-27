import { FloatingRuinsEnvironmentAnimator } from './FloatingRuinsEnvironmentAnimator';
import { _decorator, Component, Node, Camera, RenderTexture, SpriteFrame, Sprite,
  UITransform, Color, Vec3, Layers, Prefab, resources, instantiate, director, DirectionalLight,
  Graphics, gfx, Canvas, isValid, EventMouse, EventTouch, game, Game } from 'cc';
import { BoardView } from './BoardView';
import { BoardProjectionAdapter } from './BoardProjectionAdapter';
import { BOARD_CAMERA, projectBoardPoint, projectGroundPoint, benchGroundPoint, clampBoardZoom, wheelBoardZoom } from './BoardPresentation';
import { setSkyBackground } from './SkyBackgroundAnimation';

const { ccclass, executionOrder } = _decorator;
const BENCH = 'models/ruins-bench/ruins-bench/ruins-bench';
const MODEL = 'backgrounds/RuinsBackground';
export const BOARD_PINCH_START = 'board-pinch-start';
interface BoardTouch { x: number; y: number; eligible: boolean }

/** Production board presentation. Uses normal game saves and the existing battle/input layers. */
@ccclass('FloatingRuinsBoard')
@executionOrder(-100)
export class FloatingRuinsBoard extends Component {
  animator: FloatingRuinsEnvironmentAnimator;
  readonly mode = '3d';
  zoom: number = BOARD_CAMERA.defaultZoom;
  alignmentReport: unknown = null;
  loadError = '';
  private board: BoardView;
  private camera3d: Camera;
  private environment: Node;
  private model: Node;
  private surface: Node;
  private sky: Node;
  private texture: RenderTexture;
  private frame: SpriteFrame;
  private bench: Node;
  private wheelListening = false;
  private touches = new Map<number, BoardTouch>();
  private pinchPair: [number, number] | null = null;
  private pinchDistance = 0;
  private pinchBlocking = false;
  private ready = false;
  get loadingComplete(): boolean { return this.ready && !!this.bench; }
  get touchGestureActive(): boolean { return this.pinchBlocking; }

  start(): void { this.schedule(this.tryInitialize, .1); }

  private tryInitialize(): void {
    const canvas = this.node;
    const board = canvas.getChildByName('Board')?.getComponent(BoardView);
    // BattleStage loads its config asynchronously. Do not guess its lifecycle order.
    if (!board?.boardPixelW || !canvas.getChildByName('battleUI')) return;
    this.unschedule(this.tryInitialize);
    this.board = board;
    const backdrop = canvas.getChildByName('arenaBackdrop');
    if(backdrop) backdrop.active=false;
    this.buildEnvironment();
    this.setZoom(this.zoom);
    resources.load(MODEL, Prefab, (error, prefab) => {
      if (!this.isValid) return;
      if (error) { this.loadError = error.message; console.warn('[FloatingRuinsBoard] model load failed',error.message); return; }
      console.info('FLOATING_RUINS_BOARD_MODEL', JSON.stringify({ path: MODEL }));
      this.model = instantiate(prefab); this.environment.addChild(this.model);
      for (const n of [this.model, ...this.descendants(this.model)]) n.layer = Layers.Enum.DEFAULT;
      this.animator = this.node.addComponent(FloatingRuinsEnvironmentAnimator);
      this.animator.setProjector(projectGroundPoint);
      this.animator.bind(this.model,this.board.node,true);
      this.ready = true;
      this.environment.active = true; this.surface.active = true; this.sky.active = true;
      this.animator.setVisualMode('3d');
      this.recordControls('ready');
      this.loadBench();
      this.scheduleOnce(() => this.validateAlignment(), .2);
    });
  }

  private descendants(root: Node): Node[] {
    return root.children.flatMap(child => [child, ...this.descendants(child)]);
  }

  private buildEnvironment(): void {
    const scene = director.getScene()!;
    this.environment = scene.getChildByName('FloatingRuinsEnvironment')!;
    const cn = this.environment.getChildByName('BoardCamera3D')!;
    this.camera3d = cn.getComponent(Camera)!;
    const pitch = BOARD_CAMERA.pitchDegrees*Math.PI/180;
    cn.setPosition(0,BOARD_CAMERA.distance*Math.sin(pitch),BOARD_CAMERA.distance*Math.cos(pitch)); cn.lookAt(Vec3.ZERO);
    this.camera3d.projection = Camera.ProjectionType.PERSPECTIVE;
    this.camera3d.fovAxis = Camera.FOVAxis.VERTICAL;
    this.camera3d.fov = BOARD_CAMERA.verticalFovDegrees;
    this.camera3d.near = .1; this.camera3d.far = 100;
    this.camera3d.visibility = Layers.Enum.DEFAULT;
    this.camera3d.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    this.camera3d.clearColor = new Color(0, 0, 0, 0);
    this.texture = new RenderTexture();
    this.texture.reset({ width: BoardProjectionAdapter.textureWidth, height: BoardProjectionAdapter.textureHeight });
    this.camera3d.targetTexture = this.texture;
    const lightNode = this.environment.getChildByName('RuinKeyLight')!;
    const light = lightNode.getComponent(DirectionalLight) ?? lightNode.addComponent(DirectionalLight);
    lightNode.setRotationFromEuler(-55, -25, 0);
    light.color = new Color(255, 239, 211); light.illuminance = 65000;
    this.surface = new Node('ruins3DSurface'); this.surface.layer = this.board.node.layer;
    this.board.node.addChild(this.surface); this.surface.setSiblingIndex(0);
    this.surface.addComponent(UITransform).setContentSize(BoardProjectionAdapter.textureWidth, BoardProjectionAdapter.textureHeight);
    const sprite = this.surface.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.frame = new SpriteFrame(); this.frame.texture = this.texture; sprite.spriteFrame = this.frame;
    this.surface.active = false;
    this.sky = new Node('ruinsSky'); this.sky.layer = this.node.layer;
    this.node.addChild(this.sky); this.sky.setSiblingIndex(0);
    const g = this.sky.addComponent(Graphics); g.fillColor = new Color(15,30,40);
    g.rect(-2000,-1200,4000,2400); g.fill();
    this.sky.getComponent(UITransform)!.setContentSize(1280,720);
    setSkyBackground(this.sky, g, new Color(105,130,150));
    this.sky.active = false;
    this.environment.active = false;
  }

  onEnable(): void {
    if(this.wheelListening) return;
    // Mouse-aware UI nodes swallow wheel events before global input in Cocos 3.8.
    this.node.on(Node.EventType.MOUSE_WHEEL,this.onWheel,this,true);
    this.node.on(Node.EventType.TOUCH_START,this.onTouchStart,this,true);
    this.node.on(Node.EventType.TOUCH_MOVE,this.onTouchMove,this,true);
    this.node.on(Node.EventType.TOUCH_END,this.onTouchEnd,this,true);
    this.node.on(Node.EventType.TOUCH_CANCEL,this.onTouchEnd,this,true);
    game.on(Game.EVENT_HIDE,this.clearTouches,this);
    this.wheelListening=true;
  }
  onDisable(): void {
    if(!this.wheelListening) return;
    this.node.off(Node.EventType.MOUSE_WHEEL,this.onWheel,this,true);
    this.node.off(Node.EventType.TOUCH_START,this.onTouchStart,this,true);
    this.node.off(Node.EventType.TOUCH_MOVE,this.onTouchMove,this,true);
    this.node.off(Node.EventType.TOUCH_END,this.onTouchEnd,this,true);
    this.node.off(Node.EventType.TOUCH_CANCEL,this.onTouchEnd,this,true);
    game.off(Game.EVENT_HIDE,this.clearTouches,this);
    this.clearTouches(); this.wheelListening=false;
  }

  private isArenaPoint(p: {x:number;y:number}): boolean {
    const local=this.node.getComponent(UITransform)!.convertToNodeSpaceAR(new Vec3(p.x,p.y,0));
    // Restrict to the exposed arena; side panels, shop, header and HUD retain their own input.
    return local.x>=-315 && local.x<=315 && local.y>=-218 && local.y<=232;
  }
  private zoomBlockedByUI(): boolean {
    const ui=this.node.getChildByName('battleUI');
    return !!ui && this.descendants(ui).some(n=>n.activeInHierarchy && /^(mainMenu|debugPanel|debugMenu|detailPopup|equipmentReward|stageReward|shopDismiss)$/.test(n.name));
  }
  private onTouchStart(event: EventTouch): void {
    const id=event.getID(); if(id===null)return;
    const p=event.getUILocation();
    this.touches.set(id,{x:p.x,y:p.y,eligible:this.ready && this.isArenaPoint(p) && !this.zoomBlockedByUI()});
    if(this.pinchBlocking){event.propagationStopped=true;return;}
    if(this.touches.size!==2)return;
    const pair=Array.from(this.touches.entries());
    if(pair.some(([,p])=>!p.eligible))return;
    const distance=Math.hypot(pair[0][1].x-pair[1][1].x,pair[0][1].y-pair[1][1].y);
    if(distance<16)return;
    this.pinchPair=[pair[0][0],pair[1][0]];this.pinchDistance=distance;this.pinchBlocking=true;
    this.node.emit(BOARD_PINCH_START);
    event.propagationStopped=true;
  }
  private onTouchMove(event: EventTouch): void {
    const id=event.getID(),point=id===null?undefined:this.touches.get(id);
    if(point){const p=event.getUILocation();point.x=p.x;point.y=p.y;}
    if(!this.pinchBlocking)return;
    event.propagationStopped=true;
    if(!this.pinchPair || this.zoomBlockedByUI())return;
    const a=this.touches.get(this.pinchPair[0]),b=this.touches.get(this.pinchPair[1]);
    if(!a||!b)return;
    const distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(distance<8)return;
    this.setZoom(this.zoom*distance/this.pinchDistance);this.pinchDistance=distance;
  }
  private onTouchEnd(event: EventTouch): void {
    const id=event.getID();if(id!==null)this.touches.delete(id);
    if(!this.pinchBlocking)return;
    event.propagationStopped=true;
    if(id!==null&&this.pinchPair?.includes(id))this.pinchPair=null;
    // Swallow the remaining finger until it lifts; it must not become a drag or detail click.
    if(!this.touches.size)this.clearTouches();
  }
  private clearTouches(): void {
    const active=this.pinchBlocking;
    if(this.touches.size)this.node.emit(BOARD_PINCH_START);
    this.touches.clear();this.pinchPair=null;this.pinchDistance=0;this.pinchBlocking=false;
    if(active&&this.ready){this.unschedule(this.validateAlignment);this.scheduleOnce(this.validateAlignment,0);}
  }
  private onWheel(event: EventMouse): void {
    if (!this.ready || this.board.interactionActive || this.pinchBlocking
      || !this.isArenaPoint(event.getUILocation()) || this.zoomBlockedByUI()) return;
    this.setZoom(wheelBoardZoom(this.zoom,event.getScrollY()));
  }

  setZoom(value: number): void {
    if(this.board?.interactionActive) return;
    this.zoom=clampBoardZoom(value);
    // One uniform parent transform scales the RT, portraits, highlights, effects and hit conversion together.
    if(this.board) this.board.node.setScale(this.zoom,this.zoom,1);
    if(this.ready&&!this.pinchBlocking){this.unschedule(this.validateAlignment);this.scheduleOnce(this.validateAlignment,0);}
  }

  private loadBench(): void {
    resources.load(BENCH,Prefab,(error,prefab)=>{
      if(!this.isValid) return;
      if(error){this.loadError=error.message;console.error('[FloatingRuinsBoard] bench load failed',error.message);return;}
      this.bench=new Node('ReserveBench3D');this.environment.addChild(this.bench);
      for(let slot=0;slot<this.board.benchSlots;slot++){
        const module=instantiate(prefab);module.name=`SM_ReserveSlot_${String(slot).padStart(2,'0')}`;
        this.bench.addChild(module);
        const p=benchGroundPoint(slot,this.board.benchSlots,this.board.boardPixelH);
        module.setPosition(p.x,p.y,p.z);
        for(const n of [module,...this.descendants(module)])n.layer=Layers.Enum.DEFAULT;
      }
      console.info('FLOATING_RUINS_BENCH '+JSON.stringify({slots:this.board.benchSlots,path:BENCH}));
    });
  }

  private recordControls(action: string): void {
    if (!this.animator) return;
    console.info('FLOATING_RUINS_BOARD_CONTROL '+JSON.stringify({action,state:this.animator.diagnostics()}));
  }

  /** Verify imported mesh vertices through the actual 3D and Canvas cameras, in screen pixels. */
  validateAlignment(): unknown {
    if (!this.model) return null;
    const adapter = new BoardProjectionAdapter(this.board.boardWidth,this.board.boardHeight,this.board.hexSize);
    const uiCamera = this.node.getComponent(Canvas)!.cameraComponent!;
    const ut = this.board.node.getComponent(UITransform)!;
    const objects = this.descendants(this.model);
    let maxCenterError = 0, maxPolygonError = 0, samples = 0;
    const rows = adapter.manifest().cells.map(cell => {
      const tile = objects.find(n => n.name === cell.name);
      if (!tile) return { name:cell.name, missing:true };
      const screen = (p: Vec3): Vec3 => {
        const s = this.camera3d.worldToScreen(p);
        const local = new Vec3(s.x-BoardProjectionAdapter.textureWidth/2,s.y-BoardProjectionAdapter.textureHeight/2,0);
        return uiCamera.worldToScreen(ut.convertToWorldSpaceAR(local));
      };
      const desired = (p: {x:number;y:number}): Vec3 => uiCamera.worldToScreen(ut.convertToWorldSpaceAR(new Vec3(p.x,p.y,0)));
      const error = (a: Vec3,b: Vec3): number => Math.hypot(a.x-b.x,a.y-b.y);
      const centerError = error(screen(tile.worldPosition),desired(projectBoardPoint(cell.center)));
      maxCenterError = Math.max(maxCenterError,centerError);
      // GLB duplicates vertices for normals/UVs; search actual top-edge positions in every primitive.
      const renderers = tile.getComponentsInChildren('cc.MeshRenderer') as import('cc').MeshRenderer[];
      const vertices: Vec3[] = [];
      for (const renderer of renderers) {
        const mesh = renderer.mesh!;
        for (let i=0;i<mesh.struct.primitives.length;i++) {
          const positions = mesh.readAttribute(i,gfx.AttributeName.ATTR_POSITION);
          if (!positions) continue;
          for (let k=0;k<positions.length;k+=3) vertices.push(Vec3.transformMat4(new Vec3(),new Vec3(positions[k],positions[k+1],positions[k+2]),renderer.node.worldMatrix));
        }
      }
      const errors = cell.groundPolygon.map(p => {
        const target = new Vec3(p.x,p.y,p.z);
        const nearest = vertices.reduce<Vec3 | null>((best,v) => !best || Vec3.squaredDistance(v,target)<Vec3.squaredDistance(best,target) ? v : best,null);
        return nearest ? error(screen(nearest),desired(projectGroundPoint(p))) : Infinity;
      });
      maxPolygonError = Math.max(maxPolygonError,...errors); samples += 7;
      return {name:cell.name,centerError,polygonErrors:errors,hit:this.board.worldToCell(projectBoardPoint(cell.center).x,projectBoardPoint(cell.center).y)};
    });
    const eye=this.camera3d.node.worldPosition;
    const report = { zoom:this.zoom,pitch:BOARD_CAMERA.pitchDegrees,actualElevation:Math.atan2(eye.y,Math.hypot(eye.x,eye.z))*180/Math.PI,projection:'perspective',verticalFov:this.camera3d.fov,cells:rows.length,samples,maxCenterError,maxPolygonError,rows,
      pass:rows.length===56 && samples===392 && maxCenterError<.5 && maxPolygonError<.5 };
    this.alignmentReport = report;
    console.info('FLOATING_RUINS_BOARD_ALIGNMENT ' + JSON.stringify(report));
    if (!report.pass) console.error('[FloatingRuinsBoard] 棋盘校准异常');
    return report;
  }

  onDestroy(): void {
    this.onDisable();
    if (isValid(this.animator, true)) this.animator.dispose();
    this.unscheduleAllCallbacks();
    const backdrop = this.node.getChildByName('arenaBackdrop');
    if (isValid(backdrop, true)) backdrop.active = false;
    if (isValid(this.environment, true)) this.environment.active = false;
    if (isValid(this.camera3d, true)) this.camera3d.targetTexture = null;
    if (isValid(this.frame, true)) this.frame.destroy();
    if (isValid(this.texture, true)) this.texture.destroy();
    if (isValid(this.board, true) && isValid(this.board.node, true)) {
      this.board.node.setScale(1,1,1);

    }
    if (isValid(this.bench,true)) this.bench.destroy();
    for (const node of [this.surface, this.sky]) if (isValid(node, true)) node.destroy();
  }
}

