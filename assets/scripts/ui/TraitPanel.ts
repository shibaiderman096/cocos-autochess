import { Node, Sprite, Label, RichText, SpriteAtlas, UITransform, Color, Graphics, Mask, ScrollView, Vec2 } from 'cc';
import type { UnitConfigData } from '../core/ConfigManager';
import type { TraitState } from '../battle/Traits';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { UNIT_ART, UNIT_PORTRAIT, M2_UI_SPRITE, FX_SPRITE } from '../view/ArtPaths';
import { panel, label, button, paintPanel } from './BattleUI';
import { sunlightTierText } from './SunlightPresentation';

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

/** Authored white/green/blue/purple/orange frames, indexed by unit cost. */
export const TRAIT_PORTRAIT_FRAMES = [20, 456, 885, 1315, 1747].map(x =>
  `art/ui/trait_portrait_frames/spriteFrame#rect,${x},128,410,410`);

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
function memberPortrait(parent: Node, unit: UnitConfigData, deployed: boolean, x: number, y: number, size = 44): void {
  const portrait = new Node(`traitOwner_${unit.id}`); parent.addChild(portrait);
  portrait.addComponent(UITransform).setContentSize(size, size); portrait.setPosition(x, y, 0);
  const inset = new Node('portraitWindow'); portrait.addChild(inset);
  inset.addComponent(UITransform).setContentSize(size * .78, size * .78);
  inset.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
  const artId = unit.artId ?? unit.id;
  art(inset, UNIT_PORTRAIT[artId] ?? UNIT_ART[artId] ?? UNIT_ART[unit.id], 0, 0, size * .9)
    .color = deployed ? Color.WHITE : new Color(165, 177, 188, 220);
  const frame = art(portrait, TRAIT_PORTRAIT_FRAMES[Math.max(0, Math.min(4, (unit.cost ?? 1) - 1))], 0, 0, size);
  frame.node.name = 'portraitRarityFrame';
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
  private scrollView: ScrollView;
  private readonly viewportHeight = 330;
  private readonly rowSpacing = 56;
  private detail: Node | null = null;
  private catalogViewport: Node | null = null;
  private catalogContent: Node | null = null;
  private selected: string | null = null;
  private states: TraitState[] = [];
  private roster: UnitConfigData[] = [];
  private key = '';

  constructor(private parent: Node) {
    this.root = panel(parent, 'traits', -510, 45, 192, 390);
    const viewport = new Node('traitViewport');
    viewport.addComponent(UITransform).setContentSize(184, this.viewportHeight);
    this.root.addChild(viewport); viewport.setPosition(0, 0, 0);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    this.rows = new Node('traitRows');
    const content = this.rows.addComponent(UITransform);
    content.setAnchorPoint(.5, 1); content.setContentSize(178, this.viewportHeight);
    viewport.addChild(this.rows); this.rows.setPosition(0, this.viewportHeight / 2, 0);
    this.scrollView = viewport.addComponent(ScrollView);
    this.scrollView.horizontal = false; this.scrollView.vertical = true;
    this.scrollView.inertia = true; this.scrollView.brake = .65;
    this.scrollView.elastic = false; this.scrollView.cancelInnerEvents = true;
    this.scrollView.content = this.rows;
    viewport.on(ScrollView.EventType.SCROLL_BEGAN, () => this.hideDetail());
  }

  refresh(states: TraitState[], roster: UnitConfigData[]): void {
    this.states = states.filter(state => state.count > 0); this.roster = roster;
    const key = JSON.stringify(this.states.map(state => [state.config, state.memberIds]));
    if (key === this.key) return;
    this.key = key;
    const offset = this.scrollView.getScrollOffset().y;
    this.scrollView.stopAutoScroll();
    this.closeCard();
    for (const node of [...this.rows.children]) { node.active = false; node.destroy(); }
    this.rows.getComponent(UITransform)!.setContentSize(178,
      Math.max(this.viewportHeight, this.states.length * this.rowSpacing - 6));
    this.states.forEach((state, i) => {
      const row = panel(this.rows, `trait_${state.config.id}`, 0, -25 - i * this.rowSpacing, 178, 50,
        new Color(19, 30, 42), state.active ? COLORS[state.active.tier] : new Color(63, 75, 85), null);
      badge(row, state, -61, 3, 34);
      left(row, state.config.name, -35, 9, 14, 110, state.active ? TEXT : MUTED).isBold = true;
      state.config.breakpoints.forEach((tier, index) => {
        const item = label(row, String(tier.count), -22 + index * 25, -13, 11,
          state.active?.count === tier.count ? COLORS[tier.tier] : MUTED, 24);
        item.isBold = state.active?.count === tier.count;
      });
      row.on(Node.EventType.TOUCH_END, () => {
        if (this.scrollView.isScrolling() || this.scrollView.isAutoScrolling()) return;
        if (this.selected === state.config.id && this.detail?.active) this.hideDetail();
        else this.showDetail(state.config.id);
      });
      row.on(Node.EventType.MOUSE_ENTER, () => {
        if (!this.selected && !this.scrollView.isScrolling() && !this.scrollView.isAutoScrolling()) this.renderDetail(state);
      });
      row.on(Node.EventType.MOUSE_LEAVE, () => { if (!this.selected) this.closeCard(); });
    });
    // Preserve fractional pixel offsets across roster refreshes; never snap to a row.
    this.scrollView.scrollToOffset(new Vec2(0, Math.max(0, Math.min(offset, this.scrollView.getMaxScrollOffset().y))));
    if (this.selected) this.showDetail(this.selected);
  }

  setVisible(visible: boolean): void {
    this.root.active = visible;
    if (!visible) { this.scrollView.stopAutoScroll(); this.hideDetail(); }
  }
  hideDetail(): void { this.selected = null; this.closeCard(); }
  private membersByCost(state: TraitState): UnitConfigData[] {
    return Array.from(new Set([...state.config.members, ...state.memberIds]))
      .map(id => this.roster.find(unit => unit.id === id))
      .filter((unit): unit is UnitConfigData => !!unit)
      .sort((a, b) => (a.cost ?? 1) - (b.cost ?? 1));
  }
  /** Reuse authored effect rows and member portraits in the home collection. */
  inspectForCatalog(state: TraitState, roster: UnitConfigData[]): void {
    this.roster = roster; this.selected = state.config.id; this.renderDetail(state);
    const subtitle = this.detail?.children.map(node => node.getComponent(Label)).find(text => text?.string.includes('名上场'));
    if (subtitle) subtitle.string = '羁绊效果 · 全部成员';
    if (!this.detail) return;
    const viewport = this.catalogViewport = new Node('catalogTraitViewport'); this.parent.addChild(viewport);
    viewport.setPosition(285, -20, 0); viewport.addComponent(UITransform).setContentSize(540, 446);
    viewport.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const content = this.catalogContent = new Node('catalogTraitContent'); viewport.addChild(content);
    content.addComponent(UITransform).setAnchorPoint(.5, 1); content.setPosition(0, 223, 0);
    this.detail.removeFromParent(); content.addChild(this.detail); this.fitCatalogDetail();
    const scroll = viewport.addComponent(ScrollView); scroll.content = content;
    scroll.horizontal = false; scroll.vertical = true; scroll.elastic = false;
  }
  private fitCatalogDetail(): void {
    if (!this.detail || !this.catalogContent) return;
    const height = this.detail.getComponent(UITransform)!.contentSize.height;
    this.catalogContent.getComponent(UITransform)!.setContentSize(540, Math.max(446, height));
    this.detail.setPosition(0, -height / 2, 0);
  }
  private closeCard(): void {
    if (this.detail) { this.detail.active = false; this.detail.destroy(); this.detail = null; }
    if (this.catalogViewport) { this.catalogViewport.active = false; this.catalogViewport.destroy(); this.catalogViewport = null; this.catalogContent = null; }
  }
  /** Measure rendered text, then place effects and a shared four-column portrait grid. */
  private fitDetail(card: Node, state: TraitState): void {
    if (this.detail !== card) return;
    const transform = card.getComponent(UITransform)!;
    const width = transform.contentSize.width;
    const rows = card.children.filter(n => /^(trait|mechanical|sunlight|astral)Breakpoint$/.test(n.name));
    const portraits = card.children.filter(n => n.name.startsWith('traitOwner_'));
    const description = card.children.find(n => /^(trait|shadow|sunlight)Description$/.test(n.name))!;
    const headers = card.children.filter(n => n !== description && !rows.includes(n) && !portraits.includes(n));
    const heightOf = (node: Node): number => {
      const text = node.getComponent(Label);
      return text ? text.lineHeight : node.getComponent(UITransform)?.contentSize.height ?? 0;
    };
    const headerTop = Math.max(...headers.map(n => n.position.y + heightOf(n) / 2));
    const headerBottom = Math.min(...headers.map(n => n.position.y - heightOf(n) / 2));
    const descLabel = description.getComponent(Label);
    if (descLabel) {
      descLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
      descLabel.updateRenderData(true);
    }
    const descHeight = description.getComponent(UITransform)!.contentSize.height;
    const heights = rows.map(row => Math.max(32, ...row.children.map(n =>
      2 * Math.abs(n.position.y) + heightOf(n) + 12)));
    const portraitHeight = portraits.length ? portraits[0].getComponent(UITransform)!.contentSize.height : 0;
    const portraitRows = Math.ceil(portraits.length / 4);
    const height = 28 + (headerTop - headerBottom) + 10 + descHeight + 12
      + heights.reduce((sum, h) => sum + h, 0) + Math.max(0, rows.length - 1) * 6
      + (portraitRows ? 12 + portraitHeight + (portraitRows - 1) * 52 : 0);
    const oldTop = card.position.y + transform.contentSize.height / 2;
    const top = height / 2;
    const headerDelta = top - 14 - headerTop;
    headers.forEach(n => n.setPosition(n.position.x, n.position.y + headerDelta, 0));
    let cursor = top - 14 - (headerTop - headerBottom) - 10;
    description.setPosition(description.position.x, cursor - descHeight / 2, 0);
    cursor -= descHeight + 12;
    rows.forEach((row, i) => {
      const t = row.getComponent(UITransform)!, g = row.getComponent(Graphics)!;
      t.setContentSize(t.contentSize.width, heights[i]);
      const edge = g.strokeColor;
      paintPanel(g, t.contentSize.width, heights[i], g.fillColor, new Color(edge.r, edge.g, edge.b));
      row.setPosition(0, cursor - heights[i] / 2, 0);
      cursor -= heights[i] + (i < rows.length - 1 ? 6 : 0);
    });
    cursor -= 12;
    const spacing = (width - 40) / 4;
    portraits.forEach((portrait, i) => portrait.setPosition((i % 4 - 1.5) * spacing,
      cursor - portraitHeight / 2 - Math.floor(i / 4) * 52, 0));
    transform.setContentSize(width, height);
    paintPanel(card.getComponent(Graphics)!, width, height,
      new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive']);
    if (this.catalogContent && card.parent === this.catalogContent) this.fitCatalogDetail();
    else card.setPosition(card.position.x, Math.max(-344 + top, Math.min(oldTop - top, 344 - top)), 0);
  }
  private showDetail(id: string): void {
    const state = this.states.find(item => item.config.id === id);
    if (!state) { this.hideDetail(); return; }
    this.selected = id; this.renderDetail(state);
  }
  private renderDetail(state: TraitState): void {
    this.closeCard();
    if (state.config.breakpoints.some(t => !!t.astral)) { this.renderAstralDetail(state); return; }
    if (state.config.breakpoints.some(t => !!t.mechanicalPioneer)) { this.renderMechanicalDetail(state); return; }
    if (state.config.breakpoints.some(tier => !!tier.sunlight)) { this.renderSunlightDetail(state); return; }
    const formation = state.config.breakpoints.some(tier => !!tier.formation);
    const shadow = state.config.breakpoints.some(tier => !!tier.shadow);
    const spellchanter = state.config.breakpoints.some(tier => !!tier.spellchanter);
    const swift = state.config.breakpoints.some(tier => !!tier.swiftmartialist);
    const warrior = state.config.breakpoints.some(tier => !!tier.conqueror || !!tier.spellblade);
    const tall = formation || shadow || swift;
    const headerY = shadow || warrior ? 264 : tall ? 232 : 177;
    const card = panel(this.parent, 'traitDetail', shadow || warrior ? -184 : -206, shadow || warrior ? 0 : tall ? 10 : 40, shadow || warrior ? 440 : 390, shadow || warrior ? 610 : tall ? 540 : 430,
      new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    badge(card, state, shadow ? -178 : -151, headerY, 56);
    left(card, state.config.name, shadow ? -137 : -110, headerY + 13, 23, 240).isBold = true;
    left(card, `${state.count}名上场 · ${state.active ? {bronze:'黄铜',silver:'白银',gold:'黄金',prismatic:'棱彩'}[state.active.tier] : '未激活'}`, shadow ? -137 : -110, headerY - 19, 14, 230, COLORS[state.active?.tier ?? 'inactive']);
    button(card, '×', shadow ? 193 : 167, headerY + 21, 26, 26, () => this.hideDetail());
    const atlas = shadow || warrior || spellchanter || swift ? new SpriteAtlas() : null;
    const copies: Array<{ view: RichText; markup: string }> = [];
    const rich = (parent: Node, name: string, markup: string, x: number, y: number, width: number, size = 15): void => {
      const node = new Node(name); parent.addChild(node);
      node.addComponent(UITransform).setAnchorPoint(0, .5); node.setPosition(x, y, 0);
      const view = node.addComponent(RichText); view.fontSize = size; view.lineHeight = 23; view.maxWidth = width;
      view.horizontalAlign = Label.HorizontalAlign.LEFT; view.handleTouchEvent = false; view.imageAtlas = atlas!;
      // Do not reference images until their asynchronously loaded frames exist.
      view.string = markup.replace(/<img[^>]*\/>/g, ''); copies.push({ view, markup });
    };
    if (shadow) {
      rich(card, 'shadowDescription', '<color=#eae7d7>暗影棋子的普攻会使目标<color=#c6acff><b>沾染暗影</b></color>，<br/>侵蚀持续至战斗结束。</color>', -198, 194, 396, 16);
    } else {
      const body = left(card, state.config.description, warrior ? -198 : -172, warrior ? 185 : tall ? 163 : 115, 16, warrior ? 396 : 344);
      body.node.name = 'traitDescription';
      body.enableWrapText = true; body.overflow = Label.Overflow.CLAMP;
      body.node.getComponent(UITransform)!.setContentSize(warrior ? 396 : 344, warrior ? 90 : tall ? 76 : 58);
    }
    state.config.breakpoints.forEach((tier, index) => {
      const active = state.active?.count === tier.count;
      const row = panel(card, 'traitBreakpoint', 0, warrior ? [105, 63, 21, -49][index] : shadow ? [123, 58, -10, -94][index] : swift ? 80 - index * 60 : formation ? 80 - index * 72 : 48 - index * 36, shadow || warrior ? 400 : 350, warrior ? (index === 3 ? 88 : 36) : shadow ? (tier.shadow?.board ? 96 : index === 0 ? 56 : 64) : swift ? 56 : formation ? 64 : 32,
        active ? new Color(39, 43, 57) : new Color(15, 23, 34), active ? COLORS[tier.tier] : new Color(30, 42, 52), null);
      left(row, `(${tier.count})`, shadow || warrior ? -188 : -163, 0, shadow || warrior ? 18 : 16, 42, active ? COLORS[tier.tier] : MUTED).isBold = shadow || warrior;
      if (tier.swiftmartialist) {
        const e = tier.swiftmartialist, reached = state.count >= tier.count;
        const number = (value: string, tone: string) => `<color=${reached ? tone : '#8a99a4'}><b>${value}</b></color>`;
        const percent = Number((e.attackSpeedPerCast * 100).toFixed(2));
        rich(row, 'swiftmartialistEffect', `<color=${reached ? '#eae7d7' : '#8a99a4'}><img src='attr_phys_bonus' width=16 height=16 align=center offset=4/> ${number(`+${e.physicalPower}%`, '#ff9740')}物理加成<br/>每次施法 ${number(`+${percent}%`, '#f2d04b')}攻速，最多${number(`${e.maxStacks}层`, '#b57fe6')}</color>`, -120, 0, 288, 14);
      } else if (tier.spellchanter) {
        const e = tier.spellchanter, reached = state.count >= tier.count;
        const number = (value: string, color: string) => `<color=${reached ? color : '#8a99a4'}><b>${value}</b></color>`;
        rich(row, 'spellchanterEffect', `<color=${reached ? '#eae7d7' : '#8a99a4'}><img src='attr_spell_bonus' width=16 height=16 align=center offset=4/> ${number(`+${e.spellPower}%`, '#50b4ff')}法术加成  参与击杀${number(`+${e.manaOnTakedown}`, '#50b4ff')}法力</color>`, -120, 0, 288, 14);
      } else if (tier.conqueror || tier.spellblade) {
        const percent = (value: number) => `${Number((value * 100).toFixed(2))}%`;
        const number = (value: string, tone: string) => `<color=${state.count >= tier.count ? tone : '#8a99a4'}><b>${value}</b></color>`;
        const icon = (key: string) => `<img src='${key}' width=16 height=16 align=center offset=4/>`;
        let text = '';
        if (tier.conqueror) {
          const e = tier.conqueror, p = e.protection;
          text = `${icon('attr_dmg_amp')} ${number(`+${percent(e.damageAmp)}`, '#ff9740')}增伤  ${icon('attr_lifesteal')} ${number(`+${percent(e.lifesteal)}`, '#7bf59a')}全能吸血`;
          if (p) text += `<br/>首次低于${number(percent(p.threshold), '#ff9740')}生命时，回复${number(percent(p.healMaxHpFraction), '#7bf59a')}最大生命<br/>并获得${number(percent(p.damageReduction), '#50b4ff')}减伤，持续${number(`${p.durationSeconds}秒`, '#b57fe6')}`;
        } else {
          const e = tier.spellblade!;
          text = `${icon('attr_spell_bonus')} ${number(`+${e.spellPower}`, '#50b4ff')}法强  ${icon('attr_aspd')} ${number(`+${percent(e.attackSpeedBonus)}`, '#f2d04b')}攻速  ${number(percent(e.damageReduction), '#50b4ff')}减伤`;
          if (e.empoweredAttacks) text += `<br/>施法后接下来${number(`${e.empoweredAttacks.count}次`, '#b57fe6')}普攻，每次额外造成<br/>${number(`${e.empoweredAttacks.damage}`, '#50b4ff')}${icon('attr_spell_bonus')}魔法伤害，再次施法重置次数`;
        }
        rich(row, 'warriorEffect', `<color=${state.count >= tier.count ? '#eae7d7' : '#8a99a4'}>${text}</color>`, -140, 0, 330, 14);
      } else if (tier.shadow) {
        const effect = tier.shadow;
        const percent = (value: number) => Number((value * 100).toFixed(2));
        const reached = state.count >= tier.count;
        const number = (value: string, tone: string) => `<color=${reached ? tone : '#8a99a4'}><b>${value}</b></color>`;
        const icon = (key: string) => `<img src='${key}' width=16 height=16 align=center offset=4/>`;
        let text = `被侵蚀的敌人：<br/>${icon('attr_armor')} 护甲和 ${icon('attr_mr')} 魔抗降低 ${number(`${percent(effect.resistanceReduction)}%`, '#c6acff')}`;
        if (tier.count === 5) text = `暗影棋子获得<br/>${icon('attr_phys_bonus')} ${number(`+${tier.power ?? 0}%`, '#ff9740')}物理加成  ${icon('attr_spell_bonus')} ${number(`+${tier.power ?? 0}%`, '#50b4ff')}法术加成`;
        if (effect.damageAmpLossPerSecond) text = `被侵蚀的敌人：<br/>${icon('attr_dmg_amp')} 伤害增幅每秒 ${number(`−${percent(effect.damageAmpLossPerSecond)}%`, '#c6acff')}，最多 ${number(`−${percent(effect.damageAmpLossCap ?? 0)}%`, '#c6acff')}`;
        if (effect.board) {
          const speedInterval = effect.board.intervalSeconds === 1 ? '每秒' : `每${effect.board.intervalSeconds}秒`;
          const seconds = effect.board.damageIntervalSeconds ?? effect.board.intervalSeconds;
          const damageInterval = seconds === 1 ? '每秒' : `每${seconds}秒`;
          text = `${number('暗影笼罩整个棋盘，侵蚀所有敌军', '#c6acff')}<br/>${icon('attr_aspd')} 全体友军${speedInterval} ${number(`+${percent(effect.board.attackSpeedPerPulse)}%`, '#7bf59a')}攻速（最多 ${number(`+${percent(effect.board.attackSpeedCap)}%`, '#7bf59a')}）<br/>${icon('shadow_damage')} 被侵蚀的敌军${damageInterval}受到 ${number(`${effect.board.fixedDamage}`, '#ffffff')}真实伤害`;
        }
        rich(row, 'shadowEffect', `<color=${reached ? '#eae7d7' : '#8a99a4'}>${text}</color>`, -140, 0, 330);
      } else if (tier.formation) {
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
    if (shadow || warrior || spellchanter || swift) {
      const icons = { attr_armor: M2_UI_SPRITE.attr_armor, attr_mr: M2_UI_SPRITE.attr_mr,
        attr_phys_bonus: M2_UI_SPRITE.attr_phys_bonus, attr_spell_bonus: M2_UI_SPRITE.attr_spell_bonus,
        attr_dmg_amp: M2_UI_SPRITE.attr_dmg_amp, attr_aspd: M2_UI_SPRITE.attr_aspd, attr_lifesteal: M2_UI_SPRITE.attr_lifesteal, shadow_damage: FX_SPRITE.shadowProjectile };
      let remaining = Object.keys(icons).length;
      Object.entries(icons).forEach(([key, path]) => loadArtSprite(path, (error, frame) => {
        if (this.detail !== card) return;
        if (!error && frame) atlas!.spriteFrames[key] = frame;
        if (--remaining === 0) for (const {view, markup} of copies) {
          if (view.isValid === false) continue;
          view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, key: string) => atlas!.spriteFrames[key] ? tag : '');
        }
        if (remaining === 0) this.fitDetail(card, state);
      }));
    }
    const members = this.membersByCost(state);
    members.forEach((unit, index) => {
      const x = -129 + index % 4 * 86;
      const y = -114 - Math.floor(index / 4) * 52;
      const deployed = state.memberIds.includes(unit.id);
      memberPortrait(card, unit, deployed, x, y);
    });
    this.fitDetail(card, state);
  }

  private renderAstralDetail(state: TraitState): void {
    const card = panel(this.parent, 'traitDetail', -184, 0, 462, 610, new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, e => { e.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, e => { e.propagationStopped = true; });
    badge(card, state, -190, 255, 56);
    left(card, state.config.name, -148, 268, 24, 280).isBold = true;
    left(card, `${state.count}名上场 · ${state.active ? '已激活' : '未激活'}`, -148, 236, 14, 280, COLORS[state.active?.tier ?? 'inactive']);
    button(card, '×', 204, 276, 26, 26, () => this.hideDetail());
    const intro = left(card, state.config.description, -210, 183, 15, 420);
    intro.node.name = 'traitDescription'; intro.enableWrapText = true;
    intro.lineHeight = 23; intro.overflow = Label.Overflow.RESIZE_HEIGHT;
    const atlas = new SpriteAtlas();
    const copies: Array<{ view: RichText; markup: string }> = [];
    const icons = { attr_phys_bonus: M2_UI_SPRITE.attr_phys_bonus, attr_spell_bonus: M2_UI_SPRITE.attr_spell_bonus, stat_hp: M2_UI_SPRITE.stat_hp };
    const fallback: Record<string, string> = { attr_phys_bonus: '物理', attr_spell_bonus: '法术', stat_hp: '生命' };
    state.config.breakpoints.forEach((tier, i) => {
      const e = tier.astral!, reached = state.count >= tier.count;
      const row = panel(card, 'astralBreakpoint', 0, 95 - i * 64, 426, e.meteor ? 112 : 54,
        reached ? new Color(29, 36, 59) : new Color(15, 23, 34), state.active?.count === tier.count ? COLORS[tier.tier] : MUTED, null);
      left(row, `(${tier.count})`, -200, 0, 18, 40, reached ? COLORS[tier.tier] : MUTED).isBold = true;
      const number = (value: string, color: string) => `<color=${reached ? color : '#8a99a4'}><b>${value}</b></color>`;
      const node = new Node('astralEffect'); row.addChild(node);
      node.addComponent(UITransform).setAnchorPoint(0, .5); node.setPosition(-153, 0);
      const text = node.addComponent(RichText); text.fontSize = 14; text.lineHeight = 22; text.maxWidth = 354; text.handleTouchEvent = false;
      const cells = e.cellCount === 'all' ? '整个己方棋盘' : `${e.cellCount}个星穹格`;
      const icon = (key: keyof typeof icons) => `<img src='${key}' width=18 height=18 align=center offset=4/>`;
      const markup = `<color=${reached ? '#eae7d7' : '#8a99a4'}>${number(cells, '#c6acff')}<br/>${icon('attr_phys_bonus')} ${number(`+${e.power}%`, '#ff9740')}  ${icon('attr_spell_bonus')} ${number(`+${e.power}%`, '#50b4ff')}  ${icon('stat_hp')} ${number(`+${Math.round(e.maxHpBonus * 100)}%`, '#7bf59a')}${e.meteor ? `<br/>每${number(`${e.meteor.intervalSeconds}秒`, '#c6acff')}陨星轰击敌人最密集区域<br/>中心及周围${e.meteor.radius}格，每个敌人${number(`${e.meteor.damage}`, '#50b4ff')}魔法伤害` : ''}</color>`;
      text.imageAtlas = atlas;
      text.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (_tag, key: string) => fallback[key]);
      copies.push({ view: text, markup });
    });
    let remaining = Object.keys(icons).length;
    Object.entries(icons).forEach(([key, path]) => loadArtSprite(path, (error, frame) => {
      if (this.detail !== card) return;
      if (!error && frame) atlas.spriteFrames[key] = frame;
      if (--remaining === 0) {
        for (const { view, markup } of copies) if (view.isValid !== false)
          view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, name: string) => atlas.spriteFrames[name] ? tag : fallback[name]);
        this.fitDetail(card, state);
      }
    }));
    this.membersByCost(state).forEach((unit, i) => {
      memberPortrait(card, unit, state.memberIds.includes(unit.id), -129 + i % 4 * 86, -211 - Math.floor(i / 4) * 52);
    });
    this.fitDetail(card, state);
  }

  private renderMechanicalDetail(state: TraitState): void {
    const card = panel(this.parent, 'traitDetail', -184, 0, 440, 610, new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, e => { e.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, e => { e.propagationStopped = true; });
    badge(card, state, -174, 255, 56);
    left(card, state.config.name, -132, 268, 24, 260).isBold = true;
    left(card, `${state.count}名上场 · ${state.active ? '已激活' : '未激活'}`, -132, 236, 14, 260, COLORS[state.active?.tier ?? 'inactive']);
    button(card, '×', 193, 276, 26, 26, () => this.hideDetail());
    const atlas = new SpriteAtlas();
    const icons = { attr_aspd: M2_UI_SPRITE.attr_aspd, stat_hp: M2_UI_SPRITE.stat_hp };
    const fallback: Record<string, string> = { attr_aspd: '攻速', stat_hp: '生命' };
    const copies: Array<{ view: RichText; markup: string }> = [];
    const icon = (key: keyof typeof icons) => `<img src='${key}' width=16 height=16 align=center offset=4/>`;
    const rich = (parent: Node, name: string, markup: string, x: number, y: number, width: number, size = 14): void => {
      const node = new Node(name); parent.addChild(node);
      node.addComponent(UITransform).setAnchorPoint(0, .5); node.setPosition(x, y, 0);
      const view = node.addComponent(RichText); view.fontSize = size; view.lineHeight = 23; view.maxWidth = width;
      view.horizontalAlign = Label.HorizontalAlign.LEFT; view.handleTouchEvent = false; view.imageAtlas = atlas;
      view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (_tag, key: string) => fallback[key]);
      copies.push({ view, markup });
    };
    rich(card, 'traitDescription', `<color=#eae7d7>${state.config.description.replace(/攻速/g, icon('attr_aspd')).replace(/生命/g, icon('stat_hp'))}</color>`, -198, 182, 396, 15);
    state.config.breakpoints.forEach((tier, i) => {
      const e = tier.mechanicalPioneer!, reached = state.count >= tier.count;
      const row = panel(card, 'mechanicalBreakpoint', 0, 95 - i * 103, 400, 96,
        reached ? new Color(29, 43, 52) : new Color(15, 23, 34), state.active?.count === tier.count ? COLORS[tier.tier] : MUTED, null);
      left(row, `(${tier.count})`, -188, 0, 18, 40, reached ? COLORS[tier.tier] : MUTED).isBold = true;
      const number = (value: string, color: string) => `<color=${reached ? color : '#8a99a4'}><b>${value}</b></color>`;
      const percent = (n: number) => `${Number((n * 100).toFixed(2))}%`;
      rich(row, 'mechanicalEffect', `<color=${reached ? '#eae7d7' : '#8a99a4'}>超频：${icon('attr_aspd')} ${number(`+${percent(e.attackSpeedBonus)}`, '#f2d04b')}，每秒回复${number(percent(e.regenPerSecond), '#7bf59a')}最大${icon('stat_hp')}<br/>首次及结束后等待${number(`${e.cooldownSeconds}秒`, '#50dcff')}，持续${number(`${e.durationSeconds}秒`, '#b57fe6')}${e.lowHealthThreshold ? `<br/>每场首次低于${number(percent(e.lowHealthThreshold), '#ff9740')}${icon('stat_hp')}，立即触发或刷新超频` : ''}</color>`, -140, 0, 330);
    });
    let remaining = Object.keys(icons).length;
    Object.entries(icons).forEach(([key, path]) => loadArtSprite(path, (error, frame) => {
      if (this.detail !== card) return;
      if (!error && frame) atlas.spriteFrames[key] = frame;
      if (--remaining === 0) {
        for (const { view, markup } of copies) if (view.isValid !== false)
          view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, name: string) => atlas.spriteFrames[name] ? tag : fallback[name]);
        this.fitDetail(card, state);
      }
    }));
    const members = this.membersByCost(state);
    members.forEach((unit, i) => {
      memberPortrait(card, unit, state.memberIds.includes(unit.id), -129 + i % 4 * 86, -211 - Math.floor(i / 4) * 52);
    });
    this.fitDetail(card, state);
  }

  private renderSunlightDetail(state: TraitState): void {
    const card = panel(this.parent, 'traitDetail', -184, 0, 462, 700, new Color(20, 24, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, e => { e.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, e => { e.propagationStopped = true; });
    badge(card, state, -190, 306, 56);
    left(card, state.config.name, -148, 317, 24, 280).isBold = true;
    left(card, `${state.count}名上场 · 日辉棋子获得以下效果`, -148, 285, 14, 310, new Color(255, 212, 118));
    button(card, '×', 207, 325, 26, 26, () => this.hideDetail());
    const atlas = new SpriteAtlas();
    const copies: Array<{ view: RichText; markup: string }> = [];
    const rich = (parent: Node, name: string, markup: string, x: number, y: number, width: number, size: number): void => {
      const node = new Node(name); parent.addChild(node);
      node.addComponent(UITransform).setAnchorPoint(0, .5); node.setPosition(x, y, 0);
      const view = node.addComponent(RichText); view.fontSize = size; view.lineHeight = 22; view.maxWidth = width;
      view.horizontalAlign = Label.HorizontalAlign.LEFT; view.handleTouchEvent = false; view.imageAtlas = atlas;
      view.string = markup.replace(/<img[^>]*\/>/g, ''); copies.push({ view, markup });
    };
    // The configured introduction remains the single source for the player-facing copy.
    const intro = state.config.description.replace('。', '。<br/>').replace('护盾', "<img src='sun_shield' width=16 height=16 align=center offset=3/>护盾");
    rich(card, 'sunlightDescription', `<color=#eae7d7>${intro}</color>`, -210, 249, 420, 15);
    state.config.breakpoints.forEach((tier, i) => {
      const reached = state.count >= tier.count;
      const row = panel(card, 'sunlightBreakpoint', 0, [183, 104, 25, -91][i], 426, [74, 74, 74, 148][i],
        reached ? new Color(45, 39, 29) : new Color(18, 25, 34), state.active?.count === tier.count ? COLORS[tier.tier] : new Color(66, 57, 40), null);
      left(row, `(${tier.count})`, -202, 0, 18, 38, reached ? COLORS[tier.tier] : MUTED).isBold = true;
      rich(row, 'sunlightEffect', `<color=${reached ? '#eae7d7' : '#8a99a4'}>${sunlightTierText(tier, reached, true).replace(/\n/g, '<br/>')}</color>`, -158, 0, 358, 13);
    });
    const icons = { sun_shield: M2_UI_SPRITE.attr_dmg_reduce, sun_hp: M2_UI_SPRITE.stat_hp,
      sun_reduce: M2_UI_SPRITE.attr_dmg_reduce, sun_amp: M2_UI_SPRITE.attr_dmg_amp,
      sun_judgment: 'art/equipment/divine_judgment/spriteFrame' };
    let remaining = Object.keys(icons).length;
    Object.entries(icons).forEach(([key, path]) => loadArtSprite(path, (error, frame) => {
      if (this.detail !== card) return;
      if (!error && frame) atlas.spriteFrames[key] = frame;
      if (--remaining === 0) for (const { view, markup } of copies) {
        if (view.isValid === false) continue;
        view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, key: string) => atlas.spriteFrames[key] ? tag : '');
      }
      if (remaining === 0) this.fitDetail(card, state);
    }));
    this.membersByCost(state).forEach((unit, i) => {
      const deployed = state.memberIds.includes(unit.id);
      memberPortrait(card, unit, deployed, -129 + i % 4 * 86, -222 - Math.floor(i / 4) * 52, 46);
    });
    this.fitDetail(card, state);
  }
}
