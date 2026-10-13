import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, Color, Graphics, resources, UIOpacity } from 'cc';
import { UNIT_SPRITE, UI_SPRITE, UISkinKey } from '../view/ArtPaths';
import { setUISkin, setStarBadge } from './UISkin';
import { SHOP_DROP_AREA, SHOP_CARDS, containsShopDrop } from './BattleUILayout';
import { drawFactionRing } from '../view/FactionRing';
import { SettlementBreakdown } from '../core/EconomySystem';
import { LevelSystem, EXP_PURCHASE, MAX_LEVEL } from '../core/LevelSystem';
import { RoundSettlement, WaveConfig } from '../core/RoundFlow';
import { UnitConfigData } from '../core/ConfigManager';
import { shopCostRates } from '../core/ShopConfig';

const { ccclass } = _decorator;
const INK = new Color(13, 27, 35);
const GOLD = new Color(204, 174, 109);
const TEXT = new Color(233, 231, 210);
const MUTED = new Color(133, 161, 164);
const TEAL = new Color(89, 203, 176);
const TIERS = [MUTED, new Color(163, 177, 169), TEAL, new Color(86, 167, 226), new Color(181, 127, 230), GOLD];
interface ShopCard { node: Node; portrait: Sprite; name: Label; price: Label; role: Label; border: Graphics; lockOverlay: Node; unitId: string | null }
export interface UnitDetailData {
  name: string; star: number; cost?: number; artId: string; side: 0 | 1; tint?: string;
  hp: number; maxHp: number; mana: number; maxMana: number;
  atk: number; armor: number; mr: number; atkSpeed: number; range: number;
  skillName: string; skillDescription: string;
}
interface DetailMeter { fill: Sprite; value: Label; ratio: number }

export function label(parent: Node, text: string, x: number, y: number, size = 18, color = TEXT, width = 240): Label {
  const n = new Node('text'); n.addComponent(UITransform).setContentSize(width, size * 2 + 8);
  const l = n.addComponent(Label); l.string = text; l.fontSize = size; l.lineHeight = size + 5; l.color = color;
  parent.addChild(n); n.setPosition(x, y, 0); return l;
}
function polygon(g: Graphics, points: number[][], fill: Color, stroke?: Color): void {
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.close(); g.fillColor = fill; g.fill();
  if (stroke) { g.strokeColor = stroke; g.lineWidth = 1; g.stroke(); }
}
function paintPanel(g: Graphics, w: number, h: number, fill = INK, edge = GOLD): void {
  g.clear(); const x = w / 2, y = h / 2, cut = 7;
  polygon(g, [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]], fill, edge);
  g.strokeColor = new Color(edge.r, edge.g, edge.b, 60);
  g.rect(-x + 4, -y + 4, w - 8, h - 8); g.stroke();
}
export function panel(parent: Node, name: string, x: number, y: number, w: number, h: number, fill = INK, edge = GOLD, skin: UISkinKey | null = 'panel_ink'): Node {
  const n = new Node(name); n.addComponent(UITransform).setContentSize(w, h);
  const g = n.addComponent(Graphics); paintPanel(g, w, h, fill, edge);
  if (skin) setUISkin(n, skin, g);
  parent.addChild(n); n.setPosition(x, y, 0); return n;
}
export function button(parent: Node, text: string, x: number, y: number, w: number, h: number, action: () => void, primary = false): Node {
  const n = panel(parent, 'button', x, y, w, h, primary ? new Color(44, 77, 76) : new Color(24, 44, 51), primary ? GOLD : new Color(90, 123, 123), primary ? 'btn_primary' : 'btn_secondary');
  label(n, text, 0, 0, primary ? 22 : 17, primary ? TEXT : MUTED, w - 10);
  n.on(Node.EventType.TOUCH_END, action); return n;
}

function picture(parent: Node, key: UISkinKey, x: number, y: number, w: number, h = w, ready?: (sprite: Sprite) => void): Sprite {
  const n = new Node(key); n.addComponent(UITransform).setContentSize(w, h);
  parent.addChild(n); n.setPosition(x, y, 0); return setUISkin(n, key, undefined, ready);
}

