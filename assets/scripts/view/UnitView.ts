import { loadArtSprite } from './ArtSpriteLoader';
import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Vec3, resources, Tween, UIOpacity, Graphics, Color, Label, LabelOutline } from 'cc';
import { UnitRuntime, EquipmentConfigData } from '../battle/types';
import { UNIT_SPRITE, UI_SPRITE, FX_SPRITE, unitSpriteKey } from './ArtPaths';
import { drawFactionRing } from './FactionRing';
import { setStarBadge } from '../ui/UISkin';
import { healthBarSegments } from './HealthBar';
import { createHealthBarClip } from './HealthBarClip';
import { maxHealthArtworkScale } from './UnitHealthScale';

const { ccclass } = _decorator;

/**
 * 棋子视图。
 * - 挂在棋盘节点的子节点上，由 BattleStage 按 sim.units 创建。
 * - 每帧同步 sim 快照：位置插值、血条/蓝条、死亡淡出。
 * - 只读 sim，不回写逻辑状态。
 */
@ccclass('UnitView')
export class UnitView extends Component {
  unitId = 0;
  side: 0 | 1 = 0;
  cfgId = '';

  private bodySprite: Sprite;
  private bodyBaseY = 0;
  private portraitHeight = 0;
  private healthScale = 1;
  private spiderRaised = false;
  private attackMotion: Node;
  private hpFill: Sprite;
  private shieldFill: Sprite;
  private manaFill: Sprite;
  private hpBarBg: Node;
  private hpBarContent: Node;
  private loaded = false;
  loadError = '';
  get visualReady(): boolean { return this.loaded; }
  private starBadge: Node;
  private shadowView: Node;
  private domainView: Node;
  private sunlightAura: Node;
  private cellSize = 64;
  private equipmentIcons: Node[] = [];
  private equipmentKey = "";
  private equipmentStackLabels: Label[] = [];
  private equipmentStackSlots: number[] = [];
  private bodyOpacity: UIOpacity;
  private shieldRing: Node;
  private stellarAura: Node | null = null;
  private stellarFrames: Array<SpriteFrame | undefined> = [];
  private stellarFrameIndex = 0;
  private stellarRaised = false;
  displayedStar = 1;
  private upgradeEffect: Node | null = null;
  private upgradeElapsed = 0;
  private cleaveWinding = false;
  private windPreparing = false;
  private expeditionPreparing = false;
  private demonPreparing=false;
  private baseBodyColor=new Color(255,255,255);
  private attackStart=-Infinity;
  private attackDirection=new Vec3();
  private hitStart=-Infinity;
  private castUntil=-Infinity;
  private deathStart:number|null=null;

  resetCombatAnimation():void {
    this.attackStart=this.hitStart=this.castUntil=-Infinity;this.deathStart=null;
    if(this.attackMotion){Tween.stopAllByTarget(this.attackMotion);this.attackMotion.setPosition(0,0,0);this.attackMotion.angle=0;this.attackMotion.setScale(1,1,1);}
    this.cleaveWinding=this.windPreparing=this.expeditionPreparing=this.demonPreparing=false;
    if(this.bodySprite){Tween.stopAllByTarget(this.bodySprite);this.bodySprite.color=this.baseBodyColor;}
    const opacity=this.node.getComponent(UIOpacity);if(opacity){Tween.stopAllByTarget(opacity);opacity.opacity=255;}
  }

