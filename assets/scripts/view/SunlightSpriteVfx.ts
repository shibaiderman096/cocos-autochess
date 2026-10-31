import { Node, Sprite, SpriteFrame, UITransform, UIOpacity, Vec3, Color, resources } from 'cc';
import type { BattleEvent } from '../battle/types';
import { FX_SPRITE } from './ArtPaths';

type Pulse = Extract<BattleEvent, { t: 'sun_pulse' }>;
type Motion = 'ring' | 'burst' | 'shield' | 'travel' | 'slash' | 'pillar' | 'orbit' | 'charge' | 'field' | 'wave' | 'mote';
interface Layer {
  path: string; motion: Motion; start: number; seconds: number; from: Vec3; to?: Vec3;
  width: number; height: number; angle?: number; spin?: number; opacity?: number;
  follow?: number; phase?: number; tag?: 'shield' | 'empower'; ground?: boolean;
}
interface Slot { node: Node; sprite: Sprite; opacity: UIOpacity; lease: number; layer?: Layer }
interface Status { alive: boolean; shield: number; empowered: boolean }
const MAX_LAYERS = 192;

/** Drawn solar assets, animated exclusively by the replay tick. No wall-clock tweens. */
export class SunlightSpriteVfx {
  private slots: Slot[] = [];
  private frames = new Map<string, SpriteFrame>();
  private pending = new Map<string, Array<(frame: SpriteFrame) => void>>();
  private ground: Node | null = null;
  private fieldStarted = false;
  private disposed = false;
  constructor(private root: Node, private cell: number, private tickMs: number,
    private project: (x: number, y: number) => Vec3, private owner: (id: number) => Node | undefined,
    private boardSize: { width: number; height: number }, private status: (id: number) => Status | undefined) {
    for (const path of [FX_SPRITE.sunlightBarrier, FX_SPRITE.sunlightArrow, FX_SPRITE.sunlightSlash,
      FX_SPRITE.sunlightSigil, FX_SPRITE.sunlightJudgment, FX_SPRITE.sunlightField]) this.acquire(path, () => {});
  }
  private acquire(path: string, ready: (frame: SpriteFrame) => void): void {
    const cached = this.frames.get(path); if (cached) { ready(cached); return; }
    const waiting = this.pending.get(path); if (waiting) { waiting.push(ready); return; }
    this.pending.set(path, [ready]);
    resources.load(path, SpriteFrame, (error, frame) => {
      const callbacks = this.pending.get(path) ?? []; this.pending.delete(path);
      if (error || this.disposed || !this.root.isValid) return;
      this.frames.set(path, frame); for (const callback of callbacks) callback(frame);
    });
  }
  private groundRoot(): Node {
    if (this.ground?.isValid) return this.ground;
    const ground = new Node('sunlightGround'); (this.root.parent ?? this.root).addChild(ground);
    const grid = ground.parent!.getChildByName('boardGrid');
    ground.setSiblingIndex(grid ? ground.parent!.children.indexOf(grid) + 1 : 0);
    this.ground = ground; return ground;
  }
  private add(layer: Layer): void {
    if (this.disposed || !this.root.isValid) return;
    let slot = this.slots.find(item => !item.layer);
    if (!slot) {
      if (this.slots.length >= MAX_LAYERS) return;
      const node = new Node('sunlightSpriteVfx'); this.root.addChild(node); node.addComponent(UITransform);
      const art = new Node('solarArt'); node.addChild(art); art.addComponent(UITransform);
      const sprite = art.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      slot = { node, sprite, opacity: node.addComponent(UIOpacity), lease: 0 }; this.slots.push(slot);
    }
    const current = slot, lease = ++slot.lease;
    (layer.ground ? this.groundRoot() : this.root).addChild(current.node);
    current.layer = layer; current.node.active = false; current.node.angle = 0; current.node.setScale(1, 1, 1);
    current.node.setPosition(layer.from); current.sprite.node.angle = 0;
    current.sprite.color = new Color(255, 255, 255); current.sprite.spriteFrame = null; current.opacity.opacity = 0;
    const transform = current.sprite.node.getComponent(UITransform)!;
    transform.setAnchorPoint(.5, layer.motion === 'pillar' ? .1 : .5);
    transform.setContentSize(this.cell * layer.width, this.cell * layer.height);
    this.acquire(layer.path, frame => {
      if (!this.disposed && current.node.isValid && current.lease === lease && current.layer === layer) current.sprite.spriteFrame = frame;
    });
  }
  private ring(pos: Vec3, tick: number, size: number, seconds = .65, delay = 0, ground = false): void {
    this.add({ path: FX_SPRITE.sunlightSigil, motion: 'burst', from: pos.clone(), start: tick + delay * 1000 / this.tickMs,
      seconds, width: size, height: size, opacity: 180, spin: 24, ground });
  }
  private slash(from: Vec3, to: Vec3, tick: number, large = false, step = 0): void {
    this.add({ path: FX_SPRITE.sunlightSlash, motion: 'slash', from: to.clone(), start: tick, seconds: large ? .48 : .28,
      width: large ? 3.1 : 1.6, height: large ? 2.1 : 1.35,
      angle: Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI, spin: step % 2 ? -24 : 24, opacity: 245 });
  }
  charge(id: number, pos: Vec3, tick: number, seconds: number): void {
    this.add({ path: FX_SPRITE.sunlightSigil, motion: 'charge', from: pos.clone(), start: tick,
      seconds: Math.max(.1, seconds), width: 1.6, height: 1.6, follow: id, spin: -80, opacity: 155 });
  }
  teleport(from: Vec3, to: Vec3, tick: number): void {
    this.ring(from, tick, 1.3, .38); this.ring(to, tick, 1.6, .45);
    this.add({ path: FX_SPRITE.sunlightArrow, motion: 'travel', from: from.clone(), to: to.clone(), start: tick,
      seconds: .18, width: 1.8, height: .6, angle: Math.atan2(to.y-from.y, to.x-from.x)*180/Math.PI, opacity: 170 });
  }
  basicAttack(from: Vec3, to: Vec3, tick: number, ranged: boolean): void {
    if (ranged) this.add({ path: FX_SPRITE.sunlightArrow, motion: 'travel', from: from.clone(), to: to.clone(),
      start: tick, seconds: .2, width: 1.1, height: .37,
      angle: Math.atan2(to.y-from.y,to.x-from.x)*180/Math.PI, opacity: 185 });
    else this.slash(from, to, tick);
  }
  play(e: Pulse): void {
    const pos = this.project(e.center.x, e.center.y), from = e.from ? this.project(e.from.x, e.from.y) : pos.clone();
    switch (e.effect) {
      case 'board': this.showField(e.tick); break;
      case 'shield':
        this.cancel(e.targetId ?? e.id, 'shield');
        this.add({ path: FX_SPRITE.sunlightBarrier, motion: 'shield', from: pos, start: e.tick,
          seconds: e.duration > 0 ? e.duration : Infinity, width: e.kind === 'bastion' ? 1.55 : 1.25, height: e.kind === 'bastion' ? 1.95 : 1.65,
          follow: e.targetId ?? e.id, tag: 'shield', opacity: e.trait ? 125 : 180 });
        if (e.kind === 'bastion') this.ring(pos, e.tick, 1.8, .6); break;
      case 'bolt': {
        const crossbow = e.kind === 'crossbow', final = e.kind === 'arrows' && e.step === 2;
        this.add({ path: FX_SPRITE.sunlightArrow, motion: crossbow?'slash':'travel', from:crossbow?new Vec3((from.x+pos.x)/2,(from.y+pos.y)/2,0):from, to: pos, start: e.tick, seconds: e.duration,
          width: crossbow ? Math.hypot(pos.x-from.x,pos.y-from.y)/this.cell : final ? 2.1 : 1.45, height: crossbow ? 1.2 : final ? .7 : .48,
          angle: Math.atan2(pos.y-from.y, pos.x-from.x)*180/Math.PI, opacity: 245 });
        this.ring(pos, e.tick, crossbow ? 1.7 : .9, .35, crossbow?0:e.duration); break;
      }
      case 'slash':
        this.slash(from, pos, e.tick, e.kind === 'cleave' || e.finisher === true, e.step);
        if (e.kind === 'transit') this.ring(pos, e.tick, e.finisher ? 2.3 : 1.25, e.finisher ? .48 : .32);
        break;
      case 'burst':
        if (e.kind === 'empower') this.cancel(e.id, 'empower');
        if (e.kind === 'bulwark') this.cancel(e.id, 'shield');
        this.ring(pos, e.tick, 2 * e.radius + 1.4, e.duration);
        this.ring(pos, e.tick, e.radius + 1.4, e.duration, .1);
        if (e.kind === 'empower') for (let i = 0; i < 3; i++) {
          const to = pos.clone(), a = i * Math.PI * 2 / 3; to.x += Math.cos(a) * this.cell; to.y += Math.sin(a) * this.cell * .6;
          this.slash(pos, to, e.tick, false, i);
        } break;
      case 'judgment':
        this.add({ path: FX_SPRITE.sunlightJudgment, motion: 'pillar', from: pos, start: e.tick, seconds: .8,
          width: e.trait ? 1.05 : 1.45, height: e.trait ? 3.2 : 4.35, opacity: 235 });
        this.ring(pos, e.tick, e.trait ? 1.9 : 2.5, .7, .04);
        if (e.trait) this.ring(pos, e.tick, 1.3, .45, .12); break;
      case 'warning':
        this.add({ path: FX_SPRITE.sunlightSigil, motion: 'ring', from: pos, start: e.tick, seconds: e.duration,
          width: e.kind === 'judgment' ? 1.7 : 1.1, height: e.kind === 'judgment' ? 1.7 : 1.1,
          spin: -70, opacity: 180, follow: e.targetId }); break;
      case 'prayer':
        this.add({ path: FX_SPRITE.sunlightSigil, motion: 'ring', from: pos, start: e.tick, seconds: e.duration,
          width: 2 * e.radius + 1.2, height: 2 * e.radius + 1.2, spin: 50, opacity: 150 });
        for (let i = 0; i < 3; i++) {
          const light = pos.clone(); light.x += (i - 1) * this.cell * .6;
          this.add({ path: FX_SPRITE.sunlightJudgment, motion: 'pillar', from: light, start: e.tick + i * 2,
            seconds: Math.min(1.2, e.duration), width: .5, height: 2.5, opacity: 90 });
        } break;
      case 'formation':
        if (e.kind === 'empower') {
          this.cancel(e.id, 'empower');
          for (let i = 0; i < 3; i++) this.add({ path: FX_SPRITE.sunlightSlash, motion: 'orbit', from: pos.clone(),
            start: e.tick, seconds: e.duration, width: .7, height: .65, phase: i * Math.PI * 2 / 3,
            follow: e.id, tag: 'empower', opacity: 185 });
        } else this.add({ path: FX_SPRITE.sunlightSigil, motion: 'ring', from: pos, start: e.tick, seconds: .8,
          width: 1.7, height: 1.7, follow: e.id, spin: 90, opacity: 190 });
        break;
      case 'flare': this.ring(pos, e.tick, 1.1, .4); break;
    }
  }
  private showField(tick: number): void {
    if (this.fieldStarted) return;
    this.fieldStarted = true;
    const width = this.boardSize.width / this.cell * 1.1;
    this.add({ path: FX_SPRITE.sunlightField, motion: 'field', from: new Vec3(), start: tick, seconds: Infinity,
      width, height: width, spin: 3, opacity: 115, ground: true });
    this.add({ path: FX_SPRITE.sunlightSigil, motion: 'wave', from: new Vec3(), start: tick, seconds: Infinity,
      width, height: width, spin: -6, opacity: 55, ground: true });
    for (let i = 0; i < 8; i++) this.add({ path: FX_SPRITE.sunlightSigil, motion: 'mote', from: new Vec3(),
      start: tick, seconds: Infinity, width: .16, height: .16, phase: i, opacity: 135, ground: true });
  }
  update(tick: number): void {
    for (const slot of this.slots) {
      const layer = slot.layer; if (!layer) continue;
      const age = (tick-layer.start)*this.tickMs/1000, p = age/layer.seconds;
      if (p >= 1) { this.release(slot); continue; }
      if (age < 0) { slot.node.active = false; continue; }
      const owner = layer.follow === undefined ? undefined : this.owner(layer.follow);
      const status = layer.follow === undefined ? undefined : this.status(layer.follow);
      if (layer.follow !== undefined && (!owner?.isValid || !status?.alive || layer.tag === 'shield' && status.shield <= 0
        || layer.tag === 'empower' && !status.empowered)) { this.release(slot); continue; }
      const base = owner?.position ?? layer.from, ease = 1-Math.pow(1-Math.min(1,p),3);
      let x = base.x, y = base.y, sx = 1, sy = 1, angle = layer.angle ?? 0, spin = 0, alpha = layer.opacity ?? 200;
      const fade = Math.min(1, age/.08, (1-p)*8);
      if (layer.motion === 'travel') {
        x += (layer.to!.x-layer.from.x)*p; y += (layer.to!.y-layer.from.y)*p;
        sx = sy = .8 + p*.3; alpha *= Math.min(1,(1-p)*5);
      } else if (layer.motion === 'slash') {
        sx = sy = .6+ease*.55; angle += (layer.spin ?? 0)*p; alpha *= Math.sin(Math.PI*Math.min(1,p*1.1));
      } else if (layer.motion === 'pillar') {
        sx = .75+Math.sin(Math.PI*p)*.25; sy = .45+Math.min(1,age/.12)*.55;
        y += this.cell*.6*(1-Math.min(1,age/.12)); alpha *= fade;
      } else if (layer.motion === 'shield') {
        sx = sy = Math.min(1,age/.15)*(1+Math.sin(age*4)*.025); y += this.cell*.15; alpha *= fade;
      } else if (layer.motion === 'orbit') {
        const a = (layer.phase ?? 0)+age*3; x += Math.cos(a)*this.cell*.62; y += Math.sin(a)*this.cell*.3+this.cell*.25;
        angle = a*180/Math.PI; alpha *= fade;
      } else if (layer.motion === 'field' || layer.motion === 'wave' || layer.motion === 'mote') {
        const ratio = this.boardSize.height/this.boardSize.width;
        if (layer.motion === 'field') {
          sx = 1+Math.sin(age*1.4)*.025; sy = sx*ratio; spin = age*(layer.spin ?? 0);
          alpha *= Math.min(1,age/.5)*(.88+Math.sin(age*1.7)*.12);
        } else if (layer.motion === 'wave') {
          const phase = age%2/2; sx = .12+phase*.9; sy = sx*ratio;
          spin = age*(layer.spin ?? 0); alpha *= Math.sin(Math.PI*phase)*Math.min(1,age/.5);
        } else {
          const seed = layer.phase ?? 0, phase = (age*.23+seed*.127)%1, a = seed*Math.PI/4+age*.035;
          x = Math.cos(a)*this.boardSize.width*.44; y = Math.sin(a)*this.boardSize.height*.42+phase*this.cell*.35;
          sx = sy = .6+phase*.6; alpha *= Math.sin(Math.PI*phase)*Math.min(1,age/.5); spin = age*25;
        }
      } else {
        sx = layer.motion === 'burst' ? .25+ease*.95 : layer.motion === 'charge' ? 1.3-ease*.65 : 1+Math.sin(age*4)*.025;
        sy = sx*.55; spin = age*(layer.spin ?? 30);
        alpha *= layer.motion === 'burst' ? Math.sin(Math.PI*Math.min(1,p*1.1))*(1-p*.4) : fade;
      }
      slot.node.active = !!slot.sprite.spriteFrame; slot.node.setPosition(x,y,0); slot.node.setScale(sx,sy,1);
      slot.node.angle = angle; slot.sprite.node.angle = spin; slot.opacity.opacity = Math.max(0,Math.min(255,Math.round(alpha)));
    }
  }
  private release(slot: Slot): void { slot.layer = undefined; slot.lease++; slot.node.active = false; slot.opacity.opacity = 0; }
  cancel(id: number, tag?: Layer['tag']): void { for (const s of this.slots) if (s.layer?.follow === id && (!tag || s.layer.tag === tag)) this.release(s); }
  clear(): void { for (const s of this.slots) this.release(s); this.fieldStarted = false; }
  destroy(): void {
    this.disposed = true; this.clear(); for (const s of this.slots) if (s.node.isValid) s.node.destroy();
    if (this.ground?.isValid) this.ground.destroy(); this.ground = null; this.slots = []; this.frames.clear(); this.pending.clear();
  }
}
