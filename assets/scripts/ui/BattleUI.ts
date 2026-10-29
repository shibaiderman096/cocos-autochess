import { SettingsPanel, loadBattlePreferences, saveBattlePreferences } from './SettingsPanel';
import type { BattleSettings } from './SettingsPanel';
import { BOARD_CAMERA } from '../view/BoardPresentation';
export type { BattleSettings } from './SettingsPanel';
import { button, label, panel, paintPanel } from './UIPrimitives';
export { button, label, panel, paintPanel } from './UIPrimitives';
import { equipmentStatIcons, equipmentQualityBadge, createEquipmentDescription, setEquipmentDescription } from './EquipmentStatIcons';
import { QUALITY_COLORS } from '../core/EquipmentQuality';
import { GameAudio } from '../view/GameAudio';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { TraitPanel } from './TraitPanel';
import { WaveTransition } from './WaveTransition';
import { ShopDockPopup } from './ShopDockPopup';
import { ShopIncomePanel } from './ShopIncomePanel';
import { ExplorerChestPanel } from './ExplorerChestPanel';
import type { IncomePreview } from '../core/EconomySystem';
import type { TraitState } from '../battle/Traits';
import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform, Label, RichText, Color, Graphics, resources, UIOpacity, view, ResolutionPolicy, SpriteAtlas, isValid, sys, Mask, ScrollView } from 'cc';
import { UNIT_SPRITE, UNIT_ART, UNIT_PORTRAIT, UI_SPRITE, UISkinKey, M2_UI_SPRITE, ENCOUNTER_SPRITE } from '../view/ArtPaths';
import { setUISkin, setStarBadge } from './UISkin';
import { SHOP_CARDS, SHOP_REWARD_AREA, battleUILayout } from './BattleUILayout';
import { EquipmentDisplayItem, equipmentEffectText, equipmentDescriptionText, equipmentNameColor } from './EquipmentPresentation';
import { healthBarSegments } from '../view/HealthBar';
import { projectGroundPoint } from '../view/BoardPresentation';
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
const SHOP_ICON_SIZE = 144;
const TIERS = [MUTED,...QUALITY_COLORS.map(rgb=>new Color(...rgb))];
const UNIT_ROLES: Record<string, string> = { frontline:'前排', ranged:'远程', caster:'法术', assassin:'物理刺客', fighter:'物理战士', tank:'物理坦克', magicTank:'魔法坦克', physicalCaster:'物理术士', physicalArcher:'物理射手', magicArcher:'魔法射手', support:'治疗辅助' };
interface ShopCard { node: Node; portrait: Sprite; name: Label; price: Label; role: Label; border: Graphics; lockOverlay: Node; unitId: string | null }
export interface UnitDetailData extends Partial<CombatAttributes> {
  summonOnly?: boolean;
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

/** Match the orthographic UI camera's uniform scale, including native letterbox offsets. */
export function fillScreen(): void {
  view.setDesignResolutionSize(1280, 720, sys.isMobile ? ResolutionPolicy.FIXED_HEIGHT : ResolutionPolicy.SHOW_ALL);
  view.resizeWithBrowserSize(true);
}


function picture(parent: Node, key: UISkinKey, x: number, y: number, w: number, h = w, ready?: (sprite: Sprite) => void): Sprite {
  const n = new Node(key); n.addComponent(UITransform).setContentSize(w, h);
  parent.addChild(n); n.setPosition(x, y, 0); return setUISkin(n, key, undefined, ready);
}

/** M2 texture HUD over the vector arena; portraits reuse the existing unit art. */
@ccclass('BattleUI')
export class BattleUI extends Component {
  private mobileLayout = false;
  private mobileShopUI = false;
  private shopExpanded = true;
  private shopDock: Node;
  private shopToggle: Node;
  private shopDismiss: Node;
  private inspectorDismiss: Node;
  private explorerInspector: ExplorerChestPanel;
  private explorerPreviousShopExpanded = false;
  private shopSaleHint: Label;
  private shopRewardDock: Node;
  private layout = battleUILayout(1280, false);
  get rewardDockRoot(): Node { return this.shopRewardDock; }

