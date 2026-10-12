import { Rng } from '../core/Rng';
import { BattleEvent, BattleResult, Side } from './types';
import { Unit } from './Unit';
import { dist, nextStep } from './Pathfinding';
import { ConfigManager, SkillConfigData, UnitConfigData } from '../core/ConfigManager';

export const TICK_MS = 50;

export interface Placement {
  cfg: UnitConfigData;
  side: Side;
  x: number;
  y: number;
  /** 星级（M2）：影响数值倍率，默认 1 */
  star?: number;
}

export interface BattleOptions {
  seed?: number;
  w?: number;
  h?: number;
  maxTicks?: number; // 默认 1200 = 60s
}

export class BattleSim {
  units: Unit[] = [];
  events: BattleEvent[] = [];
  tick = 0;
  finished = false;
  winner: Side | -1 = -1;
  private rng: Rng;
  private started = false;

  constructor(
    private configs: ConfigManager,
    placements: Placement[],
    private opts: BattleOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 1);
    const w = opts.w ?? configs.battle.boardWidth;
    const h = opts.h ?? configs.battle.boardHeight;
    placements.forEach((p, i) => {
      if (p.x < 0 || p.y < 0 || p.x >= w || p.y >= h) {
        throw new Error(`placement out of bounds: (${p.x}, ${p.y})`);
      }
      let effCfg = p.cfg;
      if (p.star && p.star > 1) {
        const mult = Math.pow(1.8, p.star - 1);
        effCfg = {
          ...p.cfg,
          hp: Math.round(p.cfg.hp * mult),
          atk: Math.round(p.cfg.atk * mult),
        };
      }
      this.units.push(new Unit(i + 1, p.side, effCfg, p.x, p.y));
    });
  }

  get w(): number { return this.opts.w ?? this.configs.battle.boardWidth; }
  get h(): number { return this.opts.h ?? this.configs.battle.boardHeight; }
  get maxTicks(): number { return this.opts.maxTicks ?? this.configs.battle.maxTicks; }

  /** 布阵完成，正式开战 */
  start(): void {
    if (this.started || this.finished) return;
    this.started = true;
    this.events.push({ t: 'battle_start', tick: 0 });
  }

  /** 推进一个 tick；未 start 时自动 start */
  step(): void {
    if (this.finished) return;
    if (!this.started) this.start();
    this.tick++;
    for (const u of this.units) { // 按 id 升序遍历，确定性
      if (!u.alive) continue;
      this.updateUnit(u);
      if (this.checkEnd()) return;
    }
    if (this.tick >= this.maxTicks) this.end(-1);
  }

  /** 跑完整个战斗，返回结果 */
  run(): BattleResult {
    while (!this.finished) this.step();
    return this.getResult();
  }

  getResult(): BattleResult {
    return {
      winner: this.winner,
      ticks: this.tick,
      events: this.events,
      survivors: this.units.filter(u => u.alive).map(u => u.id),
    };
  }

  private updateUnit(u: Unit) {
    if (u.atkCd > 0) u.atkCd--;
    if (u.moveCd > 0) u.moveCd--;

    const target = this.nearestEnemy(u);
    if (!target) return;

    const d = dist(u.pos, target.pos);

    // 1. 蓝满施法（需在射程内）
    if (u.cfg.skillId && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0 && d <= u.cfg.range) {
      this.cast(u, this.configs.getSkill(u.cfg.skillId), target);
      return;
    }
    // 2. 射程内攻击
    if (d <= u.cfg.range) {
      if (u.atkCd === 0) {
        u.atkCd = Math.max(1, Math.round(1000 / TICK_MS / u.cfg.atkSpeed));
        this.events.push({ t: 'attack', tick: this.tick, id: u.id, target: target.id });
        this.damage(u, target, u.cfg.atk, 'physical');
        if (u.cfg.maxMana > 0) u.mana = Math.min(u.cfg.maxMana, u.mana + u.cfg.manaPerHit);
      }
      return;
    }
    // 3. 射程外移动（BFS 绕开占位）
    if (u.moveCd === 0) {
      const step = nextStep(
        u.pos, this.w, this.h,
        (x, y) => this.occupied(x, y),
        (x, y) => dist({ x, y }, target.pos) <= u.cfg.range,
      );
      if (step) {
        const from = { x: u.x, y: u.y };
        u.x = step.x;
        u.y = step.y;
        u.moveCd = u.cfg.moveTicks;
        this.events.push({ t: 'move', tick: this.tick, id: u.id, from, to: { ...step } });
      }
    }
  }

  private cast(u: Unit, sk: SkillConfigData, mainTarget: Unit) {
    u.mana = 0;
    u.atkCd = Math.max(1, Math.round(1000 / TICK_MS / u.cfg.atkSpeed));
    this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id });
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      if (e === mainTarget || (sk.radius > 0 && dist(e.pos, mainTarget.pos) <= sk.radius)) {
        this.damage(u, e, sk.power, sk.dmgType);
      }
    }
  }

  /** 伤害公式：物理 dmg = atk * 100 / (100 + armor)，魔法走 mr，真实伤害无视抗性，最低 1 */
  private damage(src: Unit, dst: Unit, raw: number, type: 'physical' | 'magic' | 'true') {
    void src;
    const res = type === 'physical' ? dst.cfg.armor : type === 'magic' ? dst.cfg.mr : 0;
    const dmg = Math.max(1, Math.round(raw * 100 / (100 + res)));
    dst.hp = Math.max(0, dst.hp - dmg);
    this.events.push({ t: 'hit', tick: this.tick, id: dst.id, dmg, hp: dst.hp, dmgType: type });
    if (dst.hp === 0) {
      dst.alive = false;
      this.events.push({ t: 'death', tick: this.tick, id: dst.id });
    }
  }

  /** 最近敌人；平手取 id 小者（遍历有序保证确定性） */
  private nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      const d = dist(u.pos, e.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private occupied(x: number, y: number): boolean {
    return this.units.some(o => o.alive && o.x === x && o.y === y);
  }

  private checkEnd(): boolean {
    const ownAlive = this.units.some(u => u.alive && u.side === 0);
    const enemyAlive = this.units.some(u => u.alive && u.side === 1);
    if (ownAlive && enemyAlive) return false;
    this.end(ownAlive ? 0 : enemyAlive ? 1 : -1);
    return true;
  }

  private end(w: Side | -1) {
    this.finished = true;
    this.winner = w;
    this.events.push({ t: 'end', tick: this.tick, winner: w });
  }
}
