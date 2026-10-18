require('tsx/cjs');
const assert = require('node:assert/strict');
const { RoundFlow } = require('../assets/scripts/core/RoundFlow.ts');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { OwnedUnits } = require('../assets/scripts/core/OwnedUnits.ts');
const { buildRunWaves, buildMonsterUnits, normalizeStageCount, runRoundCount } = require('../assets/scripts/core/RunSetup.ts');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const rules = require('../assets/resources/config/battle.json');
const templates = require('../assets/resources/config/waves.json');
const runConfig = require('../assets/resources/config/run.json');
const build = (count, config = runConfig) => buildRunWaves(count,config,templates,units);
const waves = build(3);
const cfg = new ConfigManager(); cfg.setUnits(units); cfg.setSkills(skills); cfg.setBattle(rules);
cfg.setEnemyUnits(buildMonsterUnits(runConfig,units));
assert.equal(units.length, 17);
assert.deepEqual([1,2,3,4,5].map(cost => units.filter(u => u.cost === cost).length), [4,5,3,3,2]);
assert.equal(cfg.allUnits().length,17,'monsters must stay out of shop inventory');
assert.equal(waves.length,14); assert.deepEqual([1,2,3].map(s=>waves.filter(w=>w.stage===s).length),[3,5,6]);
assert.deepEqual([waves[0],waves[2],waves[3],waves[7],waves[8],waves[13]].map(w=>`${w.stage}-${w.round}`),['1-1','1-3','2-1','2-5','3-1','3-6']);
assert.equal(build(4).length,21);
assert.equal(runRoundCount(5,runConfig),29);
const longWaves=build(99);
assert.deepEqual([1,2,3,4,5,6,7,8,99].map(s=>longWaves.filter(w=>w.stage===s).length),[3,5,6,7,8,9,10,10,10]);
assert.equal(runRoundCount(99,runConfig),longWaves.length);
const expandedRoster=[...units,{...units[0],id:'cost4',cost:4},{...units[0],id:'cost5',cost:5}];
const expandedWaves=buildRunWaves(10,runConfig,templates,expandedRoster);
assert.ok(expandedWaves.filter(w=>(w.stage===8||w.stage===9)&&w.encounterKind!=='monster').every(w=>w.enemies.every(e=>expandedRoster.find(u=>u.id===e.unitId).cost===5)), 'new implemented higher costs are selected without changing base stats');
for(const v of [-9,0,2,NaN,Infinity,undefined]) assert.equal(normalizeStageCount(v),3);
assert.equal(normalizeStageCount(4.9),4);
assert.deepEqual(build(3),waves,'generation is deterministic');
const unchangedTemplates=JSON.stringify({runConfig,templates});
for(const count of [4,6,99]) {
  assert.deepEqual(build(count).slice(0,waves.length),waves,'adding stages must keep all existing encounters identical');
}
for(const invalid of [NaN,Infinity,-1,0]) assert.throws(()=>build(3,{...runConfig,enemyProgression:{...runConfig.enemyProgression,populationEveryRounds:invalid}}),/Invalid run configuration/);
let completed=0;
for(const wave of longWaves.filter(w=>w.stage>=2)) {
  const strong=wave.encounterKind==='monster'&&wave.enemies.some(e=>cfg.getUnit(e.unitId).monsterTier==='strong');
  assert.equal(wave.enemies.length,wave.encounterKind==='specialShop'?0:strong?1:Math.min(10,1+Math.floor(completed/3)));
  completed++;
  if(wave.encounterKind==='monster'){
    const rules=runConfig.stageEncounters;
    assert.ok(wave.enemies.every(e=>e.star===1&&e.statMultiplier===(strong?1+(wave.stage-rules.strongMonster.startStage)*rules.strongMonster.statGrowth:1+(wave.stage-1)*rules.monsterStatGrowth)));continue;
  }
  const expectedCost=wave.stage<4?1:wave.stage<6?2:wave.stage<8?3:5;
  const expectedStar=wave.stage<6?1:wave.stage<10?2:3;
  for(const e of wave.enemies) {
    assert.equal(e.statMultiplier,1);assert.equal(cfg.getUnit(e.unitId).cost,expectedCost);assert.equal(e.star,expectedStar);
    assert.equal(e.damageAmp,Number((Math.max(0,wave.stage-9)*.05).toFixed(4)));
    assert.equal(e.damageReduction,Number(Math.min(.8,Math.max(0,wave.stage-9)*.05).toFixed(4)));
    const sim=new BattleSim(cfg,[{cfg:cfg.getUnit(e.unitId),side:0,star:e.star,x:3,y:3},
      {cfg:cfg.getUnit(e.unitId),side:1,...e}]);
    for(const key of ['hp','atk','armor','mr','atkSpeed','spellPower','critChance','lifesteal'])assert.equal(sim.units[0].cfg[key],sim.units[1].cfg[key],`shared ${key}`);
  }
  assert.equal(new Set(wave.enemies.map(e=>`${e.x},${e.y}`)).size,wave.enemies.length);
}
assert.equal(JSON.stringify({runConfig,templates}),unchangedTemplates,'wave generation leaves source configs untouched');
for (const wave of waves) {
  const cells = new Set();
  for (const e of wave.enemies) {
    assert.ok(cfg.getUnit(e.unitId)); assert.ok(e.x>=0 && e.x<rules.boardWidth && e.y>=rules.ownRows && e.y<rules.boardHeight);
    assert.ok(e.star>=1 && e.star<=3 && e.statMultiplier>0);
    assert.ok(!cells.has(`${e.x},${e.y}`)); cells.add(`${e.x},${e.y}`);
  }
}
for (const u of units) { assert.ok(u.artId); if (u.skillId) assert.ok(skills[u.skillId]); }
// Low-cost HP tuning requires a one-cost recruit after the first opening encounter.
for(const wave of waves.filter(w=>w.stage===1)) {
  const enemies=wave.enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:1,...e}));
  for(const e of enemies) assert.equal(e.cfg.atkSpeed,.75,'monster attack speed stays fixed');
  for(const e of enemies) for(const key of ['hp','atk','armor','mr']) {
    assert.equal(e.cfg[key],runConfig.monsterTemplate[key],`independent monster template ${key}`);
  }
  const allies=[{cfg:cfg.getUnit(runConfig.starterUnitId),side:0,star:1,x:3,y:3}];
  if(wave.round>1)allies.push({cfg:cfg.getUnit('archer'),side:0,star:1,x:2,y:2});
  const sim=new BattleSim(cfg,[...enemies,...allies],{seed:42,w:7,h:8,maxTicks:rules.maxTicks});
  sim.start();sim.run();assert.equal(sim.winner,0,`starter with affordable opening recruit beats ${wave.stage}-${wave.round}`);
  for(const enemy of sim.units.filter(u=>u.side===1)) {
    const hits=sim.events.filter(e=>e.t==='hit'&&e.id===enemy.id);
    assert.ok(hits.length>0,`${enemy.cfg.id} must take damage`);
    const basics=hits.filter(hit=>sim.events.some(e=>e.t==='attack'&&e.id===hit.source&&e.target===enemy.id&&e.tick===hit.tick));
    assert.ok(basics.every(hit=>hit.dmg<enemy.cfg.hp),'ordinary attacks cannot one-shot full-health monsters; caster skills may');
  }
}
const flow = new RoundFlow(waves, rules);
assert.equal(flow.nextWave(), false); assert.equal(flow.settle(1, 3), null);
assert.equal(flow.startBattle(), true); assert.equal(flow.startBattle(), false);
assert.equal(flow.settle(1, 3).healthLost, 6); assert.equal(flow.health, 14);
assert.equal(flow.settle(1, 3), null); assert.equal(flow.health, 14);
const restored = new RoundFlow(waves, rules, flow.snapshot());
assert.equal(restored.phase, 'settlement'); assert.equal(restored.health, 14);
assert.equal(restored.nextWave(), true); assert.equal(restored.wave.id, 2);
restored.startBattle();
const interrupted = new RoundFlow(waves, rules, restored.snapshot());
assert.equal(interrupted.phase, 'prepare'); assert.equal(interrupted.health, 14);
restored.settle(1, 20); assert.equal(restored.health, 0); assert.equal(restored.phase, 'ended');
assert.equal(restored.result, 'defeat'); assert.equal(restored.nextWave(), false);
restored.restart(); assert.equal(restored.health, 20); assert.equal(restored.waveIndex, 0);
// Verify the entire configured run with real battles and a fully upgraded formation.
const run = new RoundFlow(waves, rules);
for (let i = 0; i < waves.length; i++) {
  run.startBattle();
  const placements = run.wave.enemies.map(e => ({ cfg:cfg.getUnit(e.unitId), side:1, ...e }));
  units.forEach((u,j) => placements.push({ cfg:u, side:0, star:3, x:j%7, y:Math.floor(j/7)+2 }));
  const sim = new BattleSim(cfg, placements, {seed:42, w:7, h:8, maxTicks:rules.maxTicks}); sim.start(); sim.run();
  assert.equal(sim.winner, 0, `strong formation must beat wave ${i+1}`);
  run.settle(sim.winner, sim.units.filter(u => u.side===1 && u.alive).length);
  if(i<waves.length-1) { assert.equal(run.result,null); assert.equal(run.nextWave(), true); }
}
assert.equal(run.result, 'victory'); assert.equal(run.phase, 'ended'); assert.equal(run.health, 20);
// Exercise every configured skill through the shared pipeline, including low-HP targeting.
for (const [id, skill] of Object.entries(skills)) {
  const caster = {...cfg.getUnit('mage'), skillId:id, range:4, maxMana:100, startMana:100};
  const target = {...cfg.getUnit('warrior'), hp:10000, skillId:undefined, maxMana:0, startMana:0};
  const sim = new BattleSim(cfg,[{cfg:caster,side:0,x:3,y:3},
    {cfg:target,side:1,x:3,y:4},{cfg:target,side:1,x:3,y:5}],{seed:42,w:7,h:8});
  sim.units[2].hp=500;
  sim.units[0].hp=Math.round(sim.units[0].cfg.hp*.5);
  sim.start(); sim.step();
  const cast = sim.events.find(e=>e.t==='cast');
  assert.ok(cast,`${id} must start casting with full mana`);
  assert.equal(cast.target,['susanoo','healChannel','selfShield','healAlly'].includes(skill.effect)?1:skill.targeting==='lowestHp'?3:2,id);
  if (skill.effect === 'susanoo') continue;
  if (skill.effect === 'teleportEmpower' || cast.duration > 0) {
    assert.equal(sim.events.filter(e=>e.t==='hit' && e.id!==1).length,0,'empower cast does not deal immediate damage');
    continue; // Delayed attack effects are covered by enderman-tests.cjs.
  }
  const hits=sim.events.filter(e=>e.t==='hit' && e.id!==1);
  assert.equal(hits.length,skill.radius>0?2:1,id);
  assert.ok(hits.every(e=>e.dmgType===skill.dmgType),id);
}
// A ninth base card must cascade into a three-star unit, preserving nine cards.
const owned = new OwnedUnits();
for(let i=0;i<9;i++) owned.addToBench('warrior',9);
assert.equal(owned.all().length,1); assert.equal(owned.all()[0].star,3);
console.log('Shared stats, cost/star progression, special encounters, capped population and late bonuses, independent monsters, real battles, save resume and skills passed');
