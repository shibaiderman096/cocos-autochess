import { Node, Sprite, Label, RichText, SpriteAtlas, UITransform, Color } from 'cc';
import type { UnitConfigData } from '../core/ConfigManager';
import type { TraitState } from '../battle/Traits';
import { loadArtSprite } from '../view/ArtSpriteLoader';
import { UNIT_ART, UNIT_PORTRAIT, M2_UI_SPRITE, FX_SPRITE } from '../view/ArtPaths';
import { panel, label, button } from './BattleUI';
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
    const crowded = this.states.length > 7;
    const spacing = crowded ? 350 / this.states.length : 49;
    this.states.forEach((state, i) => {
      const row = panel(this.rows, `trait_${state.config.id}`, 0, crowded ? (this.states.length - 1) * spacing / 2 - i * spacing : compact ? 136 - i * 49 : 109 - i * 74, 178, crowded ? spacing - 4 : compact ? 44 : 66,
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
    if (state.config.breakpoints.some(tier => !!tier.sunlight)) { this.renderSunlightDetail(state); return; }
    const formation = state.config.breakpoints.some(tier => !!tier.formation);
    const shadow = state.config.breakpoints.some(tier => !!tier.shadow);
    const tall = formation || shadow;
    const headerY = shadow ? 264 : tall ? 232 : 177;
    const card = panel(this.parent, 'traitDetail', shadow ? -184 : -206, shadow ? 0 : tall ? 10 : 40, shadow ? 440 : 390, shadow ? 610 : tall ? 540 : 430,
      new Color(13, 20, 30, 252), COLORS[state.active?.tier ?? 'inactive'], null);
    this.detail = card; card.setSiblingIndex(this.parent.children.length - 1);
    card.on(Node.EventType.TOUCH_START, event => { event.propagationStopped = true; });
    card.on(Node.EventType.TOUCH_END, event => { event.propagationStopped = true; });
    badge(card, state, shadow ? -178 : -151, headerY, 56);
    left(card, state.config.name, shadow ? -137 : -110, headerY + 13, 23, 240).isBold = true;
    left(card, `${state.count}名上场 · ${state.active ? {bronze:'黄铜',silver:'白银',gold:'黄金',prismatic:'棱彩'}[state.active.tier] : '未激活'}`, shadow ? -137 : -110, headerY - 19, 14, 230, COLORS[state.active?.tier ?? 'inactive']);
    button(card, '×', shadow ? 193 : 167, headerY + 21, 26, 26, () => this.hideDetail());
    if (shadow) left(card, '各效果累加', -72, headerY + 13, 13, 160, new Color(198, 172, 255)).node.name = 'shadowStackingNote';
    const atlas = shadow ? new SpriteAtlas() : null;
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
      const body = left(card, state.config.description, -172, tall ? 163 : 115, 16, 344);
      body.enableWrapText = true; body.overflow = Label.Overflow.CLAMP;
      body.node.getComponent(UITransform)!.setContentSize(344, tall ? 76 : 58);
    }
    state.config.breakpoints.forEach((tier, index) => {
      const active = state.active?.count === tier.count;
      const row = panel(card, 'traitBreakpoint', 0, shadow ? [123, 58, -10, -94][index] : formation ? 80 - index * 72 : 48 - index * 36, shadow ? 400 : 350, shadow ? (tier.shadow?.board ? 96 : index === 0 ? 56 : 64) : formation ? 64 : 32,
        active ? new Color(39, 43, 57) : new Color(15, 23, 34), active ? COLORS[tier.tier] : new Color(30, 42, 52), null);
      left(row, `(${tier.count})`, shadow ? -188 : -163, 0, shadow ? 18 : 16, 42, active ? COLORS[tier.tier] : MUTED).isBold = shadow;
      if (tier.shadow) {
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
    if (shadow) {
      const icons = { attr_armor: M2_UI_SPRITE.attr_armor, attr_mr: M2_UI_SPRITE.attr_mr,
        attr_phys_bonus: M2_UI_SPRITE.attr_phys_bonus, attr_spell_bonus: M2_UI_SPRITE.attr_spell_bonus,
        attr_dmg_amp: M2_UI_SPRITE.attr_dmg_amp, attr_aspd: M2_UI_SPRITE.attr_aspd, shadow_damage: FX_SPRITE.shadowProjectile };
      let remaining = Object.keys(icons).length;
      Object.entries(icons).forEach(([key, path]) => loadArtSprite(path, (error, frame) => {
        if (this.detail !== card) return;
        if (!error && frame) atlas!.spriteFrames[key] = frame;
        if (--remaining === 0) for (const {view, markup} of copies) {
          if (view.isValid === false) continue;
          view.string = markup.replace(/<img src='([^']+)'[^>]*\/>/g, (tag, key: string) => atlas!.spriteFrames[key] ? tag : '');
        }
      }));
    }
    const members = state.config.members.map(id => this.roster.find(unit => unit.id === id)).filter((unit): unit is UnitConfigData => !!unit);
    members.forEach((unit, index) => {
      const x = shadow ? -152 + index % 5 * 76 : -129 + index % 4 * 86;
      const y = (shadow ? -176 : formation ? -166 : -114) - Math.floor(index / (shadow ? 5 : 4)) * 52;
      const deployed = state.memberIds.includes(unit.id);
      const portrait = panel(card, `traitOwner_${unit.id}`, x, y, 44, 44,
        new Color(17, 28, 40), deployed ? COLORS[state.active?.tier ?? 'bronze'] : new Color(56, 65, 74), null);
      const artId = unit.artId ?? unit.id;
      art(portrait, UNIT_PORTRAIT[artId] ?? UNIT_ART[artId] ?? UNIT_ART[unit.id], 0, 0, 40)
        .color = deployed ? Color.WHITE : new Color(165, 177, 188, 220);
    });
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
    }));
    state.config.members.forEach((id, i) => {
      const unit = this.roster.find(u => u.id === id); if (!unit) return;
      const deployed = state.memberIds.includes(id);
      const portrait = panel(card, `traitOwner_${id}`, -168 + i % 5 * 84, -222 - Math.floor(i / 5) * 57, 46, 46,
        new Color(17, 28, 40), deployed ? COLORS[state.active?.tier ?? 'bronze'] : MUTED, null);
      art(portrait, UNIT_PORTRAIT[id] ?? UNIT_ART[id], 0, 0, 42).color = deployed ? Color.WHITE : new Color(160, 160, 160);
    });
  }
}
