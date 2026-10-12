import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Vec3, resources, tween, UIOpacity, Label, Color } from 'cc';
import { UnitRuntime } from '../battle/types';
import { UNIT_SPRITE, UI_SPRITE, unitSpriteKey } from './ArtPaths';

const { ccclass } = _decorator;

/**
 * 棋子视图（M1 占位 → 正式素材）。
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

  /** 由 BattleStage 创建后调用 */
  setup(cfgId: string, side: 0 | 1, unitId: number, cellSize: number) {
    this.unitId = unitId;
    this.side = side;
    this.cfgId = cfgId;

    const size = cellSize * 0.82;
    const body = new Node('body');
    body.addComponent(UITransform).setContentSize(size, size);
    this.bodySprite = body.addComponent(Sprite);
    this.bodySprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.node.addChild(body);

    // 血条背景（细条，位于棋子头顶偏上）
    this.hpBarBg = new Node('hpBar');
    this.hpBarBg.addComponent(UITransform).setContentSize(size * 0.9, 6);
    this.hpBarBg.addComponent(Sprite);
    this.hpBarBg.setPosition(0, size * 0.62, 0);
    this.node.addChild(this.hpBarBg);

    const hpFillNode = new Node('hpFill');
    hpFillNode.addComponent(UITransform).setContentSize(size * 0.9, 4);
    this.hpFill = hpFillNode.addComponent(Sprite);
    this.hpFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(hpFillNode);
    hpFillNode.setPosition(0, 0, 0);

    // 蓝条（仅 maxMana > 0 的棋子有）
    const manaFillNode = new Node('manaFill');
    manaFillNode.addComponent(UITransform).setContentSize(size * 0.9, 3);
    this.manaFill = manaFillNode.addComponent(Sprite);
    this.manaFill.sizeMode = Sprite.SizeMode.CUSTOM;
    this.hpBarBg.addChild(manaFillNode);
    manaFillNode.setPosition(0, -6, 0);

    const key = unitSpriteKey(cfgId, side);
    const path = UNIT_SPRITE[key];
    if (!path) { console.warn(`[UnitView] no sprite for ${key}`); return; }
    resources.load(path, SpriteFrame, (err, sf) => {
      if (err) { console.warn(`[UnitView] load failed: ${path}`, err.message); return; }
      this.bodySprite.spriteFrame = sf;
      this.loaded = true;
      this.refreshBarsColor();
    });
    // 占位底色（素材加载前可见）
    this.bodySprite.color = side === 0 ? new Color(80, 120, 200, 255) : new Color(200, 80, 80, 255);
  }

  private refreshBarsColor() {
    if (!this.hpFill || !this.manaFill) return;
    const loadSf = (p: string, cb: (sf: SpriteFrame) => void) =>
      resources.load(p, SpriteFrame, (e, sf) => { if (!e && sf) cb(sf); });
    loadSf(UI_SPRITE.barBg, sf => { if (this.hpBarBg) this.hpBarBg.getComponent(Sprite).spriteFrame = sf; });
    loadSf(this.side === 0 ? UI_SPRITE.hpFillAlly : UI_SPRITE.hpFillEnemy, sf => { if (this.hpFill) this.hpFill.spriteFrame = sf; });
    if (this.side === 0) loadSf(UI_SPRITE.manaFill, sf => { if (this.manaFill) this.manaFill.spriteFrame = sf; });
    else this.manaFill.node.active = false; // 敌方 M1 不显示蓝条
  }

  /** 每帧由 BattleStage 调用：用 sim 快照驱动视图 */
  sync(snap: UnitRuntime, cellSize: number, dt: number) {
    // 位置插值：向逻辑格坐标缓动
    const target = this.node.parent?.getComponent('BoardView')
      ? (this.node.parent.getComponent('BoardView') as unknown as { cellToWorld(x: number, y: number): Vec3 }).cellToWorld(snap.pos.x, snap.pos.y)
      : new Vec3(snap.pos.x * cellSize, snap.pos.y * cellSize, 0);
    const cur = this.node.position;
    const k = Math.min(1, dt * 12); // 简单缓动系数
    this.node.setPosition(
      cur.x + (target.x - cur.x) * k,
      cur.y + (target.y - cur.y) * k,
      0,
    );
    // 血条 / 蓝条比例
    if (this.hpFill && snap.maxHp > 0) {
      this.hpFill.node.getComponent(UITransform).setContentSize(
        Math.max(0, (snap.hp / snap.maxHp)) * this.hpBarBg.getComponent(UITransform).contentSize.width,
        4,
      );
    }
    if (this.manaFill && this.side === 0 && snap.maxMana > 0) {
      this.manaFill.node.getComponent(UITransform).setContentSize(
        Math.max(0, (snap.mana / snap.maxMana)) * this.hpBarBg.getComponent(UITransform).contentSize.width,
        3,
      );
    }
  }

  /** 死亡表现：淡出后隐藏 */
  playDeath() {
    if (!this.node.active) return;
    let op = this.node.getComponent(UIOpacity);
    if (!op) op = this.node.addComponent(UIOpacity);
    tween(op)
      .to(0.35, { opacity: 0 })
      .call(() => { this.node.active = false; })
      .start();
  }

  /** 受击表现：短暂闪红 */
  playHit() {
    if (!this.bodySprite || !this.loaded) return;
    const orig = this.bodySprite.color.clone();
    this.bodySprite.color = new Color(255, 90, 90, 255);
    tween(this.bodySprite)
      .to(0.12, {})
      .call(() => { if (this.bodySprite) this.bodySprite.color = orig; })
      .start();
  }

  /** 攻击表现：身体前突一下（M1 简化为轻微位移回弹） */
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
