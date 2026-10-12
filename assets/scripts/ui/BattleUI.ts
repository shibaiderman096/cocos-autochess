import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, Color, resources, UIOpacity } from 'cc';
import { UI_SPRITE } from '../view/ArtPaths';
import { SettlementBreakdown } from '../core/EconomySystem';
import { LevelSystem } from '../core/LevelSystem';

const { ccclass } = _decorator;

function makeLabel(text: string, size: number, color: Color): Node {
  const n = new Node('label');
  n.addComponent(UITransform);
  const l = n.addComponent(Label);
  l.string = text;
  l.fontSize = size;
  l.lineHeight = size + 4;
  l.color = color;
  return n;
}

function makeSpriteNode(path: string, w: number, h: number): { node: Node; sprite: Sprite } {
  const n = new Node('sprite');
  n.addComponent(UITransform).setContentSize(w, h);
  const s = n.addComponent(Sprite);
  s.sizeMode = Sprite.SizeMode.CUSTOM;
  resources.load(path, SpriteFrame, (e, sf) => {
    if (!e && sf && s.isValid) s.spriteFrame = sf;
  });
  return { node: n, sprite: s };
}

/**
 * 战斗 UI：
 * - 顶部状态栏：金币 / 阶段 / 等级 / 经验条 / 上阵上限
 * - 开战按钮、倍速按钮
 * - 胜负弹窗（含金币和经验明细）
 */
@ccclass('BattleUI')
export class BattleUI extends Component {
  onFight: () => void = () => {};
  onSpeed: (s: number) => void = () => {};
  onRestart: () => void = () => {};
  onBuy: (slot: number) => void = () => {};
  onRefresh: () => void = () => {};
  onSell: (uid: number) => void = () => {};

  private speed = 1;
  private fightBtn: Node;
  private speedLabel: Label;
  private resultPanel: Node;
  private resultLabel: Label;
  private detailLabel: Label;
  private nextBtnLabel: Label;

  // 顶部状态
  private goldLabel: Label;
  private floorLabel: Label;
  private levelLabel: Label;
  private expBarBg: Node;
  private expBarFill: Node;
  private expLabel: Label;
  private capLabel: Label;
  private shopRoot: Node;
  private shopSlots: Array<{ node: Node; nameLabel: Label; costLabel: Label; unitId: string | null }> = [];

