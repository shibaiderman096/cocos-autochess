require('tsx/cjs');
const assert = require('node:assert/strict');
const { ConfigManager } = require('../assets/scripts/core/ConfigManager.ts');
const { BattleSim } = require('../assets/scripts/battle/BattleSim.ts');
const { buildSkillStatRows } = require('../assets/scripts/ui/SkillPresentation.ts');
const cfg = new ConfigManager();
cfg.setUnits(require('../assets/resources/config/units.json'));
cfg.setSkills(require('../assets/resources/config/skills.json'));
cfg.setBattle(require('../assets/resources/config/battle.json'));

function firstHit(id, star, changes = {}) {
  const source = { ...cfg.getUnit(id), critChance: 0, ...changes };
  const target = { ...cfg.getUnit('warrior'), id: 'dummy', hp: 1000000, armor: 0, mr: 0, atk: 0,
    critChance: 0, skillId: undefined, maxMana: 0, startMana: 0 };
  const sim = new BattleSim(cfg, [{ cfg: source, star, side: 0, x: 3, y: 3 }, { cfg: target, side: 1, x: 3, y: 4 }], { seed: 9 });
  if (source.skillId) sim.units[0].mana = sim.units[0].cfg.maxMana;
  for (let i = 0; i < 80; i++) {
    sim.step();
    const hit = sim.events.find(event => event.t === 'hit' && event.source === 1 && event.id === 2);
    if (hit) return { hit, unit: sim.units[0] };
  }
  throw new Error(`${id}: no hit`);
}

const damagingUnits = cfg.allUnits().filter(unit => unit.skillId && !['selfShield', 'healChannel', 'healAlly'].includes(cfg.getSkill(unit.skillId).effect));
for (const { id } of damagingUnits) for (const star of [1, 2, 3]) {
  const low = firstHit(id, star, { atk: 40 });
  const high = firstHit(id, star, { atk: 800 });
  assert.equal(high.hit.dmg, low.hit.dmg, `${id} ${star}*: attack must not enter configured skill damage`);
  const skill = cfg.getSkill(cfg.getUnit(id).skillId);
  const rows = buildSkillStatRows(cfg, high.unit.cfg, star, high.unit.skillScale);
  assert.equal(Number(rows[0].current), high.hit.dmg, `${id}: panel matches actual unmitigated hit`);
  if (skill.starDamage) assert.equal(low.hit.dmg, skill.starDamage[star - 1]);
}
assert.equal(firstHit('warrior', 1, { skillId: undefined, atk: 100, physicalPower: 20 }).hit.dmg, 120);
assert.equal(firstHit('warrior', 1, { skillId: undefined, atk: 200, physicalPower: 20 }).hit.dmg, 240);
for (const id of ['sasuke', 'iron_golem', 'enderman']) {
  assert.equal(firstHit(id, 1, { physicalPower: 100 }).hit.dmg, firstHit(id, 1).hit.dmg * 2);
  assert.equal(firstHit(id, 1, { spellPower: 100 }).hit.dmg, firstHit(id, 1).hit.dmg);
}
assert.equal(firstHit('itachi', 1, { spellPower: 100 }).hit.dmg, firstHit('itachi', 1).hit.dmg * 2);
assert.equal(firstHit('iron_golem', 1, { armor: 900 }).hit.dmg, firstHit('iron_golem', 1).hit.dmg);
const hybrid = cfg.getSkill('hybrid_bolt').hybrid;
assert.equal(firstHit('young_sasuke', 1, { physicalPower: 100 }).hit.dmg, hybrid.physicalDamage[0] * 2 + hybrid.magicDamage[0]);
assert.equal(firstHit('young_sasuke', 1, { spellPower: 100 }).hit.dmg, hybrid.physicalDamage[0] + hybrid.magicDamage[0] * 2);
console.log(`PASS skill damage isolation: ${damagingUnits.length} units x 3 stars, attack/armor independence, ordinary attacks, matching bonuses and real panel/combat agreement`);
