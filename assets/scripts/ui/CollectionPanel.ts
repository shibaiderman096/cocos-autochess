import { Node, UITransform, Label, Sprite, Color, Graphics, Mask, ScrollView, BlockInputEvents } from 'cc';
import { ConfigManager } from '../core/ConfigManager';
import { resolveTraits, TraitState } from '../battle/Traits';
import { UNIT_ART } from '../view/ArtPaths';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { unitRoleLabel } from './SkillPresentation';
import { buildUnitDetailData } from './UnitDetailPresentation';
import { EquipmentDisplayItem, equipmentNameColor } from './EquipmentPresentation';
import { equipmentStatIcons, equipmentQualityBadge, createEquipmentDescription, setEquipmentDescription } from './EquipmentStatIcons';
import { BattleUI, button, label, panel, paintPanel } from './BattleUI';
import { TraitPanel, TRAIT_BADGES } from './TraitPanel';

type Category = 'units' | 'traits' | 'equipment';
const GOLD = new Color(216, 187, 121), TEXT = new Color(234, 238, 226), MUTED = new Color(163, 189, 192);
const TEAL = new Color(101, 221, 203), INK = new Color(12, 29, 40);

/** A read-only collection using the same authored presentation as combat. */
export class CollectionPanel {
  readonly root: Node;
  private body: Node;
  private category: Category = 'units';
  private page = 0;
  private selected = 0;
  private star = 1;
  private traits: TraitState[];
  private traitPanel: TraitPanel;

