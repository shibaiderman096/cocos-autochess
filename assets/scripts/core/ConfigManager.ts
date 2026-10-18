/**
 * 配置读取（M1：units.json / skills.json / battle 基础配置）。
 * 逻辑层不 import cc：由调用方（view 或 Node 模拟器）把 JSON 喂进来。
 */
import { CombatAttributes, EquipmentConfigData, MAX_EQUIPMENT, TraitConfigData, BattleOvertimeConfig } from '../battle/types';

export function combatAttributes(cfg: Partial<CombatAttributes>): CombatAttributes {
  const safe = (v: number | undefined, fallback: number, max: number) => Number.isFinite(v) ? Math.max(0, Math.min(max, v!)) : fallback;
  return { physicalPower: safe(cfg.physicalPower, 0, 1000000), spellPower: safe(cfg.spellPower, 0, 1000000), critChance: safe(cfg.critChance, 0.25, 1),
    lifesteal: safe(cfg.lifesteal, 0, 1), damageAmp: safe(cfg.damageAmp, 0, 100), damageReduction: safe(cfg.damageReduction, 0, 1) };
}

export interface UnitConfigData extends Partial<CombatAttributes> {
  id: string;
  name: string;
  /** Strong PvE monsters keep authored attributes instead of the ordinary monster template. */
  monsterTier?: 'normal' | 'strong';
  /** Creature lore and combat behavior shown in the unit detail panel. */
  description?: string;
  /** 费用档位 1~5，默认 1 */
  cost?: number;
  hp: number;
  atk: number;
  armor: number;
  mr: number;
  atkSpeed: number;      // 次/秒
  range: number;         // 攻击距离（格，hex 距离）
  moveTicks: number;     // 移动一格所需 tick
  maxMana: number;
  startMana: number;
  manaPerHit: number;
  skillId?: string;
  /** Enables crit rolls for all skill damage, including damage-over-time pulses. */
  skillCanCrit?: boolean;
  /** Presentation resource id; independent of unit role and combat behavior. */
  artId?: string;
  basicAttackFx?: 'arrow' | 'fireball' | 'ninjaBolt';
  basicAttackTint?: [number, number, number];
  damageType?: 'physical' | 'magic';
  role?: 'warrior' | 'marksman' | 'frontline' | 'ranged' | 'caster' | 'assassin' | 'fighter' | 'tank' | 'magicTank' | 'magicArcher' | 'physicalCaster' | 'physicalArcher' | 'support';
  tint?: string;
}

export interface SkillConfigData {
  id: string;
  dmgType: 'physical' | 'magic' | 'true';
  name?: string;
  description?: string;
  /** Presentation-only rows; current values are resolved from live combat attributes. */
  statRows?: Array<{ label: string; value: string; stars: string }>;
  /** Internal rules, excluded from the player-facing description. */
  mechanics?: string[];
  power: number;
  radius: number;        // 0 = 单体
  targeting: 'nearest' | 'lowestHp';
  effect?: 'teleportEmpower' | 'damageBurn' | 'healChannel' | 'hybridSpell' | 'damageStun' | 'knockupGuard' | 'selfShield' | 'splitPhysical' | 'delayedDamage' | 'delayedArea' | 'healAlly' | 'susanoo';
  formDurations?: number[];
  formReductions?: number[];
  formBonusDamage?: number[];
  healAmounts?: number[];
  /** Configured skill damage by star; never derived from attack or armor. */
  starDamage?: number[];
  /** Total pre-mitigation damage by star, divided among enemies in the target radius. */
  splitDamage?: number[];
  /** Base shield by star, multiplied by 1 + spellPower / 100. */
  shieldAmounts?: number[];
  knockupSeconds?: number;
  guard?: { durations: number[]; reductions: number[] };
  spellMultipliers?: number[];
  stunSeconds?: number[];
  hybrid?: { physicalDamage: number[]; magicDamage: number[] };
  heal?: { intervalSeconds: number; maxHpFractions: number[]; bonusAmounts?: number[] };
  castSeconds?: number;
  targetRange?: number;
  empoweredAttacks?: number;
  /** Absolute attacks/second by star; +50% means +0.5, not base × 1.5. */
  attackSpeedBonuses?: number[];
  manaLockDuringEmpower?: boolean;
  permanentEmpowerStar?: number;
  burn?: { durationSeconds: number; intervalSeconds: number; maxHpFraction: number; dmgType: 'physical' | 'magic' | 'true' };
}

/** Channel healing keeps its HP fraction unscaled; only the fixed bonus uses spell power. */
export function channelHealAmount(unit: Pick<UnitConfigData, 'hp' | 'spellPower'>, skill: SkillConfigData, star: number): number {
  const rank = Math.max(0, Math.min(2, star - 1)), heal = skill.heal!;
  return Math.round(unit.hp * heal.maxHpFractions[rank] + (heal.bonusAmounts?.[rank] ?? 0) * (1 + (unit.spellPower ?? 0) / 100));
}

