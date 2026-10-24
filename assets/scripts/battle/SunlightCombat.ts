import { ConfigManager, SkillConfigData, configuredShieldAmount } from '../core/ConfigManager';
import { Unit } from './Unit';
import { BattleEvent, DmgType, Pos, Side, SunlightTraitEffect, SunlightPulse, SunlightSkillData } from './types';
import { hexDist, hexNeighbors, offsetToWorld, worldToOffset } from './HexMath';
import { isTraitFrontRow } from './Traits';

interface Host {
  units: Unit[]; events: BattleEvent[];
  now(): number; width(): number; height(): number;
  targetable(unit: Unit): boolean;
  damage(source: Unit, target: Unit, raw: number, type: DmgType, skillId: string): void;
  fixedDamage(source: Unit, target: Unit, raw: number, sunlightJudgmentSide?: Side, sunlightJudgmentStar?: number): void;
  stun(source: Unit, target: Unit, seconds: number): void;
  randomIndex(length: number): number;
  cooldown(unit: Unit): number;
}
interface Shield { source: Unit; target: Unit; skill: SkillConfigData; remaining: number; end: number; heal: boolean }
interface Channel { source: Unit; skill: SkillConfigData; targetId: number; next: number; index: number; recasts: number }
interface Army { side: Side; source: Unit; members: Array<{ unit: Unit; front: boolean }>; spec: SunlightTraitEffect; buffed: boolean }

