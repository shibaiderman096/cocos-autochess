/**
 * 配置读取（M1：units.json / skills.json / battle 基础配置）。
 * 逻辑层不 import cc：由调用方（view 或 Node 模拟器）把 JSON 喂进来。
 */
import { CombatAttributes, EquipmentConfigData, MAX_EQUIPMENT } from '../battle/types';

export function combatAttributes(cfg: Partial<CombatAttributes>): CombatAttributes {
  const safe = (v: number | undefined, fallback: number, max: number) => Number.isFinite(v) ? Math.max(0, Math.min(max, v!)) : fallback;
  return { physicalPower: safe(cfg.physicalPower, 0, 1000000), spellPower: safe(cfg.spellPower, 0, 1000000), critChance: safe(cfg.critChance, 0.25, 1),
    lifesteal: safe(cfg.lifesteal, 0, 1), damageAmp: safe(cfg.damageAmp, 0, 100), damageReduction: safe(cfg.damageReduction, 0, 1) };
}

export interface UnitConfigData extends Partial<CombatAttributes> {
  id: string;
  name: string;
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
  role?: 'frontline' | 'ranged' | 'caster' | 'assassin' | 'fighter' | 'tank' | 'magicArcher';
  tint?: string;
}

export interface SkillConfigData {
  id: string;
  dmgType: 'physical' | 'magic' | 'true';
  name?: string;
  description?: string;
  power: number;
  radius: number;        // 0 = 单体
  targeting: 'nearest' | 'lowestHp';
  effect?: 'teleportEmpower' | 'damageBurn' | 'healChannel' | 'hybridSpell' | 'damageStun';
  spellMultipliers?: number[];
  stunSeconds?: number[];
  hybrid?: { attackRatios: number[]; spellRatios: number[] };
  heal?: { intervalSeconds: number; maxHpFractions: number[] };
  castSeconds?: number;
  targetRange?: number;
  empoweredAttacks?: number;
  attackMultipliers?: number[];
  /** Absolute attacks/second by star; +50% means +0.5, not base × 1.5. */
  attackSpeedBonuses?: number[];
  manaLockDuringEmpower?: boolean;
  permanentEmpowerStar?: number;
  burn?: { durationSeconds: number; intervalSeconds: number; maxHpFraction: number; dmgType: 'physical' | 'magic' | 'true' };
}

/** Each component receives only its corresponding percentage bonus. */
export function hybridSpellDamage(unit: UnitConfigData, skill: SkillConfigData, star: number): number {
  const rank = Math.max(0, Math.min(2, star - 1));
  return unit.atk * skill.hybrid!.attackRatios[rank] * (1 + (unit.physicalPower ?? 0) / 100)
    + skill.power * skill.hybrid!.spellRatios[rank] * (1 + (unit.spellPower ?? 0) / 100);
}

export interface BattleConfigData {
  boardWidth: number;
  boardHeight: number;
  ownRows: number;       // 己方可摆的行数（从下往上）
  maxTicks: number;      // 超时 tick
  tickMs: number;        // 每 tick 毫秒
  preparationSeconds?: number;
  nextWaveDelaySeconds?: number;
  criticalMultiplier?: number;
  attackSpeedCap?: number;
  legendaryThreeStarBonusHp?: number;
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
    return { ...cfg,
      hp: cfg.hp + items.reduce((sum, item) => sum + (item.hp ?? 0), 0),
      armor: cfg.armor + items.reduce((sum, item) => sum + (item.armor ?? 0), 0),
      mr: cfg.mr + items.reduce((sum, item) => sum + (item.mr ?? 0), 0),
      physicalPower: (cfg.physicalPower ?? 0) + items.reduce((sum, item) => sum + (item.physicalPower ?? 0), 0),
      critChance: Math.min(1, combatAttributes(cfg).critChance + items.reduce((sum, item) => sum + (item.critChance ?? 0), 0)),
      skillCanCrit: cfg.skillCanCrit === true || items.some(item => item.skillCanCrit),
      spellPower: (cfg.spellPower ?? 0) + items.reduce((sum, item) => sum + item.spellPower, 0) };
  }
  battle: BattleConfigData = {
    boardWidth: 7, boardHeight: 8, ownRows: 4,
    maxTicks: 1200,
    tickMs: 50,
    preparationSeconds: 1,
    criticalMultiplier: 1.5,
    attackSpeedCap: 5,
    legendaryThreeStarBonusHp: 5000,
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
