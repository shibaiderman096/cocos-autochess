import type { UnitConfigData,SkillConfigData } from './ConfigManager';
import { FORMATION_ROLES } from './EnemyFormationTypes';
import type { EnemyRoleConfig,RoleEntry,PlayerFormationSnapshot } from './EnemyFormationTypes';
import { stableEnemyJson } from './EnemyGenerationTypes';
import { formationHash } from './EnemyFormationTypes';

export function resolveEnemyRole(unit:UnitConfigData,skills:Record<string,SkillConfigData>,config:EnemyRoleConfig):RoleEntry {
  const explicit=config.units[unit.id];
  if(explicit){if(!FORMATION_ROLES.includes(explicit.role)||!explicit.reason||!['high','medium','low'].includes(explicit.confidence)||!Array.isArray(explicit.tags))throw new Error('Invalid explicit formation role: '+unit.id);
    return {...explicit,tags:explicit.tags.slice().sort(),source:'explicit'};}
  const skill=unit.skillId?skills[unit.skillId]:undefined,tags:string[]=[];
  if(skill?.radius>0)tags.push('aoe');if(skill?.effect==='damageStun'||skill?.effect==='knockupGuard')tags.push('control');
  if(skill?.effect==='healChannel'||skill?.effect==='healAlly')tags.push('healing');if(skill?.effect==='teleportEmpower')tags.push('teleport');
  const map:Record<string,RoleEntry['role']>={warrior:'melee_dps',marksman:'ranged_dps',tank:'tank',magicTank:'tank',physicalCaster:'mage',physicalArcher:'ranged_dps',frontline:'melee_dps',fighter:'melee_dps',ranged:'ranged_dps',magicArcher:'ranged_dps',caster:'mage',assassin:'assassin',support:'support'};
  const existing=map[unit.role];
  const role=existing??(skill?.effect==='teleportEmpower'?'assassin':skill?.effect==='healChannel'?'tank':unit.range>1?(skill?.radius>0?'mage':'ranged_dps'):'melee_dps');
  return {role,tags:tags.sort(),source:existing||skill?'derived':'fallback',confidence:existing||skill?'medium':'low',
    reason:existing?'mapped existing unit role '+unit.role:skill?'derived from existing skill effect/range':'stable range fallback; range=1 does not imply tank'};
}
export function snapshotIdentity(snapshot:PlayerFormationSnapshot):string {
  return formationHash(stableEnemyJson(snapshot.units.map(u=>({unitId:u.unitId,star:u.star,equipment:u.equipment.slice().sort(),x:u.x,y:u.y}))
    .sort((a,b)=>a.y-b.y||a.x-b.x||(a.unitId<b.unitId?-1:a.unitId>b.unitId?1:0)||a.star-b.star)));
}
