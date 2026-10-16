import type { EquipmentConfigData } from '../battle/types';
import type { EnemyPowerData } from './EnemyPowerTypes';
import type { EquipmentPolicyConfig, EquipmentQuota, EquipmentTier } from './EquipmentPolicyTypes';
import type { WaveKind } from './EnemyGenerationTypes';
import { stableEnemyJson } from './EnemyGenerationTypes';
import type { EnemyRoleConfig } from './EnemyFormationTypes';

export function validateEquipmentPolicy(c:EquipmentPolicyConfig,items?:Pick<EquipmentConfigData,'id'>[],power?:EnemyPowerData):void {
  const bad=()=>{throw new Error('Invalid equipment policy configuration');};
  if(!c||c.enemyVersion!=='equipment-policy-v1'||c.rewardVersion!=='equipment-reward-v1')bad();
  const catalogue=items??Object.keys(c.tiers??{}).map(id=>({id})),ids=new Set(catalogue.map(i=>i.id)),tiers=['basic','advanced','special'];
  if(catalogue.some(i=>!tiers.includes(c.tiers?.[i.id]))||Object.keys(c.tiers).some(id=>!ids.has(id)))bad();
  const e=c.enemy,r=c.reward;
  if(!e||!r||!Array.isArray(e.calibratedItems)||new Set(e.calibratedItems).size!==e.calibratedItems.length
    ||e.calibratedItems.some(id=>!ids.has(id)||(power&&!power.equipment[id])))bad();
  if(![e.maxEquipmentCandidatesPerUnit,e.topKSingle,e.topKCombination].every(n=>Number.isInteger(n)&&n>=1&&n<=12)
    ||![e.targetPenalty,e.corePenalty].every(n=>Number.isFinite(n)&&n>=0&&n<=.05))bad();
  for(const unlock of [e.tierUnlock,r.tierUnlock])if(tiers.some(t=>!Number.isSafeInteger(unlock?.[t])||unlock[t]<1))bad();
  for(const kind of ['normal','elite','boss'] as const){const rows=e.quotas?.[kind];
    if(!rows?.length||rows[0].stage!==1||rows.some((q,i)=>![q.stage,q.maxEquippedUnits,q.maxItemsPerUnit,q.targetItems].every(Number.isSafeInteger)
      ||q.stage<1||(i>0&&q.stage<=rows[i-1].stage)||q.maxEquippedUnits<0||q.maxEquippedUnits>10||q.maxItemsPerUnit<0||q.maxItemsPerUnit>3
      ||q.targetItems<0||q.targetItems>q.maxEquippedUnits*q.maxItemsPerUnit||(kind!=='boss'&&q.maxItemsPerUnit>1)))bad();
    if(kind==='normal'&&rows.some(q=>q.maxEquippedUnits||q.maxItemsPerUnit||q.targetItems))bad();
    if(rows.filter(q=>q.stage<3).some(q=>q.targetItems||q.maxEquippedUnits))bad();
  }
  if(!e.rolePreferences||Object.values(e.rolePreferences).some(list=>!Array.isArray(list)||list.some(id=>!ids.has(id))))bad();
  if(![r.eliteChance,r.bossChance].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||!Number.isInteger(r.choices)||r.choices<1||r.choices>3
    ||r.insufficientPool!=='fewer-choices'||r.guarantee!=='last-eligible-victory'||!Array.isArray(r.emptyBasicFallbackIds)
    ||new Set(r.emptyBasicFallbackIds).size!==r.emptyBasicFallbackIds.length||r.emptyBasicFallbackIds.some(id=>!ids.has(id)||c.tiers[id]==='special'))bad();
}
export function equipmentQuota(c:EquipmentPolicyConfig,stage:number,kind:WaveKind):EquipmentQuota {
  if(kind==='intro')return {stage:1,maxEquippedUnits:0,maxItemsPerUnit:0,targetItems:0};
  return c.enemy.quotas[kind].filter(q=>q.stage<=stage).slice(-1)[0];
}
export function equipmentIdentity(c:EquipmentPolicyConfig,items:EquipmentConfigData[],roles?:EnemyRoleConfig):string {
  return stableEnemyJson({policy:c,roles:roles??null,items:items.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)});
}
export function unlockedEquipment(c:EquipmentPolicyConfig,stage:number,unlock:Record<EquipmentTier,number>):string[] {
  return Object.keys(c.tiers).filter(id=>stage>=unlock[c.tiers[id]]).sort();
}
