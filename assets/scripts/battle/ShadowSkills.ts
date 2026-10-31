import { ConfigManager, SkillConfigData, configuredShieldAmount } from '../core/ConfigManager';
import { Unit } from './Unit';
import { BattleEvent, DmgType, Pos, ShadowPulseEffect } from './types';
import { hexDist, hexNeighbors, offsetToWorld, worldToOffset } from './HexMath';

export interface ShadowSkillHost {
  units: Unit[];
  events: BattleEvent[];
  now(): number;
  width(): number;
  height(): number;
  targetable(unit: Unit): boolean;
  damage(source: Unit, target: Unit, raw: number, type: DmgType, typeBonusApplied?: boolean): void;
  defer(seconds:number,run:()=>void):void;
  fear(source: Unit, target: Unit, seconds: number, origin: Pos): void;
  cooldown(unit: Unit): number;
}
interface TimedShield { serial: number; source: Unit; target: Unit; skill: SkillConfigData; remaining: number; end: number; bulwark: boolean }
interface Channel { source: Unit; skill: SkillConfigData; targetId: number; remaining: number; next: number; lastTarget: number | null; marked: Set<number> }
interface Barrage { source: Unit; skill: SkillConfigData; remaining: number; next: number; centers: Pos[]; hits: Map<number, number>; lastCenter: Pos }
interface Refund { source: Unit; targetId: number; end: number; amount: number }

/** Stateful authored abilities; all damage still enters BattleSim's common damage queue. */
export class ShadowSkills {
  private serial = 0;
  private shields: TimedShield[] = [];
  private domains = new Map<number, { source: Unit; skill: SkillConfigData; end: number }>();
  private soulLamps = new Map<number, { source: Unit; skill: SkillConfigData; end: number; next: number }>();
  private empowers = new Map<number, { skill: SkillConfigData; end: number; remaining: number }>();
  private channels = new Map<number, Channel>();
  private barrages: Barrage[] = [];
  private refunds: Refund[] = [];

