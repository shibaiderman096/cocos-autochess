$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
node tools/check-resources.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
# Include Cocos-facing scripts when the editor has generated its declarations.
# The pure-logic compilation below remains available in a clean Node checkout.
if (Test-Path -LiteralPath 'temp/tsconfig.cocos.json') {
  npx tsc --noEmit -p tsconfig.json
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
$srcs = @(
  'tests/unit-tests.ts', 'tests/smoke.ts', 'tests/economy-tests.ts', 'tests/shop-tests.ts',
  'tools/run-sim.ts', 'tools/run-simulation.ts', 'tools/bots/minimal-baseline.ts',
  'tools/calibrate-enemy-power.ts',
  'tools/report-enemy-budget.ts',
  'tools/report-enemy-formation.ts',
  'tools/report-equipment.ts',
  'tools/balance-sim.ts',
  'tools/balance/tune-balance.ts', 'tools/balance/continue-training.ts',
  'tools/balance/replay-run.ts',
  'tools/balance/audit-bot-economy.ts',
  'assets/scripts/battle/HexMath.ts',
  'assets/scripts/battle/BattleSim.ts',
  'assets/scripts/battle/Unit.ts',
  'assets/scripts/battle/Grid.ts',
  'assets/scripts/battle/Pathfinding.ts',
  'assets/scripts/battle/types.ts',
  'assets/scripts/battle/index.ts',
  'assets/scripts/core/ConfigManager.ts',
  'assets/scripts/core/Rng.ts',
  'assets/scripts/core/EventBus.ts',
  'assets/scripts/core/TickDriver.ts',
  'assets/scripts/core/EconomySystem.ts',
  'assets/scripts/core/LevelSystem.ts',
  'assets/scripts/core/SaveData.ts',
  'assets/scripts/core/ShopConfig.ts',
  'assets/scripts/core/CardPool.ts',
  'assets/scripts/core/OwnedUnits.ts',
  'assets/scripts/core/ShopSystem.ts',
  'assets/scripts/core/ShopSave.ts',
  'assets/scripts/core/index.ts'
)
npx tsc --target ES2020 --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --strict false --outDir .test-build @srcs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -Recurse -Force assets\resources .test-build\assets\
$taskFailures = @()
$taskTests = @(
  '.test-build/tests/unit-tests.js'
  '.test-build/tests/economy-tests.js'
  '.test-build/tests/shop-tests.js'
  '.test-build/tests/smoke.js'
  'tests/regression-tests.cjs'
  'tests/float-text-tests.cjs'
  'tests/ui-interaction-tests.cjs'
  'tests/skill-attack-isolation-tests.cjs'
  'tests/stage-encounter-layout-tests.cjs'
  'tests/stage-reward-validation-tests.cjs'
  'tests/stage-progression-tests.cjs'
  'tests/role-mana-and-start-tests.cjs'
  'tests/monster-drop-rate-tests.cjs'
  'tests/fairness-tests.cjs'
  'tests/progression-tests.cjs'
  'tests/combat-attributes-tests.cjs'
  'tests/combat-statistics-tests.cjs'
  'tests/enderman-tests.cjs'
  'tests/black-flame-tests.cjs'
  'tests/heal-channel-tests.cjs'
  'tests/hybrid-spell-tests.cjs'
  'tests/stun-tests.cjs'
  'tests/iron-golem-tests.cjs'
  'tests/ender-dragon-tests.cjs'
  'tests/academy-naruto-tests.cjs'
  'tests/rasengan-tests.cjs'
  'tests/rasengan-vfx-tests.cjs'
  'tests/sage-naruto-tests.cjs'
  'tests/seven-roles-tests.cjs'
  'tests/skill-presentation-tests.cjs'
  'tests/skill-layout-save-tests.cjs'
  'tests/equipment-tests.cjs'
  'tests/totem-tests.cjs'
  'tests/skill-crit-equipment-tests.cjs'
  'tests/run-session-tests.cjs'
  'tests/run-sim-cli-tests.cjs'
  'tests/advanced-equipment-tests.cjs'
  'tests/enemy-power-tests.cjs'
  'tests/power-calibration-tests.cjs'
  'tests/enemy-budget-tests.cjs'
  'tests/enemy-formation-tests.cjs'
  'tests/p3-equipment-tests.cjs'
  'tests/formal-bot-tests.cjs'
  'tests/medium-economy-tests.cjs'
  'tests/qualification-cli-tests.cjs'
  'tests/balance-cli-tests.cjs'
  'tests/p4-balance-tests.cjs'
)
foreach ($taskTest in $taskTests) {
  Write-Host "`n--- $taskTest ---" -ForegroundColor Cyan
  node $taskTest
  if ($LASTEXITCODE -ne 0) { $taskFailures += $taskTest }
}
Write-Host "`nSuites: $($taskTests.Count - $taskFailures.Count) passed, $($taskFailures.Count) failed"
if ($taskFailures.Count) {
  $taskFailures | ForEach-Object { Write-Host "FAILED $_" -ForegroundColor Red }
  exit 1
}
exit 0
