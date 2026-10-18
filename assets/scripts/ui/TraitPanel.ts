import { Node, Sprite, Label, UITransform, Color } from 'cc';
import type { UnitConfigData } from '../core/ConfigManager';
import type { TraitState } from '../battle/Traits';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { UNIT_ART, UNIT_PORTRAIT, M2_UI_SPRITE } from '../view/ArtPaths';
import { panel, label, button } from './BattleUI';

const TEXT = new Color(234, 231, 215), MUTED = new Color(138, 153, 164);
const PHYSICAL = new Color(255, 151, 64), SPELL = new Color(80, 180, 255), HEALING = new Color(123, 245, 154);
const COLORS = {
  bronze: new Color(219, 158, 105), silver: new Color(207, 221, 237),
  gold: new Color(255, 206, 80), prismatic: new Color(198, 172, 255), inactive: MUTED,
};
export const TRAIT_BADGES = Object.fromEntries(Object.entries({
  bronze: '40,148,406,404', silver: '460,147,405,405', gold: '874,147,407,406',
  prismatic: '1293,141,425,414', inactive: '1731,148,405,403',
}).map(([tier, rect]) => [tier, `art/ui/trait_badges/spriteFrame#rect,${rect}`]));

function art(parent: Node, path: string, x: number, y: number, size: number): Sprite {
  const node = new Node('traitArt'); node.addComponent(UITransform).setContentSize(size, size);
  parent.addChild(node); node.setPosition(x, y, 0);
  const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
  loadArtSprite(path, (error, frame) => { if (!error && sprite.isValid) sprite.spriteFrame = frame; });
  return sprite;
}
function badge(parent: Node, state: TraitState, x: number, y: number, size: number): void {
  const tier = state.active?.tier ?? 'inactive';
  art(parent, TRAIT_BADGES[tier], x, y, size);
  const glyph = label(parent, state.config.glyph, x, y + size * .055, size * .4, COLORS[tier], size * .6);
  glyph.isBold = true;
}
function left(parent: Node, text: string, x: number, y: number, size: number, width: number, color = TEXT): Label {
  const item = label(parent, text, x, y, size, color, width);
  item.horizontalAlign = Label.HorizontalAlign.LEFT;
  item.node.getComponent(UITransform)!.setAnchorPoint(0, .5);
  return item;
}

function statBonus(parent: Node, key: keyof typeof M2_UI_SPRITE, value: string, x: number, color: Color, active: boolean, y = 0): void {
  const tone = new Color(color.r, color.g, color.b, active ? 255 : 165);
  art(parent, M2_UI_SPRITE[key], x, y, 20).color = tone;
  left(parent, value, x + 15, y, 16, 70, tone).isBold = true;
}

/** A compact TFT-style list and a persistent click/touch detail card. */
export class TraitPanel {
  readonly root: Node;
  private rows: Node;
  private detail: Node | null = null;
  private selected: string | null = null;
  private states: TraitState[] = [];
  private roster: UnitConfigData[] = [];
  private key = '';

  constructor(private parent: Node) {
    this.root = panel(parent, 'traits', -510, 45, 192, 390);
    this.rows = new Node('traitRows'); this.root.addChild(this.rows);
  }

  refresh(states: TraitState[], roster: UnitConfigData[]): void {
    this.states = states.filter(state => state.count > 0); this.roster = roster;
    const key = JSON.stringify(this.states.map(state => [state.config, state.memberIds]));
    if (key === this.key) return;
    this.key = key;
    this.closeCard();
    for (const node of [...this.rows.children]) { node.active = false; node.destroy(); }
    const compact = this.states.length > 4;
    this.states.forEach((state, i) => {
      const row = panel(this.rows, `trait_${state.config.id}`, 0, compact ? 136 - i * 49 : 109 - i * 74, 178, compact ? 44 : 66,
        new Color(19, 30, 42), state.active ? COLORS[state.active.tier] : new Color(63, 75, 85), null);
      badge(row, state, compact ? -61 : -58, compact ? 3 : 0, compact ? 34 : 50);
      left(row, state.config.name, compact ? -35 : -23, compact ? 7 : 8, compact ? 14 : 16, 110, state.active ? TEXT : MUTED).isBold = true;
      state.config.breakpoints.forEach((tier, index) => {
        const item = label(row, String(tier.count), (compact ? -22 : -10) + index * (compact ? 25 : 28), compact ? -13 : -17, compact ? 10 : 11,
          state.active?.count === tier.count ? COLORS[tier.tier] : MUTED, 24);
        item.isBold = state.active?.count === tier.count;
      });
      row.on(Node.EventType.TOUCH_END, () => {
        if (this.selected === state.config.id && this.detail?.active) this.hideDetail();
        else this.showDetail(state.config.id);
      });
      row.on(Node.EventType.MOUSE_ENTER, () => { if (!this.selected) this.renderDetail(state); });
      row.on(Node.EventType.MOUSE_LEAVE, () => { if (!this.selected) this.closeCard(); });
    });
    if (this.selected) this.showDetail(this.selected);
  }