/** M2 texture HUD over the vector arena; portraits reuse the existing unit art. */
@ccclass('BattleUI')
export class BattleUI extends Component {
  onFight = () => {};
  onSpeed = (s: number) => {};
  onRestart = () => {};
  onHome = () => {};
  onBuy = (slot: number) => {};
  onRefresh = () => {};
  onBuyExp = () => {};
  onLock = () => {};
  private lockIcon: Sprite;
  private locked = false;
  private waveTrack: Node;
  private healthLabel: Label;
  private waveLabel: Label;
  private sellNode: Node;
  private sellLabel: Label;
  private nextLabel: Label;
  private reportLabel: Label;
  private unitPanel: Node;
  private unitTitle: Label;
  private unitDetail: Label;
  private unitPortrait: Sprite;
  private unitStars: Node;
  private unitCost: Label;
  private unitStats: Label[] = [];
  private hpMeter: DetailMeter;
  private manaMeter: DetailMeter;
  private detailArt = '';
  private homeButton: Node;
  private speed = 1;
  private backdrop: Node;
  private fightBtn: Node;
  private speedLabel: Label;
  private resultPanel: Node;
  private resultLabel: Label;
  private resultBanner: Sprite;
  private detailLabel: Label;
  private goldLabel: Label;
  private floorLabel: Label;
  private levelBadgeLabel: Label;
  private expFill: Sprite;
  private expRatio = 0;
  private expLabel: Label;
  private buyExpBtn: Node;
  private buyExpLabel: Label;
  private canBuyExp = false;
  private capLabel: Label;
  private phaseLabel: Label;
  private shopRoot: Node;
  private economyRoot: Node;
  private economyControls: Node;
  private shopHeader: Node;
  private rateLabels: Label[] = [];
  private combatActive = false;
  private sellBanner: Node;
  private shopAvailable = true;
  private dragging = false;
  private shopSlots: ShopCard[] = [];
  private cap = 1;
  private deployed = 0;
  private warnLabel: Label;
  private warnTimer = 0;

  init(): void {
    this.node.addComponent(UITransform).setContentSize(1280, 720);
    this.drawArena();
    const header = panel(this.node, 'roundBar', 0, 310, 330, 54, new Color(17, 35, 42), GOLD);
    this.floorLabel = label(header, '1-1', -78, 0, 22, GOLD, 155);
    this.phaseLabel = label(header, '准备', 76, 0, 17, TEAL, 130);
    this.healthLabel = label(this.node, '20 / 20', 490, 320, 19, TEAL, 190);
    this.waveLabel = label(this.node, '', 490, 294, 12, MUTED, 220);
    this.waveTrack = panel(this.node, 'waveTrack', 0, 267, 300, 26, INK, GOLD, 'panel_side');
    picture(this.node, 'icon_life', 414, 320, 24);
    this.capLabel = label(this.node, '0 / 1', 0, -15, 58, new Color(233, 231, 210, 140), 250);
    this.capLabel.node.name = 'population'; this.capLabel.node.active = false;

    const area = SHOP_DROP_AREA;
    const dock = panel(this.node, 'shopDock', area.x, area.y, area.width, area.height,
      new Color(12, 25, 33), new Color(135, 113, 69), 'panel_dock');
    this.buildEconomy(dock);
    this.buildShop();
    this.sellNode = panel(this.node, 'shopSale', area.x, area.y, area.width, area.height,
      new Color(35, 25, 30), new Color(142, 76, 72), null);
    this.sellBanner = panel(this.sellNode, 'sellBanner', 0, 0, 452, 88,
      new Color(35, 25, 30), GOLD, 'sell_zone');
    picture(this.sellBanner, 'icon_sell', -156, 0, 32);
    this.sellLabel = label(this.sellBanner, '', 15, 0, 24, GOLD, 360);
    this.sellNode.active = false;
    this.buildCommand();
    this.buildSettlement();
    this.buildUnitDetails();
    this.warnLabel = label(this.node, '', 0, -130, 17, GOLD, 640);
  }

