param(
  [switch]$NonInteractive,
  [switch]$RemoveData,
  [switch]$KeepData,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallFile = Join-Path $Root 'install.json'
$LocalData = Join-Path $Root 'data'
$PreservedData = Join-Path $env:LOCALAPPDATA 'Mix Studio\data'
$PreservedInstall = Join-Path $env:LOCALAPPDATA 'Mix Studio\install.json'
$PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'

function Read-JsonObject([string]$File) {
  if (-not (Test-Path $File)) { return [pscustomobject]@{} }
  try {
    $Value = Get-Content $File -Raw | ConvertFrom-Json
    if ($Value -is [pscustomobject]) { return $Value }
    return [pscustomobject]@{}
  } catch {
    throw "Could not read $File. Nothing was changed. $($_.Exception.Message)"
  }
}

function Property-Or($Object, [string]$Name, $Fallback) {
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
    return $Object.PSObject.Properties[$Name].Value
  }
  return $Fallback
}

function Read-YesNo([string]$Prompt, [bool]$Default) {
  $Suffix = if ($Default) { 'Y/n' } else { 'y/N' }
  while ($true) {
    $Answer = (Read-Host "$Prompt [$Suffix]").Trim().ToLowerInvariant()
    if (-not $Answer) { return $Default }
    if ($Answer -in @('y', 'yes')) { return $true }
    if ($Answer -in @('n', 'no')) { return $false }
    Write-Host 'Enter Y or N.' -ForegroundColor Yellow
  }
}

function Assert-SafeInstallRoot {
  $RootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $DriveRoot = [IO.Path]::GetPathRoot($RootFull).TrimEnd('\')
  if (-not $RootFull -or $RootFull -eq $DriveRoot) {
    throw "Refusing to uninstall from a drive root: $RootFull"
  }
  if (-not (Test-Path (Join-Path $Root 'server.js')) -or
      -not (Test-Path (Join-Path $Root 'installer\uninstall.ps1'))) {
    throw "This does not look like a Mix Studio checkout: $RootFull"
  }
}

function Resolve-DataPath($Install) {
  $Configured = [string](Property-Or $Install 'dataDir' 'data')
  if ([string]::IsNullOrWhiteSpace($Configured)) { return $LocalData }
  if ([IO.Path]::IsPathRooted($Configured)) { return [IO.Path]::GetFullPath($Configured) }
  return [IO.Path]::GetFullPath((Join-Path $Root $Configured))
}

function Test-PathInsideRoot([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate)) { return $false }
  $RootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $CandidateFull = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  return $CandidateFull.StartsWith($RootFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Preserve-DataOutsideCheckout([string]$DataPath) {
  if (-not (Test-Path -LiteralPath $DataPath)) { return $DataPath }
  if (-not (Test-PathInsideRoot $DataPath)) { return $DataPath }

  $Parent = Split-Path $PreservedData -Parent
  New-Item -ItemType Directory -Force -Path $Parent | Out-Null
  if (Test-Path -LiteralPath $PreservedData) {
    $Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $Backup = Join-Path $Parent "data-backup-$Timestamp"
    $Suffix = 1
    while (Test-Path -LiteralPath $Backup) {
      $Backup = Join-Path $Parent "data-backup-$Timestamp-$Suffix"
      $Suffix++
    }
    Move-Item -LiteralPath $PreservedData -Destination $Backup
    Write-Host "Previous preserved data was kept at $Backup." -ForegroundColor DarkGray
  }
  Move-Item -LiteralPath $DataPath -Destination $PreservedData
  if (-not (Test-Path -LiteralPath $PreservedData)) { throw 'Could not move the local data outside the checkout. The application was not removed.' }
  return $PreservedData
}

function Start-Cleanup {
  $RootLiteral = $Root.Replace("'", "''")
  $Cleanup = @"
Start-Sleep -Seconds 2
Remove-Item -LiteralPath '$RootLiteral' -Recurse -Force -ErrorAction SilentlyContinue
"@
  $Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Cleanup))
  Start-Process -FilePath $PowerShell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $Encoded) -WindowStyle Hidden
}

