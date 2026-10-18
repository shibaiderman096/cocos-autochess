require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
const {stableEnemyJson,combatConfigurationIdentity}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),clone=value=>JSON.parse(JSON.stringify(value));
const options={runSeed:1016,enemyGenerationMode:'budget-v1',...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function make(skills=inputs.skills,save){
 const cfg=new ConfigManager();cfg.setUnits(clone(inputs.units));cfg.setSkills(clone(skills));cfg.setBattle(clone(inputs.battle));cfg.setEquipment(clone(inputs.equipment));
 return new RunSession(cfg,inputs.run,inputs.waves,{...options,...(save?{save:clone(save)}:{})});
}
const oldSkills=clone(inputs.skills);
for(const skill of Object.values(oldSkills)){
 skill.description='旧的技能文字\n（标注来源：旧的基础数值）';delete skill.statRows;
}
const original=make(oldSkills),bot=new MinimalBaselineBot();
while(original.flow.wave.stage<2){bot.prepare(original.playerPort());original.startBattle().run();original.settleBattle();bot.claimRewards(original.playerPort());assert.equal(original.nextWave(),true);}
// A stage can now begin with a shop; finish its public encounter actions before saving a combat fixture.
if(original.flow.wave.encounterKind==='specialShop'){bot.claimRewards(original.playerPort());assert.equal(original.nextWave(),true);}
bot.prepare(original.playerPort());
const saved=original.snapshot(),legacySkills=Object.fromEntries(Object.keys(JSON.parse(saved.difficultyConfigIdentity).skills).map(id=>[id,oldSkills[id]]));
// Reconstruct the full presentation-bearing identity written by the previous release.
const difficulty=JSON.parse(saved.difficultyConfigIdentity);difficulty.skills=legacySkills;
saved.difficultyConfigIdentity=stableEnemyJson(difficulty);
const wrapper=JSON.parse(saved.formationConfigIdentity),formation=JSON.parse(wrapper.formation);formation.skills=legacySkills;
wrapper.formation=stableEnemyJson(formation);saved.formationConfigIdentity=stableEnemyJson(wrapper);
const baseline=make(oldSkills,saved),migrated=make(inputs.skills,saved);
assert.equal(migrated.snapshot().difficultyConfigIdentity,saved.difficultyConfigIdentity);
assert.equal(migrated.snapshot().formationConfigIdentity,saved.formationConfigIdentity,'old random identity is retained');
const baselineEvents=baseline.startBattle().run(),migratedEvents=migrated.startBattle().run();
assert.deepEqual(migrated.formation,baseline.formation,'presentation changes preserve every legacy enemy placement');
assert.deepEqual(migratedEvents,baselineEvents,'the same saved battle retains exact events');
assert.equal(migrated.battleSeed,baseline.battleSeed);

const textOnly=clone(inputs.skills);textOnly.black_flame.description='新的排版正文';textOnly.black_flame.statRows=[{label:'另一种标题',value:'{物理+:dmg}',stars:'165/396/1780'}];
const fresh=make(),freshText=make(textOnly);
assert.equal(fresh.save.difficultyConfigIdentity,freshText.save.difficultyConfigIdentity,'new runs ignore display copy');
assert.equal(fresh.save.formationConfigIdentity,freshText.save.formationConfigIdentity,'new formation seed ignores display copy');
for(const change of [s=>s.black_flame.starDamage[2]+=1,s=>s.black_flame.castSeconds+=.1,s=>s.black_flame.burn.maxHpFraction+=.01]){
 const altered=clone(inputs.skills);change(altered);
 assert.throws(()=>make(altered,saved),/Saved enemy difficulty configuration mismatch/,'real combat changes remain rejected');
 const bad=clone(saved),outer=JSON.parse(bad.formationConfigIdentity),inner=JSON.parse(outer.formation);inner.skills=Object.fromEntries(Object.keys(inner.skills).map(id=>[id,altered[id]]));outer.formation=stableEnemyJson(inner);bad.formationConfigIdentity=stableEnemyJson(outer);
 assert.throws(()=>make(inputs.skills,bad),/Saved formation configuration mismatch/,'formation validation also rejects real skill changes');
}
const malformed=clone(saved);malformed.formationConfigIdentity='invalid json';
assert.throws(()=>make(inputs.skills,malformed),/Saved formation configuration mismatch/);
assert.equal(combatConfigurationIdentity(difficulty),combatConfigurationIdentity({...difficulty,skills:JSON.parse(fresh.save.difficultyConfigIdentity).skills}));
console.log('PASS skill layout saves: legacy resume, exact formation/events/seed, new-run display independence, and strict combat/invalid-save rejection');