  setVisible(visible: boolean): void { this.root.active = visible; if (!visible) this.hideDetail(); }
  hideDetail(): void { this.selected = null; this.closeCard(); }
  private closeCard(): void { if (this.detail) { this.detail.active = false; this.detail.destroy(); this.detail = null; } }
  private showDetail(id: string): void {
    const state = this.states.find(item => item.config.id === id);
    if (!state) { this.hideDetail(); return; }
    this.selected = id; this.renderDetail(state);
  }
  private renderDetail(state: TraitState): void {
    this.closeCard();
    const formation = state.config.breakpoints.some(tier => !!tier.formation);
    const headerY = formation ? 232 : 177;
    const card = panel(this.parent, 'traitDetail', -206, formation ? 10 : 40, 390, formation ? 540 : 430,
      new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    badge(card, state, -151, headerY, 56);
    left(card, state.config.name, -110, headerY + 13, 23, 240).isBold = true;
    left(card, `${state.count}名上场 · ${state.active ? {bronze:'黄铜',silver:'白银',gold:'黄金',prismatic:'棱彩'}[state.active.tier] : '未激活'}`, -110, headerY - 19, 14, 230, COLORS[state.active?.tier ?? 'inactive']);
    button(card, '×', 167, headerY + 21, 26, 26, () => this.hideDetail());
    const body = left(card, state.config.description, -172, formation ? 163 : 115, 16, 344);
    body.enableWrapText = true; body.overflow = Label.Overflow.CLAMP;
    body.node.getComponent(UITransform)!.setContentSize(344, formation ? 76 : 58);
    state.config.breakpoints.forEach((tier, index) => {
      const active = state.active?.count === tier.count;
      const row = panel(card, 'traitBreakpoint', 0, formation ? 80 - index * 72 : 48 - index * 36, 350, formation ? 64 : 32,
        active ? new Color(39, 43, 57) : new Color(15, 23, 34), active ? COLORS[tier.tier] : new Color(30, 42, 52), null);
      left(row, `(${tier.count})`, -163, 0, 16, 42, active ? COLORS[tier.tier] : MUTED);
      if (tier.formation) {
        const bonus = tier.formation;
        const percent = (value: number) => `+${Number((value * 100).toFixed(2))}%`;
        left(row, '前排', -116, 14, 13, 44, MUTED);
        left(row, '后排', -116, -14, 13, 44, MUTED);
        statBonus(row, 'stat_hp', percent(bonus.maxHpBonus), -57, HEALING, active, 14);
        statBonus(row, 'attr_dmg_reduce', percent(bonus.damageReduction), 58, SPELL, active, 14);
        statBonus(row, 'attr_aspd', percent(bonus.attackSpeedBonus), -57, HEALING, active, -14);
        statBonus(row, 'attr_dmg_amp', percent(bonus.damageAmp), 58, PHYSICAL, active, -14);
      } else if (tier.stats) {
        const stats = tier.stats;
        const percent = (value: number) => `+${Number((value * 100).toFixed(2))}%`;
        const entries: Array<{key: keyof typeof M2_UI_SPRITE; value: string; color: Color}> = [];
        if (stats.armor !== undefined) entries.push({key:'attr_armor',value:`+${stats.armor}`,color:SPELL});
        if (stats.mr !== undefined) entries.push({key:'attr_mr',value:`+${stats.mr}`,color:SPELL});
        if (stats.maxHpBonus !== undefined) entries.push({key:'stat_hp',value:percent(stats.maxHpBonus),color:HEALING});
        if (stats.attackSpeedBonus !== undefined) entries.push({key:'attr_aspd',value:percent(stats.attackSpeedBonus),color:HEALING});
        if (stats.physicalPower !== undefined) entries.push({key:'attr_phys_bonus',value:`+${stats.physicalPower}%`,color:PHYSICAL});
        if (stats.attackDamage !== undefined) entries.push({key:'icon_swords',value:`+${stats.attackDamage}`,color:PHYSICAL});
        if (stats.critChance !== undefined) entries.push({key:'attr_crit',value:percent(stats.critChance),color:PHYSICAL});
        if (stats.executeThreshold !== undefined) entries.push({key:'attr_dmg_amp',value:`<${Number((stats.executeThreshold*100).toFixed(2))}%`,color:PHYSICAL});
        entries.forEach((entry,i)=>statBonus(row,entry.key,entry.value,-104+i*125,entry.color,active));
      } else {
        statBonus(row, 'attr_phys_bonus', `+${tier.power ?? 0}%`, -104, PHYSICAL, active);
        statBonus(row, 'attr_spell_bonus', `+${tier.power ?? 0}%`, -8, SPELL, active);
        if (tier.regenPerSecond) statBonus(row, 'stat_hp', `+${tier.regenPerSecond * 100}%/s`, 86, HEALING, active);
      }
    });
    const members = state.config.members.map(id => this.roster.find(unit => unit.id === id)).filter((unit): unit is UnitConfigData => !!unit);
    members.forEach((unit, index) => {
      const x = -129 + index % 4 * 86, y = (formation ? -166 : -114) - Math.floor(index / 4) * 54;
      const deployed = state.memberIds.includes(unit.id);
      const portrait = panel(card, `traitOwner_${unit.id}`, x, y, 44, 44,
        new Color(17, 28, 40), deployed ? COLORS[state.active?.tier ?? 'bronze'] : new Color(56, 65, 74), null);
      const artId = unit.artId ?? unit.id;
      art(portrait, UNIT_PORTRAIT[artId] ?? UNIT_ART[artId] ?? UNIT_ART[unit.id], 0, 0, 40)
        .color = deployed ? Color.WHITE : new Color(165, 177, 188, 220);
    });
  }
}
