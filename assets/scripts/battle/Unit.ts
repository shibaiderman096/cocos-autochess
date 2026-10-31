import { BurnRuntime, Side, EquipmentConfigData, ShadowTraitEffect, ShadowCorruption, ConquerorTraitEffect, SpellbladeTraitEffect, SpellchanterTraitEffect, SwiftmartialistTraitEffect } from './types';
import { UnitConfigData } from '../core/ConfigManager';
import type { MechanicalPioneerTraitEffect } from './types';
import type { BloodfiendTraitEffect } from './types';
import type { HydraulicBulwarkRuntime, SpiderLeapRuntime, FurnaceDashRuntime } from './types';

export class Unit {
  /** Fresh pre-equipment, pre-trait combat attributes; never a snapshot of temporary buffs. */
  copyBase?: UnitConfigData;
  temporaryCopy = false;
  spawnedAtTick = -1;
  deathManaOnly=false;
  soulMoveSlow=0;
  soulAttackSlow=0;
  dragonFlow: import('./types').DragonFlowRuntime|null=null;
  hp: number;
  mana: number;
  manaPerSecond = 0;
  traitRegenPerSecond = 0;
  traitAttackDamage = 0;
  traitExecuteThreshold = 0;
  conqueror?: ConquerorTraitEffect;
  conquerorProtectionUsed = false;
  conquerorProtectionUntilTick = 0;
  spellblade?: SpellbladeTraitEffect;
  spellbladeUntilTick = 0;
  spellbladeAttacks = 0;
  spellchanter?: SpellchanterTraitEffect;
  spellchanterPendingMana = 0;
  swiftmartialist?: SwiftmartialistTraitEffect;
  swiftmartialistStacks = 0;
  mechanicalPioneer?: MechanicalPioneerTraitEffect;
  bloodfiend?: BloodfiendTraitEffect;
  bloodfiendUntilTick = 0;
  bloodfiendStackExpiries: number[] = [];
  get bloodfiendStackCount(): number {
    if (!this.alive) return 0;
    let count=0;
    for (const until of this.bloodfiendStackExpiries) if (this.combatTick<until) count++;
    return count;
  }
  bloodAidUntilTick = 0;
  bloodRebirthUsed = false;
  bloodRebirth: import('./types').BloodRebirthRuntime | null = null;
  bloodCleaveReady = false;
  bloodCleaveWindup: {targetId: number; startTick: number; endTick: number} | null = null;
  bloodReignHealth = 0;
  bloodReignResistance = 0;
  bloodReignReduction = 0;
  bloodAidResistances = new Map<number,{amount:number;untilTick:number}>();
  get bloodAidResistanceBonus():number {
    if(!this.alive)return 0;
    let total=0;
    for(const buff of this.bloodAidResistances.values())if(this.combatTick<buff.untilTick)total+=buff.amount;
    return total;
  }
  overclockUntilTick = 0;
  overclockNextTick = 0;
  overclockHealTick = 0;
  overclockEmergencyUsed = false;
  /** Updated by the fixed battle clock before any unit acts. */
  knightLeap: import('./types').KnightLeapRuntime|null=null;
  lifeVersion=0;
  knightWave: import('./types').KnightWaveRuntime|null=null;
  knightSpin: {until:number;next:number;reduction:number}|null=null;
  knightSlowUntil=0;
  knightSlow=0;
  combatTick = 0;
  get conquerorDamageAmp(): number {
    const effect = this.conqueror;
    return effect ? effect.damageAmp * (this.hp < this.cfg.hp * effect.lowHealthThreshold ? effect.lowHealthMultiplier : 1) : 0;
  }
  traitDamageReductionAt(tick: number): number {
    return (tick < this.conquerorProtectionUntilTick ? this.conqueror?.protection?.damageReduction ?? 0 : 0)
      + (tick < this.spellbladeUntilTick ? this.spellblade?.damageReduction ?? 0 : 0);
  }
  shadowAttack?: ShadowTraitEffect;
  shadowCorruption?: ShadowCorruption;
  shadowAttackSpeedBonus = 0;
  sunlightShield = 0;
  skillArmorBonus = 0;
  hydraulicBulwark: HydraulicBulwarkRuntime | null = null;
  spiderLeap: SpiderLeapRuntime | null = null;
  furnaceDash: FurnaceDashRuntime | null = null;
  atlasManaReduction = 0;
  get hydraulicResistanceBonus(): number {
    return this.alive && this.hydraulicBulwark && this.combatTick < this.hydraulicBulwark.untilTick ? this.hydraulicBulwark.resistanceBonus : 0;
  }
  get hydraulicRooted(): boolean {
    return this.alive && !!this.hydraulicBulwark && this.combatTick < this.hydraulicBulwark.untilTick;
  }
  skillMrBonus = 0;
  skillAttackSpeedBonus = 0;
  skillAttackSpeedPenalty = 0;
  nebulaAttackSpeedPenalty = 0;
  gravityResistanceBonus = 0;
  tauntSourceId: number | null = null;
  /** A taunt restricts selected enemy targets; area damage remains independent. */
  canSelectEnemy(enemy: Unit): boolean { return this.tauntSourceId === null || enemy.id === this.tauntSourceId; }
  skillUntargetable = false;
  domainUntilTick = 0;
  domainRadius = 0;
  soulFearUntilTick = 0;
  fearUntilTick = 0;
  fearOrigin = { x: 0, y: 0 };
  lanternGuard?: {maxArmor: number; maxSpeedPenalty: number; physicalPowerPerArmor: number};
  windHuntUntilTick = 0;
  corrosionTargets = new Set<number>();
  runicRunes = 0;
  runicPower = 0;
  windHuntCastTicks = 1;
  expeditionCastTicks = 1;
  windHuntSpeedBonus = 0;
  get windHuntActive(): boolean { return this.alive && this.hp>0 && this.combatTick<this.windHuntUntilTick; }
  get missingHealthFraction(): number { return Math.max(0,Math.min(1,1-this.hp/this.cfg.hp)); }
  get lanternArmorBonus(): number { return (this.lanternGuard?.maxArmor??0)*(1+(this.cfg.spellPower??0)/100)*this.missingHealthFraction; }
  get physicalPower(): number { return (this.cfg.physicalPower??0)+this.armor*(this.lanternGuard?.physicalPowerPerArmor??0); }
  get armor(): number { return (this.cfg.armor + this.lanternArmorBonus + this.skillArmorBonus + this.bloodAidResistanceBonus + this.gravityResistanceBonus + this.hydraulicResistanceBonus + this.equipmentHealthArmor + this.equipmentStackResistance) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
  get mr(): number { return (this.cfg.mr + this.skillMrBonus + this.bloodAidResistanceBonus + this.gravityResistanceBonus + this.hydraulicResistanceBonus + this.equipmentStackResistance) * (1 - (this.shadowCorruption?.resistanceReduction ?? 0)); }
  private manaFraction = 0;
  gainMana(amount: number, source: 'normal'|'death' = 'normal'): void {
    if(this.deathManaOnly&&source!=='death')return;
    if (!this.alive || this.hp <= 0 || this.cfg.maxMana <= 0 || this.manaLocked || this.windHuntActive || this.ropeHunt || this.pendingCast || !Number.isFinite(amount) || amount <= 0) return;
    this.manaFraction += amount;
    const whole = Math.floor(this.manaFraction + 1e-9);
    this.manaFraction = Math.max(0, this.manaFraction - whole);
    this.mana = Math.min(this.cfg.maxMana, this.mana + whole);
    if (this.mana === this.cfg.maxMana) this.manaFraction = 0;
  }
  private attackCooldownTicks=0;
  atkCdSetTick=-1;
  get atkCd():number {return this.attackCooldownTicks;}
  set atkCd(value:number){this.attackCooldownTicks=value;this.atkCdSetTick=this.combatTick;}
  attackTargetId: number | null = null;
  /** Absolute tick; ordinary target reacquisition uses the configured fixed delay. */
  retargetAtTick = 0;
  blockedTargetSinceTick: number | null = null;
  moveCd = 0;
  /** Absolute end of an ordinary step, matching its move event interpolation. */
  walkUntilTick = 0;
  /** First basic after battle start/landing waits a full attack cycle; null while moving. */
  basicAttackReadyTick: number | null = null;
  alive = true;
  star = 1;
  skillScale = 1;
  pendingCast: { skillId: string; remainingTicks: number; targetId?: number; direction?: {x:number;y:number}; nextHealTick?: number; shotsRemaining?: number; runicWave?: boolean } | null = null;
  burns: BurnRuntime[] = [];
  empoweredAttacks = 0;
  permanentEmpower = false;
  /** Fixed skill damage replacing an empowered basic attack's ordinary attack value. */
  empoweredAttackDamage = 0;
  priorityTarget: number | null = null;
  /** Absolute attacks/second added to the base: +5% means +0.05. */
  attackSpeedBonus = 0;
  demonFervor: {untilTick:number;attackSpeedBonus:number;lifestealBonus:number}|null=null;
  infernalSpin: import('./types').InfernalSpinRuntime|null=null;
  ravenFlight: import('./types').RavenFlightRuntime|null=null;
  demonGunfire: import('./types').DemonGunfireRuntime|null=null;
  get demonFervorActive():boolean{return this.alive&&this.hp>0&&!!this.demonFervor&&this.combatTick<this.demonFervor.untilTick;}
  inspirations = new Map<number, import('./types').InspirationRuntime>();
  get inspirationAttackSpeedBonus(): number {
    if(!this.alive||this.hp<=0)return 0;
    let total=0;
    for(const e of this.inspirations.values())total+=e.initialBonus*Math.max(0,Math.min(1,(e.untilTick-this.combatTick)/(e.untilTick-e.startTick)));
    return total;
  }
  overtimeAttackSpeedBonus = 0;
  overtimeDamageAmp = 0;
  get damageAmp(): number { return (this.cfg.damageAmp ?? 0) + this.overtimeDamageAmp + this.conquerorDamageAmp - (this.shadowCorruption?.damageAmpLoss ?? 0); }
  equipment: EquipmentConfigData[] = [];
  equipmentAttackStacks = 0;
  equipmentDamageStacks = 0;
  get equipmentStackResistance(): number {
    return this.equipment.reduce((sum, item) => sum + (item.damageTakenStacks ? Math.min(this.equipmentDamageStacks, item.damageTakenStacks.maxStacks) * item.damageTakenStacks.resistancePerStack : 0), 0);
  }
  get equipmentStackDamageReduction(): number {
    return this.equipment.reduce((sum, item) => sum + (item.damageTakenStacks && this.equipmentDamageStacks >= item.damageTakenStacks.maxStacks ? item.damageTakenStacks.maxStackDamageReduction : 0), 0);
  }
  permanentHealthGained = 0;
  permanentSpellPowerGained = 0;
  /** Total earned across this expedition, including the entry placement. */
  permanentSpellPower = 0;
  permanentPhysicalPowerGained = 0;
  permanentPhysicalPower = 0;
  soulLampHealth = 0;
  maxHpGrowthMultiplier = 1;
  /** Same-star encounter health before permanent, equipment, trait and skill gains. */
  baseMaxHp: number;
  demonLeap: import('./types').DemonLeapRuntime | null = null;
  equipmentCastSpeedUntil = new Map<number, number>();
  get crowdControlImmune(): boolean { return !!this.dragonFlow || this.cfg.controlImmune===true || this.equipment.some(item => item.crowdControlImmune); }
  get equipmentHealthArmor(): number {
    return this.equipment.reduce((sum, item) => sum + (item.healthStance && this.hp < this.cfg.hp * item.healthStance.threshold ? item.healthStance.armor : 0), 0);
  }
  get equipmentAttackSpeedBonus(): number {
    return this.equipment.reduce((sum, item, slot) => sum + item.attackSpeedBonus + item.attackSpeedPerAttack * this.equipmentAttackStacks
      + (item.healthStance && this.hp >= this.cfg.hp * item.healthStance.threshold ? item.healthStance.attackSpeedBonus : 0)
      + (this.alive && this.combatTick < (this.equipmentCastSpeedUntil.get(slot) ?? 0) ? item.castAttackSpeed?.bonus ?? 0 : 0), 0);
  }
  manaLocked = false;
  attackSpeedCap = 5;
  stunnedUntilTick = 0;
  guardUntilTick = 0;
  guardReduction = 0;
  susanooUntilTick = 0;
  susanooReduction = 0;
  damageReductionAt(tick: number): number {
    return Math.min(1, (this.cfg.damageReduction ?? 0) + (this.dragonFlow?.reduction??0) + (this.knightSpin&&tick<this.knightSpin.until?this.knightSpin.reduction:0) + this.equipmentStackDamageReduction + (tick < this.guardUntilTick ? this.guardReduction : 0)
      + (tick < this.susanooUntilTick ? this.susanooReduction : 0) + this.traitDamageReductionAt(tick));
  }
  shield = 0;
  stellarShield: { remaining: number; untilTick: number } | null = null;
  stellarCharge: import('./types').StellarChargeRuntime | null = null;
  ropeHunt: import('./types').RopeHuntRuntime | null = null;
  starLeap: import('./types').StarLeapRuntime | null = null;
  untargetableUntilTick = 0;
  lowHealthProtectionUsed = false;
  equipmentRegen: { startTick: number; durationTicks: number; total: number; delivered: number } | null = null;
  /** Per-slot state allows repeated regen items to trigger and heal independently. */
  equipmentSustain = new Map<number, { nextTick: number; pulses: number; delivered: number }>();

  get lifesteal(): number {
    const missing = Math.max(0, 1 - this.hp / this.cfg.hp);
    return Math.min(1, (this.cfg.lifesteal ?? 0) + (this.conqueror?.lifesteal ?? 0) + (this.demonFervorActive?this.demonFervor!.lifestealBonus:0) + this.equipment.reduce((sum, item) => {
      const effect = item.missingHpLifesteal;
      return sum + (effect ? Math.floor(missing / effect.step + 1e-9) * effect.bonus : 0);
    }, 0));
  }

  /** Keep equipment thresholds in sync with temporary gains and theft. */
  adjustSpellPower(amount:number):void {
    const before=this.cfg.spellPower??0,after=before+amount;this.cfg.spellPower=after;
    this.cfg.damageAmp=(this.cfg.damageAmp??0)+this.equipment.reduce((sum,item)=>{
      const e=item.spellPowerDamageAmp;
      return sum+(e?Math.min(e.cap,Math.floor(Math.max(0,after)/e.step)*e.bonus)-Math.min(e.cap,Math.floor(Math.max(0,before)/e.step)*e.bonus):0);
    },0);
  }

  get attackSpeed(): number {
    const penalty = this.crowdControlImmune ? 0 : Math.max(this.skillAttackSpeedPenalty, this.nebulaAttackSpeedPenalty, this.soulAttackSlow, this.combatTick<this.knightSlowUntil?this.knightSlow:0);
    const speed = this.cfg.atkSpeed + this.attackSpeedBonus + this.equipmentAttackSpeedBonus + this.overtimeAttackSpeedBonus + this.shadowAttackSpeedBonus + this.skillAttackSpeedBonus + this.inspirationAttackSpeedBonus - penalty
      + (this.combatTick < this.spellbladeUntilTick ? this.spellblade?.attackSpeedBonus ?? 0 : 0)
      + this.swiftmartialistStacks * (this.swiftmartialist?.attackSpeedPerCast ?? 0)
      + this.bloodfiendStackCount * (this.bloodfiend?.attackSpeedBonus ?? 0)
      + (this.alive && this.combatTick < this.overclockUntilTick ? this.mechanicalPioneer?.attackSpeedBonus ?? 0 : 0)
      + (this.windHuntActive ? this.windHuntSpeedBonus : 0)
      + (this.demonFervorActive ? this.demonFervor!.attackSpeedBonus : 0);
    const lanternPenalty=(this.lanternGuard?.maxSpeedPenalty??0)*this.missingHealthFraction;
    return Math.min(this.attackSpeedCap, penalty+lanternPenalty > 0 ? Math.max(.1, speed-lanternPenalty) : speed);
  }

  constructor(
    public id: number,
    public side: Side,
    public cfg: UnitConfigData,
    public x: number,
    public y: number,
  ) {
    this.baseMaxHp = cfg.hp;
    this.hp = cfg.hp;
    this.mana = cfg.startMana;
  }

  /** Remove temporary combat state without replaying opening effects or resetting one-shot flags. */
  reviveAt(pos: {x:number;y:number}, healthFraction: number): void {
    this.lifeVersion++;this.knightLeap=null;
    this.x=pos.x;this.y=pos.y;this.alive=true;
    this.hp=Math.max(1,Math.floor(this.cfg.hp*healthFraction));this.mana=0;this.manaFraction=0;
    this.pendingCast=null;this.knightWave=null;this.burns=[];this.shield=0;this.sunlightShield=0;
    this.attackTargetId=null;this.priorityTarget=null;this.blockedTargetSinceTick=null;
    this.atkCd=0;this.moveCd=0;this.retargetAtTick=0;
    this.walkUntilTick=0;this.basicAttackReadyTick=null;
    this.stunnedUntilTick=0;this.fearUntilTick=0;this.soulFearUntilTick=0;this.untargetableUntilTick=0;this.skillUntargetable=false;
    this.manaLocked=false;this.domainUntilTick=0;this.domainRadius=0;
    this.skillArmorBonus=0;this.skillMrBonus=0;this.skillAttackSpeedBonus=0;this.skillAttackSpeedPenalty=0;
    this.shadowCorruption=undefined;this.shadowAttackSpeedBonus=0;
    this.nebulaAttackSpeedPenalty=0;this.gravityResistanceBonus=0;this.tauntSourceId=null;
    this.bloodAidUntilTick=0;this.bloodAidResistances.clear();this.bloodRebirth=null;this.bloodCleaveWindup=null;
    this.ropeHunt=null;this.starLeap=null;this.spiderLeap=null;this.furnaceDash=null;
    this.stellarCharge=null;this.stellarShield=null;this.hydraulicBulwark=null;
  }

  get pos() { return { x: this.x, y: this.y }; }

  /** 快照给表现层 / 模拟器读取，防止外部直接改内部状态 */
  snapshot(tick = 0) {
    return {
      demonAirborne: this.alive && !!this.demonLeap,
      bloodAidActive: this.alive && tick < this.bloodAidUntilTick,
      bloodRebirthActive: this.alive && !!this.bloodRebirth,
      bloodCleaveReady: this.alive && this.bloodCleaveReady,
      bloodAidProtected: this.alive && this.bloodAidResistanceBonus > 0,
      hydraulicBulwarkActive: this.alive && !!this.hydraulicBulwark && tick < this.hydraulicBulwark.untilTick,
      ...(this.shadowCorruption ? { shadowCorrupted: this.alive } : {}),
      ...(this.domainRadius ? { domainRadius: this.alive && tick < this.domainUntilTick ? this.domainRadius : 0 } : {}),
      susanooActive: this.alive && tick < this.susanooUntilTick,
      equipmentAttackStacks: this.equipmentAttackStacks,
      equipmentStacks: this.equipment.map(item => item.damageTakenStacks ? Math.min(this.equipmentDamageStacks, item.damageTakenStacks.maxStacks) : this.equipmentAttackStacks),
      id: this.id,
      side: this.side,
      cfgId: this.cfg.id,
      role: this.cfg.role,
      pos: { x: this.x, y: this.y },
      hp: this.hp,
      maxHp: this.cfg.hp,
      baseMaxHp: this.baseMaxHp,
      mana: this.mana,
      manaPerSecond: this.manaPerSecond,
      maxMana: this.cfg.maxMana,
      atkCd: this.atkCd,
      moveCd: this.moveCd,
      alive: this.alive,
      shield: this.shield,
      sunlightShield: this.sunlightShield,
      spiderAirborne: this.alive && !!this.spiderLeap,
      atlasBurning: this.alive && this.burns.some(b=>b.untilBattleEnd),
      untargetable: !!this.bloodRebirth || !!this.spiderLeap || this.skillUntargetable || tick < this.untargetableUntilTick,
    };
  }
}
