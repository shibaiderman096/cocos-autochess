// Historical P0/P1/P2 experiments keep their measured inputs. Live content is tested separately.
const assert=require('node:assert/strict');
const {loadRunInputs}=require('../tools/run-simulation.ts');
const archivedInputs=require('../docs/p0-enemy-difficulty/baseline/input-configs.json'),current=loadRunInputs();
const archivedIds=new Set(archivedInputs.units.map(u=>u.id));
assert.deepEqual(current.units.filter(u=>archivedIds.has(u.id)),archivedInputs.units);
assert.deepEqual(current.units.filter(u=>!archivedIds.has(u.id)).map(u=>u.id),['iron_golem']);
assert.deepEqual(Object.fromEntries(Object.entries(current.skills).filter(([id])=>id in archivedInputs.skills)),archivedInputs.skills);
assert.deepEqual(Object.keys(current.skills).filter(id=>!(id in archivedInputs.skills)),['iron_uppercut']);
for(const key of ['battle','run','waves'])assert.deepEqual(current[key],archivedInputs[key]);
require('./advanced-equipment-compatibility.cjs');
module.exports={archivedInputs};
