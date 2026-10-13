import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Vec3, resources, tween, UIOpacity, Graphics, Color } from 'cc';
import { UnitRuntime } from '../battle/types';
import { UNIT_SPRITE, UI_SPRITE, unitSpriteKey } from './ArtPaths';
import { drawStarRing } from './StarRing';

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
  private starRing: Graphics;
  private bodySize = 0;

  setup(cfgId: string, side: 0 | 1, unitId: number, cellSize: number, artId = cfgId, tint?: string) {
    this.unitId = unitId;
    this.side = side;
    this.cfgId = cfgId;

    const size = cellSize * 0.82;
    this.bodySize = size;
    const body = new Node('body');
    body.addComponent(UITransform).setContentSize(size, size);
    this.bodySprite = body.addComponent(Sprite);
    this.bodySprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.node.addChild(body);

    // Overlay the baked faction-colored base with a star-colored ground ring.
    const base = new Node('starRing');
    this.node.addChild(base);
    this.starRing = base.addComponent(Graphics);
    this.setStar(1);

    this.hpBarBg = new Node('hpBar');
    this.hpBarBg.addComponent(UITransform).setContentSize(size * 0.9, 6);
    this.hpBarBg.addComponent(Sprite).sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.setPosition(0, size * 0.62, 0);
    this.node.addChild(this.hpBarBg);

    const hpFillNode = new Node('hpFill');
    hpFillNode.addComponent(UITransform).setContentSize(size * 0.9, 4);
    this.hpFill = hpFillNode.addComponent(Sprite);
    this.hpFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(hpFillNode);
    hpFillNode.setPosition(0, 0, 0);

    const manaFillNode = new Node('manaFill');
    manaFillNode.addComponent(UITransform).setContentSize(size * 0.9, 3);
    this.manaFill = manaFillNode.addComponent(Sprite);
    this.manaFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(manaFillNode);
    manaFillNode.setPosition(0, -6, 0);

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

  /** One star: white; two: silver; three: gold. No star text is rendered. */
  setStar(star: number): void {
    if (!this.starRing) return;
    drawStarRing(this.starRing, this.bodySize, star);
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
    const cur = this.node.position;
    const k = Math.min(1, dt * 12);
    this.node.setPosition(
      cur.x + (targetPos.x - cur.x) * k,
      cur.y + (targetPos.y - cur.y) * k,
      0,
    );
    if (this.hpFill && snap.maxHp > 0) {
      this.hpFill.node.getComponent(UITransform).setContentSize(
        Math.max(0, (snap.hp / snap.maxHp)) * this.hpBarBg.getComponent(UITransform).contentSize.width,
        4,
      );
    }
    if (this.manaFill) this.manaFill.node.active = this.side === 0 && snap.maxMana > 0;
    if (this.manaFill && this.side === 0 && snap.maxMana > 0) {
      this.manaFill.node.getComponent(UITransform).setContentSize(
        Math.max(0, (snap.mana / snap.maxMana)) * this.hpBarBg.getComponent(UITransform).contentSize.width,
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
}
