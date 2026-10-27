import type { EquipmentConfigData } from '../battle/types';

export type EquipmentQuality = 1 | 2 | 3 | 4 | 5;
export const EQUIPMENT_QUALITY_NAMES = ['普通','精良','稀有','史诗','传说'] as const;
export const QUALITY_COLORS: ReadonlyArray<[number,number,number]> = [[163,177,169],[89,203,176],[86,167,226],[181,127,230],[204,174,109]];
/** Old catalogues still render their existing component/ordinary/special grouping. */
export function equipmentQuality(item:Partial<EquipmentConfigData>):EquipmentQuality {
  return item.quality??(item.id?.startsWith('basic_')?1:item.consumable?.kind==='copyUnit'?item.consumable.maxCost===1?1:item.consumable.maxCost===3?3:4:item.specialShopOnly?5:2);
}
export function equipmentQualityName(item:Partial<EquipmentConfigData>):string{return EQUIPMENT_QUALITY_NAMES[equipmentQuality(item)-1];}
