import type {BotObservation} from '../../assets/scripts/core/BotObservation';
import type {OwnedUnit} from '../../assets/scripts/core/OwnedUnits';
import type {UnitConfigData} from '../../assets/scripts/core/ConfigManager';

export type PlayerRole='tank'|'melee'|'ranged'|'mage'|'assassin';
/** Public unit/skill descriptions, not EnemyPowerModel or hidden simulator outcomes. */
export function roleOf(unit:UnitConfigData,o:BotObservation):PlayerRole {
  const skill=unit.skillId?o.catalog.skills[unit.skillId]:undefined;
  if(unit.role==='tank'||skill?.effect==='healChannel'||skill?.effect==='knockupGuard'||(unit.range===1&&unit.armor>=35))return 'tank';
  if(unit.role==='assassin'||skill?.effect==='teleportEmpower')return 'assassin';
  if(unit.role==='caster')return 'mage';if(unit.range>1)return 'ranged';return 'melee';
}
export const unitConfig=(id:string,o:BotObservation)=>o.catalog.units.find(u=>u.id===id)!;
export function quality(cfg:UnitConfigData,star:number,o:BotObservation):number {
  const role=roleOf(cfg,o),skill=cfg.skillId?o.catalog.skills[cfg.skillId]:undefined;
  // An intentionally rough, published attribute heuristic; it is never reported as calibrated power.
  const offense=cfg.atk*cfg.atkSpeed*(1+(cfg.range-1)*.06)+Math.max(0,skill?.power??0)*.05;
  const defense=cfg.hp/25+(cfg.armor+cfg.mr)*.3;
  const ability=(skill?.effect==='teleportEmpower'?22:skill?.effect==='damageStun'?15:skill?.effect==='healChannel'?18:skill?.effect==='knockupGuard'?14:0);
  return (offense*(role==='tank'?.65:1)+defense*(role==='tank'?1.2:.55)+ability)*Math.pow(1.65,star-1)+(cfg.cost??1)*4;
}
export const ownedQuality=(u:OwnedUnit,o:BotObservation)=>quality(unitConfig(u.unitId,o),u.star,o);
export function coreUnits(o:BotObservation,count:number):string[] {
  return [...new Set(o.units.slice().sort((a,b)=>ownedQuality(b,o)-ownedQuality(a,o)||a.uid-b.uid).map(u=>u.unitId))].slice(0,count);
}
export function equipmentFit(id:string,unit:OwnedUnit,o:BotObservation,synergy=false):number {
  const item=o.catalog.equipment.find(e=>e.id===id);if(!item)return -Infinity;
  const cfg=unitConfig(unit.unitId,o),role=roleOf(cfg,o),tank=role==='tank',spell=role==='mage',physical=role==='ranged'||role==='melee'||role==='assassin';
  const stats=item as unknown as Record<string,any>;
  let score=(stats.hp??0)/25*(tank?1.8:.7)+(stats.armor??0)*(tank?.9:.25)+(stats.mr??0)*(tank?.9:.25)
    +(stats.physicalPower??0)*(physical?1.2:.45)+(stats.spellPower??0)*(spell?1.4:.35)+(stats.attackSpeedBonus??0)*70*(tank?.6:1.2)
    +(stats.critChance??0)*50+(stats.lifesteal??0)*80+(stats.maxHpBonus??0)*80*(tank?1.8:1);
  if(stats.attackSpeedPerAttack)score+=50*cfg.atkSpeed+(physical?10:0);
  if(stats.skillCanCrit&&cfg.skillId)score+=spell?18:10;
  if(stats.lowHealthProtection)score+=tank?35:20;
  if(stats.lowHealthRegen)score+=tank?45:15;
  if(stats.magicDamageReduction||stats.armorDamageReduction)score+=tank?20:7;
  if(stats.lowTargetDamageAmp)score+=physical?18:8;
  if(stats.spellPowerDamageAmp)score+=spell?15:3;
  if(synergy){const existing=unit.equipment??[];
    if(stats.skillCanCrit&&existing.some(e=>o.catalog.equipment.find(i=>i.id===e)?.skillCanCrit))score-=15;
    if(stats.lowHealthProtection&&existing.some(e=>o.catalog.equipment.find(i=>i.id===e)?.lowHealthProtection))score-=20;
    if(stats.attackSpeedPerAttack&&existing.includes('guinsoo'))score+=8;
    score*=Math.pow(unit.star,.35);}
  return score;
}
