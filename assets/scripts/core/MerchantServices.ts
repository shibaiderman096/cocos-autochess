import type { EquipmentConfigData } from '../battle/types';
import type { ConfigManager } from './ConfigManager';

export const FORGE_GAINS = { hp: 80, physicalPower: 8, spellPower: 8, armor: 8, mr: 8, attackSpeedBonus: .1 } as const;
export type ForgeStat = keyof typeof FORGE_GAINS;
export interface ForgedEquipment { baseId: string; upgrades: ForgeStat[]; spentGold: number; }
export interface DiceBet { id: number; waveId: number; stake: number; picks: number[]; face: number; settled: boolean; }
export interface MerchantServicesState { nextUid: number; forgeRoll: number; diceRoll: number; forged: Record<string, ForgedEquipment>; dice?: DiceBet; }
export const freshMerchantServices = (): MerchantServicesState => ({ nextUid: 1, forgeRoll: 0, diceRoll: 0, forged: {} });
export const FORGE_PRICE = 3;
export const FORGE_ATTACK_SPEED_CAP = 5;
export const RADIANT_FORGE_PRICE = 18;
export const forgePrice = (_level: number, radiant = false): number => radiant ? RADIANT_FORGE_PRICE : FORGE_PRICE;
export const validDicePicks = (picks: unknown): picks is number[] => Array.isArray(picks) && picks.length >= 1 && picks.length <= 3
  && new Set(picks).size === picks.length && picks.every(n => Number.isInteger(n) && n >= 1 && n <= 6);
export const diceMultiplier = (count: number): number => count >= 1 && count <= 3 ? 6 / count : 0;
export const dicePayout = (bet: DiceBet): number => bet.picks.includes(bet.face) ? bet.stake * diceMultiplier(bet.picks.length) : 0;
export function forgeCandidates(item: EquipmentConfigData, level: number): ForgeStat[] {
  return (Object.keys(FORGE_GAINS) as ForgeStat[]).filter(key =>
    (key !== 'attackSpeedBonus' || (item[key] ?? 0) < FORGE_ATTACK_SPEED_CAP)
    && (level < 2 ? !(item[key] ?? 0) : (item[key] ?? 0) > 0));
}
export function forgedItem(cfg: ConfigManager, id: string, record: ForgedEquipment): EquipmentConfigData {
  const base = cfg.allEquipment().find(e => e.id === record.baseId);
  if (!base || !base.id.startsWith('basic_') || base.consumable || base.traitChoice) throw new Error('Invalid forged base equipment');
  const level = record.upgrades.length;
  const spent = record.spentGold, price = (base.shopPrice ?? 3) + spent;
  if (!level || !Number.isSafeInteger(spent) || spent<1 || !Number.isSafeInteger(price)) throw new Error('Invalid forge level');
  const item: EquipmentConfigData = { ...base, id, name: `${base.name} +${level}`, shopPrice: price,
    quality: Math.min(5, (base.quality ?? 1) + level) as EquipmentConfigData['quality'] };
  record.upgrades.forEach((key, index) => {
    if (!(key in FORGE_GAINS) || !forgeCandidates(item, index).includes(key)) throw new Error('Invalid forged stat');
    item[key] = Math.round(((item[key] ?? 0) + FORGE_GAINS[key]) * 1e8) / 1e8;
    if(key==='attackSpeedBonus')item[key]=Math.min(FORGE_ATTACK_SPEED_CAP,item[key]);
    if (!Number.isFinite(item[key])) throw new Error('Invalid forged value');
  });
  item.effectDescription = [base.effectDescription, `铁匠强化 +${level} · 累计投入 ${spent} 金币`].filter(Boolean).join('\n');
  return item;
}
/** Rebuild only run-owned instances. Authored catalogue and enemy generation stay unchanged. */
export function restoreMerchantServices(cfg: ConfigManager, state: MerchantServicesState): void {
  if (!state || ![state.nextUid, state.forgeRoll, state.diceRoll].every(n => Number.isSafeInteger(n) && n >= 0)
    || state.nextUid < 1 || !state.forged || typeof state.forged !== 'object' || Array.isArray(state.forged)) throw new Error('Invalid merchant save');
  const items = Object.entries(state.forged).map(([id, record]) => {
    if (!/^forged_[1-9]\d*$/.test(id) || Number(id.slice(7)) >= state.nextUid || !record || !Array.isArray(record.upgrades)) throw new Error('Invalid forged inventory');
    const item=forgedItem(cfg, id, record);
    return item;
  });
  const bet = state.dice;
  if (bet && (![bet.id, bet.waveId].every(n => Number.isSafeInteger(n) && n > 0) || bet.id !== state.diceRoll
    || ![1,5,10].includes(bet.stake) || !validDicePicks(bet.picks) || !Number.isInteger(bet.face) || bet.face < 1 || bet.face > 6
    || typeof bet.settled !== 'boolean')) throw new Error('Invalid saved dice bet');
  cfg.setRunEquipment(items);
}