/** Attack is reserved for ordinary basic attacks; skills use configured values. */
export function configuredSkillDamage(skill: SkillConfigData, star: number, skillScale = 1): number {
  const rank = Math.max(0, Math.min(2, star - 1));
  return skill.starDamage?.[rank] ?? skill.splitDamage?.[rank] ?? skill.power * (skill.spellMultipliers?.[rank] ?? skillScale);
}

/** Fixed component values each receive only their corresponding percentage bonus. */
export function hybridSpellDamage(unit: UnitConfigData, skill: SkillConfigData, star: number): number {
  const rank = Math.max(0, Math.min(2, star - 1));
  return skill.hybrid!.physicalDamage[rank] * (1 + (unit.physicalPower ?? 0) / 100)
    + skill.hybrid!.magicDamage[rank] * (1 + (unit.spellPower ?? 0) / 100);
}

export interface BattleConfigData {
  traits?: TraitConfigData[];
  boardWidth: number;
  boardHeight: number;
  ownRows: number;       // 己方可摆的行数（从下往上）
  maxTicks: number;      // 超时 tick
  tickMs: number;        // 每 tick 毫秒
  combatSeconds?: number;
  overtime?: BattleOvertimeConfig;
  preparationSeconds?: number;
  nextWaveDelaySeconds?: number;
  criticalMultiplier?: number;
  attackSpeedCap?: number;
  legendaryThreeStarBonusHp?: number;
  roleMana?: { casterPerSecond: number; damageTakenFraction: number };
  starScaling: Array<{ hp: number; atk: number; skill: number }>;
  initialHealth: number;
  lossPerEnemy: number;
}

export class ConfigManager {
  private units: Record<string, UnitConfigData> = {};
  private enemies: Record<string, UnitConfigData> = {};
  private skills: Record<string, SkillConfigData> = {};
  private equipment: Record<string, EquipmentConfigData> = {};
  allEquipment(): EquipmentConfigData[] { return Object.values(this.equipment); }
  setEquipment(data: EquipmentConfigData[]): void {
    this.equipment = Object.fromEntries(data.map(item => [item.id, { ...item }]));
  }
  getEquipment(ids: string[] = []): EquipmentConfigData[] {
    if (ids.length > MAX_EQUIPMENT) throw new Error('装备最多3件');
    return ids.map(id => { const item = this.equipment[id]; if (!item) throw new Error(`未知装备: ${id}`); return item; });
  }
  getEquipmentReserve(ids: string[]): EquipmentConfigData[] {
    return ids.map(id => this.equipment[id]).filter(Boolean);
  }
  equipmentStats(cfg: UnitConfigData, ids: string[] = []): UnitConfigData {
    const items = this.getEquipment(ids);
    const armor = cfg.armor + items.reduce((sum, item) => sum + (item.armor ?? 0), 0);
    const spellPower = (cfg.spellPower ?? 0) + items.reduce((sum, item) => sum + item.spellPower, 0);
    const damageAmp = (cfg.damageAmp ?? 0) + items.reduce((sum, item) => {
      const effect = item.spellPowerDamageAmp;
      return sum + (effect ? Math.min(effect.cap, Math.floor(spellPower / effect.step) * effect.bonus) : 0);
    }, 0);
    const damageReduction = Math.min(1, (cfg.damageReduction ?? 0) + items.reduce((sum, item) => {
      const effect = item.armorDamageReduction;
      return sum + (effect && armor > effect.threshold ? effect.bonus : 0);
    }, 0));
    return { ...cfg,
      hp: Math.round((cfg.hp + items.reduce((sum, item) => sum + (item.hp ?? 0), 0))
        * (1 + items.reduce((sum, item) => sum + (item.maxHpBonus ?? 0), 0))),
      armor,
      mr: cfg.mr + items.reduce((sum, item) => sum + (item.mr ?? 0), 0),
      physicalPower: (cfg.physicalPower ?? 0) + items.reduce((sum, item) => sum + (item.physicalPower ?? 0), 0),
      critChance: Math.min(1, combatAttributes(cfg).critChance + items.reduce((sum, item) => sum + (item.critChance ?? 0), 0)),
      skillCanCrit: cfg.skillCanCrit === true || items.some(item => item.skillCanCrit),
      lifesteal: Math.min(1, (cfg.lifesteal ?? 0) + items.reduce((sum, item) => sum + (item.lifesteal ?? 0), 0)),
      damageAmp, damageReduction, spellPower };
  }
  battle: BattleConfigData = {
    boardWidth: 7, boardHeight: 8, ownRows: 4,
    maxTicks: 900,
    tickMs: 50,
    combatSeconds: 30,
    overtime: { seconds: 15, attackSpeedBonus: 1, damageAmp: 1 },
    preparationSeconds: 1,
    criticalMultiplier: 1.5,
    attackSpeedCap: 5,
    legendaryThreeStarBonusHp: 5000,
    roleMana: { casterPerSecond: 2, damageTakenFraction: 0.1 },
    starScaling: [{ hp: 1, atk: 1, skill: 1 }, { hp: 1.8, atk: 1.8, skill: 1.8 }, { hp: 3.24, atk: 3.24, skill: 3.24 }],
    initialHealth: 20,
    lossPerEnemy: 2,
  };

