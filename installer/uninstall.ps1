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
$PreservationRoot = Join-Path $env:LOCALAPPDATA 'Mix Studio User Data'
$PreservedData = Join-Path $PreservationRoot 'data'
$PreservedInstall = Join-Path $PreservationRoot 'install.json'
$LegacyPreservationRoot = Join-Path $env:LOCALAPPDATA 'Mix Studio'
$LegacyPreservedData = Join-Path $LegacyPreservationRoot 'data'
$LegacyPreservedInstall = Join-Path $LegacyPreservationRoot 'install.json'
$CleanupStatusRoot = Join-Path $env:LOCALAPPDATA 'Mix Studio Uninstall'
$CleanupStatus = Join-Path $CleanupStatusRoot 'status.txt'
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
  return $CandidateFull.Equals($RootFull, [StringComparison]::OrdinalIgnoreCase) -or
    $CandidateFull.StartsWith($RootFull + '\', [StringComparison]::OrdinalIgnoreCase)
}

function Test-SamePath([string]$Left, [string]$Right) {
  if ([string]::IsNullOrWhiteSpace($Left) -or [string]::IsNullOrWhiteSpace($Right)) { return $false }
  return [IO.Path]::GetFullPath($Left).TrimEnd('\').Equals(
    [IO.Path]::GetFullPath($Right).TrimEnd('\'),
    [StringComparison]::OrdinalIgnoreCase
  )
}

function Test-ManagedDataPath([string]$Candidate) {
  if ([string]::IsNullOrWhiteSpace($Candidate)) { return $false }
  if ((Test-SamePath $Candidate $LocalData) -or
      (Test-SamePath $Candidate $PreservedData) -or
      (Test-SamePath $Candidate $LegacyPreservedData)) {
    return $true
  }
  foreach ($ManagedRoot in @($PreservationRoot, $LegacyPreservationRoot)) {
    $CandidateParent = Split-Path ([IO.Path]::GetFullPath($Candidate)) -Parent
    $CandidateName = Split-Path ([IO.Path]::GetFullPath($Candidate)) -Leaf
    if ((Test-SamePath $CandidateParent $ManagedRoot) -and
        $CandidateName.StartsWith('data-backup-', [StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }
  return $false
}

function Get-ManagedDataRemovalPaths {
  $Paths = [Collections.Generic.List[string]]::new()
  foreach ($KnownData in @($LocalData, $PreservedData, $LegacyPreservedData)) {
    if (Test-Path -LiteralPath $KnownData) { $Paths.Add([IO.Path]::GetFullPath($KnownData)) }
  }
  foreach ($ManagedRoot in @($PreservationRoot, $LegacyPreservationRoot)) {
    if (-not (Test-Path -LiteralPath $ManagedRoot)) { continue }
    foreach ($Directory in @(Get-ChildItem -LiteralPath $ManagedRoot -Force -Directory -ErrorAction Stop)) {
      if (-not $Directory.Name.StartsWith('data-backup-', [StringComparison]::OrdinalIgnoreCase)) { continue }
      if (($Directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
      if (Test-ManagedDataPath $Directory.FullName) { $Paths.Add($Directory.FullName) }
    }
  }
  return @($Paths | Select-Object -Unique)
}

function Move-DirectoryVerified([string]$Source, [string]$Destination) {
  if (Test-Path -LiteralPath $Destination) { throw "Refusing to overwrite an existing data folder: $Destination" }
  $SourceRoot = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Source))
  $DestinationRoot = [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Destination))
  if ($SourceRoot.Equals($DestinationRoot, [StringComparison]::OrdinalIgnoreCase)) {
    Move-Item -LiteralPath $Source -Destination $Destination
  } else {
    $Importing = "$Destination.importing"
    if (Test-Path -LiteralPath $Importing) { throw "A previous data transfer is still present: $Importing" }
    Copy-Item -LiteralPath $Source -Destination $Importing -Recurse -Force
    $SourceFiles = @(Get-ChildItem -LiteralPath $Source -Recurse -Force -File)
    $CopiedFiles = @(Get-ChildItem -LiteralPath $Importing -Recurse -Force -File)
    $SourceDirectories = @(Get-ChildItem -LiteralPath $Source -Recurse -Force -Directory)
    $CopiedDirectories = @(Get-ChildItem -LiteralPath $Importing -Recurse -Force -Directory)
    $SourceBytes = [long](($SourceFiles | Measure-Object -Property Length -Sum).Sum)
    $CopiedBytes = [long](($CopiedFiles | Measure-Object -Property Length -Sum).Sum)
    if ($SourceFiles.Count -ne $CopiedFiles.Count -or
        $SourceDirectories.Count -ne $CopiedDirectories.Count -or
        $SourceBytes -ne $CopiedBytes) {
      throw 'The preserved data copy did not verify. The original data was not removed.'
    }
    Move-Item -LiteralPath $Importing -Destination $Destination
    Remove-Item -LiteralPath $Source -Recurse -Force
  }
  if ((Test-Path -LiteralPath $Source) -or -not (Test-Path -LiteralPath $Destination)) {
    throw 'The data transfer could not be verified. The application was not removed.'
  }
}

function Preserve-DataOutsideCheckout([string]$DataPath) {
  if (-not (Test-Path -LiteralPath $DataPath)) {
    New-Item -ItemType Directory -Force -Path $PreservedData | Out-Null
    return $PreservedData
  }
  if (-not (Test-PathInsideRoot $DataPath) -and -not (Test-SamePath $DataPath $LegacyPreservedData)) {
    return $DataPath
  }

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
    Move-DirectoryVerified $PreservedData $Backup
    Write-Host "Previous preserved data was kept at $Backup." -ForegroundColor DarkGray
  }
  Move-DirectoryVerified $DataPath $PreservedData
  if (-not (Test-Path -LiteralPath $PreservedData)) { throw 'Could not move the local data outside the checkout. The application was not removed.' }
  return $PreservedData
}

function Write-PreservedInstall($Install, [string]$DataPath) {
  New-Item -ItemType Directory -Force -Path $PreservationRoot | Out-Null
  $Install | Add-Member -NotePropertyName 'schemaVersion' -NotePropertyValue 1 -Force
  $Install | Add-Member -NotePropertyName 'appId' -NotePropertyValue 'mix-studio' -Force
  $Install | Add-Member -NotePropertyName 'installMode' -NotePropertyValue 'portable' -Force
  $Install | Add-Member -NotePropertyName 'dataDir' -NotePropertyValue ([IO.Path]::GetFullPath($DataPath)) -Force
  $Json = $Install | ConvertTo-Json -Depth 20
  $Temp = "$PreservedInstall.tmp"
  [IO.File]::WriteAllText($Temp, "$Json`r`n", [Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $Temp -Destination $PreservedInstall -Force
  if (-not (Test-Path -LiteralPath $PreservedInstall)) {
    throw 'Could not preserve the setup profile. The application was not removed.'
  }
}

function Start-Cleanup {
  $RootLiteral = $Root.Replace("'", "''")
  $StatusLiteral = $CleanupStatus.Replace("'", "''")
  $Cleanup = @"
Start-Sleep -Seconds 2
`$LastFailure = ''
for (`$Attempt = 1; `$Attempt -le 10 -and (Test-Path -LiteralPath '$RootLiteral'); `$Attempt++) {
  try { Remove-Item -LiteralPath '$RootLiteral' -Recurse -Force -ErrorAction Stop } catch { `$LastFailure = `$_.Exception.Message }
  if (Test-Path -LiteralPath '$RootLiteral') { Start-Sleep -Seconds 1 }
}
if (Test-Path -LiteralPath '$RootLiteral') {
  `$Message = 'Mix Studio could not remove its application folder. Close any Mix Studio windows, then delete this folder manually:' + [Environment]::NewLine + '$RootLiteral' + [Environment]::NewLine + [Environment]::NewLine + `$LastFailure
  [IO.File]::WriteAllText('$StatusLiteral', `$Message, [Text.UTF8Encoding]::new(`$false))
  try {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(`$Message, 'Mix Studio uninstall incomplete') | Out-Null
  } catch {}
} else {
  [IO.File]::WriteAllText('$StatusLiteral', "Mix Studio uninstall completed at `$([DateTime]::Now.ToString('s')).", [Text.UTF8Encoding]::new(`$false))
}
"@
  $Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Cleanup))
  New-Item -ItemType Directory -Force -Path $CleanupStatusRoot | Out-Null
  [IO.File]::WriteAllText($CleanupStatus, "Mix Studio uninstall cleanup is scheduled.`r`n", [Text.UTF8Encoding]::new($false))
  Start-Process -FilePath $PowerShell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $Encoded) -WorkingDirectory $CleanupStatusRoot -WindowStyle Hidden
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
if ($RemoveData -and $NonInteractive) { throw '-RemoveData requires an interactive typed DELETE confirmation.' }
if ($RemoveData -and (Test-Path -LiteralPath $DataPath) -and
    (Test-PathInsideRoot $DataPath) -and -not (Test-SamePath $DataPath $LocalData)) {
  throw "The configured data folder is inside the application checkout but is not Mix Studio's managed data folder: $DataPath. Move it outside the checkout before uninstalling."
}

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
    $ManagedData = Test-ManagedDataPath $DataPath
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
  Write-PreservedInstall $Install $KeptData
} else {
  foreach ($ManagedDataPath in @(Get-ManagedDataRemovalPaths)) {
    if (Test-Path -LiteralPath $ManagedDataPath) {
      Remove-Item -LiteralPath $ManagedDataPath -Recurse -Force
    }
  }
}
if (-not $PreserveData) {
  foreach ($SetupProfile in (@($PreservedInstall, $LegacyPreservedInstall) | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $SetupProfile) { Remove-Item -LiteralPath $SetupProfile -Force }
  }
}

Write-Host 'Uninstall is scheduled. Close Mix Studio before the cleanup runs.' -ForegroundColor Yellow
Write-Host "Cleanup status will be recorded at $CleanupStatus." -ForegroundColor DarkGray
Start-Cleanup
if ($PreserveData) {
  Write-Host "Profiles, settings, and gallery media will remain at $KeptData." -ForegroundColor Green
  Write-Host 'A later install automatically reconnects this preserved data.' -ForegroundColor Green
} else {
  Write-Host 'The application folder, managed local data, and preserved setup profile will be removed. External data paths remain untouched.' -ForegroundColor Green
}
exit 0