  private buildEconomy(dock: Node): void {
    this.economyRoot = new Node('economy'); dock.addChild(this.economyRoot);
    this.economyRoot.setPosition(-402, 0, 0);
    const goldIcon = new Node('goldIcon'); goldIcon.addComponent(UITransform).setContentSize(22, 22);
    const goldSprite = goldIcon.addComponent(Sprite); goldSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.shopHeader = new Node('shopHeader'); this.node.addChild(this.shopHeader);
    this.shopHeader.addChild(goldIcon); goldIcon.setPosition(-55, -225, 0);
    resources.load(UI_SPRITE.iconGold, SpriteFrame, (err, frame) => {
      if (!err && goldSprite.isValid) goldSprite.spriteFrame = frame;
    });
    this.goldLabel = label(this.shopHeader, '0', -13, -225, 22, GOLD, 65);
    const rates = new Node('shopRates'); this.shopHeader.addChild(rates); rates.setPosition(-276, -225, 0);
    for (let i = 0; i < 5; i++) {
      const rate = label(rates, '0%', (i - 2) * 44, 0, 12, TIERS[i + 1], 42);
      rate.node.name = `cost${i + 1}`; this.rateLabels.push(rate);
    }
    this.economyControls = new Node('economyControls'); this.economyRoot.addChild(this.economyControls);
    const cost = (parent: Node, amount: number, y: number) => {
      const coin = new Node('goldCost'); coin.addComponent(UITransform).setContentSize(14, 14);
      parent.addChild(coin); coin.setPosition(34, y, 0);
      const sprite = coin.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      resources.load(UI_SPRITE.iconGold, SpriteFrame, (err, frame) => {
        if (!err && sprite.isValid) sprite.spriteFrame = frame;
      });
      label(parent, `${amount}`, 54, y, 14, GOLD, 26);
    };
    this.buyExpBtn = button(this.economyControls, '', 0, 34, 148, 62,
      () => { if (this.canBuyExp && this.shopAvailable && !this.dragging) this.onBuyExp(); });
    this.buyExpBtn.name = 'buyExperience'; this.buyExpBtn.addComponent(UIOpacity);
    picture(this.buyExpBtn, 'badge_level', -52, 13, 24);
    this.levelBadgeLabel = label(this.buyExpBtn, '1', -52, 13, 14, GOLD, 24);
    this.expLabel = label(this.buyExpBtn, '0 / 2', 12, 13, 11, MUTED, 96);
    const exp = new Node('experience'); this.buyExpBtn.addChild(exp); exp.setPosition(0, -3, 0);
    picture(exp, 'exp_bar_bg', 0, 0, 130, 8);
    this.expFill = picture(exp, 'exp_bar_fill', 0, 0, 126, 4, sprite => {
      sprite.type = Sprite.Type.FILLED; sprite.fillType = Sprite.FillType.HORIZONTAL;
      sprite.fillStart = 0; sprite.fillRange = this.expRatio;
    });
    picture(this.buyExpBtn, 'icon_exp', -46, -18, 18);
    this.buyExpLabel = this.buyExpBtn.getChildByName('text')!.getComponent(Label)!;
    this.buyExpLabel.fontSize = 12; this.buyExpLabel.lineHeight = 16; this.buyExpLabel.node.setPosition(-17, -18, 0);
    this.buyExpLabel.node.getComponent(UITransform)!.setContentSize(42, 24);
    cost(this.buyExpBtn, EXP_PURCHASE.gold, -18);
    const refresh = button(this.economyControls, '', 0, -34, 148, 62, () => this.onRefresh());
    refresh.name = 'refresh'; picture(refresh, 'icon_refresh', -32, 0, 28);
    cost(refresh, 2, 0);
    const lock = new Node('lock'); lock.addComponent(UITransform).setContentSize(24, 24);
    this.shopHeader.addChild(lock); lock.setPosition(354, -225, 0);
    this.lockIcon = setUISkin(lock, 'btn_lock_off'); lock.on(Node.EventType.TOUCH_END, () => this.onLock());
    this.setLocked(false);
  }

