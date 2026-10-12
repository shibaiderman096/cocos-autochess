$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
$srcs = @(
  'tests/unit-tests.ts', 'tests/smoke.ts',
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
  'assets/scripts/core/index.ts'
)
npx tsc --target ES2020 --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --strict false --outDir .test-build @srcs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -Recurse -Force assets\resources .test-build\assets\
Write-Host "`n--- 单元测试 ---" -ForegroundColor Cyan
node .test-build/tests/unit-tests.js
$unitCode = $LASTEXITCODE
Write-Host "`n--- 冒烟测试 ---" -ForegroundColor Cyan
node .test-build/tests/smoke.js
$smokeCode = $LASTEXITCODE
Remove-Item -Recurse -Force .test-build
if ($unitCode -ne 0 -or $smokeCode -ne 0) { exit 1 }
