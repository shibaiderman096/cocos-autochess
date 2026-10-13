require('tsx/cjs');
const assert = require('node:assert/strict');
const { RoundFlow } = require('../assets/scripts/core/RoundFlow.ts');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { OwnedUnits } = require('../assets/scripts/core/OwnedUnits.ts');
const { buildRunWaves, normalizeStageCount, runRoundCount } = require('../assets/scripts/core/RunSetup.ts');
const units = require('../assets/resources/config/units.json');
const skills = require('../assets/resources/config/skills.json');
const rules = require('../assets/resources/config/battle.json');
const templates = require('../assets/resources/config/waves.json');
const runConfig = require('../assets/resources/config/run.json');
const waves = buildRunWaves(3,runConfig,templates);
const cfg = new ConfigManager(); cfg.setUnits(units); cfg.setSkills(skills); cfg.setBattle(rules);
cfg.setEnemyUnits(runConfig.monsters);
assert.equal(units.length, 10);
assert.deepEqual([1,2,3].map(cost => units.filter(u => u.cost === cost).length), [4,3,3]);
assert.equal(cfg.allUnits().length,10,'monsters must stay out of shop inventory');
assert.equal(waves.length,23); assert.deepEqual([1,2,3].map(s=>waves.filter(w=>w.stage===s).length),[3,10,10]);
assert.deepEqual([waves[0],waves[2],waves[3],waves[12],waves[13],waves[22]].map(w=>`${w.stage}-${w.round}`),['1-1','1-3','2-1','2-10','3-1','3-10']);
assert.equal(buildRunWaves(4,runConfig,templates).length,33);
assert.equal(runRoundCount(5,runConfig),43);
for(const v of [-9,0,2,NaN,Infinity,undefined]) assert.equal(normalizeStageCount(v),3);
assert.equal(normalizeStageCount(4.9),4);
assert.deepEqual(buildRunWaves(3,runConfig,templates),waves,'generation is deterministic');
assert.ok(waves[13].enemies[0].statMultiplier>waves[3].enemies[0].statMultiplier);
for (const wave of waves) {
  const cells = new Set();
  for (const e of wave.enemies) {
    assert.ok(cfg.getUnit(e.unitId)); assert.ok(e.x>=0 && e.x<rules.boardWidth && e.y>=rules.ownRows && e.y<rules.boardHeight);
    assert.ok(e.star>=1 && e.star<=3 && e.statMultiplier>0);
    assert.ok(!cells.has(`${e.x},${e.y}`)); cells.add(`${e.x},${e.y}`);
  }
}
for (const u of units) { assert.ok(u.artId); if (u.skillId) assert.ok(skills[u.skillId]); }
// Every starter encounter is winnable by the original one-star, one-cost piece alone.
for(const wave of waves.filter(w=>w.stage===1)) {
  const enemies=wave.enemies.map(e=>({cfg:cfg.getUnit(e.unitId),side:1,...e}));
  assert.ok(enemies.every(e=>e.cfg.hp<=60&&e.cfg.atk<=3));
  const sim=new BattleSim(cfg,[...enemies,{cfg:cfg.getUnit(runConfig.starterUnitId),side:0,star:1,x:3,y:3}],{seed:42,w:7,h:8,maxTicks:rules.maxTicks});
  sim.start();sim.run();assert.equal(sim.winner,0,`starter beats ${wave.stage}-${wave.round}`);
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
  const caster = {...cfg.getUnit('mage'), skillId:id, range:4, startMana:80};
  const target = {...cfg.getUnit('warrior'), hp:10000};
  const sim = new BattleSim(cfg,[{cfg:caster,side:0,x:3,y:3},
    {cfg:target,side:1,x:3,y:4},{cfg:target,side:1,x:3,y:5}],{seed:42,w:7,h:8});
  sim.units[2].hp=500;
  sim.start(); sim.step();
  const cast = sim.events.find(e=>e.t==='cast');
  assert.equal(cast.target,skill.targeting==='lowestHp'?3:2,id);
  const hits=sim.events.filter(e=>e.t==='hit' && e.id!==1);
  assert.equal(hits.length,skill.radius>0?2:1,id);
  assert.ok(hits.every(e=>e.dmgType===skill.dmgType),id);
}
// A ninth base card must cascade into a three-star unit, preserving nine cards.
const owned = new OwnedUnits();
for(let i=0;i<9;i++) owned.addToBench('warrior',9);
assert.equal(owned.all().length,1); assert.equal(owned.all()[0].star,3);
console.log('Wave validation, full real-battle run, HP failure, save resume, all skills, and cascading merges passed');