  constructor(private host: ShadowSkillHost, private configs: ConfigManager) {}
  private get tick(): number { return this.host.now(); }
  private ticks(seconds: number): number { return Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs)); }
  private enemies(source: Unit): Unit[] { return this.host.units.filter(unit => unit.side !== source.side && this.host.targetable(unit)); }
  private occupied(pos: Pos, source: Unit): boolean { return this.host.units.some(unit => unit !== source && unit.alive && unit.x === pos.x && unit.y === pos.y); }
  private rank(unit: Unit): number { return unit.star - 1; }
  private pulse(source: Unit, skill: SkillConfigData, effect: ShadowPulseEffect, center: Pos, radius = skill.radius): void {
    const duration = skill.shadow && 'durationSeconds' in skill.shadow ? skill.shadow.durationSeconds : undefined;
    this.host.events.push({ t: 'skill_pulse', tick: this.tick, id: source.id, skillId: skill.id, effect, center: { ...center },from:source.pos, radius,
      ...(duration === undefined ? {} : { duration }),...(skill.projectile?{flightTicks:this.ticks(skill.projectile.flightSeconds)}:{}), ...(effect === 'empower' ? { selfCast: center.x === source.x && center.y === source.y } : {}) });
  }
  private area(source: Unit, center: Pos, radius: number): Unit[] { return this.enemies(source).filter(unit => hexDist(unit.pos, center) <= radius); }

  /** Global selectors are intentional; melee cones and straight shots retain ordinary cast range. */
  target(source: Unit, skill: SkillConfigData): Unit | undefined {
    let enemies = this.enemies(source).filter(u=>source.canSelectEnemy(u));
    if (skill.shadow?.kind === 'piercing' || skill.shadow?.kind === 'cleave') enemies = enemies.filter(unit => hexDist(source.pos, unit.pos) <= source.cfg.range);
    return enemies.sort((a, b) => {
      if (skill.shadow?.kind === 'flurry') return hexDist(source.pos, b.pos) - hexDist(source.pos, a.pos) || a.id - b.id;
      if (skill.shadow?.kind === 'execute') return a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id;
      return hexDist(source.pos, a.pos) - hexDist(source.pos, b.pos) || a.id - b.id;
    })[0];
  }
  busy(source: Unit): boolean { return this.channels.has(source.id); }

  activate(source: Unit, skill: SkillConfigData, targetId?: number): void {
    const spec = skill.shadow!;
    const rank = this.rank(source);
    const target = this.host.units.find(unit => unit.id === (source.tauntSourceId ?? targetId) && this.host.targetable(unit) && unit.side !== source.side);
    const baseDamage = skill.starDamage?.[rank] ?? 0;
    switch (spec.kind) {
      case 'soulLamp': {
        source.domainUntilTick = this.tick + this.ticks(spec.durationSeconds); source.domainRadius = skill.radius;
        this.soulLamps.set(source.id, { source, skill, end: source.domainUntilTick, next: this.tick + this.ticks(spec.intervalSeconds) });
        this.pulse(source, skill, 'domain', source.pos);
        break;
      }
      case 'bulwark': {
        // Recasting ends the old instance once; timed shields never remove equipment shields.
        for (const shield of [...this.shields]) if (shield.source === source && shield.bulwark) this.endShield(shield, true);
        source.skillArmorBonus = source.skillMrBonus = spec.resistanceBonuses[rank];
        this.addShield(source, source, skill, configuredShieldAmount(source.cfg, skill, source.star), spec.durationSeconds, true);
        this.pulse(source, skill, 'bulwark', source.pos, 0);
        break;
      }
      case 'domain': {
        for (const shield of [...this.shields]) if (shield.source === source && shield.skill.id === skill.id) this.endShield(shield, false);
        this.addShield(source, source, skill, configuredShieldAmount(source.cfg, skill, source.star), spec.durationSeconds);
        const allies = this.host.units.filter(unit => unit.alive && unit.side === source.side && unit !== source)
          .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id).slice(0, spec.allyCount);
        for (const ally of allies) this.addShield(source, ally, skill, configuredShieldAmount(source.cfg, skill, source.star, spec.allyShieldAmounts), spec.durationSeconds);
        source.domainUntilTick = this.tick + this.ticks(spec.durationSeconds); source.domainRadius = skill.radius;
        this.domains.set(source.id, { source, skill, end: source.domainUntilTick });
        this.updateDomainSlows();
        this.pulse(source, skill, 'domain', source.pos);
        break;
      }
      case 'piercing': {
        if (!target) break;
        const from=source.pos,to=target.pos,cells=this.ray(from,to);
        this.host.defer(skill.projectile?.flightSeconds??0,()=>{
          const victims=this.enemies(source).filter(unit=>unit.hp>0&&cells.has(`${unit.x},${unit.y}`))
            .sort((a,b)=>hexDist(from,a.pos)-hexDist(from,b.pos)||a.id-b.id);
          victims.forEach((unit,i)=>this.host.damage(source,unit,i===0?baseDamage:spec.secondaryDamage[rank],skill.dmgType));
        });
        const last=Array.from(cells).pop()?.split(',').map(Number);
        this.pulse(source,skill,'piercing',last?{x:last[0],y:last[1]}:to,0);
        break;
      }
      case 'cleave': {
        if (!target) break;
        for (const unit of this.enemies(source)) if (this.inCone(source.pos, target.pos, unit.pos, skill.radius, spec.coneDegrees)) {
          const multiplier = 1 + Math.min(spec.missingHpBonusCap, Math.max(0, 1 - unit.hp / unit.cfg.hp));
          this.host.damage(source, unit, baseDamage * multiplier, skill.dmgType);
        }
        this.pulse(source, skill, 'cleave', target.pos);
        break;
      }
      case 'execute': {
        if (!target) break;
        const life=target.lifeVersion;
        this.host.defer(skill.projectile?.flightSeconds??0,()=>{
          if(target.lifeVersion===life&&target.hp>0&&this.host.targetable(target))
            this.host.damage(source,target,baseDamage*(target.hp/target.cfg.hp<spec.healthThreshold?spec.damageMultiplier:1),skill.dmgType);
        });
        this.pulse(source, skill, 'execute', target.pos, 0);
        break;
      }
      case 'empower': {
        this.empowers.set(source.id, { skill, end: this.tick + this.ticks(spec.durationSeconds), remaining: spec.attacks });
        source.skillAttackSpeedBonus = skill.attackSpeedBonuses![rank];
        this.pulse(source, skill, 'empower', source.pos, 0);
        break;
      }
      case 'flurry':
      case 'void': {
        if (spec.kind === 'flurry' && !target) break;
        const channel: Channel = { source, skill, targetId: target?.id ?? -1, remaining: spec.kind === 'flurry' ? spec.hits : spec.counts[rank],
          next: this.tick, lastTarget: null, marked: new Set() };
        this.channels.set(source.id, channel);
        if (spec.kind === 'flurry' && target) this.teleportBehind(source, target);
        if (spec.kind === 'void') source.skillUntargetable = true;
        this.advanceChannel(channel);
        break;
      }
      case 'lanterns':
      case 'blackstars': {
        const centers: Pos[] = [];
        if (spec.kind === 'lanterns') for (let i = 0; i < spec.count; i++) {
          const center = this.densest(source, skill.radius, centers);
          if (center) centers.push(center);
        }
        const center = centers[0] ?? this.densest(source, skill.radius, []);
        if (!center) break;
        const job: Barrage = { source, skill, remaining: spec.kind === 'lanterns' ? spec.count : spec.counts[rank], next: this.tick,
          centers, hits: new Map(), lastCenter: center };
        this.barrages.push(job); this.advanceBarrage(job);
        break;
      }
    }
    if (!this.busy(source)) source.atkCd = this.host.cooldown(source);
  }

  update(): void {
    for (const [id, lamp] of this.soulLamps) {
      if (!lamp.source.alive || lamp.source.hp <= 0 || this.tick > lamp.end) { this.soulLamps.delete(id); continue; }
      if (this.tick >= lamp.next) {
        const spec = lamp.skill.shadow!;
        if (spec.kind !== 'soulLamp') continue;
        const rank = this.rank(lamp.source);
        for (const enemy of this.area(lamp.source, lamp.source.pos, lamp.skill.radius))
          this.host.damage(lamp.source, enemy, lamp.skill.starDamage![rank] * (1 + (lamp.source.cfg.spellPower ?? 0) / 100) + lamp.source.cfg.hp * spec.maxHpFractions[rank], lamp.skill.dmgType, true);
        lamp.next += this.ticks(spec.intervalSeconds);
      }
      if (this.tick >= lamp.end) this.soulLamps.delete(id);
    }
    for (const shield of [...this.shields]) if (this.tick >= shield.end) this.endShield(shield, shield.target.alive);
    for (const [id, buff] of this.empowers) if (this.tick >= buff.end) {
      this.host.units.find(unit => unit.id === id)!.skillAttackSpeedBonus = 0; this.empowers.delete(id);
    }
    this.updateDomainSlows();
    for (const channel of Array.from(this.channels.values())) if (this.tick >= channel.next) this.advanceChannel(channel);
    for (const job of [...this.barrages]) if (job.remaining > 0 && this.tick >= job.next) this.advanceBarrage(job);
    this.barrages = this.barrages.filter(job => job.remaining > 0);
    this.refunds = this.refunds.filter(watch => watch.source.alive && this.tick <= watch.end);
  }

  private updateDomainSlows(): void {
    for (const unit of this.host.units) unit.skillAttackSpeedPenalty = 0;
    for (const [id, domain] of this.domains) {
      if (!domain.source.alive || this.tick >= domain.end) { this.domains.delete(id); continue; }
      const spec = domain.skill.shadow!;
      if (spec.kind !== 'domain') continue;
      for (const unit of this.area(domain.source, domain.source.pos, domain.skill.radius)) if (!unit.crowdControlImmune)
        unit.skillAttackSpeedPenalty = Math.max(unit.skillAttackSpeedPenalty, spec.slowAmounts[this.rank(domain.source)]);
    }
  }

  onBasicAttack(source: Unit, target: Unit): void {
    const buff = this.empowers.get(source.id);
    if (!buff || this.tick >= buff.end) return;
    const skill = buff.skill, spec = skill.shadow!;
    if (spec.kind !== 'empower') return;
    this.host.damage(source, target, skill.starDamage![this.rank(source)], skill.dmgType);
    this.pulse(source, skill, 'empower', target.pos, 0);
    if (--buff.remaining === 0) {
      for (const unit of this.area(source, target.pos, skill.radius)) this.host.damage(source, unit, spec.burstDamage[this.rank(source)], skill.dmgType);
      this.pulse(source, skill, 'flameBurst', target.pos);
      source.skillAttackSpeedBonus = 0; this.empowers.delete(source.id);
    }
  }

  private addShield(source: Unit, target: Unit, skill: SkillConfigData, amount: number, duration: number, bulwark = false): void {
    target.shield += amount;
    this.shields.push({ serial: this.serial++, source, target, skill, remaining: amount, end: this.tick + this.ticks(duration), bulwark });
    this.host.events.push({ t: 'shield', tick: this.tick, id: target.id, source: source.id, amount, shield: target.shield });
  }
  onShieldAbsorbed(target: Unit, amount: number): number {
    const shields = this.shields.filter(shield => shield.target === target).sort((a, b) => a.end - b.end || a.serial - b.serial);
    for (const shield of shields) {
      const used = Math.min(amount, shield.remaining); shield.remaining -= used; amount -= used;
      if (shield.remaining <= 0) this.endShield(shield, true);
      if (amount <= 0) break;
    }
    return amount;
  }
  private endShield(shield: TimedShield, burst: boolean): void {
    if (!this.shields.includes(shield)) return;
    this.shields.splice(this.shields.indexOf(shield), 1);
    shield.target.shield = Math.max(0, shield.target.shield - shield.remaining); shield.remaining = 0;
    if (!shield.bulwark) return;
    shield.source.skillArmorBonus = shield.source.skillMrBonus = 0;
    if (!burst) return;
    for (const unit of this.area(shield.source, shield.source.pos, shield.skill.radius))
      this.host.damage(shield.source, unit, shield.skill.starDamage![this.rank(shield.source)], shield.skill.dmgType);
    this.pulse(shield.source, shield.skill, 'bulwarkBurst', shield.source.pos);
  }

  private advanceChannel(channel: Channel): void {
    const { source, skill } = channel, spec = skill.shadow!;
    if (!source.alive) { this.interrupt(source); return; }
    if (spec.kind !== 'flurry' && spec.kind !== 'void') return;
    if (spec.kind === 'flurry') {
      const target = this.host.units.find(unit => unit.id === (source.tauntSourceId ?? channel.targetId) && this.host.targetable(unit));
      if (target) {
        this.host.damage(source, target, skill.starDamage![this.rank(source)], skill.dmgType);
        this.pulse(source, skill, 'flurry', target.pos, 0);
      }
    } else {
      const target = this.enemies(source).filter(unit => source.canSelectEnemy(unit) && (source.tauntSourceId !== null || unit.id !== channel.lastTarget) && !!this.behindCell(source, unit))
        .sort((a, b) => Number(channel.marked.has(a.id)) - Number(channel.marked.has(b.id)) || a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)[0];
      if (!target) { this.finishChannel(channel); return; }
      this.teleportBehind(source, target); channel.lastTarget = target.id; channel.marked.add(target.id);
      this.host.damage(source, target, skill.starDamage![this.rank(source)], skill.dmgType);
      this.pulse(source, skill, 'void', target.pos, 0);
    }
    channel.remaining--; channel.next = this.tick + this.ticks(spec.intervalSeconds);
    if (channel.remaining <= 0) this.finishChannel(channel);
  }
  private finishChannel(channel: Channel): void {
    const { source, skill } = channel, spec = skill.shadow!;
    this.channels.delete(source.id); source.skillUntargetable = false; source.atkCd = this.host.cooldown(source);
    if (spec.kind === 'flurry') this.refunds.push({ source, targetId: channel.targetId, end: this.tick + this.ticks(spec.refundWindowSeconds), amount: spec.refundMana });
    if (spec.kind === 'void') for (const id of Array.from(channel.marked).sort((a, b) => a - b)) {
      const target = this.host.units.find(unit => unit.id === id && this.host.targetable(unit));
      if (!target) continue;
      this.host.damage(source, target, spec.markDamage[this.rank(source)], skill.dmgType);
      this.pulse(source, skill, 'voidMark', target.pos, 0);
    }
  }

  private advanceBarrage(job: Barrage): void {
    const { source, skill } = job, spec = skill.shadow!;
    if (spec.kind !== 'lanterns' && spec.kind !== 'blackstars') return;
    const index = (spec.kind === 'lanterns' ? spec.count : spec.counts[this.rank(source)]) - job.remaining;
    const center = spec.kind === 'lanterns' ? job.centers[index] : this.densest(source, skill.radius, []);
    if (!center) { job.remaining = 0; return; }
    job.lastCenter = center;
    const last=job.remaining===1;
    this.host.defer(skill.projectile?.flightSeconds??0,()=>{
      for(const unit of this.area(source,center,skill.radius)){
        if(unit.hp<=0)continue;
        const hits=job.hits.get(unit.id)??0;
        this.host.damage(source,unit,skill.starDamage![this.rank(source)]*(hits>0?spec.repeatMultiplier:1),skill.dmgType);
        job.hits.set(unit.id,hits+1);
        if(spec.kind==='lanterns')this.host.fear(source,unit,spec.fearSeconds[this.rank(source)],center);
      }
      if(last&&spec.kind==='blackstars'){
        for(const unit of this.area(source,center,spec.collapseRadius))if(unit.hp>0)this.host.damage(source,unit,spec.collapseDamage[this.rank(source)],skill.dmgType);
        this.pulse(source,skill,'collapse',center,spec.collapseRadius);
      }
    });
    this.pulse(source,skill,spec.kind,center);
    job.remaining--;job.next=this.tick+this.ticks(spec.intervalSeconds);
  }

  interrupt(source: Unit): void { this.channels.delete(source.id); source.skillUntargetable = false; }
  onDeath(unit: Unit): void {
    for (const watch of this.refunds.filter(watch => watch.targetId === unit.id && this.tick <= watch.end)) watch.source.gainMana(watch.amount);
    this.refunds = this.refunds.filter(watch => watch.targetId !== unit.id && watch.source !== unit);
    this.interrupt(unit); this.empowers.delete(unit.id); unit.skillAttackSpeedBonus = 0;
    for (const shield of [...this.shields]) if (shield.target === unit) this.endShield(shield, false);
    this.domains.delete(unit.id);
    this.soulLamps.delete(unit.id);
  }

  private behindCell(source: Unit, target: Unit): Pos | undefined {
    return hexNeighbors(target.x, target.y).filter(pos => pos.x >= 0 && pos.y >= 0 && pos.x < this.host.width() && pos.y < this.host.height() && !this.occupied(pos, source))
      .sort((a, b) => (source.side === 0 ? b.y - a.y : a.y - b.y) || hexDist(source.pos, a) - hexDist(source.pos, b) || a.x - b.x)[0];
  }
  private teleportBehind(source: Unit, target: Unit): void {
    const to = this.behindCell(source, target); if (!to) return;
    const from = source.pos; source.x = to.x; source.y = to.y;
    this.host.events.push({ t: 'teleport', tick: this.tick, id: source.id, from, to });
  }
  private densest(source: Unit, radius: number, previous: Pos[]): Pos | undefined {
    const enemies = this.enemies(source);
    const fresh = enemies.filter(unit => !previous.some(pos => pos.x === unit.x && pos.y === unit.y));
    return (fresh.length ? fresh : enemies).slice().sort((a, b) =>
      enemies.filter(unit => hexDist(unit.pos, b.pos) <= radius).length - enemies.filter(unit => hexDist(unit.pos, a.pos) <= radius).length
      || a.y - b.y || a.x - b.x || a.id - b.id)[0]?.pos;
  }

  private ray(from: Pos, target: Pos): Set<string> {
    const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(target.x, target.y, 1, 0, 0);
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy), cells = new Set<string>();
    if (!length) return cells;
    const middle = offsetToWorld((this.host.width() - 1) / 2, (this.host.height() - 1) / 2, 1, 0, 0);
    for (let distance = .1; distance <= (this.host.width() + this.host.height()) * 2; distance += .1) {
      const px = a.x + dx / length * distance, py = a.y + dy / length * distance;
      let cell = worldToOffset(px, py, 1, 0, 0);
      // A ray exactly on an outer hex edge belongs to the board-side cell.
      // Floating point cube-rounding must not end it before its selected target.
      if (cell.col < 0 || cell.row < 0 || cell.col >= this.host.width() || cell.row >= this.host.height())
        cell = worldToOffset(px + (middle.x - px) * 1e-8, py + (middle.y - py) * 1e-8, 1, 0, 0);
      if (cell.col < 0 || cell.row < 0 || cell.col >= this.host.width() || cell.row >= this.host.height()) break;
      if (cell.col !== from.x || cell.row !== from.y) cells.add(`${cell.col},${cell.row}`);
    }
    return cells;
  }
  private inCone(from: Pos, toward: Pos, target: Pos, radius: number, degrees: number): boolean {
    if (hexDist(from, target) > radius || hexDist(from, target) === 0) return false;
    const a = offsetToWorld(from.x, from.y, 1, 0, 0), b = offsetToWorld(toward.x, toward.y, 1, 0, 0), c = offsetToWorld(target.x, target.y, 1, 0, 0);
    const dx = b.x - a.x, dy = b.y - a.y, tx = c.x - a.x, ty = c.y - a.y;
    return (dx * tx + dy * ty) / (Math.hypot(dx, dy) * Math.hypot(tx, ty)) >= Math.cos(degrees / 2 * Math.PI / 180) - 1e-9;
  }
}
