import type { WaveEnemy } from './RoundFlow';
import type { WaveKind } from './EnemyGenerationTypes';
export const FORMATION_VERSION='formation-v1';
export type FormationLevel='L0'|'L1'|'L2'|'L3';
export type FormationOverride=FormationLevel|'auto';
export type FormationRole='tank'|'melee_dps'|'ranged_dps'|'mage'|'support'|'assassin';
export const FORMATION_ROLES:FormationRole[]=['tank','melee_dps','ranged_dps','mage','support','assassin'];
export interface RoleEntry { role:FormationRole; tags:string[]; source:'explicit'|'derived'|'fallback'; confidence:'high'|'medium'|'low'; reason:string }
export interface EnemyRoleConfig { version:string; units:Record<string,RoleEntry> }
export interface RolePolicy { priority:number; preferredDepth:number[]; allowedDepth:number[]; flank:boolean }
export interface FormationSettings { level:FormationLevel; strength:number; roleStrength:number; spacingStrength:number; counterStrength:number }
export interface EnemyFormationConfig {
  version:typeof FORMATION_VERSION;
  roles:Record<FormationRole,RolePolicy>;
  weights:{role:number;cover:number;spacing:number;flank:number;counter:number;template:number};
  keyRoles:FormationRole[]; highPowerFraction:number;
  spacingDistance:number; coverDistance:number;
  maxIterations:number; tieTopK:number; tieTolerance:number;
  progression:Array<{stage:number;role:number;spacing:number;counter:number}>;
  kindBonus:{elite:number;boss:number};
  counterKinds:WaveKind[];
  templates:{enabled:boolean;kinds:WaveKind[]};
}
export interface PlayerFormationUnit { unitId:string;star:number;equipment:string[];x:number;y:number;role:FormationRole;range:number;tags:string[] }
export interface PlayerFormationSnapshot { units:readonly PlayerFormationUnit[] }
export interface FormationTemplate { id:string;slots:Array<{x:number;y:number}> }
export interface EnemyFormationContext {
  runSeed:number;globalWaveId:number;stage:number;round:number;roundsInStage:number;waveKind:WaveKind;
  settings:FormationSettings;enemies:readonly WaveEnemy[];
  playerSnapshot?:PlayerFormationSnapshot;template?:FormationTemplate;
  /** Optional offline stress-test subset; always legal cells, never player-controlled. */
  candidateCells?:Array<{x:number;y:number}>;
}
export interface FormationScore {role:number;cover:number;spacing:number;flank:number;counter:number;template:number;total:number}
export interface EnemyFormationResult {
  placements:WaveEnemy[];level:FormationLevel;strength:number;version:string;
  diagnostics:{roleCounts:Record<string,number>;spacingViolations:number;fallbackSteps:string[];
    templateId:string|null;templateUsed:boolean;templateSlotsMatched:number;templateSlotsAvailable:number;
    playerSnapshotUsed:boolean;playerSnapshotHash:string|null;counterReasons:string[];
    score:FormationScore;iterations:number;roleDepthViolations:number;
    roles:Array<{index:number;unitId:string;role:FormationRole;power:number;source:string;confidence:string}>;
  };
}
/** An identity for reproducibility, not a cryptographic security checksum. */
export function formationHash(text:string):string {
  let h=0x811c9dc5;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),0x01000193);
  return (h>>>0).toString(16).padStart(8,'0');
}
