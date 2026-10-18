import { ConfigManager, hybridSpellDamage, configuredSkillDamage, channelHealAmount, UnitConfigData, SkillConfigData } from '../core/ConfigManager';

export interface SkillStatRow {
  label: string;
  current: string;
  currentRich?: string;
  stars: string;
  tone: 'physical' | 'magic' | 'true' | 'healing' | 'shield' | 'speed' | 'neutral';
}

const number = (v: number) => String(Number(v.toFixed(2)));

/** Presentation only: current equipment/wave stats versus unequipped, unscaled base ranks. */
export function buildSkillStatRows(configs: ConfigManager, unit: UnitConfigData, star: number, skillScale: number, rich = false): SkillStatRow[] {
  if (!unit.skillId) return [];
  const skill = configs.getSkill(unit.skillId);
  const base = configs.getUnit(unit.id);
  const ranks = [1, 2, 3].map(rank => configs.scaleUnit(base, rank));
  const rows: SkillStatRow[] = [];
  const add = (label: string, value: (u: UnitConfigData, rank: number, scale: number) => string, tone: SkillStatRow['tone']) => {
    rows.push({ label, current: value(unit, star - 1, skillScale),
      stars: ranks.map((u, i) => value(u, i, configs.battle.starScaling[i].skill)).join(' / '), tone });
  };
  const power = (u: UnitConfigData) => 1 + (skill.dmgType === 'physical' ? u.physicalPower ?? 0 : skill.dmgType === 'magic' ? u.spellPower ?? 0 : 0) / 100;
  if (skill.effect === 'susanoo') {
    add('持续时间', (u, i) => `${number(skill.formDurations![i] * (1 + (u.physicalPower ?? 0) / 100))}秒`, 'neutral');
    add('伤害减免', (_u, i) => `${number(skill.formReductions![i] * 100)}%`, 'shield');
    add('额外伤害', (u, i) => String(Math.round(skill.formBonusDamage![i] * (1 + (u.physicalPower ?? 0) / 100) * (1 + (u.damageAmp ?? 0)))), 'physical');
  } else if (skill.effect === 'selfShield') {
    add('护盾', (u, i) => String(Math.round(skill.shieldAmounts![i] * (1 + (u.spellPower ?? 0) / 100))), 'shield');
  } else if (skill.effect === 'healAlly') {
    add('治疗', (u, i) => String(Math.round(skill.healAmounts![i] * (1 + (u.spellPower ?? 0) / 100))), 'healing');
  } else if (skill.effect === 'healChannel') {
    add('每次治疗', (u, i) => String(channelHealAmount(u, skill, i + 1)), 'healing');
    add('生命比例', (_u, i) => `${number(skill.heal!.maxHpFractions[i] * 100)}%`, 'healing');
    if (skill.heal!.bonusAmounts) add('额外治疗', (u, i) => number(skill.heal!.bonusAmounts![i] * (1 + (u.spellPower ?? 0) / 100)), 'healing');
  } else {
    add(skill.effect === 'splitPhysical' ? '平摊总伤害' : skill.effect === 'teleportEmpower' ? '强化普攻' : '伤害', (u, i, scale) => {
      if (skill.effect === 'hybridSpell') return String(Math.round(hybridSpellDamage(u, skill, i + 1) * (1 + (u.damageAmp ?? 0))));
      const raw = configuredSkillDamage(skill, i + 1, scale);
      return String(Math.round(raw * power(u) * (1 + (u.damageAmp ?? 0))));
    }, skill.dmgType);
  }
  if (skill.hybrid) {
    add('基础物理伤害', (_u, i) => number(skill.hybrid!.physicalDamage[i]), 'physical');
    add('基础魔法伤害', (_u, i) => number(skill.hybrid!.magicDamage[i]), 'magic');
  }
  if (skill.attackSpeedBonuses) add('攻击速度', (_u, i) => `+${number(skill.attackSpeedBonuses![i] * 100)}%`, 'speed');
  if (skill.stunSeconds) add('眩晕时间', (_u, i) => `${number(skill.stunSeconds![i])}秒`, 'neutral');
  if (skill.guard) {
    add('伤害减免', (_u, i) => `${number(skill.guard!.reductions[i] * 100)}%`, 'shield');
    add('减免持续', (_u, i) => `${number(skill.guard!.durations[i])}秒`, 'neutral');
  }
  if (skill.burn) {
    add('每秒生命伤害', u => {
      const bonus = skill.burn!.dmgType === 'magic' ? u.spellPower ?? 0 : skill.burn!.dmgType === 'physical' ? u.physicalPower ?? 0 : 0;
      return `${number(skill.burn!.maxHpFraction * 100 * (1 + bonus / 100) * (1 + (u.damageAmp ?? 0)))}%`;
    }, skill.burn.dmgType);
    add('持续时间', () => `${number(skill.burn!.durationSeconds)}秒`, 'neutral');
  }
  if (!rich) return rows;
  const values = skillCurrentValues(skill, rows, star);
  return rows.map((row, i) => ({ ...row,
    currentRich: skill.statRows?.[i] ? formatSkillTokens(skill.statRows[i].value, values, true, 1) : undefined }));
}