  syncCombatAnimation(tick:number,tickMs:number,casting:boolean,controlled:boolean):void {
    if(!this.loaded)return;
    if(controlled){this.attackStart=-Infinity;this.castUntil=-Infinity;}
    if(!casting)this.castUntil=-Infinity;
    this.bodySprite.color=tick-this.hitStart<120/tickMs?new Color(255,90,90,255):tick<this.castUntil?new Color(195,70,255,255):this.baseBodyColor;
    if(!this.cleaveWinding&&!this.windPreparing&&!this.expeditionPreparing&&!this.demonPreparing){
      const p=(tick-this.attackStart)*tickMs/80;
      const rise=p>=0&&p<2?1-Math.abs(p-1):0;
      this.attackMotion.setPosition(this.attackDirection.x*6*rise,this.attackDirection.y*6*rise,0);
    }
    if(this.deathStart!==null){
      const p=Math.max(0,(tick-this.deathStart)*tickMs/350);
      this.node.getComponent(UIOpacity)!.opacity=Math.round(255*Math.max(0,1-p));
      if(p>=1)this.node.active=false;
    }
  }

  /** A separate overlay never changes the drag, attack, or replay transforms. */
  playStarUpgrade(): void {
    if (this.displayedStar < 2) return;
    this.upgradeEffect?.destroy();
    const root = new Node('starUpgrade'); this.node.addChild(root);
    root.addComponent(UITransform).setContentSize(this.cellSize * 3, this.cellSize * 3);
    root.addComponent(Graphics);
    root.addComponent(UIOpacity);
    const caption = new Node('upgradeCaption'); root.addChild(caption);
    caption.addComponent(UITransform).setContentSize(180, 36);
    const text = caption.addComponent(Label);
    text.string = `${this.displayedStar}星升级`;
    text.fontSize = 22; text.lineHeight = 30;
    text.color = this.displayedStar === 3 ? new Color(255, 218, 100) : new Color(195, 235, 255);
    const outline = caption.addComponent(LabelOutline); outline.color = new Color(26, 32, 54); outline.width = 2;
    this.upgradeEffect = root; this.upgradeElapsed = 0;
    this.update(0);
  }

  update(dt: number): void {
    const root = this.upgradeEffect;
    if (!root?.isValid) return;
    this.upgradeElapsed += Math.max(0, dt);
    const t = this.upgradeElapsed / 1.1;
    if (t >= 1) { root.destroy(); this.upgradeEffect = null; return; }
    const g = root.getComponent(Graphics)!; g.clear();
    const gold = this.displayedStar === 3;
    const color = gold ? new Color(255, 211, 86, 230) : new Color(165, 222, 255, 230);
    g.strokeColor = color; g.fillColor = color; g.lineWidth = gold ? 4 : 3;
    const radius = this.cellSize * (0.28 + t * 0.9);
    g.ellipse(0, 0, radius, radius * 0.5); g.stroke();
    const count = gold ? 12 : 8;
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * 0.8 + t * 34;
      const size = (gold ? 7 : 5) * (1 - t * 0.5);
      for (let point = 0; point < 10; point++) {
        const a = point * Math.PI / 5 + Math.PI / 2;
        const r = point % 2 ? size * 0.42 : size;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (!point) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.close(); g.fill();
    }
    root.getComponent(UIOpacity)!.opacity = 255 * Math.min(1, (1 - t) / 0.35);
    root.getChildByName('upgradeCaption')!.setPosition(0, this.cellSize * 1.25 + t * 26, 0);
  }


