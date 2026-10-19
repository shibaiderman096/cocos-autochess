import { Rng } from '../core/Rng';
import { BattleEvent, BattleResult, Side, BattleClockState, ShadowTraitEffect } from './types';
import { Unit } from './Unit';
import { ShadowSkills } from './ShadowSkills';
import { SunlightCombat } from './SunlightCombat';
import { resolveTraits, isTraitFrontRow } from './Traits';
import { dist, nextStep } from './Pathfinding';
import { hexNeighbors } from './HexMath';
import { ConfigManager, SkillConfigData, UnitConfigData, combatAttributes, hybridSpellDamage, configuredSkillDamage, channelHealAmount, configuredShieldAmount } from '../core/ConfigManager';

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
  maxTicks?: number; // Optional shorter diagnostic limit; configured combat + overtime is a hard cap.
}

export class BattleSim {
  units: Unit[] = [];
  events: BattleEvent[] = [];
  tick = 0;
  finished = false;
  winner: Side | -1 = -1;
  private rng: Rng;
  private started = false;
  private shadowBoards: Array<{ side: Side; effect: NonNullable<ShadowTraitEffect['board']>; source: Unit }> = [];
  private shadowSkills: ShadowSkills;
  private sunlight: SunlightCombat;
  private pendingStuns: Array<{ src: Unit; dst: Unit; seconds: number; knockup?: boolean; fearOrigin?: { x: number; y: number } }> = [];
  private pendingDamage: Array<{ src: Unit; dst: Unit; raw: number; damageAmp: number; resistance: number; reduction: number;
    type: 'physical' | 'magic' | 'true'; critical: boolean; targeted: boolean; basicAttack?: boolean; fixed?: boolean; shadowBoardSide?: Side; sunlightJudgmentSide?: Side; skillId?: string }> = [];

