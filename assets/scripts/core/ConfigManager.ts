/**
 * 配置读取（M1：units.json / skills.json / battle 基础配置）。
 * 逻辑层不 import cc：由调用方（view 或 Node 模拟器）把 JSON 喂进来。
 */
import { CombatAttributes, EquipmentConfigData, MAX_EQUIPMENT, TraitConfigData, BattleOvertimeConfig, ShadowSkillData, SunlightSkillData } from '../battle/types';

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
  basicAttackFx?: 'arrow' | 'fireball';
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
  effect?: 'teleportEmpower' | 'damageBurn' | 'healChannel' | 'hybridSpell' | 'damageStun' | 'knockupGuard' | 'selfShield' | 'splitPhysical' | 'delayedDamage' | 'delayedArea' | 'healAlly' | 'susanoo' | 'shadow' | 'sunlight';
  sunlight?: SunlightSkillData;
  shadow?: ShadowSkillData;
  /** Defaults to the unit's damage identity; true/fixed shields receive no power multiplier. */
  shieldScaling?: 'physical' | 'magic' | 'fixed';
  formDurations?: number[];
  formReductions?: number[];
  formBonusDamage?: number[];
  healAmounts?: number[];
  /** Configured skill damage by star; never derived from attack or armor. */
  starDamage?: number[];
  /** Total pre-mitigation damage by star, divided among enemies in the target radius. */
  splitDamage?: number[];
  /** Base shield by star; dmgType selects physicalPower or spellPower scaling. */
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

export function configuredShieldAmount(unit: UnitConfigData, skill: SkillConfigData, star: number, amounts = skill.shieldAmounts): number {
  const scaling = skill.shieldScaling ?? unit.damageType ?? (skill.dmgType === 'physical' ? 'physical' : 'magic');
  const power = scaling === 'physical' ? unit.physicalPower ?? 0 : scaling === 'magic' ? unit.spellPower ?? 0 : 0;
  return Math.round((amounts?.[Math.max(0, Math.min(2, star - 1))] ?? 0) * (1 + power / 100));
}

function validateShadowSkill(skill: SkillConfigData): void {
  const bad = () => { throw new Error(`Invalid shadow skill configuration: ${skill.id}`); };
  const triple = (values?: number[], integer = false) => {
    if (!Array.isArray(values) || values.length !== 3 || values.some(value => !Number.isFinite(value) || value < 0 || (integer && (!Number.isInteger(value) || value < 1)))) bad();
  };
  const positive = (value: number) => { if (!Number.isFinite(value) || value <= 0) bad(); };
  const fraction = (value: number) => { if (!Number.isFinite(value) || value < 0 || value > 1) bad(); };
  if (!skill.shadow || !Number.isFinite(skill.radius) || skill.radius < 0 || !Number.isFinite(skill.castSeconds ?? 0) || (skill.castSeconds ?? 0) < 0) bad();
  const spec = skill.shadow!;
  if (spec.kind !== 'domain') triple(skill.starDamage);
  switch (spec.kind) {
    case 'bulwark': triple(skill.shieldAmounts); triple(spec.resistanceBonuses); positive(spec.durationSeconds); break;
    case 'piercing': triple(spec.secondaryDamage); break;
    case 'domain':
      triple(skill.shieldAmounts); triple(spec.allyShieldAmounts); triple(spec.slowAmounts); spec.slowAmounts.forEach(fraction);
      positive(spec.durationSeconds); if (!Number.isInteger(spec.allyCount) || spec.allyCount < 0) bad(); break;
    case 'flurry':
      positive(spec.intervalSeconds); positive(spec.refundWindowSeconds); if (!Number.isInteger(spec.hits) || spec.hits < 1 || !Number.isFinite(spec.refundMana) || spec.refundMana < 0) bad(); break;
    case 'cleave': positive(spec.coneDegrees); if (spec.coneDegrees > 360) bad(); fraction(spec.missingHpBonusCap); break;
    case 'empower':
      triple(skill.attackSpeedBonuses); triple(spec.burstDamage); positive(spec.durationSeconds); if (!Number.isInteger(spec.attacks) || spec.attacks < 1) bad(); break;
    case 'execute': fraction(spec.healthThreshold); positive(spec.damageMultiplier); break;
    case 'lanterns':
      if (!Number.isInteger(spec.count) || spec.count < 1) bad(); positive(spec.intervalSeconds); fraction(spec.repeatMultiplier); triple(spec.fearSeconds); break;
    case 'blackstars':
      triple(spec.counts, true); positive(spec.intervalSeconds); fraction(spec.repeatMultiplier); triple(spec.collapseDamage); if (!Number.isFinite(spec.collapseRadius) || spec.collapseRadius < 0) bad(); break;
    case 'void': triple(spec.counts, true); positive(spec.intervalSeconds); triple(spec.markDamage); break;
    default: bad();
  }
}

