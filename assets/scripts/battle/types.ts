/** 逻辑层公共类型（不含渲染概念） */

export interface BackpackItem { id: string; name: string; icon: string; description?: string; kind: 'equipment' | 'consumable'; }
export const MAX_EQUIPMENT = 3;
export interface BattleOvertimeConfig {
  seconds: number;
  /** Absolute attacks/second at the end of overtime: 1 means +100% displayed speed. */
  attackSpeedBonus: number;
  /** Additive damage amplification at the end of overtime: 1 means +100%. */
  damageAmp: number;
}
export interface BattleClockState {
  phase: 'combat' | 'overtime';
  remainingSeconds: number;
  durationSeconds: number;
  overtimeProgress: number;
}
export type TraitTier = 'bronze' | 'silver' | 'gold' | 'prismatic';
export interface SpiderLeapConfig { airborneSeconds: number; missingHealthFractions: number[]; }
export interface ArrowVolleyConfig { count: number; intervalSeconds: number; }
export interface ChargedKnockupConfig { durationsSeconds: number[]; }
export interface BloodDrainConfig { healAmounts: number[]; spellPowerPerKill: number[]; }
export interface BloodReignConfig {
  healthGains: number[];
  attackWindupSeconds: number;
  length: number;
  width: number;
  rebirthThreshold: number;
  rebirthSeconds: number;
  rebirthHealMaxHpFraction: number;
}
export interface BloodRebirthRuntime {
  startTick: number;
  durationTicks: number;
  total: number;
  delivered: number;
  wasManaLocked: boolean;
}
export interface LineFearConfig { length: number; width: number; fearSeconds: number[] }
export interface NebulaConfig { durationSeconds: number; intervalSeconds: number; attackSpeedPenalty: number; }
export interface GravityConfig { durationSeconds: number; intervalSeconds: number; resistancePerEnemy: number[]; }
export interface SpiderLeapRuntime { landTick: number; targetId: number; }
export interface FurnaceDashConfig { speedMultiplier: number; trailDamage: number[]; knockupSeconds: number; targetRange: number; }
export interface FurnaceDashRuntime { from: Pos; to: Pos; startTick: number; endTick: number; targetId: number; hitIds: Set<number>; }
export interface StellarBulwarkConfig { distance: number; speedMultiplier: number; shieldSeconds: number; knockupSeconds: number; }
export interface RopeHuntConfig { durationSeconds: number; intervalSeconds: number; shotCount: number }
export interface RopeHuntRuntime { from: Pos; edge: Pos; startTick: number; hookTicks: number; endTick: number; nextShot: number; intervalTicks: number; shotsRemaining: number; skillId: string; raw: number }
export interface StellarChargeRuntime { from: Pos; to: Pos; startTick: number; endTick: number; hitIds: Set<number>; }
export interface StarLeapConfig { distance: number; durationSeconds: number; }
export interface StarLeapRuntime { from: Pos; to: Pos; startTick: number; endTick: number; targetId: number; }
export interface AtlasMissilesConfig { targetCounts: number[]; manaReductionPerCast: number; maxManaReduction: number; }
export interface HydraulicBulwarkConfig {
  durationSeconds: number;
  resistanceBonuses: number[];
  healAmounts: number[];
}
export interface HydraulicBulwarkRuntime {
  untilTick: number;
  resistanceBonus: number;
  healAmount: number;
}
export interface TraitStatBonus {
  armor?: number;
  mr?: number;
  maxHpBonus?: number;
  /** Absolute attacks/second, as with all other attack-speed bonuses. */
  attackSpeedBonus?: number;
  physicalPower?: number;
  /** Flat extra physical damage per basic attack, before damage modifiers. */
  attackDamage?: number;
  critChance?: number;
  skillCanCrit?: boolean;
  /** Execute after a damaging hit if remaining HP is strictly below this fraction. */
  executeThreshold?: number;
}
export interface TraitSelector {
  role: 'tank' | 'marksman' | 'assassin' | 'warrior' | 'caster';
  damageType?: 'physical' | 'magic';
}
export interface TraitFormationBonus {
  /** Fractions: 0.2 means +20% of maximum HP after star/equipment scaling. */
  maxHpBonus: number;
  damageReduction: number;
  /** Absolute attacks/second: 0.15 means +15% displayed speed. */
  attackSpeedBonus: number;
  damageAmp: number;
}
export interface TraitBreakpoint {
  count: number;
  tier: TraitTier;
  /** Percentage points, additive with equipment and base physical/spell power. */
  power?: number;
  regenPerSecond?: number;
  /** Members choose front defense or back offense from their initial placement. */
  formation?: TraitFormationBonus;
  stats?: TraitStatBonus;
  shadow?: ShadowTraitEffect;
  sunlight?: SunlightTraitEffect;
  conqueror?: ConquerorTraitEffect;
  spellblade?: SpellbladeTraitEffect;
  spellchanter?: SpellchanterTraitEffect;
  swiftmartialist?: SwiftmartialistTraitEffect;
  mechanicalPioneer?: MechanicalPioneerTraitEffect;
  astral?: AstralTraitEffect;
  bloodfiend?: BloodfiendTraitEffect;
  explorer?: ExplorerTraitEffect;
}
export interface ExplorerTraitEffect {
  pointsPerBattle: number;
  pointsPerKill: number;
  lossMultiplier: number;
  rewardValuePerPoint: number;
}
export interface InspirationConfig { attackSpeedBonuses: number[]; durationSeconds: number }
export interface WindHuntConfig { durationSeconds: number; attackSpeedBonuses: number[]; physicalPowerPerKill: number[] }
export interface LanternGuardConfig { maxAttackSpeedPenalty: number; maxArmorBonuses: number[]; physicalPowerPerArmor: number[] }
export interface InspirationRuntime { startTick: number; untilTick: number; initialBonus: number }
export interface BloodfiendTraitEffect {
  /** Absolute attacks/second per allied kill; each stack expires independently. */
  attackSpeedBonus: number;
  healMaxHpFraction: number;
  durationSeconds: number;
  /** Fraction of overhealing converted to a persistent, additive battle shield. */
  overhealShieldRatio?: number;
}
export interface AstralTraitEffect {
  cellCount: number | 'all';
  /** Percentage points added to both physical and spell power. */
  power: number;
  maxHpBonus: number;
  memberMultiplier: number;
  meteor?: { intervalSeconds: number; damage: number; radius: number };
}
export interface AstralField {
  side: Side;
  cells: Pos[];
  effect: AstralTraitEffect;
}
export interface MechanicalPioneerTraitEffect {
  /** Absolute attacks/second while overclocked; never multiplies base speed. */
  attackSpeedBonus: number;
  /** Fraction of final maximum HP restored each full second of overclock. */
  regenPerSecond: number;
  durationSeconds: number;
  /** Initial wait and the wait after overclock ends. */
  cooldownSeconds: number;
  /** Once per member per battle; strict threshold, cannot rescue lethal hits. */
  lowHealthThreshold?: number;
}
export interface SwiftmartialistTraitEffect {
  /** Percentage points, additive with base/equipment physical power. */
  physicalPower: number;
  /** Absolute attacks/second earned on each cast. */
  attackSpeedPerCast: number;
  maxStacks: number;
}
export interface SpellchanterTraitEffect {
  /** Percentage points, additive with base/equipment spell power. */
  spellPower: number;
  manaOnTakedown: number;
}
export interface ConquerorTraitEffect {
  damageAmp: number;
  lifesteal: number;
  lowHealthThreshold: number;
  lowHealthMultiplier: number;
  protection?: { threshold: number; healMaxHpFraction: number; damageReduction: number; durationSeconds: number };
}
export interface SpellbladeTraitEffect {
  spellPower: number;
  attackSpeedBonus: number;
  damageReduction: number;
  durationSeconds: number;
  empoweredAttacks?: { count: number; damage: number };
}
export interface SunlightTraitEffect {
  shieldMaxHpFraction: number;
  battlefield?: boolean;
  formation?: { delaySeconds: number; frontReduction: number; backAmp: number };
  judgment?: { intervalSeconds: number; damage: number; stunSeconds: number;
    targetMaxHpFraction?: number; independentStatistics?: boolean; statisticsStar?: number };
}
export type SunlightSkillData =
  | { kind: 'bulwark'; durationSeconds: number }
  | { kind: 'arrows'; intervalSeconds: number; finalDamage: number[]; pierceMultiplier: number }
  | { kind: 'bastion'; durationSeconds: number; allyCount: number; allyShields: number[]; heals: number[] }
  | { kind: 'hunt'; intervalSeconds: number; hits: number; shieldBonus: number; speedSeconds: number }
  | { kind: 'cleave'; coneDegrees: number; shieldTargetCap: number; guardTargetCount: number; guardReduction: number; guardSeconds: number }
  | { kind: 'empower'; durationSeconds: number; attacks: number; burstDamage: number[] }
  | { kind: 'crossbow'; penetration: number; minimum: number }
  | { kind: 'prayer'; durationSeconds: number; heals: number[] }
  | { kind: 'judgment'; counts: number[]; allEnemiesStar: number; delaySeconds: number; trueDamage: number[] }
  | { kind: 'transit'; counts: number[]; intervalSeconds: number; finalDamage: number[];
      recastDamageLoss: number; recastDamageLossCap: number };
