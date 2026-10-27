import { Node, UITransform, Vec3, Prefab, resources, instantiate, director, Layers, isValid, Animation, AnimationClip, animation, Label, Color, Graphics } from 'cc';
import { unprojectBoardPoint, projectGroundPoint } from './BoardPresentation';
import { QUALITY_COLORS } from '../core/EquipmentQuality';

const MODELS = {
  shop: 'models/board-encounters/ruins-shop/ruins-shop',
  chest: 'models/board-encounters/ruins-chest/ruins-chest',
};

/** Clickable encounter object, outside combat and formation counting. */
export class ShopVisitor {
  private root: Node;
  private model: Node | null = null;
  private disposed = false;
  private visible = true;
  private opening = false;
  private opened = false;
  private lid: Node | null = null;
  private lidBase: Vec3 | null = null;
  private lidAnimation: Animation | null = null;
  private openClip: AnimationClip | null = null;
  private finishOpen: (() => void) | null = null;
  private caption: Label | null = null;
  private lootOdds: Label[] = [];
  private modelScale = 1;
  get isOpening(): boolean { return this.opening; }

  constructor(parent: Node, position: Vec3, enter: () => void, kind: 'shop' | 'chest' = 'shop', options?: {name?:string;canEnter?:()=>boolean;modelScale?:number;yawDegrees?:number}) {
    this.root = new Node(kind === 'shop' ? 'shopVisitor' : 'bossChest'); parent.addChild(this.root);
    if(options?.name)this.root.name=options.name;
    this.modelScale=options?.modelScale??1;
    this.root.layer = parent.layer;
    const touchArea = this.root.addComponent(UITransform);
    touchArea.setContentSize(132*this.modelScale, 164*this.modelScale); touchArea.setAnchorPoint(0.5, 0.22);
    this.root.setPosition(position);
    this.root.on(Node.EventType.TOUCH_END, (event: any) => {
      event.propagationStopped = true;
      if (this.disposed || !this.visible || this.opening || this.opened) return;
      if(options?.canEnter&&!options.canEnter())return;
      if (kind === 'shop') { enter(); return; }
      this.openChest(enter);
    });
    // The 2D node is an input proxy only. Geometry is drawn by the board's 3D camera.
    const environment = director.getScene?.()?.getChildByName('FloatingRuinsEnvironment');
    if (!environment) return;
    const point = unprojectBoardPoint(position);
    resources.load(MODELS[kind], Prefab, (error, prefab) => {
      if (this.disposed || !isValid(this.root, true) || !isValid(environment, true)) return;
      if (error) { console.error('[ShopVisitor] model load failed', MODELS[kind], error.message); return; }
      this.model = instantiate(prefab); this.model.name = kind === 'shop' ? 'ShopEncounter3D' : 'RewardChest3D';
      environment.addChild(this.model);
      this.model.setPosition(point.x / 100, .025, -point.y / 60);
      this.model.setScale(this.model.scale.x*this.modelScale,this.model.scale.y*this.modelScale,this.model.scale.z*this.modelScale);
      if(options?.yawDegrees!==undefined)this.model.setRotationFromEuler(0,options.yawDegrees,0);
      const layers = (node: Node): void => { node.layer = Layers.Enum.DEFAULT; node.children.forEach(layers); };
      layers(this.model); this.model.active = this.visible;
      if (kind === 'chest') this.bindLid();
      console.info('ENCOUNTER_MODEL_READY ' + JSON.stringify({kind, path: MODELS[kind], ground: point}));
    });
  }

  private bindLid(): void {
    const matches: Node[] = [];
    const visit = (node: Node): void => {
      if (node.name === 'PIV_ChestLid') matches.push(node);
      node.children.forEach(visit);
    };
    visit(this.model!);
    if (matches.length !== 1) {
      console.warn('[ShopVisitor] chest hinge unavailable; reward remains claimable'); return;
    }
    this.lid = matches[0]; this.lidBase = this.lid.eulerAngles.clone();
    const clip = this.openClip = new AnimationClip();
    clip.name = 'RewardChestOpen'; clip.duration = 1.1; clip.sample = 60;
    clip.wrapMode = AnimationClip.WrapMode.Normal; clip.enableTrsBlending = false;
    const track = new animation.VectorTrack(); track.componentsCount = 3;
    track.path.toProperty('eulerAngles');
    // Absolute local angles about the exported rear hinge. No battle clock or accumulated rotation.
    const stops = [[0, 0], [.14, -12], [.60, -108], [.75, -100], [.90, -104], [1.1, -104]];
    const samples = Array.from({length: 67}, (_, index) => {
      const time = index * clip.duration / 66;
      let end = stops.findIndex(([t]) => t >= time); if (end < 1) end = 1;
      const [a, from] = stops[end - 1], [b, to] = stops[end];
      const u = Math.max(0, Math.min(1, (time - a) / (b - a)));
      return [time, from + (to - from) * u * u * (3 - 2 * u)];
    });
    track.channels().slice(0, 3).forEach((channel, axis) => {
      const base = [this.lidBase!.x, this.lidBase!.y, this.lidBase!.z][axis];
      channel.curve.assignSorted(samples.map(([time, angle]) => [time, base + (axis === 0 ? angle : 0)]));
    });
    clip.addTrack(track);
    this.lidAnimation = this.lid.addComponent(Animation); this.lidAnimation.addClip(clip);
  }

