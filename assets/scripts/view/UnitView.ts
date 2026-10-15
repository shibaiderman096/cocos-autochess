import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Vec3, resources, tween, UIOpacity, Graphics, Color } from 'cc';
import { UnitRuntime, EquipmentConfigData } from '../battle/types';
import { UNIT_SPRITE, UI_SPRITE, FX_SPRITE, unitSpriteKey } from './ArtPaths';
import { drawFactionRing } from './FactionRing';
import { setStarBadge } from '../ui/UISkin';

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
  private hpFill: Sprite;
  private manaFill: Sprite;
  private hpBarBg: Node;
  private loaded = false;
  private starBadge: Node;
  private cellSize = 64;
  private equipmentIcons: Node[] = [];
  private equipmentKey = "";
  private bodyOpacity: UIOpacity;
  private shieldRing: Node;

  setup(cfgId: string, side: 0 | 1, unitId: number, cellSize: number, artId = cfgId, tint?: string, portraitScale = 0.82) {
    this.cellSize = cellSize;
    this.unitId = unitId;
    this.side = side;
    this.cfgId = cfgId;

    const size = cellSize * 0.82;
    const portraitSize = cellSize * portraitScale;
    const raised = portraitSize - size;
    const body = new Node('body');
    body.addComponent(UITransform).setContentSize(portraitSize, portraitSize);
    this.bodySprite = body.addComponent(Sprite);
    this.bodySprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.bodySprite.trim = false;
    this.node.addChild(body);
    this.bodyOpacity = body.addComponent(UIOpacity);
    // Keep feet on the faction ring when the board portrait grows upward.
    body.setPosition(0, raised / 2, 0);
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

    const hpFillNode = new Node('hpFill');
    hpFillNode.addComponent(UITransform).setContentSize(size * 0.9, 4);
    hpFillNode.getComponent(UITransform).setAnchorPoint(0, 0.5);
    this.hpFill = hpFillNode.addComponent(Sprite);
    this.hpFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(hpFillNode);
    hpFillNode.setPosition(-size * 0.9 / 2, 0, 0);

    const manaFillNode = new Node('manaFill');
    manaFillNode.addComponent(UITransform).setContentSize(size * 0.9, 3);
    manaFillNode.getComponent(UITransform).setAnchorPoint(0, 0.5);
    this.manaFill = manaFillNode.addComponent(Sprite);
    this.manaFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(manaFillNode);
    manaFillNode.setPosition(-size * 0.9 / 2, -6, 0);

    const key = unitSpriteKey(artId, side);
    const path = UNIT_SPRITE[key];
    if (!path) { console.warn(`[UnitView] no sprite for ${key}`); return; }
    resources.load(path, SpriteFrame, (err, sf) => {
      if (!this.isValid) return;
      if (err) { console.warn(`[UnitView] load failed: ${path}`, err.message); return; }
      this.bodySprite.spriteFrame = sf;
      this.loaded = true;
      this.refreshBarsColor();
    });
    this.bodySprite.color = Color.WHITE;
    if (tint) { const color = new Color(); color.fromHEX(tint); this.bodySprite.color = color; }
  }

  /** Rank uses the supplied one-, two-, and three-star image badges. */
  setStar(star: number): void {
    if (this.starBadge) setStarBadge(this.starBadge, star);
  }

  setEquipment(items: EquipmentConfigData[]): void {
    const key = items.map(item => item.icon).join('|');
    if (key === this.equipmentKey) return; this.equipmentKey = key;
    for (const node of this.equipmentIcons) node.destroy(); this.equipmentIcons = [];
    items.slice(0, 3).forEach((item, i) => {
      const node = new Node('carriedEquipment'); node.addComponent(UITransform).setContentSize(12, 12);
      const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      this.hpBarBg.addChild(node); node.setPosition((i - (items.length - 1) / 2) * 14, -17, 0);
      this.equipmentIcons.push(node);
      resources.load(item.icon, SpriteFrame, (err, frame) => { if (!err && sprite.isValid) sprite.spriteFrame = frame; });
    });
  }

  private refreshBarsColor() {
    if (!this.hpFill || !this.manaFill) return;
    const loadSf = (p: string, cb: (sf: SpriteFrame) => void) =>
      resources.load(p, SpriteFrame, (e, sf) => { if (!e && sf && this.isValid) cb(sf); });
    loadSf(UI_SPRITE.barBg, sf => { if (this.hpBarBg) this.hpBarBg.getComponent(Sprite).spriteFrame = sf; });
    loadSf(this.side === 0 ? UI_SPRITE.hpFillAlly : UI_SPRITE.hpFillEnemy, sf => { if (this.hpFill) this.hpFill.spriteFrame = sf; });
    if (this.side === 0) loadSf(UI_SPRITE.manaFill, sf => { if (this.manaFill) this.manaFill.spriteFrame = sf; });
    else this.manaFill.node.active = false;
  }

  /** 每帧由 BattleReplayer 调用：用 sim 快照 + 目标世界坐标驱动视图 */
  sync(snap: UnitRuntime, targetPos: Vec3, cellSize: number, dt: number) {
    if (this.bodyOpacity) this.bodyOpacity.opacity = snap.untargetable ? 80 : 255;
    if (this.shieldRing) this.shieldRing.active = (snap.shield ?? 0) > 0;
    const cur = this.node.position;
    const k = Math.min(1, dt * 12);
    this.node.setPosition(
      cur.x + (targetPos.x - cur.x) * k,
      cur.y + (targetPos.y - cur.y) * k,
      0,
    );
    if (this.hpFill) {
      this.hpFill.node.getComponent(UITransform).setContentSize(
        (snap.maxHp > 0 ? Math.max(0, Math.min(1, snap.hp / snap.maxHp)) : 0)
          * this.hpBarBg.getComponent(UITransform).contentSize.width,
        4,
      );
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

  playDeath() {
    if (!this.node.active) return;
    let op = this.node.getComponent(UIOpacity);
    if (!op) op = this.node.addComponent(UIOpacity);
    tween(op)
      .to(0.35, { opacity: 0 })
      .call(() => { this.node.active = false; })
      .start();
  }

  playHit() {
    if (!this.bodySprite || !this.loaded) return;
    const orig = this.bodySprite.color.clone();
    this.bodySprite.color = new Color(255, 90, 90, 255);
    tween(this.bodySprite)
      .to(0.12, {})
      .call(() => { if (this.bodySprite) this.bodySprite.color = orig; })
      .start();
  }

  playAttack(dirToTarget: Vec3) {
    if (!this.loaded) return;
    const orig = this.node.position.clone();
    const lunge = new Vec3(dirToTarget.x * 6, dirToTarget.y * 6, 0);
    tween(this.node)
      .to(0.08, { position: new Vec3(orig.x + lunge.x, orig.y + lunge.y, 0) })
      .to(0.08, { position: orig })
      .start();
  }

  playCast(seconds: number) {
    if (!this.bodySprite || !this.loaded) return;
    const orig = this.bodySprite.color.clone();
    this.bodySprite.color = new Color(195, 70, 255, 255);
    tween(this.bodySprite).to(seconds, {}).call(() => {
      if (this.bodySprite) this.bodySprite.color = orig;
    }).start();
  }

  playBlackFlame(seconds: number) {
    const impact = new Node('blackFlameImpact');
    const transform = impact.addComponent(UITransform);
    transform.setContentSize(this.cellSize * 2.4, this.cellSize * 1.6);
    transform.setAnchorPoint(0.5, 0.1);
    const sprite = impact.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.trim = false;
    this.node.addChild(impact);
    resources.load(FX_SPRITE.blackFlameImpact, SpriteFrame, (err, frame) => {
      if (!impact.isValid) return;
      if (err) { impact.destroy(); return; }
      sprite.spriteFrame = frame;
      const fade = impact.addComponent(UIOpacity);
      tween(fade).to(0.5, { opacity: 0 }).call(() => {
        if (impact.isValid) impact.destroy();
      }).start();
    });
    const effect = new Node('blackFlame');
    this.node.addChild(effect);
    const g = effect.addComponent(Graphics);
    g.fillColor = new Color(14, 5, 22, 225);
    g.strokeColor = new Color(165, 55, 220, 255);
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 8;
      g.moveTo(x - 5, -12); g.lineTo(x - 3, 3);
      g.lineTo(x + 1, 14 + (i % 2) * 9); g.lineTo(x + 5, 1);
      g.lineTo(x + 6, -12); g.close(); g.fill(); g.stroke();
    }
    const opacity = effect.addComponent(UIOpacity);
    tween(opacity).to(seconds, { opacity: 80 }).call(() => {
      if (effect.isValid) effect.destroy();
    }).start();
  }
}