  private syncShopVisibility(): void {
    if (!this.shopDock) return;
    const visible = !this.mobileShopUI || (this.shopExpanded && !this.dragging && (this.shopAvailable || this.shopContentOccupied));
    this.shopDock.active = visible;
    this.shopRewardDock.active = visible;
    this.shopRoot.active = visible && this.shopAvailable && !this.openingShopLocked && !this.dragging;
    const normal = visible && this.shopAvailable && !this.shopContentOccupied && !this.openingShopLocked && !this.dragging;
    this.shopHeader.active = normal; this.economyControls.active = normal;
    if (this.shopToggle) {
      this.shopToggle.active = this.mobileShopUI && !visible && (this.shopAvailable || this.shopContentOccupied)
        && (!this.openingShopLocked || this.shopContentOccupied || this.dragging);
    }
    if (this.shopDismiss) this.shopDismiss.active = (this.mobileShopUI && visible) || !!this.explorerInspector?.visible;
  }
  private toggleShop(): void {
    if (this.dragging || (this.openingShopLocked && !this.shopContentOccupied)) return;
    GameAudio.play('click');
    this.shopExpanded = !this.shopExpanded; this.syncShopVisibility();
  }
  private buildMobileShop(): void {
    const half = view.getVisibleSize?.().width / 2 || 640;
    this.shopDismiss = new Node('shopDismiss');
    this.shopDismiss.addComponent(UITransform).setContentSize(half * 2,720);
    this.node.addChild(this.shopDismiss); this.shopDismiss.setSiblingIndex(0);
    let start: {x:number;y:number} | null = null;
    let moved = false;
    this.shopDismiss.on(Node.EventType.TOUCH_START, event => {
      const p = event.getUILocation(); start = {x:p.x,y:p.y}; moved = false;
      event.propagationStopped = true;
    });
    this.shopDismiss.on(Node.EventType.TOUCH_MOVE, event => {
      const p = event.getUILocation(); if (start && Math.hypot(p.x-start.x,p.y-start.y)>10) moved=true;
      event.propagationStopped = true;
    });
    this.shopDismiss.on(Node.EventType.TOUCH_END, event => {
      event.propagationStopped = true;
      if (start && !moved && !this.dragging) { this.hideExplorerChest();this.shopExpanded=false; this.syncShopVisibility(); }
      start=null;
    });
    this.shopDismiss.on(Node.EventType.TOUCH_CANCEL, () => { start=null; });
    this.shopToggle = new Node('mobileShopToggle');
    this.shopToggle.addComponent(UITransform).setContentSize(SHOP_ICON_SIZE,SHOP_ICON_SIZE);
    this.node.addChild(this.shopToggle); this.shopToggle.setPosition(this.backpackRoot.position.x,-276,0);
    setUISkin(this.shopToggle,'stage_node_shop');
    this.shopToggle.on(Node.EventType.TOUCH_START, event => { if(event)event.propagationStopped=true; });
    this.shopToggle.on(Node.EventType.TOUCH_END, event => { if(event)event.propagationStopped=true; this.toggleShop(); });
    this.shopSaleHint=label(this.node,'',this.shopToggle.position.x+26,-185,20,GOLD,280);
    this.shopSaleHint.node.active=false;
  }
  private setShopUIMode(mode: BattleSettings['uiMode']): void {
    const mobile = mode === 'mobile';
    if (mobile === this.mobileShopUI) return;
    this.mobileShopUI=mobile; this.shopExpanded=!mobile;
    if (mobile && this.shopContentOccupied) this.shopExpanded=true;
    this.clearSellPreview();
    this.backpackCaption.string=this.backpackCaption.string.replace(/拖至(?:商店出售|左下商店)/,mobile?'拖至左下商店':'拖至商店出售');
  }
  private applyResponsiveHUD(): void {
    if(!this.mobileLayout)return;
    const {left,right,shop}=this.layout;
    this.traitPanel.setHeight(463);
    const backpack=this.backpackRoot;
    backpack.getComponent(UITransform)!.setContentSize(192,463);
    paintPanel(backpack.getComponent(Graphics)!,192,463,INK,GOLD);setUISkin(backpack,'panel_side',backpack.getComponent(Graphics)!);
    for(const n of [this.traitPanel.root,backpack])n.setPosition(left,105.5,0);
    this.sideTabs.forEach((n,i)=>{n.setPosition(left+(i?46:-46),310,0);n.getComponent(UITransform)!.setContentSize(88,44);const text=n.getChildByName('text')!.getComponent(Label)!;text.fontSize=23;});
    const stats=this.combatStatsPanel;
    stats.setPosition(right,80,0);stats.getComponent(UITransform)!.setContentSize(232,412);
    paintPanel(stats.getComponent(Graphics)!,232,412,INK,GOLD);
    setUISkin(stats,'panel_side',stats.getComponent(Graphics)!);
    stats.children.find(n=>n.getComponent(Label)?.string==='本场统计')?.setPosition(0,190,0);
    this.combatMetricButtons.forEach(n=>n.setPosition(n.position.x,162,0));
    this.combatSideButtons.forEach(n=>n.setPosition(n.position.x,-190,0));
    this.unitPanel.setPosition(stats.position.x,stats.position.y,0);
    this.unitPanel.getComponent(UITransform)!.setContentSize(280,420);
    paintPanel(this.unitPanel.getComponent(Graphics)!,280,420,INK,GOLD);setUISkin(this.unitPanel,'tooltip_panel',this.unitPanel.getComponent(Graphics)!);
    for(const child of this.unitPanel.children)if(child.name!=='skin'&&child.name!=='equipment'&&child!==this.detailPopup)child.setPosition(child.position.x,child.position.y-22,0);
    const equipment=this.unitPanel.getChildByName('equipment')!;
    equipment.setPosition(-190,0,0);equipment.getComponent(UITransform)!.setContentSize(76,252);
    paintPanel(equipment.getComponent(Graphics)!,76,252,INK,GOLD);setUISkin(equipment,'tooltip_panel',equipment.getComponent(Graphics)!);
    this.equipmentSlots.forEach((slot,i)=>slot.node.setPosition(0,78-i*78,0));
    for(const n of [this.unitPanel,this.node.getChildByName('backpack')!,this.traitPanel.root]){
      for(const text of n.getComponentsInChildren(Label)){text.fontSize=Math.max(17,text.fontSize);text.lineHeight=Math.max(22,text.lineHeight);}
    }
    for(const text of [this.healthLabel,this.floorLabel,this.phaseLabel]){text.fontSize=Math.max(text.fontSize,23);text.lineHeight=28;}
    this.waveLabel.fontSize=17;this.waveLabel.lineHeight=23;
    const health=this.node.getChildByName('healthPanel')!;
    health.setPosition(right,322,0);health.getComponent(UITransform)!.setContentSize(252,64);
    paintPanel(health.getComponent(Graphics)!,252,64,INK,GOLD);setUISkin(health,'panel_side',health.getComponent(Graphics)!);
    this.healthLabel.node.setPosition(right,335,0);this.waveLabel.node.setPosition(right,309,0);
    this.healthLabel.node.getComponent(UITransform)!.setContentSize(190,30);
    this.waveLabel.node.getComponent(UITransform)!.setContentSize(236,24);
    this.waveLabel.enableWrapText=false;this.waveLabel.overflow=Label.Overflow.SHRINK;
    this.node.getChildByName('icon_life')!.setPosition(right-76,335,0);
    this.combatMetricButtons[2].getChildByName('text')!.getComponent(Label)!.string='治疗';
    this.combatMetricButtons.forEach(n=>n.getChildByName('text')!.getComponent(Label)!.fontSize=18);
    this.combatStatsTotal.fontSize=17;this.combatStatsBreakdown.fontSize=14;
    this.combatStatsLegend.forEach(l=>l.fontSize=14);
    this.unitStats.forEach(l=>{l.fontSize=17;l.enableWrapText=false;l.overflow=Label.Overflow.SHRINK;});
    this.unitTitle.fontSize=20;this.unitSkillName.fontSize=20;
    this.backpackSlots.forEach((slot,i)=>slot.node.setPosition(-40+(i%2)*80,145-Math.floor(i/2)*90,0));
    this.backpackCaption.fontSize=17;this.backpackCaption.lineHeight=20;
    this.backpackCaption.node.setPosition(0,-205,0);
    this.backpackCaption.node.getComponent(UITransform)!.setContentSize(124,38);
    backpack.getChildByName('backpackPrevious')!.setPosition(-67,-213,0);
    backpack.getChildByName('backpackNext')!.setPosition(67,-213,0);
    this.shopHeader.getChildByName('lock')!.setPosition(shop.x+shop.width/2-28,-152,0);
  }
  private rewardStorage: Label;
  get rewardStorageAnchor(): Node | null { return this.rewardStorage?.node ?? null; }
  setRewardStorage(count: number): void {
    if (!this.rewardStorage) this.rewardStorage = label(this.node, '', -510, -176, 12, GOLD, 200);
    this.rewardStorage.node.active = count > 0;
    this.rewardStorage.string = `奖励仓库：${count}枚棋子\n空位后自动补入备战席`;
  }
  get healthRewardAnchor(): Node { return this.healthLabel.node; }
  get goldRewardAnchor(): Node { return this.mobileShopUI?this.shopToggle:this.goldLabel.node; }
  get backpackRewardAnchor(): Node { return this.sideTabs[1]; }
  prepareBackpackReward(index: number): void {
    this.setSideTab('backpack');
    this.backpackPage = Math.floor(index / this.backpackSlots.length);
    this.refreshBackpack(this.backpackData, this.backpackEditable);
  }
  backpackRewardSlot(index: number): Node | undefined {
    return this.backpackSlots.find(slot => slot.index === index)?.icon.node;
  }
  onClaimEquipmentReward=(index:number)=>{};
  private equipmentRewardPanel:Node|null=null;
  private openingEncounterPanel: Node | null = null;
  private openingPopup = new ShopDockPopup();
  private equipmentPopup = new ShopDockPopup();
  private shopContentOccupied = false;
  private shopContentRequested = false;
  private openingShopLocked = false;
  setOpeningShopLocked(locked: boolean): void {
    this.openingShopLocked = locked;
    this.setShopContentOccupied(this.shopContentRequested);
    this.clearSellPreview();
  }
  setShopContentOccupied(active: boolean): void {
    this.shopContentRequested=active;
    active=active||!!this.explorerInspector?.visible;
    if (active && !this.shopContentOccupied) this.shopExpanded=true;
    this.shopContentOccupied = active;
    this.shopSlots.forEach(card => card.node.active = !active && !this.openingShopLocked);
    this.shopHeader.active = !active && this.shopAvailable && !this.openingShopLocked;
    this.economyControls.active = !active && this.shopAvailable && !this.openingShopLocked;
    if (!active && this.openingShopLocked && this.mobileShopUI) this.shopExpanded=false;
    this.syncShopVisibility();
  }
  revealShopContent(): void { this.shopExpanded=true; this.syncShopVisibility(); }
  showExplorerChest(points:number,rates:readonly number[],openable:boolean,open:()=>void):void {
    this.closeUnitDetail();this.traitPanel.hideDetail();this.hideEquipmentTooltip();
    if(!this.explorerInspector.visible)this.explorerPreviousShopExpanded=this.shopExpanded;
    this.explorerInspector.show(points,rates,openable,open);
    this.setShopContentOccupied(this.shopContentRequested);this.revealShopContent();
  }
  hideExplorerChest():void { this.explorerInspector?.hide(); }
  private buildInspectorDismiss():void {
    const root=this.inspectorDismiss=new Node('inspectorDismiss');this.node.addChild(root);root.setSiblingIndex(1);
    root.addComponent(UITransform).setContentSize(view.getVisibleSize?.().width??1280,720);
    let start:{x:number;y:number}|null=null,moved=false;
    root.on(Node.EventType.TOUCH_START,(e:any)=>{start=e.getUILocation();moved=false;e.propagationStopped=true;});
    root.on(Node.EventType.TOUCH_MOVE,(e:any)=>{const p=e.getUILocation();if(start&&Math.hypot(p.x-start.x,p.y-start.y)>10)moved=true;e.propagationStopped=true;});
    root.on(Node.EventType.TOUCH_END,(e:any)=>{
      e.propagationStopped=true;
      if(start&&!moved&&!this.dragging){
        if(this.detailPopupMode)this.closeDetailPopup();
        else {this.closeUnitDetail();this.traitPanel.hideDetail();this.hideEquipmentTooltip();}
      }
      start=null;this.syncInspectorDismiss();
    });
    root.on(Node.EventType.TOUCH_CANCEL,()=>{start=null;});root.active=false;
  }
  private syncInspectorDismiss():void {
    if(this.inspectorDismiss)this.inspectorDismiss.active=!!(this.unitPanel?.active||this.equipmentDetail?.active||this.traitPanel?.detailVisible);
  }
  showOpeningEncounter(title: string, choices: Array<{ id: import('../core/OpeningEncounter').OpeningEncounterId; name: string; description: string }>, choose: (id: import('../core/OpeningEncounter').OpeningEncounterId) => void): void {
    this.hideOpeningEncounter(false);
    const a = SHOP_REWARD_AREA;
    const root = this.openingEncounterPanel = panel(this.shopRewardDock, 'openingEncounter', a.x, a.y, a.width, a.height);
    label(root, `${title} · 选择一个奇遇效果，本局持续生效`, 0, 55, 17, GOLD, 760);
    choices.forEach((choice, index) => {
      const card = button(root, '', (index - 1) * 260, -14, 248, 104, () => {
        if (this.openingEncounterPanel === root && !this.dragging) choose(choice.id);
      }, true);
      card.name = `encounter_${choice.id}`;
      label(card, choice.name, 0, 29, 18, GOLD, 230);
      const text = label(card, choice.description, 0, -9, 14, TEXT, 222);
      text.enableWrapText = true; text.overflow = Label.Overflow.CLAMP;
      text.node.getComponent(UITransform)!.setContentSize(222, 62);
    });
    this.openingPopup.play(root, `opening:${title}:${choices.map(choice => choice.id).join(',')}`);
  }
  hideOpeningEncounter(reset = true): void {
    this.openingPopup.clear(reset);
    if (this.openingEncounterPanel) { this.openingEncounterPanel.active = false; this.openingEncounterPanel.destroy(); this.openingEncounterPanel = null; }
  }
  setFreeRefreshes(count: number): void {
    const refresh = this.economyControls.getChildByName('refresh')!;
    const text = refresh.getChildByName('text')!.getComponent(Label)!;
    text.string = count > 0 ? `免费 ×${count}` : '';
    text.fontSize = this.mobileLayout ? 20 : 15; text.node.setPosition(20, 0, 0);
    for (const child of refresh.children) if (child.name === 'goldCost') child.active = count <= 0;
    const labels = refresh.children.filter(child => child.name === 'text' && child !== text.node);
    labels.forEach(child => child.active = count <= 0);
  }
  showEquipmentReward(items:EquipmentConfigData[]):void {
    this.hideEquipmentReward(false);
    const a = SHOP_REWARD_AREA;
    const overlay=panel(this.shopRewardDock,'equipmentReward',a.x,a.y,a.width,a.height,INK,GOLD,null);
    this.equipmentRewardPanel=overlay;
    // Modal touch surface also blocks the existing settlement/restart controls underneath.
    overlay.on(Node.EventType.TOUCH_START,(event:any)=>{event.propagationStopped=true;});
    overlay.on(Node.EventType.TOUCH_END,(event:any)=>{event.propagationStopped=true;});
    label(overlay,`装备奖励 · ${items.length}选一`,0,55,17,GOLD,750);
    items.forEach((item,index)=>{
      const width = (780 - (items.length - 1) * 8) / items.length;
      const card=panel(overlay,'rewardCandidate', (index-(items.length-1)/2)*(width+8),-14,width,104);
      const iconNode=new Node('rewardIcon');iconNode.addComponent(UITransform).setContentSize(32,32);card.addChild(iconNode);iconNode.setPosition(-width/2+23,29,0);
      const sprite=iconNode.addComponent(Sprite);sprite.sizeMode=Sprite.SizeMode.CUSTOM;
      loadArtSprite(item.icon,(error,frame)=>{if(!error&&sprite.isValid&&this.equipmentRewardPanel===overlay)sprite.spriteFrame=frame;});
      label(card,item.name,15,29,15,new Color(...equipmentNameColor(item)),width-58);
      const description=label(card,item.description,0,-2,12,TEXT,width-16);
      description.node.getComponent(UITransform)!.setContentSize(width-16,28);description.overflow=Label.Overflow.SHRINK;
      description.verticalAlign=Label.VerticalAlign.TOP;description.horizontalAlign=Label.HorizontalAlign.LEFT;description.enableWrapText=true;
      button(card,'选择',0,-32,width-16,34,()=>{if(this.equipmentRewardPanel===overlay)this.onClaimEquipmentReward(index);},true);
    });
    this.equipmentPopup.play(overlay, `equipment:${items.map(item => item.id).join(',')}`);
  }
  hideEquipmentReward(reset = true):void {this.equipmentPopup.clear(reset);if(this.equipmentRewardPanel){this.equipmentRewardPanel.active=false;this.equipmentRewardPanel.destroy();this.equipmentRewardPanel=null;}}
  onBackpack = (index: number, event?: any) => {};
  onBackpackDrag = (index: number, event: any) => {};
  onInspectBackpack = (index: number) => {};
  onGrantEquipment = (id = 'guinsoo') => {};
  onDebugGold = (amount: number) => {};
  onDebugUnit = (id: string, star: number) => {};
  onDebugStage = (stage: number, round: number) => {};
  onSettings = (settings: BattleSettings) => {};
  private mainMenuPanel: Node;
  private mainMenuContent: Node;
  private damageNumbers = true;
  private healingNumbers = true;
  private cameraZoom: number = BOARD_CAMERA.defaultZoom;
  private frameRate = 60;
  private settingsPanel: SettingsPanel;
  getBattleSettings(): BattleSettings {
    return { speed: this.speed, damageNumbers: this.damageNumbers, healingNumbers: this.healingNumbers, uiMode:this.mobileShopUI?'mobile':'desktop', cameraZoom:this.cameraZoom, frameRate:this.frameRate };
  }
  setCameraZoom(value: number): void {
    if(this.cameraZoom===value)return;
    this.cameraZoom=value;this.saveBattleSettings();
  }
  private loadBattleSettings(): void {
    const settings = loadBattlePreferences();
    this.damageNumbers = settings.damageNumbers; this.healingNumbers = settings.healingNumbers;
    this.cameraZoom=settings.cameraZoom;this.frameRate=settings.frameRate;
    this.setSpeed(settings.speed);
  }
  private saveBattleSettings(): void {
    saveBattlePreferences(this.getBattleSettings());
    this.refreshSettingsLabels(); this.onSettings(this.getBattleSettings());
  }
  private refreshSettingsLabels(): void { this.settingsPanel?.refresh(); }
  private openMainMenu(): void {
    this.closeUnitDetail(); this.hideEquipmentTooltip(); this.traitPanel.hideDetail();
    this.debugPanel.active = false; this.settingsPanel.show();
  }
  private buildMainMenu(): void {
    this.settingsPanel = new SettingsPanel(this.node, {
      read: () => this.getBattleSettings(),
      change: settings => {
        this.damageNumbers = settings.damageNumbers; this.healingNumbers = settings.healingNumbers;
        this.cameraZoom=settings.cameraZoom;this.frameRate=settings.frameRate;
        this.setShopUIMode(settings.uiMode);
        this.setSpeed(settings.speed);
      },
      home: () => {
        if (this.combatActive) { this.showWarn('战斗结束后可返回主界面'); return; }
        this.settingsPanel.hide(); this.onHome();
      },
    });
    this.mainMenuPanel = this.settingsPanel.root; this.mainMenuContent = this.settingsPanel.content;
  }
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
  private equipmentDetail: Node | null = null;
  private equipmentTooltipTitle: Label;
  private equipmentTooltipText: RichText;
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
  private waveIdle = 3;
  private waveTrackProgress = 0;
  private waveTrackViewport: Node;
  private waveTrackOpacity: UIOpacity;
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
  private incomePanel:ShopIncomePanel;
  refreshIncome(data:IncomePreview):void{this.incomePanel?.refresh(data);}
  showIncomeDetails():void{this.incomePanel?.show();}
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
    this.mobileLayout = !!sys.isMobile;
    this.mobileShopUI = loadBattlePreferences().uiMode === 'mobile';
    this.shopExpanded = !this.mobileShopUI;
    const visibleWidth = view.getVisibleSize?.().width ?? 1280;
    const safe = this.mobileLayout ? sys.getSafeAreaRect?.() : undefined;
    this.layout = battleUILayout(visibleWidth, this.mobileLayout, {
      left: safe?.x ?? 0, right: safe ? visibleWidth - safe.x - safe.width : 0,
    });
    this.node.addComponent(UITransform).setContentSize(1280, 720);
    this.drawArena();
    const header = panel(this.node, 'roundBar', 0, 310, RUN_PROGRESS_WIDTH, 54, new Color(17, 35, 42), GOLD);
    this.floorLabel = label(header, '1-1', -78, 0, 22, GOLD, 155);
    this.phaseLabel = label(header, '准备', 76, 0, 17, TEAL, 130);
    this.battleTimer = new Node('battleTimer'); header.addChild(this.battleTimer);
    this.battleTimer.addComponent(UITransform).setContentSize(310, 34);
    this.battleTimerFill = this.battleTimer.addComponent(Graphics);
    this.battleTimer.setSiblingIndex(1); this.battleTimer.active = false;
    panel(this.node, 'healthPanel', 490, 332, 252, 52, INK, GOLD, 'panel_side');
    this.healthLabel = label(this.node, '100 / 100', 490, 340, 20, TEAL, 190);
    this.healthLabel.node.getComponent(UITransform)!.setContentSize(190,24);
    this.waveLabel = label(this.node, '', 490, 320, 12, MUTED, 236);
    this.waveLabel.node.getComponent(UITransform)!.setContentSize(236,18);
    this.waveTrackViewport = new Node('waveTrackViewport');this.node.addChild(this.waveTrackViewport);
    this.waveTrackViewport.addComponent(UITransform).setContentSize(RUN_PROGRESS_WIDTH,44);
    this.waveTrackViewport.setPosition(0,260,0);this.waveTrackViewport.addComponent(Mask).type=Mask.Type.GRAPHICS_RECT;
    this.waveTrack = panel(this.waveTrackViewport, 'waveTrack', 0, 0, RUN_PROGRESS_WIDTH, 44, INK, GOLD, 'stage_track_panel');
    this.waveTrackOpacity = this.waveTrack.addComponent(UIOpacity);
    this.waveTrackOpacity.opacity=0;this.waveTrack.active=false;this.waveTrackViewport.active=false;
    const trackTrigger=new Node('waveTrackTrigger');this.node.addChild(trackTrigger);
    trackTrigger.addComponent(UITransform).setContentSize(RUN_PROGRESS_WIDTH+48,136);trackTrigger.setPosition(0,292,0);
    trackTrigger.on(Node.EventType.TOUCH_START,this.noteActivity,this);
    trackTrigger.on(Node.EventType.TOUCH_MOVE,this.noteActivity,this);
    picture(this.node, 'icon_life', 414, 340, 24);
    this.capLabel = label(this.node, '0 / 1', 0, 55, 110, new Color(24, 91, 157), 440);
    this.capLabel.isBold = true; this.capLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    this.capLabel.node.setRotationFromEuler(0, 0, 0);
    this.capLabel.node.addComponent(UIOpacity).opacity = 150;
    this.capLabel.node.name = 'population'; this.capLabel.node.active = false;