export type SunlightPulse = 'shield' | 'burst' | 'judgment' | 'warning' | 'formation' | 'board' | 'prayer' | 'bolt' | 'slash' | 'flare';
export interface ShadowTraitEffect {
  resistanceReduction: number;
  damageAmpLossPerSecond?: number;
  damageAmpLossCap?: number;
  board?: { intervalSeconds: number; damageIntervalSeconds?: number; attackSpeedPerPulse: number; attackSpeedCap: number; fixedDamage: number };
}
export interface ShadowCorruption {
  resistanceReduction: number;
  damageAmpLossPerSecond: number;
  damageAmpLossCap: number;
  damageAmpLoss: number;
  nextTick: number;
}
/** Authored skill values are star-indexed bases, never multiples of basic attack. */
export type ShadowSkillData =
  | { kind: 'bulwark'; durationSeconds: number; resistanceBonuses: number[] }
  | { kind: 'piercing'; secondaryDamage: number[] }
  | { kind: 'domain'; durationSeconds: number; allyShieldAmounts: number[]; allyCount: number; slowAmounts: number[] }
  | { kind: 'soulLamp'; durationSeconds: number; intervalSeconds: number; maxHpFractions: number[]; takedownHealth: number[] }
  | { kind: 'flurry'; hits: number; intervalSeconds: number; refundMana: number; refundWindowSeconds: number }
  | { kind: 'cleave'; coneDegrees: number; missingHpBonusCap: number }
  | { kind: 'empower'; durationSeconds: number; attacks: number; burstDamage: number[] }
  | { kind: 'execute'; healthThreshold: number; damageMultiplier: number }
  | { kind: 'lanterns'; count: number; intervalSeconds: number; repeatMultiplier: number; fearSeconds: number[] }
  | { kind: 'blackstars'; counts: number[]; intervalSeconds: number; repeatMultiplier: number; collapseDamage: number[]; collapseRadius: number }
  | { kind: 'void'; counts: number[]; intervalSeconds: number; markDamage: number[] };