  private buildShop(): void {
    this.shopRoot = new Node('inventory'); this.node.addChild(this.shopRoot);
    for (let i = 0; i < 5; i++) {
      const n = panel(this.shopRoot, `shop_${i}`, SHOP_CARDS.firstX + i * SHOP_CARDS.spacing,
        SHOP_CARDS.y, 164, 104, new Color(25, 43, 50), TIERS[1], 'card_cost1');
      n.setScale(SHOP_CARDS.scale, SHOP_CARDS.scale, 1); n.addComponent(UIOpacity);
      const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(62, 62);
      const sprite = portrait.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      portrait.setPosition(0, 15, 0); n.addChild(portrait);
      const base = new Node('factionRing'); portrait.addChild(base);
      drawFactionRing(base.addComponent(Graphics), 62, 0);
      const stars = new Node('starBadge'); stars.addComponent(UITransform).setContentSize(48, 16);
      n.addChild(stars); stars.setPosition(-51, -8, 0); setStarBadge(stars, 1);
      const card: ShopCard = { node: n, portrait: sprite, name: label(n, '', -19, -28, 17, TEXT, 110),
        price: label(n, '', 57, -28, 16, GOLD, 40), role: label(n, '', -49, 21, 10, MUTED, 65),
        border: n.getComponent(Graphics)!, lockOverlay: picture(n, 'card_lock_overlay', 0, 0, 164, 104).node, unitId: null };
      card.lockOverlay.active = this.locked;
      this.shopSlots.push(card);
      n.on(Node.EventType.TOUCH_END, () => { if (this.shopAvailable && !this.dragging && card.unitId) this.onBuy(i); });
    }
  }

  private buildCommand(): void {
    const command = panel(this.node, 'command', 482, SHOP_DROP_AREA.y, 212, 150,
      new Color(16, 33, 40), new Color(85, 113, 109), 'panel_side');
    this.fightBtn = button(command, '开始战斗', 0, 32, 188, 42, () => this.onFight(), true);
    picture(this.fightBtn, 'icon_swords', -76, 0, 22);
    this.fightBtn.getChildByName('text')!.setPosition(10, 0, 0);
    const speed = button(command, '', 0, -13, 188, 30,
      () => { this.setSpeed(this.speed % 3 + 1); this.onSpeed(this.speed); });
    picture(speed, 'icon_speed', -76, 0, 20);
    this.speedLabel = label(speed, '×1', 0, 0, 15, MUTED, 150);
    this.homeButton = button(command, '主界面', 0, -50, 188, 28, () => this.onHome());
    this.homeButton.getChildByName('text')!.getComponent(Label)!.fontSize = 13;
  }

  private buildSettlement(): void {
    this.resultPanel = new Node('settlement'); this.node.addChild(this.resultPanel);
    const shade = panel(this.resultPanel, 'modalShield', 0, 0, 1280, 720,
      new Color(4, 12, 19, 200), new Color(0, 0, 0, 0), null);
    shade.on(Node.EventType.TOUCH_START, () => {});
    const result = panel(this.resultPanel, 'result', 0, 35, 550, 380, new Color(17, 35, 43), GOLD, 'panel_modal');
    this.reportLabel = label(result, '远征战报', 0, 165, 13, GOLD, 500);
    this.resultBanner = picture(result, 'banner_victory', 0, 98, 520, 110);
    this.resultLabel = label(result, '', 0, 100, 36, TEXT, 500);
    picture(result, 'divider', 0, 33, 420, 10);
    this.detailLabel = label(result, '', 0, -35, 16, MUTED, 510);
    this.detailLabel.node.getComponent(UITransform)!.setContentSize(510, 140);
    const next = button(result, '下一波', 0, -145, 240, 46, () => this.onRestart(), true);
    this.nextLabel = next.getChildByName('text')!.getComponent(Label)!;
    button(this.resultPanel, '返回主界面', 0, -205, 180, 32, () => this.onHome());
    this.resultPanel.active = false;
  }