  setup(cfgId: string, side: 0 | 1, unitId: number, cellSize: number, artId = cfgId, tint?: string, portraitScale = 0.82) {
    this.cellSize = cellSize;
    this.unitId = unitId;
    this.side = side;
    this.cfgId = cfgId;

    const size = cellSize * 0.82;
    const portraitSize = cellSize * portraitScale;
    this.portraitHeight = portraitSize;
    const raised = portraitSize - size;
    this.attackMotion = new Node('attackMotion'); this.node.addChild(this.attackMotion);
    const body = new Node('body');
    body.addComponent(UITransform).setContentSize(portraitSize, portraitSize);
    this.bodySprite = body.addComponent(Sprite);
    this.bodySprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.bodySprite.trim = false;
    this.attackMotion.addChild(body);
    this.bodyOpacity = body.addComponent(UIOpacity);
    // Keep feet on the faction ring when the board portrait grows upward.
    body.setPosition(0, raised / 2, 0);
    this.bodyBaseY = raised / 2;
    this.shieldRing = new Node('shieldRing');
    this.node.addChild(this.shieldRing);
    this.shieldRing.setPosition(0, raised / 2, 0);
    const shield = this.shieldRing.addComponent(Graphics);
    shield.strokeColor = new Color(255, 218, 104, 230); shield.lineWidth = 3;
    shield.ellipse(0, 0, portraitSize * 0.52, portraitSize * 0.56); shield.stroke();
    this.shieldRing.active = false;

    // Faction and rank have independent visual markers.
    const base = new Node('factionRing');
    this.node.addChild(base);
    drawFactionRing(base.addComponent(Graphics), size, side);
    this.starBadge = new Node('starBadge');
    this.starBadge.addComponent(UITransform).setContentSize(size * 1.2, size * 0.4);
    this.starBadge.setPosition(0, size * 0.95 + raised, 0);
    this.node.addChild(this.starBadge);
    this.setStar(1);

    this.hpBarBg = new Node('hpBar');
    this.hpBarBg.addComponent(UITransform).setContentSize(size * 0.9, 6);
    this.hpBarBg.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.setPosition(0, size * 0.62 + raised, 0);
    this.node.addChild(this.hpBarBg);

    const innerWidth = Math.max(0, size * 0.9 - 2);
    this.hpBarContent = createHealthBarClip(this.hpBarBg, innerWidth, 4);

    const hpFillNode = new Node('hpFill');
    hpFillNode.addComponent(UITransform).setContentSize(innerWidth, 4);
    hpFillNode.getComponent(UITransform).setAnchorPoint(0, 0.5);
    this.hpFill = hpFillNode.addComponent(Sprite);
    this.hpFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarContent.addChild(hpFillNode);
    hpFillNode.setPosition(-innerWidth / 2, 0, 0);

    const shieldFillNode = new Node('shieldFill');
    shieldFillNode.addComponent(UITransform).setContentSize(innerWidth, 4);
    shieldFillNode.getComponent(UITransform).setAnchorPoint(0, 0.5);
    this.hpBarContent.addChild(shieldFillNode);
    this.shieldFill = shieldFillNode.addComponent(Sprite);
    this.shieldFill.sizeMode = Sprite.SizeMode.CUSTOM;
    shieldFillNode.setPosition(-innerWidth / 2, 0, 0);
    shieldFillNode.active = false;

    const manaFillNode = new Node('manaFill');
    manaFillNode.addComponent(UITransform).setContentSize(size * 0.9, 3);
    manaFillNode.getComponent(UITransform).setAnchorPoint(0, 0.5);
    this.manaFill = manaFillNode.addComponent(Sprite);
    this.manaFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(manaFillNode);
    manaFillNode.setPosition(-size * 0.9 / 2, -6, 0);

    const key = unitSpriteKey(artId, side);
    const path = UNIT_SPRITE[key];
    if (!path) { this.loadError = `No sprite for ${key}`; console.warn(`[UnitView] no sprite for ${key}`); return; }
    resources.load(path, SpriteFrame, (err, sf) => {
      if (!this.isValid) return;
      if (err) { this.loadError = err.message; console.warn(`[UnitView] load failed: ${path}`, err.message); return; }
      this.bodySprite.spriteFrame = sf;
      if (path.includes('/units/shadow/') || path.includes('/units/sunlight/') || path.includes('/units/mechanical/') || path.includes('/units/astral/') || path.includes('/units/bloodfiend/')) body.getComponent(UITransform)!.setContentSize(portraitSize * (sf.originalSize?.width ?? sf.rect.width) / (sf.originalSize?.height ?? sf.rect.height), portraitSize);
      if(this.cfgId==='cloud_dragon_priestess'){
        this.humanFrame=sf;
        if(this.dragonAppearance){this.dragonAppearance=false;this.setDragonAppearance(true,0);}
      }
      this.loaded = true;
      this.refreshBarsColor();
    });
    this.bodySprite.color = Color.WHITE;
    if (tint) { const color = new Color(); color.fromHEX(tint); this.bodySprite.color = color; }
    this.baseBodyColor=this.bodySprite.color.clone();
  }


