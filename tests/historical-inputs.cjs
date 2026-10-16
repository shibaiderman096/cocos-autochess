// Historical P0/P1/P2 experiments keep their measured inputs. Live content is tested separately.
const assert=require('node:assert/strict');
const archivedInputs=require('../docs/p0-enemy-difficulty/baseline/input-configs.json');
require('./archive-evidence.cjs').assertArchivedEvidence(require('../docs/p1-enemy-difficulty/power-calibration/protected-before.json'));
assert.equal(archivedInputs.units.length,15,'the original experiment still has its original roster');
module.exports={archivedInputs};