  private buildUnitDetails(): void {
    this.unitPanel = panel(this.node, 'unitDetail', 474, 48, 232, 386, INK, GOLD, 'tooltip_panel');
    const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(62, 62);
    this.unitPanel.addChild(portrait); portrait.setPosition(-70, 140, 0);
    this.unitPortrait = portrait.addComponent(Sprite); this.unitPortrait.sizeMode = Sprite.SizeMode.CUSTOM;
    this.unitTitle = label(this.unitPanel, '', 26, 154, 16, GOLD, 124);
    this.unitStars = new Node('detailStars'); this.unitStars.addComponent(UITransform).setContentSize(60, 20);
    this.unitPanel.addChild(this.unitStars); this.unitStars.setPosition(14, 122, 0);
    this.unitCost = label(this.unitPanel, '', 80, 122, 12, GOLD, 40);
    picture(this.unitPanel, 'divider', 0, 96, 208, 8);
    this.hpMeter = this.makeDetailMeter('health', 73, UI_SPRITE.hpFillAlly, 'stat_hp');
    this.manaMeter = this.makeDetailMeter('mana', 47, UI_SPRITE.manaFill, 'stat_mana');
    const keys: UISkinKey[] = ['stat_atk', 'stat_armor', 'stat_mana', 'stat_aspd', 'stat_range'];
    keys.forEach((key, i) => {
      const x = i % 2 ? 12 : -98, y = 9 - Math.floor(i / 2) * 31;
      picture(this.unitPanel, key, x, y, 18);
      this.unitStats.push(label(this.unitPanel, '', x + 53, y, 12, TEXT, 86));
    });
    picture(this.unitPanel, 'divider', 0, -78, 208, 8);
    const close = button(this.unitPanel, '', 99, 173, 20, 20, () => { this.unitPanel.active = false; });
    picture(close, 'icon_close', 0, 0, 14);
    this.unitDetail = label(this.unitPanel, '', 0, -129, 12, TEXT, 208);
    this.unitDetail.lineHeight = 19;
    this.unitDetail.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.unitDetail.verticalAlign = Label.VerticalAlign.TOP;
    this.unitDetail.overflow = Label.Overflow.CLAMP;
    this.unitDetail.enableWrapText = true;
    this.unitDetail.node.getComponent(UITransform)!.setContentSize(208, 86);
    this.unitPanel.active = false;
  }

  private makeDetailMeter(name: string, y: number, texture: string, icon: UISkinKey): DetailMeter {
    picture(this.unitPanel, icon, -94, y, 18);
    const root = panel(this.unitPanel, name, 12, y, 174, 18, new Color(5, 16, 23), MUTED, null);
    const node = new Node('fill'); node.addComponent(UITransform).setContentSize(170, 14); root.addChild(node);
    const fill = node.addComponent(Sprite); fill.sizeMode = Sprite.SizeMode.CUSTOM;
    const meter: DetailMeter = { fill, value: label(root, '', 0, 0, 11, TEXT, 168), ratio: 0 };
    resources.load(texture, SpriteFrame, (err, frame) => {
      if (err || !fill.isValid) return;
      fill.spriteFrame = frame; fill.type = Sprite.Type.FILLED; fill.fillType = Sprite.FillType.HORIZONTAL;
      fill.fillStart = 0; fill.fillRange = meter.ratio;
    });
    return meter;
  }

  private updateDetailMeter(meter: DetailMeter, value: number, max: number): void {
    const clamped = Math.max(0, Math.min(max, value));
    meter.ratio = max > 0 ? clamped / max : 0;
    meter.value.string = `${Math.ceil(clamped)} / ${max}`;
    if (meter.fill.spriteFrame) meter.fill.fillRange = meter.ratio;
  }

