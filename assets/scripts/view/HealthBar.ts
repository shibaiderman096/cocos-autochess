export interface HealthBarSegments { health: number; shield: number; }

/** Append shields to health, sharing the bar when their sum exceeds maximum HP. */
export function healthBarSegments(hp: number, maxHp: number, shield = 0): HealthBarSegments {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return { health: 0, shield: 0 };
  const health = Number.isFinite(hp) ? Math.max(0, Math.min(maxHp, hp)) : 0;
  const protection = Number.isFinite(shield) ? Math.max(0, shield) : 0;
  const capacity = Math.max(maxHp, health + protection);
  return { health: health / capacity, shield: protection / capacity };
}
