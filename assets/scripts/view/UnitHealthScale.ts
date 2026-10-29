/** Diminishing visual growth: +100% maximum health -> 1.5x; +300% -> 2x. */
export function maxHealthArtworkScale(role: string | undefined, baseMaxHp: number, maxHp: number): number {
  if (!['tank','magicTank','frontline'].includes(role ?? '') || !Number.isFinite(baseMaxHp)
    || baseMaxHp <= 0 || !Number.isFinite(maxHp) || maxHp <= baseMaxHp) return 1;
  return 1 + Math.log2(maxHp / baseMaxHp) * .5;
}
