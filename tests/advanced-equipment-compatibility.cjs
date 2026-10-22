// Explicit content-extension boundary: archived P0/P1/P2 evidence remains read-only.
// These source files intentionally change to implement the six requested items;
// their behavior is covered by advanced-equipment-tests and the existing combat suite.
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const archived=require(path.join(root,'docs/p0-enemy-difficulty/baseline/input-configs.json'));
const current=require(path.join(root,'assets/resources/config/equipment.json'));
const legacyEquipment=current.filter(item=>archived.equipment.some(old=>old.id===item.id));
const renamed={guinsoo:'炽轮战刃',totem_of_undying:'余烬命核',jeweled_gauntlet:'星棱法印',infinity_edge:'裂星锋刃'};
for(const item of legacyEquipment)assert.equal(item.name,renamed[item.id],'explicit authored display rename');
const mechanics=items=>items.map(({name,effectDescription,...item})=>item);
assert.deepEqual(mechanics(legacyEquipment),mechanics(archived.equipment),'all four audited item mechanics remain unchanged; effectDescription is presentation only');
const added=current.filter(item=>!archived.equipment.some(old=>old.id===item.id));
assert.deepEqual(added.map(item=>item.id).sort(),['abyssal_plate','arcane_sovereignty','arcane_veil','crimson_bloodclaw','divine_judgment','forest_sanctuary']);
module.exports={legacyEquipment,archivedInputs:archived,featureChanges:new Set([
  'README.md','assets/resources/config/equipment.json','assets/scripts/battle/types.ts',
  'assets/scripts/battle/Unit.ts','assets/scripts/battle/BattleSim.ts','assets/scripts/core/ConfigManager.ts',
  'assets/scripts/view/BattleStage.ts','tests/equipment-tests.cjs','tests/ui-interaction-tests.cjs',
  'tests/regression-tests.cjs','tests/run-session-tests.cjs','tests/enemy-power-tests.cjs',
  'tests/enemy-budget-tests.cjs','tests/enemy-formation-tests.cjs','tests/power-calibration-tests.cjs',
])};