  init() {
    // ─── 顶部状态栏 ───
    const top = new Node('topBar');
    this.node.addChild(top);

    // 金币（左上）
    const goldN = makeLabel('金币 0', 22, new Color(255, 215, 0, 255));
    goldN.setPosition(-380, 300, 0);
    top.addChild(goldN);
    this.goldLabel = goldN.getComponent(Label)!;

    // 阶段（金币下方）
    const floorN = makeLabel('阶段 1', 20, Color.WHITE);
    floorN.setPosition(-380, 268, 0);
    top.addChild(floorN);
    this.floorLabel = floorN.getComponent(Label)!;

    // 等级（右上）
    const lvN = makeLabel('Lv.1', 22, new Color(150, 200, 255, 255));
    lvN.setPosition(380, 300, 0);
    top.addChild(lvN);
    this.levelLabel = lvN.getComponent(Label)!;

    // 经验条（等级下方）
    this.expBarBg = new Node('expBarBg');
    this.expBarBg.addComponent(UITransform).setContentSize(140, 8);
    const bgSp = this.expBarBg.addComponent(Sprite);
    bgSp.color = new Color(40, 40, 50, 255);
    this.expBarBg.setPosition(380, 272, 0);
    top.addChild(this.expBarBg);

    this.expBarFill = new Node('expBarFill');
    this.expBarFill.addComponent(UITransform).setContentSize(0, 6);
    const fillSp = this.expBarFill.addComponent(Sprite);
    fillSp.color = new Color(120, 220, 120, 255);
    this.expBarBg.addChild(this.expBarFill);
    this.expBarFill.setPosition(-70, 0, 0);

    const expN = makeLabel('0/2', 14, Color.GRAY);
    expN.setPosition(380, 252, 0);
    top.addChild(expN);
    this.expLabel = expN.getComponent(Label)!;

    // 上阵上限
    const capN = makeLabel('上阵 1', 18, new Color(200, 200, 200, 255));
    capN.setPosition(380, 226, 0);
    top.addChild(capN);
    this.capLabel = capN.getComponent(Label)!;

    // ─── 开战按钮 ───
    const fight = makeSpriteNode(UI_SPRITE.btnPrimary, 200, 64);
    fight.node.setPosition(0, -240, 0);
    fight.node.addChild(makeLabel('开 战', 28, Color.WHITE));
    fight.node.on(Node.EventType.TOUCH_END, () => this.onFight());
    this.node.addChild(fight.node);
    this.fightBtn = fight.node;

    // ─── 倍速按钮 ───
    const speedBtn = makeSpriteNode(UI_SPRITE.btnSecondary, 140, 52);
    speedBtn.node.setPosition(330, -240, 0);
    const sl = makeLabel('倍速 x1', 24, Color.WHITE);
    speedBtn.node.addChild(sl);
    this.speedLabel = sl.getComponent(Label)!;
    speedBtn.node.on(Node.EventType.TOUCH_END, () => {
      this.speed = (this.speed % 3) + 1;
      this.speedLabel.string = `倍速 x${this.speed}`;
      this.onSpeed(this.speed);
    });
    this.node.addChild(speedBtn.node);

    // ─── 商店面板（底部） ───
    const shopRoot = new Node('shopRoot');
    shopRoot.setPosition(0, -330, 0);
    this.node.addChild(shopRoot);
    this.shopRoot = shopRoot;

    // 刷新按钮
    const rfBtn = makeSpriteNode(UI_SPRITE.btnSecondary, 110, 44);
    rfBtn.node.setPosition(-290, 0, 0);
    rfBtn.node.addChild(makeLabel('刷新 2G', 18, Color.WHITE));
    rfBtn.node.on(Node.EventType.TOUCH_END, () => this.onRefresh());
    shopRoot.addChild(rfBtn.node);

    // 5 个商店格子
    for (let i = 0; i < 5; i++) {
      const slotN = makeSpriteNode(UI_SPRITE.panel, 96, 56);
      slotN.node.setPosition(-200 + i * 110, 0, 0);
      const nameL = makeLabel('', 14, Color.WHITE);
      slotN.node.addChild(nameL);
      const costL = makeLabel('', 12, new Color(255, 215, 0, 255));
      costL.setPosition(0, -16, 0);
      slotN.node.addChild(costL);
      this.shopSlots.push({ node: slotN.node, nameLabel: nameL.getComponent(Label)!, costLabel: costL.getComponent(Label)!, unitId: null });
      const idx = i;
      slotN.node.on(Node.EventType.TOUCH_END, () => this.onBuy(idx));
      shopRoot.addChild(slotN.node);
    }

    // ─── 结算弹窗 ───
    const panel = makeSpriteNode(UI_SPRITE.panel, 480, 360);
    panel.node.setPosition(0, 0, 0);
    const rl = makeLabel('', 38, Color.WHITE);
    rl.setPosition(0, 90, 0);
    panel.node.addChild(rl);
    this.resultLabel = rl.getComponent(Label)!;

    const dl = makeLabel('', 18, Color.WHITE);
    dl.setPosition(0, 10, 0);
    panel.node.addChild(dl);
    this.detailLabel = dl.getComponent(Label)!;

    const nextBtn = makeSpriteNode(UI_SPRITE.btnPrimary, 190, 56);
    nextBtn.node.setPosition(0, -110, 0);
    const nl = makeLabel('下一阶段', 24, Color.WHITE);
    nextBtn.node.addChild(nl);
    this.nextBtnLabel = nl.getComponent(Label)!;
    nextBtn.node.on(Node.EventType.TOUCH_END, () => this.onRestart());
    panel.node.addChild(nextBtn.node);
    panel.node.active = false;
    this.resultPanel = panel.node;
    this.node.addChild(panel.node);
  }

