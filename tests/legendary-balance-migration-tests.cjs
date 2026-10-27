require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {sameCombatConfigurationIdentity,combatConfigurationIdentity}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const t=require('../tools/run-simulation.ts'),input=t.loadRunInputs(),clone=x=>JSON.parse(JSON.stringify(x));
const deps={...t.loadEnemyGenerationInputs(),...t.loadFormationInputs(),...t.loadEquipmentInputs()};
const changes=[
 ['rope_shadow_hunt',['starDamage'],3000,2000],['sky_annihilation',['starDamage'],5000,5000],
 ['blackstar_annihilation',['starDamage'],3000,2000],['blackstar_annihilation',['shadow','collapseDamage'],6000,2500],
 ['voidscar_transit',['starDamage'],1500,2000],['voidscar_transit',['shadow','markDamage'],4000,2500],
 ['celestial_judgment',['starDamage'],4500,4500],['celestial_judgment',['sunlight','trueDamage'],1500,1500],
 ['corona_transit',['starDamage'],1600,2000],['corona_transit',['sunlight','finalDamage'],8000,3000],
 ['blood_sovereignty',['starDamage'],7500,7500],['blood_sovereignty',['bloodReign','healthGains'],9000,9000],
];
function config(skills){const c=new ConfigManager();c.setUnits(input.units);c.setSkills(skills);c.setBattle(input.battle);c.setEquipment(input.equipment);return c;}
for(const variant of [2,3]){
 const previous=clone(input.skills);for(const [id,path,...values]of changes)path.reduce((o,k)=>o[k],previous[id])[2]=values[variant-2];
 const old=new RunSession(config(previous),input.run,input.waves,{...deps,stageCount:6,runSeed:1027,enemyGenerationMode:'budget-v1'});
 assert.ok(old.debugJump(3,1));const saved=old.snapshot(),before=clone(saved);
 const current=new RunSession(config(input.skills),input.run,input.waves,{...deps,save:saved});
 assert.equal(current.economy.gold,before.gold);assert.equal(current.flow.wave.id,old.flow.wave.id);assert.equal(current.flow.health,before.round.health);
 assert.deepEqual(current.owned.snapshot(),old.owned.snapshot());assert.deepEqual(current.pool.snapshot(),old.pool.snapshot());assert.deepEqual(saved,before);
 const identity=skills=>combatConfigurationIdentity({skills}),oldIdentity=identity(previous),now=identity(input.skills);
 assert.ok(sameCombatConfigurationIdentity(oldIdentity,now));assert.ok(!sameCombatConfigurationIdentity(now,oldIdentity),'migration is one-way');
 for(const change of changes){
  const unknown=clone(previous);change[1].reduce((o,k)=>o[k],unknown[change[0]])[2]=12345;
  assert.ok(!sameCombatConfigurationIdentity(identity(unknown),now),'unknown third-star value stays rejected');
 }
 const altered=clone(previous);altered.rope_shadow_hunt.starDamage[0]++;
 assert.ok(!sameCombatConfigurationIdentity(identity(altered),now),'one-star edits stay rejected');
 altered.rope_shadow_hunt.starDamage[0]--;altered.rope_shadow_hunt.ropeHunt.shotCount++;
 assert.ok(!sameCombatConfigurationIdentity(identity(altered),now),'mechanics edits stay rejected');
}
console.log('PASS legendary save migration: released/intermediate three-star values adopted, progress/inventory/pool preserved, no source mutation, reverse/unknown/other combat changes rejected');
