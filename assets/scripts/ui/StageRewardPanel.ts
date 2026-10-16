import { Node, Sprite, SpriteFrame, UITransform, Color, Label } from 'cc';
import { panel, label, button } from './BattleUI';
import { ConfigManager } from '../core/ConfigManager';
import type { StagePending, StageChoice } from '../core/StageProgression';
import { UNIT_ART, ENCOUNTER_SPRITE as ENCOUNTER_ART } from '../view/ArtPaths';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { equipmentStatRows, equipmentEffectText, EquipmentDisplayItem } from './EquipmentPresentation';

const GOLD = new Color(220, 187, 115), TEXT = new Color(231, 236, 223), MUTED = new Color(153, 178, 176);

/** Modal presentation only: every mutation goes through the session's guarded action. */
export class StageRewardPanel {
  private root: Node | null = null;
  constructor(private parent: Node, private cfg: ConfigManager, private choose: (action: StageChoice) => void) {}
  hide(): void { if (this.root) { this.root.active = false; this.root.destroy(); this.root = null; } }
  show(pending: StagePending | undefined, gold: number): void {
    this.hide(); if (!pending) return;
    const overlay = panel(this.parent, 'stageReward', 0, 0, 1280, 720, new Color(5, 14, 23, 235), GOLD, null);
    this.root = overlay;
    for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) overlay.on(type, (e: any) => { e.propagationStopped = true; });
    const body = panel(overlay, 'stageRewardBody', 0, 0, 1150, 600);
    const act = (choice: StageChoice['choice'], index?: number) => { if (this.root === overlay) this.choose({ type: 'stageChoice', rewardId: pending.id, choice, index }); };
    const art = (parent: Node, path: string, x: number, y: number, size: number) => {
      const node = new Node('rewardArt'); parent.addChild(node); node.setPosition(x, y, 0);
      node.addComponent(UITransform).setContentSize(size, size); const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      loadArtSprite(path, (error, frame) => { if (!error && sprite.isValid && this.root === overlay) sprite.spriteFrame = frame; });
    };
    const showDetail = (item: EquipmentDisplayItem) => {
      if (this.root !== overlay) return;
      const detail = panel(overlay, 'stageEquipmentDetail', 0, 0, 1280, 720, new Color(5, 14, 23, 245), GOLD, null);
      for (const type of [Node.EventType.TOUCH_START, Node.EventType.TOUCH_END]) detail.on(type, (e: any) => { e.propagationStopped = true; });
      const card = panel(detail, 'equipmentDetailCard', 0, 0, 760, 550);
      art(card, item.icon, -278, 187, 96);
      label(card, item.name, 40, 193, 29, GOLD, 540);
      equipmentStatRows(item).forEach((stat, i) => {
        const row = panel(card, 'equipmentStat', (i % 2 - .5) * 344, 99 - Math.floor(i / 2) * 34, 330, 29, new Color(8, 13, 21), new Color(8, 13, 21), null);
        label(row, stat.name, -58, 0, 16, MUTED, 195);
        const value = label(row, stat.value, 112, 0, 17, TEXT, 90); value.horizontalAlign = Label.HorizontalAlign.RIGHT;
      });
      const effect = label(card, equipmentEffectText(item), 0, -87, 18, TEXT, 680);
      effect.node.getComponent(UITransform)!.setContentSize(680, 180); effect.enableWrapText = true;
      effect.verticalAlign = Label.VerticalAlign.TOP; effect.horizontalAlign = Label.HorizontalAlign.LEFT;
      button(card, '返回选择', 0, -224, 230, 40, () => { detail.active = false; detail.destroy(); }, true);
    };
    const heading = pending.kind === 'specialShop' ? '旅行商人的珍藏' : pending.kind === 'bossChoice' ? '首领宝藏' : pending.kind === 'unitBundle' ? '棋子补给' : '选择一件普通装备';
    art(body, ENCOUNTER_ART[pending.kind === 'specialShop' ? 'specialShop' : pending.kind === 'unitBundle' ? 'monster' : 'boss'], -450, 214, 125);
    label(body, heading, 0, 235, 32, GOLD, 720);
    const subtitle = pending.kind === 'specialShop' ? `持有 ${gold} 金币 · 商品各限购一次，可直接离开`
      : pending.kind === 'bossChoice' ? '选择棋子补给或装备奖励'
      : pending.kind === 'unitBundle' ? `总价值 ${pending.value} 金币 · 按一星购买价计算` : '四件随机普通装备，选择一件放入背包';
    label(body, subtitle, 0, 193, 17, MUTED, 800);
    if (pending.kind === 'bossChoice') {
      const options = [{ name: '棋子补给', text: `随机棋子，总价值 ${pending.value} 金币`, icon: UNIT_ART.warrior, choice: 'units' as const },
        { name: '装备宝匣', text: '普通装备随机四选一', icon: this.cfg.allEquipment()[0]?.icon ?? ENCOUNTER_ART.boss, choice: 'equipment' as const }];
      options.forEach((option, i) => {
        const card = panel(body, 'bossChoice', (i - .5) * 410, -45, 370, 330);
        art(card, option.icon, 0, 65, 140); label(card, option.name, 0, -25, 25, GOLD, 330);
        label(card, option.text, 0, -72, 17, TEXT, 340);
        button(card, '选择', 0, -123, 220, 40, () => act(option.choice), true);
      });
    } else if (pending.kind === 'unitBundle') {
      const groups = [...new Set(pending.units)].map(id => ({ id, count: pending.units.filter(value => value === id).length }));
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
        const card = panel(body, 'stageOffer', (i - (offers.length - 1) / 2) * 213, -30, 197, 345);
        const item = offer.kind === 'unit' ? this.cfg.getUnit(offer.id) : this.cfg.getEquipmentReserve([offer.id])[0];
        const icon = offer.kind === 'unit' ? UNIT_ART[(item as any).artId ?? offer.id] ?? UNIT_ART[offer.id] : (item as any).icon;
        art(card, icon, 0, 94, 112); label(card, item.name, 0, 18, 19, GOLD, 180);
        const text = offer.kind === 'unit' ? `${(item as any).cost}费 · 1星棋子` : equipmentStatRows(item as EquipmentDisplayItem).map(stat => `${stat.name} ${stat.value}`).join('\n');
        const detail = label(card, text, 0, -43, 13, TEXT, 173); detail.overflow = Label.Overflow.SHRINK; detail.lineHeight = 17;
        detail.node.getComponent(UITransform)!.setContentSize(173, 90); detail.enableWrapText = true; detail.verticalAlign = Label.VerticalAlign.TOP;
        if (offer.kind === 'equipment') {
          const more = button(card, '查看效果', 0, -96, 140, 26, () => showDetail(item as EquipmentDisplayItem), true);
          more.name = `stageDetails_${i}`;
        }
        const caption = offer.bought ? '已购买' : pending.kind === 'specialShop' ? `${offer.price} 金币 · 购买` : '选择';
        const control = button(card, caption, 0, -134, 172, 36, () => { if (!offer.bought) act(pending.kind === 'specialShop' ? 'buy' : 'claim', i); }, !offer.bought);
        control.name = `stageChoice_${i}`;
        if (offer.bought || (pending.kind === 'specialShop' && gold < offer.price)) control.getChildByName('text')!.getComponent(Label)!.color = MUTED;
      });
      if (pending.kind === 'specialShop') button(body, '离开商店', 0, -254, 250, 40, () => act('continue'), true);
    }
  }
}