  private drawArena(): void {
    this.backdrop = new Node('arenaBackdrop');
    this.node.parent?.addChild(this.backdrop); this.backdrop.setSiblingIndex(0);
    const g = this.backdrop.addComponent(Graphics);
    g.fillColor = new Color(8, 20, 29); g.rect(-1600, -1000, 3200, 2000); g.fill();
    for (let i = 0; i < 7; i++) {
      g.fillColor = new Color(14 + i * 2, 31 + i * 3, 38 + i * 3);
      g.ellipse(0, 66, 620 - i * 35, 305 - i * 23); g.fill();
    }
    polygon(g, [[-398, -155], [398, -155], [370, 288], [-370, 288]], new Color(18, 34, 39), new Color(60, 79, 73));
    for (const side of [-1, 1]) {
      polygon(g, [[side * 373, -147], [side * 414, -158], [side * 387, 277], [side * 350, 270]], new Color(39, 58, 57), new Color(108, 104, 73));
      for (let i = 0; i < 6; i++) {
        const x = side * (386 - i * 4), y = -115 + i * 64;
        polygon(g, [[x - 9, y], [x, y + 7], [x + 9, y], [x, y - 7]], new Color(67, 107, 100), new Color(114, 132, 98));
      }
      for (let i = 0; i < 4; i++) {
        const x = side * (582 - (i % 2) * 27), y = 231 - i * 65;
        polygon(g, [[x, y], [x + side * 21, y + 44], [x - side * 10, y + 69], [x - side * 29, y + 12]], new Color(21, 53 + i * 4, 52), new Color(43, 82, 73));
      }
    }
    g.strokeColor = new Color(101, 92, 63); g.lineWidth = 1;
    g.moveTo(-586, 281); g.lineTo(586, 281); g.stroke();
    g.moveTo(-588, -230); g.lineTo(588, -230); g.stroke();
  }

