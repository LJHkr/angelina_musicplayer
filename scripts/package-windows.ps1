$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseRoot = Join-Path $ProjectRoot "release"
$TargetDir = Join-Path $ReleaseRoot "InkTune-v1.0.0-win64"
$ZipOutput = Join-Path $ReleaseRoot "InkTune-v1.0.0-win64.zip"
$ElectronVersion = "31.7.7"
$ElectronArchiveName = "electron-v$ElectronVersion-win32-x64.zip"

Push-Location $ProjectRoot
try {
  npm run desktop:build
  if ($LASTEXITCODE -ne 0) { throw "Desktop renderer build failed." }

  $CacheRoots = @()
  if ($env:ELECTRON_CACHE) { $CacheRoots += $env:ELECTRON_CACHE }
  $CacheRoots += (Join-Path (Split-Path $ProjectRoot -Parent) ".electron-cache")
  $CacheRoots += (Join-Path $env:LOCALAPPDATA "electron\Cache")

  $ElectronArchive = $null
  foreach ($CacheRoot in $CacheRoots) {
    if (-not $CacheRoot -or -not (Test-Path -LiteralPath $CacheRoot)) { continue }
    $ElectronArchive = Get-ChildItem -LiteralPath $CacheRoot -Recurse -File -Filter $ElectronArchiveName -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ElectronArchive) { break }
  }

  if (-not $ElectronArchive) {
    throw "Electron $ElectronVersion runtime archive was not found in the local cache."
  }

  New-Item -ItemType Directory -Path $ReleaseRoot -Force | Out-Null
  if (Test-Path -LiteralPath $TargetDir) {
    $ResolvedTarget = [System.IO.Path]::GetFullPath($TargetDir)
    $ResolvedRelease = [System.IO.Path]::GetFullPath($ReleaseRoot) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $ResolvedTarget.StartsWith($ResolvedRelease, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to replace a directory outside the release folder."
    }
    Remove-Item -LiteralPath $ResolvedTarget -Recurse -Force
  }

  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  Expand-Archive -LiteralPath $ElectronArchive.FullName -DestinationPath $TargetDir -Force

  $OriginalExe = Join-Path $TargetDir "electron.exe"
  $AppExe = Join-Path $TargetDir "InkTune.exe"
  if (-not (Test-Path -LiteralPath $OriginalExe)) { throw "Electron runtime is incomplete." }
  Move-Item -LiteralPath $OriginalExe -Destination $AppExe -Force

  $ResourcesDir = Join-Path $TargetDir "resources"
  $AppDir = Join-Path $ResourcesDir "app"
  New-Item -ItemType Directory -Path $AppDir -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "desktop-dist") -Destination (Join-Path $AppDir "desktop-dist") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "electron") -Destination (Join-Path $AppDir "electron") -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "electron\app-package.json") -Destination (Join-Path $AppDir "package.json") -Force
  Copy-Item -LiteralPath (Join-Path $ProjectRoot "WINDOWS-README.txt") -Destination (Join-Path $TargetDir "使用说明.txt") -Force

  if (Test-Path -LiteralPath $ZipOutput) { Remove-Item -LiteralPath $ZipOutput -Force }
  Compress-Archive -Path (Join-Path $TargetDir "*") -DestinationPath $ZipOutput -CompressionLevel Optimal

  Write-Host "InkTune desktop app created:"
  Write-Host "  EXE: $AppExe"
  Write-Host "  ZIP: $ZipOutput"
} finally {
  Pop-Location
}
