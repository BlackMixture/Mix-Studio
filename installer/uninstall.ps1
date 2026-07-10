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

function Start-Cleanup([bool]$PreserveData) {
  $RootLiteral = $Root.Replace("'", "''")
  $DataLiteral = $LocalData.Replace("'", "''")
  $Cleanup = if ($PreserveData) {
    @"
Start-Sleep -Seconds 2
`$Root = '$RootLiteral'
`$Data = '$DataLiteral'
if (Test-Path -LiteralPath `$Root) {
  Get-ChildItem -LiteralPath `$Root -Force | Where-Object { `$_.FullName -ne `$Data } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
"@
  } else {
    @"
Start-Sleep -Seconds 2
Remove-Item -LiteralPath '$RootLiteral' -Recurse -Force -ErrorAction SilentlyContinue
"@
  }
  $Encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Cleanup))
  Start-Process -FilePath $PowerShell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $Encoded) -WindowStyle Hidden
}

Assert-SafeInstallRoot
$Install = Read-JsonObject $InstallFile
$AppId = [string](Property-Or $Install 'appId' '')
$InstallMode = [string](Property-Or $Install 'installMode' '')
if ($AppId -and $AppId -ne 'mixbox-studio') { throw "This checkout belongs to another application ($AppId). Nothing was changed." }
if ($InstallMode -and $InstallMode -ne 'portable') { throw "This is not a portable Mix Studio install. Nothing was changed." }
if ($RemoveData -and $KeepData) { throw 'Choose either -RemoveData or -KeepData, not both.' }

$PreserveData = -not $RemoveData
Write-Host ''
Write-Host '  Mix Studio uninstaller' -ForegroundColor White
Write-Host '  ComfyUI, shared models, and Node.js are never removed by this tool.' -ForegroundColor DarkGray
Write-Host "  Application folder: $Root" -ForegroundColor DarkGray
if (Test-Path $LocalData) {
  if ($PreserveData) {
    Write-Host '  Local gallery data: KEEP' -ForegroundColor Green
  } else {
    Write-Host '  Local gallery data: DELETE' -ForegroundColor Red
  }
} else {
  Write-Host '  Local gallery data: not found' -ForegroundColor DarkGray
}

if (-not $NonInteractive) {
  if ($PreserveData) {
    if (-not (Read-YesNo 'Remove Mix Studio but keep the local data folder?' $true)) { Write-Host 'Cancelled.'; exit 0 }
  } else {
    Write-Host 'This permanently deletes the local data folder, including profiles and gallery media.' -ForegroundColor Red
    $Confirmation = Read-Host 'Type DELETE to continue'
    if ($Confirmation -cne 'DELETE') { Write-Host 'Cancelled.'; exit 0 }
  }
} elseif (-not $Force) {
  throw 'Non-interactive uninstall requires -Force.'
}

Write-Host 'Uninstall is scheduled. Close Mix Studio before the cleanup runs.' -ForegroundColor Yellow
Start-Cleanup $PreserveData
if ($PreserveData) {
  Write-Host "The data folder will remain at $LocalData." -ForegroundColor Green
} else {
  Write-Host 'The application folder and local data will be removed.' -ForegroundColor Green
}
exit 0
