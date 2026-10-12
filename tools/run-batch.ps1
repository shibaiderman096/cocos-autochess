$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..
$srcs = @(
  'tools/batch-sim.ts',
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
npx tsc --target ES2020 --module CommonJS --moduleResolution Node --esModuleInterop --skipLibCheck --strict false --outDir .simbuild @srcs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -Recurse -Force assets\resources .simbuild\assets\
node .simbuild/tools/batch-sim.js @args
$code = $LASTEXITCODE
Remove-Item -Recurse -Force .simbuild
exit $code