  setUnits(data: UnitConfigData[]): void {
    this.units = {};
    for (const u of data) this.units[u.id] = u;
  }

  setSkills(data: Record<string, SkillConfigData>): void {
    this.skills = data;
  }

  /** PvE monsters never enter the purchasable roster or shared card pool. */
  setEnemyUnits(data: UnitConfigData[]): void {
    this.enemies = {};
    for (const unit of data) this.enemies[unit.id] = unit;
  }

  setBattle(data: Partial<BattleConfigData>): void {
    if (data.combatSeconds !== undefined && (!Number.isFinite(data.combatSeconds) || data.combatSeconds <= 0)) throw new Error('Invalid combat duration');
    if (data.overtime && (!Number.isFinite(data.overtime.seconds) || data.overtime.seconds <= 0
      || !Number.isFinite(data.overtime.attackSpeedBonus) || data.overtime.attackSpeedBonus < 0
      || !Number.isFinite(data.overtime.damageAmp) || data.overtime.damageAmp < 0)) throw new Error('Invalid overtime configuration');
    if (data.traits) {
      const ids = new Set<string>();
      for (const trait of data.traits) {
        if (!trait.id || ids.has(trait.id) || (!trait.members.length && !trait.selector) || !trait.breakpoints.length) throw new Error('Invalid trait configuration');
        if (trait.selector && (!['tank', 'marksman', 'assassin'].includes(trait.selector.role)
          || (trait.selector.damageType !== undefined && !['physical', 'magic'].includes(trait.selector.damageType)))) throw new Error('Invalid trait selector');
        ids.add(trait.id);
        let previous = 0;
        for (const tier of trait.breakpoints) {
          if (!Number.isInteger(tier.count) || tier.count <= previous || !['bronze', 'silver', 'gold', 'prismatic'].includes(tier.tier)
            || (tier.power === undefined && !tier.formation && !tier.stats)
            || !Number.isFinite(tier.power ?? 0) || (tier.power ?? 0) < 0 || !Number.isFinite(tier.regenPerSecond ?? 0)
            || (tier.regenPerSecond ?? 0) < 0 || (tier.regenPerSecond ?? 0) > 1) throw new Error('Invalid trait breakpoint');
          if (tier.formation) {
            const bonus = tier.formation;
            if (![bonus.maxHpBonus, bonus.damageReduction, bonus.attackSpeedBonus, bonus.damageAmp].every(value => Number.isFinite(value) && value >= 0)
              || bonus.damageReduction > 1) throw new Error('Invalid trait formation bonus');
          }
          if (tier.stats) {
            const bonus = tier.stats;
            for (const key of ['armor', 'mr', 'maxHpBonus', 'attackSpeedBonus', 'physicalPower', 'attackDamage', 'critChance', 'executeThreshold'] as const) {
              const value = bonus[key];
              if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error('Invalid trait stat bonus');
            }
            if ((bonus.critChance ?? 0) > 1 || (bonus.executeThreshold ?? 0) >= 1
              || (bonus.skillCanCrit !== undefined && typeof bonus.skillCanCrit !== 'boolean')) throw new Error('Invalid trait stat bonus');
          }
          previous = tier.count;
        }
      }
    }
    if (data.roleMana && (!Number.isFinite(data.roleMana.casterPerSecond) || data.roleMana.casterPerSecond < 0
      || !Number.isFinite(data.roleMana.damageTakenFraction) || data.roleMana.damageTakenFraction < 0 || data.roleMana.damageTakenFraction > 1)) throw new Error('Invalid role mana configuration');
    Object.assign(this.battle, data);
  }

  getUnit(id: string): UnitConfigData {
    const u = this.units[id] ?? this.enemies[id];
    if (!u) throw new Error(`unit config not found: ${id}`);
    return u;
  }

  allUnits(): UnitConfigData[] { return Object.values(this.units); }

  scaleUnit(cfg: UnitConfigData, star = 1, multiplier = 1): UnitConfigData {
    const scale = this.battle.starScaling[Math.max(0, Math.min(2, Math.floor(star) - 1))];
    const bonusHp = cfg.cost === 5 && Math.floor(star) >= 3 ? (this.battle.legendaryThreeStarBonusHp ?? 5000) : 0;
    return { ...cfg, ...combatAttributes(cfg), hp: Math.round(cfg.hp * scale.hp * multiplier) + bonusHp,
      atkSpeed: Math.min(this.battle.attackSpeedCap ?? 5, cfg.atkSpeed),
      atk: Math.round(cfg.atk * scale.atk * multiplier),
      armor: Math.round(cfg.armor * multiplier), mr: Math.round(cfg.mr * multiplier) };
  }

  getSkill(id: string): SkillConfigData {
    const s = this.skills[id];
    if (!s) throw new Error(`skill config not found: ${id}`);
    return s;
  }
}
