import { equipmentStatIcons } from './EquipmentStatIcons';
import { Node, Sprite, UITransform, Color, Label, Graphics } from 'cc';
import { panel, label, button } from './BattleUI';
import { ConfigManager, UnitConfigData } from '../core/ConfigManager';
import type { StagePending, StageChoice } from '../core/StageProgression';
import { UNIT_ART, UNIT_PORTRAIT, UI_SPRITE, ENCOUNTER_SPRITE as ENCOUNTER_ART } from '../view/ArtPaths';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { equipmentDescriptionText, equipmentNameColor, EquipmentDisplayItem } from './EquipmentPresentation';
import { resolveTraits } from '../battle/Traits';
import type { OwnedUnit } from '../core/OwnedUnits';
import type { PendingTraitChoice } from '../core/TraitEmblem';
import { TRAIT_BADGES } from './TraitPanel';
import { ShopDockPopup } from './ShopDockPopup';
import { setUISkin } from './UISkin';

const GOLD = new Color(220, 187, 115), TEXT = new Color(231, 236, 223), MUTED = new Color(153, 178, 176);

/** Shop-dock presentation only: every mutation goes through the session's guarded action. */
export class StageRewardPanel {
  private root: Node | null = null;
  private dockPopup = new ShopDockPopup();
  constructor(private parent: Node, private cfg: ConfigManager, private choose: (action: StageChoice) => void, private close?: () => void,
    private inspectEquipment?: (item: EquipmentDisplayItem | undefined) => void) {}
  hide(reset = true): void { this.dockPopup.clear(reset); if (reset) this.inspectEquipment?.(undefined); if (this.root) { this.root.active = false; this.root.destroy(); this.root = null; } }
  showTraitChoice(pending: PendingTraitChoice, units: OwnedUnit[], choose: (index: number) => void): void {
    this.hide(false);
    const root = panel(this.parent, 'equipmentTraitChoice', -20, -281, 788, 150, new Color(13, 27, 35), GOLD, null);
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
    const compact = pending.kind !== 'unitBundle';
    const overlay = panel(this.parent, 'stageReward', compact ? -20 : 0, compact ? -281 : 0, compact ? 788 : 1280, compact ? 150 : 720, merchant ? new Color(0, 0, 0, 0) : new Color(13, 27, 35), merchant ? new Color(0, 0, 0, 0) : GOLD, null);
    this.root = overlay;
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) overlay.on(type, (e: any) => { e.propagationStopped = true; });
    const body = panel(overlay, 'stageRewardBody', 0, 0, compact ? 788 : 1150, compact ? 150 : 600, new Color(13, 27, 35), GOLD, null);
    if (merchant) setUISkin(body, 'panel_dock', body.getComponent(Graphics)!);
    if (!compact && this.close) button(body, '×', 530, 263, 34, 30, () => this.close!());