  /** Rank uses the supplied one-, two-, and three-star image badges. */
  setStar(star: number): void {
    this.displayedStar = star;
    if (this.starBadge) setStarBadge(this.starBadge, star);
  }

  /** Reserve pieces keep their rank and equipment, while hiding combat vitals. */
  setVitalsVisible(visible: boolean): void {
    this.hpBarBg.active = visible;
    for (const icon of this.equipmentIcons) icon.setPosition(icon.position.x, this.hpBarBg.position.y - (visible ? 17 : 0), 0);
  }

  private dragonAppearance=false;
  private humanFrame:SpriteFrame|null=null;
  setDragonAppearance(active:boolean,tick:number):void {
    if(this.cfgId!=='cloud_dragon_priestess'||!this.bodySprite)return;
    if(active!==this.dragonAppearance){
      this.dragonAppearance=active;
      if(!this.humanFrame)this.humanFrame=this.bodySprite.spriteFrame;
      const apply=(frame:SpriteFrame)=>{if(!this.isValid||this.dragonAppearance!==active)return;
        this.bodySprite.spriteFrame=frame;this.bodySprite.node.getComponent(UITransform)!.setContentSize(this.portraitHeight*(frame.originalSize.width/frame.originalSize.height),this.portraitHeight);};
      if(active)loadArtSprite('art/units/astral/cloud_dragon_form/spriteFrame',(error,frame)=>{if(!error)apply(frame);});
      else if(this.humanFrame)apply(this.humanFrame);
    }
    if(active){this.bodySprite.node.angle=Math.sin(tick*.14)*3;this.bodySprite.node.setPosition(0,this.bodyBaseY+Math.sin(tick*.18)*this.cellSize*.05,0);}
    else {this.bodySprite.node.angle=0;this.bodySprite.node.setPosition(0,this.bodyBaseY,0);}
  }

  /** Grow artwork about its feet; keep root movement/hit area and UI dimensions independent. */
  setMaxHealthAppearance(role: string | undefined, baseMaxHp: number, maxHp: number): void {
    const scale = maxHealthArtworkScale(role, baseMaxHp, maxHp);
    if (!this.bodySprite || scale === this.healthScale) return;
    const rise = this.portraitHeight * (scale - this.healthScale);
    this.healthScale = scale;
    const body = this.bodySprite.node;
    body.setScale(scale, scale, 1);
    this.bodyBaseY += rise / 2;
    body.setPosition(body.position.x, body.position.y + rise / 2, body.position.z);
    for (const node of [this.hpBarBg, this.starBadge, ...this.equipmentIcons])
      if (node) node.setPosition(node.position.x, node.position.y + rise, node.position.z);
    if (this.shieldRing) {
      this.shieldRing.setScale(scale, scale, 1);
      this.shieldRing.setPosition(0, this.shieldRing.position.y + rise / 2, 0);
    }
  }

