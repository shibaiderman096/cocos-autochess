import type { UnitConfigData } from './ConfigManager';
import type { EnemyCandidate,WaveKind } from './EnemyGenerationTypes';
import type { EquipmentPolicyConfig } from './EquipmentPolicyTypes';
import type { EnemyPowerData } from './EnemyPowerTypes';
import { EnemyPowerModel,equipmentPowerKey } from './EnemyPowerModel';
import { equipmentQuota,unlockedEquipment } from './EquipmentPolicy';
import { resolveEnemyRole } from './EnemyRoles';
import type { EnemyRoleConfig } from './EnemyFormationTypes';

/** Bounded beam over multisets: duplicates are legal in the real three-slot system. */
export function equipmentCandidates(naked:EnemyCandidate[],roster:UnitConfigData[],stage:number,kind:WaveKind,c:EquipmentPolicyConfig,power:EnemyPowerData,model:EnemyPowerModel,roles?:EnemyRoleConfig):EnemyCandidate[] {
  const quota=equipmentQuota(c,stage,kind);if(!quota.maxEquippedUnits)return naked;
  const ids=unlockedEquipment(c,stage,c.enemy.tierUnlock).filter(id=>c.enemy.calibratedItems.includes(id)&&!!power.equipment[id]);
  const result=naked.slice(),settings=c.enemy;
  for(const base of naked){
    // The new uncalibrated content can retain P1-C's cost fallback, but never receives equipment priced from a missing unit calibration.
    if(!power.units[base.unitId])continue;
    const unit=roster.find(u=>u.id===base.unitId)!,role=resolveEnemyRole(unit,{},roles??{version:'equipment-role-fallback-v1',units:{}}).role;
    const preferences=settings.rolePreferences[role]??[];
    const estimate=(equipment:string[]):EnemyCandidate=>{const e=model.estimateUnitPower({unitId:base.unitId,cost:base.cost,star:base.star,equipment});
      return {...base,equipment,power:e.power,confidence:e.confidence,diagnostics:e.diagnostics};};
    const rank=(a:EnemyCandidate,b:EnemyCandidate)=>{
      // Role preference only orders the pruning beam; power is always the actual model query.
      const affinity=(u:EnemyCandidate)=>u.equipment.reduce((n,id)=>n+(preferences.includes(id)?preferences.length-preferences.indexOf(id):0),0);
      const utility=(u:EnemyCandidate)=>(u.power-base.power)/base.power;
      return utility(b)-utility(a)||affinity(b)-affinity(a)||equipmentPowerKey(a.equipment).localeCompare(equipmentPowerKey(b.equipment));
    };
    const singles=ids.map(id=>estimate([id])).filter(u=>u.power>base.power+1e-9);
    // Keep a preferred item as well as the largest measured gain, rather than random equal-probability assignment.
    singles.sort(rank);const preferred=preferences.map(id=>singles.find(u=>u.equipment[0]===id)).filter((v):v is EnemyCandidate=>!!v);
    let beam=Array.from(new Map([...preferred.slice(0,1),...singles].map(u=>[equipmentPowerKey(u.equipment),u])).values()).slice(0,settings.topKSingle);
    const selected=beam.slice();
    for(let slots=2;slots<=quota.maxItemsPerUnit;slots++){
      const unique=new Map<string,EnemyCandidate>();
      for(const a of beam)for(const id of ids){const eq=[...a.equipment,id].sort(),key=equipmentPowerKey(eq);if(!unique.has(key))unique.set(key,estimate(eq));}
      beam=Array.from(unique.values()).filter(u=>u.power>base.power+1e-9).sort(rank).slice(0,settings.topKCombination);selected.push(...beam);
    }
    const starCount=naked.filter(u=>u.unitId===base.unitId).length,limit=Math.floor(settings.maxEquipmentCandidatesPerUnit/starCount);
    // Reserve one candidate at each legal slot depth before filling the remaining beam.
    const byDepth=[1,2,3].map(n=>selected.find(u=>u.equipment.length===n)).filter((u):u is EnemyCandidate=>!!u);
    const bounded=Array.from(new Map([...byDepth,...selected].map(u=>[equipmentPowerKey(u.equipment),u])).values()).slice(0,limit);
    result.push(...bounded);
  }
  return result;
}