function validateSunlightSkill(skill: SkillConfigData): void {
  const bad = () => { throw new Error(`Invalid sunlight skill: ${skill.id}`); };
  const triple = (values?: number[]) => { if (!values || values.length !== 3 || values.some(v => !Number.isFinite(v) || v < 0)) bad(); };
  const positive = (v: number) => { if (!Number.isFinite(v) || v <= 0) bad(); };
  const spec = skill.sunlight;
  if (!spec || !Number.isFinite(skill.radius) || skill.radius < 0 || !Number.isFinite(skill.castSeconds ?? 0) || (skill.castSeconds ?? 0) < 0) bad();
  const s = spec!;
  if (!['bastion', 'prayer'].includes(s.kind)) triple(skill.starDamage);
  switch (s.kind) {
    case 'bulwark': triple(skill.shieldAmounts); positive(s.durationSeconds); break;
    case 'arrows': triple(s.finalDamage); positive(s.intervalSeconds); positive(s.pierceMultiplier); if (s.pierceMultiplier > 1) bad(); break;
    case 'bastion': triple(skill.shieldAmounts); triple(s.allyShields); triple(s.heals); positive(s.durationSeconds); if (!Number.isInteger(s.allyCount) || s.allyCount < 1) bad(); break;
    case 'hunt': triple(skill.attackSpeedBonuses); positive(s.intervalSeconds); positive(s.speedSeconds); if (!Number.isInteger(s.hits) || s.hits < 1 || !Number.isFinite(s.shieldBonus) || s.shieldBonus < 0) bad(); break;
    case 'cleave': triple(skill.shieldAmounts); positive(s.coneDegrees); positive(s.guardSeconds); if (s.coneDegrees > 360 || !Number.isInteger(s.shieldTargetCap) || s.shieldTargetCap < 1 || !Number.isInteger(s.guardTargetCount) || s.guardTargetCount < 1 || !Number.isFinite(s.guardReduction) || s.guardReduction < 0 || s.guardReduction > 1) bad(); break;
    case 'empower': triple(skill.attackSpeedBonuses); triple(s.burstDamage); positive(s.durationSeconds); if (!Number.isInteger(s.attacks) || s.attacks < 1) bad(); break;
    case 'crossbow': positive(s.penetration); positive(s.minimum); if (s.penetration > 1 || s.minimum > 1) bad(); break;
    case 'prayer': triple(skill.shieldAmounts); triple(s.heals); triple(skill.starDamage); triple(skill.stunSeconds); positive(s.durationSeconds); break;
    case 'judgment': triple(s.counts); triple(s.trueDamage); triple(skill.stunSeconds); positive(s.delaySeconds); if (s.counts.some(v => !Number.isInteger(v) || v < 1) || !Number.isInteger(s.allEnemiesStar) || s.allEnemiesStar < 1 || s.allEnemiesStar > 3) bad(); break;
    case 'transit': triple(s.counts); triple(s.finalDamage); positive(s.intervalSeconds); if (s.counts.some(v => !Number.isInteger(v) || v < 1) || s.finalDamage.some((v, i) => v <= skill.starDamage![i])) bad(); break;
    default: bad();
  }
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
    for (const skill of Object.values(data)) {
      if (skill.shieldScaling !== undefined && !['physical', 'magic', 'fixed'].includes(skill.shieldScaling)) throw new Error('Invalid shield scaling');
      if (skill.effect === 'shadow') validateShadowSkill(skill);
      if (skill.effect === 'sunlight') validateSunlightSkill(skill);
    }
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
        if (!trait.id || ids.has(trait.id) || (!trait.members.length && !trait.selector && trait.pendingMembers !== true) || !trait.breakpoints.length
          || (trait.pendingMembers !== undefined && typeof trait.pendingMembers !== 'boolean')) throw new Error('Invalid trait configuration');
        if (trait.selector && (!['tank', 'marksman', 'assassin'].includes(trait.selector.role)
          || (trait.selector.damageType !== undefined && !['physical', 'magic'].includes(trait.selector.damageType)))) throw new Error('Invalid trait selector');
        ids.add(trait.id);
        let previous = 0;
        for (const tier of trait.breakpoints) {
          if (!Number.isInteger(tier.count) || tier.count <= previous || !['bronze', 'silver', 'gold', 'prismatic'].includes(tier.tier)
            || (tier.power === undefined && !tier.formation && !tier.stats && !tier.shadow && !tier.sunlight)
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
          if (tier.shadow) {
            const effect = tier.shadow;
            if (!Number.isFinite(effect.resistanceReduction) || effect.resistanceReduction < 0 || effect.resistanceReduction > 1
              || !Number.isFinite(effect.damageAmpLossPerSecond ?? 0) || (effect.damageAmpLossPerSecond ?? 0) < 0
              || !Number.isFinite(effect.damageAmpLossCap ?? 0) || (effect.damageAmpLossCap ?? 0) < 0 || (effect.damageAmpLossCap ?? 0) > 1
              || ((effect.damageAmpLossPerSecond ?? 0) > 0 && !(effect.damageAmpLossCap! > 0))) throw new Error('Invalid shadow trait effect');
            const board = effect.board;
            if (board && (!Number.isFinite(board.intervalSeconds) || board.intervalSeconds <= 0
              || !Number.isFinite(board.damageIntervalSeconds ?? board.intervalSeconds) || (board.damageIntervalSeconds ?? board.intervalSeconds) <= 0
              || ![board.attackSpeedPerPulse, board.attackSpeedCap, board.fixedDamage].every(value => Number.isFinite(value) && value >= 0))) throw new Error('Invalid shadow board effect');
          }
          if (tier.sunlight) {
            const s = tier.sunlight, f = s.formation, j = s.judgment;
            const nonnegative = (v: number) => Number.isFinite(v) && v >= 0;
            if (!nonnegative(s.shieldMaxHpFraction) || (s.battlefield !== undefined && typeof s.battlefield !== 'boolean')
              || (f && (![f.delaySeconds, f.frontReduction, f.backAmp].every(nonnegative) || f.frontReduction > 1))
              || (j && (![j.damage, j.stunSeconds].every(nonnegative) || !Number.isFinite(j.intervalSeconds) || j.intervalSeconds <= 0
                || !nonnegative(j.targetMaxHpFraction ?? 0) || (j.targetMaxHpFraction ?? 0) > 1
                || (j.independentStatistics !== undefined && typeof j.independentStatistics !== 'boolean')))) throw new Error('Invalid sunlight trait');
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