  setEquipment(items: EquipmentConfigData[]): void {
    const key = items.map(item => item.icon).join('|');
    if (key === this.equipmentKey) return; this.equipmentKey = key;
    for (const node of this.equipmentIcons) node.destroy(); this.equipmentIcons = [];
    this.equipmentStackLabels = [];
    this.equipmentStackSlots = [];
    items.slice(0, 3).forEach((item, i) => {
      const node = new Node('carriedEquipment'); node.addComponent(UITransform).setContentSize(12, 12);
      const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      this.node.addChild(node);
      node.setPosition((i - (items.length - 1) / 2) * 14, this.hpBarBg.position.y - (this.hpBarBg.active ? 17 : 0), 0);
      this.equipmentIcons.push(node);
      if (item.attackSpeedPerAttack > 0 || (item.physicalPowerPerAttack ?? 0) > 0 || item.damageTakenStacks) {
        const counter = new Node('equipmentStacks'); node.addChild(counter);
        counter.addComponent(UITransform).setContentSize(12, 10); counter.setPosition(0, -2, 0);
        const text = counter.addComponent(Label); text.fontSize = 8; text.lineHeight = 10;
        text.overflow = Label.Overflow.SHRINK; text.enableWrapText = false;
        text.color = Color.WHITE; text.isBold = true; text.string = '0';
        const outline = counter.addComponent(LabelOutline); outline.color = new Color(8, 17, 23);
        outline.width = 1;
        this.equipmentStackLabels.push(text);
        this.equipmentStackSlots.push(i);
      }
      loadArtSprite(item.icon, (err, frame) => { if (!err && sprite.isValid) sprite.spriteFrame = frame; });
    });
  }

  private refreshBarsColor() {
    if (!this.hpFill || !this.manaFill) return;
    const loadSf = (p: string, cb: (sf: SpriteFrame) => void) =>
      resources.load(p, SpriteFrame, (e, sf) => { if (!e && sf && this.isValid) cb(sf); });
    loadSf(UI_SPRITE.barBg, sf => { if (this.hpBarBg) this.hpBarBg.getComponent(Sprite).spriteFrame = sf; });
    loadSf(this.side === 0 ? UI_SPRITE.hpFillAlly : UI_SPRITE.hpFillEnemy, sf => { if (this.hpFill) this.hpFill.spriteFrame = sf; });
    loadSf(UI_SPRITE.shieldFill, sf => { if (this.shieldFill) this.shieldFill.spriteFrame = sf; });
    if (this.side === 0) loadSf(UI_SPRITE.manaFill, sf => { if (this.manaFill) this.manaFill.spriteFrame = sf; });
    else this.manaFill.node.active = false;
  }

