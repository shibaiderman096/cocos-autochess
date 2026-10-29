import { applyHealing } from './Healing';
import { inFearLine } from './LineFear';
import { BloodAid } from './BloodAid';
import { BloodReign } from './BloodReign';
import { SandCompass } from './SandCompass';
import { RopeHunt } from './RopeHunt';
import { DemonCombat } from './DemonCombat';
import { DemonSkills } from './DemonSkills';
import { RavenFlight } from './RavenFlight';
import { DemonGunfire } from './DemonGunfire';
import { Rng } from '../core/Rng';
import { BattleEvent, BattleResult, Side, BattleClockState, ShadowTraitEffect, AstralField } from './types';
import { Unit } from './Unit';
import { hydraulicBulwarkValues, equipmentMaxHpResistance } from '../core/ConfigManager';
import { ShadowSkills } from './ShadowSkills';
import { SunlightCombat } from './SunlightCombat';
import { resolveTraitCarriers, resolveTraits, isTraitMember, isTraitFrontRow } from './Traits';
import { astralCells, densestAstralCenter } from './Astral';
import { dist, nextStep } from './Pathfinding';
import { hexNeighbors, offsetToWorld, worldToOffset, hexDist } from './HexMath';
import { firstRailTarget } from './RailShot';
import { stellarChargeRay } from './StellarCharge';
import { ConfigManager, SkillConfigData, UnitConfigData, combatAttributes, hybridSpellDamage, configuredSkillDamage, channelHealAmount, configuredShieldAmount } from '../core/ConfigManager';

export const TICK_MS = 50;

export interface Placement {
  cfg: UnitConfigData;
  side: Side;
  x: number;
  y: number;
  /** 星级（M2）：影响数值倍率，默认 1 */
  star?: number;
  permanentMaxHp?: number;
  permanentSpellPower?: number;
  permanentPhysicalPower?: number;
  soulLampHealth?: number;
  /** Wave stat multiplier, independent of star rank. */
  statMultiplier?: number;
  /** Encounter bonus affects base health only, independently of attack and skill scaling. */
  healthMultiplier?: number;
  equipment?: string[];
  damageAmp?: number;
  damageReduction?: number;
}

export interface BattleOptions {
  /** Preparation positions for summoned units, separate from owned population. */
  summonPositions?: Partial<Record<Side,{x:number;y:number}>>;
  bonusTraitId?: string;
  firstAllyRevive?: {seconds: number; healthFraction: number};
  seed?: number;
  /** Session-fixed field layout, independent of each wave's combat random seed. */
  astralSeed?: number;
  w?: number;
  h?: number;
  maxTicks?: number; // Optional shorter diagnostic limit; configured combat + overtime is a hard cap.
}

export class BattleSim {
  units: Unit[] = [];
  readonly resolvedTraits: import('./Traits').TraitState[][] = [[],[]];
  private reviveUsed=false;
  private pendingRevive?: {unit:Unit;tick:number};
  events: BattleEvent[] = [];
  /** Credited lethal hits, including trait damage; previews have their own detached counters. */
  readonly alliedKillCounts: [number,number] = [0,0];
  tick = 0;
  finished = false;
  winner: Side | -1 = -1;
  readonly astralFields: AstralField[] = [];
  private rng: Rng;
  private started = false;
  private spellchanterContributors = new Map<Unit, Map<Unit, number>>();
  private shadowBoards: Array<{ side: Side; effect: NonNullable<ShadowTraitEffect['board']>; source: Unit }> = [];
  private shadowSkills: ShadowSkills;
  private sunlight: SunlightCombat;
  private bloodAid: BloodAid;
  private bloodReign: BloodReign;
  private sandCompass: SandCompass;
  private ropeHunt: RopeHunt;
  private demon: DemonCombat;
  private demonSkills: DemonSkills;
  private raven: RavenFlight;
  private gunfire: DemonGunfire;
  private nebulas: Array<{ source: Unit; skill: SkillConfigData; center: {x:number;y:number}; end: number; next: number }> = [];
  private gravityFields: Array<{ source: Unit; skill: SkillConfigData; end: number; next: number }> = [];
  private hasGravityState = false;
  private pendingStuns: Array<{ src: Unit; dst: Unit; seconds: number; knockup?: boolean; pullSeconds?:number; fearOrigin?: { x: number; y: number } }> = [];
  private pendingDamage: Array<{ src: Unit; dst: Unit; raw: number; damageAmp: number; resistance: number; reduction: number;
    type: 'physical' | 'magic' | 'true'; critical: boolean; targeted: boolean; basicAttack?: boolean; fixed?: boolean; shadowBoardSide?: Side; sunlightJudgmentSide?: Side; sunlightJudgmentStar?: number; astralMeteorSide?: Side; skillId?: string; missingHealthFraction?: number; missingTrueFraction?:number }> = [];

