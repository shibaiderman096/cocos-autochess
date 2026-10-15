import { Rng } from '../core/Rng';
import { BattleEvent, BattleResult, Side } from './types';
import { Unit } from './Unit';
import { dist, nextStep } from './Pathfinding';
import { hexNeighbors } from './HexMath';
import { ConfigManager, SkillConfigData, UnitConfigData, combatAttributes, hybridSpellDamage } from '../core/ConfigManager';

export const TICK_MS = 50;

export interface Placement {
  cfg: UnitConfigData;
  side: Side;
  x: number;
  y: number;
  /** 星级（M2）：影响数值倍率，默认 1 */
  star?: number;
  /** Wave stat multiplier, independent of star rank. */
  statMultiplier?: number;
  equipment?: string[];
  damageAmp?: number;
  damageReduction?: number;
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
  private pendingStuns: Array<{ src: Unit; dst: Unit; seconds: number }> = [];
  private pendingDamage: Array<{ src: Unit; dst: Unit; dmg: number; type: 'physical' | 'magic' | 'true'; critical: boolean; targeted: boolean }> = [];

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
      const star = Math.max(1, Math.min(3, Math.floor(p.star ?? 1)));
      const multiplier = p.statMultiplier ?? 1;
      const scaled = configs.equipmentStats(configs.scaleUnit(p.cfg, star, multiplier), p.equipment);
      Object.assign(scaled, combatAttributes({ ...scaled, damageAmp: scaled.damageAmp! + (p.damageAmp ?? 0), damageReduction: scaled.damageReduction! + (p.damageReduction ?? 0) }));
      const unit = new Unit(i + 1, p.side, scaled, p.x, p.y);
      unit.equipment = configs.getEquipment(p.equipment);
      unit.star = star;
      unit.attackSpeedCap = configs.battle.attackSpeedCap ?? 5;
      unit.skillScale = configs.battle.starScaling[star - 1].skill * multiplier;
      this.units.push(unit);
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
    if (this.checkEnd()) return;
    this.pendingDamage.length = 0;
    this.pendingStuns.length = 0;
    this.updateEquipment();
    this.updateBurns();
    for (const u of this.units) { // 按 id 升序遍历，确定性
      if (!u.alive) continue;
      this.updateUnit(u);
    }
    this.resolveDamage();
    this.resolveStuns();
    if (this.checkEnd()) return;
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
    if (this.tick < u.stunnedUntilTick) return;

