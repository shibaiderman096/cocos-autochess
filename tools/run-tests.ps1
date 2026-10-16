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
Write-Host "`n--- 单元测试（六边形战斗）---" -ForegroundColor Cyan
node .test-build/tests/unit-tests.js
$unitCode = $LASTEXITCODE
Write-Host "`n--- 经济/等级/存档测试 ---" -ForegroundColor Cyan
node .test-build/tests/economy-tests.js
$ecoCode = $LASTEXITCODE
Write-Host "`n--- 商店/卡池测试 ---" -ForegroundColor Cyan
node .test-build/tests/shop-tests.js
$shopCode = $LASTEXITCODE
Write-Host "`n--- 冒烟测试 ---" -ForegroundColor Cyan
node .test-build/tests/smoke.js
$smokeCode = $LASTEXITCODE
Write-Host "`n--- 商店与阶段联动回归测试（无渲染）---" -ForegroundColor Cyan
node tests/regression-tests.cjs
$regressionCode = $LASTEXITCODE
node tests/float-text-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/ui-interaction-tests.cjs
$uiCode = $LASTEXITCODE
node tests/skill-attack-isolation-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/stage-encounter-layout-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/stage-progression-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/role-mana-and-start-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/monster-drop-rate-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/fairness-tests.cjs
$fairnessCode = $LASTEXITCODE
node tests/progression-tests.cjs
$progressionCode = $LASTEXITCODE
node tests/combat-attributes-tests.cjs
$attributesCode = $LASTEXITCODE
node tests/combat-statistics-tests.cjs
$statisticsCode = $LASTEXITCODE
node tests/enderman-tests.cjs
$endermanCode = $LASTEXITCODE
node tests/black-flame-tests.cjs
$blackFlameCode = $LASTEXITCODE
node tests/heal-channel-tests.cjs
$healChannelCode = $LASTEXITCODE
node tests/hybrid-spell-tests.cjs
$hybridSpellCode = $LASTEXITCODE
node tests/stun-tests.cjs
$stunCode = $LASTEXITCODE
node tests/iron-golem-tests.cjs
$ironGolemCode = $LASTEXITCODE
node tests/ender-dragon-tests.cjs
$enderDragonCode = $LASTEXITCODE
node tests/academy-naruto-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/rasengan-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/rasengan-vfx-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/sage-naruto-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/seven-roles-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/skill-presentation-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/skill-layout-save-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/equipment-tests.cjs
$equipmentCode = $LASTEXITCODE
node tests/totem-tests.cjs
$totemCode = $LASTEXITCODE
node tests/skill-crit-equipment-tests.cjs
$skillCritEquipmentCode = $LASTEXITCODE
node tests/run-session-tests.cjs
$runSessionCode = $LASTEXITCODE
node tests/run-sim-cli-tests.cjs
$runSimCliCode = $LASTEXITCODE
node tests/enemy-power-tests.cjs
$enemyPowerCode = $LASTEXITCODE
node tests/power-calibration-tests.cjs
$powerCalibrationCode = $LASTEXITCODE
node tests/enemy-budget-tests.cjs
$enemyBudgetCode = $LASTEXITCODE
node tests/enemy-formation-tests.cjs
$enemyFormationCode = $LASTEXITCODE
node tests/p3-equipment-tests.cjs
$p3EquipmentCode = $LASTEXITCODE
if ($p3EquipmentCode -ne 0) { exit 1 }
node tests/formal-bot-tests.cjs
$formalBotCode = $LASTEXITCODE
if ($formalBotCode -ne 0) { exit 1 }
node tests/medium-economy-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/qualification-cli-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node tests/balance-cli-tests.cjs
$balanceCliCode = $LASTEXITCODE
if ($balanceCliCode -ne 0) { exit 1 }
node tests/p4-balance-tests.cjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$taskBuildRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($ironGolemCode -ne 0 -or $enderDragonCode -ne 0) { exit 1 }
$taskBuildPath = [IO.Path]::GetFullPath((Join-Path $taskBuildRoot '.test-build'))
if ($taskBuildPath -ne (Join-Path $taskBuildRoot '.test-build')) { throw 'Invalid test output path' }
Remove-Item -LiteralPath $taskBuildPath -Recurse -Force
if ($unitCode -ne 0 -or $ecoCode -ne 0 -or $shopCode -ne 0 -or $smokeCode -ne 0 -or $regressionCode -ne 0 -or $uiCode -ne 0 -or $fairnessCode -ne 0 -or $progressionCode -ne 0 -or $attributesCode -ne 0 -or $statisticsCode -ne 0 -or $endermanCode -ne 0 -or $blackFlameCode -ne 0 -or $healChannelCode -ne 0 -or $hybridSpellCode -ne 0 -or $stunCode -ne 0 -or $equipmentCode -ne 0 -or $totemCode -ne 0 -or $skillCritEquipmentCode -ne 0 -or $enemyPowerCode -ne 0 -or $powerCalibrationCode -ne 0 -or $runSessionCode -ne 0 -or $runSimCliCode -ne 0 -or $enemyBudgetCode -ne 0 -or $enemyFormationCode -ne 0) { exit 1 }
