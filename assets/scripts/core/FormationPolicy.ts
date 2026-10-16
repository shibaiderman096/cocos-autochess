import { FORMATION_ROLES,FORMATION_VERSION } from './EnemyFormationTypes';
import type { EnemyFormationConfig,FormationOverride,FormationSettings } from './EnemyFormationTypes';
import type { WaveKind } from './EnemyGenerationTypes';

export function validateFormationConfig(c:EnemyFormationConfig):void {
  if(!c||c.version!==FORMATION_VERSION)throw new Error('Unsupported formation version');
  for(const role of FORMATION_ROLES){const p=c.roles?.[role];if(!p||!Number.isSafeInteger(p.priority)||p.priority<0||typeof p.flank!=='boolean'
    ||![p.preferredDepth,p.allowedDepth].every(a=>Array.isArray(a)&&a.length&&a.every(y=>Number.isInteger(y)&&y>=4&&y<=7))
    ||p.preferredDepth.some(y=>!p.allowedDepth.includes(y)))throw new Error('Invalid formation role policy: '+role);}
  if(!Number.isSafeInteger(c.maxIterations)||c.maxIterations<1||c.maxIterations>100||!Number.isSafeInteger(c.tieTopK)||c.tieTopK<1||c.tieTopK>5
    ||!Number.isFinite(c.tieTolerance)||c.tieTolerance<0||c.tieTolerance>1e-6
    ||c.spacingDistance!==2||c.coverDistance!==2||!Array.isArray(c.keyRoles)||c.keyRoles.some(r=>!FORMATION_ROLES.includes(r))
    ||!Number.isFinite(c.highPowerFraction)||c.highPowerFraction<=0||c.highPowerFraction>1)throw new Error('Invalid formation solver configuration');
  if(!c.weights||!['role','cover','spacing','flank','counter','template'].every(k=>Number.isFinite(c.weights[k])&&c.weights[k]>=0&&c.weights[k]<=1)||c.weights.role<=0)throw new Error('Invalid normalized formation weights');
  if(!c.progression?.length||c.progression[0].stage!==2||c.progression.some((p,i)=>!Number.isSafeInteger(p.stage)||p.stage<2
    ||!['role','spacing','counter'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1)
    ||(i>0&&p.stage<=c.progression[i-1].stage)))throw new Error('Invalid formation progression');
  if(!c.kindBonus||!['elite','boss'].every(k=>Number.isFinite(c.kindBonus[k])&&c.kindBonus[k]>=0&&c.kindBonus[k]<=.2)
    ||!Array.isArray(c.counterKinds)||!c.templates||typeof c.templates.enabled!=='boolean'||!Array.isArray(c.templates.kinds)
    ||[...c.counterKinds,...c.templates.kinds].some(k=>!['normal','elite','boss'].includes(k)))throw new Error('Invalid formation kind policy');
}
export function formationSettings(c:EnemyFormationConfig,stage:number,round:number,rounds:number,kind:WaveKind,override:FormationOverride='auto'):FormationSettings {
  if(!['auto','L0','L1','L2','L3'].includes(override))throw new Error('Invalid formation override');
  if(kind==='intro'||override==='L0')return {level:'L0',strength:0,roleStrength:0,spacingStrength:0,counterStrength:0};
  if(override!=='auto')return {level:override,strength:1,roleStrength:1,spacingStrength:override==='L1'?0:1,counterStrength:override==='L3'?1:0};
  const position=stage+(round-1)/rounds,lo=c.progression.filter(p=>p.stage<=position).slice(-1)[0]??c.progression[0],hi=c.progression.find(p=>p.stage>position)??lo;
  const t=hi===lo?0:(position-lo.stage)/(hi.stage-lo.stage),bonus=kind==='elite'?c.kindBonus.elite:kind==='boss'?c.kindBonus.boss:0;
  const lerp=(k:'role'|'spacing'|'counter')=>{
    const base=lo[k]+(hi[k]-lo[k])*t;
    return Math.min(1,base+(k==='role'||base>0?bonus:0));
  };
  const role=lerp('role'),spacing=lerp('spacing'),counter=c.counterKinds.includes(kind)?lerp('counter'):0;
  const level=counter>0?'L3':spacing>0?'L2':role>0?'L1':'L0';
  return {level,strength:level==='L3'?counter:level==='L2'?spacing:role,roleStrength:role,spacingStrength:spacing,counterStrength:counter};
}
