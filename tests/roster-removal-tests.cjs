require('tsx/cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {ConfigManager}=require('../assets/scripts/core/ConfigManager.ts');
const {RunSession}=require('../assets/scripts/core/RunSession.ts');
const {MinimalBaselineBot}=require('../tools/bots/minimal-baseline.ts');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const {buildMonsterUnits,buildRunWaves}=require('../assets/scripts/core/RunSetup.ts');
const {UNIT_ART,UNIT_PORTRAIT,FX_SPRITE}=require('../assets/scripts/view/ArtPaths.ts');
const inputs=loadRunInputs(),root=path.resolve(__dirname,'..');
const retired=['scout','warrior','champion','young_sasuke','sasuke','sakura','itachi','madara','archer','guardian','duelist','ranger','shaman','mage','sorcerer','iron_golem','enderman'];
const retained=new Set(inputs.units.map(u=>u.id));
assert.equal(retained.size,20);
assert.deepEqual(inputs.battle.traits.filter(t=>!t.selector).map(t=>t.id).sort(),['shadow','sunlight']);
for(const id of retired){assert.ok(!retained.has(id));assert.ok(!UNIT_ART[id]);assert.ok(!UNIT_PORTRAIT[id]);}
for(const t of inputs.battle.traits)for(const id of t.members)assert.ok(retained.has(id));
for(const cost of [1,2,3,4,5])assert.equal(inputs.units.filter(u=>u.cost===cost).length,4);
const monsters=buildMonsterUnits(inputs.run,inputs.units),all=new Set([...retained,...monsters.map(u=>u.id)]);
assert.equal(monsters.length,8);
const consumed=new Set([...inputs.units,...monsters].map(u=>u.skillId).filter(Boolean));
assert.deepEqual(Object.keys(inputs.skills).sort(),[...consumed].sort(),'only retained playable/monster skills are shipped');
for(const wave of [...inputs.waves,...buildRunWaves(99,inputs.run,inputs.waves,inputs.units)])
 for(const enemy of wave.enemies)assert.ok(all.has(enemy.unitId),`Unknown enemy ${enemy.unitId}`);
for(const name of ['enemy-roles','enemy-power'])for(const id of Object.keys(require(`../assets/resources/config/${name}.json`).units))assert.ok(retained.has(id));
for(const file of ['madara_blue','enderman','iron_golem','young_sasuke','sakura','itachi','sasuke-cutout','archer_ally','warrior_ally','mage_ally'])
 for(const ext of ['.png','.png.meta'])assert.ok(!fs.existsSync(path.join(root,'assets/resources/art/units',file+ext)));
for(const file of ['susanoo_blue','susanoo_slash','young_sasuke_ninja_bolt','rasengan_small','rasengan_large','sage_clone_rasengan','itachi_vortex','itachi_raven','sasuke_black_flame'])
 for(const ext of ['.png','.png.meta'])assert.ok(!fs.existsSync(path.join(root,'assets/resources/art/fx',file+ext)));
for(const folder of ['assets/resources/art/units/placeholders','assets/resources/art/units/professions','art-source/characters','art-source/unit-placeholders','art-source/unit-professions'])assert.ok(!fs.existsSync(path.join(root,folder)));
assert.ok(!Object.keys(FX_SPRITE).some(key=>/susanoo|rasengan|itachi|ninjaBolt|blackFlame/i.test(key)));
function session(seed,save){const cfg=new ConfigManager();cfg.setUnits(inputs.units);cfg.setSkills(inputs.skills);cfg.setBattle(inputs.battle);cfg.setEquipment(inputs.equipment);return new RunSession(cfg,inputs.run,inputs.waves,{runSeed:seed,stageCount:3,enemyGenerationMode:'legacy',...(save?{save}:{})});}
for(const seed of [19,1019,20261019]){
 const run=session(seed),bot=new MinimalBaselineBot();
 assert.ok(run.owned.all().every(u=>retained.has(u.unitId)));
 for(let n=0;n<8&&!run.save.runOver;n++){
  bot.claimRewards(run.playerPort());
  if(run.flow.wave.encounterKind==='specialShop'){if(!run.nextWave())break;continue;}
  bot.prepare(run.playerPort());
  assert.ok(run.owned.all().every(u=>retained.has(u.unitId)));
  assert.ok(run.shop.slots.every(s=>!s.unitId||retained.has(s.unitId)));
  const saved=run.snapshot(),restored=session(seed,saved);
  assert.deepEqual(restored.snapshot(),saved,'current roster save restores exactly');
  if(run.flow.phase!=='prepare')break;
  const firstBattle=run.startBattle(),repeatBattle=restored.startBattle();
  assert.ok(firstBattle&&repeatBattle,'both saved sessions can start combat');
  const first=firstBattle.run(),repeat=repeatBattle.run();
  assert.deepEqual(first,repeat,'save/replay events stay deterministic');
  run.settleBattle();bot.claimRewards(run.playerPort());
  if(!run.nextWave())break;
 }
 const corrupted=session(seed).snapshot();corrupted.owned[0].unitId='enderman';
 const sanitized=session(seed,corrupted);
 assert.ok(sanitized.owned.all().every(u=>retained.has(u.unitId)),'legacy save sanitization excludes removed units');
}
console.log('PASS roster removal: 20 retained units, both factions, all costs, 99-stage enemies, monster/skill references, exclusive images/metas/source removal, shop, rewards, save sanitization and deterministic combat restore');
