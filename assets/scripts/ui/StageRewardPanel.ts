import { equipmentQualityBadge } from './EquipmentStatIcons';
import { Node, Sprite, UITransform, Color, Label, Graphics, Mask, ScrollView, sys } from 'cc';
import { panel, label, button } from './BattleUI';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import type { StagePending, StageChoice } from '../core/StageProgression';
import { stageShopRefreshPrice, stageShopQualityRates } from '../core/StageProgression';
import type { StageEncounterRules } from '../core/StageProgression';
import { UNIT_ART, UNIT_PORTRAIT, UI_SPRITE, ENCOUNTER_SPRITE as ENCOUNTER_ART } from '../view/ArtPaths';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { equipmentNameColor, EquipmentDisplayItem } from './EquipmentPresentation';
import { resolveTraits } from '../battle/Traits';
import type { OwnedUnit } from '../core/OwnedUnits';
import type { PendingTraitChoice } from '../core/TraitEmblem';
import { TRAIT_BADGES } from './TraitPanel';
import { ShopDockPopup } from './ShopDockPopup';
import { setUISkin } from './UISkin';
import { QUALITY_COLORS } from '../core/EquipmentQuality';
import { SHOP_REWARD_AREA } from './BattleUILayout';
import { MerchantServicesPanel, MerchantServicesPort } from './MerchantServicesPanel';

const GOLD = new Color(220, 187, 115), TEXT = new Color(231, 236, 223), MUTED = new Color(153, 178, 176);