export type ShadowPulseEffect = ShadowSkillData['kind'] | 'bulwarkBurst' | 'flameBurst' | 'collapse' | 'voidMark';
export interface TraitConfigData {
  id: string;
  name: string;
  glyph: string;
  description: string;
  members: string[];
  /** Explicitly reserved until this trait's characters are designed. Never activates without members. */
  pendingMembers?: boolean;
  /** Always granted to carriers, even below the first breakpoint. */
  innateLifesteal?: number;
  /** Resolve members from the current roster rather than a hand-maintained ID list. */
  selector?: TraitSelector;
  breakpoints: TraitBreakpoint[];
}
export interface EquipmentConfigData {
  /** Short display-only item introduction, separate from passive effects. */
  introduction?: string;
  /** Optional item-specific shop price; tier pricing remains the default. */
  shopPrice?: number;
  /** White, green, blue, purple and orange quality, independent of gold price. */
  quality?: 1 | 2 | 3 | 4 | 5;
  /** Available only from the travelling merchant, never from ordinary drops. */
  specialShopOnly?: boolean;
  /** Explicit exception allowing special equipment/consumables in mixed-value chests. */
  chestDrop?: boolean;
  /** Consumed on an owned target, never occupies an equipment slot. */
  consumable?: { kind: 'copyUnit'; maxCost: 1 | 3 | 5 }
    | { kind: 'permanentStat'; stat: 'hp' | 'physicalPower' | 'spellPower'; amount: number };
  /** Extra deployment capacity while carried by a deployed unit; copies stack. */
  unitCapBonus?: number;
  /** Unbound emblem opens a frozen four-trait choice on first equip. */
  traitChoice?: boolean;
  grantedTraitId?: string;
  id: string;
  name: string;
  spellPower: number;
  /** Absolute attacks/second: 0.1 is displayed as +10% attack speed. */
  attackSpeedBonus: number;
  /** Absolute attacks/second gained per basic attack: 0.05 means +5%. */
  attackSpeedPerAttack: number;
  hp?: number;
  armor?: number;
  mr?: number;
  physicalPower?: number;
  /** Percentage points of physical power gained on each basic attack. */
  physicalPowerPerAttack?: number;
  manaPerSecond?: number;
  /** Flat maximum mana change; units without a mana bar remain at zero. */
  maxManaBonus?: number;
  maxManaMinimum?: number;
  /** Magic damage to the current attack target on cast, scaled by final maximum mana. */
  castMaxManaDamage?: number;
  /** Each copy grants absolute attack speed until its duration after the latest cast. */
  castAttackSpeed?: { bonus: number; seconds: number };
  /** Blocks hostile stun, knockup, fear and attack-speed slows. */
  crowdControlImmune?: boolean;
  /** At or above threshold grants attack speed; strictly below grants armor. */
  healthStance?: { threshold: number; attackSpeedBonus: number; armor: number };
  /** Positive incoming hits, including shields, grant resistance after the hit. */
  damageTakenStacks?: { maxStacks: number; resistancePerStack: number; maxStackDamageReduction: number };
  /** Additive probability: 0.35 means +35 percentage points. */
  critChance?: number;
  skillCanCrit?: boolean;
  lifesteal?: number;
  /** Applied after all flat equipment HP; multiple copies add their percentages. */
  maxHpBonus?: number;
  /** Each complete step of final maximum HP grants bonus armor and magic resistance. */
  maxHpResistance?: { step: number; bonus: number };
  spellPowerDamageAmp?: { step: number; bonus: number; cap: number };
  missingHpLifesteal?: { step: number; bonus: number };
  armorDamageReduction?: { threshold: number; bonus: number };
  lowTargetDamageAmp?: { threshold: number; bonus: number };
  magicDamageReduction?: number;
  lowHealthRegen?: { threshold: number; intervalSeconds: number; maxHpFraction: number };
  description?: string;
  /** Effect-only copy for equipment cards; base stat rows come from numeric fields. */
  effectDescription?: string;
  /** Shared by the carrier: triggers once per battle, including lethal damage. */
  lowHealthProtection?: {
    threshold: number;
    untargetableSeconds: number;
    shieldMaxHpFraction: number;
    healMaxHpFraction: number;
    healSeconds: number;
  };
  icon: string;
}

