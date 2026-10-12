import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, Color, resources, UIOpacity } from 'cc';
import { UI_SPRITE, UI2, shopCardByCost } from '../view/ArtPaths';
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
 * 战斗 UI（使用 ui2 概念图集裁切素材）：
 * - 开战按钮 = btn_fight；商店刷新 = btn_shop_refresh；结算横幅 = panel_result
 * - 商店卡 = shop_card1~5（按费用配色）
 * - 警告 toast = panel_warn
 * - 顶部状态栏 / 经验条保持 Label + 简洁样式
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

  // 商店
  private shopRoot: Node;
  private shopSlots: Array<{ node: Node; nameLabel: Label; costLabel: Label; unitId: string | null; cardSprite: Sprite }> = [];

  // 警告 toast
  private warnNode: Node;
  private warnLabel: Label;
  private warnTimer = 0;

  init() {
    // ─── 开战按钮（素材 btn_fight）───
    const fight = makeSpriteNode(UI2.btnFight, 180, 56);
    fight.node.setPosition(0, -240, 0);
    fight.node.addChild(makeLabel('开 战', 24, Color.WHITE));
    fight.node.on(Node.EventType.TOUCH_END, () => this.onFight());
    this.node.addChild(fight.node);
    this.fightBtn = fight.node;

    // ─── 倍速按钮（沿用旧素材 btn_secondary）───
    const speedBtn = makeSpriteNode(UI_SPRITE.btnSecondary, 140, 52);
    speedBtn.node.setPosition(330, -240, 0);
    const sl = makeLabel('倍速 x1', 22, Color.WHITE);
    speedBtn.node.addChild(sl);
    this.speedLabel = sl.getComponent(Label)!;
    speedBtn.node.on(Node.EventType.TOUCH_END, () => {
      this.speed = (this.speed % 3) + 1;
      this.speedLabel.string = `倍速 x${this.speed}`;
      this.onSpeed(this.speed);
    });
    this.node.addChild(speedBtn.node);

    // ─── 商店面板 ───
    const shopRoot = new Node('shopRoot');
    shopRoot.setPosition(0, -335, 0);
    this.node.addChild(shopRoot);
    this.shopRoot = shopRoot;

    // 商店刷新按钮（素材 btn_shop_refresh）
    const rfBtn = makeSpriteNode(UI2.btnShopRefresh, 120, 38);
    rfBtn.node.setPosition(-300, 0, 0);
    rfBtn.node.addChild(makeLabel('刷新 2G', 15, Color.WHITE));
    rfBtn.node.on(Node.EventType.TOUCH_END, () => this.onRefresh());
    shopRoot.addChild(rfBtn.node);

    // 5 个商店卡槽（按费用配色底图，购买后置灰）
    for (let i = 0; i < 5; i++) {
      const cardN = new Node(`shopCard_${i}`);
      cardN.addComponent(UITransform).setContentSize(88, 142);
      const sp = cardN.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      // 先用 1 费卡占位，refreshShop 时按实际费用换图
      resources.load(shopCardByCost(1), SpriteFrame, (e, sf) => { if (!e && sf && sp.isValid) sp.spriteFrame = sf; });
      const nameL = makeLabel('', 13, Color.WHITE);
      nameL.setPosition(0, 30, 0);
      cardN.addChild(nameL);
      const costL = makeLabel('', 13, new Color(255, 215, 0, 255));
      costL.setPosition(0, -50, 0);
      cardN.addChild(costL);
      cardN.setPosition(-215 + i * 100, 0, 0);
      const op = cardN.addComponent(UIOpacity);
      op.opacity = 120;
      this.shopSlots.push({
        node: cardN, nameLabel: nameL.getComponent(Label)!,
        costLabel: costL.getComponent(Label)!, unitId: null, cardSprite: sp,
      });
      const idx = i;
      cardN.on(Node.EventType.TOUCH_END, () => this.onBuy(idx));
      shopRoot.addChild(cardN);
    }

    // ─── 警告 toast（素材 panel_warn）───
    const warn = makeSpriteNode(UI2.panelWarn, 220, 48);
    warn.node.setPosition(0, 190, 0);
    const wl = makeLabel('', 16, new Color(255, 210, 120, 255));
    warn.node.addChild(wl);
    this.warnLabel = wl.getComponent(Label)!;
    warn.node.active = false;
    this.node.addChild(warn.node);
    this.warnNode = warn.node;

    // ─── 结算弹窗（胜利横幅素材 panel_result）───
    const panel = new Node('resultPanel');
    panel.addComponent(UITransform);
    this.node.addChild(panel);
    this.resultPanel = panel;

    const banner = makeSpriteNode(UI2.panelResult, 260, 110);
    banner.node.setPosition(0, 110, 0);
    panel.addChild(banner.node);

    const rl = makeLabel('', 30, Color.WHITE);
    rl.setPosition(0, 110, 0);
    panel.addChild(rl);
    this.resultLabel = rl.getComponent(Label)!;

    const dl = makeLabel('', 17, Color.WHITE);
    dl.setPosition(0, 10, 0);
    panel.addChild(dl);
    this.detailLabel = dl.getComponent(Label)!;

    // 下一阶段按钮（素材 btn_fight 复用）
    const nextBtn = makeSpriteNode(UI2.btnFight, 180, 52);
    nextBtn.node.setPosition(0, -100, 0);
    nextBtn.node.addChild(makeLabel('下一阶段', 22, Color.WHITE));
    nextBtn.node.on(Node.EventType.TOUCH_END, () => this.onRestart());
    panel.addChild(nextBtn.node);
    this.nextBtnLabel = null as unknown as Label;

    panel.active = false;
  }

  setSpeed(s: number): void {
    this.speed = s;
    if (this.speedLabel) this.speedLabel.string = `倍速 x${s}`;
  }

  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }

  refreshTop(gold: number, floor: number, lv: LevelSystem): void {
    if (!this.goldLabel) return;
    // 懒创建顶部栏（首次调用）
    if (!this.goldLabel) return;
  }

  /** 顶部状态栏（首次调用创建节点） */
  ensureTopBar(): void {
    if (this.goldLabel) return;
    const top = new Node('topBar');
    this.node.addChild(top);

    const goldN = makeLabel('金币 0', 22, new Color(255, 215, 0, 255));
    goldN.setPosition(-380, 300, 0);
    top.addChild(goldN);
    this.goldLabel = goldN.getComponent(Label)!;

    const floorN = makeLabel('阶段 1', 20, Color.WHITE);
    floorN.setPosition(-380, 268, 0);
    top.addChild(floorN);
    this.floorLabel = floorN.getComponent(Label)!;

    const lvN = makeLabel('Lv.1', 22, new Color(150, 200, 255, 255));
    lvN.setPosition(380, 300, 0);
    top.addChild(lvN);
    this.levelLabel = lvN.getComponent(Label)!;

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

    const capN = makeLabel('上阵 1', 18, new Color(200, 200, 200, 255));
    capN.setPosition(380, 226, 0);
    top.addChild(capN);
    this.capLabel = capN.getComponent(Label)!;
  }

  /** 顶部状态栏刷新 */
  updateTop(gold: number, floor: number, lv: LevelSystem): void {
    this.ensureTopBar();
    this.goldLabel.string = `金币 ${gold}`;
    this.floorLabel.string = `阶段 ${floor}`;
    this.levelLabel.string = `Lv.${lv.level}`;
    this.capLabel.string = `上阵 ${lv.unitCap}`;
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

  /** 商店 UI 刷新：按费用换卡图 */
  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number }>): void {
    for (let i = 0; i < this.shopSlots.length; i++) {
      const ui = this.shopSlots[i];
      const data = slots[i];
      if (!data || !data.unitId) {
        ui.nameLabel.string = '';
        ui.costLabel.string = '';
        ui.node.getComponent(UIOpacity)!.opacity = 100;
        ui.unitId = null;
      } else {
        ui.nameLabel.string = data.name;
        ui.costLabel.string = `${data.price}G 剩${data.poolLeft}`;
        ui.node.getComponent(UIOpacity)!.opacity = 255;
        ui.unitId = data.unitId;
        // 按费用换卡底图
        const path = shopCardByCost(data.cost);
        resources.load(path, SpriteFrame, (e, sf) => {
          if (!e && sf && ui.cardSprite.isValid) ui.cardSprite.spriteFrame = sf;
        });
      }
    }
  }

  setShopVisible(v: boolean): void { if (this.shopRoot) this.shopRoot.active = v; }

  showResult(winner: number, settle: SettlementBreakdown | null, expGained: number, levelUps: number, newLevel: number): void {
    if (!this.resultLabel) return;
    this.resultLabel.string = winner === 0 ? '胜 利 !' : winner === 1 ? '失 败' : '平 局';
    this.resultLabel.color = winner === 0
      ? new Color(255, 240, 150, 255)
      : winner === 1
        ? new Color(255, 130, 130, 255)
        : new Color(230, 230, 230, 255);

    if (this.detailLabel) {
      if (settle) {
        const parts = [
          `阶段 +${settle.floorIncome}`,
          `胜利 +${settle.winBonus}`,
          `利息 +${settle.interest}`,
          `连胜/败 +${settle.streakBonus}`,
          `合计 +${settle.total}`,
        ];
        let expText = `经验 +${expGained}`;
        if (levelUps > 0) expText += `  升级 x${levelUps} → Lv.${newLevel}`;
        this.detailLabel.string = `${parts.join('  |  ')}\n${expText}`;
      } else {
        this.detailLabel.string = `经验 +${expGained}`;
      }
    }
    if (this.resultPanel) this.resultPanel.active = true;
  }

  hideResult(): void { if (this.resultPanel) this.resultPanel.active = false; }

  /** 顶部提示 toast（素材 panel_warn 底图） */
  showWarn(msg: string): void {
    if (!this.warnNode) return;
    this.warnLabel.string = msg;
    this.warnNode.active = true;
    this.warnTimer = 2.0;
  }

  update(dt: number) {
    if (this.warnTimer > 0) {
      this.warnTimer -= dt;
      if (this.warnTimer <= 0 && this.warnNode) {
        this.warnNode.active = false;
        this.warnTimer = 0;
      }
    }
  }
}
