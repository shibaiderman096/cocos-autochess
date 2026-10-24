require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
const {stableEnemyJson}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const oldEquipment=require('../art-source/original-equipment/equipment-before.json');
const inputs=loadRunInputs(),clone=value=>JSON.parse(JSON.stringify(value));
const options={runSeed:1018,enemyGenerationMode:'budget-v1',...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function make(equipment,save){
  const cfg=new ConfigManager();cfg.setUnits(clone(inputs.units));cfg.setSkills(clone(inputs.skills));cfg.setBattle(clone(inputs.battle));cfg.setEquipment(clone(equipment));
  const policy=clone(options.equipmentPolicy),run=clone(inputs.run),ids=new Set(equipment.map(item=>item.id));
  // This historical display migration predates the optional enemy loadout rules.
  delete policy.enemy.itemTags;delete policy.enemy.equipmentEconomy;
  policy.reward.excludedIds=(policy.reward.excludedIds??[]).filter(id=>ids.has(id));
  policy.tiers=Object.fromEntries(Object.entries(policy.tiers).filter(([id])=>ids.has(id)));
  run.stageEncounters.basicEquipmentIds=run.stageEncounters.basicEquipmentIds.filter(id=>ids.has(id));
  return new RunSession(cfg,run,inputs.waves,{...options,equipmentPolicy:policy,...(save?{save:clone(save)}:{})});
}
const original=make(oldEquipment),bot=new MinimalBaselineBot();bot.prepare(original.playerPort());
const saved=original.snapshot(),difficulty=JSON.parse(saved.difficultyConfigIdentity);
difficulty.equipment=oldEquipment.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
saved.difficultyConfigIdentity=stableEnemyJson(difficulty);
const policy=JSON.parse(saved.equipmentConfigIdentity);policy.items=difficulty.equipment;saved.equipmentConfigIdentity=stableEnemyJson(policy);
const baseline=make(oldEquipment,saved),resumed=make(inputs.equipment,saved);
assert.equal(resumed.snapshot().difficultyConfigIdentity,saved.difficultyConfigIdentity);
assert.equal(resumed.snapshot().equipmentConfigIdentity,saved.equipmentConfigIdentity);
assert.deepEqual(resumed.startBattle().run(),baseline.startBattle().run(),'equipment display changes preserve the exact saved battle');
assert.deepEqual(resumed.formation,baseline.formation);
const changed=clone(inputs.equipment);changed[0].attackSpeedPerAttack+=.01;
assert.throws(()=>make(changed,saved),/configuration mismatch/,'mechanical changes still reject incompatible saves');
console.log('PASS equipment display save: legacy display fields resume, exact battle events and formation preserved, mechanical changes rejected');
