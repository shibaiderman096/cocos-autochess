import type { BackpackItem, EquipmentConfigData } from '../battle/types';
import type { UISkinKey } from '../view/ArtPaths';

export type EquipmentDisplayItem = Pick<BackpackItem, 'name' | 'icon' | 'description'> & Partial<EquipmentConfigData>;
type StatKey = 'attackSpeedBonus' | 'spellPower' | 'physicalPower' | 'hp' | 'maxHpBonus' | 'armor' | 'mr' | 'critChance' | 'lifesteal' | 'manaPerSecond' | 'maxManaBonus';
export interface EquipmentStatDisplay { name: string; icon: UISkinKey; value: string; }

/** Unlock tiers group all ordinary drops together; component IDs distinguish their display quality. */
export function equipmentNameColor(item: EquipmentDisplayItem): [number, number, number] {
  if (item.id?.startsWith('basic_')) return [255, 255, 255];
  if (!item.id || item.specialShopOnly || item.traitChoice || item.grantedTraitId) return [220, 187, 115];
  return [100, 220, 130];
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
  return STATS.filter(stat => Number.isFinite(item[stat.key]) && item[stat.key] !== 0).map(stat => {
    const value = Number((item[stat.key]! * (stat.scale ?? 1)).toFixed(2));
    return { name: stat.name, icon: stat.icon, value: `${value > 0 ? '+' : ''}${value}${stat.percent ? '%' : ''}${stat.key === 'manaPerSecond' ? '/秒' : ''}` };
  });
}

export function equipmentEffectText(item: EquipmentDisplayItem): string {
  return item.effectDescription ?? item.description ?? '携带后获得装备属性与效果。';
}