    const area = this.layout.shop;
    const dock = this.shopDock = panel(this.node, 'shopDock', area.x, area.y, area.width, area.height,
      new Color(12, 25, 33), new Color(135, 113, 69), 'panel_dock');
    this.buildEconomy(dock);
    this.buildShop();
    this.shopRewardDock = new Node('shopRewardDock'); this.node.addChild(this.shopRewardDock);
    if (this.mobileLayout) {
      const scale = Math.min(1.25, (area.width - 12) / (SHOP_REWARD_AREA.width + 96));
      this.shopRewardDock.setScale(scale, scale, 1);
      this.shopRewardDock.setPosition(area.x - SHOP_REWARD_AREA.x * scale, area.y - SHOP_REWARD_AREA.y * scale, 0);
    }
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
    this.buildMainMenu();
    this.buildDebugMenu();
    this.loadBattleSettings();
    this.waveTransition = new WaveTransition(this.node);
    this.applyResponsiveHUD();
    this.buildMobileShop();
    this.buildInspectorDismiss();
    this.explorerInspector=new ExplorerChestPanel(this.shopRewardDock,()=>{
      this.shopExpanded=this.explorerPreviousShopExpanded;
      this.setShopContentOccupied(this.shopContentRequested);
    });
    this.syncShopVisibility();
  }

