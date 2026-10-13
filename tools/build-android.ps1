param(
  [string]$CreatorExe = 'D:\cocos\CocosCreator-3.8.8\CocosCreator.exe',
  [string]$AndroidSdk = 'D:\Android\Sdk',
  [string]$AndroidNdk = 'D:\Android\Sdk\ndk\27.2.12479018',
  [string]$JavaHome = $env:JAVA_HOME
)
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$buildRoot = Join-Path $projectRoot 'build\android'
$workRoot = Join-Path $projectRoot 'temp\android-build'
New-Item -ItemType Directory -Force -Path $workRoot | Out-Null
foreach ($tool in @($CreatorExe, (Join-Path $AndroidSdk 'platforms\android-36\android.jar'),
  (Join-Path $AndroidSdk 'cmake\3.22.1\bin\cmake.exe'), (Join-Path $AndroidNdk 'source.properties'),
  (Join-Path $JavaHome 'bin\java.exe'))) {
  if (!(Test-Path -LiteralPath $tool)) { throw "Required Android build tool is missing: $tool" }
}
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:ANDROID_SDK_ROOT = $AndroidSdk
$env:NDK_ROOT = $AndroidNdk
$env:GRADLE_USER_HOME = Join-Path $projectRoot 'temp\android-gradle'
$env:Path = (Join-Path $JavaHome 'bin') + ';' + $env:Path
$options = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'android-build.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
$scenes = Get-Content -LiteralPath (Join-Path $projectRoot 'settings\v2\packages\builder.json') -Raw -Encoding utf8 | ConvertFrom-Json -AsHashtable
$options.startScene = $scenes.startScene
$options.scenes = $scenes.scenes
$options.packages.android.sdkPath = $AndroidSdk
$options.packages.android.ndkPath = $AndroidNdk
$options.packages.android.javaHome = $JavaHome
$options.packages.android.javaPath = Join-Path $JavaHome 'bin\java.exe'
$generatedConfig = Join-Path $workRoot 'config.json'
$options | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $generatedConfig -Encoding utf8NoBOM
$creatorLog = Join-Path $workRoot 'creator.log'
$creatorErrorLog = Join-Path $workRoot 'creator.err.log'
$creatorProcess = Start-Process -FilePath $CreatorExe -ArgumentList @('--project', "`"$projectRoot`"", '--build', "`"configPath=$generatedConfig`"") -WindowStyle Hidden -PassThru -RedirectStandardOutput $creatorLog -RedirectStandardError $creatorErrorLog
$creatorProcess.WaitForExit()
# Creator reports a successful build with exit code 36.
if ($creatorProcess.ExitCode -notin @(0, 36)) { throw "Cocos Android export failed ($($creatorProcess.ExitCode)). See $creatorLog" }
$gradleProject = Join-Path $buildRoot 'proj'
$wrapper = Join-Path $gradleProject 'gradlew.bat'
if (!(Test-Path -LiteralPath $wrapper)) { throw "Android Gradle project was not generated: $gradleProject" }
Push-Location -LiteralPath $gradleProject
try {
  & $wrapper --no-daemon assembleDebug *> (Join-Path $workRoot 'gradle.log')
  if ($LASTEXITCODE -ne 0) { throw "Android compilation failed ($LASTEXITCODE). See $(Join-Path $workRoot 'gradle.log')" }
} finally { Pop-Location }
$apk = Get-ChildItem -LiteralPath $gradleProject -Recurse -Filter '*-debug.apk' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (!$apk) { throw 'Gradle completed but no debug APK was found' }
$releaseRoot = Join-Path $projectRoot 'build\releases'
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
$output = Join-Path $releaseRoot 'autochess-android-arm64-debug.apk'
Copy-Item -LiteralPath $apk.FullName -Destination $output -Force
$signatureTool = Join-Path $AndroidSdk 'build-tools\36.0.0\apksigner.bat'
& $signatureTool verify $output
if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
Write-Output "APK: $output"
Write-Output "SHA256: $((Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash)"