export function skillParagraphs(text: string): string {
  return text.split(/\n+/).map(part => part.trim()).filter(Boolean).join('\n\n')
    .replace(/。(?=[^\n])/g, '。\n\n');
}

/** Estimate wrapped body lines; CJK consumes one em and Latin roughly half an em. */
export function skillBodyHeight(text: string, width = 544, font = 17): number {
  text = text.replace(/<img[^>]*\/>/g, '■').replace(/<[^>]*>/g, '');
  const lines = text.split('\n').reduce((sum, part) => {
    const ems = Array.from(part).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.55), 0);
    return sum + Math.max(1, Math.ceil(ems / (width / font)));
  }, 0);
  return Math.max(66, lines * 26 + 12);
}

const TOKEN_COLORS: Record<string, string> = {
  '物理': '#ff9740', '魔法': '#50b4ff', '真实': '#ffffff',
  '治疗': '#7bf59a', '攻速': '#f2d04b', '控制': '#b57fe6',
};

/** The roster stores combat role and damage identity independently. */
export function unitRoleLabel(role?: string, damageType?: 'physical' | 'magic'): string {
  const names: Record<string, string> = { warrior:'战士', caster:'术士', marksman:'射手', assassin:'刺客', tank:'坦克' };
  return names[role ?? ''] ? `${damageType === 'magic' ? '魔法' : '物理'}${names[role!]}` : '';
}

/** Resolve the configuration template from the same current stats used by the skill rows. */
function skillCurrentValues(skill: SkillConfigData, rows: SkillStatRow[], star: number): Record<string, string | number> {
  const current = (label: string) => rows.find(row => row.label === label)?.current ?? '';
  return {
    dmg: rows[0]?.current ?? '0', shield: current('护盾'), heal: current('每次治疗') || current('治疗'),
    basePhysical: current('基础物理伤害'), baseMagic: current('基础魔法伤害'),
    burn: current('每秒生命伤害'), aspd: skill.attackSpeedBonuses?.[star - 1] ?? 0,
    stun: skill.stunSeconds?.[star - 1] ?? 0,
    formDuration: current('持续时间').replace(/秒$/, ''),
    formReduction: current('伤害减免'), formBonus: current('额外伤害'),
    guardDuration: skill.guard?.durations[star - 1] ?? 0,
    guardReduction: current('伤害减免'),
    healPercent: current('生命比例'), healBonus: current('额外治疗'), burnDuration: skill.burn?.durationSeconds ?? 0,
  };
}

function formatSkillTokens(template: string, values: Record<string, string | number>, rich: boolean, iconOffset = 5): string {
    return template.replace(/\{(物理|魔法|真实|治疗|攻速|控制)(\+{0,2}):([A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?%?)\}/g,
      (_match, type: string, plus: string, key: string) => {
        const raw = values[key] ?? key;
        const value = type === '攻速' && typeof raw === 'number' ? `${number(raw * 100)}%` : String(raw);
        if (!rich) return value;
        const icons = plus.length === 2 ? ['attr_phys_bonus', 'attr_spell_bonus']
          : plus ? [type === '物理' ? 'attr_phys_bonus' : 'attr_spell_bonus'] : [];
        return `<color=${TOKEN_COLORS[type]}>${value}</color>`
          + (icons.length ? `（${icons.map(icon => `<img src='${icon}' width=16 height=16 align=center offset=${iconOffset} />`).join('')}）` : '');
      });
}

/** Body only; the UI renders stat rows in independent left/right columns below it. */
export function buildSkillDescription(configs: ConfigManager, unit: UnitConfigData, star: number, skillScale: number, rich = false): string {
  if (!unit.skillId) return unit.description ?? '无主动技能';
  const skill = configs.getSkill(unit.skillId);
  const rows = buildSkillStatRows(configs, unit, star, skillScale);
  return formatSkillTokens(skill.description ?? '', skillCurrentValues(skill, rows, star), rich);
}