  /** Vitals and effects only; BattleReplayer owns the root's smooth travel position. */
  sync(snap: UnitRuntime, cellSize: number) {
    this.setMaxHealthAppearance(snap.role, snap.baseMaxHp, snap.maxHp);
    if (snap.sunlightShield && !this.sunlightAura) {
      const node = new Node('sunlightShield'); this.node.addChild(node); this.sunlightAura = node;
      node.addComponent(UITransform).setContentSize(cellSize * 1.3, cellSize * 1.3);
      node.addComponent(UIOpacity);
      const art = new Node('sunlightBarrierArt'); node.addChild(art);
      art.addComponent(UITransform).setContentSize(cellSize * 1.12, cellSize * 1.5); art.setPosition(0, cellSize * .13, 0);
      const sprite = art.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      art.addComponent(UIOpacity).opacity = 105;
      resources.load(FX_SPRITE.sunlightBarrier, SpriteFrame, (error, frame) => { if (!error && art.isValid) sprite.spriteFrame = frame; });
      const g = node.addComponent(Graphics); g.lineWidth = 2; g.strokeColor = new Color(255, 213, 112, 210);
      g.fillColor = new Color(255, 199, 73, 24); g.ellipse(0, cellSize * .13, cellSize * .47, cellSize * .55); g.fill(); g.stroke();
    }
    if (this.sunlightAura) this.sunlightAura.active = snap.alive && (snap.sunlightShield ?? 0) > 0;
    if (snap.domainRadius && !this.domainView) {
      const aura = new Node('shadowDomain');
      const diameter = (snap.domainRadius * 2 + 1) * cellSize;
      aura.addComponent(UITransform).setContentSize(diameter, diameter * .6);
      const sprite = aura.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      sprite.color = new Color(150, 180, 220, 190);
      aura.addComponent(UIOpacity).opacity = 160;
      this.node.addChild(aura); aura.setSiblingIndex(0); this.domainView = aura;
      resources.load(FX_SPRITE.shadowCorruption, SpriteFrame, (err, frame) => { if (!err && aura.isValid) sprite.spriteFrame = frame; });
    }
    if (this.domainView) this.domainView.active = !!snap.domainRadius;
    if (snap.shadowCorrupted && !this.shadowView) {
      const aura = new Node('shadowCorruption');
      aura.addComponent(UITransform).setContentSize(cellSize * 1.2, cellSize * 1.5);
      aura.addComponent(UIOpacity).opacity = 225;
      this.node.addChild(aura); this.shadowView = aura;
      const sprites: Sprite[] = [];
      for (let i=0;i<3;i++) {
        const wisp = new Node(`corruptionWisp${i}`);aura.addChild(wisp);
        wisp.addComponent(UITransform).setContentSize(cellSize*.47,cellSize*1.41);
        const sprite=wisp.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;sprite.trim=false;
        wisp.addComponent(UIOpacity).opacity=0;sprites.push(sprite);
      }
      resources.load(FX_SPRITE.shadowWisp, SpriteFrame, (err, frame) => {
        if (!err && aura.isValid) for(const sprite of sprites) if(sprite.isValid!==false) sprite.spriteFrame=frame;
      });
    }
    if (this.shadowView) this.shadowView.active = !!snap.shadowCorrupted;
    this.equipmentStackLabels.forEach((text, i) => { text.string = String(snap.equipmentStacks?.[this.equipmentStackSlots[i]] ?? snap.equipmentAttackStacks ?? 0); });
    if (this.bodyOpacity) this.bodyOpacity.opacity = snap.untargetable ? 80 : 255;
    if (this.bodySprite && !!snap.spiderAirborne !== this.spiderRaised) {
      this.spiderRaised = !!snap.spiderAirborne;
      this.bodySprite.node.setPosition(0, this.bodyBaseY + (this.spiderRaised ? this.cellSize * .8 : 0), 0);
    }
    if (this.shieldRing) this.shieldRing.active = (snap.shield ?? 0) > 0;
    const segments = healthBarSegments(snap.hp, snap.maxHp, snap.shield);
    const barWidth = this.hpBarContent.getComponent(UITransform).contentSize.width;
    if (this.hpFill) {
      this.hpFill.node.getComponent(UITransform).setContentSize(
        segments.health * barWidth,
        4,
      );
    }
    if (this.shieldFill) {
      const width = segments.shield * barWidth;
      this.shieldFill.node.active = width > 0;
      this.shieldFill.node.setPosition(-barWidth / 2 + segments.health * barWidth, 0, 0);
      this.shieldFill.node.getComponent(UITransform).setContentSize(width, 4);
    }
    if (this.manaFill) this.manaFill.node.active = this.side === 0 && snap.maxMana > 0;
    if (this.manaFill && this.side === 0) {
      this.manaFill.node.getComponent(UITransform).setContentSize(
        (snap.maxMana > 0 ? Math.max(0, Math.min(1, snap.mana / snap.maxMana)) : 0)
          * this.hpBarBg.getComponent(UITransform).contentSize.width,
        3,
      );
    }
  }

