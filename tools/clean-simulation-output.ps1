param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$taskRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskTargets = @('docs/p4-balance', 'docs/p4r1-bot-qualification')
$taskFiles = @()
foreach ($taskRelative in $taskTargets) {
  $taskDirectory = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskRelative))
  if (-not $taskDirectory.StartsWith($taskRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe simulation directory' }
  $taskFiles += @(Get-ChildItem -LiteralPath $taskDirectory -File -Recurse | Where-Object {
    $_.Name -in @('per-run.jsonl', 'per-wave.csv') -or ($_.Extension -eq '.jsonl' -and $_.Directory.Name -eq 'parts')
  })
}
$taskInventory = @($taskFiles | Sort-Object FullName | ForEach-Object {
  $taskResolved = (Resolve-Path -LiteralPath $_.FullName).Path
  $taskAllowed = $false
  foreach ($taskRelative in $taskTargets) {
    $taskPrefix = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskRelative)) + [IO.Path]::DirectorySeparatorChar
    if ($taskResolved.StartsWith($taskPrefix, [StringComparison]::OrdinalIgnoreCase)) { $taskAllowed = $true }
  }
  if (-not $taskAllowed -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Unsafe simulation file: $taskResolved" }
  [pscustomobject][ordered]@{ path = [IO.Path]::GetRelativePath($taskRoot, $taskResolved).Replace('\','/'); bytes = $_.Length }
})
$taskBytes = ($taskInventory | Measure-Object -Property bytes -Sum).Sum
Write-Host ("Simulation traces: {0} files, {1:N2} GiB" -f $taskInventory.Count, ($taskBytes / 1GB))
if (-not $Apply) { Write-Host 'Dry run; use -Apply to delete only the listed trace types.'; return }
if (-not $taskInventory.Count) { return }
$taskReport = Join-Path $taskRoot 'docs/simulation-output-cleanup.json'
[ordered]@{ utc = [DateTime]::UtcNow.ToString('o'); deletedFiles = $taskInventory.Count; deletedBytes = $taskBytes; files = $taskInventory } |
  ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $taskReport -Encoding utf8
foreach ($taskEntry in $taskInventory) {
  $taskAbsolute = [IO.Path]::GetFullPath((Join-Path $taskRoot $taskEntry.path))
  Remove-Item -LiteralPath $taskAbsolute -Force
  if (Test-Path -LiteralPath $taskAbsolute) { throw "Trace was not removed: $taskAbsolute" }
}
Write-Host 'Removed simulation traces; summaries, configurations and replay fixtures retained.'