  private buildEconomy(dock: Node): void {
    this.economyRoot = new Node('economy'); dock.addChild(this.economyRoot);
    this.economyRoot.setPosition(-this.layout.shop.width / 2 + 82, 0, 0);
    const goldIcon = new Node('goldIcon'); goldIcon.addComponent(UITransform).setContentSize(22, 22);
    const goldSprite = goldIcon.addComponent(Sprite); goldSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.shopHeader = new Node('shopHeader'); this.node.addChild(this.shopHeader);
    this.shopHeader.addChild(goldIcon); goldIcon.setPosition(-55, this.mobileLayout ? -152 : -198, 0);
    resources.load(UI_SPRITE.iconGold, SpriteFrame, (err, frame) => {
      if (!err && goldSprite.isValid) goldSprite.spriteFrame = frame;
    });
    this.goldLabel = label(this.shopHeader, '0', -13, this.mobileLayout ? -152 : -198, this.mobileLayout ? 28 : 24, GOLD, 85);
    const rates = new Node('shopRates'); this.shopHeader.addChild(rates); rates.setPosition(this.mobileLayout ? -330 : -300, this.mobileLayout ? -152 : -198, 0);
    this.incomePanel=new ShopIncomePanel(this.shopHeader,this.node,this.mobileLayout?-152:-198);
    for (let i = 0; i < 5; i++) {
      const rate = label(rates, '0%', (i - 2) * (this.mobileLayout ? 58 : 44), 0, this.mobileLayout ? 18 : 14, TIERS[i + 1], this.mobileLayout ? 58 : 42);
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
      label(parent, `${amount}`, 54, y, this.mobileLayout ? 20 : 14, GOLD, 30);
    };
    this.buyExpBtn = button(this.economyControls, '', 0, this.mobileLayout ? 42 : 40, 148, 74,
      () => { if (this.canBuyExp && this.shopAvailable && !this.dragging) this.onBuyExp(); });
    this.buyExpBtn.name = 'buyExperience'; this.buyExpBtn.addComponent(UIOpacity);
    picture(this.buyExpBtn, 'badge_level', -52, 13, 24);
    this.levelBadgeLabel = label(this.buyExpBtn, '1', -52, 13, 14, GOLD, 24);
    this.expLabel = label(this.buyExpBtn, '0 / 2', 12, 16, this.mobileLayout ? 18 : 14, MUTED, 96);
    const exp = new Node('experience'); this.buyExpBtn.addChild(exp); exp.setPosition(0, -3, 0);
    picture(exp, 'exp_bar_bg', 0, 0, 130, 8);
    this.expFill = picture(exp, 'exp_bar_fill', 0, 0, 126, 4, sprite => {
      sprite.type = Sprite.Type.FILLED; sprite.fillType = Sprite.FillType.HORIZONTAL;
      sprite.fillStart = 0; sprite.fillRange = this.expRatio;
    });
    picture(this.buyExpBtn, 'icon_exp', -46, -18, 18);
    this.buyExpLabel = this.buyExpBtn.getChildByName('text')!.getComponent(Label)!;
    this.buyExpLabel.fontSize = this.mobileLayout ? 18 : 15; this.buyExpLabel.lineHeight = 22; this.buyExpLabel.node.setPosition(-17, -22, 0);
    this.buyExpLabel.node.getComponent(UITransform)!.setContentSize(42, 24);
    cost(this.buyExpBtn, EXP_PURCHASE.gold, -18);
    const refresh = button(this.economyControls, '', 0, this.mobileLayout ? -42 : -40, 148, 74, () => { if (!this.shopContentOccupied && !this.dragging) this.onRefresh(); });
    refresh.name = 'refresh'; picture(refresh, 'icon_refresh', -32, 0, 28);
    cost(refresh, 2, 0);
    const lock = new Node('lock'); lock.addComponent(UITransform).setContentSize(24, 24);
    this.shopHeader.addChild(lock); lock.setPosition(354, this.mobileLayout ? -152 : -198, 0);
    if(this.mobileLayout) lock.getComponent(UITransform)!.setContentSize(44,44);
    this.lockIcon = setUISkin(lock, 'btn_lock_off'); lock.on(Node.EventType.TOUCH_END, () => { if (!this.shopContentOccupied && !this.dragging) this.onLock(); });
    this.setLocked(false);
  }

  private buildShop(): void {
    this.shopRoot = new Node('inventory'); this.node.addChild(this.shopRoot);
    for (let i = 0; i < 5; i++) {
      const p=this.layout.cardPosition(i), w=this.layout.cardWidth, h=this.layout.cardHeight;
      const n = panel(this.shopRoot, `shop_${i}`, p.x, p.y, w, h, new Color(25, 43, 50), TIERS[1], 'card_cost1');
      n.setScale(this.mobileLayout ? 1 : SHOP_CARDS.scale, this.mobileLayout ? 1 : SHOP_CARDS.scale, 1); n.addComponent(UIOpacity);
      const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(this.mobileLayout ? 74 : 62, this.mobileLayout ? 74 : 62);
      const sprite = portrait.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.trim = false;
      portrait.setPosition(0, this.mobileLayout ? 35 : 24, 0); n.addChild(portrait);
      const base = new Node('factionRing'); portrait.addChild(base);
      drawFactionRing(base.addComponent(Graphics), this.mobileLayout ? 74 : 62, 0);
      const upgrade = panel(n, 'upgradeBadge', 55, 35, 52, 24, new Color(48, 34, 9, 245), new Color(255, 213, 80), null);
      const upgradeText = label(upgrade, '', 0, 0, 17, new Color(255, 231, 117), 50);
      upgradeText.node.name = 'text'; upgradeText.isBold = true; upgrade.active = false;
      // The five 328x208 card skins share a price box centered at (278,160).
      const priceX = w * (278 / 328 - .5), priceY = h * (.5 - 160 / 208);
      const card: ShopCard = { node: n, portrait: sprite, name: label(n, '', this.mobileLayout ? 0 : -16, this.mobileLayout ? -16 : -25, this.mobileLayout ? 23 : 19, TEXT, this.mobileLayout ? w-14 : 122),
        price: label(n, '', priceX, priceY, this.mobileLayout ? 20 : 18, GOLD, w * 84 / 328 - 8), role: label(n, '', 0, this.mobileLayout ? -73 : -48, this.mobileLayout ? 16 : 13, MUTED, this.mobileLayout ? w-14 : 150),
        border: n.getComponent(Graphics)!, lockOverlay: picture(n, 'card_lock_overlay', 0, 0, w, h).node, unitId: null };
      card.price.enableWrapText=false;card.price.overflow=Label.Overflow.SHRINK;
      card.name.enableWrapText=false;card.name.overflow=Label.Overflow.SHRINK;
      card.role.enableWrapText=false;card.role.overflow=Label.Overflow.SHRINK;
      if(this.mobileLayout)upgrade.setPosition(w/2-29,56,0);
      card.lockOverlay.active = this.locked;
      const highlight = new Node('deployedHighlight'); n.addChild(highlight);
      highlight.addComponent(UITransform).setContentSize(w,h);
      const glow=highlight.addComponent(Graphics), x=w/2-3, y=h/2-3, cut=7;
      glow.moveTo(-x+cut,-y);glow.lineTo(x-cut,-y);glow.lineTo(x,-y+cut);glow.lineTo(x,y-cut);
      glow.lineTo(x-cut,y);glow.lineTo(-x+cut,y);glow.lineTo(-x,y-cut);glow.lineTo(-x,-y+cut);glow.close();
      glow.strokeColor=new Color(255,213,80,75);glow.lineWidth=8;glow.stroke();
      glow.strokeColor=new Color(255,225,130);glow.lineWidth=3;glow.stroke();
      highlight.active=false;
      this.shopSlots.push(card);
      n.on(Node.EventType.TOUCH_END, () => { if (this.shopAvailable && !this.shopContentOccupied && !this.openingShopLocked && !this.dragging && card.unitId) this.onBuy(i); });
    }
  }

