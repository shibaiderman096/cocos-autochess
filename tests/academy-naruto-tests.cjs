require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const cfg = new ConfigManager();
cfg.setUnits(require('../assets/resources/config/units.json'));
cfg.setSkills(require('../assets/resources/config/skills.json'));
const card = cfg.getUnit('scout');
assert.deepEqual([card.name, card.cost, card.role, card.atkSpeed, card.range, card.startMana, card.maxMana, card.manaPerHit],
  ['学员鸣人', 1, 'tank', .6, 1, 20, 60, 10]);
const { resolveEnemyRole } = require('../assets/scripts/core/EnemyRoles.ts');
const skills = require('../assets/resources/config/skills.json');
assert.equal(resolveEnemyRole(card, skills, require('../assets/resources/config/enemy-roles.json')).role, 'tank');
assert.equal(resolveEnemyRole(card, skills, { units: {} }).role, 'tank');
function make(star = 1, spellPower = 0, reverse = false) {
  const placements = [
    { cfg: { ...card, spellPower, critChance: 0 }, star, side: 0, x: 2, y: 2 },
    { cfg: { ...cfg.getUnit('warrior'), hp: 100000, critChance: 0 }, side: 1, x: 3, y: 2 },
  ];
  const sim = new BattleSim(cfg, reverse ? placements.reverse() : placements);
  const src = sim.units.find(u => u.side === 0), dst = sim.units.find(u => u.side === 1);
  dst.atkCd = 10000; dst.moveCd = 10000;
  return { sim, src, dst };
}
for (const star of [1, 2, 3]) for (const power of [0, 50, 100]) for (const reverse of [false, true]) {
  const { sim, src, dst } = make(star, power, reverse);
  src.mana=src.cfg.maxMana;
  sim.step();
  assert.equal(src.mana, 0);
  assert.equal(sim.events.find(e => e.t === 'cast').target, src.id);
  assert.equal(sim.events.find(e => e.t === 'cast').duration, .5);
  for (let i = 0; i < 9; i++) sim.step();
  assert.equal(src.shield, 0, 'shield is absent before the full 0.5s delay');
  dst.atkCd = 0;
  const hp = src.hp;
  sim.step();
  const expected = Math.round([70, 80, 100][star - 1] * (1 + power / 100));
  assert.equal(sim.events.find(e => e.t === 'shield').amount, expected);
  assert.equal(sim.events.find(e => e.t === 'shield').tick, 11);
  const damage = Math.round(dst.cfg.atk * 100 / (100 + src.cfg.armor));
  assert.equal(src.shield, Math.max(0, expected - damage), 'completion-tick damage consumes the shield in either unit order');
  assert.equal(src.hp, hp - Math.max(0, damage - expected));
  dst.atkCd = 10000;
  src.mana=src.cfg.maxMana; src.atkCd = 0;
  for (let i = 0; i < 11; i++) sim.step();
  assert.equal(src.shield, Math.max(0, expected - damage) + expected, 'recast adds another shield');
  assert.equal(src.snapshot().shield, src.shield, 'runtime snapshot exposes shield to the existing health bar');
}
const natural = make();
while (!natural.sim.events.some(e => e.t === 'cast') && natural.sim.tick < 250) natural.sim.step();
assert.equal(natural.sim.events.filter(e => e.t === 'attack' && e.id === natural.src.id).length, 4);
assert.ok(natural.src.pendingCast, 'normal attacks earn enough mana to cast');
const dead = make(); dead.src.mana=dead.src.cfg.maxMana; dead.sim.step(); dead.src.alive = false; dead.src.hp = 0;
dead.sim.step(); assert.equal(dead.src.shield, 0, 'death prevents a pending shield');
assert.deepEqual(make().sim.run(), make().sim.run(), 'same seed remains deterministic');
console.log('PASS academy Naruto: config, all-star spell scaling, exact delay, same-tick absorption, recast, snapshots, mana, death and determinism');