export type Side = 0 | 1; // 0 = 己方（下 4 行），1 = 敌方（上 4 行）
export interface Pos { x: number; y: number }
export type DmgType = 'physical' | 'magic' | 'true';

export interface BurnRuntime {
  untilBattleEnd?: boolean;
  fixed?: boolean;
  sourceId: number;
  skillId: string;
  nextTick: number;
  intervalTicks: number;
  remainingPulses: number;
  rawDamage: number;
  dmgType: DmgType;
}

export interface CombatAttributes {
  /** Percentage bonus applied only to physical damage; 0 means no bonus. */
  physicalPower: number;
  /** Percentage bonus applied only to magic damage; 0 means no bonus. */
  spellPower: number;
  critChance: number;
  lifesteal: number;
  damageAmp: number;
  damageReduction: number;
}

export type BattleEvent =
  | { t: 'rope_swing'; tick: number; id: number; from: Pos; edge: Pos; hookTicks: number; durationTicks: number }
  | { t: 'rope_shot'; tick: number; id: number; target: number; from: Pos; to: Pos }
  | { t: 'rope_return'; tick: number; id: number; to: Pos }
  | { t: 'sand_compass'; tick: number; id: number; from: Pos; toward: Pos; cells: Pos[]; radius: number }
  | { t: 'compass_guard'; tick: number; id: number; source: number; serial: number; untilTick: number }
  | { t: 'compass_guard_end'; tick: number; serial: number }
  | { t: 'astral_meteor'; tick: number; side: Side; center: Pos; radius: number }
  | { t: 'sun_pulse'; tick: number; id: number; effect: SunlightPulse; center: Pos; from?: Pos; radius: number; duration: number;
      kind?: SunlightSkillData['kind']; targetId?: number; trait?: boolean; step?: number; finisher?: boolean }
  | { t: 'battle_start'; tick: number }
  | { t: 'move';   tick: number; id: number; from: Pos; to: Pos }
  | { t: 'teleport'; tick: number; id: number; from: Pos; to: Pos }
  | { t: 'attack'; tick: number; id: number; target: number; area?: boolean; shadow?: boolean }
  | { t: 'shadow_mark'; tick: number; id: number; source: number }
  | { t: 'shadow_board'; tick: number; side: Side }
  | { t: 'shadow_pulse'; tick: number; side: Side; damage?: boolean; attackSpeed?: boolean }
  | { t: 'skill_pulse'; tick: number; id: number; skillId: string; effect: ShadowPulseEffect; center: Pos; radius: number; duration?: number; selfCast?: boolean }
  | { t: 'fear'; tick: number; id: number; source: number; duration: number }
  | { t: 'hit';    tick: number; id: number; source: number; actualDamage: number; dmg: number; hp: number; dmgType: DmgType; shadowBoardSide?: Side; sunlightJudgmentSide?: Side; sunlightJudgmentStar?: number; astralMeteorSide?: Side; critical?: boolean; executed?: boolean }
  | { t: 'bloodfiend_revel'; tick: number; id: number; untilTick: number; attackSpeedBonus: number }
  | { t: 'blood_cleave_charge'; tick: number; id: number; target: number; untilTick: number }
  | { t: 'permanent_spell_power'; tick: number; id: number; amount: number; total: number }
  | { t: 'permanent_physical_power'; tick: number; id: number; amount: number; total: number }
  | { t: 'wind_hunt'; tick: number; id: number; untilTick: number }
  | { t: 'corrosion_dose'; tick: number; id: number; target: number; durationTicks: number }
  | { t: 'heal';   tick: number; id: number; source: number; amount: number; hp: number }
  | { t: 'trait_mana'; tick: number; id: number; amount: number; mana: number }
  | { t: 'swiftmartialist_stack'; tick: number; id: number; stacks: number; maxStacks: number; attackSpeedBonus: number }
  | { t: 'mechanical_overclock'; tick: number; id: number; untilTick: number; emergency: boolean }
  | { t: 'shield'; tick: number; id: number; source?: number; equipmentId?: string; amount: number; shield: number }
  | { t: 'equipment_trigger'; tick: number; id: number; equipmentId: string; shield: number }
  | { t: 'cast';   tick: number; id: number; skillId: string; target: number; duration?: number }
  | { t: 'burn'; tick: number; id: number; source: number; duration: number }
  | { t: 'stun'; tick: number; id: number; source: number; duration: number }
  | { t: 'knockup'; tick: number; id: number; source: number; duration: number }
  | { t: 'guard'; tick: number; id: number; duration: number; reduction: number }
  | { t: 'skill_impact'; tick: number; id: number; target: number; skillId: string }
  | { t: 'line_roar'; tick: number; id: number; skillId: string; from: Pos; toward: Pos; length: number; width: number }
  | { t: 'blood_aid'; tick: number; id: number; target: number; skillId: string; phase: 'arrive' | 'return'; from: Pos; to: Pos; untilTick: number }
  | { t: 'blood_rebirth'; tick: number; id: number; skillId: string; untilTick: number }
  | { t: 'blood_cleave'; tick: number; id: number; skillId: string; from: Pos; toward: Pos; length: number; width: number }
  | { t: 'rail_shot'; tick: number; id: number; target: number; from: Pos; to: Pos }
  | { t: 'moon_arrow'; tick: number; id: number; target: number; from: Pos; to: Pos }
  | { t: 'nebula'; tick: number; id: number; center: Pos; radius: number; durationTicks: number }
  | { t: 'gravity_field'; tick: number; id: number; center: Pos; radius: number; durationTicks: number }
  | { t: 'dash'; tick: number; id: number; from: Pos; to: Pos; durationTicks: number }
  | { t: 'dash_stop'; tick: number; id: number; at: Pos }
  | { t: 'missile'; tick: number; id: number; target: number; from: Pos; to: Pos }
  | { t: 'inspiration'; tick: number; id: number; targets: number[]; durationTicks: number; bonus: number }
  | { t: 'death';  tick: number; id: number }
  | { t: 'end';    tick: number; winner: Side | -1 };