  setSpeed(s: number): void {
    this.speed = s;
    if (this.speedLabel) this.speedLabel.string = `倍速 x${s}`;
  }

  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }

  /** 顶部状态栏刷新（每次结算/购买/升级后调用） */
  refreshTop(gold: number, floor: number, lv: LevelSystem): void {
    if (this.goldLabel) this.goldLabel.string = `金币 ${gold}`;
    if (this.floorLabel) this.floorLabel.string = `阶段 ${floor}`;
    if (this.levelLabel) this.levelLabel.string = `Lv.${lv.level}`;
    if (this.capLabel) this.capLabel.string = `上阵 ${lv.unitCap}`;
    if (this.expLabel && this.expBarFill) {
      if (lv.level >= 10) {
        this.expLabel.string = 'MAX';
        this.expBarFill.getComponent(UITransform)!.setContentSize(140, 6);
        this.expBarFill.setPosition(-70, 0, 0);
      } else {
        const need = lv.expToNext();
        this.expLabel.string = `${lv.exp}/${need}`;
        const ratio = Math.max(0, Math.min(1, lv.exp / need));
        this.expBarFill.getComponent(UITransform)!.setContentSize(140 * ratio, 6);
        this.expBarFill.setPosition(-70 + (140 * ratio) / 2, 0, 0);
      }
    }
  }

  /** 结算弹窗：胜负 + 金币明细 + 经验变化 */
  showResult(winner: number, settle: SettlementBreakdown | null, expGained: number, levelUps: number, newLevel: number): void {
    if (!this.resultLabel) return;
    this.resultLabel.string = winner === 0 ? '胜 利 !' : winner === 1 ? '失 败' : '平 局';
    this.resultLabel.color = winner === 0
      ? new Color(130, 255, 130, 255)
      : winner === 1
        ? new Color(255, 110, 110, 255)
        : new Color(230, 230, 230, 255);

    if (this.detailLabel) {
      if (settle) {
        const parts = [
          `阶段 +${settle.floorIncome}`,
          `胜利 +${settle.winBonus}`,
          `利息 +${settle.interest}`,
          `连胜/连败 +${settle.streakBonus}`,
          `合计 +${settle.total}`,
        ];
        let expText = `经验 +${expGained}`;
        if (levelUps > 0) expText += `  升级 x${levelUps} → Lv.${newLevel}`;
        this.detailLabel.string = `${parts.join('  |  ')}\n${expText}`;
      } else {
        this.detailLabel.string = `经验 +${expGained}`;
      }
    }

    if (this.nextBtnLabel) {
      this.nextBtnLabel.string = '下一阶段';
    }
    if (this.resultPanel) this.resultPanel.active = true;
  }

  hideResult(): void { if (this.resultPanel) this.resultPanel.active = false; }

  /** 商店 UI 刷新（BattleStage 在 reroll/购买/战斗切换时调用） */
  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number }>): void {
    for (let i = 0; i < this.shopSlots.length; i++) {
      const ui = this.shopSlots[i];
      const data = slots[i];
      if (!data || !data.unitId) {
        ui.nameLabel.string = '';
        ui.costLabel.string = '';
        ui.node.getComponent(UIOpacity)!.opacity = 120;
        ui.unitId = null;
      } else {
        ui.nameLabel.string = `${data.name}`;
        ui.costLabel.string = `${data.price}G 剩${data.poolLeft}`;
        ui.node.getComponent(UIOpacity)!.opacity = 255;
        ui.unitId = data.unitId;
      }
    }
  }

  setShopVisible(v: boolean): void { if (this.shopRoot) this.shopRoot.active = v; }

  private warnLabel: Label;
  private warnTimer = 0;

  /** 顶部中间短暂提示（超员等） */
  showWarn(msg: string): void {
    if (!this.warnLabel) {
      const n = makeLabel('', 20, new Color(255, 200, 80, 255));
      n.setPosition(0, 200, 0);
      this.node.addChild(n);
      this.warnLabel = n.getComponent(Label)!;
    }
    this.warnLabel.string = msg;
    this.warnTimer = 2.0;
  }

  update(dt: number) {
    if (this.warnTimer > 0) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0 && this.warnLabel) this.warnLabel.string = '';
    }
  }
}
