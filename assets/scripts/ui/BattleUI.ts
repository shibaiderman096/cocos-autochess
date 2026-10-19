import { loadArtSprite } from '../view/ArtSpriteLoader';
import { TraitPanel } from './TraitPanel';
import { WaveTransition } from './WaveTransition';
import type { TraitState } from '../battle/Traits';
import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, RichText, Color, Graphics, resources, UIOpacity, view, ResolutionPolicy, input, Input, SpriteAtlas } from 'cc';
import { UNIT_SPRITE, UNIT_ART, UNIT_PORTRAIT, UI_SPRITE, UISkinKey, M2_UI_SPRITE, ENCOUNTER_SPRITE } from '../view/ArtPaths';
import { setUISkin, setStarBadge } from './UISkin';
import { SHOP_DROP_AREA, SHOP_CARDS, containsShopDrop } from './BattleUILayout';
import { EquipmentDisplayItem, equipmentStatRows, equipmentEffectText } from './EquipmentPresentation';
import { healthBarSegments } from '../view/HealthBar';
import { createHealthBarClip } from '../view/HealthBarClip';
import { ManaRegenBadge } from '../view/ManaRegenBadge';
import { drawFactionRing } from '../view/FactionRing';
import { SkillStatRow, skillParagraphs, skillBodyHeight, unitRoleLabel } from './SkillPresentation';
import { SettlementBreakdown } from '../core/EconomySystem';
import { LevelSystem, EXP_PURCHASE, MAX_LEVEL } from '../core/LevelSystem';
import { RoundSettlement, WaveConfig } from '../core/RoundFlow';
import { UnitConfigData } from '../core/ConfigManager';
import { shopCostRates, sellPrice, Cost } from '../core/ShopConfig';
import { CombatAttributes, CombatStatRow, EquipmentConfigData, BackpackItem, BattleClockState } from '../battle/types';

const { ccclass } = _decorator;
const INK = new Color(13, 27, 35);
const GOLD = new Color(204, 174, 109);
const TEXT = new Color(233, 231, 210);
const MUTED = new Color(133, 161, 164);
const TEAL = new Color(89, 203, 176);
const RUN_PROGRESS_WIDTH = 330;
const TIERS = [MUTED, new Color(163, 177, 169), TEAL, new Color(86, 167, 226), new Color(181, 127, 230), GOLD];
const UNIT_ROLES: Record<string, string> = { frontline:'前排', ranged:'远程', caster:'法术', assassin:'物理刺客', fighter:'物理战士', tank:'物理坦克', magicTank:'魔法坦克', physicalCaster:'物理术士', physicalArcher:'物理射手', magicArcher:'魔法射手', support:'治疗辅助' };
interface ShopCard { node: Node; portrait: Sprite; name: Label; price: Label; role: Label; border: Graphics; lockOverlay: Node; unitId: string | null }
export interface UnitDetailData extends Partial<CombatAttributes> {
  name: string; star: number; cost?: number; artId: string; side: 0 | 1; tint?: string;
  hp: number; maxHp: number; mana: number; maxMana: number; shield?: number;
  manaPerSecond?: number;
  traits?: string[];
  atk: number; armor: number; mr: number; atkSpeed: number; range: number;
  skillName: string; skillDescription: string; skillRichDescription?: string;
  damageType?: 'physical' | 'magic';
  skillStats?: SkillStatRow[];
  role?: string; detailKey?: string; skillDisplayName?: string; skillIcon?: UISkinKey; attackSpeedCap?: number;
}
interface DetailMeter { fill: Sprite; value: Label; ratio: number; shield?: Sprite }
export interface DebugMenuData {
  equipment: EquipmentConfigData[];
  units: UnitConfigData[];
  roundsPerStage: number[];
}
type DebugTab = 'equipment' | 'stage' | 'gold' | 'unit';

/** Match damage amounts only: timings, ranges and attack-speed bonuses keep the body color. */
export function colorDamageText(text: string): string {
  const colors: Record<string, string> = { '物理': '#ff9740', '魔法': '#50b4ff', '真实': '#ffffff' };
  return text.replace(/(\d+(?:\.\d+)?(?:%|点)?(?:的)?)(物理|魔法|真实)(伤害)/g,
    (_match, amount, type, suffix) => `<color=${colors[type]}>${amount}${type}${suffix}</color>`);
}

