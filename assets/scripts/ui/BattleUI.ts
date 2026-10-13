import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, Color, Graphics, resources, UIOpacity } from 'cc';
import { UNIT_SPRITE } from '../view/ArtPaths';
import { drawStarRing, STAR_RING_COLORS } from '../view/StarRing';
import { SettlementBreakdown } from '../core/EconomySystem';
import { LevelSystem, EXP_PURCHASE, MAX_LEVEL } from '../core/LevelSystem';
import { RoundSettlement } from '../core/RoundFlow';
import { UnitConfigData } from '../core/ConfigManager';

const { ccclass } = _decorator;
const INK = new Color(13, 27, 35);
const GOLD = new Color(204, 174, 109);
const TEXT = new Color(233, 231, 210);
const MUTED = new Color(133, 161, 164);
const TEAL = new Color(89, 203, 176);
const TIERS = [MUTED, new Color(163, 177, 169), TEAL, new Color(86, 167, 226), new Color(181, 127, 230), GOLD];
interface ShopCard { node: Node; portrait: Sprite; name: Label; price: Label; role: Label; border: Graphics; unitId: string | null }

function label(parent: Node, text: string, x: number, y: number, size = 18, color = TEXT, width = 240): Label {
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
function panel(parent: Node, name: string, x: number, y: number, w: number, h: number, fill = INK, edge = GOLD): Node {
  const n = new Node(name); n.addComponent(UITransform).setContentSize(w, h);
  paintPanel(n.addComponent(Graphics), w, h, fill, edge);
  parent.addChild(n); n.setPosition(x, y, 0); return n;
}
function button(parent: Node, text: string, x: number, y: number, w: number, h: number, action: () => void, primary = false): Node {
  const n = panel(parent, 'button', x, y, w, h, primary ? new Color(44, 77, 76) : new Color(24, 44, 51), primary ? GOLD : new Color(90, 123, 123));
  label(n, text, 0, 0, primary ? 22 : 17, primary ? TEXT : MUTED, w - 10);
  n.on(Node.EventType.TOUCH_END, action); return n;
}

/** Original vector arena and HUD; portraits reuse the existing unit art. */
@ccclass('BattleUI')
export class BattleUI extends Component {
  onFight = () => {};
  onSpeed = (s: number) => {};
  onRestart = () => {};
  onBuy = (slot: number) => {};
  onRefresh = () => {};
  onBuyExp = () => {};
  onSell = (uid: number) => {};
  onLock = () => {};
  private lockLabel: Label;
  private healthLabel: Label;
  private waveLabel: Label;
  private sellNode: Node;
  private sellLabel: Label;
  private nextLabel: Label;
  private reportLabel: Label;
  private unitPanel: Node;
  private unitTitle: Label;
  private unitDetail: Label;
  private waveTotal = 7;
  private speed = 1;
  private backdrop: Node;
  private fightBtn: Node;
  private speedLabel: Label;
  private resultPanel: Node;
  private resultLabel: Label;
  private detailLabel: Label;
  private goldLabel: Label;
  private floorLabel: Label;
  private levelLabel: Label;
  private expGraphic: Graphics;
  private expLabel: Label;
  private buyExpBtn: Node;
  private buyExpLabel: Label;
  private canBuyExp = false;
  private capLabel: Label;
  private phaseLabel: Label;
  private formationLabels: Label[] = [];
  private shopRoot: Node;
  private battleHint: Node;
  private shopSlots: ShopCard[] = [];
  private cap = 1;
  private deployed = 0;
  private warnLabel: Label;
  private warnTimer = 0;

  init(): void {
    this.node.addComponent(UITransform).setContentSize(1280, 720);
    this.drawArena();
    const header = panel(this.node, 'roundBar', 0, 310, 330, 54, new Color(17, 35, 42), GOLD);
    this.floorLabel = label(header, '第 1 层', -78, 0, 22, GOLD, 130);
    this.phaseLabel = label(header, '准备阶段', 76, 0, 17, TEAL, 130);
    label(this.node, '浮 空 棋 境', -490, 313, 24, GOLD, 240);
    this.healthLabel = label(this.node, '生命 20 / 20', 490, 320, 19, TEAL, 230);
    this.waveLabel = label(this.node, '', 490, 294, 12, MUTED, 260);

    const army = panel(this.node, 'formation', -488, 137, 192, 230, new Color(16, 33, 40), new Color(85, 113, 109));
    label(army, '我的阵容', 0, 83, 19, GOLD, 170);
    this.capLabel = label(army, '已上阵  0 / 1', 0, 48, 17, TEAL, 180);
    for (let i = 0; i < 3; i++) this.formationLabels.push(label(army, '', 0, 10 - i * 32, 16, TEXT, 180));
    label(army, '拖动棋子调整站位', 0, -87, 12, MUTED, 180);
    label(this.node, '敌 方 阵 地', 0, 270, 12, MUTED);
    label(this.node, '己 方 布 阵', -484, -28, 13, TEAL, 190);
    label(this.node, '7 列 × 4 排', -484, -51, 12, MUTED, 190);
    const legend = new Node('starLegend'); this.node.addChild(legend); legend.setPosition(-484, -91, 0);
    const ring = legend.addComponent(Graphics);
    STAR_RING_COLORS.forEach((color, i) => {
      const x = -54 + i * 54;
      ring.strokeColor = color; ring.lineWidth = i === 0 ? 1.5 : 2.5;
      ring.ellipse(x, 0, 11, 4); ring.stroke();
      label(legend, `${i + 1}星`, x, -19, 11, color, 50);
    });

    const command = panel(this.node, 'command', 488, 111, 192, 180, new Color(16, 33, 40), new Color(85, 113, 109));
    label(command, '远征指令', 0, 56, 19, GOLD, 170);
    label(command, '布阵完成后开始战斗', 0, 23, 12, MUTED, 180);
    this.fightBtn = button(this.node, '开始战斗  ›', 488, 99, 166, 48, () => this.onFight(), true);
    const speed = button(this.node, '', 488, 43, 166, 36, () => { this.setSpeed(this.speed % 3 + 1); this.onSpeed(this.speed); });
    this.speedLabel = label(speed, '战斗速度  ×1', 0, 0, 15, MUTED, 155);
    this.sellNode = panel(this.node, 'sellArea', 488, -75, 192, 74, new Color(35, 31, 35), new Color(142, 119, 72));
    label(this.sellNode, '出 售 棋 子', 0, 18, 15, GOLD, 180);
    this.sellLabel = label(this.sellNode, '拖到此处 · 返还金币', 0, -12, 12, MUTED, 185);
    label(this.node, '备 战 席', -426, -173, 15, GOLD, 150);
    label(this.node, '9 个席位', 425, -173, 12, MUTED, 150);

    const dock = panel(this.node, 'shopDock', 0, -281, 1180, 150, new Color(12, 25, 33), new Color(135, 113, 69));
    const gold = panel(dock, 'gold', -481, 56, 178, 28, new Color(30, 45, 45), GOLD);
    this.goldLabel = label(gold, '20 金币', 0, 0, 20, GOLD, 170);
    this.levelLabel = label(dock, '等级 1', -481, 27, 16, TEXT, 170);
    this.expLabel = label(dock, '经验 0 / 2', -481, 9, 11, MUTED, 160);
    const exp = new Node('experience'); dock.addChild(exp); exp.setPosition(-481, -4, 0);
    this.expGraphic = exp.addComponent(Graphics);
    label(dock, '招募棋子', -277, 58, 13, GOLD, 166);
    label(dock, '集齐三个相同星级棋子可升星', 279, 58, 12, MUTED, 350);

    this.shopRoot = new Node('inventory'); this.node.addChild(this.shopRoot);
    const lock = button(this.shopRoot, '', -80, -223, 106, 24, () => this.onLock());
    this.lockLabel = lock.getChildByName('text')!.getComponent(Label)!;
    this.lockLabel.fontSize = 12; this.lockLabel.lineHeight = 17; this.setLocked(false);
    this.buyExpBtn = button(this.shopRoot, '', -481, -306, 174, 28, () => { if (this.canBuyExp) this.onBuyExp(); });
    this.buyExpBtn.addComponent(UIOpacity);
    this.buyExpLabel = this.buyExpBtn.getChildByName('text')!.getComponent(Label)!;
    this.buyExpLabel.fontSize = 13; this.buyExpLabel.lineHeight = 18;
    button(this.shopRoot, '刷新   ↻   2 金币', -481, -338, 174, 28, () => this.onRefresh());
    for (let i = 0; i < 5; i++) {
      const n = panel(this.shopRoot, `shop_${i}`, -277 + i * 176, -286, 164, 104, new Color(25, 43, 50), TIERS[1]);
      n.addComponent(UIOpacity);
      const ornament = new Node('portraitBackdrop'); n.addChild(ornament);
      const g = ornament.addComponent(Graphics);
      polygon(g, [[-78, -8], [-32, 48], [75, 48], [30, -8]], new Color(39, 69, 74));
      g.fillColor = new Color(20, 39, 48); g.ellipse(0, 15, 36, 27); g.fill();
      const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(62, 62);
      const sprite = portrait.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      portrait.setPosition(0, 15, 0); n.addChild(portrait);
      const base = new Node('starRing'); portrait.addChild(base);
      drawStarRing(base.addComponent(Graphics), 62, 1);
      const card: ShopCard = { node: n, portrait: sprite, name: label(n, '', -19, -28, 17, TEXT, 110),
        price: label(n, '', 57, -28, 16, GOLD, 40), role: label(n, '', -49, 35, 10, MUTED, 65),
        border: n.getComponent(Graphics)!, unitId: null };
      this.shopSlots.push(card); n.on(Node.EventType.TOUCH_END, () => { if (card.unitId) this.onBuy(i); });
    }
    const hint = label(this.node, '战斗进行中  ·  招募将在结算后开放', 60, -286, 20, MUTED, 850);
    this.battleHint = hint.node; this.battleHint.active = false;

    this.resultPanel = new Node('settlement'); this.node.addChild(this.resultPanel);
    const shade = panel(this.resultPanel, 'modalShield', 0, 0, 1280, 720, new Color(4, 12, 19, 200), new Color(0, 0, 0, 0));
    shade.on(Node.EventType.TOUCH_START, () => {});
    const result = panel(this.resultPanel, 'result', 0, 35, 550, 380, new Color(17, 35, 43), GOLD);
    this.reportLabel = label(result, '远 征 战 报', 0, 150, 13, GOLD, 500);
    this.resultLabel = label(result, '', 0, 100, 36, TEXT, 500);
    this.detailLabel = label(result, '', 0, -5, 16, MUTED, 510);
    this.detailLabel.node.getComponent(UITransform)!.setContentSize(510, 160);
    const next = button(result, '继续远征  ›', 0, -145, 240, 46, () => this.onRestart(), true);
    this.nextLabel = next.getChildByName('text')!.getComponent(Label)!;
    this.resultPanel.active = false;
    this.warnLabel = label(this.node, '', 0, -140, 17, GOLD, 640);
    this.unitPanel = new Node('unitDetail'); this.node.addChild(this.unitPanel);
    const shield = panel(this.unitPanel, 'detailShield', 0, 0, 1280, 720, new Color(4, 12, 19, 200), new Color(0, 0, 0, 0));
    shield.on(Node.EventType.TOUCH_END, () => { this.unitPanel.active = false; });
    const info = panel(this.unitPanel, 'detailCard', 0, 20, 530, 390);
    info.on(Node.EventType.TOUCH_END, (e) => { e.propagationStopped = true; });
    this.unitTitle = label(info, '', 0, 142, 25, GOLD, 510);
    this.unitDetail = label(info, '', 0, 3, 18, TEXT, 510);
    this.unitDetail.node.getComponent(UITransform)!.setContentSize(510, 240);
    button(info, '关闭', 0, -150, 160, 36, () => { this.unitPanel.active = false; });
    this.unitPanel.active = false;
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
    g.moveTo(-588, -206); g.lineTo(588, -206); g.stroke();
  }

  onDestroy(): void { this.backdrop?.destroy(); }
  setSpeed(s: number): void { this.speed = s; if (this.speedLabel) this.speedLabel.string = `战斗速度  ×${s}`; }
  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }

  refreshTop(gold: number, floor: number, lv: LevelSystem): void {
    this.goldLabel.string = `${gold} 金币`; this.floorLabel.string = `第 ${floor} / ${this.waveTotal} 波`;
    this.levelLabel.string = `等级 ${lv.level}`; this.cap = lv.unitCap; this.updateCap();
    const max = lv.level >= MAX_LEVEL, need = max ? 1 : lv.expToNext();
    this.canBuyExp = !max && gold >= EXP_PURCHASE.gold;
    this.buyExpLabel.string = max ? '已达最高等级' : `购买经验  ${EXP_PURCHASE.gold}金币 → ${EXP_PURCHASE.exp}经验`;
    this.buyExpLabel.color = this.canBuyExp ? TEAL : MUTED;
    this.buyExpBtn.getComponent(UIOpacity)!.opacity = this.canBuyExp ? 255 : 90;
    this.expLabel.string = max ? '经验已满' : `经验 ${lv.exp} / ${need}`;
    const g = this.expGraphic; g.clear(); g.fillColor = new Color(41, 60, 64); g.rect(-73, -2, 146, 4); g.fill();
    const ratio = max ? 1 : Math.max(0, Math.min(1, lv.exp / need));
    if (ratio > 0) { g.fillColor = TEAL; g.rect(-73, -2, 146 * ratio, 4); g.fill(); }
  }
  refreshFormation(units: Array<{ unitId: string; location: string }>, configs: UnitConfigData[] = []): void {
    const board = units.filter(u => u.location === 'board'); this.deployed = board.length; this.updateCap();
    const roles = ['前排', '远程', '法术'];
    ['frontline', 'ranged', 'caster'].forEach((role, i) => {
      const count = board.filter(u => configs.find(c => c.id === u.unitId)?.role === role).length;
      this.formationLabels[i].string = `${roles[i]}    ${count}`;
      this.formationLabels[i].color = count ? TEXT : MUTED;
    });
  }
  private updateCap(): void { if (this.capLabel) this.capLabel.string = `已上阵  ${this.deployed} / ${this.cap}`; }

  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number; artId?: string; role?: string; tint?: string }>): void {
    this.shopSlots.forEach((card, i) => {
      const data = slots[i], id = data?.unitId ?? null; card.unitId = id;
      card.node.getComponent(UIOpacity)!.opacity = id ? 255 : 95;
      card.name.string = id ? data.name : '已招募'; card.price.string = id ? `${data.price}` : '';
      card.role.string = id ? ({ frontline:'前排', ranged:'远程', caster:'法术' }[data.role ?? ''] ?? '') : '';
      const tint = new Color(255, 255, 255); if (data?.tint) tint.fromHEX(data.tint); card.portrait.color = tint;
      card.portrait.node.active = !!id;
      paintPanel(card.border, 164, 104, new Color(25, 43, 50), TIERS[data?.cost ?? 1] ?? GOLD);
      card.portrait.spriteFrame = null;
      if (id) resources.load(UNIT_SPRITE[`${data.artId ?? id}_ally`], SpriteFrame, (err, sf) => {
        if (!err && card.portrait.isValid && card.unitId === id) card.portrait.spriteFrame = sf;
      });
    });
  }
  setShopVisible(v: boolean): void {
    this.shopRoot.active = v; this.battleHint.active = !v;
    this.phaseLabel.string = v ? '准备阶段' : '战斗阶段'; this.phaseLabel.color = v ? TEAL : GOLD;
  }
  showResult(winner: number, settle: SettlementBreakdown | null, expGained: number, levelUps: number, newLevel: number, round?: RoundSettlement): void {
    const ended = !!round?.runResult, win = ended ? round.runResult === 'victory' : winner === 0;
    this.resultLabel.string = ended ? (win ? '远征胜利' : '远征失败') : winner === 0 ? '战斗胜利' : winner === 1 ? '战斗失利' : '势均力敌';
    this.resultLabel.color = win ? TEAL : new Color(229, 139, 122);
    this.phaseLabel.string = ended ? '整局结束' : '战斗结算';
    this.reportLabel.string = ended ? '整 局 结 束' : '远 征 战 报';
    this.nextLabel.string = ended ? '重开一局  ↻' : '下一波  ›';
    const gold = settle ? `阶段 +${settle.floorIncome}    胜利 +${settle.winBonus}    利息 +${settle.interest}\n连胜 / 连败 +${settle.streakBonus}    金币合计 +${settle.total}\n` : '';
    const health = round ? `第 ${round.waveId} 波 · 敌方存活 ${round.enemySurvivors}\n生命 -${round.healthLost}    剩余生命 ${round.healthRemaining}\n` : '';
    this.detailLabel.string = `${health}${gold}经验 +${expGained}${levelUps ? `    升至等级 ${newLevel}` : ''}`;
    this.resultPanel.active = true;
  }
  hideResult(): void { this.resultPanel.active = false; }
  refreshRun(health: number, max: number, wave: number, total: number, name: string): void {
    this.waveTotal = total;
    this.healthLabel.string = `生命 ${health} / ${max}`;
    this.healthLabel.color = health <= max / 3 ? new Color(229, 139, 122) : TEAL;
    this.floorLabel.string = `第 ${wave} / ${total} 波`; this.waveLabel.string = name;
  }
  setLocked(locked: boolean): void { this.lockLabel.string = locked ? '已锁店 · 解锁' : '锁定商店'; this.lockLabel.color = locked ? GOLD : MUTED; }
  isInSellArea(x: number, y: number): boolean { return Math.abs(x - 488) <= 96 && Math.abs(y + 75) <= 37; }
  showSellPreview(name: string, gold: number, hover: boolean): void {
    this.sellLabel.string = `${name} · 返还 ${gold} 金币`;
    this.sellLabel.color = hover ? GOLD : TEXT;
    paintPanel(this.sellNode.getComponent(Graphics)!, 192, 74, hover ? new Color(66, 45, 40) : new Color(35, 31, 35), hover ? GOLD : MUTED);
  }
  clearSellPreview(): void { this.sellLabel.string = '拖到此处 · 返还金币'; this.sellLabel.color = MUTED; paintPanel(this.sellNode.getComponent(Graphics)!, 192, 74, new Color(35, 31, 35)); }
  showUnitDetail(title: string, detail: string): void { this.unitTitle.string = title; this.unitDetail.string = detail; this.unitPanel.active = true; }
  showWarn(msg: string): void { this.warnLabel.string = msg; this.warnTimer = 2; }
  update(dt: number): void {
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) this.warnLabel.string = ''; }
  }
}
