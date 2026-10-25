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
  const target = { ...cfg.getUnit('helion'), id: 'dummy', hp: 1000000, armor: 0, mr: 0, atk: 0,
    critChance: 0, skillId: undefined, maxMana: 0, startMana: 0 };
  const aid=source.skillId&&cfg.getSkill(source.skillId).effect==='bloodAid';
  const reign=source.skillId&&cfg.getSkill(source.skillId).effect==='bloodReign';
  const sim = new BattleSim(cfg, [{ cfg: source, star, side: 0, x: 3, y: 3 }, { cfg: target, side: 1, x: 3, y: 4 },
    ...(aid?[{cfg:target,side:0,x:3,y:2}]:[])], { seed: 9 });
  if(aid){sim.units[2].hp=10;sim.units[2].atkCd=sim.units[2].moveCd=100000;}
  if (source.skillId) sim.units[0].mana = sim.units[0].cfg.maxMana;
  for (let i = 0; i < 240; i++) {
    sim.step();
    const hits=sim.events.filter(event => event.t === 'hit' && event.source === 1 && event.id === 2 && (!aid||event.dmgType==='magic'));
    const hit=reign?hits[1]:hits[0]; // The first physical hit is still the ordinary basic.
    if (hit) return { hit, unit: sim.units[0] };
  }
  throw new Error(`${id}: no hit`);
}

const damagingUnits = cfg.allUnits().filter(unit => {const skill=cfg.getSkill(unit.skillId);return !['hydraulicBulwark','lowestHealthHeal','spiderLeap','furnaceDash','stellarBulwark'].includes(skill.effect) && !['bulwark','domain','bastion','prayer','empower'].includes(skill.shadow?.kind??skill.sunlight?.kind);});
for (const { id } of damagingUnits) for (const star of [1, 2, 3]) {
  const low = firstHit(id, star, { atk: 40 });
  const high = firstHit(id, star, { atk: 800 });
  assert.equal(high.hit.dmg, low.hit.dmg, `${id} ${star}*: attack must not enter configured skill damage`);
  const skill = cfg.getSkill(cfg.getUnit(id).skillId);
  const rows = buildSkillStatRows(cfg, high.unit.cfg, star, high.unit.skillScale);
  assert.ok(rows.some(row=>row.tone===high.hit.dmgType&&Number(row.current)===high.hit.dmg), `${id}: panel matches actual unmitigated hit`);
  if (skill.starDamage) assert.equal(low.hit.dmg, Math.round(skill.starDamage[star - 1]
    + (skill.shadow?.kind==='soulLamp' ? low.unit.cfg.hp*skill.shadow.maxHpFractions[star-1] : 0)));
}
assert.equal(firstHit('ghostflame_blade',1,{skillId:undefined,atk:100,physicalPower:20}).hit.dmg,120);
assert.equal(firstHit('ghostflame_blade',1,{skillId:undefined,atk:200,physicalPower:20}).hit.dmg,240);
for(const id of ['blackfeather_hunter','kaeru','ghostflame_blade']){
 assert.equal(firstHit(id,1,{physicalPower:100}).hit.dmg,firstHit(id,1).hit.dmg*2);
 assert.equal(firstHit(id,1,{spellPower:100}).hit.dmg,firstHit(id,1).hit.dmg);
}
assert.equal(firstHit('nether_lantern_witch',1,{spellPower:100}).hit.dmg,firstHit('nether_lantern_witch',1).hit.dmg*2);
assert.equal(firstHit('ghostflame_blade',1,{armor:900}).hit.dmg,firstHit('ghostflame_blade',1).hit.dmg);
console.log(`PASS skill damage isolation: ${damagingUnits.length} units x 3 stars, attack/armor independence, ordinary attacks, matching bonuses and real panel/combat agreement`);
