import type { UnitConfigData } from './ConfigManager';
import type { WaveConfig } from './RoundFlow';
import type { EquipmentPolicyConfig, EnemyEquipmentFit } from './EquipmentPolicyTypes';
import type { EnemyRoleConfig, FormationRole } from './EnemyFormationTypes';
import { resolveEnemyRole } from './EnemyRoles';
import { equipmentQuality } from './EquipmentQuality';
import { rollShopCost, shopCostRates, validCost } from './ShopConfig';
import { resolveTraits } from '../battle/Traits';
import { tidyEnemyRows } from './EnemyGoldArmy';
import type { EquipmentConfigData, TraitConfigData } from '../battle/types';
import { RunRandomContext } from './RunRandomContext';
import { MAX_EQUIPMENT } from '../battle/types';

export function enemyEquipmentFits(unit: UnitConfigData, role: FormationRole, fit: EnemyEquipmentFit): boolean {
  return fit.enabled && fit.roles.includes(role) && (!fit.damageTypes || fit.damageTypes.includes(unit.damageType))
    && (!fit.requiresMana || (unit.maxMana > 0 && !!unit.skillId));
}

/** Spend bonus gold after the base army is selected, so equipment never replaces units or stars. */
export function applyEnemyUpgrades(wave: WaveConfig, policy: EquipmentPolicyConfig, roster: UnitConfigData[], random: RunRandomContext, roles?: EnemyRoleConfig, catalogue: EquipmentConfigData[] = [], traits: TraitConfigData[] = []): WaveConfig {
  const economy = policy.enemy.equipmentEconomy, tags = policy.enemy.itemTags;
  const kind = wave.encounterKind ?? wave.waveKind;
  if (wave.enemyUpgrade || !economy || !tags || wave.stage! < economy.startStage
    || (kind !== 'elite' && kind !== 'boss' && !(kind === 'normal' && economy.normal)) || !wave.enemies.length) return wave;
  const rule = kind === 'elite' || kind === 'boss' ? economy[kind] : undefined;
  const baseGold = economy.normal ? economy.normal.initialGold+(wave.stage!-economy.startStage)*economy.normal.goldPerStage
    +(rule ? rule.initialGold+wave.stage!*rule.goldPerStage : 0)
    : Math.min(rule!.maxGold!,rule!.initialGold+(wave.stage!-economy.startStage)*rule!.goldPerStage);
  const unitGoldCarryover=wave.goldBudget?.remainingGold??0, gold=baseGold+unitGoldCarryover;
  const healthMultiplier=rule?.healthMultiplier??1;
  const enemies = wave.enemies.map(e => ({ ...e, equipment: [...(e.equipment ?? [])], healthMultiplier }));
  const rng = random.stream('enemy', wave.id, 7101);
  if(!catalogue.length)throw new Error('Enemy equipment generation requires the equipment catalogue');
  const definitions=new Map(catalogue.map(item=>[item.id,item]));
  const level=wave.goldBudget?.shopLevel??enemies.length, qualityRates=shopCostRates(level);
  // Shop quality replaces the old stage-based tier gate. Copies are not wearable enemy rewards.
  const items=catalogue.filter(item=>tags[item.id]?.enabled&&item.consumable?.kind!=='copyUnit');
  const price = (item: EquipmentConfigData) => item.shopPrice??tags[item.id].goldCost??economy.itemCost;
  const reinforcementPool=roster.filter(unit=>!unit.summonOnly&&(unit.populationCost??1)===1);
  const reinforcementRates=shopCostRates(level,reinforcementPool.map(unit=>validCost(unit.cost)));
  const cheapest=Math.min(...reinforcementPool.filter(unit=>reinforcementRates[validCost(unit.cost)-1]>0).map(unit=>unit.cost??1));
  const traitStates=()=>resolveTraits(traits,enemies.map(enemy=>({id:enemy.unitId,
    grantedTraitIds:(enemy.equipment??[]).flatMap(id=>id.includes('__')?[id.split('__')[1]]:definitions.get(id)?.grantedTraitId?[definitions.get(id)!.grantedTraitId!]:[])})),roster);
  const emblemTrait=(enemy:typeof enemies[number])=>traitStates().find(state=>state.count>0&&!state.config.pendingMembers
    &&!state.memberIds.includes(enemy.unitId));
  let remaining = gold, reinforcementGold=0;
  const bought: string[] = [], consumableIds:string[]=[];
  while (remaining > 0) {
    const carriers=enemies.map((enemy,index)=>{
      const unit=roster.find(u=>u.id===enemy.unitId);
      if(!unit)throw new Error('Unknown enemy equipment carrier: '+enemy.unitId);
      const role=resolveEnemyRole(unit,{},roles??{version:'equipment-fallback',units:{}}).role;
      const eligible=items.filter(item=>price(item)<=remaining&&enemyEquipmentFits(unit,role,tags[item.id])
        &&(item.consumable?.kind==='permanentStat'||enemy.equipment.length<MAX_EQUIPMENT)
        &&(!item.traitChoice||!!emblemTrait(enemy))
        &&(!item.unitCapBonus||(enemies.length+item.unitCapBonus<=28&&remaining>=price(item)+cheapest*item.unitCapBonus)));
      return {enemy,index,value:(unit.cost??1)*3**(enemy.star-1),items:eligible};
    }).filter(carrier=>carrier.items.length).sort((a,b)=>b.enemy.equipment.length-a.enemy.equipment.length||b.value-a.value||a.index-b.index);
    const weights=qualityRates.map((rate,index)=>carriers.some(c=>c.items.some(item=>equipmentQuality(item)===index+1))?rate:0);
    const quality=rollShopCost(weights,()=>rng.next());
    if(quality===null)break;
    const carrier=carriers.find(c=>c.items.some(item=>equipmentQuality(item)===quality))!;
    const pool=carrier.items.filter(item=>equipmentQuality(item)===quality);
    const distinct=pool.filter(item=>!carrier.enemy.equipment.some(id=>id.split('__')[0]===item.id));
    const choices=distinct.length?distinct:pool, item=choices[rng.int(0,choices.length-1)];
    remaining-=price(item);
    if(item.consumable?.kind==='permanentStat'){
      const key=item.consumable.stat==='hp'?'permanentMaxHp':item.consumable.stat==='physicalPower'?'permanentPhysicalPower':'permanentSpellPower';
      carrier.enemy[key]=(carrier.enemy[key]??0)+item.consumable.amount;
      consumableIds.push(item.id);
      continue;
    }
    const id=item.traitChoice?item.id+'__'+emblemTrait(carrier.enemy)!.config.id:item.id;
    carrier.enemy.equipment.push(id);bought.push(id);
    for(let i=0;i<(item.unitCapBonus??0);i++){
      const affordable=reinforcementPool.filter(unit=>(unit.cost??1)<=remaining-cheapest*((item.unitCapBonus??0)-i-1));
      const cost=rollShopCost(reinforcementRates.map((rate,index)=>affordable.some(unit=>validCost(unit.cost)===index+1)?rate:0),()=>rng.next())!;
      const candidates=affordable.filter(unit=>validCost(unit.cost)===cost);
      const dominant=traitStates().find(state=>!state.config.selector&&state.count>0);
      const themed=candidates.filter(unit=>dominant?.config.members.includes(unit.id)&&!enemies.some(e=>e.unitId===unit.id));
      const options=themed.length?themed:candidates, unit=options[rng.int(0,options.length-1)];
      remaining-=unit.cost??1;reinforcementGold+=unit.cost??1;
      enemies.push({unitId:unit.id,star:1,x:0,y:4,statMultiplier:1,healthMultiplier,equipment:[]});
    }
  }
  return { ...wave, enemies:tidyEnemyRows(enemies,roster), enemyUpgrade: { goldBudget: gold, baseGoldBudget:baseGold, unitGoldCarryover,
    reinforcementGold,consumableIds,qualityRates,goldSpent: gold - remaining, goldRemaining: remaining,
    itemCount: bought.length, equipmentIds: bought, healthMultiplier } };
}
