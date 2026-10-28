require('tsx/cjs');
const assert=require('node:assert/strict');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {unlockedEquipment,equipmentIdentity}=require('../assets/scripts/core/EquipmentPolicy.ts');
const input=loadRunInputs(),deps={...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
const ids=input.equipment.filter(item=>!item.specialShopOnly).map(item=>item.id).sort();
assert.ok(input.equipment.every(item=>item.specialShopOnly||deps.equipmentPolicy.tiers[item.id]==='basic'));
assert.deepEqual([...input.run.stageEncounters.basicEquipmentIds].sort(),ids);
assert.deepEqual(unlockedEquipment(deps.equipmentPolicy,1,deps.equipmentPolicy.reward.tierUnlock).filter(id=>!deps.equipmentPolicy.reward.excludedIds.includes(id)),ids);
function make(run,policy,save){const cfg=new ConfigManager();cfg.setUnits(input.units);cfg.setSkills(input.skills);cfg.setBattle(input.battle);cfg.setEquipment(input.equipment);
 return new RunSession(cfg,run,input.waves,{...deps,equipmentPolicy:policy,stageCount:6,runSeed:123,...(save?{save}:{})});}
console.log('PASS ordinary items: complete reward pool and early unlocks');