  constructor(
    private configs: ConfigManager,
    placements: Placement[],
    private opts: BattleOptions = {},
  ) {
    this.rng = new Rng(opts.seed ?? 1);
    this.gunfire=new DemonGunfire({units:this.units,events:this.events,now:()=>this.tick,
      valid:(source,target)=>target.side!==source.side&&target.hp>0&&this.targetable(target)&&source.canSelectEnemy(target)&&dist(source.pos,target.pos)<=source.cfg.range,
      target:u=>this.selectAttackTarget(u,null),releaseTarget:u=>this.releaseAttackTarget(u),cooldown:u=>this.attackCooldown(u),
      damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'physical',false,false,true,skillId)},configs);
    this.raven=new RavenFlight({units:this.units,events:this.events,now:()=>this.tick,width:()=>this.w,height:()=>this.h,
      targetable:u=>this.targetable(u),damage:(source,target,skill)=>this.damage(source,target,skill.starDamage![source.star-1],'magic',false,false,true,skill.id),
      cooldown:u=>this.attackCooldown(u)},configs);
    this.demonSkills=new DemonSkills({units:this.units,events:this.events,now:()=>this.tick,targetable:u=>this.targetable(u),
      damage:(source,target,raw,skillId)=>this.damage(source,target,raw,this.configs.getSkill(skillId).dmgType,false,false,!!this.configs.getSkill(skillId).thornPull,skillId),
      pull:(src,dst,skill)=>this.pendingStuns.push({src,dst,seconds:skill.thornPull!.stunSeconds,pullSeconds:skill.thornPull!.pullSeconds}),
      verdict:(source,target,skill)=>{
        this.damage(source,target,skill.starDamage![source.star-1],'physical',false,false,true,skill.id);
        this.pendingDamage[this.pendingDamage.length-1].missingTrueFraction=skill.abyssVerdict!.missingHealthFractions[source.star-1];
      },cooldown:u=>this.attackCooldown(u)},configs);
    this.demon = new DemonCombat({units:this.units,events:this.events,now:()=>this.tick,width:()=>this.w,height:()=>this.h,
      summonPosition:side=>this.opts.summonPositions?.[side],
      targetable:u=>this.targetable(u),damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'magic',false,false,false,skillId),
      knockup:(src,dst,seconds)=>this.pendingStuns.push({src,dst,seconds,knockup:true}),
      cast:(u,skill)=>this.emitCast({t:'cast',tick:this.tick,id:u.id,target:u.id,skillId:skill.id,duration:skill.castSeconds}),
      cooldown:u=>this.attackCooldown(u)},configs);
    this.ropeHunt = new RopeHunt({units:this.units,events:this.events,now:()=>this.tick,width:()=>this.w,height:()=>this.h,
      targetable:u=>this.targetable(u),damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'physical',false,false,true,skillId)},configs.battle.tickMs);
    this.sandCompass = new SandCompass({units:this.units,events:this.events,now:()=>this.tick,width:()=>this.w,height:()=>this.h,
      targetable:u=>this.targetable(u),damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'physical',false,false,true,skillId)},configs.battle.tickMs);
    this.bloodAid = new BloodAid({units:this.units,events:this.events,now:()=>this.tick,width:()=>this.w,height:()=>this.h,
      targetable:u=>this.targetable(u),damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'magic',false,false,true,skillId)},configs);
    this.bloodReign = new BloodReign({units:this.units,events:this.events,now:()=>this.tick,
      targetable:u=>this.targetable(u),damage:(source,target,raw,skillId)=>this.damage(source,target,raw,'physical',false,false,true,skillId)},configs);
    this.sunlight = new SunlightCombat({ units: this.units, events: this.events, now: () => this.tick, width: () => this.w, height: () => this.h,
      targetable: u => this.targetable(u), damage: (src, dst, raw, type, skillId) => this.damage(src, dst, raw, type, false, false, true, skillId),
      fixedDamage: (src, dst, raw, sunlightJudgmentSide, sunlightJudgmentStar) => this.pendingDamage.push({ src, dst, raw, type: 'true', damageAmp: 0, resistance: 0, reduction: 0, critical: false, targeted: true, fixed: true, sunlightJudgmentSide, sunlightJudgmentStar }),
      stun: (src, dst, seconds) => this.pendingStuns.push({ src, dst, seconds }), randomIndex: length => Math.floor(this.rng.next() * length),
      cooldown: u => this.attackCooldown(u) }, configs);
    this.shadowSkills = new ShadowSkills({ units: this.units, events: this.events, now: () => this.tick,
      width: () => this.w, height: () => this.h, targetable: unit => this.targetable(unit),
      damage: (source, target, raw, type, typeBonusApplied = false) => this.damage(source, target, raw, type, false, typeBonusApplied),
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
      const base = configs.scaleUnit(p.cfg, star, multiplier);
      const healthMultiplier = p.healthMultiplier ?? 1;
      if (!Number.isFinite(healthMultiplier) || healthMultiplier <= 0) throw new Error('Invalid health multiplier');
      if (healthMultiplier !== 1) base.hp = Math.round(base.hp * healthMultiplier);
      const baseMaxHp = base.hp;
      base.hp += p.permanentMaxHp ?? 0;
      if (!Number.isFinite(p.permanentSpellPower ?? 0) || (p.permanentSpellPower ?? 0) < 0) throw new Error('Invalid permanent spell power');
      base.spellPower = (base.spellPower ?? 0) + (p.permanentSpellPower ?? 0);
      if (!Number.isFinite(p.permanentPhysicalPower ?? 0) || (p.permanentPhysicalPower ?? 0) < 0) throw new Error('Invalid permanent physical power');
      base.physicalPower = (base.physicalPower ?? 0) + (p.permanentPhysicalPower ?? 0);
      const scaled = configs.equipmentStats(base, p.equipment);
      Object.assign(scaled, combatAttributes({ ...scaled, damageAmp: scaled.damageAmp! + (p.damageAmp ?? 0), damageReduction: scaled.damageReduction! + (p.damageReduction ?? 0) }));
      const unit = new Unit(i + 1, p.side, scaled, p.x, p.y);
      unit.baseMaxHp = baseMaxHp;
      unit.permanentSpellPower = p.permanentSpellPower ?? 0;
      unit.permanentPhysicalPower = p.permanentPhysicalPower ?? 0;
      unit.soulLampHealth = p.soulLampHealth ?? 0;
      unit.equipment = configs.getEquipment(p.equipment);
      unit.maxHpGrowthMultiplier = 1 / (base.hp + unit.equipment.reduce((sum, item) => sum + (item.hp ?? 0), 0));
      unit.star = star;
      const guard=scaled.skillId?configs.getSkill(scaled.skillId).lanternGuard:undefined;
      if(guard)unit.lanternGuard={maxArmor:guard.maxArmorBonuses[star-1],maxSpeedPenalty:guard.maxAttackSpeedPenalty,physicalPowerPerArmor:guard.physicalPowerPerArmor[star-1]};
      unit.attackSpeedCap = configs.battle.attackSpeedCap ?? 5;
      unit.manaPerSecond = (unit.cfg.manaPerSecond ?? 0) + (unit.cfg.role === 'caster' ? configs.battle.roleMana?.casterPerSecond ?? 0 : 0);
      unit.skillScale = configs.battle.starScaling[star - 1].skill * multiplier;
      this.units.push(unit);
    });
    for (const side of [0, 1] as Side[]) {
      const army = this.units.filter(unit => unit.side === side);
      const carriers=resolveTraitCarriers(configs.battle.traits??[],army.map(u=>u.cfg),configs.allUnits());
      army.forEach((unit,index)=>{
        const inherited=configs.battle.traits?.find(trait=>trait.id===carriers[index].inheritedTraitId);
        if(inherited&&!inherited.members.includes(unit.cfg.id)&&!unit.cfg.grantedTraitIds?.includes(inherited.id))
          unit.cfg.lifesteal=Math.min(1,(unit.cfg.lifesteal??0)+(inherited.innateLifesteal??0));
        unit.cfg.grantedTraitIds=[...(carriers[index].grantedTraitIds??[])];
        unit.cfg.inheritedTraitId=carriers[index].inheritedTraitId;
        unit.cfg.copyDominantTrait=false;
      });
      const startingHpResistance = army.map(unit => equipmentMaxHpResistance(unit.cfg.hp, unit.equipment));
      const traits = resolveTraits(configs.battle.traits ?? [], army.map(unit => unit.cfg), [...configs.allUnits(), ...army.map(unit => unit.cfg)], side===0?opts.bonusTraitId:undefined);
      this.resolvedTraits[side]=traits;
      for (const trait of traits) {
        const board = trait.active?.shadow?.board;
        const source = army.find(unit => isTraitMember(trait, unit.cfg));
        if (board && source) this.shadowBoards.push({ side, effect: board, source });
        if (trait.active?.sunlight) this.sunlight.register(side, army.filter(unit => isTraitMember(trait, unit.cfg)), trait.active.sunlight);
      }
      for (const unit of army) for (const trait of traits) {
        if (!trait.active || !isTraitMember(trait, unit.cfg)) continue;
        unit.cfg.physicalPower = (unit.cfg.physicalPower ?? 0) + (trait.active.power ?? 0);
        unit.cfg.spellPower = (unit.cfg.spellPower ?? 0) + (trait.active.power ?? 0);
        unit.traitRegenPerSecond += trait.active.regenPerSecond ?? 0;
        if (trait.active.shadow) unit.shadowAttack = trait.active.shadow;
        if (trait.active.conqueror) unit.conqueror = trait.active.conqueror;
        if (trait.active.bloodfiend) unit.bloodfiend = trait.active.bloodfiend;
        if (trait.active.mechanicalPioneer) {
          unit.mechanicalPioneer = trait.active.mechanicalPioneer;
          unit.overclockNextTick = Math.max(1, Math.round(unit.mechanicalPioneer.cooldownSeconds * 1000 / configs.battle.tickMs));
        }
        if (trait.active.swiftmartialist) {
          unit.swiftmartialist = trait.active.swiftmartialist;
          unit.cfg.physicalPower = (unit.cfg.physicalPower ?? 0) + trait.active.swiftmartialist.physicalPower;
        }
        if (trait.active.spellchanter) {
          unit.spellchanter = trait.active.spellchanter;
          unit.cfg.spellPower = (unit.cfg.spellPower ?? 0) + trait.active.spellchanter.spellPower;
        }
        if (trait.active.spellblade) {
          unit.spellblade = trait.active.spellblade;
          unit.cfg.spellPower = (unit.cfg.spellPower ?? 0) + trait.active.spellblade.spellPower;
        }
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
      // Snapshot starting tiles after all existing stat traits; movement never reapplies these buffs.
      for (const trait of traits) {
        const effect = trait.active?.astral;
        if (!effect) continue;
        const cells = astralCells(opts.astralSeed ?? opts.seed ?? 1, side, w, h, configs.battle.ownRows, effect.cellCount);
        this.astralFields.push({ side, cells, effect });
        for (const unit of army) {
          if (!cells.some(cell => cell.x === unit.x && cell.y === unit.y)) continue;
          const multiplier = isTraitMember(trait, unit.cfg) ? effect.memberMultiplier : 1;
          unit.cfg.physicalPower = (unit.cfg.physicalPower ?? 0) + effect.power * multiplier;
          unit.cfg.spellPower = (unit.cfg.spellPower ?? 0) + effect.power * multiplier;
          unit.cfg.hp = Math.round(unit.cfg.hp * (1 + effect.maxHpBonus * multiplier));
          unit.hp = unit.cfg.hp;
        }
      }
      // Health traits and astral tiles contribute before health-based equipment passives settle.
      army.forEach((unit, i) => {
        unit.maxHpGrowthMultiplier *= unit.cfg.hp;
        const bonus = equipmentMaxHpResistance(unit.cfg.hp, unit.equipment) - startingHpResistance[i];
        const previousArmor = unit.cfg.armor;
        unit.cfg.armor += bonus; unit.cfg.mr += bonus;
        unit.cfg.damageReduction = Math.min(1, (unit.cfg.damageReduction ?? 0) + unit.equipment.reduce((sum, item) => {
          const effect = item.armorDamageReduction;
          return sum + (effect && previousArmor <= effect.threshold && unit.cfg.armor > effect.threshold ? effect.bonus : 0);
        }, 0));
      });
      for(const trait of traits)if(trait.active?.demon)
        this.demon.register(side,army.filter(unit=>isTraitMember(trait,unit.cfg)),trait.active.demon);
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
    this.demon.start();
    for (const board of this.shadowBoards) this.events.push({ t: 'shadow_board', tick: 0, side: board.side });
  }

  /** 推进一个 tick；未 start 时自动 start */
  step(): void {
    if (this.finished) return;
    if (!this.started) this.start();
    this.tick++;
    for (const unit of this.units) {
      unit.combatTick = this.tick;
      for(const [source,effect] of unit.inspirations)if(effect.untilTick<=this.tick)unit.inspirations.delete(source);
      while (unit.bloodfiendStackExpiries.length && unit.bloodfiendStackExpiries[0]<=this.tick) unit.bloodfiendStackExpiries.shift();
      if (!unit.bloodfiendStackExpiries.length) unit.bloodfiendUntilTick=0;
    }
    this.updateEncounterRevive();
    if (this.checkEnd()) return;
    this.pendingDamage.length = 0;
    this.pendingStuns.length = 0;
    this.updateOvertime();
    for (const unit of this.units) this.bloodReign.trigger(unit);
    this.bloodReign.update();
    this.updateEquipment();
    this.bloodAid.update();
    this.updateHydraulicBulwarks();
    this.updateMechanicalPioneers();
    this.updateTraitRegen();
    this.updateShadows();
    this.updateAstralMeteors();
    this.sunlight.update();
    this.shadowSkills.update();
    this.sandCompass.update();
    this.ropeHunt.update();
    this.demon.update();
    this.demonSkills.update();
    this.raven.update();
    this.gunfire.update();
    this.updateNebulas();
    this.updateGravityFields();
    this.updateBurns();
    this.updateSpiderLeaps();
    this.updateFurnaceDashes();
    this.updateStellarBulwarks();
    this.updateStarLeaps();
    for (const u of this.units) { // 按 id 升序遍历，确定性
      if (!u.alive) continue;
      this.flushSpellchanterMana(u);
      u.gainMana(u.manaPerSecond * this.configs.battle.tickMs / 1000);
      this.refreshGravityState();
      this.updateUnit(u);
      this.flushSpellchanterMana(u);
    }
    this.refreshNebulaSlows();
    this.refreshGravityState();
    this.resolveDamage();
    this.refreshGravityState();
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

  private updateHydraulicBulwarks(): void {
    for (const unit of this.units) {
      const state = unit.hydraulicBulwark;
      if (!state || this.tick < state.untilTick) continue;
      unit.hydraulicBulwark = null;
      if (!unit.alive || unit.hp <= 0) continue;
      applyHealing(unit, unit, state.healAmount, this.tick, this.events);
    }
  }

  private activateOverclock(unit: Unit, emergency: boolean): void {
    const e = unit.mechanicalPioneer!;
    const ticks = (seconds: number) => Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs));
    const alreadyActive = this.tick < unit.overclockUntilTick;
    unit.overclockUntilTick = this.tick + ticks(e.durationSeconds);
    unit.overclockNextTick = unit.overclockUntilTick + ticks(e.cooldownSeconds);
    // Refreshes extend duration without postponing the next heal or granting extra pulses.
    if (!alreadyActive) unit.overclockHealTick = this.tick + ticks(1);
    this.events.push({ t: 'mechanical_overclock', tick: this.tick, id: unit.id, untilTick: unit.overclockUntilTick, emergency });
  }

  private triggerEmergencyOverclock(unit: Unit): void {
    const threshold = unit.mechanicalPioneer?.lowHealthThreshold;
    if (!threshold || unit.overclockEmergencyUsed || !unit.alive || unit.hp <= 0 || unit.hp >= unit.cfg.hp * threshold) return;
    unit.overclockEmergencyUsed = true;
    this.activateOverclock(unit, true);
  }

  private updateMechanicalPioneers(): void {
    const second = Math.max(1, Math.round(1000 / this.configs.battle.tickMs));
    for (const unit of this.units) {
      if (!unit.alive || unit.hp <= 0 || !unit.mechanicalPioneer) continue;
      this.triggerEmergencyOverclock(unit);
      // Deliver the last full second at the expiry tick before any subsequent activation.
      if (unit.overclockHealTick > 0 && this.tick >= unit.overclockHealTick && unit.overclockHealTick <= unit.overclockUntilTick) {
        unit.overclockHealTick += second;
        applyHealing(unit, unit, Math.round(unit.cfg.hp * unit.mechanicalPioneer.regenPerSecond), this.tick, this.events);
      }
      if (this.tick >= unit.overclockNextTick) this.activateOverclock(unit, false);
    }
  }

  private updateTraitRegen(): void {
    const interval = Math.max(1, Math.round(1000 / this.configs.battle.tickMs));
    if (this.tick % interval !== 0) return;
    for (const unit of this.units) {
      if (!unit.alive || unit.traitRegenPerSecond <= 0) continue;
      applyHealing(unit, unit, Math.round(unit.cfg.hp * unit.traitRegenPerSecond), this.tick, this.events);
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

  private updateAstralMeteors(): void {
    for (const { side, effect } of this.astralFields) {
      const meteor = effect.meteor;
      if (!meteor) continue;
      const interval = Math.max(1, Math.round(meteor.intervalSeconds * 1000 / this.configs.battle.tickMs));
      if (this.tick % interval !== 0) continue;
      const enemies = this.units.filter(u => u.side !== side && u.hp > 0 && this.targetable(u));
      const center = densestAstralCenter(enemies, this.w, this.h, meteor.radius);
      const source = this.units.find(u => u.side === side);
      if (!center || !source) continue;
      this.events.push({ t: 'astral_meteor', tick: this.tick, side, center, radius: meteor.radius });
      for (const dst of enemies) {
        if (hexDist(center, dst.pos) > meteor.radius) continue;
        const reduction = Math.min(1, (dst.cfg.damageReduction ?? 0)
          + dst.equipment.reduce((sum, item) => sum + (item.magicDamageReduction ?? 0), 0));
        this.pendingDamage.push({ src: source, dst, raw: meteor.damage, damageAmp: 0, resistance: dst.cfg.mr,
          reduction, type: 'magic', critical: false, targeted: true, astralMeteorSide: side });
      }
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
          if (speedPulse&&!unit.cfg.summonOnly) unit.shadowAttackSpeedBonus = Math.min(effect.attackSpeedCap, unit.shadowAttackSpeedBonus + effect.attackSpeedPerPulse);
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

  private expireStellarShield(u: Unit): void {
    if (u.stellarShield) u.shield=Math.max(0,u.shield-u.stellarShield.remaining);
    u.stellarShield=null;
  }

  private settleStellarCharge(u: Unit, interrupted=false): void {
    const state=u.stellarCharge;if(!state)return;
    const from=u.pos;
    const free=(p:{x:number;y:number})=>!this.units.some(e=>e!==u&&e.alive&&e.hp>0&&e.x===p.x&&e.y===p.y);
    if(!free(from)){
      const candidates=[state.from,...Array.from({length:this.w*this.h},(_,i)=>({x:i%this.w,y:Math.floor(i/this.w)}))];
      const legal=candidates.filter(free).sort((a,b)=>dist(a,from)-dist(b,from)||a.y-b.y||a.x-b.x)[0];
      if(legal){u.x=legal.x;u.y=legal.y;}
    }
    u.stellarCharge=null;
    if(interrupted||from.x!==u.x||from.y!==u.y)this.events.push({t:'teleport',tick:this.tick,id:u.id,from,to:u.pos});
  }

  private updateStellarBulwarks(): void {
    for(const u of this.units){
      if(u.stellarShield&&this.tick>=u.stellarShield.untilTick)this.expireStellarShield(u);
      const state=u.stellarCharge;if(!state||!u.alive||u.hp<=0)continue;
      if(this.tick<u.stunnedUntilTick||this.tick<u.fearUntilTick){this.settleStellarCharge(u,true);continue;}
      const spec=this.configs.getSkill(u.cfg.skillId!).stellarBulwark!;
      const a=offsetToWorld(state.from.x,state.from.y,1,0,0),b=offsetToWorld(state.to.x,state.to.y,1,0,0);
      const progress=Math.min(1,(this.tick-state.startTick)/(state.endTick-state.startTick));
      const cell=worldToOffset(a.x+(b.x-a.x)*progress,a.y+(b.y-a.y)*progress,1,0,0),previous=u.pos;
      u.x=cell.col;u.y=cell.row;
      const enemies=this.units.filter(e=>e.side!==u.side&&this.targetable(e)&&!state.hitIds.has(e.id));
      // Include the current hex after crossing into it; sample the whole elapsed segment at high speed.
      for(const enemy of enemies.filter(e=>e.x===u.x&&e.y===u.y||!!firstRailTarget(previous,u.pos,[e]))){
        state.hitIds.add(enemy.id);
        this.pendingStuns.push({src:u,dst:enemy,seconds:spec.knockupSeconds,knockup:true});
      }
      if(progress>=1)this.settleStellarCharge(u);
    }
  }

  private stopStarLeap(u: Unit): void {
    if (!u.starLeap) return;
    u.starLeap = null;
    this.events.push({ t: 'dash_stop', tick: this.tick, id: u.id, at: u.pos });
  }

  private updateStarLeaps(): void {
    for (const u of this.units) {
      const state = u.starLeap;
      if (!state) continue;
      if (!u.alive || u.hp <= 0 || this.tick < u.stunnedUntilTick || this.tick < u.fearUntilTick) {
        this.stopStarLeap(u); continue;
      }
      const a = offsetToWorld(state.from.x, state.from.y, 1, 0, 0), b = offsetToWorld(state.to.x, state.to.y, 1, 0, 0);
      const progress = Math.min(1, (this.tick - state.startTick) / (state.endTick - state.startTick));
      const cell = worldToOffset(a.x + (b.x - a.x) * progress, a.y + (b.y - a.y) * progress, 1, 0, 0);
      u.x = cell.col; u.y = cell.row;
      if (progress < 1) continue;
      u.starLeap = null;
      const target = this.units.find(e => e.id === state.targetId && e.side !== u.side && this.targetable(e) && u.canSelectEnemy(e));
      if (target) {
        const skill = this.configs.getSkill(u.cfg.skillId!);
        this.damage(u, target, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType, false, false, true, skill.id);
        this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: target.id, skillId: skill.id });
      }
    }
  }

  private updateFurnaceDashes(): void {
    for (const u of this.units) {
      const state = u.furnaceDash;
      if (!state || !u.alive || u.hp <= 0) continue;
      const skill = this.configs.getSkill(u.cfg.skillId!), spec = skill.furnaceDash!;
      const a = offsetToWorld(state.from.x,state.from.y,1,0,0), b = offsetToWorld(state.to.x,state.to.y,1,0,0);
      const progress = Math.min(1,(this.tick-state.startTick)/(state.endTick-state.startTick));
      const point = worldToOffset(a.x+(b.x-a.x)*progress,a.y+(b.y-a.y)*progress,1,0,0);
      const previous = u.pos; u.x=point.col;u.y=point.row;
      // Sweep each elapsed segment so fast motion cannot skip a crossed hex.
      const available = this.units.filter(e => e.side !== u.side && this.targetable(e) && !state.hitIds.has(e.id) && e.id !== state.targetId);
      while (available.length) {
        const victim = firstRailTarget(previous,u.pos,available); if (!victim) break;
        state.hitIds.add(victim.id);available.splice(available.indexOf(victim),1);
        this.damage(u,victim,spec.trailDamage[u.star-1],skill.dmgType,false,false,true,skill.id);
      }
      if (progress < 1) continue;
      u.furnaceDash=null;
      const target=this.units.find(e=>e.id===state.targetId&&e.side!==u.side&&this.targetable(e));
      if (this.units.some(e=>e!==u&&e.alive&&e.x===u.x&&e.y===u.y)) { u.x=state.from.x;u.y=state.from.y; }
      if(target && dist(u.pos,target.pos)<=1) {
        this.damage(u,target,spec.trailDamage[u.star-1],skill.dmgType,false,false,true,skill.id);
        this.damage(u,target,configuredSkillDamage(skill,u.star,u.skillScale),skill.dmgType,false,false,true,skill.id);
        this.pendingStuns.push({src:u,dst:target,seconds:spec.knockupSeconds,knockup:true});
        this.events.push({t:'skill_impact',tick:this.tick,id:u.id,target:target.id,skillId:skill.id});
      }
      u.atkCd=this.attackCooldown(u);
    }
  }

  private updateSpiderLeaps(): void {
    for (const u of this.units) {
      if (!u.spiderLeap || this.tick < u.spiderLeap.landTick) continue;
      const targetId = u.spiderLeap.targetId; u.spiderLeap = null;
      if (!u.alive || u.hp <= 0) continue;
      const target = this.units.find(e => e.id === targetId && this.targetable(e) && e.hp > 0 && e.side !== u.side);
      if (target) {
        const to = this.teleportCell(u, target);
        if (to) {
          const from = u.pos; u.x = to.x; u.y = to.y;
          this.events.push({ t: 'teleport', tick: this.tick, id: u.id, from, to });
          const skill = this.configs.getSkill(u.cfg.skillId!);
          this.damage(u, target, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType, false, false, true, skill.id);
          this.pendingDamage[this.pendingDamage.length - 1].missingHealthFraction = skill.spiderLeap!.missingHealthFractions[u.star - 1];
          this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: target.id, skillId: skill.id });
        }
      }
      u.atkCd = this.attackCooldown(u);
    }
  }

  private refreshNebulaSlows(): void {
    for(const u of this.units)u.nebulaAttackSpeedPenalty=0;
    for(const field of this.nebulas)if(this.tick<field.end)for(const enemy of this.units)
      if(enemy.side!==field.source.side&&this.targetable(enemy)&&hexDist(enemy.pos,field.center)<=field.skill.radius)
        enemy.nebulaAttackSpeedPenalty=Math.max(enemy.nebulaAttackSpeedPenalty,field.skill.nebula!.attackSpeedPenalty);
  }

  private updateNebulas(): void {
    this.nebulas=this.nebulas.filter(field=>this.tick<=field.end);
    this.refreshNebulaSlows();
    for(const field of this.nebulas)if(this.tick>=field.next){
      for(const enemy of this.units)if(enemy.side!==field.source.side&&this.targetable(enemy)&&enemy.hp>0&&hexDist(enemy.pos,field.center)<=field.skill.radius)
        this.damage(field.source,enemy,configuredSkillDamage(field.skill,field.source.star,field.source.skillScale),field.skill.dmgType,false,false,true,field.skill.id);
      field.next+=Math.max(1,Math.round(field.skill.nebula!.intervalSeconds*1000/this.configs.battle.tickMs));
    }
  }

  private refreshGravityState(): void {
    if(!this.gravityFields.length&&!this.hasGravityState)return;
    this.hasGravityState=this.gravityFields.length>0;
    for(const unit of this.units){unit.gravityResistanceBonus=0;unit.tauntSourceId=null;}
    for(const field of this.gravityFields){
      const source=field.source;
      if(!source.alive||source.hp<=0||this.tick>=field.end)continue;
      const enemies=this.units.filter(e=>e.side!==source.side&&e.alive&&e.hp>0&&hexDist(e.pos,source.pos)<=field.skill.radius);
      source.gravityResistanceBonus=enemies.length*field.skill.gravity!.resistancePerEnemy[source.star-1];
      if(this.targetable(source))for(const enemy of enemies)if(this.targetable(enemy)&&!enemy.crowdControlImmune)
        enemy.tauntSourceId=enemy.tauntSourceId===null?source.id:Math.min(enemy.tauntSourceId,source.id);
    }
  }

  private updateGravityFields(): void {
    this.gravityFields=this.gravityFields.filter(f=>f.source.alive&&f.source.hp>0&&this.tick<=f.end);
    this.refreshGravityState();
    for(const field of this.gravityFields)if(this.tick>=field.next){
      for(const enemy of this.units)if(enemy.side!==field.source.side&&enemy.hp>0&&this.targetable(enemy)&&hexDist(enemy.pos,field.source.pos)<=field.skill.radius)
        this.damage(field.source,enemy,configuredSkillDamage(field.skill,field.source.star,field.source.skillScale),field.skill.dmgType,false,false,true,field.skill.id);
      field.next+=Math.max(1,Math.round(field.skill.gravity!.intervalSeconds*1000/this.configs.battle.tickMs));
    }
  }

  private updateUnit(u: Unit) {
    if (this.demon.busy(u)||this.demonSkills.busy(u)||u.ravenFlight||u.demonGunfire) return;
    if(u.attackTargetId!==null&&!this.attackTarget(u,u.attackTargetId))this.releaseAttackTarget(u);
    if (this.ropeHunt.busy(u)) return;
    if (this.bloodReign.busy(u)) return;
    if (u.atkCd > 0) u.atkCd--;
    if (u.moveCd > 0) u.moveCd--;
    if (u.spiderLeap || u.furnaceDash || u.stellarCharge || u.starLeap) return;
    if (this.tick < u.stunnedUntilTick) {
      u.bloodCleaveWindup = null;
      if(u.pendingCast&&['windHunt','stackingCorrosion','sandCompass','ropeHunt','runicArcana','demonSkill'].includes(this.configs.getSkill(u.pendingCast.skillId).effect??''))u.pendingCast=null;
      return;
    }
    const canCast = this.tick >= u.fearUntilTick && !this.bloodAid.busy(u) && !u.bloodCleaveReady;
    if (!canCast && u.pendingCast) u.pendingCast = null;
    if (this.shadowSkills.busy(u) || this.sunlight.busy(u)) return;

    if (u.pendingCast) {
      if(u.tauntSourceId!==null&&u.pendingCast.targetId!==undefined){
        const previous=this.units.find(e=>e.id===u.pendingCast!.targetId);
        if(previous&&previous.side!==u.side)u.pendingCast.targetId=u.tauntSourceId;
      }
      const activeSkill = this.configs.getSkill(u.pendingCast.skillId);
      if (activeSkill.effect === 'healChannel' && this.tick >= u.pendingCast.nextHealTick!) {
        const heal = activeSkill.heal!;
        applyHealing(u, u, channelHealAmount(u.cfg, activeSkill, u.star), this.tick, this.events);
        u.pendingCast.nextHealTick! += Math.max(1, Math.round(heal.intervalSeconds * 1000 / this.configs.battle.tickMs));
      }
      if (--u.pendingCast.remainingTicks <= 0) {
        const skill = this.configs.getSkill(u.pendingCast.skillId);
        const targetId = u.pendingCast.targetId;
        if(skill.demonGunfire){u.pendingCast=null;this.gunfire.start(u,skill);return;}
        if(skill.ravenTheft){u.pendingCast=null;this.raven.start(u,skill,targetId);u.atkCd=this.attackCooldown(u);return;}
        if(this.demonSkills.handles(skill)){
          const direction=u.pendingCast.direction;u.pendingCast=null;
          this.demonSkills.release(u,skill,targetId,direction);u.atkCd=this.attackCooldown(u);return;
        }
        if (skill.runicArcana) {
          const toward=u.pendingCast.direction!, wave=u.pendingCast.runicWave!;
          u.pendingCast=null;
          this.releaseRunicArcana(u,skill,targetId!,toward,wave);
          u.atkCd=this.attackCooldown(u);return;
        }
        if (skill.ropeHunt) {
          u.pendingCast = null;
          this.ropeHunt.start(u,skill);
          u.atkCd=this.attackCooldown(u); return;
        }
        if (skill.sandCompass) {
          const toward = u.pendingCast.direction!;
          u.pendingCast = null;
          this.sandCompass.release(u,skill,toward);
          u.atkCd = this.attackCooldown(u); return;
        }
        if(skill.corrosion){
          u.pendingCast=null;
          const victim=this.units.find(e=>e.id===targetId&&e.side!==u.side&&e.hp>0&&this.targetable(e));
          if(victim){
            const intervalTicks=Math.max(1,Math.round(skill.corrosion.intervalSeconds*1000/this.configs.battle.tickMs));
            const pulses=Math.max(1,Math.round(skill.corrosion.durationSeconds/skill.corrosion.intervalSeconds));
            victim.burns.push({sourceId:u.id,skillId:skill.id,intervalTicks,nextTick:this.tick+intervalTicks,remainingPulses:pulses,rawDamage:skill.corrosion.damagePerPulse[u.star-1],dmgType:'magic'});
            u.corrosionTargets.add(victim.id);
            this.events.push({t:'corrosion_dose',tick:this.tick,id:u.id,target:victim.id,durationTicks:intervalTicks*pulses});
          }
          u.atkCd=this.attackCooldown(u);return;
        }
        if(skill.windHunt){
          u.pendingCast=null;u.windHuntUntilTick=this.tick+Math.max(1,Math.round(skill.windHunt.durationSeconds*1000/this.configs.battle.tickMs));
          u.windHuntSpeedBonus=skill.windHunt.attackSpeedBonuses[u.star-1];
          this.events.push({t:'wind_hunt',tick:this.tick,id:u.id,untilTick:u.windHuntUntilTick});return;
        }
        if (skill.effect === 'lineFear') {
          const toward=u.pendingCast.direction!,spec=skill.lineFear!;u.pendingCast=null;
          this.events.push({t:'line_roar',tick:this.tick,id:u.id,skillId:skill.id,from:u.pos,toward,length:spec.length,width:spec.width});
          for (const enemy of this.units) if (enemy.side!==u.side && this.targetable(enemy) && enemy.hp>0
            && inFearLine(u.pos,toward,enemy.pos,spec.length,spec.width)) {
            this.damage(u,enemy,configuredSkillDamage(skill,u.star,u.skillScale),skill.dmgType,false,false,true,skill.id);
            this.pendingStuns.push({src:u,dst:enemy,seconds:spec.fearSeconds[u.star-1],fearOrigin:u.pos});
          }
          u.atkCd=this.attackCooldown(u);return;
        }
        if (skill.effect === 'gravity') {
          u.pendingCast=null;
          const durationTicks=Math.max(1,Math.round(skill.gravity!.durationSeconds*1000/this.configs.battle.tickMs));
          this.gravityFields=this.gravityFields.filter(f=>f.source!==u);
          this.gravityFields.push({source:u,skill,end:this.tick+durationTicks,next:this.tick+Math.max(1,Math.round(skill.gravity!.intervalSeconds*1000/this.configs.battle.tickMs))});
          this.events.push({t:'gravity_field',tick:this.tick,id:u.id,center:u.pos,radius:skill.radius,durationTicks});
          this.refreshGravityState();u.atkCd=this.attackCooldown(u);return;
        }
        if (skill.effect === 'nebula') {
          u.pendingCast = null;
          const center = densestAstralCenter(this.units.filter(e=>e.side!==u.side&&this.targetable(e)&&e.hp>0).map(e=>e.pos),this.w,this.h,skill.radius);
          if (center) {
            const spec=skill.nebula!,durationTicks=Math.max(1,Math.round(spec.durationSeconds*1000/this.configs.battle.tickMs));
            this.nebulas.push({source:u,skill,center,end:this.tick+durationTicks,
              next:this.tick+Math.max(1,Math.round(spec.intervalSeconds*1000/this.configs.battle.tickMs))});
            this.events.push({t:'nebula',tick:this.tick,id:u.id,center,radius:skill.radius,durationTicks});
            this.refreshNebulaSlows();
          }
          u.atkCd=this.attackCooldown(u);return;
        }
        if (skill.effect === 'arrowVolley') {
          const victim = this.units.find(e => e.id === targetId && e.side !== u.side && this.targetable(e) && e.hp > 0);
          if (victim) {
            this.events.push({ t: 'moon_arrow', tick: this.tick, id: u.id, target: victim.id, from: u.pos, to: victim.pos });
            this.damage(u, victim, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType, false, false, true, skill.id);
          }
          if (!victim || --u.pendingCast.shotsRemaining! <= 0) {
            u.pendingCast = null;
            u.atkCd = this.attackCooldown(u);
          } else u.pendingCast.remainingTicks = Math.max(1, Math.round(skill.arrowVolley!.intervalSeconds * 1000 / this.configs.battle.tickMs));
          return;
        }
        u.pendingCast = null;
        if (skill.effect === 'spiderLeap') {
          u.spiderLeap = { targetId: targetId!, landTick: this.tick + Math.max(1, Math.round(skill.spiderLeap!.airborneSeconds * 1000 / this.configs.battle.tickMs)) };
          return;
        }
        if (skill.effect === 'railShot') {
          const target = this.units.find(e => e.id === targetId && this.targetable(e) && e.side !== u.side);
          if (target) {
            const victim = firstRailTarget(u.pos, target.pos, this.units.filter(e => e.side !== u.side && this.targetable(e)));
            if (victim) {
              this.damage(u, victim, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType, false, false, true, skill.id);
              this.events.push({ t: 'rail_shot', tick: this.tick, id: u.id, target: victim.id, from: u.pos, to: victim.pos });
            }
          }
          u.atkCd = this.attackCooldown(u);
          return;
        }
        if (skill.effect === 'sunlight') { this.sunlight.activate(u, skill, targetId); return; }
        if (skill.effect === 'shadow') {
          this.shadowSkills.activate(u, skill, targetId);
          return;
        }
        if (skill.effect === 'healAlly') {
          const ally = this.units.find(e => e.id === targetId && e.alive && e.side === u.side);
          if (ally) {
            const amount = applyHealing(u, ally, Math.round(skill.healAmounts![u.star - 1] * (1 + (u.cfg.spellPower ?? 0) / 100)), this.tick, this.events);
            if (amount > 0) {
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
        if (skill.effect === 'damageStun' || skill.effect === 'chargedKnockup') {
          const knockup = skill.effect === 'chargedKnockup';
          const victim = this.units.find(e => e.id === targetId && this.targetable(e) && e.hp > 0 && e.side !== u.side
            && (!knockup || dist(u.pos, e.pos) <= u.cfg.range));
          if (victim) {
            this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: victim.id, skillId: skill.id });
            this.damage(u, victim, configuredSkillDamage(skill, u.star, u.skillScale), skill.dmgType);
            this.pendingStuns.push({ src: u, dst: victim, seconds: knockup ? skill.chargedKnockup!.durationsSeconds[u.star - 1] : skill.stunSeconds![u.star - 1], ...(knockup ? { knockup: true } : {}) });
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
    if(canCast&&teleportSkill?.ravenTheft&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0){
      const target=this.raven.target(u,teleportSkill);if(target){this.beginDemonCast(u,teleportSkill,target);return;}
    }
    if(canCast&&teleportSkill?.redhornFervor&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0){
      this.beginDemonCast(u,teleportSkill,u);return;
    }
    if(canCast&&teleportSkill?.demonLeap&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0)
      if(this.demon.begin(u,teleportSkill))return;
    if (canCast && teleportSkill?.ropeHunt && u.cfg.maxMana>0 && u.mana>=u.cfg.maxMana && u.atkCd===0) {
      const target=this.nearestEnemy(u);
      if(target){
        const duration=teleportSkill.castSeconds!;
        u.expeditionCastTicks=Math.max(1,Math.round(duration*1000/this.configs.battle.tickMs));
        u.mana=0;u.pendingCast={skillId:teleportSkill.id,targetId:target.id,remainingTicks:u.expeditionCastTicks};
        this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration}); return;
      }
    }
    if(canCast&&teleportSkill?.corrosion&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0){
      const target=this.units.filter(e=>e.side!==u.side&&e.hp>0&&this.targetable(e)&&u.canSelectEnemy(e))
        .sort((a,b)=>Number(u.corrosionTargets.has(a.id))-Number(u.corrosionTargets.has(b.id))||dist(u.pos,a.pos)-dist(u.pos,b.pos)||a.id-b.id)[0];
      if(target){
        u.mana=0;u.pendingCast={skillId:teleportSkill.id,targetId:target.id,remainingTicks:Math.max(1,Math.round(teleportSkill.castSeconds!*1000/this.configs.battle.tickMs))};
        this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration:teleportSkill.castSeconds!});return;
      }
    }
    if(canCast&&teleportSkill?.effect==='windHunt'&&!u.windHuntActive&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0){
      u.windHuntCastTicks=Math.max(1,Math.round(teleportSkill.castSeconds!*1000/this.configs.battle.tickMs));
      u.mana=0;u.pendingCast={skillId:teleportSkill.id,remainingTicks:u.windHuntCastTicks};
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:u.id,skillId:teleportSkill.id,duration:teleportSkill.castSeconds!});return;
    }
    if(canCast&&teleportSkill?.effect==='inspiration'&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0){
      const e=teleportSkill.inspiration!,durationTicks=Math.max(1,Math.round(e.durationSeconds*1000/this.configs.battle.tickMs));
      const bonus=e.attackSpeedBonuses[u.star-1]*(1+(u.cfg.spellPower??0)/100);
      const targets=this.units.filter(ally=>ally.side===u.side&&ally.alive&&ally.hp>0&&dist(u.pos,ally.pos)<=teleportSkill.radius);
      u.mana=0;
      for(const ally of targets)ally.inspirations.set(u.id,{startTick:this.tick,untilTick:this.tick+durationTicks,initialBonus:bonus});
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:u.id,skillId:teleportSkill.id,duration:0});
      this.events.push({t:'inspiration',tick:this.tick,id:u.id,targets:targets.map(ally=>ally.id),durationTicks,bonus});
      u.atkCd=this.attackCooldown(u);return;
    }
    if(canCast && teleportSkill?.effect==='bloodAid' && u.cfg.maxMana>0 && u.mana>=u.cfg.maxMana && u.atkCd===0){
      const ally=this.bloodAid.target(u);
      if(ally){this.cast(u,teleportSkill,ally);return;}
    }
    if (canCast && teleportSkill?.effect === 'hydraulicBulwark' && !u.hydraulicBulwark && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      u.mana = 0;
      u.hydraulicBulwark = { untilTick: this.tick + Math.max(1, Math.round(teleportSkill.hydraulicBulwark!.durationSeconds * 1000 / this.configs.battle.tickMs)),
        ...hydraulicBulwarkValues(u.cfg, teleportSkill, u.star) };
      this.emitCast({ t: 'cast', tick: this.tick, id: u.id, target: u.id, skillId: teleportSkill.id, duration: 0 });
      return;
    }
    if (canCast && teleportSkill?.effect === 'sunlight' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const target = this.sunlight.target(u, teleportSkill);
      if (target) {
        const duration = teleportSkill.castSeconds ?? 0;
        u.mana = 0;
        this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: target.id, duration });
        if (duration > 0) u.pendingCast = { skillId: teleportSkill.id, targetId: target.id, remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
        else this.sunlight.activate(u, teleportSkill, target.id);
        return;
      }
    }
    if (canCast && teleportSkill?.effect === 'shadow' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const target = this.shadowSkills.target(u, teleportSkill);
      if (target) {
        const duration = teleportSkill.castSeconds ?? 0.5;
        const castTarget = ['bulwark','domain','soulLamp','empower'].includes(teleportSkill.shadow!.kind) ? u : target;
        u.mana = 0; u.pendingCast = { skillId: teleportSkill.id, targetId: castTarget.id, remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
        this.emitCast({ t: 'cast', tick: this.tick, id: u.id, target: castTarget.id, skillId: teleportSkill.id, duration });
        return;
      }
    }
    if (canCast && teleportSkill?.effect === 'susanoo' && this.tick >= u.susanooUntilTick && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      u.mana = 0;
      u.susanooUntilTick = this.tick + Math.max(1, Math.round(teleportSkill.formDurations![u.star - 1]
        * (1 + (u.cfg.physicalPower ?? 0) / 100) * 1000 / this.configs.battle.tickMs));
      u.susanooReduction = teleportSkill.formReductions![u.star - 1];
      this.emitCast({ t: 'cast', tick: this.tick, id: u.id, target: u.id, skillId: teleportSkill.id, duration: 0 });
      return;
    }
    if (canCast && teleportSkill?.effect === 'atlasMissiles' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const spec=teleportSkill.atlasMissiles!;
      const targets=this.units.filter(e=>e.side!==u.side&&this.targetable(e)&&u.canSelectEnemy(e))
        .sort((a,b)=>dist(u.pos,a.pos)-dist(u.pos,b.pos)||a.id-b.id).slice(0,spec.targetCounts[u.star-1]);
      if(targets.length) {
        u.mana=0;u.atkCd=this.attackCooldown(u);
        const reduction=Math.min(spec.manaReductionPerCast,spec.maxManaReduction-u.atlasManaReduction,Math.max(0,u.cfg.maxMana-1));
        u.cfg.maxMana-=reduction;u.atlasManaReduction+=reduction;
        this.emitCast({t:'cast',tick:this.tick,id:u.id,target:targets[0].id,skillId:teleportSkill.id,duration:0});
        for(const target of targets) {
          this.damage(u,target,configuredSkillDamage(teleportSkill,u.star,u.skillScale),teleportSkill.dmgType,false,false,true,teleportSkill.id);
          this.events.push({t:'missile',tick:this.tick,id:u.id,target:target.id,from:u.pos,to:target.pos});
        }
        return;
      }
    }
    if (canCast && teleportSkill?.effect === 'furnaceDash' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const spec=teleportSkill.furnaceDash!;
      const target=this.units.filter(e=>e.side!==u.side&&this.targetable(e)&&u.canSelectEnemy(e)&&dist(u.pos,e.pos)<=spec.targetRange)
        .sort((a,b)=>dist(u.pos,b.pos)-dist(u.pos,a.pos)||a.id-b.id).find(e=>!!this.teleportCell(u,e));
      if(target) {
        const to=this.teleportCell(u,target)!,from=u.pos;
        const duration=Math.max(1,Math.ceil(Math.max(1,dist(from,to))*u.cfg.moveTicks/spec.speedMultiplier));
        u.mana=0;u.furnaceDash={from,to,startTick:this.tick,endTick:this.tick+duration,targetId:target.id,hitIds:new Set()};
        this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration:0});
        this.events.push({t:'dash',tick:this.tick,id:u.id,from,to,durationTicks:duration});return;
      }
    }
    if (canCast && (teleportSkill?.effect === 'railShot' || teleportSkill?.effect === 'spiderLeap') && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const target = this.units.filter(e => e.side !== u.side && this.targetable(e) && u.canSelectEnemy(e))
        .sort((a, b) => dist(u.pos, b.pos) - dist(u.pos, a.pos) || a.id - b.id)[0];
      if (target) {
        u.mana = 0;
        u.pendingCast = { skillId: teleportSkill.id, targetId: target.id, remainingTicks: Math.max(1, Math.round(teleportSkill.castSeconds! * 1000 / this.configs.battle.tickMs)) };
        this.emitCast({ t: 'cast', tick: this.tick, id: u.id, target: target.id, skillId: teleportSkill.id, duration: teleportSkill.castSeconds });
        return;
      }
    }
    if (canCast && teleportSkill?.effect === 'lowestHealthHeal' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const allies = this.units.filter(e => e.alive && e.hp > 0 && e.side === u.side && e.hp < e.cfg.hp)
        .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)
        .slice(0, teleportSkill.healTargetCounts![u.star - 1]);
      if (allies.length) {
        u.mana = 0; u.atkCd = this.attackCooldown(u);
        this.emitCast({ t: 'cast', tick: this.tick, id: u.id, target: allies[0].id, skillId: teleportSkill.id, duration: 0 });
        const value = Math.round(teleportSkill.healAmounts![u.star - 1] * (1 + (u.cfg.spellPower ?? 0) / 100));
        for (const ally of allies) {
          const amount = applyHealing(u, ally, value, this.tick, this.events);
          if (amount <= 0) continue;
          this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: ally.id, skillId: teleportSkill.id });
        }
        return;
      }
    }
    if (canCast && teleportSkill?.effect === 'healAlly' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const ally = this.units.filter(e => e.alive && e.side === u.side && e.hp < e.cfg.hp && dist(u.pos, e.pos) <= (teleportSkill.targetRange ?? u.cfg.range))
        .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)[0];
      if (ally) { this.cast(u, teleportSkill, ally); return; }
    }
    if (canCast && (teleportSkill?.effect === 'healChannel' || teleportSkill?.effect === 'selfShield') && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0) {
      const duration = teleportSkill.castSeconds!;
      u.mana = 0;
      u.pendingCast = { skillId: teleportSkill.id,
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)),
        nextHealTick: teleportSkill.heal ? this.tick + Math.max(1, Math.round(teleportSkill.heal.intervalSeconds * 1000 / this.configs.battle.tickMs)) : undefined };
      this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: u.id, duration });
      return;
    }
    if (canCast && teleportSkill?.effect === 'teleportEmpower' && u.mana >= u.cfg.maxMana && u.cfg.maxMana > 0 && u.atkCd === 0) {
      const victim = this.teleportTarget(u, teleportSkill);
      if (victim) {
        u.mana = 0;
        u.attackSpeedBonus = teleportSkill.attackSpeedBonuses?.[u.star - 1] ?? 0;
        u.manaLocked = teleportSkill.manaLockDuringEmpower ?? false;
        u.pendingCast = { skillId: teleportSkill.id, remainingTicks: Math.max(1, Math.round((teleportSkill.castSeconds ?? 0.3) * 1000 / this.configs.battle.tickMs)) };
        this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: teleportSkill.id, target: victim.id, duration: teleportSkill.castSeconds ?? 0.3 });
        return;
      }
    }

    const priority = this.units.find(e => e.id === u.priorityTarget && this.targetable(e) && u.canSelectEnemy(e) && e.side !== u.side && dist(u.pos, e.pos) <= u.cfg.range);
    const preparedTarget = u.bloodCleaveWindup && this.units.find(e => e.id === u.bloodCleaveWindup!.targetId
      && this.targetable(e) && e.hp>0 && u.canSelectEnemy(e) && e.side!==u.side && dist(u.pos,e.pos)<=u.cfg.range
      && (u.tauntSourceId===null||u.tauntSourceId===e.id));
    const target = this.selectAttackTarget(u, priority ?? preparedTarget ?? null);
    if (!target) { u.bloodCleaveWindup = null; return; }

    const d = dist(u.pos, target.pos);
    if(d<=u.cfg.range)u.blockedTargetSinceTick=null;
    if(canCast&&teleportSkill?.demonGunfire&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0&&d<=u.cfg.range){
      this.gunfire.prepare(u);
      u.expeditionCastTicks=Math.max(1,Math.round(teleportSkill.castSeconds!*1000/this.configs.battle.tickMs));
      u.pendingCast={skillId:teleportSkill.id,targetId:target.id,remainingTicks:u.expeditionCastTicks};
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration:teleportSkill.castSeconds});return;
    }
    if(canCast&&teleportSkill&&this.demonSkills.handles(teleportSkill)&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0&&d<=u.cfg.range){
      this.beginDemonCast(u,teleportSkill,target);return;
    }

    if(canCast&&teleportSkill?.runicArcana&&u.cfg.maxMana>0&&u.mana>=u.cfg.maxMana&&u.atkCd===0&&d<=u.cfg.range){
      const wave=u.runicRunes>=teleportSkill.runicArcana.maxRunes;
      const duration=wave?teleportSkill.runicArcana.chargeSeconds:teleportSkill.castSeconds!;
      u.expeditionCastTicks=Math.max(1,Math.round(duration*1000/this.configs.battle.tickMs));
      u.mana=0;u.pendingCast={skillId:teleportSkill.id,targetId:target.id,direction:target.pos,runicWave:wave,remainingTicks:u.expeditionCastTicks};
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration});return;
    }

    if (canCast && teleportSkill?.effect === 'sandCompass' && u.cfg.maxMana>0 && u.mana>=u.cfg.maxMana && u.atkCd===0 && d<=u.cfg.range) {
      const duration = teleportSkill.castSeconds!;
      u.expeditionCastTicks=Math.max(1,Math.round(duration*1000/this.configs.battle.tickMs));
      u.mana=0; u.pendingCast={skillId:teleportSkill.id,targetId:target.id,direction:target.pos,remainingTicks:u.expeditionCastTicks};
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration}); return;
    }

    if (canCast && teleportSkill?.effect === 'starLeap' && u.cfg.maxMana>0 && u.mana>=u.cfg.maxMana && u.atkCd===0 && d<=u.cfg.range) {
      const from=u.pos;
      const to=hexNeighbors(from.x,from.y).filter(p=>p.x>=0&&p.x<this.w&&p.y>=0&&p.y<this.h&&!this.occupied(p.x,p.y))
        .sort((a,b)=>dist(a,target.pos)-dist(b,target.pos)||a.y-b.y||a.x-b.x)[0];
      u.mana=0;
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration:0});
      if(to){
        const durationTicks=Math.max(1,Math.round(teleportSkill.starLeap!.durationSeconds*1000/this.configs.battle.tickMs));
        u.starLeap={from,to,startTick:this.tick,endTick:this.tick+durationTicks,targetId:target.id};
        this.events.push({t:'dash',tick:this.tick,id:u.id,from,to,durationTicks});
      }else{
        this.damage(u,target,configuredSkillDamage(teleportSkill,u.star,u.skillScale),'magic',false,false,true,teleportSkill.id);
        this.events.push({t:'skill_impact',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id});
      }
      u.atkCd=this.attackCooldown(u);return;
    }

    if (canCast && teleportSkill?.effect === 'stellarBulwark' && u.cfg.maxMana>0 && u.mana>=u.cfg.maxMana && u.atkCd===0 && d<=u.cfg.range) {
      const spec=teleportSkill.stellarBulwark!,from=u.pos;
      const ray=stellarChargeRay(from,target.pos,spec.distance,this.w,this.h);
      const to=[...ray].reverse().find(p=>!this.occupied(p.x,p.y))??from;
      u.mana=0;this.expireStellarShield(u);
      const amount=configuredShieldAmount(u.cfg,teleportSkill,u.star);
      u.stellarShield={remaining:amount,untilTick:this.tick+Math.max(1,Math.round(spec.shieldSeconds*1000/this.configs.battle.tickMs))};
      u.shield+=amount;
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:teleportSkill.id,duration:0});
      this.events.push({t:'shield',tick:this.tick,id:u.id,source:u.id,amount,shield:u.shield});
      if(dist(from,to)>0){
        const durationTicks=Math.max(1,Math.ceil(dist(from,to)*u.cfg.moveTicks/spec.speedMultiplier));
        u.stellarCharge={from,to,startTick:this.tick,endTick:this.tick+durationTicks,hitIds:new Set()};
        this.events.push({t:'dash',tick:this.tick,id:u.id,from,to,durationTicks});
      }
      u.atkCd=this.attackCooldown(u);return;
    }

    // 1. 蓝满施法（需在射程内）
    if (canCast && u.cfg.skillId && !['railShot','spiderLeap','furnaceDash','stellarBulwark','starLeap','windHunt','inspiration','lanternGuard','stackingCorrosion','sandCompass','ropeHunt','runicArcana','demonLeap','demonSkill'].includes(teleportSkill?.effect ?? '') && teleportSkill?.effect !== 'bloodAid' && teleportSkill?.effect !== 'lowestHealthHeal' && teleportSkill?.effect !== 'hydraulicBulwark' && teleportSkill?.effect !== 'sunlight' && teleportSkill?.effect !== 'shadow' && teleportSkill?.effect !== 'susanoo' && teleportSkill?.effect !== 'teleportEmpower' && teleportSkill?.effect !== 'healAlly' && u.cfg.maxMana > 0 && u.mana >= u.cfg.maxMana && u.atkCd === 0 && d <= u.cfg.range) {
      const skill = this.configs.getSkill(u.cfg.skillId);
      const castTarget = skill.targeting === 'lowestHp'
        ? this.units.filter(e => this.targetable(e) && u.canSelectEnemy(e) && e.side !== u.side && dist(u.pos, e.pos) <= u.cfg.range)
          .sort((a, b) => a.hp / a.cfg.hp - b.hp / b.cfg.hp || a.id - b.id)[0] : target;
      this.cast(u, skill, castTarget);
      return;
    }
    // 2. 射程内攻击
    if (d <= u.cfg.range) {
      if (u.atkCd === 0) {
        if (this.bloodReign.prepareBasic(u,target)) return;
        const empowered = u.permanentEmpower || u.empoweredAttacks > 0;
        this.events.push({ t: 'attack', tick: this.tick, id: u.id, target: target.id,
          ...(u.shadowAttack ? { shadow: true } : {}),
          ...(this.tick < u.susanooUntilTick ? { area: true } : {}) });
        if (u.equipment.some(item => item.attackSpeedPerAttack > 0 || (item.physicalPowerPerAttack ?? 0) > 0)) u.equipmentAttackStacks++;
        u.cfg.physicalPower = (u.cfg.physicalPower ?? 0) + u.equipment.reduce((sum, item) => sum + (item.physicalPowerPerAttack ?? 0), 0);
        const damage = empowered ? u.empoweredAttackDamage : u.cfg.atk;
        let attackCritical: boolean | undefined;
        if (this.tick < u.susanooUntilTick) {
          for (const enemy of this.units) {
            if (enemy.alive && enemy.side !== u.side && dist(enemy.pos, target.pos) <= teleportSkill!.radius) {
              const critical = this.damage(u, enemy, damage + (teleportSkill!.formBonusDamage?.[u.star - 1] ?? 0), 'physical', true, false, enemy === target);
              if (enemy === target) attackCritical = critical;
            }
          }
        } else attackCritical = this.damage(u, target, damage, 'physical', true);
        if (u.spellbladeAttacks > 0 && u.spellblade?.empoweredAttacks) {
          u.spellbladeAttacks--;
          // One charge per basic attack, on its primary target, sharing the basic's crit roll.
          this.damage(u, target, u.spellblade.empoweredAttacks.damage, 'magic', false, false, true, undefined, attackCritical);
        }
        this.shadowSkills.onBasicAttack(u, target);
        this.sunlight.onBasicAttack(u, target);
        this.bloodAid.onBasicAttack(u, target);
        this.bloodReign.onBasicAttack(u, target);
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
    u.bloodCleaveWindup = null;
    // 3. 射程外移动（BFS 绕开占位）
    if (u.moveCd === 0 && !u.hydraulicRooted && !this.bloodAid.busy(u)) {
      const step = nextStep(
        u.pos, this.w, this.h,
        (x, y) => this.occupied(x, y),
        (x, y) => dist({ x, y }, target.pos) <= u.cfg.range,
      );
      if (step) {
        const from = { x: u.x, y: u.y };
        u.x = step.x;
        u.y = step.y;
        u.blockedTargetSinceTick=null;
        u.moveCd = this.configs.battle.movementCellsPerSecond===undefined ? u.cfg.moveTicks
          : Math.max(1,Math.round(1000/this.configs.battle.tickMs/this.configs.battle.movementCellsPerSecond));
        this.events.push({ t: 'move', tick: this.tick, id: u.id, from, to: { ...step }, durationTicks:u.moveCd });
      } else if(u.blockedTargetSinceTick===null) {
        u.blockedTargetSinceTick=this.tick;
      } else if(this.tick-u.blockedTargetSinceTick>=this.attackCooldown(u)) {
        this.releaseAttackTarget(u);
      }
    }
  }

  private beginDemonCast(unit:Unit,skill:SkillConfigData,target:Unit):void {
    unit.mana=0;unit.expeditionCastTicks=Math.max(1,Math.round(skill.castSeconds!*1000/this.configs.battle.tickMs));
    unit.pendingCast={skillId:skill.id,targetId:target.id,direction:target.pos,remainingTicks:unit.expeditionCastTicks};
    this.emitCast({t:'cast',tick:this.tick,id:unit.id,target:target.id,skillId:skill.id,duration:skill.castSeconds});
  }

  private cast(u: Unit, sk: SkillConfigData, mainTarget: Unit) {
    if (this.tick < u.fearUntilTick || this.bloodReign.busy(u)) return;
    if (sk.effect === 'bloodReign') {
      if (u.bloodCleaveReady) return;
      u.mana = 0;
      this.emitCast({t:'cast',tick:this.tick,id:u.id,target:mainTarget.id,skillId:sk.id,duration:0});
      this.bloodReign.cast(u,sk);
      return;
    }
    if(sk.effect==='bloodAid'){
      if(this.bloodAid.busy(u))return;
      const target=this.bloodAid.target(u);
      if(!target)return;
      this.bloodAid.activate(u,target,sk,()=>{
        u.mana=0;
        this.emitCast({t:'cast',tick:this.tick,id:u.id,target:target.id,skillId:sk.id,duration:sk.bloodAid!.staySeconds});
      });
      return;
    }
    u.mana = 0;
    if (sk.effect === 'nebula' || sk.effect === 'gravity') {
      u.pendingCast = {skillId:sk.id,remainingTicks:Math.max(1,Math.round(sk.castSeconds!*1000/this.configs.battle.tickMs))};
      this.emitCast({t:'cast',tick:this.tick,id:u.id,skillId:sk.id,target:mainTarget.id,duration:sk.castSeconds});return;
    }
    if (sk.effect === 'arrowVolley') {
      const duration = sk.castSeconds!;
      u.pendingCast = { skillId: sk.id, targetId: mainTarget.id, shotsRemaining: sk.arrowVolley!.count,
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
      this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id,
        duration: duration + (sk.arrowVolley!.count - 1) * sk.arrowVolley!.intervalSeconds });
      return;
    }
    if (sk.effect === 'damageBurn' || sk.effect === 'damageStun' || sk.effect === 'chargedKnockup' || sk.effect === 'lineFear' || sk.effect === 'knockupGuard' || sk.effect === 'splitPhysical' || sk.effect === 'delayedDamage' || sk.effect === 'delayedArea' || sk.effect === 'healAlly') {
      const duration = sk.castSeconds ?? 0.5;
      u.pendingCast = { skillId: sk.id, targetId: mainTarget.id,
        ...(sk.effect === 'lineFear' ? {direction: {...mainTarget.pos}} : {}),
        remainingTicks: Math.max(1, Math.round(duration * 1000 / this.configs.battle.tickMs)) };
      this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id, duration });
      return;
    }
    this.emitCast({ t: 'cast', tick: this.tick, id: u.id, skillId: sk.id, target: mainTarget.id });
    u.atkCd = this.attackCooldown(u);
    if (sk.effect === 'bloodDrain') {
      this.damage(u, mainTarget, configuredSkillDamage(sk, u.star, u.skillScale), sk.dmgType, false, false, true, sk.id);
      this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: mainTarget.id, skillId: sk.id });
      return;
    }
    if (sk.effect === 'strikeHealOnKill') {
      this.damage(u, mainTarget, configuredSkillDamage(sk, u.star, u.skillScale), sk.dmgType, false, false, true, sk.id);
      this.events.push({ t: 'skill_impact', tick: this.tick, id: u.id, target: mainTarget.id, skillId: sk.id });
      return;
    }
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

  private applyAtlasBurn(src: Unit, dst: Unit, skill: SkillConfigData): void {
    if(dst.burns.some(b=>b.skillId===skill.id)) return;
    const burn=skill.burn!,intervalTicks=Math.max(1,Math.round(burn.intervalSeconds*1000/this.configs.battle.tickMs));
    dst.burns.push({sourceId:src.id,skillId:skill.id,nextTick:this.tick+intervalTicks,intervalTicks,remainingPulses:0,
      rawDamage:dst.cfg.hp*burn.maxHpFraction,dmgType:burn.dmgType,untilBattleEnd:true,fixed:true});
    this.events.push({t:'burn',tick:this.tick,id:dst.id,source:src.id,duration:Math.max(0,this.maxTicks-this.tick)*this.configs.battle.tickMs/1000});
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
    for (const { src, dst, seconds, knockup, fearOrigin, pullSeconds } of this.pendingStuns) {
      if(dst.hp<=0||!dst.alive)continue;
      if (dst.crowdControlImmune) continue;
      if (this.tick < dst.susanooUntilTick) continue;
      if (!this.targetable(dst)) continue;
      const ticks = Math.max(1, Math.round(seconds * 1000 / this.configs.battle.tickMs));
      if (fearOrigin) { dst.fearUntilTick = Math.max(dst.fearUntilTick, this.tick + ticks + 1); dst.fearOrigin = { ...fearOrigin }; }
      else dst.stunnedUntilTick = Math.max(dst.stunnedUntilTick, this.tick + ticks + 1);
      dst.pendingCast = null;
      this.demonSkills.interrupt(dst);
      this.raven.interrupt(dst);
      this.gunfire.interrupt(dst);
      this.bloodAid.interrupt(dst);
      this.stopStarLeap(dst);
      if(dst.stellarCharge)this.settleStellarCharge(dst,true);
      if (dst.furnaceDash) {
        const from=dst.pos, origin=dst.furnaceDash.from;
        if (this.units.some(e=>e!==dst&&e.alive&&e.x===dst.x&&e.y===dst.y)) {
          const free=[origin,...hexNeighbors(dst.x,dst.y)].find(p=>p.x>=0&&p.y>=0&&p.x<this.w&&p.y<this.h&&!this.occupied(p.x,p.y));
          if(free){dst.x=free.x;dst.y=free.y;}
        }
        dst.furnaceDash = null;
        this.events.push({t:'teleport',tick:this.tick,id:dst.id,from,to:dst.pos});
      }
      this.shadowSkills.interrupt(dst);
      this.sunlight.interrupt(dst);
      if(pullSeconds){
        this.ropeHunt.stop(dst);
        const from=dst.pos;
        const to=hexNeighbors(src.x,src.y)
          .filter(p=>p.x>=0&&p.y>=0&&p.x<this.w&&p.y<this.h&&(p.x!==from.x||p.y!==from.y)&&!this.occupied(p.x,p.y))
          .sort((a,b)=>dist(a,from)-dist(b,from)||a.y-b.y||a.x-b.x)[0];
        if(to){
          dst.x=to.x;dst.y=to.y;
          this.events.push({t:'thorn_pull',tick:this.tick,id:dst.id,source:src.id,from,to,durationTicks:Math.max(1,Math.round(pullSeconds*1000/this.configs.battle.tickMs))});
        }
      }
      if (!dst.permanentEmpower && dst.empoweredAttacks === 0) {
        dst.attackSpeedBonus = 0;
        dst.manaLocked = false;
      }
      this.events.push({ t: fearOrigin ? 'fear' : knockup ? 'knockup' : 'stun', tick: this.tick, id: dst.id, source: src.id, duration: seconds });
      this.flushSpellchanterMana(dst);
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
        if (burn.fixed) this.pendingDamage.push({src,dst,raw:burn.rawDamage,damageAmp:0,resistance:0,reduction:0,type:burn.dmgType,critical:false,targeted:false,fixed:true});
        else this.damage(src, dst, burn.rawDamage, burn.dmgType, false, false, false);
        burn.remainingPulses--;
        burn.nextTick += burn.intervalTicks;
      }
      dst.burns = dst.burns.filter(b => b.untilBattleEnd || b.remainingPulses > 0);
    }
  }

  private teleportCell(u: Unit, target: Unit) {
    return hexNeighbors(target.x, target.y)
      .filter(p => p.x >= 0 && p.y >= 0 && p.x < this.w && p.y < this.h
        && ((p.x === u.x && p.y === u.y) || !this.occupied(p.x, p.y)))
      .sort((a, b) => dist(u.pos, a) - dist(u.pos, b) || a.y - b.y || a.x - b.x)[0];
  }

  private teleportTarget(u: Unit, skill: SkillConfigData): Unit | undefined {
    return this.units.filter(e => this.targetable(e) && u.canSelectEnemy(e) && e.side !== u.side && dist(u.pos, e.pos) <= (skill.targetRange ?? 3))
      .sort((a, b) => a.hp - b.hp || a.id - b.id)
      .find(e => !!this.teleportCell(u, e));
  }

  /** 伤害公式：物理 dmg = atk * 100 / (100 + armor)，魔法走 mr，真实伤害无视抗性，最低 1 */
  private damage(src: Unit, dst: Unit, raw: number, type: 'physical' | 'magic' | 'true', basicAttack = false, typeBonusApplied = false, targeted = true, skillId?: string, criticalOverride?: boolean) {
    const critical = criticalOverride ?? ((basicAttack || src.cfg.skillCanCrit === true) && src.cfg.critChance! > 0 && this.rng.next() < src.cfg.critChance!);
    const configuredCrit = this.configs.battle.criticalMultiplier ?? 1.5;
    const critMultiplier = critical ? (Number.isFinite(configuredCrit) && configuredCrit >= 1 ? configuredCrit : 1.5) : 1;
    const queue = (amount: number, damageType: 'physical' | 'magic' | 'true', bonusApplied: boolean) => {
      const resistance = damageType === 'physical' ? dst.cfg.armor : damageType === 'magic' ? dst.cfg.mr : 0;
      const multiplier = bonusApplied ? 1 : 1 + (damageType === 'physical' ? src.physicalPower : damageType === 'magic' ? src.cfg.spellPower! : 0) / 100;
      const reduction = Math.min(1, dst.cfg.damageReduction! + (damageType === 'magic'
        ? dst.equipment.reduce((sum, item) => sum + (item.magicDamageReduction ?? 0), 0) : 0));
      this.pendingDamage.push({ src, dst, raw: amount * multiplier * critMultiplier,
        damageAmp: src.damageAmp - src.conquerorDamageAmp, resistance, reduction, type: damageType, critical, targeted, basicAttack, skillId });
    };
    const extra = basicAttack ? src.traitAttackDamage : 0;
    // Physical basics share one damage/crit roll. Replaced basics keep their extra physical component.
    if (extra > 0 && type === 'physical' && !typeBonusApplied) queue(raw + extra, type, false);
    else {
      queue(raw, type, typeBonusApplied);
      if (extra > 0) queue(extra, 'physical', false);
    }
    return critical;
  }

  /** Every unit alive at tick start can act; deaths are applied after all damage. */
  private resolveDamage(): void {
    const healing = new Map<Unit, number>();
    const alliedKills: Side[] = [];
    for (let hitIndex=0;hitIndex<this.pendingDamage.length;hitIndex++) {
      const hit=this.pendingDamage[hitIndex];
      const { src, dst, raw, damageAmp, resistance, reduction, type, critical, targeted, basicAttack, fixed, shadowBoardSide, sunlightJudgmentSide, sunlightJudgmentStar, astralMeteorSide, skillId, missingHealthFraction }=hit;
      if(this.gravityFields.length)this.refreshGravityState();
      const astral = astralMeteorSide !== undefined;
      if (targeted && !this.targetable(dst)) {
        this.sunlight.onHitResolved(src, dst, skillId, false);
        continue;
      }
      if(hit.missingTrueFraction!==undefined&&dst.hp>0){
        // Capture missing health before the physical strike; the true component never gains physical/AP scaling.
        const bonus=Math.max(0,dst.cfg.hp-dst.hp)*hit.missingTrueFraction*(critical?(this.configs.battle.criticalMultiplier??1.5):1);
        if(bonus>0)this.pendingDamage.splice(hitIndex+1,0,{...hit,raw:bonus,type:'true',resistance:0,missingTrueFraction:undefined});
      }
      // Evaluate execute bonuses against HP immediately before each hit, including queued hits.
      const extraAmp = astral ? 0 : src.equipment.reduce((sum, item) => {
        const effect = item.lowTargetDamageAmp;
        return sum + (effect && dst.hp < dst.cfg.hp * effect.threshold ? effect.bonus : 0);
      }, 0);
      const effectiveReduction = Math.min(1, reduction + dst.equipmentStackDamageReduction + (this.tick < dst.guardUntilTick ? dst.guardReduction : 0)
        + (this.tick < dst.susanooUntilTick ? dst.susanooReduction : 0) + dst.traitDamageReductionAt(this.tick));
      const effectiveResistance = (resistance + (type === 'physical' ? dst.lanternArmorBonus + dst.bloodAidResistanceBonus + dst.gravityResistanceBonus + dst.skillArmorBonus + dst.hydraulicResistanceBonus + dst.equipmentHealthArmor + dst.equipmentStackResistance : type === 'magic' ? dst.bloodAidResistanceBonus + dst.gravityResistanceBonus + dst.skillMrBonus + dst.hydraulicResistanceBonus + dst.equipmentStackResistance : 0))
        * (type === 'true' ? 1 : 1 - (dst.shadowCorruption?.resistanceReduction ?? 0));
      const missingDamage = (missingHealthFraction ?? 0) * Math.max(0, dst.cfg.hp - dst.hp)
        * (critical ? this.configs.battle.criticalMultiplier ?? 1.5 : 1);
      let dmg = fixed ? Math.round(raw) : effectiveReduction >= 1 ? 0 : Math.max(1, Math.round((raw + missingDamage) * Math.max(0, 1 + damageAmp + (astral ? 0 : src.conquerorDamageAmp) + extraAmp)
        * (1 - effectiveReduction) * 100 / (100 + effectiveResistance)));
      const absorbed = Math.min(dst.shield, dmg);
      dst.shield -= absorbed;
      const previousHp = dst.hp;
      dst.hp = Math.max(0, dst.hp - (dmg - absorbed));
      const executed = !fixed && !astral && this.targetable(dst) && dmg > 0 && dst.hp > 0 && src.traitExecuteThreshold > 0
        && dst.hp < dst.cfg.hp * src.traitExecuteThreshold;
      if (executed) { dmg += dst.hp; dst.hp = 0; }
      // Trigger between hits so the lethal hit leaves 1 HP and later targeted hits miss.
      if (previousHp > 0) this.bloodReign.trigger(dst);
      const triggered = this.triggerLowHealthProtection(dst);
      const dealt = Math.max(0, previousHp - dst.hp);
      if(skillId&&previousHp>0&&!fixed&&!astral){
        const skill=this.configs.getSkill(skillId);if(skill.ravenTheft)this.raven.steal(src,dst,skill);
      }
      if(skillId&&previousHp>0&&!fixed&&!astral){
        const spin=this.configs.getSkill(skillId).infernalSpin;
        if(spin){
          healing.set(src,(healing.get(src)??0)+Math.round(spin.healPerTarget[src.star-1]*(1+(src.cfg.spellPower??0)/100)));
          if(src.hp>0)this.events.push({t:'infernal_spin_heal',tick:this.tick,id:src.id,from:dst.pos,to:src.pos});
        }
      }
      if(previousHp>0&&!fixed&&!astral&&shadowBoardSide===undefined&&sunlightJudgmentSide===undefined)
        this.demon.recordDamage(src,dst,dealt+absorbed);
      const killerSide = astralMeteorSide ?? sunlightJudgmentSide ?? shadowBoardSide ?? src.side;
      if (previousHp > 0 && dst.hp === 0 && killerSide !== dst.side) alliedKills.push(killerSide);
      if(skillId&&previousHp>0&&dst.hp===0&&src.side!==dst.side&&!fixed&&!astral){
        const verdict=this.configs.getSkill(skillId).abyssVerdict;
        if(verdict){
          healing.set(src,(healing.get(src)??0)+Math.round(verdict.healAmounts[src.star-1]*(1+(src.cfg.spellPower??0)/100)));
          if(src.hp>0)this.events.push({t:'abyss_siphon',tick:this.tick,id:src.id,target:dst.id,from:dst.pos,to:src.pos});
        }
      }
      // Active healing uses the pre-kill spell power; personal kills then grow future casts.
      if (skillId && previousHp > 0 && !fixed && !astral) {
        const drain = this.configs.getSkill(skillId).bloodDrain;
        if (drain) healing.set(src, (healing.get(src) ?? 0) + Math.round(drain.healAmounts[src.star - 1] * (1 + (src.cfg.spellPower ?? 0) / 100)));
      }
      if (!fixed && !astral && previousHp > 0 && dst.hp === 0 && src.side !== dst.side) {
        const hunt=src.cfg.skillId?this.configs.getSkill(src.cfg.skillId).windHunt:undefined;
        if(hunt&&this.tick<src.windHuntUntilTick&&shadowBoardSide===undefined&&sunlightJudgmentSide===undefined){
          const growth=hunt.physicalPowerPerKill[src.star-1];
          src.permanentPhysicalPowerGained+=growth;src.permanentPhysicalPower+=growth;
          src.cfg.physicalPower=(src.cfg.physicalPower??0)+growth;
          this.events.push({t:'permanent_physical_power',tick:this.tick,id:src.id,amount:growth,total:src.permanentPhysicalPower});
        }
        const drain = src.cfg.skillId ? this.configs.getSkill(src.cfg.skillId).bloodDrain : undefined;
        const amount = drain?.spellPowerPerKill[src.star - 1] ?? 0;
        if (amount > 0) {
          src.permanentSpellPowerGained += amount;
          src.permanentSpellPower += amount;
          const previousPower = src.cfg.spellPower ?? 0;
          src.cfg.spellPower = (src.cfg.spellPower ?? 0) + amount;
          // Equipment thresholds follow the newly gained power during this battle too.
          src.cfg.damageAmp = (src.cfg.damageAmp ?? 0) + src.equipment.reduce((sum, item) => {
            const e = item.spellPowerDamageAmp;
            return sum + (e ? Math.min(e.cap, Math.floor(src.cfg.spellPower! / e.step) * e.bonus)
              - Math.min(e.cap, Math.floor(previousPower / e.step) * e.bonus) : 0);
          }, 0);
          this.events.push({ t: 'permanent_spell_power', tick: this.tick, id: src.id, amount, total: src.permanentSpellPower });
        }
      }
      if (previousHp > 0 && dmg > 0) {
        const cap = dst.equipment.reduce((max, item) => Math.max(max, item.damageTakenStacks?.maxStacks ?? 0), 0);
        dst.equipmentDamageStacks = Math.min(cap, dst.equipmentDamageStacks + 1);
      }
      // Independent faction damage has a representative source, not a personal contributor.
      if (!fixed && !astral && dealt > 0 && src.side !== dst.side && (src.spellchanter || this.takedownHealth(src) > 0)) {
        let contributors = this.spellchanterContributors.get(dst);
        if (!contributors) this.spellchanterContributors.set(dst, contributors = new Map());
        contributors.set(src, this.tick);
      }
      if (dst.cfg.role === 'tank' || dst.cfg.role === 'warrior') dst.gainMana(dealt * (this.configs.battle.roleMana?.damageTakenFraction ?? 0));
      if (!fixed && !astral) healing.set(src, (healing.get(src) ?? 0) + dealt * src.lifesteal);
      this.events.push({ t: 'hit', tick: this.tick, id: dst.id, source: src.id, actualDamage: dealt, dmg, hp: dst.hp, dmgType: type, ...(shadowBoardSide !== undefined ? { shadowBoardSide } : {}), ...(sunlightJudgmentSide !== undefined ? { sunlightJudgmentSide, ...(sunlightJudgmentStar !== undefined ? { sunlightJudgmentStar } : {}) } : {}), ...(astral ? { astralMeteorSide } : {}), ...(critical ? { critical: true } : {}), ...(executed && dst.hp === 0 ? { executed: true } : {}) });
      if (triggered) this.events.push({ t: 'equipment_trigger', tick: this.tick, id: dst.id, equipmentId: triggered, shield: dst.shield });
      this.triggerEmergencyOverclock(dst);
      this.triggerConquerorProtection(dst);
      this.startEquipmentSustain(dst);
      let untrackedAbsorption=this.sunlight.onShieldAbsorbed(dst,this.shadowSkills.onShieldAbsorbed(dst,absorbed));
      if(dst.stellarShield){
        const used=Math.min(untrackedAbsorption,dst.stellarShield.remaining);
        dst.stellarShield.remaining-=used;untrackedAbsorption-=used;
        if(dst.stellarShield.remaining===0)dst.stellarShield=null;
      }
      this.demon.absorb(dst,this.sandCompass.absorb(dst,untrackedAbsorption));
      if (!astral && absorbed > 0 && dst.shield === 0) this.sunlight.onEnemyShieldBroken(src, skillId);
      this.sunlight.onHitResolved(src, dst, skillId, previousHp > 0 && dst.hp === 0);
      if (skillId && dst.hp > 0 && this.configs.getSkill(skillId).effect === 'atlasMissiles') this.applyAtlasBurn(src,dst,this.configs.getSkill(skillId));
      if (skillId && previousHp > 0 && dst.hp === 0 && src.side !== dst.side) {
        const skill = this.configs.getSkill(skillId);
        if (skill.effect === 'strikeHealOnKill') healing.set(src, (healing.get(src) ?? 0)
          + Math.round(skill.healAmounts![src.star - 1] * (1 + (src.cfg.spellPower ?? 0) / 100)));
      }
      if (basicAttack) this.applyShadow(src, dst);
    }
    for (const [src, value] of healing) {
      if (src.hp <= 0) continue; // Lifesteal cannot revive a unit killed in this tick.
      applyHealing(src, src, value, this.tick, this.events);
    }
    for (const side of alliedKills) this.alliedKillCounts[side]++;
    // Settle after all queued damage: a bloodfiend killed this tick cannot be revived.
    for (const side of alliedKills) for (const unit of this.units) {
      const effect = unit.bloodfiend;
      if (unit.side !== side || !unit.alive || unit.hp <= 0 || !effect) continue;
      unit.bloodfiendUntilTick = this.tick + Math.max(1, Math.round(effect.durationSeconds * 1000 / this.configs.battle.tickMs));
      unit.bloodfiendStackExpiries.push(unit.bloodfiendUntilTick);
      this.events.push({ t: 'bloodfiend_revel', tick: this.tick, id: unit.id, untilTick: unit.bloodfiendUntilTick, attackSpeedBonus: effect.attackSpeedBonus });
      applyHealing(unit, unit, unit.cfg.hp * effect.healMaxHpFraction, this.tick, this.events);
    }
    for (const u of this.units) {
      if (u.alive && u.hp === 0) {
        u.alive = false;
        u.demonFervor=null;
        this.demonSkills.interrupt(u);
        this.raven.interrupt(u);
        this.gunfire.interrupt(u);
        this.demon.onDeath(u);
        this.bloodReign.onDeath(u);
        this.bloodAid.onDeath(u);
        this.sandCompass.onDeath(u);
        this.ropeHunt.stop(u);
        u.shield = 0;
        u.equipmentRegen = null;
        u.equipmentSustain.clear();
        u.equipmentCastSpeedUntil.clear();
        u.conquerorProtectionUntilTick = 0;
        u.spellbladeUntilTick = 0;
        u.bloodfiendUntilTick = 0;
        u.bloodfiendStackExpiries.length = 0;
        u.inspirations.clear();
        u.windHuntUntilTick=0;u.windHuntSpeedBonus=0;
        u.cfg.spellPower=(u.cfg.spellPower??0)-u.runicPower;u.runicRunes=0;u.runicPower=0;
        if (u.pendingCast && ['chargedKnockup','lineFear','windHunt','stackingCorrosion','sandCompass','ropeHunt','runicArcana','demonSkill'].includes(this.configs.getSkill(u.pendingCast.skillId).effect??'')) u.pendingCast = null;
        u.spellbladeAttacks = 0;
        u.spellchanterPendingMana = 0;
        u.swiftmartialistStacks = 0;
        u.hydraulicBulwark = null;
        u.spiderLeap = null;
        u.furnaceDash = null;
        u.stellarCharge = null;u.stellarShield = null;u.starLeap = null;
        u.overclockUntilTick = 0;
        u.overclockHealTick = 0;
        u.overclockNextTick = 0;
        this.events.push({ t: 'death', tick: this.tick, id: u.id });
        if(u.side===0&&!this.reviveUsed&&this.opts.firstAllyRevive){
          this.reviveUsed=true;
          this.pendingRevive={unit:u,tick:this.tick+Math.max(1,Math.ceil(this.opts.firstAllyRevive.seconds*1000/this.configs.battle.tickMs))};
        }
        const contributors = this.spellchanterContributors.get(u);
        for (const member of this.units) {
          const lastHit = contributors?.get(member);
          if (lastHit === undefined || (this.tick - lastHit) * this.configs.battle.tickMs > 5000
            || !member.alive || member.hp <= 0) continue;
          if (member.spellchanter) {
            member.spellchanterPendingMana += member.spellchanter.manaOnTakedown;
            this.flushSpellchanterMana(member);
          }
          const growth = this.takedownHealth(member);
          if (growth > 0) {
            const previousGrowth = member.permanentHealthGained;
            member.permanentHealthGained += growth;
            member.soulLampHealth += growth;
            const previousArmor = member.cfg.armor;
            const previousResistance = equipmentMaxHpResistance(member.cfg.hp, member.equipment);
            const health = Math.round(member.permanentHealthGained * member.maxHpGrowthMultiplier)
              - Math.round(previousGrowth * member.maxHpGrowthMultiplier);
            member.cfg.hp += health; member.hp += health;
            const resistance = equipmentMaxHpResistance(member.cfg.hp, member.equipment) - previousResistance;
            member.cfg.armor += resistance; member.cfg.mr += resistance;
            member.cfg.damageReduction = Math.min(1, (member.cfg.damageReduction ?? 0) + member.equipment.reduce((sum, item) => {
              const effect = item.armorDamageReduction;
              return sum + (effect && previousArmor <= effect.threshold && member.cfg.armor > effect.threshold ? effect.bonus : 0);
            }, 0));
          }
        }
        this.spellchanterContributors.delete(u);
        this.shadowSkills.onDeath(u);
        this.sunlight.onDeath(u);
      }
    }
  }

  private takedownHealth(unit: Unit): number {
    const skill = unit.cfg.skillId ? this.configs.getSkill(unit.cfg.skillId) : undefined;
    return skill?.shadow?.kind === 'soulLamp' ? skill.shadow.takedownHealth[unit.star - 1] : 0;
  }

  private flushSpellchanterMana(unit: Unit): void {
    if (!unit.alive || unit.hp <= 0 || unit.manaLocked || unit.pendingCast || unit.spellchanterPendingMana <= 0) return;
    const before = unit.mana;
    unit.gainMana(unit.spellchanterPendingMana);
    unit.spellchanterPendingMana = 0;
    const amount = unit.mana - before;
    if (amount > 0) this.events.push({ t: 'trait_mana', tick: this.tick, id: unit.id, amount, mana: unit.mana });
  }

  private attackTarget(source: Unit, id: number): Unit | null {
    return this.units.find(enemy=>enemy.id===id&&enemy.side!==source.side&&enemy.hp>0
      &&this.targetable(enemy)&&source.canSelectEnemy(enemy))??null;
  }

  private releaseRunicArcana(source: Unit, skill: SkillConfigData, targetId: number, toward: {x:number;y:number}, wave: boolean): void {
    const spec=skill.runicArcana!;
    if(wave){
      this.events.push({t:'runic_wave',tick:this.tick,id:source.id,from:source.pos,toward,length:spec.length,width:spec.width});
      for(const victim of this.units)if(victim.side!==source.side&&victim.hp>0&&this.targetable(victim)
        &&inFearLine(source.pos,toward,victim.pos,spec.length,spec.width))
        this.damage(source,victim,spec.waveDamage[source.star-1],'magic',false,false,false,skill.id);
      source.cfg.spellPower=(source.cfg.spellPower??0)-source.runicPower;
      source.runicRunes=0;source.runicPower=0;
    }else{
      const target=this.attackTarget(source,targetId);
      if(target){
        this.events.push({t:'runic_missiles',tick:this.tick,id:source.id,target:target.id,from:source.pos,to:target.pos,count:spec.missileCount});
        for(let shot=0;shot<spec.missileCount;shot++)this.damage(source,target,skill.starDamage![source.star-1],'magic',false,false,true,skill.id);
      }
      source.runicRunes=Math.min(spec.maxRunes,source.runicRunes+1);
      const power=source.runicRunes*spec.spellPowerPerRune[source.star-1];
      source.cfg.spellPower=(source.cfg.spellPower??0)+power-source.runicPower;source.runicPower=power;
    }
    this.events.push({t:'runic_runes',tick:this.tick,id:source.id,count:source.runicRunes});
  }

  private get retargetCooldown(): number {
    return Math.max(1, Math.round((this.configs.battle.targeting?.retargetSeconds ?? 0.5) * 1000 / this.configs.battle.tickMs));
  }

  private releaseAttackTarget(unit: Unit): void {
    if(unit.priorityTarget===unit.attackTargetId)unit.priorityTarget=null;
    unit.attackTargetId=null;unit.blockedTargetSinceTick=null;
    unit.retargetAtTick=this.tick+this.retargetCooldown;
    unit.bloodCleaveWindup=null;
  }

  private selectAttackTarget(unit: Unit, skillTarget: Unit | null): Unit | null {
    // Forced skill targets override a normal lock and its recovery delay.
    const forced=unit.tauntSourceId===null?skillTarget:this.attackTarget(unit,unit.tauntSourceId);
    if(forced){
      if(unit.attackTargetId!==forced.id)unit.blockedTargetSinceTick=null;
      unit.attackTargetId=forced.id;unit.retargetAtTick=0;return forced;
    }
    const locked=unit.attackTargetId===null?null:this.attackTarget(unit,unit.attackTargetId);
    if(locked)return locked;
    if(this.tick<unit.retargetAtTick)return null;
    const tank=(enemy:Unit)=>['tank','magicTank','frontline'].includes(enemy.cfg.role??'');
    const candidates=this.units.filter(enemy=>enemy.side!==unit.side&&enemy.hp>0&&this.targetable(enemy)&&unit.canSelectEnemy(enemy))
      .sort((a,b)=>dist(unit.pos,a.pos)-dist(unit.pos,b.pos)
        ||Number(tank(b))-Number(tank(a))||a.id-b.id);
    for(const enemy of candidates){
      if(dist(unit.pos,enemy.pos)>unit.cfg.range&&!nextStep(unit.pos,this.w,this.h,
        (x,y)=>this.occupied(x,y),(x,y)=>dist({x,y},enemy.pos)<=unit.cfg.range))continue;
      unit.attackTargetId=enemy.id;unit.blockedTargetSinceTick=null;return enemy;
    }
    unit.retargetAtTick=this.tick+this.retargetCooldown;
    return null;
  }

  /** 最近敌人；平手取 id 小者（遍历有序保证确定性） */
  private nearestEnemy(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of this.units) {
      if (!this.targetable(e) || e.side === u.side || !u.canSelectEnemy(e)) continue;
      const d = dist(u.pos, e.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  private occupied(x: number, y: number): boolean {
    return this.units.some(o => o.alive && ((o.x === x && o.y === y) || (o.starLeap?.to.x === x && o.starLeap?.to.y === y) || (o.ravenFlight?.to.x === x && o.ravenFlight?.to.y === y)));
  }

  private targetable(u: Unit): boolean {
    return u.alive && !u.bloodRebirth && !u.spiderLeap && !u.skillUntargetable && this.tick >= u.untargetableUntilTick;
  }

  private emitCast(event: Extract<BattleEvent, { t: 'cast' }>): void {
    this.events.push(event);
    const unit = this.units.find(u => u.id === event.id);
    if (!unit || !unit.alive || unit.hp <= 0) return;
    unit.equipment.forEach((item, slot) => {
      if (item.castAttackSpeed) unit.equipmentCastSpeedUntil.set(slot, this.tick
        + Math.max(1, Math.round(item.castAttackSpeed.seconds * 1000 / this.configs.battle.tickMs)));
    });
    const manaDamage = unit.equipment.reduce((sum, item) => sum + (item.castMaxManaDamage ?? 0), 0);
    if (manaDamage > 0 && unit.cfg.maxMana > 0) {
      const priority = this.units.find(enemy => enemy.id === unit.priorityTarget && this.targetable(enemy) && unit.canSelectEnemy(enemy)
        && enemy.side !== unit.side && dist(unit.pos, enemy.pos) <= unit.cfg.range);
      const locked=unit.attackTargetId===null?null:this.attackTarget(unit,unit.attackTargetId);
      const target = priority ?? locked ?? this.nearestEnemy(unit);
      if (target) this.damage(unit, target, unit.cfg.maxMana * manaDamage, 'magic');
    }
    const effect = unit.spellblade;
    if (effect) {
      unit.spellbladeUntilTick = this.tick + Math.max(1, Math.round(effect.durationSeconds * 1000 / this.configs.battle.tickMs));
      unit.spellbladeAttacks = effect.empoweredAttacks?.count ?? 0;
      this.events.push({ t: 'guard', tick: this.tick, id: unit.id, duration: effect.durationSeconds, reduction: effect.damageReduction });
    }
    const swift = unit.swiftmartialist;
    if (swift && unit.swiftmartialistStacks < swift.maxStacks) {
      unit.swiftmartialistStacks++;
      this.events.push({ t: 'swiftmartialist_stack', tick: this.tick, id: unit.id, stacks: unit.swiftmartialistStacks,
        maxStacks: swift.maxStacks, attackSpeedBonus: unit.swiftmartialistStacks * swift.attackSpeedPerCast });
    }
  }

  private triggerConquerorProtection(unit: Unit): void {
    const effect = unit.conqueror?.protection;
    if (!effect || unit.conquerorProtectionUsed || !unit.alive || unit.hp <= 0 || unit.hp >= unit.cfg.hp * effect.threshold) return;
    unit.conquerorProtectionUsed = true;
    unit.conquerorProtectionUntilTick = this.tick + Math.max(1, Math.round(effect.durationSeconds * 1000 / this.configs.battle.tickMs));
    applyHealing(unit, unit, Math.round(unit.cfg.hp * effect.healMaxHpFraction), this.tick, this.events);
    this.events.push({ t: 'guard', tick: this.tick, id: unit.id, duration: effect.durationSeconds, reduction: effect.damageReduction });
  }

  private triggerLowHealthProtection(u: Unit): string | null {
    if (!u.alive || u.lowHealthProtectionUsed || u.bloodRebirth) return null;
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
      const amount = delivered - regen.delivered;
      regen.delivered = delivered;
      applyHealing(u, u, amount, this.tick, this.events);
      if (elapsed >= regen.durationTicks) u.equipmentRegen = null;
    }
  }

  private startEquipmentSustain(u: Unit): void {
    if (!u.alive || u.hp <= 0) return;
    u.equipment.forEach((item, slot) => {
      const effect = item.lowHealthRegen;
      if (!effect) return;
      if (u.hp >= u.cfg.hp * effect.threshold) { u.equipmentSustain.delete(slot); return; }
      if (u.equipmentSustain.has(slot)) return;
      const interval = Math.max(1, Math.round(effect.intervalSeconds * 1000 / this.configs.battle.tickMs));
      u.equipmentSustain.set(slot, { nextTick: this.tick + interval, pulses: 0, delivered: 0 });
      this.events.push({ t: 'equipment_trigger', tick: this.tick, id: u.id, equipmentId: item.id, shield: u.shield });
    });
  }

  private updateEquipmentSustain(u: Unit): void {
    // Recheck each slot: an earlier copy may have healed the carrier out of the low-health range.
    u.equipment.forEach((item, slot) => {
      const state = u.equipmentSustain.get(slot), effect = item.lowHealthRegen;
      if (!state || !effect) return;
      if (u.hp >= u.cfg.hp * effect.threshold) { u.equipmentSustain.delete(slot); return; }
      if (this.tick < state.nextTick) return;
      state.pulses++;
      const delivered = Math.floor(u.cfg.hp * effect.maxHpFraction * state.pulses + 1e-9);
      const amount = delivered - state.delivered;
      state.delivered = delivered;
      state.nextTick += Math.max(1, Math.round(effect.intervalSeconds * 1000 / this.configs.battle.tickMs));
      applyHealing(u, u, amount, this.tick, this.events);
    });
  }

  private updateEncounterRevive(): void {
    const pending=this.pendingRevive;
    if(!pending||this.tick<pending.tick||this.tick>=this.maxTicks)return;
    const u=pending.unit, occupied=new Set(this.units.filter(v=>v.alive&&v.hp>0).map(v=>`${v.x},${v.y}`));
    const cells=Array.from({length:this.w*this.h},(_,i)=>({x:i%this.w,y:Math.floor(i/this.w)}))
      .filter(p=>!occupied.has(`${p.x},${p.y}`)).sort((a,b)=>hexDist(a,u)-hexDist(b,u)||a.y-b.y||a.x-b.x);
    // A full board delays revival until a cell opens; timeout still ends the battle.
    if(!cells.length)return;
    this.pendingRevive=undefined;
    u.reviveAt(cells[0],this.opts.firstAllyRevive!.healthFraction);
    this.events.push({t:'revive',tick:this.tick,id:u.id,hp:u.hp,x:u.x,y:u.y});
  }

  private checkEnd(): boolean {
    const ownAlive = this.units.some(u => u.alive && u.side === 0);
    const enemyAlive = this.units.some(u => u.alive && u.side === 1);
    if (this.pendingRevive || (ownAlive && enemyAlive)) return false;
    this.end(ownAlive ? 0 : enemyAlive ? 1 : -1);
    return true;
  }

  private end(w: Side | -1) {
    this.pendingRevive=undefined;
    this.finished = true;
    this.winner = w;
    this.bloodAid.clear();
    this.bloodReign.clear();
    this.sandCompass.clear();
    this.ropeHunt.clear();
    this.demon.clear();
    this.demonSkills.clear();
    this.raven.clear();
    this.gunfire.clear();
    this.nebulas.length=0;
    this.gravityFields.length=0;
    this.hasGravityState=false;
    for (const unit of this.units) {
      unit.overclockUntilTick = 0;
      unit.demonFervor=null;
      unit.bloodfiendUntilTick = 0;
      unit.bloodfiendStackExpiries.length = 0;
      unit.inspirations.clear();
      unit.corrosionTargets.clear();
      unit.windHuntUntilTick=0;unit.windHuntSpeedBonus=0;
      unit.cfg.spellPower=(unit.cfg.spellPower??0)-unit.runicPower;unit.runicRunes=0;unit.runicPower=0;
      if (unit.pendingCast && ['chargedKnockup','lineFear','windHunt','stackingCorrosion','sandCompass','ropeHunt','runicArcana','demonSkill'].includes(this.configs.getSkill(unit.pendingCast.skillId).effect??'')) unit.pendingCast = null;
      unit.hydraulicBulwark = null;
      unit.spiderLeap = null;
      unit.nebulaAttackSpeedPenalty=0;
      unit.gravityResistanceBonus=0;unit.tauntSourceId=null;
      if (unit.pendingCast && ['arrowVolley','nebula','gravity'].includes(this.configs.getSkill(unit.pendingCast.skillId).effect??'')) unit.pendingCast = null;
      unit.furnaceDash = null;
      this.stopStarLeap(unit);
      this.settleStellarCharge(unit,true);this.expireStellarShield(unit);
      unit.burns = unit.burns.filter(b=>!b.untilBattleEnd);
      unit.overclockNextTick = 0;
      unit.overclockHealTick = 0;
    }
    this.events.push({ t: 'end', tick: this.tick, winner: w });
  }
}
