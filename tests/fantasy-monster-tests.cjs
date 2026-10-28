require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {ConfigManager} = require('../assets/scripts/core/ConfigManager.ts');
const {buildMonsterUnits, buildRunWaves} = require('../assets/scripts/core/RunSetup.ts');
const {BattleSim} = require('../assets/scripts/battle/BattleSim.ts');
const {CardPool} = require('../assets/scripts/core/CardPool.ts');
const {UNIT_ART} = require('../assets/scripts/view/ArtPaths.ts');
const run = require('../assets/resources/config/run.json');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const templates = require('../assets/resources/config/waves.json');
const manifest = require('../art-source/fantasy-monsters/manifest.json');
const monsters = buildMonsterUnits(run, units);
const cfg = new ConfigManager(); cfg.setUnits(units); cfg.setSkills(skills); cfg.setEnemyUnits(monsters);
const retired = ['zombie','skeleton_archer','silverfish','red_eye_spider','red_guard','red_archer','red_mage','ender_dragon'];
assert.equal(monsters.length, 30);
assert.equal(new Set(monsters.map(m=>m.id)).size, 30);
assert.deepEqual(new Set(monsters.map(m=>m.id)), new Set(manifest.map(m=>m.id)));
for (const family of new Set(manifest.map(m=>m.family))) {
  const entries = manifest.filter(m=>m.family===family);
  assert.equal(entries.length, 6);
  assert.equal(entries.filter(m=>m.tier==='strong').length, 1);
}
const pool = new CardPool(cfg.allUnits());
for (const m of monsters) {
  assert.equal(cfg.allUnits().some(u=>u.id===m.id), false);
  assert.equal(pool.count(m.id), 0);
  assert.equal(UNIT_ART[m.artId], `art/units/monsters/${m.id}/spriteFrame`);
  const data = fs.readFileSync(path.join(__dirname, '../assets/resources/art/units/monsters',m.id+'.png'));
  assert.equal(data.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(data[25], 6, 'sprite must retain RGBA transparency');
  if (m.monsterTier !== 'strong') {
    assert.deepEqual([m.hp,m.atk,m.armor,m.mr,m.atkSpeed,m.maxMana,m.startMana,m.manaPerHit,m.critChance], [175,30,10,10,.75,0,0,0,.25]);
    assert.equal(m.skillId, undefined);
  } else {
    assert.deepEqual([m.hp,m.atk,m.armor,m.mr,m.atkSpeed,m.range,m.moveTicks,m.maxMana,m.startMana,m.manaPerHit], [4500,90,60,60,.65,3,8,100,40,10]);
    assert.equal(m.skillId,'monster_blast');
  }
}
for (const id of retired) {
  assert.ok(!monsters.some(m=>m.id===id)); assert.equal(UNIT_ART[id], undefined);
  assert.ok(!fs.existsSync(path.join(__dirname,'../assets/resources/art/units/monsters',id+'.png')));
}
assert.equal(skills.dragon_breath, undefined);
console.log('PASS fantasy roster: five families of six, 25 normal/5 strong, original combat attributes, transparent unique resources and enemy-only pool');

const strongIds = run.stageEncounters.strongMonster.unitIds;
const seen = new Set();
for (let seed=1;seed<=40;seed++) {
  const options={mode:'budget-v1',runSeed:seed};
  const waves=buildRunWaves(10,run,templates,units,options);
  assert.deepEqual(waves,buildRunWaves(10,run,templates,units,options),'same seed and roster reproduce layouts');
  const short=buildRunWaves(4,run,templates,units,options);
  assert.deepEqual(short,waves.slice(0,short.length),'campaign length does not change earlier encounters');
  const encounters=waves.filter(w=>w.enemies.some(e=>strongIds.includes(e.unitId)));
  assert.deepEqual(encounters.map(w=>w.stage),[4,7,10]);
  for (const wave of encounters) {
    const guards=run.stageEncounters.strongMonster.escorts;
    assert.equal(wave.encounterKind,'monster');assert.equal(wave.enemies.length,1+Math.min(guards.maxCount,guards.initialCount+(wave.stage-4)/3*guards.countPerEncounter));
    const e=wave.enemies[0]; assert.equal(e.star,1);
    assert.equal(e.statMultiplier,1+(wave.stage-4)*.25);
    assert.equal(wave.name,cfg.getUnit(e.unitId).name+'巢穴');
  }
  for (const wave of waves) for (const e of wave.enemies) {
    assert.ok(!retired.includes(e.unitId)); if (monsters.some(m=>m.id===e.unitId)) seen.add(e.unitId);
  }
}
assert.deepEqual(seen,new Set(monsters.map(m=>m.id)),'all 30 monsters are reachable in actual generated stages');
const rules=run.stageEncounters.strongMonster;
for (const patch of [{everyStages:0},{unitIds:[]},{unitIds:['missing']},{unitIds:[strongIds[0],strongIds[0]]},{unitIds:[monsters[0].id]}])
  assert.throws(()=>buildRunWaves(4,{...run,stageEncounters:{...run.stageEncounters,strongMonster:{...rules,...patch}}},templates,units),/Invalid strong/);
console.log('PASS encounters: all 30 reachable across 40 seeds; stage 4/7/10, count, growth, campaign prefix and deterministic spawn rules retained');

const dummy={...units[0],hp:10000,armor:0,mr:100,atk:0,critChance:0};
for (const id of strongIds) {
  const boss=cfg.getUnit(id);
  const area=new BattleSim(cfg,[{cfg:boss,side:1,x:3,y:4},{cfg:dummy,side:0,x:3,y:3},{cfg:dummy,side:0,x:4,y:3},{cfg:dummy,side:0,x:0,y:0}]);
  area.units[0].mana=100;for(const u of area.units.slice(1)){u.atkCd=10000;u.moveCd=10000;}
  for(let i=0;i<13;i++)area.step();
  const hits=area.events.filter(e=>e.t==='hit');assert.equal(hits.length,2);
  assert.ok(hits.every(e=>e.dmg===160&&e.dmgType==='magic'&&e.tick===13));
  function battle(ids,star,seed){return new BattleSim(cfg,[...ids.map((uid,i)=>({cfg:cfg.getUnit(uid),side:0,star,x:i+1,y:2})),{cfg:boss,side:1,x:3,y:6}],{seed}).run();}
  for(let seed=1;seed<=10;seed++){
    assert.equal(battle(['helion'],1,seed).winner,1,'strong monster defeats lone starter');
    assert.equal(battle(['helion','ghostflame_blade','saiph','celine'],2,seed).winner,0,'developed team defeats strong monster');
  }
}
console.log('PASS combat: all five strong monsters retain AoE timing/targets/320 base damage, mitigation and 100 strength simulations');
