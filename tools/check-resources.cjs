// Check registered runtime textures and configured unit consumers without the editor.
require('tsx/cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const art = require('../assets/scripts/view/ArtPaths.ts');
const {buildMonsterUnits, buildRunWaves} = require('../assets/scripts/core/RunSetup.ts');
const units = require('../assets/resources/config/units.json');
const run = require('../assets/resources/config/run.json');
const templates = require('../assets/resources/config/waves.json');
const skills = require('../assets/resources/config/skills.json');
const paths = new Set(Object.values(art).filter(v => v && typeof v === 'object').flatMap(Object.values));
for (const resource of paths) {
  assert.equal(typeof resource, 'string');
  const file = path.join(root, 'assets/resources', resource.replace(/\/spriteFrame(?:#.*)?$/, '.png'));
  assert.ok(fs.existsSync(file), `Missing registered texture: ${resource}`);
  const meta = JSON.parse(fs.readFileSync(`${file}.meta`, 'utf8'));
  assert.ok(Object.values(meta.subMetas ?? {}).some(v => v.importer === 'sprite-frame'), `Missing SpriteFrame: ${resource}`);
}
const monsters = buildMonsterUnits(run, units);
const playableIds = new Set(units.map(u => u.id));
const all = [...units, ...monsters];
assert.equal(new Set(all.map(u => u.id)).size, all.length, 'Unit and monster IDs must be unique');
for (const unit of all) {
  assert.ok(art.UNIT_ART[unit.artId ?? unit.id], `Missing unit art mapping: ${unit.id}`);
  if (unit.skillId) assert.ok(skills[unit.skillId], `Missing skill: ${unit.id}/${unit.skillId}`);
}
const waves = buildRunWaves(5, run, templates, units);
for (const wave of waves) for (const enemy of wave.enemies) assert.ok(all.some(u => u.id === enemy.unitId), `Unknown wave unit: ${enemy.unitId}`);
const reused = {red_guard: 'warrior_enemy', red_archer: 'archer_enemy', red_mage: 'mage_enemy'};
for (const [id, source] of Object.entries(reused)) {
  assert.ok(!playableIds.has(id), 'Monsters must not enter the shop roster');
  assert.equal(art.UNIT_ART[id], `art/units/${source}/spriteFrame`);
  const monster = monsters.find(u => u.id === id);
  assert.ok(monster, `Unused monster art: ${source}`);
  assert.deepEqual([monster.hp, monster.atk, monster.armor, monster.mr, monster.maxMana], [175, 30, 10, 10, 0]);
  assert.ok(waves.find(w => w.stage === 1 && w.round === 3).enemies.some(e => e.unitId === id), `Intro encounter must use ${id}`);
}
console.log(`PASS resources: ${paths.size} registered textures and SpriteFrames, ${units.length} playable units, ${monsters.length} monsters, wave/skill references and 3 reused monster assets`);