    const act = (choice: StageChoice['choice'], index?: number) => { if (this.root === overlay) this.choose({ type: 'stageChoice', rewardId: pending.id, choice, index }); };
    const art = (parent: Node, path: string, x: number, y: number, size: number) => {
      const node = new Node('rewardArt'); parent.addChild(node); node.setPosition(x, y, 0);
      node.addComponent(UITransform).setContentSize(size, size); const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadArtSprite(path, (error, frame) => { if (!error && sprite.isValid && this.root === overlay) sprite.spriteFrame = frame; });
      return sprite;
    };
    const showDetail = (item: EquipmentDisplayItem) => {
      if (this.root !== overlay) return;
      const previous = overlay.getChildByName('stageEquipmentDetail');
      if (previous) { previous.active = false; previous.destroy(); }
      const detail = panel(overlay, 'stageEquipmentDetail', 0, 353, 788, 550, new Color(5, 14, 23, 245), GOLD, null);
      for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) detail.on(type, (e: any) => { e.propagationStopped = true; });
      const card = panel(detail, 'equipmentDetailCard', 0, 0, 760, 550, new Color(13, 27, 35), GOLD);
      art(card, item.icon, -278, 187, 96);
      label(card, item.name, 40, 193, 29, new Color(...equipmentNameColor(item)), 540);
      const stats = equipmentStatIcons(card, item, 680, 3, 28, 20, 42);
      stats.root.setPosition(0, 99, 0);
      const effect = label(card, equipmentDescriptionText(item), 0, -87, 18, TEXT, 680);
      effect.node.getComponent(UITransform)!.setContentSize(680, 180); effect.enableWrapText = true;
      effect.verticalAlign = Label.VerticalAlign.TOP; effect.horizontalAlign = Label.HorizontalAlign.LEFT;
      button(card, '返回选择', 0, -224, 230, 40, () => { detail.active = false; detail.destroy(); }, true);
    };
    const heading = pending.kind === 'specialShop' ? '秘境行商' : pending.kind === 'bossChoice' ? '首领宝藏' : pending.kind === 'unitBundle' ? '棋子补给' : '选择一件普通装备';

    if (!compact) art(body, ENCOUNTER_ART.monster, -450, 214, 125);
    if (merchant) {
      art(body, ENCOUNTER_ART.specialShop, -364, 54, 26);
      const title = label(body, heading, -277, 54, 18, GOLD, 140); title.isBold = true;
      label(body, '每件限购1次 · 选购后前往下一关', 18, 54, 12, MUTED, 350);
      const purse = panel(body, 'merchantPurse', 310, 54, 132, 26, new Color(16, 31, 40), MUTED, 'panel_side');
      art(purse, UI_SPRITE.iconGold, -43, 0, 18);
      const balance = label(purse, `${gold} 金币`, 12, 0, 14, GOLD, 88); balance.isBold = true;
    } else label(body, heading, compact ? -220 : 0, compact ? 55 : 235, compact ? 17 : 32, GOLD, compact ? 330 : 720);
    const subtitle = pending.kind === 'specialShop' ? `持有 ${gold} 金币 · 商品各限购一次，选购后点击下一关`
      : pending.kind === 'bossChoice' ? `棋子/装备价值${pending.value}金币 · 生命+5`
      : pending.kind === 'unitBundle' ? `总价值 ${pending.value} 金币 · 按一星购买价计算` : '随机装备五选一，放入背包';
    if (!merchant) label(body, subtitle, compact ? 160 : 0, compact ? 55 : 193, compact ? 12 : 17, MUTED, compact ? 430 : 800);
    if (pending.kind === 'bossChoice') {
      button(body, '打开宝箱', 0, -14, 270, 72, () => act('claim'), true);
    } else if (pending.kind === 'unitBundle') {
      const groups = Array.from(new Set(pending.units)).map(id => ({ id, count: pending.units.filter(value => value === id).length }));
      groups.forEach((group, i) => {
        const x = (i % 4 - 1.5) * 250, y = 74 - Math.floor(i / 4) * 100, unit = this.cfg.getUnit(group.id);
        art(body, UNIT_ART[unit.artId ?? unit.id] ?? UNIT_ART[unit.id], x - 65, y, 72);
        label(body, `${unit.name} ×${group.count}`, x + 33, y + 12, 17, TEXT, 176);
        label(body, `${unit.cost} 金币 · 1星`, x + 33, y - 19, 14, GOLD, 170);
      });
      label(body, pending.deferredValue ? `卡池暂缺 ${pending.deferredValue} 金币价值，补货后自动发放` : '备战席满时存入奖励仓库，出现空位后自动补入', 0, -198, 15, MUTED, 850);
      button(body, '领取补给', 0, -249, 250, 44, () => act('claim'), true);
    } else {
      const offers = pending.kind === 'specialShop' ? pending.offers : pending.candidates.map(id => ({ kind: 'equipment' as const, id, price: 0, bought: false }));
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
          const name = label(card, item.name, 22, 22, 13, tint, 94); name.isBold = true;
          name.enableWrapText = false; name.overflow = Label.Overflow.SHRINK;
          name.node.getComponent(UITransform)!.setContentSize(94, 24);
          const category = unit ? `${unit.cost}费 · ${unit.specialShopUnlock ? '解锁牌库 +1' : '1星棋子'}`
            : `${equipment!.specialShopOnly || equipment!.traitChoice ? '行商珍藏' : offer.id.startsWith('basic_') ? '基础装备' : '成装'} · 点击查看`;
          label(card, category, 0, -3, 11, MUTED, 138);
          if (equipment) card.on(Node.EventType.TOUCH_END, (event: any) => {
            for (let target = event?.target; target && target !== card; target = target.parent)
              if (target.name === `stageChoice_${i}`) return;
            if (event) event.propagationStopped = true;
            if (this.root === overlay) this.inspectEquipment?.(equipment);
          });
          const enabled = !offer.bought && gold >= offer.price;
          const caption = offer.bought ? '已售罄' : enabled ? `${offer.price} 金币 · 购买` : `${offer.price} 金币 · 差${offer.price - gold}金`;
          const control = button(card, caption, 0, -31, 132, 32, () => { if (enabled) act('buy', i); }, true);
          control.name = `stageChoice_${i}`;
          if (!enabled) setUISkin(control, 'btn_disabled');
          const text = control.getChildByName('text')!.getComponent(Label)!;
          text.fontSize = 13; text.color = enabled ? TEXT : MUTED;
          return;
        }
        const card = panel(body, 'stageOffer', (i - (offers.length - 1) / 2) * 158, -14, 150, 104);
        art(card, icon, -50, 28, 34); label(card, item.name, 19, 28, 14, offer.kind === 'equipment' ? new Color(...equipmentNameColor(item as EquipmentDisplayItem)) : GOLD, 104);
        if (offer.kind === 'unit') {
          label(card, (item as any).specialShopUnlock ? '解锁牌库 · 获得1张' : `${(item as any).cost}费 · 1星棋子`, 0, -1, 12, TEXT, 138);
        } else {
          const stats = equipmentStatIcons(card, item as EquipmentDisplayItem, 138, 3, 14, 11, 18);
          stats.root.setPosition(0, 3, 0);
        }
        if (offer.kind === 'equipment') {
          const more = button(card, '详情', -43, -33, 58, 34, () => showDetail(item as EquipmentDisplayItem), true);
          more.getChildByName('text')!.getComponent(Label)!.fontSize = 14;
          more.name = `stageDetails_${i}`;
        }
        const caption = offer.bought ? '已购买' : '选择';
        const purchaseX = offer.kind === 'equipment' ? 29 : 0;
        const purchaseWidth = offer.kind === 'equipment' ? 82 : 138;
        const control = button(card, caption, purchaseX, -33, purchaseWidth, 34,
          () => { if (!offer.bought) act('claim', i); }, !offer.bought);
        control.getChildByName('text')!.getComponent(Label)!.fontSize = 15;
        control.name = `stageChoice_${i}`;
        if (offer.bought) control.getChildByName('text')!.getComponent(Label)!.color = MUTED;
      });

    }
    if (compact) this.dockPopup.play(overlay, `${pending.kind}:${pending.id}`);
  }
}