  onDestroy(): void { this.backdrop?.destroy(); }
  setSpeed(s: number): void { this.speed = s; if (this.speedLabel) this.speedLabel.string = `×${s}`; }
  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }

  refreshTop(gold: number, _floor: number, lv: LevelSystem, rates = shopCostRates(lv.level)): void {
    this.goldLabel.string = `${gold}`;
    this.rateLabels.forEach((label, i) => { label.string = `${Number((rates[i] ?? 0).toFixed(1))}%`; });
    this.cap = lv.unitCap; this.updateCap();
    this.levelBadgeLabel.string = `${lv.level}`;
    const max = lv.level >= MAX_LEVEL, need = max ? 1 : lv.expToNext();
    this.canBuyExp = !max && gold >= EXP_PURCHASE.gold;
    this.buyExpLabel.string = max ? '' : `+${EXP_PURCHASE.exp}`;
    this.buyExpLabel.color = this.canBuyExp ? TEAL : MUTED;
    this.buyExpBtn.getComponent(UIOpacity)!.opacity = this.canBuyExp ? 255 : 140;
    setUISkin(this.buyExpBtn, this.canBuyExp ? 'btn_secondary' : 'btn_disabled', this.buyExpBtn.getComponent(Graphics)!);
    this.expLabel.string = max ? '∞' : `${lv.exp} / ${need}`;
    const ratio = max ? 1 : Math.max(0, Math.min(1, lv.exp / need));
    this.expRatio = ratio;
    if (this.expFill.spriteFrame) this.expFill.fillRange = ratio;
  }
  refreshFormation(units: Array<{ unitId: string; location: string }>, _configs: UnitConfigData[] = []): void {
    this.deployed = units.filter(u => u.location === 'board').length; this.updateCap();
  }
  private updateCap(population = this.deployed): void {
    if (!this.capLabel) return;
    this.capLabel.string = `${population} / ${this.cap}`;
    this.capLabel.color = population > this.cap ? new Color(229, 121, 112, 210) : new Color(233, 231, 210, 140);
  }

  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number; artId?: string; role?: string; tint?: string }>): void {
    this.shopSlots.forEach((card, i) => {
      const data = slots[i], id = data?.unitId ?? null; card.unitId = id;
      card.node.getComponent(UIOpacity)!.opacity = id ? 255 : 95;
      card.name.string = id ? data.name : ''; card.price.string = id ? `${data.price}` : '';
      card.role.string = id ? ({ frontline:'前排', ranged:'远程', caster:'法术' }[data.role ?? ''] ?? '') : '';
      const tint = new Color(255, 255, 255); if (data?.tint) tint.fromHEX(data.tint); card.portrait.color = tint;
      card.portrait.node.active = !!id;
      card.node.getChildByName('starBadge')!.active = !!id;
      paintPanel(card.border, 164, 104, new Color(25, 43, 50), TIERS[data?.cost ?? 1] ?? GOLD);
      const key: UISkinKey = id ? `card_cost${Math.max(1, Math.min(5, data.cost))}` as UISkinKey : 'card_empty';
      setUISkin(card.node, key, card.border);
      card.portrait.spriteFrame = null;
      if (id) resources.load(UNIT_SPRITE[`${data.artId ?? id}_ally`], SpriteFrame, (err, sf) => {
        if (!err && card.portrait.isValid && card.unitId === id) card.portrait.spriteFrame = sf;
      });
    });
  }
  setShopVisible(v: boolean): void {
    this.shopAvailable = v; this.clearSellPreview();
    this.homeButton.active = v && !this.combatActive;
    this.phaseLabel.string = this.combatActive ? '战斗' : '准备'; this.phaseLabel.color = this.combatActive ? GOLD : TEAL;
  }
  setCombatActive(v: boolean): void { this.combatActive = v; this.setShopVisible(this.shopAvailable); }
  showResult(winner: number, settle: SettlementBreakdown | null, expGained: number, levelUps: number, newLevel: number, round?: RoundSettlement): void {
    const ended = !!round?.runResult, win = ended ? round.runResult === 'victory' : winner === 0;
    this.resultLabel.string = ended ? (win ? '远征胜利' : '远征失败') : winner === 0 ? '战斗胜利' : winner === 1 ? '战斗失利' : '势均力敌';
    this.resultLabel.color = win ? TEAL : new Color(229, 139, 122);
    setUISkin(this.resultBanner.node, win ? 'banner_victory' : 'banner_defeat');
    this.phaseLabel.string = ended ? '整局结束' : '战斗结算';
    this.reportLabel.string = ended ? '整 局 结 束' : '远 征 战 报';
    this.nextLabel.string = ended ? '重开一局  ↻' : '下一小关  ›';
    const gold = settle ? `阶段 +${settle.floorIncome}    胜利 +${settle.winBonus}    利息 +${settle.interest}\n连胜 / 连败 +${settle.streakBonus}    金币合计 +${settle.total}\n` : '';
    const health = round ? `${round.stage ? `${round.stage}-${round.round}` : `第 ${round.waveId} 波`} · 敌方存活 ${round.enemySurvivors}\n生命 -${round.healthLost}    剩余生命 ${round.healthRemaining}\n` : '';
    this.detailLabel.string = `${health}${gold}经验 +${expGained}${levelUps ? `    升至等级 ${newLevel}` : ''}`;
    this.unitPanel.active = false; this.resultPanel.active = true;
  }
  hideResult(): void { this.resultPanel.active = false; }
  refreshRun(health: number, max: number, wave: number, total: number, name: string, info?: WaveConfig, stageCount?: number): void {
    this.healthLabel.string = `${health} / ${max}`;
    this.healthLabel.color = health <= max / 3 ? new Color(229, 139, 122) : TEAL;
    this.floorLabel.string = info?.stage ? `${info.stage}-${info.round}` : `${wave} / ${total}`;
    this.waveLabel.string = info?.stage ? `${name} · 阶段 ${info.stage} / ${stageCount}` : name;
    const current = info?.round ?? wave, count = info?.roundsInStage ?? total;
    for (const child of [...this.waveTrack.children]) if (child.name !== 'skin') child.destroy();
    const spacing = Math.min(36, 260 / count);
    for (let i = 0; i < count; i++) {
      const key = i + 1 < current ? 'wave_done' : i + 1 === current ? 'wave_current' : i === count - 1 && info?.stage !== 1 ? 'wave_boss' : 'wave_todo';
      picture(this.waveTrack, key, (i - (count - 1) / 2) * spacing, 0, 20);
    }
  }
  setLocked(locked: boolean): void {
    this.locked = locked;
    setUISkin(this.lockIcon.node, locked ? 'btn_lock_on' : 'btn_lock_off');
    this.shopSlots.forEach(card => { card.lockOverlay.active = locked; });
  }
  isInSellArea(x: number, y: number): boolean { return this.shopAvailable && containsShopDrop(x, y); }
  showSellPreview(name: string, gold: number, hover: boolean, population = this.deployed): void {
    if (!this.shopAvailable) return;
    this.dragging = true; this.shopRoot.active = false; this.economyRoot.active = false;
    this.shopHeader.active = false;
    this.sellNode.active = true; this.capLabel.node.active = true; this.unitPanel.active = false;
    this.updateCap(population);
    this.sellLabel.string = `${hover ? '松手出售' : '出售'} · ${name}  +${gold}金`;
    this.sellLabel.color = hover ? GOLD : TEXT;
    const area = SHOP_DROP_AREA;
    paintPanel(this.sellNode.getComponent(Graphics)!, area.width, area.height,
      hover ? new Color(62, 34, 34) : new Color(35, 25, 30), hover ? GOLD : new Color(142, 76, 72));
    setUISkin(this.sellBanner, hover ? 'sell_zone_hot' : 'sell_zone', this.sellBanner.getComponent(Graphics)!);
  }
  clearSellPreview(): void {
    this.dragging = false; this.sellNode.active = false; this.capLabel.node.active = false;
    this.economyRoot.active = true; this.economyControls.active = this.shopAvailable;
    this.shopHeader.active = this.shopAvailable;
    this.shopRoot.active = this.shopAvailable; this.updateCap();
  }
  showUnitDetail(data: UnitDetailData): void {
    this.unitTitle.string = data.name; this.unitTitle.color = TIERS[data.cost ?? 1];
    this.unitCost.string = data.cost ? `${data.cost}金` : '野怪';
    setStarBadge(this.unitStars, data.star);
    this.unitStats.forEach((label, i) => { label.string = [
      `攻击 ${data.atk}`, `护甲 ${data.armor}`, `魔抗 ${data.mr}`,
      `攻速 ${data.atkSpeed}`, `距离 ${data.range}格`,
    ][i]; });
    this.unitDetail.string = `${data.skillName}\n${data.skillDescription}`;
    this.updateUnitVitals(data.hp, data.maxHp, data.mana, data.maxMana);
    const art = `${data.artId}_${data.side === 0 ? 'ally' : 'enemy'}`;
    if (this.detailArt !== art) {
      this.detailArt = art; this.unitPortrait.spriteFrame = null;
      resources.load(UNIT_SPRITE[art], SpriteFrame, (err, frame) => {
        if (!err && this.unitPortrait.isValid && this.detailArt === art) this.unitPortrait.spriteFrame = frame;
      });
    }
    const tint = new Color(255, 255, 255); if (data.tint) tint.fromHEX(data.tint); this.unitPortrait.color = tint;
    this.unitPanel.active = true;
  }
  updateUnitVitals(hp: number, maxHp: number, mana: number, maxMana: number): void {
    this.updateDetailMeter(this.hpMeter, hp, maxHp); this.updateDetailMeter(this.manaMeter, mana, maxMana);
  }
  closeUnitDetail(): void { this.unitPanel.active = false; }
  get unitDetailVisible(): boolean { return this.unitPanel.active; }
  showWarn(msg: string): void { this.warnLabel.string = msg; this.warnTimer = 2; }
  update(dt: number): void {
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) this.warnLabel.string = ''; }
  }
}