  /** Skill shield and airborne travel follow the replay clock, including pause. */
  animateStellar(shielded: boolean, knockup: number | null, renderTick: number, tickMs: number): void {
    if (shielded && !this.stellarAura) {
      this.stellarAura = new Node('stellarBarrier'); this.node.addChild(this.stellarAura);
      this.stellarAura.layer = this.node.layer;
      // The atlas keeps transparent frame gutters; compensate so the ring surrounds the portrait.
      this.stellarAura.addComponent(UITransform).setContentSize(this.cellSize*2.1,this.cellSize*2.2);
      this.stellarAura.addComponent(UIOpacity);
      const sprite = this.stellarAura.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = false;
      for (let i = 0; i < 8; i++) loadArtSprite(`${FX_SPRITE.stellarSkillSheet}#${i},4,4`, (error, frame) => {
        if (error || !frame || !this.isValid || !sprite.isValid) return;
        this.stellarFrames[i] = frame;
        if (this.stellarFrameIndex === i) sprite.spriteFrame = frame;
      });
      this.stellarAura.setPosition(0,this.bodyBaseY+this.cellSize*.12,0);
      this.stellarAura.setSiblingIndex(this.shieldRing.getSiblingIndex());
    }
    if (this.stellarAura) {
      this.stellarAura.active=shielded;
      if (shielded) this.shieldRing.active=false;
      const phase=renderTick*tickMs/1000;
      this.stellarFrameIndex = Math.floor(phase*12)%8;
      this.stellarAura.getComponent(Sprite)!.spriteFrame = this.stellarFrames[this.stellarFrameIndex] ?? null;
      const scale=1+Math.sin(phase*3)*.035;
      this.stellarAura.setScale(scale,scale,1);
      this.stellarAura.angle=0;
      this.stellarAura.getComponent(UIOpacity)!.opacity=170+Math.round(Math.sin(phase*3)*30);
    }
    if (this.bodySprite && (knockup!==null || this.stellarRaised)) {
      this.stellarRaised=knockup!==null;
      const rise=knockup===null?0:Math.sin(Math.PI*Math.max(0,Math.min(1,knockup)))*this.cellSize*.6;
      this.bodySprite.node.setPosition(0,this.bodyBaseY+(this.spiderRaised?this.cellSize*.8:0)+rise,0);
    }
  }

  animateSunlight(renderTick: number, tickMs: number, cellSize = this.cellSize): void {
    const seconds = renderTick * tickMs / 1000;
    if (this.sunlightAura?.active) {
      const phase = seconds * 2.4 + this.unitId * .6;
      const scale = 1 + Math.sin(phase) * .035;
      this.sunlightAura.setScale(scale, scale, 1);
      this.sunlightAura.getComponent(UIOpacity)!.opacity = 190 + Math.round(Math.sin(phase) * 35);
      const g = this.sunlightAura.getComponent(Graphics)!;
      g.clear(); g.lineWidth = 2; g.strokeColor = new Color(255, 213, 112, 210);
      g.fillColor = new Color(255, 199, 73, 24);
      g.ellipse(0, cellSize * .13, cellSize * .47, cellSize * .55); g.fill(); g.stroke();
      // Three orbiting sparks make the surviving faction shield readable during travel.
      for (let i = 0; i < 3; i++) {
        const angle = seconds * 1.3 + i * Math.PI * 2 / 3;
        g.fillColor = new Color(255, 239, 173, 230);
        g.ellipse(Math.cos(angle) * cellSize * .47, cellSize * .13 + Math.sin(angle) * cellSize * .55, cellSize * .035, cellSize * .035); g.fill();
      }
    }
  }

  animateShadowCorruption(renderTick: number, tickMs: number, cellSize = this.cellSize): void {
    if (!this.shadowView?.active) return;
    const seconds=renderTick*tickMs/1000;
    this.shadowView.children.forEach((wisp,index)=>{
      const phase=(seconds*.65+index/3+(this.unitId%7)*.07)%1;
      const x=((index-1)*.24+Math.sin(seconds*2+index*2)*.09)*cellSize;
      wisp.setPosition(x,(-.18+phase*.66)*cellSize,0);
      const scale=.8+phase*.25;wisp.setScale((index%2?-1:1)*scale,scale,1);
      wisp.angle=Math.sin(seconds*1.6+index)*7;
      wisp.getComponent(UIOpacity)!.opacity=Math.round(Math.sin(Math.PI*phase)*(110+index*12));
    });
  }

  playRevive(): void {
    this.resetCombatAnimation();
    const opacity=this.node.getComponent(UIOpacity);
    if(opacity){Tween.stopAllByTarget(opacity);opacity.opacity=255;}
    this.node.active=true;
  }