    if (u.pendingCast) {
      const activeSkill = this.configs.getSkill(u.pendingCast.skillId);
      if (activeSkill.effect === 'healChannel' && this.tick >= u.pendingCast.nextHealTick!) {
        const heal = activeSkill.heal!;
        const amount = Math.min(u.cfg.hp - u.hp, Math.round(u.cfg.hp * heal.maxHpFractions[u.star - 1]));
        if (amount > 0) {
          u.hp += amount;
          this.events.push({ t: 'heal', tick: this.tick, id: u.id, source: u.id, amount, hp: u.hp });
        }
        u.pendingCast.nextHealTick! += Math.max(1, Math.round(heal.intervalSeconds * 1000 / this.configs.battle.tickMs));
      }
      if (--u.pendingCast.remainingTicks <= 0) {
        const skill = this.configs.getSkill(u.pendingCast.skillId);
        const targetId = u.pendingCast.targetId;
        u.pendingCast = null;
        if (skill.effect === 'healChannel') { u.atkCd = this.attackCooldown(u); return; }
        if (skill.effect === 'damageStun') {
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (victim) {
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            this.damage(u, victim, skill.power * skill.spellMultipliers![u.star - 1], skill.dmgType);
            this.pendingStuns.push({ src: u, dst: victim, seconds: skill.stunSeconds![u.star - 1] });
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'damageBurn') {
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (victim) this.applyBlackFlame(u, skill, victim);
          u.atkCd = this.attackCooldown(u);
          return;
        }
        const victim = this.teleportTarget(u, skill);
        if (victim) {
          const to = this.teleportCell(u, victim)!;
          const from = u.pos;
          u.x = to.x; u.y = to.y;
          u.priorityTarget = victim.id;
          this.events.push({ t: 'teleport', tick: this.tick, id: u.id, from, to });
        }
        u.empoweredAttacks = skill.empoweredAttacks ?? 3;
        u.permanentEmpower = skill.permanentEmpowerStar !== undefined && u.star >= skill.permanentEmpowerStar;
        u.attackSpeedBonus = skill.attackSpeedBonuses?.[u.star - 1] ?? 0;
        u.manaLocked = skill.manaLockDuringEmpower ?? false;
        u.attackMultiplier = skill.attackMultipliers![u.star - 1];
        u.atkCd = 0;
      }
      return;
    }

    const teleportSkill = u.cfg.skillId ? this.configs.getSkill(u.cfg.skillId) : null;
    if (teleportSkill?.effect === 'healChannel' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const duration = teleportSkill.castSeconds!;
      u.mana = 0;
      u.pendingCast = { skillId: teleportSkill.id,
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)),
        nextHealTick: this.tick + Math.max(1, Math.round(teleportSkill.heal!.intervalSeconds * 1000 / this.configs.battle.tickMs)) };
      this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: u.id, duration });
      return;
    }
    if (teleportSkill?.effect === 'teleportEmpower' && u.mana >= u.cfg.maxMana && u.cfg.maxMana > 0 && u.atkCd === 0) {
      const victim = this.teleportTarget(u, teleportSkill);
      if (victim) {
        u.mana = 0;
        u.attackSpeedBonus = teleportSkill.attackSpeedBonuses?.[u.star - 1] ?? 0;
        u.manaLocked = teleportSkill.manaLockDuringEmpower ?? false;
        u.pendingCast = { skillId: teleportSkill.id, remainingTicks: Math.max(1, Math.round((teleportSkill.castSeconds ?? 0.3) * 1000 / this.configs.battle.tickMs)) };
        this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: victim.id, duration: teleportSkill.castSeconds ?? 0.3 });
        return;
      }
    }

    const priority = this.units.find(e => e.id === u.priorityTarget && this.targetable(e) && e.side !== u.side && dist(u.pos, e.pos) <= u.cfg.range);
    const target = priority ?? this.nearestEnemy(u);
    if (!target) return;

    const d = dist(u.pos, target.pos);

    // 1. 蓝满施法（需在射程内）
    if (u.cfg.skillId && teleportSkill?.effect !== 'teleportEmpower' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0 && d <= u.cfg.range) {
      const skill = this.configs.getSkill(u.cfg.skillId);
      const castTarget = skill.targeting === 'lowestHp'
        ? this.units.filter(e => this.targetable(e) && e.side !== u.side && dist(u.pos, e.pos) <= u.cfg.range)
          .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)[0] : target;
      this.cast(u, skill, castTarget);
      return;
    }
    // 2. 射程内攻击
    if (d <= u.cfg.range) {
      if (u.atkCd === 0) {
        const empowered = u.permanentEmpower || u.empoweredAttacks > 0;
        this.events.push({ t: 'attack', tick: this.tick, id: u.id, target: target.id });
        if (u.equipment.some(item => item.attackSpeedPerAttack > 0)) u.equipmentAttackStacks++;
        const multiplier = empowered ? u.attackMultiplier : 1;
        this.damage(u, target, u.cfg.atk * multiplier, 'physical', true);
        if (u.cfg.maxMana > 0 && !u.manaLocked) u.mana = Math.min(u.cfg.maxMana, u.mana + u.cfg.manaPerHit);
        if (empowered && !u.permanentEmpower && --u.empoweredAttacks === 0) {
          u.priorityTarget = null;
          u.attackSpeedBonus = 0;
          u.manaLocked = false;
        }
        u.atkCd = this.attackCooldown(u);
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
    if (sk.effect === 'damageBurn' || sk.effect === 'damageStun') {
      const duration = sk.castSeconds ?? 0.5;
      u.pendingCast = { skillId: sk.id, targetId: mainTarget.id,
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
      this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id, duration });
      return;
    }
    u.atkCd = this.attackCooldown(u);
    this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id });
    if (sk.effect === 'hybridSpell') {
      this.damage(u, mainTarget, hybridSpellDamage(u.cfg, sk, u.star), sk.dmgType, false, true);
      return;
    }
    for (const e of this.units) {
      if (!e.alive || e.side === u.side) continue;
      if (e === mainTarget || (sk.radius > 0 && dist(e.pos, mainTarget.pos) <= sk.radius)) {
        this.damage(u, e, sk.power * u.skillScale, sk.dmgType, false, false, e === mainTarget);
      }
    }
  }

  private applyBlackFlame(src: Unit, skill: SkillConfigData, dst: Unit): void {
    this.damage(src, dst, src.cfg.atk * skill.attackMultipliers![src.star - 1], skill.dmgType);
    const burn = skill.burn!;
    const intervalTicks = Math.max(1, Math.round(burn.intervalSeconds * 1000 / this.configs.battle.tickMs));
    // Reapplication by the same caster refreshes the burn; separate casters are independent.
    dst.burns = dst.burns.filter(b => b.sourceId !== src.id || b.skillId !== skill.id);
    dst.burns.push({ sourceId: src.id, skillId: skill.id, intervalTicks,
      nextTick: this.tick + intervalTicks, remainingPulses: Math.floor(burn.durationSeconds / burn.intervalSeconds),
      rawDamage: dst.cfg.hp * burn.maxHpFraction, dmgType: burn.dmgType });
    this.events.push({ t: 'burn', tick: this.tick, id: dst.id, source: src.id, duration: burn.durationSeconds });
  }

  private resolveStuns(): void {
    for (const { src, dst, seconds } of this.pendingStuns) {
      if (!this.targetable(dst)) continue;
      const ticks = Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs));
      dst.stunnedUntilTick = Math.max(dst.stunnedUntilTick, this.tick + ticks + 1);
      dst.pendingCast = null;
      if (!dst.permanentEmpower && dst.empoweredAttacks === 0) {
        dst.attackSpeedBonus = 0;
        dst.manaLocked = false;
      }
      this.events.push({ t: 'stun', tick: this.tick, id: dst.id, source: src.id, duration: seconds });
    }
  }

  private attackCooldown(u: Unit): number {
    return Math.max(1, Math.ceil(1000 / this.configs.battle.tickMs / u.attackSpeedCap),
      Math.round(1000 / this.configs.battle.tickMs / u.attackSpeed));
  }

  private updateBurns(): void {
    for (const dst of this.units) {
      if (!dst.alive) { dst.burns.length = 0; continue; }
      for (const burn of dst.burns) {
        if (this.tick < burn.nextTick) continue;
        const src = this.units.find(u => u.id === burn.sourceId)!;
        // Applied burns persist after caster death; only skill-crit enables crits, never attack mana.
        this.damage(src, dst, burn.rawDamage, burn.dmgType, false, false, false);
        burn.remainingPulses--;
        burn.nextTick += burn.intervalTicks;
      }
      dst.burns = dst.burns.filter(b => b.remainingPulses > 0);
    }
  }

  private teleportCell(u: Unit, target: Unit) {
    return hexNeighbors(target.x, target.y)
      .filter(p => p.x >= 0 && p.y >= 0 && p.x < this.w && p.y < this.h
        && ((p.x === u.x && p.y === u.y) || !this.occupied(p.x, p.y)))
      .sort((a, b) => dist(u.pos, a) - dist(u.pos, b) || a.y - b.y || a.x - b.x)[0];
  }

  private teleportTarget(u: Unit, skill: SkillConfigData): Unit | undefined {
    return this.units.filter(e => this.targetable(e) && e.side !== u.side && dist(u.pos, e.pos) <= (skill.targetRange ?? 3))
      .sort((a, b) => a.hp - b.hp || a.id - b.id)
      .find(e => !!this.teleportCell(u, e));
  }

  /** 伤害公式：物理 dmg = atk * 100 / (100 + armor)，魔法走 mr，真实伤害无视抗性，最低 1 */
  private damage(src: Unit, dst: Unit, raw: number, type: 'physical' | 'magic' | 'true', basicAttack = false, typeBonusApplied = false, targeted = true) {
    const critical = (basicAttack || src.cfg.skillCanCrit === true) && src.cfg.critChance! > 0 && this.rng.next() < src.cfg.critChance!;
    const configuredCrit = this.configs.battle.criticalMultiplier ?? 1.5;
    const critMultiplier = critical ? (Number.isFinite(configuredCrit) && configuredCrit >= 1 ? configuredCrit : 1.5) : 1;
    const res = type === 'physical' ? dst.cfg.armor : type === 'magic' ? dst.cfg.mr : 0;
    const typeMultiplier = typeBonusApplied ? 1 : 1 + (type === 'physical' ? src.cfg.physicalPower! : type === 'magic' ? src.cfg.spellPower! : 0) / 100;
    const dmg = dst.cfg.damageReduction! >= 1 ? 0 : Math.max(1, Math.round(raw * typeMultiplier * critMultiplier * (1 + src.cfg.damageAmp!)
      * (1 - dst.cfg.damageReduction!) * 100 / (100 + res)));
    this.pendingDamage.push({ src, dst, dmg, type, critical, targeted });
  }

  /** Every unit alive at tick start can act; deaths are applied after all damage. */
  private resolveDamage(): void {
    const healing = new Map<Unit, number>();
    for (const { src, dst, dmg, type, critical, targeted } of this.pendingDamage) {
      if (targeted && !this.targetable(dst)) continue;
      const absorbed = Math.min(dst.shield, dmg);
      dst.shield -= absorbed;
      const previousHp = dst.hp;
      dst.hp = Math.max(0, dst.hp - (dmg - absorbed));
      // Trigger between hits so the lethal hit leaves 1 HP and later targeted hits miss.
      const triggered = this.triggerLowHealthProtection(dst);
      const dealt = Math.max(0, previousHp - dst.hp);
      healing.set(src, (healing.get(src) ?? 0) + dealt * src.cfg.lifesteal!);
      this.events.push({ t: 'hit', tick: this.tick, id: dst.id, source: src.id, actualDamage: dealt, dmg, hp: dst.hp, dmgType: type, ...(critical ? { critical: true } : {}) });
      if (triggered) this.events.push({ t: 'equipment_trigger', tick: this.tick, id: dst.id, equipmentId: triggered, shield: dst.shield });
    }
    for (const [src, value] of healing) {
      if (src.hp <= 0) continue; // Lifesteal cannot revive a unit killed in this tick.
      const amount = Math.min(src.cfg.hp - src.hp, Math.round(value));
      if (amount <= 0) continue;
      src.hp += amount;
      this.events.push({ t: 'heal', tick: this.tick, id: src.id, source: src.id, amount, hp: src.hp });
    }
    for (const u of this.units) {
      if (u.alive && u.hp === 0) {
        u.alive = false;
        u.shield = 0;
        u.equipmentRegen = null;
        this.events.push({ t: 'death', tick: this.tick, id: u.id });
      }
    }
  }

  /** 最近敌人；平手取 id 小者（遍历有序保证确定性） */
  private nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (!this.targetable(e) || e.side === u.side) continue;
      const d = dist(u.pos, e.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private occupied(x: number, y: number): boolean {
    return this.units.some(o => o.alive && o.x === x && o.y === y);
  }

  private targetable(u: Unit): boolean {
    return u.alive && this.tick >= u.untargetableUntilTick;
  }

  private triggerLowHealthProtection(u: Unit): string | null {
    if (!u.alive || u.lowHealthProtectionUsed) return null;
    const item = u.equipment.find(e => e.lowHealthProtection && u.hp < u.cfg.hp * e.lowHealthProtection.threshold);
    if (!item) return null;
    const effect = item.lowHealthProtection!;
    u.lowHealthProtectionUsed = true;
    u.hp = Math.max(1, u.hp);
    u.untargetableUntilTick = this.tick + Math.max(1, Math.round(effect.untargetableSeconds * 1000 / this.configs.battle.tickMs));
    u.shield += Math.round(u.cfg.hp * effect.shieldMaxHpFraction);
    u.equipmentRegen = { startTick: this.tick,
      durationTicks: Math.max(1, Math.round(effect.healSeconds * 1000 / this.configs.battle.tickMs)),
      total: Math.round(u.cfg.hp * effect.healMaxHpFraction), delivered: 0 };
    return item.id;
  }

  private updateEquipment(): void {
    for (const u of this.units) {
      if (!u.alive) continue;
      const triggered = this.triggerLowHealthProtection(u);
      if (triggered) this.events.push({ t: 'equipment_trigger', tick: this.tick, id: u.id, equipmentId: triggered, shield: u.shield });
      const regen = u.equipmentRegen;
      if (!regen) continue;
      const elapsed = Math.min(regen.durationTicks, this.tick - regen.startTick);
      // Cumulative rounding preserves the exact total even when each tick heals <1 HP.
      const delivered = Math.floor(regen.total * elapsed / regen.durationTicks);
      const amount = Math.min(u.cfg.hp - u.hp, delivered - regen.delivered);
      regen.delivered = delivered;
      if (amount > 0) {
        u.hp += amount;
        this.events.push({ t: 'heal', tick: this.tick, id: u.id, source: u.id, amount, hp: u.hp });
      }
      if (elapsed >= regen.durationTicks) u.equipmentRegen = null;
    }
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