/** Shop-dock presentation only: every mutation goes through the session's guarded action. */
export class StageRewardPanel {
  private root: Node | null = null;
  private dockPopup = new ShopDockPopup();
  private services?: MerchantServicesPanel;
  constructor(private parent: Node, private cfg: ConfigManager, private choose: (action: StageChoice) => void, private close?: () => void,
    private inspectEquipment?: (item: EquipmentDisplayItem | undefined) => void,
    private refreshRules?: StageEncounterRules['shop']['refresh'],private inspectIncome?:()=>void,private qualityRates:readonly number[]=[35,30,20,10,5], services?: MerchantServicesPort,
    private qualityGrowth?: StageEncounterRules['shop']['refreshQuality']) {
    if(services)this.services=new MerchantServicesPanel(cfg,services);
  }
  tryDropEquipment(index:number,event:any):boolean{return this.services?.tryDrop(index,event)??false;}
  get forging():boolean{return this.services?.forging??false;}
  update(dt:number):void{this.services?.update(dt);}
  hide(reset = true): void { this.dockPopup.clear(reset); if (reset) this.inspectEquipment?.(undefined); if (this.root) { this.root.active = false; this.root.destroy(); this.root = null; } }
  showTraitChoice(pending: PendingTraitChoice, units: OwnedUnit[], choose: (index: number) => void): void {
    this.hide(false);
    const a=SHOP_REWARD_AREA;
    const root = panel(this.parent, 'equipmentTraitChoice', a.x, a.y, a.width, a.height, new Color(13, 27, 35), GOLD, null);
    this.root = root;
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) root.on(type, (e: any) => { e.propagationStopped = true; });
    label(root, '万象共鸣 · 选择羁绊', -218, 55, 17, GOLD, 330);
    label(root, '四选一 · 选定后绑定装备，转移仍保留', 158, 55, 12, MUTED, 430);
    const states = resolveTraits(this.cfg.battle.traits ?? [], units.filter(u => u.location === 'board').map(u => ({ id: u.unitId,
      grantedTraitIds: this.cfg.getEquipment(u.equipment).flatMap(item => item.grantedTraitId ? [item.grantedTraitId] : []) })), this.cfg.allUnits());
    pending.candidates.forEach((id, i) => {
      const state = states.find(trait => trait.config.id === id)!;
      const card = panel(root, `traitChoiceCard_${i}`, (i - 1.5) * 195, -14, 186, 104);
      const art = new Node('traitBadge'); card.addChild(art); art.setPosition(-62, 24, 0);
      art.addComponent(UITransform).setContentSize(36, 36); const sprite = art.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadArtSprite(TRAIT_BADGES[state.active?.tier ?? 'inactive'], (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
      label(card, state.config.glyph, -62, 25, 16, GOLD, 28);
      label(card, state.config.name, 19, 27, 16, GOLD, 123);
      label(card, `${state.active ? '已激活' : '未激活'} · ${state.count} 位上阵`, 12, 1, 12, TEXT, 156);
      const control = button(card, '赋予羁绊', 0, -33, 172, 34, () => { if (this.root === root) choose(i); }, true);
      control.name = `equipmentTrait_${i}`;
    });
    this.dockPopup.play(root, `trait:${pending.uid}:${pending.slot}:${pending.candidates.join(',')}`);
  }
  show(pending: StagePending | undefined, gold: number): void {
    this.hide(!pending); if (!pending) return;
    const merchant = pending.kind === 'specialShop';
    const compact = true;
    const a=SHOP_REWARD_AREA;
    const host=!compact&&this.parent.name==='shopRewardDock'?this.parent.parent!:this.parent;
    const overlay = panel(host, 'stageReward', compact ? a.x + (merchant && sys.isMobile ? 48 : 0) : 0, compact ? a.y : 0, compact ? a.width : 1280, compact ? a.height : 720, merchant ? new Color(0, 0, 0, 0) : new Color(13, 27, 35), merchant ? new Color(0, 0, 0, 0) : GOLD, null);
    this.root = overlay;
    if(merchant){const bounds=overlay.getComponent(UITransform)!;bounds.setContentSize(a.width+96,a.height);bounds.setAnchorPoint((a.width/2+96)/(a.width+96),.5);}
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) overlay.on(type, (e: any) => { e.propagationStopped = true; });
    const body = panel(overlay, 'stageRewardBody', 0, 0, compact ? a.width : 1150, compact ? a.height : 600, new Color(13, 27, 35), GOLD, null);
    if (merchant) setUISkin(body, 'panel_dock', body.getComponent(Graphics)!);
    if (merchant && this.services?.mount(body,pending.id)) {
      this.dockPopup.play(overlay,`${pending.kind}:${pending.id}`); return;
    }
    if (!compact && this.close) button(body, '×', 530, 263, 34, 30, () => this.close!());

    const act = (choice: StageChoice['choice'], index?: number) => { if (this.root === overlay) this.choose({ type: 'stageChoice', rewardId: pending.id, choice, index }); };
    const art = (parent: Node, path: string, x: number, y: number, size: number) => {
      const node = new Node('rewardArt'); parent.addChild(node); node.setPosition(x, y, 0);
      node.addComponent(UITransform).setContentSize(size, size); const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadArtSprite(path, (error, frame) => { if (!error && sprite.isValid && this.root === overlay) sprite.spriteFrame = frame; });
      return sprite;
    };
    const heading = pending.kind === 'specialShop' ? '秘境行商' : pending.source==='elite'?'精英宝箱':pending.source==='monster'?'野怪宝箱':'首领宝箱';

    if (!compact) art(body, ENCOUNTER_ART.monster, -450, 214, 125);
    if (merchant) {
      art(body, ENCOUNTER_ART.specialShop, -364, 66, 16);
      const title = label(body, heading, -277, sys.isMobile ? 69 : 66, sys.isMobile ? 17 : 12, GOLD, 140); title.isBold = true;
      const odds=new Node('merchantQualityRates');body.addChild(odds);odds.setPosition(-270,45,0);odds.addComponent(UITransform).setContentSize(240,18);
      const rates=stageShopQualityRates(pending.refreshes??0,{qualityRates:[...this.qualityRates],refreshQuality:this.qualityGrowth});
      rates.forEach((rate,index)=>{const text=label(odds,`${Math.round(rate)}%`,(index-2)*48,0,sys.isMobile ? 15 : 12,new Color(...QUALITY_COLORS[index]),48);text.node.name=`quality${index+1}`;text.node.getComponent(UITransform)!.setContentSize(48,22);text.enableWrapText=false;text.overflow=Label.Overflow.SHRINK;});
      const refreshPrice=stageShopRefreshPrice(pending.refreshes,this.refreshRules);
      const refresh=button(body,`刷新 ${refreshPrice} 金币`,302,sys.isMobile ? 59 : 54,148,sys.isMobile ? 42 : 30,()=>{if(gold>=refreshPrice)act('refresh');},true);
      refresh.name='stageShopRefresh';refresh.getChildByName('text')!.getComponent(Label)!.fontSize=sys.isMobile ? 18 : 13;
      if(gold<refreshPrice)setUISkin(refresh,'btn_disabled');
      const purse = panel(body, 'merchantPurse', 0, sys.isMobile ? 59 : 54, sys.isMobile ? 150 : 132, sys.isMobile ? 38 : 26, new Color(16, 31, 40), MUTED, 'panel_side');
      art(purse, UI_SPRITE.iconGold, -43, 0, 18);
      const balance = label(purse, `${gold} 金币`, 12, 0, sys.isMobile ? 19 : 14, GOLD, sys.isMobile ? 105 : 88); balance.isBold = true;
      purse.on(Node.EventType.TOUCH_END,(event:any)=>{if(event)event.propagationStopped=true;this.inspectIncome?.();});
    } else label(body, heading, compact ? -220 : 0, compact ? 55 : 235, compact ? 17 : 32, GOLD, compact ? 330 : 720);
    const subtitle = pending.kind === 'specialShop' ? `持有 ${gold} 金币 · 商品各限购一次，选购后点击下一关` : `总价值 ${pending.value} 金币 · 棋子/装备/生命混合发放`;
    if (!merchant) label(body, subtitle, compact ? 160 : 0, compact ? 55 : 193, compact ? 12 : 17, MUTED, compact ? 430 : 800);
    if (pending.kind==='mixedChest') {
      button(body, '打开宝箱', 0, -14, 270, 72, () => act('claim'), true);
    } else {
      const offers = pending.offers;
      offers.forEach((offer, i) => {
        const item = offer.kind === 'unit' ? this.cfg.getUnit(offer.id) : this.cfg.getEquipmentReserve([offer.id])[0];
        const icon = offer.kind === 'unit' ? UNIT_ART[(item as any).artId ?? offer.id] ?? UNIT_ART[offer.id] : (item as any).icon;
        if (merchant) {
          const card = panel(body, 'stageOffer', (i - (offers.length - 1) / 2) * 154, -14, 148, 102);
          const equipment = offer.kind === 'equipment' ? item as EquipmentDisplayItem : undefined;
          const unit = offer.kind === 'unit' ? item as UnitConfigData : undefined;
          const tint = offer.bought ? MUTED : equipment ? new Color(...equipmentNameColor(equipment)) : GOLD;
          const portrait = unit ? UNIT_PORTRAIT[unit.artId ?? unit.id] ?? icon : icon;
          const sprite = art(card, portrait, -46, 21, 38);
          if (offer.bought) sprite.color = new Color(140, 153, 151, 160);
          const name = label(card, item.name, 22, 22, sys.isMobile ? 17 : 13, tint, 94); name.isBold = true;
          name.enableWrapText = false; name.overflow = Label.Overflow.SHRINK;
          name.node.getComponent(UITransform)!.setContentSize(94, 24);
          const category = unit ? `${unit.cost}费 · ${unit.specialShopUnlock ? '解锁牌库 +1' : '1星棋子'}`
            : `${equipment!.consumable?'一次性道具':equipment!.specialShopOnly || equipment!.traitChoice ? '行商珍藏' : offer.id.startsWith('basic_') ? '基础装备' : '成装'} · 点击查看`;
          if(equipment){equipmentQualityBadge(card,equipment,-44,-3,48,10);label(card,equipment.consumable?'一次性道具':'装备',27,-3,11,MUTED,76);}
          else label(card, category, 0, -3, 11, MUTED, 138);
          if (equipment) card.on(Node.EventType.TOUCH_END, (event: any) => {
            for (let target = event?.target; target && target !== card; target = target.parent)
              if (target.name === `stageChoice_${i}`) return;
            if (event) event.propagationStopped = true;
            if (this.root === overlay) this.inspectEquipment?.(equipment);
          });
          const enabled = !offer.bought && gold >= offer.price;
          const caption = offer.bought ? '已售罄' : enabled ? `${offer.price} 金币 · 购买` : `${offer.price} 金币 · 差${offer.price - gold}金`;
          const control = button(card, caption, 0, -31, 132, sys.isMobile ? 40 : 32, () => { if (enabled) act('buy', i); }, true);
          control.name = `stageChoice_${i}`;
          if (!enabled) setUISkin(control, 'btn_disabled');
          const text = control.getChildByName('text')!.getComponent(Label)!;
          text.fontSize = sys.isMobile ? 17 : 13; text.color = enabled ? TEXT : MUTED;
          text.enableWrapText=false;text.overflow=Label.Overflow.SHRINK;
          return;
        }
      });

    }
    if (compact) this.dockPopup.play(overlay, `${pending.kind}:${pending.id}`);
  }
}
