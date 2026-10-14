param([string]$CreatorExe = 'D:\cocos\CocosCreator-3.8.8\CocosCreator.exe', [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$taskWorkRoot = Join-Path $taskProjectRoot 'temp\web-build'
New-Item -ItemType Directory -Force -Path $taskWorkRoot | Out-Null
$taskOptions = Get-Content -LiteralPath (Join-Path $taskProjectRoot 'settings\v2\packages\builder.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
$taskOptions.platform = 'web-desktop'
$taskOptions.buildPath = 'project://build'
$taskOptions.outputName = 'web-desktop'
$taskOptions.debug = $true
$taskOptions.md5Cache = $true
$taskOptions.packages = @{ 'web-desktop' = @{ exactFitScreen = $true } }
$taskConfig = Join-Path $taskWorkRoot 'config.json'
$taskOptions | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $taskConfig -Encoding utf8NoBOM
$taskLog = Join-Path $taskWorkRoot 'creator.log'
$taskErr = Join-Path $taskWorkRoot 'creator.err.log'
if (!$VerifyOnly) {
  $taskProcess = Start-Process -FilePath $CreatorExe -ArgumentList @('--project', "`"$taskProjectRoot`"", '--build', "`"configPath=$taskConfig`"") -WindowStyle Hidden -PassThru -RedirectStandardOutput $taskLog -RedirectStandardError $taskErr
  $taskProcess.WaitForExit()
  if ($taskProcess.ExitCode -notin @(0,36)) { throw "Web build failed ($($taskProcess.ExitCode)). See $taskLog" }
}
$taskOutput = Join-Path $taskProjectRoot 'build\web-desktop'
$taskScripts = Get-ChildItem -LiteralPath $taskOutput -Recurse -Filter '*.js' | Where-Object { $_.FullName -notmatch 'cocos-js' }
$taskHasAttributes = $false
foreach ($taskScript in $taskScripts) {
  $taskCode = [IO.File]::ReadAllText($taskScript.FullName)
  if ($taskCode.Contains('spellPower') -and $taskCode.Contains('unitStats') -and ($taskCode.Contains('法强') -or $taskCode -match '\\u6cd5\\u5f3a')) { $taskHasAttributes = $true; break }
}
if (!$taskHasAttributes) { throw 'Web output does not contain the new unit detail attributes' }
& node (Join-Path $taskProjectRoot 'tests\web-build-tests.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Compiled web regression checks failed' }
Write-Output "Web build verified: $taskOutput"