export interface BattleResult {
  winner: Side | -1; // -1 = 平局
  ticks: number;
  events: BattleEvent[];
  survivors: number[];
}

export interface CombatStatRow {
  sourceKind?: 'shadowBoard' | 'sunlightJudgment' | 'astralMeteor';
  id: number; name: string; side: Side; star: number;
  damage: number; taken: number; healing: number;
  /** Total shields granted, counted at acquisition rather than absorption. */
  shielding: number;
  damageByType: Record<DmgType, number>;
  takenByType: Record<DmgType, number>;
}

export interface UnitRuntime {
  bloodAidActive?: boolean;
  bloodRebirthActive?: boolean;
  bloodCleaveReady?: boolean;
  bloodAidProtected?: boolean;
  atlasBurning?: boolean;
  spiderAirborne?: boolean;
  hydraulicBulwarkActive?: boolean;
  sunlightShield?: number;
  domainRadius?: number;
  shadowCorrupted?: boolean;
  equipmentAttackStacks?: number;
  equipmentStacks?: number[];
  susanooActive?: boolean;
  manaPerSecond?: number;
  id: number;
  side: Side;
  cfgId: string;
  pos: Pos;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  atkCd: number;
  moveCd: number;
  alive: boolean;
  shield?: number;
  untargetable?: boolean;
}
