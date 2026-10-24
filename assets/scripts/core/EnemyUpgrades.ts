import type { UnitConfigData } from './ConfigManager';
import type { WaveConfig } from './RoundFlow';
import type { EquipmentPolicyConfig, EnemyEquipmentFit } from './EquipmentPolicyTypes';
import type { EnemyRoleConfig, FormationRole } from './EnemyFormationTypes';
import { resolveEnemyRole } from './EnemyRoles';
import { unlockedEquipment } from './EquipmentPolicy';
import { RunRandomContext } from './RunRandomContext';
import { MAX_EQUIPMENT } from '../battle/types';

export function enemyEquipmentFits(unit: UnitConfigData, role: FormationRole, fit: EnemyEquipmentFit): boolean {
  return fit.enabled && fit.roles.includes(role) && (!fit.damageTypes || fit.damageTypes.includes(unit.damageType))
    && (!fit.requiresMana || (unit.maxMana > 0 && !!unit.skillId));
}

/** Spend bonus gold after the base army is selected, so equipment never replaces units or stars. */
export function applyEnemyUpgrades(wave: WaveConfig, policy: EquipmentPolicyConfig, roster: UnitConfigData[], random: RunRandomContext, roles?: EnemyRoleConfig): WaveConfig {
  const economy = policy.enemy.equipmentEconomy, tags = policy.enemy.itemTags;
  const kind = wave.encounterKind ?? wave.waveKind;
  if (wave.enemyUpgrade || !economy || !tags || wave.stage! < economy.startStage
    || (kind !== 'elite' && kind !== 'boss' && !(kind === 'normal' && economy.normal)) || !wave.enemies.length) return wave;
  const rule = kind === 'elite' || kind === 'boss' ? economy[kind] : undefined;
  const gold = economy.normal ? economy.normal.initialGold+(wave.stage!-economy.startStage)*economy.normal.goldPerStage
    +(rule ? rule.initialGold+wave.stage!*rule.goldPerStage : 0)
    : Math.min(rule!.maxGold!,rule!.initialGold+(wave.stage!-economy.startStage)*rule!.goldPerStage);
  const healthMultiplier=rule?.healthMultiplier??1;
  const enemies = wave.enemies.map(e => ({ ...e, equipment: [...(e.equipment ?? [])], healthMultiplier }));
  const rng = random.stream('enemy', wave.id, 7101);
  const ids = unlockedEquipment(policy, wave.stage!, policy.enemy.tierUnlock).filter(id => tags[id]?.enabled);
  const price = (id: string) => tags[id].goldCost ?? economy.itemCost;
  const carriers = enemies.map((enemy, index) => {
    const unit = roster.find(u => u.id === enemy.unitId);
    if (!unit) throw new Error('Unknown enemy equipment carrier: ' + enemy.unitId);
    const role = resolveEnemyRole(unit, {}, roles ?? { version: 'equipment-fallback', units: {} }).role;
    return { index, ids: ids.filter(id => enemyEquipmentFits(unit, role, tags[id])) };
  });
  let remaining = gold;
  const bought: string[] = [];
  while (remaining > 0) {
    const available = carriers.map(c => ({ ...c, ids: c.ids.filter(id => price(id) <= remaining) }))
      .filter(c => c.ids.length && enemies[c.index].equipment.length < MAX_EQUIPMENT);
    if (!available.length) break;
    // Spread first items across the army, then fill legal three-slot loadouts. Tie RNG is isolated per wave.
    const fewest = Math.min(...available.map(c => enemies[c.index].equipment.length));
    const preferred = available.filter(c => enemies[c.index].equipment.length === fewest);
    const carrier = preferred[rng.int(0, preferred.length - 1)], equipped = enemies[carrier.index].equipment;
    const distinct = carrier.ids.filter(id => !equipped.includes(id)), pool = distinct.length ? distinct : carrier.ids;
    const item = pool[rng.int(0, pool.length - 1)];
    equipped.push(item); bought.push(item); remaining -= price(item);
  }
  return { ...wave, enemies, enemyUpgrade: { goldBudget: gold, goldSpent: gold - remaining, goldRemaining: remaining,
    itemCount: bought.length, equipmentIds: bought, healthMultiplier } };
}