  private openChest(enter: () => void): void {
    if (!this.lidAnimation || !this.openClip) { this.opened = true; enter(); return; }
    this.opening = true;
    this.finishOpen = () => {
      this.finishOpen = null;
      if (this.disposed || !this.visible || !isValid(this.root, true)) return;
      this.opening = false; this.opened = true;
      console.info('CHEST_OPEN_FINISHED'); enter();
    };
    this.lidAnimation.once(Animation.EventType.FINISHED, this.finishOpen);
    this.lidAnimation.play(this.openClip.name);
    console.info('CHEST_OPEN_STARTED ' + JSON.stringify({duration: this.openClip.duration, hinge: this.lid!.name}));
  }

  resetLid(): void {
    if (this.lidAnimation && isValid(this.lidAnimation, true)) {
      if (this.finishOpen) this.lidAnimation.off(Animation.EventType.FINISHED, this.finishOpen);
      this.lidAnimation.stop();
    }
    this.finishOpen = null; this.opening = false; this.opened = false;
    if (this.lid && this.lidBase && isValid(this.lid, true)) this.lid.setRotationFromEuler(this.lidBase);
  }

  setLootCaption(points: number, rates: readonly number[], scale = 1): void {
    if(!this.caption){
      const node=new Node('explorerChestLayers');this.root.addChild(node);node.layer=this.root.layer;
      const width=224,height=60;
      node.setPosition(0,116*this.modelScale,0);node.addComponent(UITransform).setContentSize(width,height);
      const background=node.addComponent(Graphics);background.fillColor=new Color(8,17,24,235);background.strokeColor=new Color(169,141,78);
      background.lineWidth=1;background.roundRect(-width/2,-height/2,width,height,8);background.fill();background.stroke();
      const copy=new Node('text');node.addChild(copy);copy.layer=node.layer;copy.setPosition(0,13,0);copy.addComponent(UITransform).setContentSize(width-8,28);
      this.caption=copy.addComponent(Label);this.caption.fontSize=21;this.caption.lineHeight=25;
      this.caption.color=new Color(255,224,146);this.caption.isBold=true;
      this.caption.enableWrapText=false;this.caption.overflow=Label.Overflow.SHRINK;
      QUALITY_COLORS.forEach((rgb,index)=>{
        const cell=new Node(`odds${index+1}`);node.addChild(cell);cell.layer=node.layer;cell.setPosition((index-2)*43,-14,0);
        cell.addComponent(UITransform).setContentSize(43,21);const label=cell.addComponent(Label);
        label.fontSize=13;label.lineHeight=20;label.color=new Color(...rgb);label.enableWrapText=false;label.overflow=Label.Overflow.SHRINK;
        this.lootOdds.push(label);
      });
    }
    this.caption.node.parent!.setScale(scale,scale,1);
    this.caption.string=`${points} 层`;
    this.lootOdds.forEach((label,index)=>{label.string=`${rates[index]}%`;});
  }

  /** Board-local mouth position, projected at the actual chest rim height. */
  rewardOrigin(): Vec3 {
    const ground = unprojectBoardPoint(this.root.position);
    const p = projectGroundPoint({x: ground.x / 100, y: .025+.62*this.modelScale, z: -ground.y / 60});
    return new Vec3(p.x, p.y, 0);
  }

  setVisible(visible: boolean): void {
    if (!visible) this.resetLid();
    this.root.active = visible;
    this.visible = visible;
    if (this.model) this.model.active = visible;
    if (visible) this.root.setSiblingIndex(this.root.parent!.children.length - 1);
  }

  dispose(): void {
    this.disposed = true;
    this.resetLid();
    if (this.lidAnimation && isValid(this.lidAnimation, true) && this.openClip) this.lidAnimation.removeClip(this.openClip, true);
    this.openClip?.destroy(); this.openClip = null;
    this.lidAnimation = null; this.lid = null; this.lidBase = null;
    if (this.model && isValid(this.model, true)) this.model.destroy();
    this.model = null;
  }
}
