// Exact P3 integration surface. All other pre-P3 sources/configuration/evidence remain hash guarded.
require('./high-cost-pricing-compatibility.cjs').assertPricingCorrection();
const changedFiles=new Set([
 // Subsequent authorized price correction; source delta is checked exactly above.
 'assets/scripts/core/ShopConfig.ts','tests/shop-tests.ts','tests/fairness-tests.cjs',
 // P4 optional budget controls. Default output equality is guarded by p4-balance-tests;
 // P3 still compares all 968 baseline waves below, without replacing its evidence.
 'assets/scripts/core/EnemyBudget.ts',
 'assets/scripts/core/EnemyGenerationTypes.ts','assets/scripts/core/EnemyGenerator.ts','assets/scripts/core/RunSetup.ts',
 'assets/scripts/core/RunSession.ts','assets/scripts/core/RunSessionTypes.ts','assets/scripts/core/ShopSave.ts','assets/scripts/core/index.ts',
 'assets/scripts/ui/BattleUI.ts','assets/scripts/ui/MainMenu.ts','assets/scripts/view/BattleStage.ts',
 'tools/run-sim.ts','tools/run-simulation.ts','tools/bots/minimal-baseline.ts','tools/run-tests.ps1','package.json',
 'tests/run-session-tests.cjs','tests/enemy-power-tests.cjs','tests/power-calibration-tests.cjs','tests/enemy-budget-tests.cjs',
 'tests/enemy-formation-tests.cjs','tests/regression-tests.cjs','tests/ui-interaction-tests.cjs','tests/run-sim-cli-tests.cjs',
]);
const earlierContentChanges=new Set(['assets/resources/config/units.json','assets/resources/config/skills.json',
 'assets/scripts/core/RoundFlow.ts','assets/scripts/core/EnemyCandidates.ts','assets/scripts/view/ArtPaths.ts',
 'assets/scripts/view/BattleReplayer.ts','assets/scripts/view/UnitView.ts','tests/progression-tests.cjs']);
// These content-extension bytes are checked against the pre-P3 capture by p3-equipment-tests.
module.exports={changedFiles,laterChanges:new Set([...changedFiles,...earlierContentChanges])};
