require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { dist } = require('../assets/scripts/battle/Pathfinding.ts');
const { resolveEnemyRole } = require('../assets/scripts/core/EnemyRoles.ts');
const cfg = new ConfigManager();
cfg.setUnits(require('../assets/resources/config/units.json'));
cfg.setSkills(require('../assets/resources/config/skills.json'));
const card = cfg.getUnit('warrior');
assert.deepEqual([card.name, card.cost, card.role, card.range, card.startMana, card.maxMana, card.manaPerHit],
  ['漩涡鸣人', 1, 'caster', 4, 20, 100, 10]);
assert.equal(resolveEnemyRole(card, {}, require('../assets/resources/config/enemy-roles.json')).role, 'mage');
function make(star = 1, physicalPower = 0, armor = 0) {
  const enemy = { ...cfg.getUnit('guardian'), hp: 100000, armor, maxMana: 0, atk: 0, critChance: 0 };
  const sim = new BattleSim(cfg, [
    { cfg: { ...card, physicalPower, spellPower: 999, critChance: 0 }, star, side: 0, x: 0, y: 3 },
    { cfg: enemy, side: 1, x: 3, y: 3 },
    { cfg: enemy, side: 1, x: 4, y: 3 },
    { cfg: enemy, side: 1, x: 5, y: 3 },
    { cfg: enemy, side: 1, x: 6, y: 3 },
    { cfg: enemy, side: 0, x: 3, y: 4 },
  ]);
  const src = sim.units[0];
  for (const u of sim.units.slice(1)) { u.atkCd = 10000; u.moveCd = 10000; }
  return { sim, src };
}
for (const star of [1, 2, 3]) for (const power of [0, 50]) for (const armor of [0, 100]) {
  const { sim, src } = make(star, power, armor);
  assert.equal(dist(sim.units[1].pos, sim.units[3].pos), 2);
  assert.equal(dist(sim.units[1].pos, sim.units[4].pos), 3);
  src.mana=src.cfg.maxMana; sim.step();
  assert.equal(src.mana, 0);
  assert.equal(sim.events.find(e => e.t === 'cast').duration, .1);
  sim.step(); assert.equal(sim.events.filter(e => e.t === 'hit').length, 0);
  sim.step();
  const hits = sim.events.filter(e => e.t === 'hit');
  assert.deepEqual(hits.map(e => e.id), [2, 3, 4], 'only enemies up to exactly two hexes from target');
  for (const hit of hits) {
    assert.equal(hit.dmgType, 'physical');
    assert.equal(hit.dmg, Math.round([240, 360, 600][star - 1] / 3 * (1 + power / 100) * 100 / (100 + armor)));
  }
  assert.equal(sim.events.find(e => e.t === 'skill_impact').tick, 3);
}
const moved = make(); moved.src.mana=moved.src.cfg.maxMana; moved.sim.step();
moved.sim.units[3].x = 6; moved.sim.units[3].y = 7;
moved.sim.step(); moved.sim.step();
assert.deepEqual(moved.sim.events.filter(e => e.t === 'hit').map(e => e.dmg), [120, 120], 'share recalculated at impact');
const gone = make(); gone.src.mana=gone.src.cfg.maxMana; gone.sim.step(); gone.sim.units[1].alive = false;
gone.sim.step(); gone.sim.step();
assert.equal(gone.sim.events.filter(e => e.t === 'hit').length, 0, 'dead primary target cancels impact');
const natural = make();
while (!natural.src.pendingCast && natural.sim.tick < 300) natural.sim.step();
assert.equal(natural.sim.events.filter(e => e.t === 'attack' && e.id === natural.src.id).length, 8);
assert.ok(natural.src.pendingCast);
assert.deepEqual(make().sim.run(), make().sim.run());
console.log('PASS Rasengan: all-star split physical damage, power/armor, exact 0.1s delay, radius boundary, allies, impact roster, dead target, mana and determinism');