  private buildCommand(): void {
    const command = panel(this.node, 'command', this.layout.commandX, this.layout.shop.y, this.mobileLayout ? 240 : 212, this.layout.shop.height,
      new Color(16, 33, 40), new Color(85, 113, 109), 'panel_side');
    this.fightBtn = button(command, '开始战斗', 0, this.mobileLayout ? 70 : 48, this.mobileLayout ? 216 : 188, this.mobileLayout ? 60 : 48, () => this.onFight(), true);
    picture(this.fightBtn, 'icon_swords', -76, 0, 22);
    this.fightBtn.getChildByName('text')!.setPosition(10, 0, 0);
    this.nextWaveBtn = button(command, '下一关', 0, this.mobileLayout ? 70 : 48, this.mobileLayout ? 216 : 188, this.mobileLayout ? 60 : 48, () => this.onNextWave(), true);
    this.nextWaveBtn.active = false;
    const speed = button(command, '', 0, this.mobileLayout ? 3 : -8, this.mobileLayout ? 216 : 188, this.mobileLayout ? 48 : 38,
      () => { this.setSpeed(this.speed % 3 + 1); this.onSpeed(this.speed); });
    picture(speed, 'icon_speed', -76, 0, 20);
    this.speedLabel = label(speed, '×1', 0, 0, this.mobileLayout ? 23 : 18, MUTED, 150);
    this.homeButton = button(command, '设置', 0, -56, this.mobileLayout ? 216 : 188, this.mobileLayout ? 48 : 36, () => this.openMainMenu());
    this.homeButton.name = 'mainMenuButton';
    this.homeButton.getChildByName('text')!.getComponent(Label)!.fontSize = this.mobileLayout ? 23 : 17;
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
  /** Build only the shared inspector for read-only collection pages. */
  initUnitInspector(): Node {
    this.enabled = false;
    this.buildUnitDetails();
    this.showEquipment([], false, 0);
    return this.unitPanel;
  }

  private buildUnitDetails(): void {
    // Keep the full detail panel above the command dock, including equipment.
    this.unitPanel = panel(this.node, 'unitDetail', 450, 66, 280, 478, INK, GOLD, 'tooltip_panel');
    const portrait = new Node('portrait'); portrait.addComponent(UITransform).setContentSize(70, 70);
    this.unitPanel.addChild(portrait); portrait.setPosition(-92, 165, 0);
    this.unitPortrait = portrait.addComponent(Sprite); this.unitPortrait.sizeMode = Sprite.SizeMode.CUSTOM;
    this.unitPortrait.trim = false;
    this.unitTitle = label(this.unitPanel, '', 21, 188, 16, GOLD, 146);
    this.unitTitle.enableWrapText=false;this.unitTitle.overflow=Label.Overflow.SHRINK;
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
    const close = button(this.unitPanel, '', 116, 214, 36, 36, () => this.closeUnitDetail());
    close.name='closeUnitDetail';
    picture(close, 'icon_close', 0, 0, 14);
    this.skillIconNode = panel(this.unitPanel, 'skillIcon', -97, -115, 46, 46, INK, GOLD, null);
    picture(this.skillIconNode, 'icon_swords', 0, 0, 34);
    this.skillIconNode.on(Node.EventType.TOUCH_END, () => this.toggleDetailPopup('skill'));
    this.unitSkillName = label(this.unitPanel, '', 26, -115, 15, TEXT, 174);
    this.unitSkillName.enableWrapText=false;this.unitSkillName.overflow=Label.Overflow.SHRINK;
    const role = panel(this.unitPanel, 'unitRole', 0, -151, 252, 26, INK, GOLD, 'panel_ink');
    picture(role, 'icon_swords', -89, 0, 16);
    this.unitRole = label(role, '', 6, 0, 13, TEXT, 176);
    this.detailPopup = panel(this.unitPanel, 'detailPopup', -450, 0, 600, 360, new Color(15, 23, 31, 255), GOLD, 'panel_modal');
    this.detailPopup.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    this.detailPopup.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    this.detailPopupIcon = picture(this.detailPopup, 'icon_swords', -250, 130, 48);
    this.detailPopupTitle = label(this.detailPopup, '', 20, 130, 22, TEXT, 440);
    this.detailPopupTitle.horizontalAlign = Label.HorizontalAlign.LEFT;
    this.detailPopupTitle.enableWrapText=false;this.detailPopupTitle.overflow=Label.Overflow.SHRINK;
    this.detailPopupTitle.isBold = true;
    this.detailPopupClose = button(this.detailPopup, '', 272, 150, 36, 36, () => this.closeDetailPopup());
    this.detailPopupClose.name='closeSkillDetail';
    picture(this.detailPopupClose, 'icon_close', 0, 0, 14);
    const rules = new Node('skillRules'); this.detailPopup.addChild(rules);
    this.detailPopupRules = rules.addComponent(Graphics);
    this.detailPopupRows = new Node('skillStats'); this.detailPopup.addChild(this.detailPopupRows);
    for (let i = 0; i < 9; i++) {
      const root = new Node(`skillStat${i}`); this.detailPopupRows.addChild(root);
      const name = label(root, '', -270, 0, 15, TEXT, 142); name.horizontalAlign = Label.HorizontalAlign.LEFT;
      name.node.getComponent(UITransform)!.setAnchorPoint(0,.5);
      name.overflow = Label.Overflow.SHRINK; name.enableWrapText = false;
      const currentNode = new Node('currentValue'); root.addChild(currentNode);
      currentNode.addComponent(UITransform).setAnchorPoint(0, 0.5); currentNode.setPosition(-120, 0, 0);
      const current = currentNode.addComponent(RichText);
      current.fontSize = 16; current.lineHeight = 26; current.maxWidth = 160;
      current.handleTouchEvent = false;
      current.horizontalAlign = Label.HorizontalAlign.LEFT;
      current.verticalAlign = Label.VerticalAlign.CENTER;
      const stars = label(root, '', 165, 0, 14, TEXT, 220); stars.horizontalAlign = Label.HorizontalAlign.RIGHT;
      stars.overflow = Label.Overflow.SHRINK; stars.enableWrapText = false;
      this.detailPopupStatLabels.push({ root, name, current, stars });
    }
    const detail = new Node('skillDescription');
    detail.addComponent(UITransform).setAnchorPoint(0.5, 1);
    this.detailPopup.addChild(detail); detail.setPosition(0, 95, 0);
    this.unitDetail = detail.addComponent(RichText);
    const atlas = new SpriteAtlas();
    this.unitDetail.imageAtlas = atlas;
    this.detailPopupStatLabels.forEach(row => { row.current.imageAtlas = atlas; });
    for (const key of ['attr_phys_bonus', 'attr_spell_bonus', 'stat_hp'] as const) {
      resources.load(M2_UI_SPRITE[key], SpriteFrame, (err, frame) => {
        if (err || !this.unitDetail?.isValid) return;
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
    const equipmentRoot = panel(this.unitPanel, 'equipment', 0, -202, 252, 72, INK, GOLD, 'tooltip_panel');
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
      ? `每秒普攻次数，所有攻速加值直接相加。\n\n+5%攻速 = +0.05次/秒。\n\n当前：${Math.round(data.atkSpeed * 100)}%\n上限：${(data.attackSpeedCap ?? 5) * 100}%`
      : skillParagraphs(data.skillDescription);
    const colored = !speed && data.skillRichDescription ? skillParagraphs(data.skillRichDescription) : `<color=#e9e7d2>${colorDamageText(text)}</color>`;
    if (this.unitDetail.string !== colored) this.unitDetail.string = colored;
    const rows = speed ? [] : data.skillStats ?? [];
    const key = JSON.stringify([speed, data.star, colored, rows, data.skillIcon]);
    if (key !== this.detailPopupLayoutKey) {
      this.detailPopupLayoutKey = key;
      const colors: Record<SkillStatRow['tone'], string> = { physical:'#ff9740', magic:'#50b4ff',
        true:'#ffffff', healing:'#7bf59a', shield:'#50b4ff', speed:'#f2d04b', neutral:'#b57fe6' };
      const rowHeights=this.detailPopupStatLabels.map((view,i)=>{
        const row=rows[i];view.root.active=!!row;if(!row)return 0;
        view.name.string=`${row.label}：`;
        view.current.string=row.currentRich??`<color=${colors[row.tone]}>${row.current}</color>`;
        view.stars.string=row.stars.replace(/\s*\/\s*/g,'/').replace(/\+/g,'').replace(/秒\//g,'/');
        return Math.max(34,Math.ceil(view.current.node.getComponent(UITransform)!.contentSize.height+6));
      });
      const bodyHeight = Math.max(skillBodyHeight(colored),this.unitDetail.node.getComponent(UITransform)!.contentSize.height+12);
      const height = 82 + bodyHeight + (rows.length ? 20 + rowHeights.reduce((a,b)=>a+b,0) : 0) + 24;
      const top = height / 2;
      this.detailPopup.getComponent(UITransform)!.setContentSize(600, height);
      paintPanel(this.detailPopup.getComponent(Graphics)!, 600, height, new Color(15, 23, 31, 247), GOLD);
      setUISkin(this.detailPopup,'panel_modal',this.detailPopup.getComponent(Graphics)!);
      const panelScale=this.unitPanel.scale?.x??1;
      const scale=Math.min(1,620/(height*panelScale));
      this.detailPopup.setScale(scale,scale,1);
      this.detailPopup.setPosition((this.mobileLayout?-228:-140)-300*scale-12,-this.unitPanel.position.y/panelScale,0);
      this.detailPopupIcon.node.parent!.setPosition(-250, top - 40, 0);
      this.detailPopupTitle.node.setPosition(-210, top - 40, 0);
      this.detailPopupTitle.node.getComponent(UITransform)!.setAnchorPoint(0, 0.5);
      this.detailPopupClose.setPosition(272, top - 26, 0);
      this.unitDetail.node.setPosition(0, top - 84, 0);
      const divider = top - 84 - bodyHeight - 6;
      const g = this.detailPopupRules;
      g.clear(); g.strokeColor = new Color(204, 174, 109, 80); g.lineWidth = 1;
      g.moveTo(-272, top - 74); g.lineTo(272, top - 74); g.stroke();
      if (rows.length) { g.moveTo(-272, divider); g.lineTo(272, divider); g.stroke(); }
      this.detailPopupRows.active = rows.length > 0;
      this.detailPopupRows.setPosition(0, divider - 22, 0);
      let rowY=0;
      this.detailPopupStatLabels.forEach((view, i) => {
        if(!rows[i])return;
        view.root.setPosition(0,rowY,0);rowY-=rowHeights[i];
      });
      const icon = speed ? 'icon_speed' : data.skillIcon ?? 'icon_swords';
      if (this.detailPopupIconKey !== icon) {
        this.detailPopupIconKey = icon;
        setUISkin(this.detailPopupIcon.node.parent!, icon);
      }
    }
    this.detailPopup.active = this.detailPopupMode !== null;
    this.syncInspectorDismiss();
  }

  showEquipment(items: EquipmentConfigData[], editable: boolean, stacks: number, damageStacks = 0): void {
    this.displayedEquipment = items;
    this.equipmentEditable = editable;
    this.equipmentSlots.forEach((slot, i) => {
      const item = items[i]; slot.icon.node.active = !!item;
      if(item)equipmentQualityBadge(slot.node,item,0,-32,54,10);else{const badge=slot.node.getChildByName('equipmentQualityBadge');if(badge)badge.active=false;}
      slot.stacks.node.parent!.active = !!item && (item.attackSpeedPerAttack > 0 || (item.physicalPowerPerAttack ?? 0) > 0 || !!item.damageTakenStacks);
      slot.stacks.string = String(Math.max(0, Math.floor(item?.damageTakenStacks ? Math.min(damageStacks, item.damageTakenStacks.maxStacks) : stacks)));
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
    this.backpackCaption = label(root, '', 0, -176, 10, MUTED, 102);
    this.backpackCaption.overflow = Label.Overflow.CLAMP;
    this.backpackCaption.node.getComponent(UITransform)!.setContentSize(102, 30);
    for (let i = 0; i < 8; i++) {
      const node = button(root, '', -40 + (i % 2) * 80, 112 - Math.floor(i / 2) * 80, 72, 72, () => {});
      const child = new Node('backpackIcon'); child.addComponent(UITransform).setContentSize(52, 52); node.addChild(child);
      const icon = child.addComponent(Sprite); icon.sizeMode = Sprite.SizeMode.CUSTOM;
      const slot = { node, icon, text: node.getChildByName('text')!.getComponent(Label)!, index: -1, iconPath: '' };
      this.backpackSlots.push(slot);
      let moved = false, start = { x: 0, y: 0 };
      node.on(Node.EventType.MOUSE_ENTER, () => this.showEquipmentTooltip(this.backpackData[slot.index], -216));
      node.on(Node.EventType.MOUSE_LEAVE, () => this.hideEquipmentTooltip());
      node.on(Node.EventType.TOUCH_START, (event) => {
        moved = false; start = event?.getUILocation() ?? { x: 0, y: 0 }; this.showEquipmentTooltip(this.backpackData[slot.index], -216);
      });
      node.on(Node.EventType.TOUCH_MOVE, (event) => {
        if (!this.backpackEditable || slot.index < 0) return;
        const point = event.getUILocation();
        if (!moved && Math.hypot(point.x - start.x, point.y - start.y) <= 8) return;
        moved = true;
        this.hideEquipmentTooltip();
        const local = root.getComponent(UITransform)!.convertToNodeSpaceAR({ x: point.x, y: point.y, z: 0 } as any);
        node.setPosition(local.x, local.y, 0); node.setSiblingIndex(root.children.length - 1);
        this.onBackpackDrag(slot.index, event);
      });
      const home = () => node.setPosition(-40 + (i % 2) * 80, this.mobileLayout ? 145 - Math.floor(i / 2) * 90 : 112 - Math.floor(i / 2) * 80, 0);
      node.on(Node.EventType.TOUCH_END, (event) => {
        const wasMoved = moved; moved = false;
        this.hideEquipmentTooltip(); home(); if (wasMoved && this.dragging) this.clearSellPreview();
        if (slot.index < 0) return;
        if (wasMoved) { if (this.backpackEditable) this.onBackpack(slot.index, event); }
        else this.onInspectBackpack(slot.index);
      });
      node.on(Node.EventType.TOUCH_CANCEL, () => { this.hideEquipmentTooltip(); home(); if (moved && this.dragging) this.clearSellPreview(); moved = false; });
    }
    button(root, '‹', -67, -179, 28, 24, () => { this.backpackPage = Math.max(0, this.backpackPage - 1); this.refreshBackpack(this.backpackData, this.backpackEditable); }).name='backpackPrevious';
    button(root, '›', 67, -179, 28, 24, () => { this.backpackPage++; this.refreshBackpack(this.backpackData, this.backpackEditable); }).name='backpackNext';
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
    this.equipmentTooltipText = createEquipmentDescription(this.equipmentTooltip, 324);
    this.equipmentTooltip.active = false;
    this.traitPanel = new TraitPanel(this.node);
    this.sideTabs = [button(this.node, '羁绊', -556, 218, 84, 30, () => this.setSideTab('traits')),
      button(this.node, '背包', -464, 218, 84, 30, () => this.setSideTab('backpack'))];
    this.sideTabs[0].name = 'traitsTab'; this.sideTabs[1].name = 'backpackTab';
    this.setSideTab(this.sideTab);
  }
  private showEquipmentTooltip(item: EquipmentDisplayItem | undefined, x: number): void {
    if (!item || !this.equipmentTooltip) { this.hideEquipmentTooltip(); return; }
    this.equipmentTooltipTitle.string = item.name;
    this.equipmentTooltipTitle.color = new Color(...equipmentNameColor(item));
    equipmentQualityBadge(this.equipmentTooltipHeader,item,43,-83,78,12);
    this.equipmentTooltip.active = true;
    const previous = this.equipmentTooltip.getChildByName('equipmentStats');
    if (previous) { previous.active = false; previous.destroy(); }
    const icons = equipmentStatIcons(this.equipmentTooltip, item, 324);
    this.equipmentTooltipRows = icons.rows;
    const layout = () => {
      const height = 130 + icons.height + this.equipmentTooltipText.node.getComponent(UITransform)!.contentSize.height;
      const top = height / 2;
      this.equipmentTooltip.getComponent(UITransform)!.setContentSize(360, height);
      paintPanel(this.equipmentTooltip.getComponent(Graphics)!, 360, height, new Color(14, 20, 29, 250), new Color(119, 112, 76));
      this.equipmentTooltipHeader.setPosition(0, top, 0);
      icons.root.setPosition(0, top - 110, 0);
      this.equipmentTooltipText.node.setPosition(-162, top - 110 - icons.height, 0);
      this.equipmentTooltip.setPosition(x, Math.max(-344 + top, Math.min(45, 344 - top)), 0);
    };
    setEquipmentDescription(this.equipmentTooltipText, item, layout);
    if (this.equipmentTooltipIconPath !== item.icon) {
      this.equipmentTooltipIconPath = item.icon; this.equipmentTooltipIcon.spriteFrame = null;
      loadArtSprite(item.icon, (err, frame) => {
        if (!err && this.equipmentTooltipIcon.isValid && this.equipmentTooltipIconPath === item.icon) this.equipmentTooltipIcon.spriteFrame = frame;
      });
    }
    this.equipmentTooltip.setSiblingIndex(this.node.children.length - 1);
    this.equipmentTooltip.active = true;
  }
  private hideEquipmentTooltip(): void {
    if (this.equipmentTooltip) this.equipmentTooltip.active = false;
  }

  /** Catalogue/shop inspectors stay read-only; reserve items can offer guarded actions. */
  showEquipmentDetail(item: EquipmentDisplayItem, actions?: { equip: () => void; recycle: () => void; gold: number }): void {
    this.hideExplorerChest();
    this.closeUnitDetail(); this.hideEquipmentTooltip();
    const size = this.unitPanel.getComponent(UITransform)!.contentSize;
    const root = panel(this.node, 'equipmentDetail', this.unitPanel.position.x, this.unitPanel.position.y,
      size.width, size.height, INK, GOLD, 'tooltip_panel');
    this.equipmentDetail = root;
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END])
      root.on(type, (event: any) => { event.propagationStopped = true; });
    label(root, item.consumable?'道具详情':'装备详情', -24, 213, 16, GOLD, 190).isBold = true;
    const close = button(root, '×', 119, 216, 28, 28, () => this.hideEquipmentDetail());
    close.name = 'closeEquipmentDetail';
    const iconNode = new Node('equipmentDetailIcon'); root.addChild(iconNode);
    iconNode.addComponent(UITransform).setContentSize(64, 64); iconNode.setPosition(-85, 157, 0);
    const icon = iconNode.addComponent(Sprite); icon.sizeMode = Sprite.SizeMode.CUSTOM;
    loadArtSprite(item.icon, (error, frame) => {
      if (!error && icon.isValid && this.equipmentDetail === root) icon.spriteFrame = frame;
    });
    const title = label(root, item.name, 29, 163, 18, new Color(...equipmentNameColor(item)), 154);
    title.isBold = true; title.enableWrapText = true; title.lineHeight = 24;
    title.node.name = 'equipmentDetailName';
    title.node.getComponent(UITransform)!.setContentSize(154, 62);
    equipmentQualityBadge(root,item,29,121,106,12);
    const viewport = new Node('equipmentDetailViewport'); root.addChild(viewport);
    const height = actions ? 254 : 316;
    viewport.addComponent(UITransform).setContentSize(248, height); viewport.setPosition(0, 98 - height / 2, 0);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const content = new Node('equipmentDetailContent'); viewport.addChild(content);
    const transform = content.addComponent(UITransform); transform.setAnchorPoint(.5, 1);
    content.setPosition(0, height / 2, 0);
    const stats = equipmentStatIcons(content, item, 240, 2, 24, 16, 36);
    stats.root.setPosition(0, -18, 0);
    const heading = label(content, equipmentEffectText(item) ? item.consumable?'道具效果':'装备效果' : '装备简介', 0, -stats.height - 28, 14, TEAL, 240);
    heading.node.active = !!equipmentDescriptionText(item);
    heading.isBold = true;
    const effect = createEquipmentDescription(content, 240);
    effect.node.name = 'equipmentDetailEffect'; effect.node.setPosition(-120, -stats.height - 48, 0);
    setEquipmentDescription(effect, item, () => transform.setContentSize(248,
      Math.max(height, stats.height + 64 + effect.node.getComponent(UITransform)!.contentSize.height)));
    const scroll = viewport.addComponent(ScrollView); scroll.content = content;
    scroll.horizontal = false; scroll.vertical = true; scroll.inertia = true;
    scroll.elastic = false; scroll.cancelInnerEvents = true;
    if (actions) {
      const guarded = (action: () => void) => () => { if (this.equipmentDetail === root && root.active) action(); };
      button(root, item.consumable?'使用':'装备', -65, -192, 116, 44, guarded(actions.equip), true).name = 'equipReserveItem';
      button(root, `回收 +${actions.gold}金`, 65, -192, 116, 44, guarded(actions.recycle)).name = 'recycleReserveItem';
    }
    if (this.combatStatsPanel) this.combatStatsPanel.active = false;
  }

  hideEquipmentDetail(): void {
    if (this.equipmentDetail) {
      this.equipmentDetail.active = false; this.equipmentDetail.destroy(); this.equipmentDetail = null;
    }
    if (this.combatStatsPanel) this.combatStatsPanel.active = !this.unitPanel.active;
  }

  configureDebug(data: DebugMenuData): void {
    this.debugData = { ...data, units: data.units.slice().sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1) || a.id.localeCompare(b.id)) };
    if (this.debugPanel?.active) this.renderDebugMenu();
  }

  refreshDebugState(stage: number, round: number, stageCount: number): void {
    this.debugStatus.string = `当前 ${stage}-${round} · 本局${stageCount}阶段 · 装备/棋子仅准备阶段领取`;
  }

  private buildDebugMenu(): void {
    const toggle = button(this.mainMenuContent, '调试工具', 124, -260, 232, 44, () => {
      this.mainMenuPanel.active = false; this.debugPanel.active = true;
      this.debugPanel.setSiblingIndex(this.node.children.length - 1); this.renderDebugMenu();
    });
    toggle.name = 'debugToggle';
    this.debugPanel = panel(this.node, 'debugMenu', 0, 60, 640, 480, INK, GOLD, 'panel_side');
    this.debugPanel.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    this.debugPanel.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    label(this.debugPanel, 'Debug 调试菜单', -130, 207, 21, GOLD, 300);
    const close = button(this.debugPanel, '返回', 271, 207, 70, 30, () => { this.debugPanel.active = false; this.openMainMenu(); });
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
        node.getChildByName('text')!.getComponent(Label)!.color = new Color(...equipmentNameColor(item as EquipmentConfigData));
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
    const pageSize = this.backpackSlots.length;
    const pages = Math.max(1, Math.ceil(items.length / pageSize)); this.backpackPage = Math.min(this.backpackPage, pages - 1);
    this.backpackCaption.string = `${items.length}件 · ${this.backpackPage + 1}/${pages}页\n${editable ? this.mobileShopUI?'拖至左下商店':'拖至商店出售' : '点击查看 · 操作锁定'}`;
    this.backpackSlots.forEach((slot, i) => {
      const index = this.backpackPage * pageSize + i, item = items[index]; slot.index = item ? index : -1;
      slot.text.string = ''; slot.icon.node.active = !!item;
      if(item?.kind==='equipment')equipmentQualityBadge(slot.node,item,0,-30,54,10);else{const badge=slot.node.getChildByName('equipmentQualityBadge');if(badge)badge.active=false;}
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
    this.combatStatsPanel.active = !this.unitPanel.active && !this.equipmentDetail?.active;
  }

  private renderCombatStats(): void {
    const metric = this.combatStatMetric;
    const value = (row: CombatStatRow) => row[metric] + (metric === 'healing' ? row.shielding ?? 0 : 0);
    const rows = this.combatStatRows.filter(row => row.side === this.combatStatSide
      && (!row.sourceKind || metric === 'damage'))
      .sort((a, b) => value(b) - value(a) || a.id - b.id);
    const max = Math.max(1, ...rows.map(value));
    const spacing = Math.min(28, (this.mobileLayout ? 224 : 260) / Math.max(1, rows.length));
    const fontSize = this.mobileLayout ? 16 : spacing < 24 ? 10 : 11;
    rows.forEach((row, index) => {
      if (!this.combatStatBars[index]) {
        const node = new Node('combatStatRow'); node.addComponent(UITransform).setContentSize(208, 28);
        this.combatStatsPanel.addChild(node);
        const bar = node.addComponent(Graphics);
        this.combatStatBars[index] = { node, bar,
          name: label(node, '', -39, 4, 11, TEXT, 130), value: label(node, '', 77, 4, 11, GOLD, 54) };
      }
      const view = this.combatStatBars[index]; view.node.active = true;
      view.node.setPosition(0, (this.mobileLayout ? 124 : 140) - index * spacing, 0);
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
    meter.value.string = `${Math.round(clamped)} / ${Math.round(max)}`;
    if (meter.fill.spriteFrame) meter.fill.fillRange = meter.ratio;
  }

  private drawArena(): void {
    this.backdrop = new Node('arenaBackdrop');
    this.node.parent?.addChild(this.backdrop); this.backdrop.setSiblingIndex(0);
    const g = this.backdrop.addComponent(Graphics);
    g.fillColor = new Color(8, 20, 29); g.rect(-1600, -1000, 3200, 2000); g.fill();
    this.backdrop.getComponent(UITransform)!.setContentSize(1280, 720);
  }

  onDestroy(): void {
    this.explorerInspector?.hide(false);
    this.incomePanel?.hide();
    this.openingPopup.clear(); this.equipmentPopup.clear();
    this.waveTransition?.stop();
    if (isValid(this.backdrop, true)) this.backdrop.destroy();
  }
  noteActivity(): void {
    this.waveIdle = 0;
    if (this.waveTrack) this.waveTrack.active = true;
    if (this.waveTrackViewport) this.waveTrackViewport.active = true;
  }
  setBoardCenter(x: number, y: number): void {
    this.capLabel.node.setPosition(x, y + 28, 0);
  }
  /** Ground inscription below pieces/highlights; the board parent owns zoom and placement. */
  bindBoardPopulation(board: Node): void {
    const node = this.capLabel.node;
    node.parent = board; node.layer = board.layer; node.setSiblingIndex(0);
    const ground = {x: 0, y: 0, z: 1.15};
    const center = projectGroundPoint(ground);
    const right = projectGroundPoint({...ground, x: 1});
    const forward = projectGroundPoint({...ground, z: ground.z - .01});
    node.setPosition(center.x, center.y, 0);
    node.setScale((right.x - center.x) / 100, (forward.y - center.y), 1);
    node.getComponent(UIOpacity)!.opacity = 105;
  }
  playWaveTransition(onCovered: () => WaveConfig, onComplete: () => void): void {
    this.hideExplorerChest();
    this.closeUnitDetail(); this.traitPanel.hideDetail(); this.hideEquipmentTooltip();
    this.debugPanel.active = false; this.mainMenuPanel.active = false;
    this.waveTransition.play(onCovered, onComplete);
  }
  setSpeed(s: number): void { this.speed = s; if (this.speedLabel) this.speedLabel.string = `×${s}`; this.saveBattleSettings(); }
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
    this.rateLabels.forEach((label, i) => { label.string = `${Math.round(rates[i] ?? 0)}%`; });
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
    this.capLabel.color = population > this.cap ? new Color(164, 48, 40)
      : underCap ? new Color(24, 91, 157) : new Color(110, 92, 49);
    this.capLabel.node.active = !this.shopEncounter && (this.dragging || (!this.combatActive && this.shopAvailable && population !== this.cap));
  }

  refreshShop(slots: Array<{ unitId: string | null; name: string; cost: number; price: number; poolLeft: number; artId?: string; role?: string; damageType?: 'physical' | 'magic'; tint?: string; upgradeStar?: 2 | 3 | null; deployed?: boolean }>): void {
    this.shopSlots.forEach((card, i) => {
      const data = slots[i], id = data?.unitId ?? null; card.unitId = id;
      card.node.getComponent(UIOpacity)!.opacity = id ? 255 : 95;
      card.name.string = id ? data.name : ''; card.price.string = id ? `${data.price}` : '';
      card.role.string = id ? (unitRoleLabel(data.role, data.damageType) || UNIT_ROLES[data.role ?? ''] || '') : '';
      const tint = new Color(255, 255, 255); if (data?.tint) tint.fromHEX(data.tint); card.portrait.color = tint;
      card.portrait.node.active = !!id;
      const upgrade = card.node.getChildByName('upgradeBadge')!;
      const rank = data?.upgradeStar;
      card.node.getChildByName('deployedHighlight')!.active=!!id&&!!data?.deployed;
      upgrade.active = !!id && (rank === 2 || rank === 3);
      upgrade.getChildByName('text')!.getComponent(Label)!.string = upgrade.active ? '★'.repeat(rank!) : '';
      paintPanel(card.border, this.layout.cardWidth, this.layout.cardHeight, new Color(25, 43, 50), TIERS[data?.cost ?? 1] ?? GOLD);
      const key: UISkinKey = id ? `card_cost${Math.max(1, Math.min(5, data.cost))}` as UISkinKey : 'card_empty';
      setUISkin(card.node, key, card.border);
      card.portrait.spriteFrame = null;
      const artId = data?.artId ?? id ?? '';
      const portrait = UNIT_PORTRAIT[artId];
      if (id) loadArtSprite(portrait ?? UNIT_SPRITE[`${artId}_ally`], (err, sf) => {
        if (!err && card.portrait.isValid && card.unitId === id) card.portrait.spriteFrame = sf;
      });
    });
  }
  setShopVisible(v: boolean): void {
    this.shopAvailable = v; this.clearSellPreview();
    this.homeButton.active = true;
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
    this.combatActive = false;
    this.clearBattleTimer();
    this.preparationBar.active = false;
    const ended = !!round?.runResult, win = ended ? round.runResult === 'victory' : winner === 0;
    this.resultLabel.string = win ? '胜利' : winner === -1 && !ended ? '平局' : '失败';
    this.resultLabel.color = win ? TEAL : new Color(229, 139, 122);
    this.phaseLabel.string = ended ? '整局结束' : '结算';
    this.hideEquipmentDetail();
    this.unitPanel.active = false;
    this.resultPanel.active = true; this.resultTimer = 1;
    this.runEndActions.active = ended;
  }
  hideResult(): void {
    this.resultPanel.active = false; this.runEndActions.active = false; this.resultTimer = 0;
  }
  setPortalState(visible: boolean): void {
    if (!visible) return;
    this.runEndActions.active = false;
    this.phaseLabel.string = '传送门已开启';
  }
  refreshRun(health: number, max: number, wave: number, total: number, name: string, info?: WaveConfig, stageCount?: number, encounterPlan?: string[]): void {
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
  isInSellArea(x: number, y: number): boolean {
    if (this.mobileShopUI) return this.shopAvailable && Math.hypot(x-this.shopToggle.position.x,y-this.shopToggle.position.y)<=SHOP_ICON_SIZE/2+8;
    const a=this.layout.shop;return this.shopAvailable&&Math.abs(x-a.x)<=a.width/2&&Math.abs(y-a.y)<=a.height/2;
  }
  showSellPreview(name: string, gold: number, hover: boolean, population = this.deployed, allowed = true): void {
    if (!this.shopAvailable) return;
    this.hideEquipmentDetail();
    this.dragging = true; this.shopRoot.active = false; this.economyRoot.active = false;
    if (this.mobileShopUI) this.shopExpanded=false;
    this.syncShopVisibility();
    this.shopHeader.active = false;
    for (const name of ['openingEncounter', 'stageReward', 'equipmentReward']) {
      const content = this.shopRewardDock.getChildByName(name); if (content) content.active = false;
    }
    this.sellNode.active = !this.mobileShopUI; this.capLabel.node.active = true; this.unitPanel.active = false;
    this.updateCap(population);
    this.sellLabel.string = allowed ? `${hover ? '松手出售' : '出售'} · ${name}  +${gold}金` : '1-1 不能出售棋子';
    this.sellLabel.color = allowed && hover ? GOLD : TEXT;
    this.shopSaleHint.string=this.sellLabel.string; this.shopSaleHint.node.active=this.mobileShopUI;
    this.shopToggle.setScale(hover&&this.mobileShopUI?1.08:1,hover&&this.mobileShopUI?1.08:1,1);
    const area = this.layout.shop;
    paintPanel(this.sellNode.getComponent(Graphics)!, area.width, area.height,
      hover ? new Color(62, 34, 34) : new Color(35, 25, 30), hover ? GOLD : new Color(142, 76, 72));
    setUISkin(this.sellBanner, hover ? 'sell_zone_hot' : 'sell_zone', this.sellBanner.getComponent(Graphics)!);
  }
  clearSellPreview(): void {
    this.dragging = false; this.sellNode.active = false; this.capLabel.node.active = false;
    if(this.shopSaleHint)this.shopSaleHint.node.active=false;
    this.shopToggle?.setScale(1,1,1);
    const ordinaryShopVisible = this.shopAvailable && !this.openingShopLocked && !this.shopContentOccupied;
    this.economyRoot.active = true; this.economyControls.active = ordinaryShopVisible;
    this.shopHeader.active = ordinaryShopVisible;
    for (const name of ['openingEncounter', 'stageReward', 'equipmentReward']) {
      const content = this.shopRewardDock.getChildByName(name); if (content) content.active = true;
    }
    this.shopRoot.active = this.shopAvailable && !this.openingShopLocked; this.updateCap();
    this.syncShopVisibility();
  }
  showUnitDetail(data: UnitDetailData): void {
    this.hideExplorerChest();
    if(this.mobileShopUI){this.shopExpanded=false;this.syncShopVisibility();}
    this.hideEquipmentDetail();
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
    this.unitTitle.string = data.name; this.unitTitle.color = TIERS[data.summonOnly?5:Math.max(1,Math.min(5,data.cost ?? 1))];
    this.unitCost.string = data.summonOnly?'0金':data.cost ? `${sellPrice(data.cost as Cost, data.star)}金` : '野怪';
    this.unitPanel.getChildByName('equipment')!.active=!data.summonOnly;
    if (this.detailStar !== data.star) {
      this.detailStar = data.star;
      setStarBadge(this.unitStars, data.star);
    }
    const number = (value: number) => String(Math.round(value));
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
      const portrait = UNIT_PORTRAIT[data.artId];
      loadArtSprite(portrait ?? UNIT_SPRITE[art], (err, frame) => {
        if (!err && this.unitPortrait?.isValid && this.detailArt === art) this.unitPortrait.spriteFrame = frame;
      });
    }
    const tint = new Color(255, 255, 255); if (data.tint) tint.fromHEX(data.tint); this.unitPortrait.color = tint;
    this.unitPanel.active = true;
    if (this.combatStatsPanel) this.combatStatsPanel.active = false;
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
    if (segments.shield > 0) this.hpMeter.value.string += ` +${Math.round(shield)}护盾`;
  }
  closeUnitDetail(): void {
    this.hideEquipmentDetail();
    this.unitPanel.active = false; this.closeDetailPopup(); this.detailKey = ''; this.currentDetail = null;
    this.syncInspectorDismiss();
    if (this.combatStatsPanel) this.combatStatsPanel.active = true;
  }
  get unitDetailVisible(): boolean { return this.unitPanel.active; }
  showWarn(msg: string): void { this.warnLabel.string = msg; this.warnTimer = 2; }
  update(dt: number): void {
    this.explorerInspector?.update(dt);this.syncInspectorDismiss();
    this.waveTransition?.update(dt);
    this.combatStatsPanel.active = !this.unitPanel.active && !this.equipmentDetail?.active;
    if (this.resultTimer > 0) {
      this.resultTimer = Math.max(0, this.resultTimer - Math.max(0, dt));
      if (this.resultTimer === 0) this.resultPanel.active = false;
    }
    const elapsed=Math.max(0,dt),previousIdle=this.waveIdle;
    this.waveIdle += elapsed;
    const showing=this.waveIdle<3,animationTime=showing?elapsed:previousIdle<3?this.waveIdle-3:elapsed;
    this.waveTrackProgress=Math.max(0,Math.min(1,this.waveTrackProgress+(showing?1:-1)*animationTime/.24));
    const p=this.waveTrackProgress,smooth=p*p*(3-2*p);
    this.waveTrack.setPosition(0,62*(1-smooth),0);this.waveTrackOpacity.opacity=Math.round(255*smooth);
    this.waveTrack.active=p>0;this.waveTrackViewport.active=p>0;
    if (this.warnTimer > 0) { this.warnTimer -= dt; if (this.warnTimer <= 0) this.warnLabel.string = ''; }
  }
}