Assert-SafeInstallRoot
$Install = Read-JsonObject $InstallFile
$AppId = [string](Property-Or $Install 'appId' '')
$InstallMode = [string](Property-Or $Install 'installMode' '')
$DataPath = Resolve-DataPath $Install
$SupportedAppIds = @('mix-studio', 'mixbox-studio')
if ($AppId -and $AppId -notin $SupportedAppIds) { throw "This checkout belongs to another application ($AppId). Nothing was changed." }
if ($InstallMode -and $InstallMode -ne 'portable') { throw "This is not a portable Mix Studio install. Nothing was changed." }
if ($RemoveData -and $KeepData) { throw 'Choose either -RemoveData or -KeepData, not both.' }

$PreserveData = -not $RemoveData
Write-Host ''
Write-Host '  Mix Studio uninstaller' -ForegroundColor White
Write-Host '  ComfyUI, shared models, Node.js, and mirrored export files are never removed by this tool.' -ForegroundColor DarkGray
Write-Host '  Preserved setup and hardware recommendations are kept only when gallery data is kept.' -ForegroundColor DarkGray
Write-Host '  Browser shortcuts, browser form settings, and preview caches must be removed on each device.' -ForegroundColor DarkGray
Write-Host "  Application folder: $Root" -ForegroundColor DarkGray
if (Test-Path -LiteralPath $DataPath) {
  if ($PreserveData) {
    Write-Host "  Local gallery data: KEEP ($DataPath)" -ForegroundColor Green
  } else {
    $ManagedData = (Test-PathInsideRoot $DataPath) -or ([IO.Path]::GetFullPath($DataPath).TrimEnd('\') -eq [IO.Path]::GetFullPath($PreservedData).TrimEnd('\'))
    Write-Host $(if ($ManagedData) { '  Local gallery data: DELETE' } else { "  External gallery data: KEEP ($DataPath)" }) -ForegroundColor $(if ($ManagedData) { 'Red' } else { 'Green' })
  }
} else {
  Write-Host '  Local gallery data: not found' -ForegroundColor DarkGray
}

if (-not $NonInteractive) {
  if ($PreserveData) {
    if (-not (Read-YesNo 'Remove Mix Studio and preserve profiles, settings, and gallery media for reinstall?' $true)) { Write-Host 'Cancelled.'; exit 0 }
  } else {
    Write-Host 'This permanently deletes the local data folder, including profiles and gallery media.' -ForegroundColor Red
    $Confirmation = Read-Host 'Type DELETE to continue'
    if ($Confirmation -cne 'DELETE') { Write-Host 'Cancelled.'; exit 0 }
  }
} elseif (-not $Force) {
  throw 'Non-interactive uninstall requires -Force.'
}

$KeptData = $DataPath
if ($PreserveData) {
  $KeptData = Preserve-DataOutsideCheckout $DataPath
  if (Test-Path -LiteralPath $InstallFile) {
    New-Item -ItemType Directory -Force -Path (Split-Path $PreservedInstall -Parent) | Out-Null
    Copy-Item -LiteralPath $InstallFile -Destination $PreservedInstall -Force
  }
} elseif (Test-Path -LiteralPath $DataPath) {
  $ManagedData = (Test-PathInsideRoot $DataPath) -or ([IO.Path]::GetFullPath($DataPath).TrimEnd('\') -eq [IO.Path]::GetFullPath($PreservedData).TrimEnd('\'))
  if ($ManagedData -and -not (Test-PathInsideRoot $DataPath)) {
    Remove-Item -LiteralPath $DataPath -Recurse -Force
  }
}
if (-not $PreserveData -and (Test-Path -LiteralPath $PreservedInstall)) {
  Remove-Item -LiteralPath $PreservedInstall -Force
}

Write-Host 'Uninstall is scheduled. Close Mix Studio before the cleanup runs.' -ForegroundColor Yellow
Start-Cleanup
if ($PreserveData) {
  Write-Host "Profiles, settings, and gallery media will remain at $KeptData." -ForegroundColor Green
  Write-Host 'A later install automatically reconnects this preserved data.' -ForegroundColor Green
} else {
  Write-Host 'The application folder, managed local data, and preserved setup profile will be removed. External data paths remain untouched.' -ForegroundColor Green
}
exit 0
