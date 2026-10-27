import type { BackpackItem, EquipmentConfigData } from '../battle/types';
import type { UISkinKey } from '../view/ArtPaths';
import { equipmentQuality, QUALITY_COLORS } from '../core/EquipmentQuality';
export { equipmentQualityName } from '../core/EquipmentQuality';

export type EquipmentDisplayItem = Pick<BackpackItem, 'name' | 'icon' | 'description'> & Partial<EquipmentConfigData>;
type StatKey = 'attackSpeedBonus' | 'spellPower' | 'physicalPower' | 'hp' | 'maxHpBonus' | 'armor' | 'mr' | 'critChance' | 'lifesteal' | 'manaPerSecond' | 'maxManaBonus';
export interface EquipmentStatDisplay { name: string; icon: UISkinKey; value: string; }

/** Unlock tiers group all ordinary drops together; component IDs distinguish their display quality. */
export function equipmentNameColor(item: EquipmentDisplayItem): [number, number, number] {
  return QUALITY_COLORS[equipmentQuality(item)-1];
}

export function equipmentDescriptionText(item: EquipmentDisplayItem): string {
  return [item.introduction, equipmentEffectText(item)].filter(Boolean).join('\n\n');
}

const STATS: Array<{ key: StatKey; name: string; icon: UISkinKey; scale?: number; percent?: boolean }> = [
  { key: 'attackSpeedBonus', name: '攻击速度', icon: 'attr_aspd', scale: 100, percent: true },
  { key: 'spellPower', name: '法术加成', icon: 'attr_spell_bonus', percent: true },
  { key: 'physicalPower', name: '物理加成', icon: 'attr_phys_bonus', percent: true },
  { key: 'hp', name: '生命值', icon: 'stat_hp' },
  { key: 'maxHpBonus', name: '最大生命值', icon: 'stat_hp', scale: 100, percent: true },
  { key: 'armor', name: '护甲', icon: 'attr_armor' },
  { key: 'mr', name: '魔抗', icon: 'attr_mr' },
  { key: 'critChance', name: '暴击率', icon: 'attr_crit', scale: 100, percent: true },
  { key: 'lifesteal', name: '全能吸血', icon: 'attr_lifesteal', scale: 100, percent: true },
  { key: 'manaPerSecond', name: '法力回复', icon: 'stat_mana' },
  { key: 'maxManaBonus', name: '最大法力值', icon: 'stat_mana' },
];

/** Keep numeric bonuses in sync with config, including the project's additive attack speed. */
export function equipmentStatRows(item: EquipmentDisplayItem): EquipmentStatDisplay[] {
  const rows = STATS.filter(stat => Number.isFinite(item[stat.key]) && item[stat.key] !== 0).map(stat => {
    const value = Number((item[stat.key]! * (stat.scale ?? 1)).toFixed(2));
    return { name: stat.name, icon: stat.icon, value: `${value > 0 ? '+' : ''}${value}${stat.percent ? '%' : ''}${stat.key === 'manaPerSecond' ? '/秒' : ''}` };
  });
  if (item.consumable?.kind === 'permanentStat') {
    const effect = item.consumable, stat = STATS.find(row => row.key === effect.stat)!;
    rows.push({ name: `永久${stat.name}`, icon: stat.icon, value: `+${effect.amount}${stat.percent ? '%' : ''}` });
  }
  return rows;
}

export function equipmentEffectText(item: EquipmentDisplayItem): string {
  return item.effectDescription ?? item.description ?? '携带后获得装备属性与效果。';
}

/** Attribute icons retain their names; highlighted values make long passive effects readable. */
export function equipmentDescriptionRichText(item: EquipmentDisplayItem, iconSize = 18): string {
  const icons: Record<string, UISkinKey> = {
    '最大生命值': 'stat_hp', '最大生命': 'stat_hp', '生命值': 'stat_hp', '生命': 'stat_hp',
    '最大法力值': 'stat_mana', '法力值': 'stat_mana', '法力回复': 'stat_mana',
    '攻击速度': 'attr_aspd', '攻速': 'attr_aspd', '法术加成': 'attr_spell_bonus',
    '物理加成': 'attr_phys_bonus', '全能吸血': 'attr_lifesteal',
    '物理抗性': 'attr_armor', '法术抗性': 'attr_mr', '暴击伤害': 'attr_crit', '暴击率': 'attr_crit', '护甲': 'attr_armor', '魔抗': 'attr_mr',
    '伤害减免': 'attr_dmg_reduce', '减伤': 'attr_dmg_reduce', '伤害增幅': 'attr_dmg_amp',
  };
  const text = equipmentDescriptionText(item).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const terms = Object.keys(icons).sort((a, b) => b.length - a.length).join('|');
  // Tokenize plain text once so numbers inside inline image attributes never get formatted.
  return text.replace(new RegExp(`${terms}|[+−-]?\\d+(?:\\.\\d+)?[%％]?`, 'g'), token => icons[token]
    ? `<img src='${icons[token]}' width=${iconSize} height=${iconSize} align=center offset=3/>${token}`
    : `<color=#F4D58A><b>${token}</b></color>`);
}