  constructor(parent: Node, private cfg: ConfigManager) {
    this.root = panel(parent, 'collection', 0, 0, 1240, 680, INK, GOLD, null);
    this.root.addComponent(BlockInputEvents);
    label(this.root, '棋 境 图 鉴', -430, 299, 26, GOLD, 300);
    button(this.root, '返回主界面', 510, 296, 160, 44, () => this.hide()).name = 'closeCollection';
    this.body = new Node('collectionBody'); this.root.addChild(this.body);
    this.traitPanel = new TraitPanel(this.root); this.traitPanel.root.active = false;
    this.traits = resolveTraits(cfg.battle.traits ?? [], [], cfg.allUnits());
    this.root.active = false;
  }
  show(category: Category = 'units'): void {
    this.category = category; this.page = 0; this.selected = 0; this.star = 1;
    this.root.active = true;
    // Native Graphics discards its render data when this initially hidden panel is disabled.
    paintPanel(this.root.getComponent(Graphics)!, 1240, 680, INK, GOLD);
    this.root.setSiblingIndex(this.root.parent!.children.length - 1); this.render();
  }
  hide(): void { this.root.active = false; this.traitPanel.hideDetail(); }
  private entries(): Array<{ id: string; name: string }> {
    if (this.category === 'traits') return this.traits.map(t => t.config);
    if (this.category === 'equipment') return this.cfg.allEquipment();
    return this.cfg.allUnits().slice().sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1) || a.id.localeCompare(b.id));
  }
  private picture(parent: Node, path: string | undefined, x: number, y: number, size: number): void {
    if (!path) return;
    const node = new Node('collectionPortrait'); parent.addChild(node); node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(size, size);
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    loadArtSprite(path, (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
  }
  private render(): void {
    this.traitPanel.hideDetail();
    for (const child of [...this.body.children]) { child.active = false; child.destroy(); }
    const categories: Array<[Category, string]> = [['units', '棋子'], ['traits', '羁绊'], ['equipment', '装备']];
    categories.forEach(([key, name], i) => {
      button(this.body, `${name}图鉴`, -430 + i * 190, 232, 170, 46,
        () => { this.category = key; this.page = this.selected = 0; this.star = 1; this.render(); }, this.category === key).name = `collectionTab_${key}`;
    });
    const entries = this.entries(), pages = Math.max(1, Math.ceil(entries.length / 8));
    entries.slice(this.page * 8, this.page * 8 + 8).forEach((entry, i) => {
      const index = this.page * 8 + i, x = -440 + i % 2 * 264, y = 143 - Math.floor(i / 2) * 98;
      const selected = this.selected === index;
      const tile = panel(this.body, `collectionEntry_${entry.id}`, x, y, 248, 86,
        selected ? new Color(28, 61, 66) : INK, selected ? TEAL : new Color(64, 91, 101), null);
      let art: string | undefined, subtitle: string;
      if (this.category === 'units') {
        const unit = this.cfg.getUnit(entry.id); art = UNIT_ART[unit.artId ?? unit.id];
        subtitle = `${unit.cost ?? 1} 费 · ${unitRoleLabel(unit.role, unit.damageType)}`;
      } else if (this.category === 'equipment') {
        art = this.cfg.allEquipment().find(e => e.id === entry.id)!.icon; subtitle = '装备属性与效果';
      } else {
        art = TRAIT_BADGES.inactive; subtitle = this.traits[index].config.breakpoints.map(t => t.count).join(' / ') + ' 名';
      }
      this.picture(tile, art, -82, 0, 58);
      if (this.category === 'traits') label(tile, this.traits[index].config.glyph, -82, 0, 21, GOLD, 48).isBold = true;
      const nameColor = this.category === 'equipment'
        ? new Color(...equipmentNameColor(this.cfg.allEquipment().find(e => e.id === entry.id)!)) : selected ? GOLD : TEXT;
      label(tile, entry.name, 28, 16, 18, nameColor, 154);
      label(tile, subtitle, 28, -16, 12, MUTED, 154);
      tile.on(Node.EventType.TOUCH_END, () => { this.selected = index; this.star = 1; this.render(); });
    });
    button(this.body, '上一页', -470, -288, 128, 44, () => {
      if (this.page > 0) { this.page--; this.selected = this.page * 8; this.render(); }
    }).name = 'collectionPrevious';
    label(this.body, `${this.page + 1} / ${pages} · 共 ${entries.length} 项`, -306, -288, 15, MUTED, 190);
    button(this.body, '下一页', -142, -288, 128, 44, () => {
      if (this.page + 1 < pages) { this.page++; this.selected = this.page * 8; this.render(); }
    }).name = 'collectionNext';
    const entry = entries[this.selected]; if (!entry) return;
    if (this.category === 'traits') {
      this.traitPanel.inspectForCatalog(this.traits[this.selected], this.cfg.allUnits());
      label(this.body, '上下滑动查看完整羁绊与成员', 285, -270, 13, MUTED, 500); return;
    }
    if (this.category === 'units') {
      const host = new Node('collectionDetail'); this.body.addChild(host);
      const inspector = host.addComponent(BattleUI);
      const detail = inspector.initUnitInspector(); detail.setPosition(285, -20, 0);
      const base = this.cfg.getUnit(entry.id), unit = this.cfg.scaleUnit(base, this.star);
      inspector.showUnitDetail(buildUnitDetailData(this.cfg, unit, this.star));
      [1, 2, 3].forEach(star => {
        button(host, `${star} 星`, 285 + (star - 2) * 100, -288, 86, 36,
          () => { this.star = star; this.render(); }, this.star === star).name = `collectionStar_${star}`;
      });
      return;
    }
    const detail = panel(this.body, 'collectionDetail', 300, -20, 540, 446, INK, new Color(69, 107, 119), null);
    const item = this.cfg.allEquipment().find(e => e.id === entry.id)!;
    label(detail, entry.name, 0, 184, 27, new Color(...equipmentNameColor(item)), 490);
    equipmentQualityBadge(detail,item,0,155,90,13);
    this.picture(detail, item.icon, 0, 118, 62);
    const stats = equipmentStatIcons(detail, item, 480, 3, 26, 18, 36);
    stats.root.setPosition(0, 62, 0);
    const textTop = 62 - stats.height;
    this.scrollText(detail, item, textTop, textTop + 182);
    label(detail, '上下滑动查看完整信息', 0, -201, 13, MUTED, 450);
  }
  private scrollText(parent: Node, item: EquipmentDisplayItem, top = 102, height = 284): void {
    const viewport = new Node('collectionViewport'); parent.addChild(viewport); viewport.setPosition(0, top - height / 2, 0);
    viewport.addComponent(UITransform).setContentSize(492, height);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const content = new Node('collectionText'); viewport.addChild(content);
    const transform = content.addComponent(UITransform); transform.setAnchorPoint(.5, 1);
    transform.setContentSize(480, height); content.setPosition(0, height / 2, 0);
    const body = createEquipmentDescription(content, 480, 18, 28); body.node.setPosition(-240, 0, 0);
    setEquipmentDescription(body, item, () => transform.setContentSize(480,
      Math.max(height, body.node.getComponent(UITransform)!.contentSize.height)));
    const scroll = viewport.addComponent(ScrollView); scroll.content = content;
    scroll.horizontal = false; scroll.vertical = true; scroll.elastic = false;
  }
}