/** Keep drawing and touch coordinates in the same space while filling the viewport. */
export function fillScreen(): void {
  view.setDesignResolutionSize(1280, 720, ResolutionPolicy.EXACT_FIT);
  view.resizeWithBrowserSize(true);
}

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
  private rewardStorage: Label;
  setRewardStorage(count: number, credit: number): void {
    if (!this.rewardStorage) this.rewardStorage = label(this.node, '', -510, -176, 12, GOLD, 200);
    this.rewardStorage.node.active = count > 0 || credit > 0;
    this.rewardStorage.string = `奖励仓库：${count}枚棋子${credit ? ` · 待补价值${credit}` : ''}\n空位后自动补入备战席`;
  }
  onClaimEquipmentReward=(index:number)=>{};
  private equipmentRewardPanel:Node|null=null;
  showEquipmentReward(items:EquipmentConfigData[]):void {
    this.hideEquipmentReward();
    const overlay=panel(this.node,'equipmentReward',0,0,1280,720,new Color(8,17,24,235),INK,null);
    this.equipmentRewardPanel=overlay;
    // Modal touch surface also blocks the existing settlement/restart controls underneath.
    overlay.on(Node.EventType.TOUCH_START,(event:any)=>{event.propagationStopped=true;});
    overlay.on(Node.EventType.TOUCH_END,(event:any)=>{event.propagationStopped=true;});
    label(overlay,`装备奖励 · ${items.length}选一`,0,230,26,GOLD,700);
    label(overlay,'选择一件放入背包，准备阶段可为棋子穿戴',0,193,17,TEXT,750);
    items.forEach((item,index)=>{
      const card=panel(overlay,'rewardCandidate', (index-(items.length-1)/2)*278,-10,264,350);
      const iconNode=new Node('rewardIcon');iconNode.addComponent(UITransform).setContentSize(56,56);card.addChild(iconNode);iconNode.setPosition(0,130,0);
      const sprite=iconNode.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      loadArtSprite(item.icon,(error,frame)=>{if(!error&&sprite.isValid&&this.equipmentRewardPanel===overlay)sprite.spriteFrame=frame;});
      label(card,item.name,0,82,19,GOLD,250);
      const description=label(card,item.description,0,-32,15,TEXT,236);
      description.node.getComponent(UITransform)!.setContentSize(236,196);description.overflow=Label.Overflow.CLAMP;
      description.verticalAlign=Label.VerticalAlign.TOP;description.horizontalAlign=Label.HorizontalAlign.LEFT;description.enableWrapText=true;
      button(card,'选择',0,-143,164,34,()=>{if(this.equipmentRewardPanel===overlay)this.onClaimEquipmentReward(index);},true);
    });
  }
  hideEquipmentReward():void {if(this.equipmentRewardPanel){this.equipmentRewardPanel.active=false;this.equipmentRewardPanel.destroy();this.equipmentRewardPanel=null;}}
  onBackpack = (index: number, event?: any) => {};
  onGrantEquipment = (id = 'guinsoo') => {};
  onDebugGold = (amount: number) => {};
  onDebugUnit = (id: string, star: number) => {};
  onDebugStage = (stage: number, round: number) => {};
  private debugPanel: Node;
  private debugContent: Node;
  private debugStatus: Label;
  private debugData: DebugMenuData = { equipment: [], units: [], roundsPerStage: [] };
  private debugTab: DebugTab = 'equipment';
  private debugPage = 0;
  private debugStage = 1;
  private debugRound = 1;
  private debugStar = 1;
  private equipmentTooltip: Node;
  private equipmentTooltipTitle: Label;
  private equipmentTooltipText: Label;
  private equipmentTooltipIcon: Sprite;
  private equipmentTooltipIconPath = '';
  private equipmentTooltipHeader: Node;
  private equipmentTooltipRows: Array<{ node: Node; iconRoot: Node; name: Label; value: Label }> = [];
  private displayedEquipment: EquipmentConfigData[] = [];
  private backpackSlots: Array<{node: Node; icon: Sprite; text: Label; index: number; iconPath: string}> = [];
  private backpackCaption: Label;
  private backpackPage = 0;
  private backpackData: BackpackItem[] = [];
  private backpackEditable = false;
  private backpackRoot: Node;
  private traitPanel: TraitPanel;
  private waveTransition: WaveTransition;
  private sideTabs: Node[] = [];
  private sideTab: 'traits' | 'backpack' = 'traits';
  refreshTraits(states: TraitState[], roster: UnitConfigData[]): void { this.traitPanel.refresh(states, roster); }
  private setSideTab(tab: 'traits' | 'backpack'): void {
    this.sideTab = tab;
    this.backpackRoot.active = tab === 'backpack'; this.traitPanel.setVisible(tab === 'traits');
    this.hideEquipmentTooltip();
    this.sideTabs.forEach((node, i) => {
      const selected = i === (tab === 'traits' ? 0 : 1);
      node.getChildByName('text')!.getComponent(Label)!.color = selected ? GOLD : MUTED;
    });
  }
  onEquipment = (slot: number) => {};
  private equipmentSlots: Array<{ node: Node; icon: Sprite; stacks: Label }> = [];
  private unitTraits: Label;
  private equipmentEditable = false;
  onFight = () => {};
  onSpeed = (s: number) => {};
  onRestart = () => {};
  onNextWave = () => {};
  onHome = () => {};
  onBuy = (slot: number) => {};
  onRefresh = () => {};
  onBuyExp = () => {};
  onLock = () => {};
  private lockIcon: Sprite;
  private locked = false;
  private waveTrack: Node;
  private waveIdle = 0;
  private preparationBar: Node;
  private preparationFill: Graphics;
  private battleTimer: Node;
  private battleTimerFill: Graphics;
  private battleTimerActive = false;
  private healthLabel: Label;
  private waveLabel: Label;
  private sellNode: Node;
  private sellLabel: Label;
  private unitPanel: Node;
  private combatStatsPanel: Node;
  private combatStatBars: { node: Node; name: Label; value: Label; bar: Graphics }[] = [];
  private combatStatRows: CombatStatRow[] = [];
  private combatStatMetric: 'damage' | 'taken' | 'healing' = 'damage';
  private combatStatSide: 0 | 1 = 0;
  private combatMetricButtons: Node[] = [];
  private combatSideButtons: Node[] = [];
  private combatTabsKey = '';
  private combatStatsTotal: Label;
  private combatStatsBreakdown: Label;
  private combatStatsLegend: Label[] = [];
  private unitTitle: Label;
  private unitDetail: RichText;
  private detailPopup: Node;
  private detailPopupTitle: Label;
  private detailPopupIcon: Sprite;
  private detailPopupIconKey = '';
  private detailPopupRules: Graphics;
  private detailPopupRows: Node;
  private detailPopupClose: Node;
  private detailPopupStatLabels: Array<{ root: Node; name: Label; current: RichText; stars: Label }> = [];
  private detailPopupLayoutKey = '';
  private detailPopupMode: 'skill' | 'attackSpeed' | null = null;
  private currentDetail: UnitDetailData | null = null;
  private detailKey = '';
  private skillIconNode: Node;
  private skillIconKey: UISkinKey = 'icon_swords';
  private attackSpeedIconNode: Node;
  private unitSkillName: Label;
  private unitRole: Label;
  private unitPortrait: Sprite;
  private unitStars: Node;
  private unitCost: Label;
  private unitStats: Label[] = [];
  private detailStar = 0;
  private hpMeter: DetailMeter;
  private manaMeter: DetailMeter;
  private manaRegen: ManaRegenBadge;
  private detailArt = '';
  private homeButton: Node;
  private speed = 1;
  private backdrop: Node;
  private fightBtn: Node;
  private nextWaveBtn: Node;
  private speedLabel: Label;
  private resultPanel: Node;
  private resultTimer = 0;
  private runEndActions: Node;
  private resultLabel: Label;
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
  private shopEncounter = false;
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
    fillScreen();
    this.node.addComponent(UITransform).setContentSize(1280, 720);
    this.drawArena();
    const header = panel(this.node, 'roundBar', 0, 310, RUN_PROGRESS_WIDTH, 54, new Color(17, 35, 42), GOLD);
    this.floorLabel = label(header, '1-1', -78, 0, 22, GOLD, 155);
    this.phaseLabel = label(header, '准备', 76, 0, 17, TEAL, 130);
    this.battleTimer = new Node('battleTimer'); header.addChild(this.battleTimer);
    this.battleTimer.addComponent(UITransform).setContentSize(310, 34);
    this.battleTimerFill = this.battleTimer.addComponent(Graphics);
    this.battleTimer.setSiblingIndex(1); this.battleTimer.active = false;
    panel(this.node, 'healthPanel', 490, 307, 220, 60, INK, GOLD, 'panel_side');
    this.healthLabel = label(this.node, '20 / 20', 490, 320, 19, TEAL, 190);
    this.waveLabel = label(this.node, '', 490, 294, 12, MUTED, 220);
    this.waveTrack = panel(this.node, 'waveTrack', 0, 260, RUN_PROGRESS_WIDTH, 44, INK, GOLD, 'stage_track_panel');
    picture(this.node, 'icon_life', 414, 320, 24);
    this.capLabel = label(this.node, '0 / 1', 0, 88, 86, new Color(91, 184, 255, 240), 380);
    this.capLabel.isBold = true; this.capLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.capLabel.node.setRotationFromEuler(0, 0, 0);
    this.capLabel.node.addComponent(UIOpacity).opacity = 150;
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
    this.buildCombatStats();
    this.buildBackpack();
    this.warnLabel = label(this.node, '', 0, -130, 17, GOLD, 640);
    this.preparationBar = new Node('preparationProgress'); header.addChild(this.preparationBar);
    this.preparationBar.addComponent(UITransform).setContentSize(280, 6);
    this.preparationBar.setPosition(0, -18, 0);
    this.preparationFill = this.preparationBar.addComponent(Graphics);
    this.preparationBar.active = false;
    this.buildDebugMenu();
    this.waveTransition = new WaveTransition(this.node);
    for (const type of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.MOUSE_DOWN, Input.EventType.KEY_DOWN] as const) input.on(type, this.noteActivity, this);
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
      sprite.trim = false;
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
    this.nextWaveBtn = button(command, '下一关', 0, 32, 188, 42, () => this.onNextWave(), true);
    this.nextWaveBtn.active = false;
    const speed = button(command, '', 0, -13, 188, 30,
      () => { this.setSpeed(this.speed % 3 + 1); this.onSpeed(this.speed); });
    picture(speed, 'icon_speed', -76, 0, 20);
    this.speedLabel = label(speed, '×1', 0, 0, 15, MUTED, 150);
    this.homeButton = button(command, '主界面', 0, -50, 188, 28, () => this.onHome());
    this.homeButton.getChildByName('text')!.getComponent(Label)!.fontSize = 13;
  }

  private buildSettlement(): void {
    const header = this.node.getChildByName('roundBar')!;
    this.resultPanel = new Node('roundOutcome'); header.addChild(this.resultPanel);
    this.resultLabel = label(this.resultPanel, '', 0, -102, 28, TEXT, 240);
    this.resultLabel.isBold = true;
    this.runEndActions = new Node('runEndActions'); header.addChild(this.runEndActions);
    button(this.runEndActions, '重开一局', -77, -122, 144, 32, () => this.onRestart());
    button(this.runEndActions, '返回主界面', 77, -122, 144, 32, () => this.onHome());
    this.resultPanel.active = false; this.runEndActions.active = false;
  }
  private buildUnitDetails(): void {
    // Keep the full detail panel above the command dock, including equipment.
    this.unitPanel = panel(this.node, 'unitDetail', 450, 35, 280, 490, INK, GOLD, 'tooltip_panel');
    const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(70, 70);
    this.unitPanel.addChild(portrait); portrait.setPosition(-92, 165, 0);
    this.unitPortrait = portrait.addComponent(Sprite); this.unitPortrait.sizeMode = Sprite.SizeMode.CUSTOM;
    this.unitPortrait.trim = false;
    this.unitTitle = label(this.unitPanel, '', 21, 188, 16, GOLD, 146);
    this.unitStars = new Node('detailStars'); this.unitStars.addComponent(UITransform).setContentSize(60, 20);
    this.unitPanel.addChild(this.unitStars); this.unitStars.setPosition(0, 222, 0);
    const coin = new Node('detailCoin'); coin.addComponent(UITransform).setContentSize(16, 16);
    this.unitPanel.addChild(coin); coin.setPosition(-47, 158, 0);
    const coinSprite = coin.addComponent(Sprite); coinSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    resources.load(UI_SPRITE.iconGold, SpriteFrame, (err, frame) => { if (!err && coinSprite.isValid) coinSprite.spriteFrame = frame; });
    this.unitCost = label(this.unitPanel, '', -12, 158, 14, GOLD, 56);
    this.unitTraits = label(this.unitPanel, '', 0, 119, 13, TEAL, 252);
    this.unitTraits.node.name = 'unitTraits';
    this.unitTraits.enableWrapText = false;
    this.unitTraits.overflow = Label.Overflow.SHRINK;
    this.hpMeter = this.makeDetailMeter('health', 90, UI_SPRITE.hpFillAlly);
    this.manaMeter = this.makeDetailMeter('mana', 65, UI_SPRITE.manaFill);
    this.manaRegen = new ManaRegenBadge(this.manaMeter.fill.node.parent!, 64, 0);
    picture(this.unitPanel, 'divider', 0, 44, 252, 6);
    const statIcons: UISkinKey[] = ['attr_phys_atk', 'attr_armor', 'attr_mr', 'attr_aspd', 'attr_range',
      'attr_phys_bonus', 'attr_spell_bonus', 'attr_crit', 'attr_lifesteal', 'attr_dmg_amp', 'attr_dmg_reduce'];
    const statColors = [new Color(255,151,64), GOLD, new Color(80,180,255), TEAL, TEXT,
      new Color(255,151,64), new Color(80,180,255), GOLD, TEAL, new Color(255,151,64), GOLD];
    const statOrder = [0, 5, 6, 1, 2, 3, 7, 8, 9, 10];
    statIcons.forEach((key, i) => {
      const slot = statOrder.indexOf(i);
      const x = i === 4 ? 82 : (slot % 5 - 2) * 50;
      const y = i === 4 ? 158 : slot < 5 ? 24 : -30;
      const icon = picture(this.unitPanel, key, x, y, 20);
      if (i === 3) {
        this.attackSpeedIconNode = icon.node.parent!;
        this.attackSpeedIconNode.on(Node.EventType.TOUCH_END, () => this.toggleDetailPopup('attackSpeed'));
      }
      const value = label(this.unitPanel, '', i === 4 ? 111 : x, i === 4 ? y : y - 23, 13, statColors[i], i === 4 ? 42 : 48);
      value.node.name = `detailStat${i}`;
      this.unitStats.push(value);
    });
    picture(this.unitPanel, 'divider', 0, -80, 252, 6);
    const close = button(this.unitPanel, '', 124, 219, 20, 20, () => this.closeUnitDetail());
    picture(close, 'icon_close', 0, 0, 14);
    this.skillIconNode = panel(this.unitPanel, 'skillIcon', -97, -115, 46, 46, INK, GOLD, null);
    picture(this.skillIconNode, 'icon_swords', 0, 0, 34);
    this.skillIconNode.on(Node.EventType.TOUCH_END, () => this.toggleDetailPopup('skill'));
    this.unitSkillName = label(this.unitPanel, '', 26, -115, 15, TEXT, 174);
    const role = panel(this.unitPanel, 'unitRole', 0, -151, 252, 26, INK, GOLD, 'panel_ink');
    picture(role, 'icon_swords', -89, 0, 16);
    this.unitRole = label(role, '', 6, 0, 13, TEXT, 176);
    this.detailPopup = panel(this.unitPanel, 'detailPopup', -450, 0, 600, 360, new Color(15, 23, 31, 247), GOLD, null);
    this.detailPopup.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    this.detailPopup.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    this.detailPopupIcon = picture(this.detailPopup, 'icon_swords', -250, 130, 48);
    this.detailPopupTitle = label(this.detailPopup, '', 20, 130, 22, TEXT, 440);
    this.detailPopupTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.detailPopupTitle.isBold = true;
    this.detailPopupClose = button(this.detailPopup, '', 276, 156, 22, 22, () => this.closeDetailPopup());
    picture(this.detailPopupClose, 'icon_close', 0, 0, 14);
    const rules = new Node('skillRules'); this.detailPopup.addChild(rules);
    this.detailPopupRules = rules.addComponent(Graphics);
    this.detailPopupRows = new Node('skillStats'); this.detailPopup.addChild(this.detailPopupRows);
    for (let i = 0; i < 5; i++) {
      const root = new Node(`skillStat${i}`); this.detailPopupRows.addChild(root);
      const name = label(root, '', -214, 0, 15, TEXT, 116); name.horizontalAlign = Label.HorizontalAlign.LEFT;
      name.overflow = Label.Overflow.CLAMP; name.enableWrapText = false;
      const currentNode = new Node('currentValue'); root.addChild(currentNode);
      currentNode.addComponent(UITransform).setAnchorPoint(0, 0.5); currentNode.setPosition(-140, 0, 0);
      const current = currentNode.addComponent(RichText);
      current.fontSize = 16; current.lineHeight = 26; current.maxWidth = 174;
      current.handleTouchEvent = false;
      current.horizontalAlign = Label.HorizontalAlign.LEFT;
      current.verticalAlign = Label.VerticalAlign.CENTER;
      const stars = label(root, '', 147, 0, 14, TEXT, 254); stars.horizontalAlign = Label.HorizontalAlign.RIGHT;
      stars.overflow = Label.Overflow.CLAMP; stars.enableWrapText = false;
      this.detailPopupStatLabels.push({ root, name, current, stars });
    }
    const detail = new Node('skillDescription');
    detail.addComponent(UITransform).setAnchorPoint(0.5, 1);
    this.detailPopup.addChild(detail); detail.setPosition(0, 95, 0);
    this.unitDetail = detail.addComponent(RichText);
    const atlas = new SpriteAtlas();
    this.unitDetail.imageAtlas = atlas;
    this.detailPopupStatLabels.forEach(row => { row.current.imageAtlas = atlas; });
    for (const key of ['attr_phys_bonus', 'attr_spell_bonus'] as const) {
      resources.load(M2_UI_SPRITE[key], SpriteFrame, (err, frame) => {
        if (err || !this.unitDetail.isValid) return;
        atlas.spriteFrames[key] = frame;
        // Rebuild existing inline images when their asynchronously loaded frame arrives.
        for (const textView of [this.unitDetail, ...this.detailPopupStatLabels.map(row => row.current)]) {
          const text = textView.string;
          textView.string = ''; textView.string = text;
        }
      });
    }
    this.unitDetail.fontSize = 17;
    this.unitDetail.maxWidth = 544;
    this.unitDetail.handleTouchEvent = false;
    this.unitDetail.lineHeight = 26;
    this.unitDetail.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.unitDetail.verticalAlign = Label.VerticalAlign.TOP;
    this.detailPopup.active = false;
    const equipmentRoot = panel(this.unitPanel, 'equipment', 0, -205, 252, 72, INK, GOLD, 'tooltip_panel');
    for (let slot = 0; slot < 3; slot++) {
      const node = button(equipmentRoot, '', (slot - 1) * 78, 0, 64, 64, () => { this.hideEquipmentTooltip(); if (this.equipmentEditable) this.onEquipment(slot); });
      node.getChildByName('text')!.destroy();
      node.on(Node.EventType.MOUSE_ENTER, () => this.showEquipmentTooltip(this.displayedEquipment[slot], 110));
      node.on(Node.EventType.MOUSE_LEAVE, () => this.hideEquipmentTooltip());
      node.on(Node.EventType.TOUCH_START, () => this.showEquipmentTooltip(this.displayedEquipment[slot], 110));
      node.on(Node.EventType.TOUCH_CANCEL, () => this.hideEquipmentTooltip());
      const iconNode = new Node('equipmentIcon'); iconNode.addComponent(UITransform).setContentSize(64, 64); node.addChild(iconNode);
      const icon = iconNode.addComponent(Sprite); icon.sizeMode = Sprite.SizeMode.CUSTOM;
      const badge = panel(node, 'equipmentStacks', 16, -21, 30, 20, new Color(8, 17, 23, 235), GOLD, null);
      const stacks = label(badge, '', 0, 0, 14, TEXT, 28); stacks.isBold = true;
      badge.active = false;
      this.equipmentSlots.push({ node, icon, stacks });
    }
    this.unitPanel.active = false;
  }

  private toggleDetailPopup(mode: 'skill' | 'attackSpeed'): void {
    this.detailPopupMode = this.detailPopupMode === mode ? null : mode;
    this.renderDetailPopup();
  }

  private closeDetailPopup(): void {
    this.detailPopupMode = null; this.detailPopup.active = false;
  }

  private renderDetailPopup(): void {
    const data = this.currentDetail; if (!data) return;
    const speed = this.detailPopupMode === 'attackSpeed';
    this.detailPopupTitle.string = speed ? '攻速说明' : data.skillDisplayName ?? data.skillName.split(' · ')[0];
    const text = speed
      ? `每秒普攻次数，所有攻速加值直接相加。\n\n+5%攻速 = +0.05次/秒。\n\n当前：${Number((data.atkSpeed * 100).toFixed(2))}%\n上限：${(data.attackSpeedCap ?? 5) * 100}%`
      : skillParagraphs(data.skillDescription);
    const colored = !speed && data.skillRichDescription ? skillParagraphs(data.skillRichDescription) : `<color=#e9e7d2>${colorDamageText(text)}</color>`;
    if (this.unitDetail.string !== colored) this.unitDetail.string = colored;
    const rows = speed ? [] : data.skillStats ?? [];
    const key = JSON.stringify([speed, data.star, colored, rows, data.skillIcon]);
    if (key !== this.detailPopupLayoutKey) {
      this.detailPopupLayoutKey = key;
      const bodyHeight = skillBodyHeight(colored);
      const height = 82 + bodyHeight + (rows.length ? 20 + rows.length * 28 : 0) + 24;
      const top = height / 2;
      this.detailPopup.getComponent(UITransform)!.setContentSize(600, height);
      paintPanel(this.detailPopup.getComponent(Graphics)!, 600, height, new Color(15, 23, 31, 247), GOLD);
      this.detailPopupIcon.node.parent!.setPosition(-250, top - 40, 0);
      this.detailPopupTitle.node.setPosition(-210, top - 40, 0);
      this.detailPopupTitle.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
      this.detailPopupClose.setPosition(276, top - 20, 0);
      this.unitDetail.node.setPosition(0, top - 84, 0);
      const divider = top - 84 - bodyHeight - 6;
      const g = this.detailPopupRules;
      g.clear(); g.strokeColor = new Color(204, 174, 109, 80); g.lineWidth = 1;
      g.moveTo(-272, top - 74); g.lineTo(272, top - 74); g.stroke();
      if (rows.length) { g.moveTo(-272, divider); g.lineTo(272, divider); g.stroke(); }
      this.detailPopupRows.active = rows.length > 0;
      this.detailPopupRows.setPosition(0, divider - 22, 0);
      const colors: Record<SkillStatRow['tone'], string> = { physical:'#ff9740', magic:'#50b4ff',
        true:'#ffffff', healing:'#7bf59a', shield:'#50b4ff', speed:'#f2d04b', neutral:'#b57fe6' };
      this.detailPopupStatLabels.forEach((view, i) => {
        const row = rows[i]; view.root.active = !!row;
        if (!row) return;
        view.root.setPosition(0, -i * 28, 0);
        view.name.string = `${row.label}：`;
        view.current.string = row.currentRich ?? `<color=${colors[row.tone]}>${row.current}</color>`;
        view.stars.string = row.stars.replace(/\s*\/\s*/g, '/').replace(/\+/g, '').replace(/秒\//g, '/');
      });
      const icon = speed ? 'icon_speed' : data.skillIcon ?? 'icon_swords';
      if (this.detailPopupIconKey !== icon) {
        this.detailPopupIconKey = icon;
        setUISkin(this.detailPopupIcon.node.parent!, icon);
      }
    }
    this.detailPopup.active = this.detailPopupMode !== null;
  }

  showEquipment(items: EquipmentConfigData[], editable: boolean, stacks: number): void {
    this.displayedEquipment = items;
    this.equipmentEditable = editable;
    this.equipmentSlots.forEach((slot, i) => {
      const item = items[i]; slot.icon.node.active = !!item;
      slot.stacks.node.parent!.active = !!item && item.attackSpeedPerAttack > 0;
      slot.stacks.string = String(Math.max(0, Math.floor(stacks)));
      if (slot.node.name !== (item?.id ?? 'empty')) {
        slot.node.name = item?.id ?? 'empty'; slot.icon.spriteFrame = null;
        if (item) loadArtSprite(item.icon, (err, frame) => {
          if (!err && slot.icon.isValid && slot.node.name === item.id) slot.icon.spriteFrame = frame;
        });
      }
    });
  }

  private buildBackpack(): void {
    const root = panel(this.node, 'backpack', -510, 45, 192, 390, INK, GOLD, 'panel_side');
    this.backpackRoot = root;
    this.backpackCaption = label(root, '', 0, 145, 11, MUTED, 180);
    for (let i = 0; i < 24; i++) {
      const node = button(root, '', -66 + (i % 4) * 44, 112 - Math.floor(i / 4) * 44, 36, 36, () => {});
      const child = new Node('backpackIcon'); child.addComponent(UITransform).setContentSize(24, 24); node.addChild(child);
      const icon = child.addComponent(Sprite); icon.sizeMode = Sprite.SizeMode.CUSTOM;
      const slot = { node, icon, text: node.getChildByName('text')!.getComponent(Label)!, index: -1, iconPath: '' };
      this.backpackSlots.push(slot);
      let moved = false;
      node.on(Node.EventType.MOUSE_ENTER, () => this.showEquipmentTooltip(this.backpackData[slot.index], -216));
      node.on(Node.EventType.MOUSE_LEAVE, () => this.hideEquipmentTooltip());
      node.on(Node.EventType.TOUCH_START, () => { moved = false; this.showEquipmentTooltip(this.backpackData[slot.index], -216); });
      node.on(Node.EventType.TOUCH_MOVE, (event) => {
        if (!this.backpackEditable || slot.index < 0) return; moved = true;
        this.hideEquipmentTooltip();
        const point = event.getUILocation(); const local = root.getComponent(UITransform)!.convertToNodeSpaceAR({ x: point.x, y: point.y, z: 0 } as any);
        node.setPosition(local.x, local.y, 0); node.setSiblingIndex(root.children.length - 1);
      });
      const home = () => node.setPosition(-66 + (i % 4) * 44, 112 - Math.floor(i / 4) * 44, 0);
      node.on(Node.EventType.TOUCH_END, (event) => { this.hideEquipmentTooltip(); home(); if (this.backpackEditable && slot.index >= 0) this.onBackpack(slot.index, moved ? event : undefined); });
      node.on(Node.EventType.TOUCH_CANCEL, () => { this.hideEquipmentTooltip(); home(); });
    }
    button(root, '‹', -67, -155, 28, 24, () => { this.backpackPage = Math.max(0, this.backpackPage - 1); this.refreshBackpack(this.backpackData, this.backpackEditable); });
    button(root, '›', 67, -155, 28, 24, () => { this.backpackPage++; this.refreshBackpack(this.backpackData, this.backpackEditable); });
    this.equipmentTooltip = panel(this.node, 'equipmentTooltip', -216, 45, 360, 300,
      new Color(14, 20, 29, 250), new Color(119, 112, 76), null);
    this.equipmentTooltipHeader = new Node('equipmentHeader'); this.equipmentTooltip.addChild(this.equipmentTooltipHeader);
    const portrait = panel(this.equipmentTooltipHeader, 'equipmentPortrait', -128, -48, 68, 68,
      new Color(8, 13, 21), new Color(100, 96, 72), null);
    const icon = new Node('equipmentPortraitIcon'); icon.addComponent(UITransform).setContentSize(64, 64); portrait.addChild(icon);
    this.equipmentTooltipIcon = icon.addComponent(Sprite); this.equipmentTooltipIcon.sizeMode = Sprite.SizeMode.CUSTOM;
    this.equipmentTooltipTitle = label(this.equipmentTooltipHeader, '', -80, -26, 20, TEXT, 234);
    this.equipmentTooltipTitle.isBold = true;
    this.equipmentTooltipTitle.overflow = Label.Overflow.CLAMP;
    this.equipmentTooltipTitle.enableWrapText = true;
    this.equipmentTooltipTitle.verticalAlign = Label.VerticalAlign.TOP;
    this.equipmentTooltipTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.equipmentTooltipTitle.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
    this.equipmentTooltipTitle.node.getComponent(UITransform)!.setContentSize(234, 52);
    this.equipmentTooltipText = label(this.equipmentTooltip, '', -162, 0, 15, TEXT, 324);
    this.equipmentTooltipText.overflow = Label.Overflow.RESIZE_HEIGHT;
    this.equipmentTooltipText.enableWrapText = true;
    this.equipmentTooltipText.node.getComponent(UITransform)!.setAnchorPoint(0, 1);
    this.equipmentTooltipText.node.getComponent(UITransform)!.setContentSize(324, 23);
    this.equipmentTooltipText.lineHeight = 23;
    this.equipmentTooltipText.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.equipmentTooltipText.verticalAlign = Label.VerticalAlign.TOP;
    this.equipmentTooltip.active = false;
    this.traitPanel = new TraitPanel(this.node);
    this.sideTabs = [button(this.node, '羁绊', -556, 218, 84, 30, () => this.setSideTab('traits')),
      button(this.node, '背包', -464, 218, 84, 30, () => this.setSideTab('backpack'))];
    this.sideTabs[0].name = 'traitsTab'; this.sideTabs[1].name = 'backpackTab';
    this.setSideTab(this.sideTab);
  }
  private showEquipmentTooltip(item: EquipmentDisplayItem | undefined, x: number): void {
    if (!item || !this.equipmentTooltip) { this.hideEquipmentTooltip(); return; }
    const stats = equipmentStatRows(item);
    this.equipmentTooltipTitle.string = item.name;
    this.equipmentTooltipText.string = equipmentEffectText(item);
    // Force the wrapped paragraph height before sizing the card; long effects stay visible.
    this.equipmentTooltip.active = true;
    this.equipmentTooltipText.updateRenderData(true);
    const height = 130 + stats.length * 34 + this.equipmentTooltipText.node.getComponent(UITransform)!.contentSize.height;
    const top = height / 2;
    this.equipmentTooltip.getComponent(UITransform)!.setContentSize(360, height);
    paintPanel(this.equipmentTooltip.getComponent(Graphics)!, 360, height, new Color(14, 20, 29, 250), new Color(119, 112, 76));
    this.equipmentTooltipHeader.setPosition(0, top, 0);
    stats.forEach((stat, i) => {
      let row = this.equipmentTooltipRows[i];
      if (!row) {
        const node = panel(this.equipmentTooltip, 'equipmentStat', 0, 0, 324, 30,
          new Color(8, 13, 21), new Color(8, 13, 21), null);
        const iconRoot = picture(node, stat.icon, -144, 0, 20).node.parent!;
        const name = label(node, '', -124, 0, 16, MUTED, 202);
        name.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
        const value = label(node, '', 148, 0, 17, TEXT, 80);
        value.isBold = true; value.horizontalAlign = Label.HorizontalAlign.RIGHT;
        value.node.getComponent(UITransform)!.setAnchorPoint(1, 0.5);
        row = { node, iconRoot, name, value }; this.equipmentTooltipRows.push(row);
      }
      row.node.active = true; row.node.setPosition(0, top - 110 - i * 34, 0);
      setUISkin(row.iconRoot, stat.icon);
      row.name.string = stat.name; row.value.string = stat.value;
    });
    this.equipmentTooltipRows.forEach((row, i) => { row.node.active = i < stats.length; });
    this.equipmentTooltipText.node.setPosition(-162, top - 110 - stats.length * 34, 0);
    if (this.equipmentTooltipIconPath !== item.icon) {
      this.equipmentTooltipIconPath = item.icon; this.equipmentTooltipIcon.spriteFrame = null;
      loadArtSprite(item.icon, (err, frame) => {
        if (!err && this.equipmentTooltipIcon.isValid && this.equipmentTooltipIconPath === item.icon) this.equipmentTooltipIcon.spriteFrame = frame;
      });
    }
    this.equipmentTooltip.setPosition(x, Math.max(-344 + top, Math.min(45, 344 - top)), 0);
    this.equipmentTooltip.setSiblingIndex(this.node.children.length - 1);
    this.equipmentTooltip.active = true;
  }
  private hideEquipmentTooltip(): void {
    if (this.equipmentTooltip) this.equipmentTooltip.active = false;
  }

  configureDebug(data: DebugMenuData): void {
    this.debugData = { ...data, units: data.units.slice().sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1) || a.id.localeCompare(b.id)) };
    if (this.debugPanel?.active) this.renderDebugMenu();
  }

  refreshDebugState(stage: number, round: number, stageCount: number): void {
    this.debugStatus.string = `当前 ${stage}-${round} · 本局${stageCount}阶段 · 装备/棋子仅准备阶段领取`;
  }

  private buildDebugMenu(): void {
    const toggle = button(this.node, 'Debug 菜单', -510, 302, 150, 34, () => {
      this.debugPanel.active = !this.debugPanel.active;
      if (this.debugPanel.active) {
        this.hideEquipmentTooltip();
        this.debugPanel.setSiblingIndex(this.node.children.length - 1);
        this.renderDebugMenu();
      }
    });
    toggle.name = 'debugToggle'; toggle.getChildByName('text')!.getComponent(Label)!.fontSize = 15;
    this.debugPanel = panel(this.node, 'debugMenu', 0, 60, 640, 480, INK, GOLD, 'panel_side');
    this.debugPanel.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    this.debugPanel.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    label(this.debugPanel, 'Debug 调试菜单', -130, 207, 21, GOLD, 300);
    const close = button(this.debugPanel, '关闭', 271, 207, 70, 30, () => { this.debugPanel.active = false; });
    close.name = 'debugClose'; close.getChildByName('text')!.getComponent(Label)!.fontSize = 13;
    const tabs: Array<{ id: DebugTab; text: string }> = [
      { id: 'equipment', text: '获取装备' }, { id: 'stage', text: '调整阶段' },
      { id: 'gold', text: '获得金币' }, { id: 'unit', text: '获得棋子' },
    ];
    tabs.forEach((tab, i) => {
      const node = button(this.debugPanel, tab.text, (i - 1.5) * 148, 160, 136, 34, () => {
        this.debugTab = tab.id; this.debugPage = 0; this.renderDebugMenu();
      });
      node.name = `debugTab_${tab.id}`; node.getChildByName('text')!.getComponent(Label)!.fontSize = 15;
    });
    this.debugStatus = label(this.debugPanel, '', 0, 120, 12, MUTED, 596);
    this.debugPanel.active = false;
  }

  private renderDebugMenu(): void {
    if (this.debugContent) { this.debugContent.active = false; this.debugContent.destroy(); }
    const root = new Node('debugContent'); this.debugPanel.addChild(root); root.setPosition(0, -30, 0);
    this.debugContent = root;
    const action = (name: string, text: string, x: number, y: number, width: number, callback: () => void) => {
      const node = button(root, text, x, y, width, 32, callback);
      node.name = name; node.getChildByName('text')!.getComponent(Label)!.fontSize = 15; return node;
    };
    if (this.debugTab === 'gold') {
      label(root, '增加金币，立即保存', 0, 92, 19, GOLD, 540);
      [10, 100, 1000].forEach((amount, i) => action(`debugGold${amount}`, `+${amount} 金币`, (i - 1) * 184, 25, 166, () => this.onDebugGold(amount)));
      label(root, '准备与战斗阶段均可使用', 0, -45, 13, MUTED, 540);
      return;
    }
    if (this.debugTab === 'stage') {
      const count = this.debugData.roundsPerStage.length;
      this.debugStage = Math.max(1, Math.min(count || 1, this.debugStage));
      const rounds = this.debugData.roundsPerStage[this.debugStage - 1] ?? 1;
      this.debugRound = Math.max(1, Math.min(rounds, this.debugRound));
      const select = (title: string, value: number, y: number, change: (delta: number) => void) => {
        label(root, title === 'Stage' ? '目标阶段' : '目标小关', -192, y, 16, MUTED, 130);
        label(root, String(value), 0, y, 23, GOLD, 90);
        action(`debug${title}Minus`, '−', -85, y, 58, () => change(-1));
        action(`debug${title}Plus`, '+', 85, y, 58, () => change(1));
      };
      select('Stage', this.debugStage, 70, delta => {
        this.debugStage = Math.max(1, Math.min(count, this.debugStage + delta)); this.debugRound = 1; this.renderDebugMenu();
      });
      action('debugStagePlus10', '+10', 192, 70, 72, () => {
        this.debugStage = Math.min(count, this.debugStage + 10); this.debugRound = 1; this.renderDebugMenu();
      });
      select('Round', this.debugRound, 10, delta => {
        this.debugRound = Math.max(1, Math.min(rounds, this.debugRound + delta)); this.renderDebugMenu();
      });
      action('debugJump', '跳转到所选关卡', 0, -58, 274, () => this.onDebugStage(this.debugStage, this.debugRound));
      label(root, `最多${count}阶段，超出本局范围会自动扩展`, 0, -113, 12, MUTED, 580);
      label(root, '取消当前战斗，保留资源，不发放结算奖励', 0, -143, 12, MUTED, 580);
      return;
    }
    if (this.debugTab === 'unit') {
      [1, 2, 3].forEach((star, i) => action(`debugStar${star}`, `${star}星${this.debugStar === star ? ' ✓' : ''}`, (i - 1) * 100, 112, 90, () => {
        this.debugStar = star; this.renderDebugMenu();
      }));
    }
    const items = this.debugTab === 'equipment' ? this.debugData.equipment : this.debugData.units;
    const pages = Math.max(1, Math.ceil(items.length / 6)); this.debugPage = Math.min(this.debugPage, pages - 1);
    items.slice(this.debugPage * 6, this.debugPage * 6 + 6).forEach((item, i) => {
      const equipment = this.debugTab === 'equipment';
      const node = action(`debug_${equipment ? 'equipment' : 'unit'}_${item.id}`,
        equipment ? `${item.name} · 领取` : `${item.name} · ${(item as UnitConfigData).cost ?? 1}费 · 领取${this.debugStar}星`,
        0, 70 - i * 38, 568, () => {
          if (equipment) { if (this.backpackEditable) this.onGrantEquipment(item.id); else this.showWarn('仅准备阶段可领取装备'); }
          else this.onDebugUnit(item.id, this.debugStar);
        });
      if (equipment) {
        const icon = new Node('debugItemIcon'); node.addChild(icon); icon.setPosition(-250, 0, 0);
        icon.addComponent(UITransform).setContentSize(24, 24);
        const sprite = icon.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        loadArtSprite((item as EquipmentConfigData).icon, (err, frame) => { if (!err && sprite.isValid) sprite.spriteFrame = frame; });
      }
    });
    action('debugPrevPage', '上一页', -185, -166, 110, () => { this.debugPage = Math.max(0, this.debugPage - 1); this.renderDebugMenu(); });
    label(root, `${this.debugPage + 1} / ${pages}`, 0, -166, 15, MUTED, 100);
    action('debugNextPage', '下一页', 185, -166, 110, () => { this.debugPage = Math.min(pages - 1, this.debugPage + 1); this.renderDebugMenu(); });
  }
  refreshBackpack(items: BackpackItem[], editable: boolean): void {
    this.backpackData = items; this.backpackEditable = editable;
    const pages = Math.max(1, Math.ceil(items.length / 24)); this.backpackPage = Math.min(this.backpackPage, pages - 1);
    this.backpackCaption.string = `${items.length}件 · ${this.backpackPage + 1}/${pages}页 · ${editable ? '拖到棋子装备' : '战斗中锁定'}`;
    this.backpackSlots.forEach((slot, i) => {
      const index = this.backpackPage * 24 + i, item = items[index]; slot.index = item ? index : -1;
      slot.text.string = ''; slot.icon.node.active = !!item;
      const iconPath = item?.icon ?? '';
      if (slot.iconPath !== iconPath) {
        // Resource paths contain '/', which Creator rejects in node names.
        slot.iconPath = iconPath; slot.icon.spriteFrame = null;
        if (item) loadArtSprite(item.icon, (err, frame) => {
          if (!err && slot.icon.isValid && slot.iconPath === iconPath) slot.icon.spriteFrame = frame;
        });
      }
    });
  }

  private buildCombatStats(): void {
    this.combatStatsPanel = panel(this.node, 'combatStatistics', 474, 48, 232, 444, INK, GOLD, 'panel_side');
    label(this.combatStatsPanel, '本场统计', 0, 202, 16, GOLD, 208);
    const metrics = ['damage', 'taken', 'healing'] as const;
    this.combatMetricButtons = metrics.map((metric, i) => button(this.combatStatsPanel,
      ['伤害', '承伤', '治疗/护盾'][i], (i - 1) * 70, 174, 64, 28, () => {
        this.combatStatMetric = metric; this.renderCombatStats();
      }));
    this.combatMetricButtons[2].getChildByName('text')!.getComponent(Label)!.fontSize = 12;
    this.combatStatsTotal = label(this.combatStatsPanel, '合计 0', 0, -128, 12, GOLD, 208);
    this.combatStatsBreakdown = label(this.combatStatsPanel, '', 0, -146, 10, TEXT, 208);
    this.combatStatsLegend = [0, 1, 2].map(() => label(this.combatStatsPanel, '', 0, -166, 11, TEXT, 58));
    this.combatSideButtons = ([0, 1] as const).map((side, i) => button(this.combatStatsPanel,
      side === 0 ? '己方' : '敌方', i ? 52 : -52, -194, 96, 30, () => {
        this.combatStatSide = side; this.renderCombatStats();
      }));
    this.renderCombatStats();
  }

  refreshCombatStats(rows: CombatStatRow[]): void {
    this.combatStatRows = rows;
    this.renderCombatStats();
    this.combatStatsPanel.active = !this.unitPanel.active;
  }

  private renderCombatStats(): void {
    const metric = this.combatStatMetric;
    const value = (row: CombatStatRow) => row[metric] + (metric === 'healing' ? row.shielding ?? 0 : 0);
    const rows = this.combatStatRows.filter(row => row.side === this.combatStatSide
      && (!row.sourceKind || metric === 'damage'))
      .sort((a, b) => value(b) - value(a) || a.id - b.id);
    const max = Math.max(1, ...rows.map(value));
    const spacing = Math.min(28, 260 / Math.max(1, rows.length));
    const fontSize = spacing < 24 ? 10 : 11;
    rows.forEach((row, index) => {
      if (!this.combatStatBars[index]) {
        const node = new Node('combatStatRow'); node.addComponent(UITransform).setContentSize(208, 28);
        this.combatStatsPanel.addChild(node);
        const bar = node.addComponent(Graphics);
        this.combatStatBars[index] = { node, bar,
          name: label(node, '', -39, 4, 11, TEXT, 130), value: label(node, '', 77, 4, 11, GOLD, 54) };
      }
      const view = this.combatStatBars[index]; view.node.active = true;
      view.node.setPosition(0, 140 - index * spacing, 0);
      view.name.fontSize = fontSize; view.value.fontSize = fontSize;
      view.name.string = `${row.name} ${row.star}★`; view.value.string = `${Math.round(value(row))}`;
      view.bar.clear(); view.bar.fillColor = new Color(5, 16, 23); view.bar.rect(-104, -11, 208, 7); view.bar.fill();
      const types = metric === 'damage' ? row.damageByType : row.takenByType;
      const amounts = metric === 'healing' ? [row.healing, row.shielding ?? 0] : [types.physical, types.magic, types.true];
      const colors = metric === 'healing' ? [TEAL, new Color(180,186,194)] : [new Color(255,151,64), new Color(80,180,255), Color.WHITE];
      let x = -104;
      amounts.forEach((amount, i) => {
        const width = 208 * amount / max;
        if (width > 0) { view.bar.fillColor = colors[i]; view.bar.rect(x, -11, width, 7); view.bar.fill(); x += width; }
      });
    });
    this.combatStatBars.slice(rows.length).forEach(row => { row.node.active = false; });
    this.combatStatsTotal.string = `合计 ${Math.round(rows.reduce((total, row) => total + value(row), 0))}`;
    this.combatStatsBreakdown.node.active = metric === 'healing';
    this.combatStatsBreakdown.string = `治疗 ${Math.round(rows.reduce((sum, row) => sum + row.healing, 0))} · 护盾 ${Math.round(rows.reduce((sum, row) => sum + (row.shielding ?? 0), 0))}`;
    const legends = metric === 'healing' ? ['治疗', '护盾'] : ['物理', '魔法', '真实'];
    const legendColors = metric === 'healing' ? [TEAL, new Color(180,186,194)] : [new Color(255,151,64), new Color(80,180,255), Color.WHITE];
    this.combatStatsLegend.forEach((legend, i) => {
      legend.node.active = i < legends.length;
      if (i < legends.length) { legend.string = legends[i]; legend.color = legendColors[i]; legend.node.setPosition((i - (legends.length - 1) / 2) * 66, -166, 0); }
    });
    const tabsKey = `${metric}:${this.combatStatSide}`;
    if (this.combatTabsKey === tabsKey) return;
    this.combatTabsKey = tabsKey;
    const metrics = ['damage', 'taken', 'healing'];
    this.combatMetricButtons.forEach((node, i) => {
      const selected = metrics[i] === metric;
      node.getChildByName('text')!.getComponent(Label)!.color = selected ? GOLD : MUTED;
      paintPanel(node.getComponent(Graphics)!, 64, 28, selected ? new Color(44,77,76) : INK, selected ? GOLD : MUTED);
      setUISkin(node, selected ? 'btn_primary' : 'btn_secondary');
    });
    this.combatSideButtons.forEach((node, i) => {
      const selected = i === this.combatStatSide;
      node.getChildByName('text')!.getComponent(Label)!.color = selected ? GOLD : MUTED;
      paintPanel(node.getComponent(Graphics)!, 96, 30, selected ? new Color(44,77,76) : INK, selected ? GOLD : MUTED);
      setUISkin(node, selected ? 'btn_primary' : 'btn_secondary');
    });
  }
  private makeDetailMeter(name: string, y: number, texture: string): DetailMeter {
    const root = panel(this.unitPanel, name, 0, y, 250, 18, new Color(5, 16, 23), MUTED, null);
    const content = name === 'health' ? createHealthBarClip(root, 246, 14) : root;
    const node = new Node('fill'); node.addComponent(UITransform).setContentSize(246, 14); content.addChild(node);
    const fill = node.addComponent(Sprite); fill.sizeMode = Sprite.SizeMode.CUSTOM;
    let shield: Sprite | undefined;
    if (name === 'health') {
      const shieldNode = new Node('shieldFill');
      shieldNode.addComponent(UITransform).setContentSize(246, 14);
      shieldNode.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
      content.addChild(shieldNode);
      shield = shieldNode.addComponent(Sprite);
      shield.sizeMode = Sprite.SizeMode.CUSTOM;
      shieldNode.active = false;
      resources.load(UI_SPRITE.shieldFill, SpriteFrame, (err, frame) => {
        if (!err && frame && shield && shield.isValid) shield.spriteFrame = frame;
      });
    }
    const meter: DetailMeter = { fill, value: label(root, '', 0, 0, 11, TEXT, 240), ratio: 0, shield };
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
    this.backdrop.getComponent(UITransform)!.setContentSize(1280, 720);
    setUISkin(this.backdrop, 'arena_sky', g, sprite => { sprite.color = new Color(185, 200, 215); });
  }

  onDestroy(): void {
    this.waveTransition?.stop();
    for (const type of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.MOUSE_DOWN, Input.EventType.KEY_DOWN] as const) input.off(type, this.noteActivity, this);
    this.backdrop?.destroy();
  }
  noteActivity(): void { this.waveIdle = 0; if (this.waveTrack) this.waveTrack.active = true; }
  setBoardCenter(x: number, y: number): void {
    this.capLabel.node.setPosition(x, y + 28, 0);
  }
  playWaveTransition(onCovered: () => WaveConfig, onComplete: () => void): void {
    this.closeUnitDetail(); this.traitPanel.hideDetail(); this.hideEquipmentTooltip();
    this.debugPanel.active = false;
    this.waveTransition.play(onCovered, onComplete);
  }
  setSpeed(s: number): void { this.speed = s; if (this.speedLabel) this.speedLabel.string = `×${s}`; }
  showFightBtn(): void { if (this.fightBtn) this.fightBtn.active = true; }
  hideFightBtn(): void { if (this.fightBtn) this.fightBtn.active = false; }
  setNextWaveVisible(visible: boolean): void {
    this.nextWaveBtn.active = visible;
    if (visible) this.hideFightBtn();
  }

  setCombatCountdown(seconds: number, duration = 1): void {
    if (seconds > 0) this.clearBattleTimer();
    const ratio = Math.max(0, Math.min(1, 1 - seconds / (duration > 0 ? duration : 1)));
    this.preparationBar.active = seconds > 0;
    const g = this.preparationFill; g.clear(); g.fillColor = new Color(5, 16, 23);
    g.rect(-140, -3, 280, 6); g.fill(); g.fillColor = TEAL;
    g.rect(-140, -3, 280 * ratio, 6); g.fill();
    this.phaseLabel.string = seconds > 0 ? `准备 ${seconds.toFixed(1)}s` : this.combatActive ? '战斗' : '准备';
    this.phaseLabel.color = seconds > 0 ? TEAL : GOLD;
  }

  setBattleTimer(clock: BattleClockState): void {
    this.battleTimerActive = true; this.battleTimer.active = true;
    this.preparationBar.active = false; this.floorLabel.node.active = false;
    const overtime = clock.phase === 'overtime';
    const remaining = Math.max(0, clock.remainingSeconds);
    const ratio = Math.max(0, Math.min(1, remaining / Math.max(clock.durationSeconds, 0.001)));
    const g = this.battleTimerFill;
    g.clear(); g.fillColor = new Color(5, 16, 23);
    g.rect(-155, -17, 310, 34); g.fill();
    g.fillColor = overtime ? new Color(159, 68, 36, 235) : new Color(33, 112, 137, 235);
    if (ratio > 0) { g.rect(-155, -17, 310 * ratio, 34); g.fill(); }
    this.phaseLabel.node.setPosition(0, 0, 0);
    this.phaseLabel.node.getComponent(UITransform)!.setContentSize(290, 44);
    this.phaseLabel.fontSize = 21; this.phaseLabel.lineHeight = 26;
    this.phaseLabel.isBold = true;
    this.phaseLabel.string = `${overtime ? '加时' : '战斗'} ${Math.ceil(remaining)}s`;
    this.phaseLabel.color = overtime ? new Color(255, 210, 128) : new Color(219, 246, 255);
  }

  private clearBattleTimer(): void {
    this.battleTimerActive = false;
    this.battleTimer.active = false; this.floorLabel.node.active = true;
    this.phaseLabel.node.setPosition(76, 0, 0);
    this.phaseLabel.node.getComponent(UITransform)!.setContentSize(130, 42);
    this.phaseLabel.fontSize = 17; this.phaseLabel.lineHeight = 22; this.phaseLabel.isBold = false;
  }

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
    const underCap = population < this.cap;
    this.capLabel.color = population > this.cap ? new Color(229, 121, 112, 240)
      : underCap ? new Color(91, 184, 255, 240) : new Color(233, 231, 210, 230);
    this.capLabel.node.active = !this.shopEncounter && (this.dragging || (!this.combatActive && this.shopAvailable && population !== this.cap));
  }

  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number; artId?: string; role?: string; damageType?: 'physical' | 'magic'; tint?: string }>): void {
    this.shopSlots.forEach((card, i) => {
      const data = slots[i], id = data?.unitId ?? null; card.unitId = id;
      card.node.getComponent(UIOpacity)!.opacity = id ? 255 : 95;
      card.name.string = id ? data.name : ''; card.price.string = id ? `${data.price}` : '';
      card.role.string = id ? (unitRoleLabel(data.role, data.damageType) || UNIT_ROLES[data.role ?? ''] || '') : '';
      const tint = new Color(255, 255, 255); if (data?.tint) tint.fromHEX(data.tint); card.portrait.color = tint;
      card.portrait.node.active = !!id;
      card.node.getChildByName('starBadge')!.active = !!id;
      paintPanel(card.border, 164, 104, new Color(25, 43, 50), TIERS[data?.cost ?? 1] ?? GOLD);
      const key: UISkinKey = id ? `card_cost${Math.max(1, Math.min(5, data.cost))}` as UISkinKey : 'card_empty';
      setUISkin(card.node, key, card.border);
      card.portrait.spriteFrame = null;
      const artId = data?.artId ?? id ?? '';
      const portrait = UNIT_ART[artId]?.includes('/units/shadow/') ? UNIT_PORTRAIT[artId] : undefined;
      if (id) loadArtSprite(portrait ?? UNIT_SPRITE[`${artId}_ally`], (err, sf) => {
        if (!err && card.portrait.isValid && card.unitId === id) card.portrait.spriteFrame = sf;
      });
    });
  }
  setShopVisible(v: boolean): void {
    this.shopAvailable = v; this.clearSellPreview();
    this.homeButton.active = v && !this.combatActive;
    if (!this.battleTimerActive) {
      this.phaseLabel.string = this.shopEncounter ? '商店' : this.combatActive ? '战斗' : '准备'; this.phaseLabel.color = this.combatActive ? GOLD : TEAL;
    }
  }
  setShopEncounter(active: boolean): void {
    const wasShop = this.shopEncounter;
    this.shopEncounter = active;
    if (active) { this.hideFightBtn(); this.phaseLabel.string = '商店'; }
    else if (wasShop) this.phaseLabel.string = this.combatActive ? '战斗' : '准备';
    this.updateCap();
  }
  setCombatActive(v: boolean): void {
    this.combatActive = v;
    if (!v) this.clearBattleTimer();
    this.setShopVisible(this.shopAvailable);
  }
  showResult(winner: number, settle: SettlementBreakdown | null, expGained: number, levelUps: number, newLevel: number, round?: RoundSettlement): void {
    this.clearBattleTimer();
    this.preparationBar.active = false;
    const ended = !!round?.runResult, win = ended ? round.runResult === 'victory' : winner === 0;
    this.resultLabel.string = win ? '胜利' : winner === -1 && !ended ? '平局' : '失败';
    this.resultLabel.color = win ? TEAL : new Color(229, 139, 122);
    this.phaseLabel.string = ended ? '整局结束' : '结算';
    this.unitPanel.active = false;
    this.resultPanel.active = true; this.resultTimer = 1;
    this.runEndActions.active = ended;
  }
  hideResult(): void {
    this.resultPanel.active = false; this.runEndActions.active = false; this.resultTimer = 0;
  }
  refreshRun(health: number, max: number, wave: number, total: number, name: string, info?: WaveConfig, stageCount?: number, encounterPlan?: string[]): void {
    this.noteActivity();
    this.healthLabel.string = `${health} / ${max}`;
    this.healthLabel.color = health <= max / 3 ? new Color(229, 139, 122) : TEAL;
    this.floorLabel.string = info?.stage ? `${info.stage}-${info.round}` : `${wave} / ${total}`;
    this.waveLabel.string = info?.stage ? `${name} · 阶段 ${info.stage} / ${stageCount}` : name;
    const current = info?.round ?? wave, count = info?.roundsInStage ?? total;
    for (const child of [...this.waveTrack.children]) if (child.name !== 'skin') child.destroy();
    const width = this.waveTrack.getComponent(UITransform)!.contentSize.width;
    const spacing = count > 1 ? (width - 52) / (count - 1) : 0;
    const nodeScale = count > 1 ? Math.min(1, spacing / 36) : 1;
    const kinds = Array.from({ length: count }, (_, i) => {
      const planned = encounterPlan?.[i];
      if (planned && ENCOUNTER_SPRITE[planned]) return planned;
      if (i + 1 === current && info?.encounterKind) return info.encounterKind;
      return !info?.encounterKind && i === count - 1 && info?.stage !== 1 ? 'boss' : 'normal';
    });
    // Draw links first so their ends remain behind the node artwork.
    for (let i = 1; i < count; i++) {
      const key = i + 1 < current ? 'stage_link_done' : i + 1 === current ? 'stage_link_current' : 'stage_link_todo';
      const gap = spacing - ((kinds[i - 1] === 'boss' ? 18 : 14) + (kinds[i] === 'boss' ? 18 : 14)) * nodeScale;
      picture(this.waveTrack, key, (i - count / 2) * spacing, 0, Math.max(1, gap), 4);
    }
    for (let i = 0; i < count; i++) {
      const boss = kinds[i] === 'boss', x = (i - (count - 1) / 2) * spacing;
      const base = `stage_node_${kinds[i] === 'specialShop' ? 'shop' : kinds[i]}`;
      const key = (i + 1 > current ? `${base}_locked` : base) as UISkinKey;
      picture(this.waveTrack, key, x, 0, (boss ? 36 : 28) * nodeScale);
      if (i + 1 === current) picture(this.waveTrack, boss ? 'stage_node_ring_boss' : 'stage_node_ring', x, 0, (boss ? 48 : 38) * nodeScale);
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
    const key = data.detailKey ?? `${data.name}:${data.artId}:${data.side}`;
    if (this.detailKey !== key) { this.detailKey = key; this.closeDetailPopup(); }
    this.currentDetail = data;
    this.unitTraits.string = (data.traits ?? []).join(' · ');
    this.unitSkillName.string = data.skillDisplayName ?? data.skillName.split(' · ')[0];
    this.unitRole.string = unitRoleLabel(data.role, data.damageType) || UNIT_ROLES[data.role ?? ''] || (data.cost ? '普通棋子' : '野怪');
    const skillIcon = data.skillIcon ?? 'icon_swords';
    if (this.skillIconKey !== skillIcon) {
      this.skillIconKey = skillIcon;
      setUISkin(this.skillIconNode.getChildByName('icon_swords')!, skillIcon);
    }
    this.unitTitle.string = data.name; this.unitTitle.color = TIERS[data.cost ?? 1];
    this.unitCost.string = data.cost ? `${sellPrice(data.cost as Cost, data.star)}金` : '野怪';
    if (this.detailStar !== data.star) {
      this.detailStar = data.star;
      setStarBadge(this.unitStars, data.star);
    }
    const number = (value: number) => Number(value.toFixed(2)).toString();
    this.unitStats.forEach((label, i) => { label.string = [
      number(data.atk * (1 + (data.physicalPower ?? 0) / 100)), number(data.armor), number(data.mr), `${number(data.atkSpeed * 100)}%`, `${number(data.range)}格`,
      `${number(data.physicalPower ?? 0)}%`, `${number(data.spellPower ?? 0)}%`,
      `${number((data.critChance ?? 0.25) * 100)}%`, `${number((data.lifesteal ?? 0) * 100)}%`,
      `${number((data.damageAmp ?? 0) * 100)}%`, `${number((data.damageReduction ?? 0) * 100)}%`,
    ][i]; });
    this.renderDetailPopup();
    this.updateUnitVitals(data.hp, data.maxHp, data.mana, data.maxMana, data.shield);
    this.manaRegen.setRate(data.manaPerSecond ?? 0, data.maxMana > 0);
    const art = `${data.artId}_${data.side === 0 ? 'ally' : 'enemy'}`;
    if (this.detailArt !== art) {
      this.detailArt = art; this.unitPortrait.spriteFrame = null;
      const portrait = UNIT_ART[data.artId]?.includes('/units/shadow/') ? UNIT_PORTRAIT[data.artId] : undefined;
      loadArtSprite(portrait ?? UNIT_SPRITE[art], (err, frame) => {
        if (!err && this.unitPortrait.isValid && this.detailArt === art) this.unitPortrait.spriteFrame = frame;
      });
    }
    const tint = new Color(255, 255, 255); if (data.tint) tint.fromHEX(data.tint); this.unitPortrait.color = tint;
    this.unitPanel.active = true;
    this.combatStatsPanel.active = false;
  }
  updateUnitVitals(hp: number, maxHp: number, mana: number, maxMana: number, shield = 0): void {
    this.updateDetailMeter(this.hpMeter, hp, maxHp); this.updateDetailMeter(this.manaMeter, mana, maxMana);
    const segments = healthBarSegments(hp, maxHp, shield);
    this.hpMeter.ratio = segments.health;
    if (this.hpMeter.fill.spriteFrame) this.hpMeter.fill.fillRange = segments.health;
    const overlay = this.hpMeter.shield;
    if (overlay) {
      const width = segments.shield * 246;
      overlay.node.active = width > 0;
      overlay.node.setPosition(-123 + segments.health * 246, 0, 0);
      overlay.node.getComponent(UITransform)!.setContentSize(width, 14);
    }
    if (segments.shield > 0) this.hpMeter.value.string += ` +${Math.ceil(shield)}护盾`;
  }
  closeUnitDetail(): void {
    this.unitPanel.active = false; this.closeDetailPopup(); this.detailKey = ''; this.currentDetail = null;
    if (this.combatStatsPanel) this.combatStatsPanel.active = true;
  }
  get unitDetailVisible(): boolean { return this.unitPanel.active; }
  showWarn(msg: string): void { this.warnLabel.string = msg; this.warnTimer = 2; }
  update(dt: number): void {
    this.combatStatsPanel.active = !this.unitPanel.active;
    if (this.resultTimer > 0) {
      this.resultTimer = Math.max(0, this.resultTimer - Math.max(0, dt));
      if (this.resultTimer === 0) this.resultPanel.active = false;
    }
    this.waveIdle += Math.max(0, dt);
    if (this.waveIdle >= 3) this.waveTrack.active = false;
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) this.warnLabel.string = ''; }
  }
}