  constructor(
    private configs: ConfigManager,
    placements: Placement[],
    private opts: BattleOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 1);
    this.sunlight = new SunlightCombat({ units: this.units, events: this.events, now: () => this.tick, width: () => this.w, height: () => this.h,
      targetable: u => this.targetable(u), damage: (src, dst, raw, type, skillId) => this.damage(src, dst, raw, type, false, false, true, skillId),
      fixedDamage: (src, dst, raw, sunlightJudgmentSide) => this.pendingDamage.push({ src, dst, raw, type: 'true', damageAmp: 0, resistance: 0, reduction: 0, critical: false, targeted: true, fixed: true, sunlightJudgmentSide }),
      stun: (src, dst, seconds) => this.pendingStuns.push({ src, dst, seconds }), randomIndex: length => Math.floor(this.rng.next() * length),
      cooldown: u => this.attackCooldown(u) }, configs);
    this.shadowSkills = new ShadowSkills({ units: this.units, events: this.events, now: () => this.tick,
      width: () => this.w, height: () => this.h, targetable: unit => this.targetable(unit),
      damage: (source, target, raw, type) => this.damage(source, target, raw, type),
      fear: (src, dst, seconds, fearOrigin) => this.pendingStuns.push({ src, dst, seconds, fearOrigin }),
      cooldown: unit => this.attackCooldown(unit) }, configs);
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
      unit.manaPerSecond = unit.cfg.role === 'caster' ? configs.battle.roleMana?.casterPerSecond ?? 0 : 0;
      unit.skillScale = configs.battle.starScaling[star - 1].skill * multiplier;
      this.units.push(unit);
    });
    for (const side of [0, 1] as Side[]) {
      const army = this.units.filter(unit => unit.side === side);
      const traits = resolveTraits(configs.battle.traits ?? [], army.map(unit => unit.cfg.id), [...configs.allUnits(), ...army.map(unit => unit.cfg)]);
      for (const trait of traits) {
        const board = trait.active?.shadow?.board;
        const source = army.find(unit => trait.memberIds.includes(unit.cfg.id));
        if (board && source) this.shadowBoards.push({ side, effect: board, source });
        if (trait.active?.sunlight) this.sunlight.register(side, army.filter(unit => trait.memberIds.includes(unit.cfg.id)), trait.active.sunlight);
      }
      for (const unit of army) for (const trait of traits) {
        if (!trait.active || !trait.memberIds.includes(unit.cfg.id)) continue;
        unit.cfg.physicalPower = (unit.cfg.physicalPower ?? 0) + (trait.active.power ?? 0);
        unit.cfg.spellPower = (unit.cfg.spellPower ?? 0) + (trait.active.power ?? 0);
        unit.traitRegenPerSecond += trait.active.regenPerSecond ?? 0;
        if (trait.active.shadow) unit.shadowAttack = trait.active.shadow;
        const stats = trait.active.stats;
        if (stats) {
          const previousArmor = unit.cfg.armor;
          unit.cfg.armor += stats.armor ?? 0;
          unit.cfg.mr += stats.mr ?? 0;
          const armorReduction = unit.equipment.reduce((sum, item) => {
            const effect = item.armorDamageReduction;
            return sum + (effect && previousArmor <= effect.threshold && unit.cfg.armor > effect.threshold ? effect.bonus : 0);
          }, 0);
          unit.cfg.damageReduction = Math.min(1, (unit.cfg.damageReduction ?? 0) + armorReduction);
          if (stats.maxHpBonus) { unit.cfg.hp = Math.round(unit.cfg.hp * (1 + stats.maxHpBonus)); unit.hp = unit.cfg.hp; }
          unit.cfg.atkSpeed = Math.min(unit.attackSpeedCap, unit.cfg.atkSpeed + (stats.attackSpeedBonus ?? 0));
          unit.cfg.physicalPower = (unit.cfg.physicalPower ?? 0) + (stats.physicalPower ?? 0);
          unit.cfg.critChance = Math.min(1, (unit.cfg.critChance ?? 0) + (stats.critChance ?? 0));
          unit.cfg.skillCanCrit = unit.cfg.skillCanCrit === true || stats.skillCanCrit === true;
          unit.traitAttackDamage += stats.attackDamage ?? 0;
          unit.traitExecuteThreshold = Math.max(unit.traitExecuteThreshold, stats.executeThreshold ?? 0);
        }
        const bonus = trait.active.formation;
        if (bonus) {
          if (isTraitFrontRow(side, unit.y, h, configs.battle.ownRows)) {
            unit.cfg.hp = Math.round(unit.cfg.hp * (1 + bonus.maxHpBonus));
            unit.hp = unit.cfg.hp;
            unit.cfg.damageReduction = Math.min(1, (unit.cfg.damageReduction ?? 0) + bonus.damageReduction);
          } else {
            unit.cfg.atkSpeed = Math.min(unit.attackSpeedCap, unit.cfg.atkSpeed + bonus.attackSpeedBonus);
            unit.cfg.damageAmp = (unit.cfg.damageAmp ?? 0) + bonus.damageAmp;
          }
        }
      }
    }
  }

  get w(): number { return this.opts.w ?? this.configs.battle.boardWidth; }
  get h(): number { return this.opts.h ?? this.configs.battle.boardHeight; }
  private get combatTicks(): number { return Math.max(1, Math.round((this.configs.battle.combatSeconds ?? 30) * 1000 / this.configs.battle.tickMs)); }
  private get overtimeTicks(): number { return Math.max(1, Math.round((this.configs.battle.overtime?.seconds ?? 15) * 1000 / this.configs.battle.tickMs)); }
  get maxTicks(): number { return Math.min(this.opts.maxTicks ?? this.configs.battle.maxTicks, this.combatTicks + this.overtimeTicks); }
  get clockState(): BattleClockState {
    const overtime = this.tick >= this.combatTicks;
    const endTick = Math.min(this.maxTicks, overtime ? this.combatTicks + this.overtimeTicks : this.combatTicks);
    return { phase: overtime ? 'overtime' : 'combat',
      remainingSeconds: Math.max(0, endTick - this.tick) * this.configs.battle.tickMs / 1000,
      durationSeconds: (overtime ? this.overtimeTicks : this.combatTicks) * this.configs.battle.tickMs / 1000,
      overtimeProgress: Math.max(0, Math.min(1, (this.tick - this.combatTicks) / this.overtimeTicks)) };
  }

  /** 布阵完成，正式开战 */
  start(): void {
    if (this.started || this.finished) return;
    this.started = true;
    this.events.push({ t: 'battle_start', tick: 0 });
    this.sunlight.start();
    for (const board of this.shadowBoards) this.events.push({ t: 'shadow_board', tick: 0, side: board.side });
  }

  /** 推进一个 tick；未 start 时自动 start */
  step(): void {
    if (this.finished) return;
    if (!this.started) this.start();
    this.tick++;
    if (this.checkEnd()) return;
    this.pendingDamage.length = 0;
    this.pendingStuns.length = 0;
    this.updateOvertime();
    this.updateEquipment();
    this.updateTraitRegen();
    this.updateShadows();
    this.sunlight.update();
    this.shadowSkills.update();
    this.updateBurns();
    for (const u of this.units) { // 按 id 升序遍历，确定性
      if (!u.alive) continue;
      u.gainMana(u.manaPerSecond * this.configs.battle.tickMs / 1000);
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

  private updateOvertime(): void {
    const progress = Math.max(0, Math.min(1, (this.tick - this.combatTicks) / this.overtimeTicks));
    const overtime = this.configs.battle.overtime;
    for (const unit of this.units) {
      if (!unit.alive) continue;
      unit.overtimeAttackSpeedBonus = (overtime?.attackSpeedBonus ?? 1) * progress;
      unit.overtimeDamageAmp = (overtime?.damageAmp ?? 1) * progress;
    }
  }

  private updateTraitRegen(): void {
    const interval = Math.max(1, Math.round(1000 / this.configs.battle.tickMs));
    if (this.tick % interval !== 0) return;
    for (const unit of this.units) {
      if (!unit.alive || unit.traitRegenPerSecond <= 0) continue;
      const amount = Math.min(unit.cfg.hp - unit.hp, Math.round(unit.cfg.hp * unit.traitRegenPerSecond));
      if (amount <= 0) continue;
      unit.hp += amount;
      this.events.push({ t: 'heal', tick: this.tick, id: unit.id, source: unit.id, amount, hp: unit.hp });
    }
  }

  private applyShadow(src: Unit, dst: Unit): void {
    const effect = src.shadowAttack;
    if (!effect || dst.hp <= 0 || !dst.alive) return;
    if (!dst.shadowCorruption) {
      dst.shadowCorruption = { resistanceReduction: effect.resistanceReduction,
        damageAmpLossPerSecond: effect.damageAmpLossPerSecond ?? 0, damageAmpLossCap: effect.damageAmpLossCap ?? 0,
        damageAmpLoss: 0, nextTick: this.tick + Math.max(1, Math.round(1000 / this.configs.battle.tickMs)) };
      this.events.push({ t: 'shadow_mark', tick: this.tick, id: dst.id, source: src.id });
    } else {
      // Repeated hits never multiply the shred or postpone the next decay pulse.
      const mark = dst.shadowCorruption;
      mark.resistanceReduction = Math.max(mark.resistanceReduction, effect.resistanceReduction);
      mark.damageAmpLossPerSecond = Math.max(mark.damageAmpLossPerSecond, effect.damageAmpLossPerSecond ?? 0);
      mark.damageAmpLossCap = Math.max(mark.damageAmpLossCap, effect.damageAmpLossCap ?? 0);
    }
  }

  private updateShadows(): void {
    const second = Math.max(1, Math.round(1000 / this.configs.battle.tickMs));
    for (const unit of this.units) {
      const mark = unit.shadowCorruption;
      if (!unit.alive || !mark || this.tick < mark.nextTick) continue;
      mark.damageAmpLoss = Math.min(mark.damageAmpLossCap, mark.damageAmpLoss + mark.damageAmpLossPerSecond);
      mark.nextTick += second;
    }
    for (const { side, effect, source } of this.shadowBoards) {
      const interval = Math.max(1, Math.round(effect.intervalSeconds * 1000 / this.configs.battle.tickMs));
      const damageInterval = Math.max(1, Math.round((effect.damageIntervalSeconds ?? effect.intervalSeconds) * 1000 / this.configs.battle.tickMs));
      const speedPulse = this.tick > 0 && this.tick % interval === 0;
      const damagePulse = this.tick > 0 && this.tick % damageInterval === 0;
      if (!speedPulse && !damagePulse) continue;
      this.events.push({ t: 'shadow_pulse', tick: this.tick, side, damage: damagePulse, attackSpeed: speedPulse });
      for (const unit of this.units) {
        if (!unit.alive) continue;
        if (unit.side === side) {
          if (speedPulse) unit.shadowAttackSpeedBonus = Math.min(effect.attackSpeedCap, unit.shadowAttackSpeedBonus + effect.attackSpeedPerPulse);
        } else if (damagePulse && effect.fixedDamage > 0) this.pendingDamage.push({ src: source, dst: unit, raw: effect.fixedDamage,
          damageAmp: 0, resistance: 0, reduction: 0, type: 'true', critical: false, targeted: true, fixed: true, shadowBoardSide: side });
      }
    }
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
    if (this.tick < u.fearUntilTick) {
      if (u.moveCd === 0) {
        const step = hexNeighbors(u.x, u.y).filter(pos => pos.x >= 0 && pos.y >= 0 && pos.x < this.w && pos.y < this.h && !this.occupied(pos.x, pos.y)
          && dist(pos, u.fearOrigin) > dist(u.pos, u.fearOrigin))
          .sort((a, b) => dist(b, u.fearOrigin) - dist(a, u.fearOrigin) || a.y - b.y || a.x - b.x)[0];
        if (step) { const from = u.pos; u.x = step.x; u.y = step.y; u.moveCd = u.cfg.moveTicks;
          this.events.push({ t: 'move', tick: this.tick, id: u.id, from, to: u.pos }); }
      }
      return;
    }
    if (this.shadowSkills.busy(u) || this.sunlight.busy(u)) return;

    if (u.pendingCast) {
      const activeSkill = this.configs.getSkill(u.pendingCast.skillId);
      if (activeSkill.effect === 'healChannel' && this.tick >= u.pendingCast.nextHealTick!) {
        const heal = activeSkill.heal!;
        const amount = Math.min(u.cfg.hp - u.hp, channelHealAmount(u.cfg, activeSkill, u.star));
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
        if (skill.effect === 'sunlight') { this.sunlight.activate(u, skill, targetId); return; }
        if (skill.effect === 'shadow') {
          this.shadowSkills.activate(u, skill, targetId);
          return;
        }
        if (skill.effect === 'healAlly') {
          const ally = this.units.find(e => e.id === targetId && e.alive && e.side === u.side);
          if (ally) {
            const amount = Math.min(ally.cfg.hp - ally.hp, Math.round(skill.healAmounts![u.star - 1] * (1 + (u.cfg.spellPower ?? 0) / 100)));
            if (amount > 0) {
              ally.hp += amount;
              this.events.push({ t: 'heal', tick: this.tick, id: ally.id, source: u.id, amount, hp: ally.hp });
              this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: ally.id, skillId: skill.id });
            }
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'delayedArea') {
          const victim = this.units.find(e => e.id === targetId && e.alive && e.side !== u.side);
          if (victim) {
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            for (const enemy of this.units) {
              if (enemy.alive && enemy.side !== u.side && dist(enemy.pos, victim.pos) <= skill.radius)
                this.damage(u, enemy, skill.starDamage![u.star - 1], skill.dmgType, false, false, false);
            }
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'delayedDamage') {
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (victim) {
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            this.damage(u, victim, skill.starDamage![u.star - 1], skill.dmgType);
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'splitPhysical') {
          const victim = this.units.find(e => e.id === targetId && e.alive && e.side !== u.side);
          if (victim) {
            const targets = this.units.filter(e => e.alive && e.side !== u.side && dist(e.pos, victim.pos) <= skill.radius);
            const share = skill.splitDamage![u.star - 1] / targets.length;
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            for (const enemy of targets) this.damage(u, enemy, share, skill.dmgType, false, false, false);
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'selfShield') {
          const amount = configuredShieldAmount(u.cfg, skill, u.star);
          u.shield += amount;
          this.events.push({ t: 'shield', tick: this.tick, id: u.id, amount, shield: u.shield });
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'healChannel') { u.atkCd = this.attackCooldown(u); return; }
        if (skill.effect === 'knockupGuard') {
          const rank = u.star - 1;
          const guard = skill.guard!;
          u.guardReduction = guard.reductions[rank];
          u.guardUntilTick = this.tick + Math.max(1, Math.round(guard.durations[rank] * 1000 / this.configs.battle.tickMs));
          this.events.push({ t: 'guard', tick: this.tick, id: u.id, duration: guard.durations[rank], reduction: u.guardReduction });
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (victim) {
            this.damage(u, victim, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType);
            this.pendingStuns.push({ src: u, dst: victim, seconds: skill.knockupSeconds!, knockup: true });
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'damageStun') {
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (victim) {
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            this.damage(u, victim, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType);
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
        u.empoweredAttackDamage = configuredSkillDamage(skill, u.star, u.skillScale);
        u.atkCd = 0;
      }
      return;
    }

    const teleportSkill = u.cfg.skillId ? this.configs.getSkill(u.cfg.skillId) : null;
    if (teleportSkill?.effect === 'sunlight' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const target = this.sunlight.target(u, teleportSkill);
      if (target) {
        const duration = teleportSkill.castSeconds ?? 0;
        u.mana = 0;
        this.events.push({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: target.id, duration });
        if (duration > 0) u.pendingCast = { skillId: teleportSkill.id, targetId: target.id, remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
        else this.sunlight.activate(u, teleportSkill, target.id);
        return;
      }
    }
    if (teleportSkill?.effect === 'shadow' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const target = this.shadowSkills.target(u, teleportSkill);
      if (target) {
        const duration = teleportSkill.castSeconds ?? 0.5;
        const castTarget = ['bulwark','domain','empower'].includes(teleportSkill.shadow!.kind) ? u : target;
        u.mana = 0; u.pendingCast = { skillId: teleportSkill.id, targetId: castTarget.id, remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
        this.events.push({ t: 'cast', tick: this.tick, id: u.id, target: castTarget.id, skillId: teleportSkill.id, duration });
        return;
      }
    }
    if (teleportSkill?.effect === 'susanoo' && this.tick >= u.susanooUntilTick && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      u.mana = 0;
      u.susanooUntilTick = this.tick + Math.max(1, Math.round(teleportSkill.formDurations![u.star - 1]
        * (1 + (u.cfg.physicalPower ?? 0) / 100) * 1000 / this.configs.battle.tickMs));
      u.susanooReduction = teleportSkill.formReductions![u.star - 1];
      this.events.push({ t: 'cast', tick: this.tick, id: u.id, target: u.id, skillId: teleportSkill.id, duration: 0 });
      return;
    }
    if (teleportSkill?.effect === 'healAlly' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const ally = this.units.filter(e => e.alive && e.side === u.side && e.hp < e.cfg.hp && dist(u.pos, e.pos) <= (teleportSkill.targetRange ?? u.cfg.range))
        .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)[0];
      if (ally) { this.cast(u, teleportSkill, ally); return; }
    }
    if ((teleportSkill?.effect === 'healChannel' || teleportSkill?.effect === 'selfShield') && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const duration = teleportSkill.castSeconds!;
      u.mana = 0;
      u.pendingCast = { skillId: teleportSkill.id,
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)),
        nextHealTick: teleportSkill.heal ? this.tick + Math.max(1, Math.round(teleportSkill.heal.intervalSeconds * 1000 / this.configs.battle.tickMs)) : undefined };
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
    if (u.cfg.skillId && teleportSkill?.effect !== 'sunlight' && teleportSkill?.effect !== 'shadow' && teleportSkill?.effect !== 'susanoo' && teleportSkill?.effect !== 'teleportEmpower' && teleportSkill?.effect !== 'healAlly' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0 && d <= u.cfg.range) {
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
        this.events.push({ t: 'attack', tick: this.tick, id: u.id, target: target.id,
          ...(u.shadowAttack ? { shadow: true } : {}),
          ...(this.tick < u.susanooUntilTick ? { area: true } : {}) });
        if (u.equipment.some(item => item.attackSpeedPerAttack > 0)) u.equipmentAttackStacks++;
        const damage = empowered ? u.empoweredAttackDamage : u.cfg.atk;
        if (this.tick < u.susanooUntilTick) {
          for (const enemy of this.units) {
            if (enemy.alive && enemy.side !== u.side && dist(enemy.pos, target.pos) <= teleportSkill!.radius)
              this.damage(u, enemy, damage + (teleportSkill!.formBonusDamage?.[u.star - 1] ?? 0), 'physical', true, false, enemy === target);
          }
        } else this.damage(u, target, damage, 'physical', true);
        this.shadowSkills.onBasicAttack(u, target);
        this.sunlight.onBasicAttack(u, target);
        u.gainMana(u.cfg.manaPerHit);
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
    if (sk.effect === 'damageBurn' || sk.effect === 'damageStun' || sk.effect === 'knockupGuard' || sk.effect === 'splitPhysical' || sk.effect === 'delayedDamage' || sk.effect === 'delayedArea' || sk.effect === 'healAlly') {
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
        this.damage(u, e, configuredSkillDamage(sk, u.star, u.skillScale), sk.dmgType, false, false, e === mainTarget);
      }
    }
  }

  private applyBlackFlame(src: Unit, skill: SkillConfigData, dst: Unit): void {
    this.damage(src, dst, configuredSkillDamage(skill, src.star, src.skillScale), skill.dmgType);
    this.events.push({ t: 'skill_impact', tick: this.tick, id: src.id, target: dst.id, skillId: skill.id });
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
    for (const { src, dst, seconds, knockup, fearOrigin } of this.pendingStuns) {
      if (this.tick < dst.susanooUntilTick) continue;
      if (!this.targetable(dst)) continue;
      const ticks = Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs));
      if (fearOrigin) { dst.fearUntilTick = Math.max(dst.fearUntilTick, this.tick + ticks + 1); dst.fearOrigin = { ...fearOrigin }; }
      else dst.stunnedUntilTick = Math.max(dst.stunnedUntilTick, this.tick + ticks + 1);
      dst.pendingCast = null;
      this.shadowSkills.interrupt(dst);
      this.sunlight.interrupt(dst);
      if (!dst.permanentEmpower && dst.empoweredAttacks === 0) {
        dst.attackSpeedBonus = 0;
        dst.manaLocked = false;
      }
      this.events.push({ t: fearOrigin ? 'fear' : knockup ? 'knockup' : 'stun', tick: this.tick, id: dst.id, source: src.id, duration: seconds });
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
  private damage(src: Unit, dst: Unit, raw: number, type: 'physical' | 'magic' | 'true', basicAttack = false, typeBonusApplied = false, targeted = true, skillId?: string) {
    const critical = (basicAttack || src.cfg.skillCanCrit === true) && src.cfg.critChance! > 0 && this.rng.next() < src.cfg.critChance!;
    const configuredCrit = this.configs.battle.criticalMultiplier ?? 1.5;
    const critMultiplier = critical ? (Number.isFinite(configuredCrit) && configuredCrit >= 1 ? configuredCrit : 1.5) : 1;
    const queue = (amount: number, damageType: 'physical' | 'magic' | 'true', bonusApplied: boolean) => {
      const resistance = damageType === 'physical' ? dst.cfg.armor : damageType === 'magic' ? dst.cfg.mr : 0;
      const multiplier = bonusApplied ? 1 : 1 + (damageType === 'physical' ? src.cfg.physicalPower! : damageType === 'magic' ? src.cfg.spellPower! : 0) / 100;
      const reduction = Math.min(1, dst.cfg.damageReduction! + (damageType === 'magic'
        ? dst.equipment.reduce((sum, item) => sum + (item.magicDamageReduction ?? 0), 0) : 0));
      this.pendingDamage.push({ src, dst, raw: amount * multiplier * critMultiplier,
        damageAmp: src.damageAmp, resistance, reduction, type: damageType, critical, targeted, basicAttack, skillId });
    };
    const extra = basicAttack ? src.traitAttackDamage : 0;
    // Physical basics share one damage/crit roll. Replaced basics keep their extra physical component.
    if (extra > 0 && type === 'physical' && !typeBonusApplied) queue(raw + extra, type, false);
    else {
      queue(raw, type, typeBonusApplied);
      if (extra > 0) queue(extra, 'physical', false);
    }
  }

  /** Every unit alive at tick start can act; deaths are applied after all damage. */
  private resolveDamage(): void {
    const healing = new Map<Unit, number>();
    for (const { src, dst, raw, damageAmp, resistance, reduction, type, critical, targeted, basicAttack, fixed, shadowBoardSide, sunlightJudgmentSide, skillId } of this.pendingDamage) {
      if (targeted && !this.targetable(dst)) {
        this.sunlight.onHitResolved(src, dst, skillId, false);
        continue;
      }
      // Evaluate execute bonuses against HP immediately before each hit, including queued hits.
      const extraAmp = src.equipment.reduce((sum, item) => {
        const effect = item.lowTargetDamageAmp;
        return sum + (effect && dst.hp < dst.cfg.hp * effect.threshold ? effect.bonus : 0);
      }, 0);
      const effectiveReduction = Math.min(1, reduction + (this.tick < dst.guardUntilTick ? dst.guardReduction : 0)
        + (this.tick < dst.susanooUntilTick ? dst.susanooReduction : 0));
      const effectiveResistance = (resistance + (type === 'physical' ? dst.skillArmorBonus : type === 'magic' ? dst.skillMrBonus : 0))
        * (type === 'true' ? 1 : 1 - (dst.shadowCorruption?.resistanceReduction ?? 0));
      let dmg = fixed ? Math.round(raw) : effectiveReduction >= 1 ? 0 : Math.max(1, Math.round(raw * Math.max(0, 1 + damageAmp + extraAmp)
        * (1 - effectiveReduction) * 100 / (100 + effectiveResistance)));
      const absorbed = Math.min(dst.shield, dmg);
      dst.shield -= absorbed;
      const previousHp = dst.hp;
      dst.hp = Math.max(0, dst.hp - (dmg - absorbed));
      const executed = !fixed && this.targetable(dst) && dmg > 0 && dst.hp > 0 && src.traitExecuteThreshold > 0
        && dst.hp < dst.cfg.hp * src.traitExecuteThreshold;
      if (executed) { dmg += dst.hp; dst.hp = 0; }
      // Trigger between hits so the lethal hit leaves 1 HP and later targeted hits miss.
      const triggered = this.triggerLowHealthProtection(dst);
      const dealt = Math.max(0, previousHp - dst.hp);
      if (dst.cfg.role === 'tank' || dst.cfg.role === 'warrior') dst.gainMana(dealt * (this.configs.battle.roleMana?.damageTakenFraction ?? 0));
      if (!fixed) healing.set(src, (healing.get(src) ?? 0) + dealt * src.lifesteal);
      this.events.push({ t: 'hit', tick: this.tick, id: dst.id, source: src.id, actualDamage: dealt, dmg, hp: dst.hp, dmgType: type, ...(shadowBoardSide !== undefined ? { shadowBoardSide } : {}), ...(sunlightJudgmentSide !== undefined ? { sunlightJudgmentSide } : {}), ...(critical ? { critical: true } : {}), ...(executed && dst.hp === 0 ? { executed: true } : {}) });
      if (triggered) this.events.push({ t: 'equipment_trigger', tick: this.tick, id: dst.id, equipmentId: triggered, shield: dst.shield });
      this.startEquipmentSustain(dst);
      this.sunlight.onShieldAbsorbed(dst, this.shadowSkills.onShieldAbsorbed(dst, absorbed));
      if (absorbed > 0 && dst.shield === 0) this.sunlight.onEnemyShieldBroken(src, skillId);
      this.sunlight.onHitResolved(src, dst, skillId, previousHp > 0 && dst.hp === 0);
      if (basicAttack) this.applyShadow(src, dst);
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
        u.equipmentSustain.clear();
        this.events.push({ t: 'death', tick: this.tick, id: u.id });
        this.shadowSkills.onDeath(u);
        this.sunlight.onDeath(u);
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
    return u.alive && !u.skillUntargetable && this.tick >= u.untargetableUntilTick;
  }

  private triggerLowHealthProtection(u: Unit): string | null {
    if (!u.alive || u.lowHealthProtectionUsed) return null;
    const item = u.equipment.find(e => e.lowHealthProtection && u.hp < u.cfg.hp * e.lowHealthProtection.threshold);
    if (!item) return null;
    const effect = item.lowHealthProtection!;
    u.lowHealthProtectionUsed = true;
    u.hp = Math.max(1, u.hp);
    u.untargetableUntilTick = this.tick + Math.max(1, Math.round(effect.untargetableSeconds * 1000 / this.configs.battle.tickMs));
    const shieldAmount = Math.round(u.cfg.hp * effect.shieldMaxHpFraction);
    u.shield += shieldAmount;
    this.events.push({ t: 'shield', tick: this.tick, id: u.id, source: u.id, equipmentId: item.id, amount: shieldAmount, shield: u.shield });
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
      this.startEquipmentSustain(u);
      this.updateEquipmentSustain(u);
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

  private startEquipmentSustain(u: Unit): void {
    if (!u.alive || u.hp <= 0) return;
    u.equipment.forEach((item, slot) => {
      const effect = item.lowHealthRegen;
      if (!effect || u.equipmentSustain.has(slot) || u.hp >= u.cfg.hp * effect.threshold) return;
      const interval = Math.max(1, Math.round(effect.intervalSeconds * 1000 / this.configs.battle.tickMs));
      u.equipmentSustain.set(slot, { nextTick: this.tick + interval, pulses: 0, delivered: 0 });
      this.events.push({ t: 'equipment_trigger', tick: this.tick, id: u.id, equipmentId: item.id, shield: u.shield });
    });
  }

  private updateEquipmentSustain(u: Unit): void {
    // Iterate slots rather than Map order; each copy keeps healing even after HP recovers above 50%.
    u.equipment.forEach((item, slot) => {
      const state = u.equipmentSustain.get(slot), effect = item.lowHealthRegen;
      if (!state || !effect || this.tick < state.nextTick) return;
      state.pulses++;
      const delivered = Math.floor(u.cfg.hp * effect.maxHpFraction * state.pulses + 1e-9);
      const amount = Math.min(u.cfg.hp - u.hp, delivered - state.delivered);
      state.delivered = delivered;
      state.nextTick += Math.max(1, Math.round(effect.intervalSeconds * 1000 / this.configs.battle.tickMs));
      if (amount > 0) {
        u.hp += amount;
        this.events.push({ t: 'heal', tick: this.tick, id: u.id, source: u.id, amount, hp: u.hp });
      }
    });
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