/** All timers use simulation ticks. The shield ledger tracks only this faction's layers. */
export class SunlightCombat {
  private armies: Army[] = [];
  private traitShields = new Map<number, { unit: Unit; remaining: number }>();
  private shields: Shield[] = [];
  private channels = new Map<number, Channel>();
  private empowers = new Map<number, { skill: SkillConfigData; remaining: number; end: number }>();
  private speedBuffs = new Map<number, { amount: number; end: number }>();
  private huntWatches = new Map<number, { skill: SkillConfigData; tick: number }>();
  private prayers: Array<{ source: Unit; skill: SkillConfigData; center: Pos; end: number }> = [];
  private pillars: Array<{ source: Unit; skill: SkillConfigData; targets: number[]; tick: number }> = [];
  constructor(private host: Host, private configs: ConfigManager) {}
  private get tick(): number { return this.host.now(); }
  private ticks(seconds: number): number { return Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs)); }
  private enemies(source: Unit): Unit[] { return this.host.units.filter(u => u.side !== source.side && u.hp > 0 && this.host.targetable(u)); }
  private allies(source: Unit): Unit[] { return this.host.units.filter(u => u.side === source.side && u.alive && u.hp > 0); }
  private pulse(source: Unit, effect: SunlightPulse, center: Pos, radius = 0, duration = .5, from?: Pos,
    details: { kind?: SunlightSkillData['kind']; targetId?: number; trait?: boolean; step?: number; finisher?: boolean } = {}): void {
    this.host.events.push({ t: 'sun_pulse', tick: this.tick, id: source.id, effect, center: { ...center }, radius, duration, ...(from ? { from: { ...from } } : {}), ...details });
  }
  private hit(source: Unit, target: Unit, skill: SkillConfigData, raw = skill.starDamage![source.star - 1], type = skill.dmgType): void {
    this.host.damage(source, target, raw, type, skill.id);
  }
  register(side: Side, members: Unit[], spec: SunlightTraitEffect): void {
    if (!members.length) return;
    this.armies.push({ side, source: members[0], spec, buffed: false, members: members.map(unit => ({ unit,
      front: isTraitFrontRow(side, unit.y, this.host.height(), this.configs.battle.ownRows) })) });
  }
  start(): void {
    for (const army of this.armies) {
      for (const { unit } of army.members) {
        const amount = Math.round(unit.cfg.hp * army.spec.shieldMaxHpFraction);
        unit.shield += amount; unit.sunlightShield = amount;
        this.traitShields.set(unit.id, { unit, remaining: amount });
        this.host.events.push({ t: 'shield', tick: this.tick, id: unit.id, source: unit.id, amount, shield: unit.shield });
        this.pulse(unit, 'shield', unit.pos, 0, .8, undefined, { trait: true, targetId: unit.id });
      }
      if (army.spec.battlefield) this.pulse(army.source, 'board', { x: (this.host.width() - 1) / 2, y: (this.host.height() - 1) / 2 }, this.host.width(), 2, undefined, { trait: true });
      this.formation(army);
    }
  }
  private formation(army: Army): void {
    const buff = army.spec.formation;
    if (!buff || army.buffed || this.tick < Math.round(buff.delaySeconds * 1000 / this.configs.battle.tickMs)) return;
    army.buffed = true;
    for (const { unit, front } of army.members) {
      if (!unit.alive) continue;
      if (front) unit.cfg.damageReduction = Math.min(1, (unit.cfg.damageReduction ?? 0) + buff.frontReduction);
      else unit.cfg.damageAmp = (unit.cfg.damageAmp ?? 0) + buff.backAmp;
      this.pulse(unit, 'formation', unit.pos, 0, .8, undefined, { trait: true });
    }
  }
  update(): void {
    for (const army of this.armies) {
      this.formation(army);
      const spec = army.spec.judgment;
      if (!spec || this.tick % this.ticks(spec.intervalSeconds) !== 0) continue;
      const enemies = this.enemies(army.source);
      if (!enemies.length) continue;
      const target = enemies[this.host.randomIndex(enemies.length)];
      this.host.stun(army.source, target, spec.stunSeconds);
      this.pulse(army.source, 'judgment', target.pos, 0, .7, undefined, { trait: true, targetId: target.id });
      this.host.fixedDamage(army.source, target, spec.damage + target.cfg.hp * (spec.targetMaxHpFraction ?? 0),
        spec.independentStatistics ? army.side : undefined, spec.independentStatistics ? (spec.statisticsStar ?? 4) : undefined);
    }
    for (const shield of [...this.shields]) if (this.tick >= shield.end) this.endShield(shield, true);
    for (const [id, buff] of this.empowers) if (this.tick >= buff.end) {
      this.host.units.find(u => u.id === id)!.skillAttackSpeedBonus = 0; this.empowers.delete(id);
    }
    for (const [id, buff] of this.speedBuffs) if (this.tick >= buff.end) {
      this.host.units.find(u => u.id === id)!.skillAttackSpeedBonus -= buff.amount; this.speedBuffs.delete(id);
    }
    for (const [id, watch] of this.huntWatches) if (watch.tick < this.tick) this.huntWatches.delete(id);
    for (const channel of Array.from(this.channels.values())) {
      if (!channel.source.alive) this.interrupt(channel.source);
      else if (this.tick >= channel.next && this.tick >= channel.source.stunnedUntilTick && this.tick >= channel.source.fearUntilTick) this.advance(channel);
    }
    for (const prayer of this.prayers) if (this.tick >= prayer.end) {
      const { source, skill, center } = prayer, spec = skill.sunlight!;
      if (spec.kind !== 'prayer') continue;
      for (const ally of this.allies(source).filter(u => hexDist(u.pos, center) <= skill.radius)) this.heal(source, ally, spec.heals[source.star - 1]);
      for (const enemy of this.enemies(source).filter(u => hexDist(u.pos, center) <= skill.radius)) {
        this.hit(source, enemy, skill); this.host.stun(source, enemy, skill.stunSeconds![source.star - 1]);
      }
      this.pulse(source, 'burst', center, skill.radius, .7, undefined, { kind: spec.kind });
    }
    this.prayers = this.prayers.filter(p => this.tick < p.end);
    for (const job of this.pillars) if (this.tick >= job.tick) {
      const { source, skill } = job, spec = skill.sunlight!;
      if (spec.kind !== 'judgment') continue;
      for (const id of job.targets) {
        const target = this.enemies(source).find(u => u.id === id); if (!target) continue;
        this.hit(source, target, skill);
        this.hit(source, target, skill, spec.trueDamage[source.star - 1], 'true');
        this.host.stun(source, target, skill.stunSeconds![source.star - 1]); this.pulse(source, 'judgment', target.pos, 0, .7, undefined, { kind: spec.kind, targetId: target.id });
      }
    }
    this.pillars = this.pillars.filter(j => this.tick < j.tick);
  }
  target(source: Unit, skill: SkillConfigData): Unit | undefined {
    const kind = skill.sunlight!.kind;
    if (['bulwark', 'bastion', 'empower', 'prayer'].includes(kind)) return this.enemies(source).length ? source : undefined;
    let enemies = this.enemies(source).filter(u=>source.canSelectEnemy(u));
    if (kind === 'arrows' || kind === 'cleave') enemies = enemies.filter(u => hexDist(u.pos, source.pos) <= source.cfg.range);
    if (kind === 'crossbow') return enemies.sort((a, b) => this.lineTargets(source, b.pos).length - this.lineTargets(source, a.pos).length || a.id - b.id)[0];
    return enemies.sort((a, b) => (kind === 'hunt' ? -1 : 1) * (hexDist(source.pos, a.pos) - hexDist(source.pos, b.pos)) || a.id - b.id)[0];
  }
  busy(source: Unit): boolean { return this.channels.has(source.id); }
  activate(source: Unit, skill: SkillConfigData, targetId?: number): void {
    const spec = skill.sunlight!, rank = source.star - 1;
    const target = this.enemies(source).find(u => u.id === (source.tauntSourceId ?? targetId));
    switch (spec.kind) {
      case 'bulwark':
        for (const s of [...this.shields]) if (s.source === source && s.skill.id === skill.id) this.endShield(s, true);
        this.addShield(source, source, skill, configuredShieldAmount(source.cfg, skill, source.star), spec.durationSeconds); break;
      case 'bastion':
        this.addShield(source, source, skill, configuredShieldAmount(source.cfg, skill, source.star), spec.durationSeconds);
        for (const ally of this.allies(source).filter(u => u !== source).sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id).slice(0, spec.allyCount))
          this.addShield(source, ally, skill, configuredShieldAmount(source.cfg, skill, source.star, spec.allyShields), spec.durationSeconds, true);
        break;
      case 'cleave': {
        if (!target) break;
        const victims = this.enemies(source).filter(u => this.inCone(source.pos, target.pos, u.pos, skill.radius, spec.coneDegrees));
        for (const victim of victims) this.hit(source, victim, skill);
        if (victims.length) this.addShield(source, source, skill, configuredShieldAmount(source.cfg, skill, source.star) * Math.min(spec.shieldTargetCap, victims.length), Infinity);
        if (victims.length >= spec.guardTargetCount) {
          source.guardReduction = spec.guardReduction; source.guardUntilTick = this.tick + this.ticks(spec.guardSeconds);
          this.host.events.push({ t: 'guard', tick: this.tick, id: source.id, duration: spec.guardSeconds, reduction: spec.guardReduction });
        }
        this.pulse(source, 'slash', target.pos, skill.radius, .5, source.pos, { kind: spec.kind, targetId: target.id }); break;
      }
      case 'empower':
        source.skillAttackSpeedBonus = skill.attackSpeedBonuses![rank];
        this.empowers.set(source.id, { skill, remaining: spec.attacks, end: this.tick + this.ticks(spec.durationSeconds) });
        this.pulse(source, 'formation', source.pos, 0, spec.durationSeconds, undefined, { kind: spec.kind }); break;
      case 'arrows': case 'hunt': case 'transit': {
        if (!target || spec.kind === 'transit' && !this.teleportCell(source, target)) break;
        const job: Channel = { source, skill, targetId: target.id, next: this.tick, index: 0, recasts: 0 };
        this.channels.set(source.id, job);
        if (spec.kind === 'hunt' || spec.kind === 'transit') this.teleport(source, target);
        this.advance(job); break;
      }
      case 'crossbow': {
        if (!target) break;
        const victims = this.lineTargets(source, target.pos);
        victims.forEach((unit, i) => {
          this.hit(source, unit, skill, skill.starDamage![rank] * Math.max(spec.minimum, spec.penetration ** i));
        });
        this.pulse(source, 'bolt', victims[victims.length - 1]?.pos ?? target.pos, 0, .35, source.pos, { kind: spec.kind }); break;
      }
      case 'prayer': {
        const allies = this.allies(source);
        const center = allies.slice().sort((a, b) => allies.filter(u => hexDist(u.pos, b.pos) <= skill.radius).length
          - allies.filter(u => hexDist(u.pos, a.pos) <= skill.radius).length || a.id - b.id)[0]?.pos;
        if (!center) break;
        for (const ally of allies.filter(u => hexDist(u.pos, center) <= skill.radius))
          this.addShield(source, ally, skill, configuredShieldAmount(source.cfg, skill, source.star), spec.durationSeconds);
        this.prayers.push({ source, skill, center: { ...center }, end: this.tick + this.ticks(spec.durationSeconds) });
        this.pulse(source, 'prayer', center, skill.radius, spec.durationSeconds, undefined, { kind: spec.kind }); break;
      }
      case 'judgment': {
        const pool = this.enemies(source).filter(u=>source.canSelectEnemy(u)), selected: Unit[] = [];
        const count = source.star >= spec.allEnemiesStar ? pool.length : Math.min(pool.length, spec.counts[rank]);
        while (selected.length < count) selected.push(pool.splice(this.host.randomIndex(pool.length), 1)[0]);
        for (const unit of selected) this.pulse(source, 'warning', unit.pos, 0, spec.delaySeconds, undefined, { kind: spec.kind, targetId: unit.id });
        this.pillars.push({ source, skill, targets: selected.map(u => u.id).sort((a, b) => a - b), tick: this.tick + this.ticks(spec.delaySeconds) }); break;
      }
    }
    if (!this.busy(source)) source.atkCd = this.host.cooldown(source);
  }
  private advance(job: Channel): void {
    const { source, skill } = job, spec = skill.sunlight!, rank = source.star - 1;
    if (spec.kind !== 'arrows' && spec.kind !== 'hunt' && spec.kind !== 'transit') return;
    const recast = spec.kind === 'transit' && job.targetId === -1;
    const target = recast
      ? this.enemies(source).filter(u=>source.canSelectEnemy(u)).sort((a, b) => hexDist(source.pos, a.pos) - hexDist(source.pos, b.pos) || a.id - b.id)[0]
      : this.enemies(source).find(u => u.id === (source.tauntSourceId ?? job.targetId));
    if (!target) { this.finish(job); return; }
    if(source.tauntSourceId!==null)job.targetId=target.id;
    if (recast) {
      if (!this.teleportCell(source, target)) { this.finish(job); return; }
      this.teleport(source, target); job.targetId = target.id; job.recasts++;
      this.host.events.push({ t: 'cast', tick: this.tick, id: source.id, skillId: skill.id, target: target.id, duration: 0 });
    }
    const finisher = spec.kind === 'transit' && job.index === spec.counts[rank] - 1;
    let raw = skill.starDamage![rank];
    if (spec.kind === 'arrows' && job.index === 2) raw = spec.finalDamage[rank];
    if (spec.kind === 'transit' && finisher) raw = spec.finalDamage[rank];
    if (spec.kind === 'transit') raw *= 1 - Math.min(spec.recastDamageLossCap, job.recasts * spec.recastDamageLoss);
    if (spec.kind === 'hunt') {
      if (job.index === 0 && target.shield > 0) raw *= 1 + spec.shieldBonus;
      this.huntWatches.set(source.id, { skill, tick: this.tick });
    }
    this.hit(source, target, skill, raw);
    this.pulse(source, spec.kind === 'arrows' ? 'bolt' : 'slash', target.pos, 0, .25, source.pos,
      { kind: spec.kind, targetId: target.id, step: job.index, ...(finisher ? { finisher: true } : {}) });
    if (spec.kind === 'arrows' && job.index === 2) {
      const a = offsetToWorld(source.x, source.y, 1, 0, 0), b = offsetToWorld(target.x, target.y, 1, 0, 0);
      const behind = hexNeighbors(target.x, target.y).sort((p, q) => {
        const score = (v: Pos) => { const c = offsetToWorld(v.x, v.y, 1, 0, 0); return (c.x - b.x) * (b.x - a.x) + (c.y - b.y) * (b.y - a.y); };
        return score(q) - score(p) || p.y - q.y || p.x - q.x;
      })[0];
      const victim = this.enemies(source).find(u => u.x === behind.x && u.y === behind.y);
      if (victim) this.hit(source, victim, skill, raw * spec.pierceMultiplier);
    }
    job.index++; job.next = this.tick + this.ticks(spec.intervalSeconds);
    // Transit must wait for the actual hit result, including lethal protection, before ending or restarting.
    if (spec.kind !== 'transit' && job.index >= (spec.kind === 'arrows' ? 3 : spec.hits)) this.finish(job);
  }
  onHitResolved(source: Unit, target: Unit, skillId: string | undefined, killed: boolean): void {
    const job = this.channels.get(source.id), spec = job?.skill.sunlight;
    if (!job || spec?.kind !== 'transit' || job.skill.id !== skillId || job.targetId !== target.id) return;
    if (killed) {
      if (!this.enemies(source).length) { this.finish(job); return; }
      job.targetId = -1; job.index = 0;
    } else if (job.index >= spec.counts[source.star - 1]) this.finish(job);
  }
  private finish(job: Channel): void {
    const { source } = job;
    this.channels.delete(source.id); source.skillUntargetable = false; source.atkCd = this.host.cooldown(source);
  }
  onBasicAttack(source: Unit, target: Unit): void {
    const buff = this.empowers.get(source.id); if (!buff || this.tick >= buff.end) return;
    const spec = buff.skill.sunlight!; if (spec.kind !== 'empower') return;
    this.hit(source, target, buff.skill);
    this.pulse(source, 'slash', target.pos, 0, .25, source.pos, { kind: spec.kind, targetId: target.id });
    if (--buff.remaining === 0) {
      for (const victim of this.enemies(source).filter(u => hexDist(u.pos, target.pos) <= buff.skill.radius)) this.hit(source, victim, buff.skill, spec.burstDamage[source.star - 1]);
      this.pulse(source, 'burst', target.pos, buff.skill.radius, .6, undefined, { kind: spec.kind }); source.skillAttackSpeedBonus = 0; this.empowers.delete(source.id);
    }
  }
  onEnemyShieldBroken(source: Unit, skillId?: string): void {
    const watch = this.huntWatches.get(source.id); if (!watch || watch.tick !== this.tick || watch.skill.id !== skillId) return;
    const spec = watch.skill.sunlight!; if (spec.kind !== 'hunt') return;
    const amount = watch.skill.attackSpeedBonuses![source.star - 1], previous = this.speedBuffs.get(source.id);
    source.skillAttackSpeedBonus += amount - (previous?.amount ?? 0);
    this.speedBuffs.set(source.id, { amount, end: this.tick + this.ticks(spec.speedSeconds) });
  }
  private addShield(source: Unit, target: Unit, skill: SkillConfigData, amount: number, seconds: number, heal = false): void {
    target.shield += amount; this.shields.push({ source, target, skill, remaining: amount, end: this.tick + this.ticks(seconds), heal });
    this.host.events.push({ t: 'shield', tick: this.tick, id: target.id, source: source.id, amount, shield: target.shield });
    this.pulse(target, 'shield', target.pos, 0, Number.isFinite(seconds) ? seconds : 0, undefined, { kind: skill.sunlight!.kind, targetId: target.id });
  }
  private endShield(shield: Shield, expired: boolean): void {
    if (!this.shields.includes(shield)) return;
    this.shields.splice(this.shields.indexOf(shield), 1); shield.target.shield = Math.max(0, shield.target.shield - shield.remaining);
    const survived = shield.remaining > 0; shield.remaining = 0;
    if (!shield.target.alive) return;
    const spec = shield.skill.sunlight!;
    if (spec.kind === 'bulwark') {
      for (const target of this.enemies(shield.source).filter(u => hexDist(u.pos, shield.target.pos) <= shield.skill.radius)) this.hit(shield.source, target, shield.skill);
      this.pulse(shield.source, 'burst', shield.target.pos, shield.skill.radius, .6, undefined, { kind: spec.kind });
    }
    if (spec.kind === 'bastion' && expired && survived && shield.heal) this.heal(shield.source, shield.target, spec.heals[shield.source.star - 1]);
  }
  /** Returns the absorption left for untracked permanent/equipment shields. */
  onShieldAbsorbed(target: Unit, amount: number): number {
    for (const shield of this.shields.filter(s => s.target === target).sort((a, b) => a.end - b.end)) {
      const used = Math.min(amount, shield.remaining); shield.remaining -= used; amount -= used;
      if (shield.remaining === 0) this.endShield(shield, false);
      if (amount === 0) break;
    }
    const trait = this.traitShields.get(target.id);
    if (trait && trait.remaining > 0 && amount > 0) {
      const used = Math.min(amount, trait.remaining); trait.remaining -= used; amount -= used; target.sunlightShield = trait.remaining;
    }
    return amount;
  }
  private heal(source: Unit, target: Unit, raw: number): void {
    const amount = Math.min(target.cfg.hp - target.hp, Math.round(raw * (1 + (source.cfg.spellPower ?? 0) / 100)));
    if (amount <= 0) return; target.hp += amount;
    this.host.events.push({ t: 'heal', tick: this.tick, id: target.id, source: source.id, amount, hp: target.hp });
  }
  interrupt(source: Unit): void { this.channels.delete(source.id); source.skillUntargetable = false; }
  onDeath(source: Unit): void {
    this.interrupt(source); this.empowers.delete(source.id); this.speedBuffs.delete(source.id); this.huntWatches.delete(source.id);
    source.sunlightShield = 0; this.traitShields.delete(source.id);
    this.shields = this.shields.filter(s => s.target !== source);
  }
  private teleportCell(source: Unit, target: Unit): Pos | undefined {
    return hexNeighbors(target.x, target.y).filter(p => p.x >= 0 && p.y >= 0 && p.x < this.host.width() && p.y < this.host.height()
      && !this.host.units.some(u => u !== source && u.alive && u.x === p.x && u.y === p.y))
      .sort((a, b) => hexDist(source.pos, a) - hexDist(source.pos, b) || a.y - b.y || a.x - b.x)[0];
  }
  private teleport(source: Unit, target: Unit): void {
    const to = this.teleportCell(source, target); if (!to) return;
    const from = source.pos; source.x = to.x; source.y = to.y; this.host.events.push({ t: 'teleport', tick: this.tick, id: source.id, from, to });
  }
  private ray(from: Pos, to: Pos): Set<string> {
    const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(to.x, to.y, 1, 0, 0), cells = new Set<string>();
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (!length) return cells;
    const middle = offsetToWorld((this.host.width() - 1) / 2, (this.host.height() - 1) / 2, 1, 0, 0);
    for (let d = .1; d <= (this.host.width() + this.host.height()) * 2; d += .1) {
      const x = a.x + dx / length * d, y = a.y + dy / length * d;
      let cell = worldToOffset(x, y, 1, 0, 0);
      const outside = () => cell.col < 0 || cell.row < 0 || cell.col >= this.host.width() || cell.row >= this.host.height();
      if (outside()) cell = worldToOffset(x + (middle.x - x) * 1e-8, y + (middle.y - y) * 1e-8, 1, 0, 0);
      if (outside()) break;
      if (cell.col !== from.x || cell.row !== from.y) cells.add(`${cell.col},${cell.row}`);
    }
    return cells;
  }
  private lineTargets(source: Unit, toward: Pos): Unit[] {
    const cells = this.ray(source.pos, toward);
    return this.enemies(source).filter(u => cells.has(`${u.x},${u.y}`)).sort((a, b) => hexDist(source.pos, a.pos) - hexDist(source.pos, b.pos) || a.id - b.id);
  }
  private inCone(from: Pos, toward: Pos, target: Pos, radius: number, degrees: number): boolean {
    if (hexDist(from, target) > radius || hexDist(from, target) === 0) return false;
    const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(toward.x, toward.y, 1, 0, 0), c = offsetToWorld(target.x, target.y, 1, 0, 0);
    const dx = b.x - a.x, dy = b.y - a.y, tx = c.x - a.x, ty = c.y - a.y;
    return (dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)) >= Math.cos(degrees / 2 * Math.PI / 180) - 1e-9;
  }
}
