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
  'tests/enemy-gold-budget-tests.cjs'
  'tests/basic-equipment-tests.cjs'
  'tests/enemy-upgrade-tests.cjs'
  'tests/monster-formation-tests.cjs'
  'tests/audio-tests.cjs'
  'tests/music-tests.cjs'
  '.test-build/tests/unit-tests.js'
  '.test-build/tests/economy-tests.js'
  '.test-build/tests/shop-tests.js'
  '.test-build/tests/smoke.js'
  'tests/regression-tests.cjs'
  'tests/board-presentation-tests.cjs'
  'tests/cocos-background-animation-tests.cjs'
  'tests/sky-background-tests.cjs'
  'tests/trait-board-layout-tests.cjs'
  'tests/board-encounter-model-tests.cjs'
  'tests/chest-reward-flight-tests.cjs'
  'tests/floating-ruins-tests.cjs'
  'tests/floating-ruins-beauty-tests.cjs'
  'tests/float-text-tests.cjs'
  'tests/ui-interaction-tests.cjs'
  'tests/loading-overlay-tests.cjs'
  'tests/collection-unit-detail-tests.cjs'
  'tests/floating-ruins-scene-lifecycle-tests.cjs'
  'tests/opening-encounter-tests.cjs'
  'tests/soul-lamp-and-overdrive-tests.cjs'
  'tests/stage-node-ui-tests.cjs'
  'tests/stage-advance-ui-tests.cjs'
  'tests/special-shop-rate-tests.cjs'
  'tests/shop-dock-popup-tests.cjs'
  'tests/encounter-chest-regression-tests.cjs'
  'tests/expedition-portal-tests.cjs'
  'tests/monster-chest-tests.cjs'
  'tests/star-upgrade-animation-tests.cjs'
  'tests/deferred-merge-tests.cjs'
  'tests/drag-range-tests.cjs'
  'tests/trait-tests.cjs'
  'tests/milu-tests.cjs'
  'tests/xiya-tests.cjs'
  'tests/nebula-weaver-tests.cjs'
  'tests/gravity-executor-tests.cjs'
  'tests/astral-unit-vfx-tests.cjs'
  'tests/star-armor-guard-tests.cjs'
  'tests/astral-trait-tests.cjs'
  'tests/astral-trait-ui-tests.cjs'
  'tests/mechanical-units-tests.cjs'
  'tests/mechanical-animation-tests.cjs'
  'tests/mechanical-pioneer-tests.cjs'
  'tests/mechanical-pioneer-ui-tests.cjs'
  'tests/special-shop-unlock-tests.cjs'
  'tests/roster-removal-tests.cjs'
  'tests/shadow-trait-tests.cjs'
  'tests/shadow-trait-ui-tests.cjs'
  'tests/shadow-vfx-tests.cjs'
  'tests/shadow-skill-animation-tests.cjs'
  'tests/shadow-roster-tests.cjs'
  'tests/sunlight-tests.cjs'
  'tests/seraphiel-tests.cjs'
  'tests/shop-upgrade-hint-tests.cjs'
  'tests/sunlight-ui-tests.cjs'
  'tests/sunlight-animation-tests.cjs'
  'tests/class-trait-tests.cjs'
  'tests/class-trait-ui-tests.cjs'
  'tests/warrior-trait-tests.cjs'
  'tests/warrior-trait-ui-tests.cjs'
  'tests/spellchanter-trait-tests.cjs'
  'tests/spellchanter-trait-ui-tests.cjs'
  'tests/swiftmartialist-trait-tests.cjs'
  'tests/swiftmartialist-trait-ui-tests.cjs'
  'tests/unit-attack-balance-tests.cjs'
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
  'tests/fantasy-monster-tests.cjs'
  'tests/skill-presentation-tests.cjs'
  'tests/skill-layout-save-tests.cjs'
  'tests/equipment-tests.cjs'
  'tests/equipment-presentation-tests.cjs'
  'tests/divine-protection-tests.cjs'
  'tests/thousand-forged-armor-tests.cjs'
  'tests/ordinary-equipment-tests.cjs'
  'tests/growth-equipment-tests.cjs'
  'tests/codex-equipment-tests.cjs'
  'tests/equipment-display-save-tests.cjs'
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
