require('tsx/cjs');
const assert=require('node:assert/strict');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
const {stableEnemyJson,combatConfigurationIdentity}=require('../assets/scripts/core/EnemyGenerationTypes.ts');
const {loadRunInputs,loadEnemyGenerationInputs,loadFormationInputs,loadEquipmentInputs}=require('../tools/run-simulation.ts');
const inputs=loadRunInputs(),clone=value=>JSON.parse(JSON.stringify(value));
const options={runSeed:1016,enemyGenerationMode:'budget-v1',...loadEnemyGenerationInputs(),...loadFormationInputs(),...loadEquipmentInputs()};
function make(skills=inputs.skills,save,battle=inputs.battle){
 const cfg=new ConfigManager();cfg.setUnits(clone(inputs.units));cfg.setSkills(clone(skills));cfg.setBattle(clone(battle));cfg.setEquipment(clone(inputs.equipment));
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

const textOnly=clone(inputs.skills);textOnly.blackstar_annihilation.description='新的排版正文';textOnly.blackstar_annihilation.statRows=[{label:'另一种标题',value:'{魔法+:dmg}',stars:'240/360/3000'}];
const fresh=make(),freshText=make(textOnly);
assert.equal(fresh.save.difficultyConfigIdentity,freshText.save.difficultyConfigIdentity,'new runs ignore display copy');
assert.equal(fresh.save.formationConfigIdentity,freshText.save.formationConfigIdentity,'new formation seed ignores display copy');
// Recreate a pre-edit save whose identities still contain the former sunlight description.
const traitSave=clone(fresh.snapshot()),oldDescription='日辉棋子获取太阳的力量。开战获得护盾，护盾被击碎时，以携带者为中心，对1格内所有敌人各造成携带者最大生命值10%的真实伤害。';
const oldBattle=clone(inputs.battle);oldBattle.traits.find(t=>t.id==='sunlight').description=oldDescription;
const oldDifficulty=JSON.parse(traitSave.difficultyConfigIdentity);oldDifficulty.battle=clone(oldBattle);traitSave.difficultyConfigIdentity=stableEnemyJson(oldDifficulty);
const oldTraitRun=make(inputs.skills,traitSave,oldBattle),newTraitRun=make(inputs.skills,traitSave);
assert.equal(newTraitRun.snapshot().formationConfigIdentity,traitSave.formationConfigIdentity,'trait description edits retain legacy RNG identity');
bot.prepare(oldTraitRun.playerPort());bot.prepare(newTraitRun.playerPort());
assert.deepEqual(newTraitRun.startBattle().run(),oldTraitRun.startBattle().run(),'trait description edits preserve saved combat');
const changedTrait=clone(inputs.battle);changedTrait.traits.find(t=>t.id==='sunlight').breakpoints[0].sunlight.shieldMaxHpFraction+=.01;
assert.throws(()=>make(inputs.skills,traitSave,changedTrait),/Saved enemy difficulty configuration mismatch/,'real trait mechanics still reject incompatible saves');
// Restoring an identity before 7-piece attribution changed must retain enemy RNG and placements.
const attributionSave=clone(saved),previousBattle=clone(inputs.battle);
for(const tier of previousBattle.traits.find(t=>t.id==='sunlight').breakpoints){
 if(!tier.sunlight.judgment)continue;delete tier.sunlight.judgment.statisticsStar;
 if(tier.count===7)delete tier.sunlight.judgment.independentStatistics;
}
const attributionDifficulty=JSON.parse(attributionSave.difficultyConfigIdentity);attributionDifficulty.battle=previousBattle;
attributionSave.difficultyConfigIdentity=stableEnemyJson(attributionDifficulty);
const previousRun=make(inputs.skills,attributionSave,previousBattle),attributionRun=make(inputs.skills,attributionSave);
const previousSim=previousRun.startBattle(),attributionSim=attributionRun.startBattle();previousSim.run();attributionSim.run();
const previousEvents=previousSim.events,attributionEvents=attributionSim.events;
assert.deepEqual(attributionRun.formation,previousRun.formation);assert.equal(attributionRun.battleSeed,previousRun.battleSeed);
assert.equal(attributionRun.snapshot().formationConfigIdentity,attributionSave.formationConfigIdentity);
const withoutAttribution=events=>events.map(({sunlightJudgmentSide,sunlightJudgmentStar,...event})=>event);
assert.deepEqual(withoutAttribution(attributionEvents),withoutAttribution(previousEvents),'only statistics metadata may differ');
for(const change of [j=>j.damage++,j=>j.intervalSeconds++,j=>j.stunSeconds++,j=>j.targetMaxHpFraction=.2]){
 const changed=clone(inputs.battle);change(changed.traits.find(t=>t.id==='sunlight').breakpoints[2].sunlight.judgment);
 assert.throws(()=>make(inputs.skills,attributionSave,changed),/configuration mismatch/,'judgment mechanics still reject incompatible saves');
}
// The former mark-free DOT/100% shield rules cannot silently resume under the revised judgment rules.
const legacySunlightSave=clone(fresh.snapshot()),legacySunlightBattle=clone(inputs.battle),legacySunlight=legacySunlightBattle.traits.find(t=>t.id==='sunlight');
for(const tier of legacySunlight.breakpoints){tier.sunlight.burstMaxHpFraction=.1;tier.sunlight.burstRadius=1;}
legacySunlight.breakpoints[2].sunlight.judgment.stunSeconds=1.5;
legacySunlight.breakpoints[3].sunlight={shieldMaxHpFraction:1,burstMaxHpFraction:.1,burstRadius:1,formation:{delaySeconds:0,frontReduction:.2,backAmp:.25},judgment:{intervalSeconds:1,damage:0,stunSeconds:1.5,continuous:{intervalSeconds:1,targetMaxHpFraction:.05}}};
const legacySunlightDifficulty=JSON.parse(legacySunlightSave.difficultyConfigIdentity);legacySunlightDifficulty.battle=legacySunlightBattle;legacySunlightSave.difficultyConfigIdentity=stableEnemyJson(legacySunlightDifficulty);
assert.throws(()=>make(inputs.skills,legacySunlightSave),/Saved enemy difficulty configuration mismatch/,'the changed sunlight mechanics reject old combat saves');
for(const change of [s=>s.blackstar_annihilation.starDamage[2]+=1,s=>s.blackstar_annihilation.shadow.repeatMultiplier+=.1,s=>s.blackstar_annihilation.shadow.collapseRadius+=1,s=>s.corona_transit.sunlight.finalDamage[2]+=1,
 s=>s.corona_transit.sunlight.counts=[5,7,20],s=>s.corona_transit.sunlight.recastDamageLoss=.1,s=>s.corona_transit.sunlight.recastDamageLossCap=.6]){
 const altered=clone(inputs.skills);change(altered);
 assert.throws(()=>make(altered,saved),/Saved enemy difficulty configuration mismatch/,'real combat changes remain rejected');
 const bad=clone(saved),outer=JSON.parse(bad.formationConfigIdentity),inner=JSON.parse(outer.formation);inner.skills=Object.fromEntries(Object.keys(inner.skills).map(id=>[id,altered[id]]));outer.formation=stableEnemyJson(inner);bad.formationConfigIdentity=stableEnemyJson(outer);
 assert.throws(()=>make(inputs.skills,bad),/Saved formation configuration mismatch/,'formation validation also rejects real skill changes');
}
const malformed=clone(saved);malformed.formationConfigIdentity='invalid json';
assert.throws(()=>make(inputs.skills,malformed),/Saved formation configuration mismatch/);
assert.equal(combatConfigurationIdentity(difficulty),combatConfigurationIdentity({...difficulty,skills:JSON.parse(fresh.save.difficultyConfigIdentity).skills}));
console.log('PASS skill layout saves: legacy resume, exact formation/events/seed, new-run display independence, and strict combat/invalid-save rejection');
