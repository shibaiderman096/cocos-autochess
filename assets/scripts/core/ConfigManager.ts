/**
 * 配置读取（M1：units.json / skills.json / battle 基础配置）。
 * 逻辑层不 import cc：由调用方（view 或 Node 模拟器）把 JSON 喂进来。
 */
export interface UnitConfigData {
  id: string;
  name: string;
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
  artId?: 'warrior' | 'archer' | 'mage';
  role?: 'frontline' | 'ranged' | 'caster';
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
}

export interface BattleConfigData {
  boardWidth: number;
  boardHeight: number;
  ownRows: number;       // 己方可摆的行数（从下往上）
  maxTicks: number;      // 超时 tick
  tickMs: number;        // 每 tick 毫秒
  starScaling: Array<{ hp: number; atk: number; skill: number }>;
  initialHealth: number;
  lossPerEnemy: number;
}

export class ConfigManager {
  private units: Record<string, UnitConfigData> = {};
  private skills: Record<string, SkillConfigData> = {};
  battle: BattleConfigData = {
    boardWidth: 7, boardHeight: 8, ownRows: 4,
    maxTicks: 1200,
    tickMs: 50,
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

  setBattle(data: Partial<BattleConfigData>): void {
    Object.assign(this.battle, data);
  }

  getUnit(id: string): UnitConfigData {
    const u = this.units[id];
    if (!u) throw new Error(`unit config not found: ${id}`);
    return u;
  }

  allUnits(): UnitConfigData[] { return Object.values(this.units); }

  scaleUnit(cfg: UnitConfigData, star = 1, multiplier = 1): UnitConfigData {
    const scale = this.battle.starScaling[Math.max(0, Math.min(2, Math.floor(star) - 1))];
    return { ...cfg, hp: Math.round(cfg.hp * scale.hp * multiplier),
      atk: Math.round(cfg.atk * scale.atk * multiplier),
      armor: Math.round(cfg.armor * multiplier), mr: Math.round(cfg.mr * multiplier) };
  }

  getSkill(id: string): SkillConfigData {
    const s = this.skills[id];
    if (!s) throw new Error(`skill config not found: ${id}`);
    return s;
  }
}