  playDeath(tick=0) {
    this.resetCombatAnimation();this.deathStart=tick;
    if (!this.node.active) return;
    this.animateStellar(false,null,0,50);
    this.animateBloodCleave(null);
    if (this.shadowView) this.shadowView.active = false;
    if (this.domainView) this.domainView.active = false;
    if (this.sunlightAura) this.sunlightAura.active = false;
    let op = this.node.getComponent(UIOpacity);
    if (!op) op = this.node.addComponent(UIOpacity);
  }

  playHit(tick=0) {this.hitStart=tick;}

  playAttack(dirToTarget: Vec3,tick=0) {
    this.attackStart=tick;this.attackDirection.set(dirToTarget);
  }

  /** Preparation pose follows the fixed replay tick, including pause and interruption. */
  animateBloodCleave(progress: number | null, direction?: Vec3): void {
    if(!this.loaded||!this.attackMotion)return;
    if(progress===null){
      if(this.cleaveWinding){this.attackMotion.setPosition(0,0,0);this.attackMotion.angle=0;this.cleaveWinding=false;}
      return;
    }
    if(!this.cleaveWinding)Tween.stopAllByTarget(this.attackMotion);
    this.cleaveWinding=true;
    const length=direction?Math.hypot(direction.x,direction.y):0;
    const dx=length?direction!.x/length:1,dy=length?direction!.y/length:0;
    const pull=this.cellSize*.16*Math.sin(progress*Math.PI/2);
    this.attackMotion.setPosition(-dx*pull,-dy*pull,0);this.attackMotion.angle=(dx>=0?-1:1)*12*progress;
  }

  animateWindHunt(progress: number|null):void {
    if(!this.loaded||!this.attackMotion)return;
    if(progress===null){
      if(this.windPreparing){this.attackMotion.angle=0;this.attackMotion.setPosition(0,0,0);this.windPreparing=false;}
      return;
    }
    if(!this.windPreparing)Tween.stopAllByTarget(this.attackMotion);
    this.windPreparing=true;
    this.attackMotion.angle=-18*Math.max(0,Math.min(1,progress));
    this.attackMotion.setPosition(-4*progress,6*progress,0);
  }
  animateExpeditionCast(progress: number|null):void {
    if(!this.loaded||!this.attackMotion)return;
    if(progress===null){
      if(this.expeditionPreparing){this.attackMotion.angle=0;this.attackMotion.setPosition(0,0,0);this.expeditionPreparing=false;}
      return;
    }
    if(!this.expeditionPreparing)Tween.stopAllByTarget(this.attackMotion);
    this.expeditionPreparing=true;
    const p=Math.max(0,Math.min(1,progress));
    this.attackMotion.angle=-10*p;this.attackMotion.setPosition(0,8*Math.sin(p*Math.PI/2),0);
  }
  hideRavenBody():void {if(this.bodyOpacity)this.bodyOpacity.opacity=0;}
  animateDemonSpell(progress:number|null,spin:number|null):void {
    if(!this.loaded||!this.attackMotion)return;
    if(progress===null&&spin===null){
      if(this.demonPreparing){this.attackMotion.angle=0;this.attackMotion.setPosition(0,0,0);this.attackMotion.setScale(1,1,1);this.demonPreparing=false;}
      return;
    }
    if(!this.demonPreparing)Tween.stopAllByTarget(this.attackMotion);this.demonPreparing=true;
    if(spin!==null){
      this.attackMotion.angle=Math.sin(spin*Math.PI*2)*12;
      this.attackMotion.setScale(1-.18*Math.sin(spin*Math.PI*2)**2,1,1);this.attackMotion.setPosition(0,-3,0);
    }else{
      const p=Math.max(0,Math.min(1,progress!));this.attackMotion.angle=-12*p;this.attackMotion.setPosition(-4*p,-3*p,0);
    }
  }
  playCast(seconds:number,tick=0,tickMs=50) {this.castUntil=tick+seconds*1000/tickMs;}
}
