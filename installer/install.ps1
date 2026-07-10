param(
  [switch]$NonInteractive,
  [string]$ComfyUrl,
  [string]$ComfyPath,
  [string]$ModelsPath,
  [string]$FeatureConfigFile,
  [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallFile = Join-Path $Root 'install.json'
$DataDir = Join-Path $Root 'data'
$SettingsFile = Join-Path $DataDir 'settings.json'
$FeatureManifest = Join-Path $PSScriptRoot 'feature-manifest.json'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Read-WithDefault([string]$Prompt, [string]$Default) {
  if ($NonInteractive) { return $Default }
  $answer = Read-Host "$Prompt [$Default]"
  if ([string]::IsNullOrWhiteSpace($answer)) { return $Default }
  return $answer.Trim()
}

function Read-YesNo([string]$Prompt, [bool]$Default) {
  if ($NonInteractive) { return $Default }
  $suffix = if ($Default) { 'Y/n' } else { 'y/N' }
  while ($true) {
    $answer = (Read-Host "$Prompt [$suffix]").Trim().ToLowerInvariant()
    if (-not $answer) { return $Default }
    if ($answer -in @('y', 'yes')) { return $true }
    if ($answer -in @('n', 'no')) { return $false }
    Write-Host 'Enter Y or N.' -ForegroundColor Yellow
  }
}

function Set-ObjectProperty($Object, [string]$Name, $Value) {
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) {
    $Object | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  } else {
    $property.Value = $Value
  }
}

function Read-JsonObject([string]$File) {
  if (-not (Test-Path $File)) { return [pscustomobject]@{} }
  try {
    $value = Get-Content $File -Raw | ConvertFrom-Json
    if ($null -eq $value) { return [pscustomobject]@{} }
    return $value
  }
  catch { throw "Could not read JSON from $File. Nothing was changed. $($_.Exception.Message)" }
}

function Write-JsonAtomic([string]$File, $Value) {
  $temp = "$File.tmp"
  try {
    $json = $Value | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($temp, $json, $Utf8NoBom)
    Move-Item -Force $temp $File
  }
  finally {
    if (Test-Path $temp) { Remove-Item $temp -Force -ErrorAction SilentlyContinue }
  }
}

function Existing-PropertyValue($Object, [string]$Name, $Fallback) {
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
    return $Object.PSObject.Properties[$Name].Value
  }
  return $Fallback
}

function Normalize-ComfyUrl([string]$Value) {
  $Candidate = ([string]$Value).Trim().TrimEnd('/')
  $Parsed = $null
  if (-not [Uri]::TryCreate($Candidate, [UriKind]::Absolute, [ref]$Parsed) -or
      $Parsed.Scheme -notin @('http', 'https') -or
      [string]::IsNullOrWhiteSpace($Parsed.Host)) {
    throw 'ComfyUI URL must be a full http:// or https:// URL with a host.'
  }
  return $Candidate
}

function Backup-File([string]$File, [string]$Timestamp) {
  if (-not (Test-Path $File)) { return }
  $Backup = "$File.backup-$Timestamp"
  $Suffix = 1
  while (Test-Path $Backup) {
    $Backup = "$File.backup-$Timestamp-$Suffix"
    $Suffix++
  }
  Copy-Item $File $Backup
  Write-Host "Backed up $([IO.Path]::GetFileName($File))." -ForegroundColor DarkGray
}

Write-Host ''
Write-Host '  MixBox Studio portable setup' -ForegroundColor White
Write-Host '  Your gallery and settings are preserved. Setup never deletes data.' -ForegroundColor DarkGray

Write-Step 'Checking the portable checkout'
if (-not (Test-Path (Join-Path $Root '.git'))) {
  throw "This folder is not a Git checkout. Install Git, run 'git clone https://github.com/BlackMixture/KreaStudio.git', then double-click install.bat inside that folder. A ZIP download cannot use in-app updates."
}
if ($null -eq (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is not installed or is not on PATH. Install Git for Windows, then run install.bat again.'
}
$Branch = (& git -C $Root rev-parse --abbrev-ref HEAD 2>$null).Trim()
if (-not $Branch -or $Branch -eq 'HEAD') {
  throw 'The checkout is not on a named Git branch. Switch to main before running setup.'
}
Write-Host "Git checkout: $Branch" -ForegroundColor Green

Write-Step 'Checking Node.js'
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$NodeMajor = 0
if ($null -ne $NodeCommand) {
  $NodeVersion = (& node --version).Trim()
  if ($NodeVersion -match '^v(\d+)') { $NodeMajor = [int]$Matches[1] }
}
if ($NodeMajor -lt 22) {
  $CanUseWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
  if ($CanUseWinget -and (Read-YesNo 'Node.js 22+ is required. Install the current Node.js LTS with winget?' $true)) {
    & winget install --id OpenJS.NodeJS.LTS --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Node.js installation failed. Install Node.js 22+ manually and run setup again.' }
    Write-Host 'Node.js was installed. Close this window, then run install.bat again so Windows can refresh PATH.' -ForegroundColor Yellow
    exit 10
  }
  throw 'Node.js 22+ is required. Install it from https://nodejs.org and run install.bat again.'
}
Write-Host "Node.js $NodeVersion" -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$Settings = Read-JsonObject $SettingsFile
$ExistingInstall = Read-JsonObject $InstallFile
$ExistingComfy = Existing-PropertyValue $ExistingInstall 'comfy' ([pscustomobject]@{})

Write-Step 'Connecting your ComfyUI installation'
$DefaultUrl = [string](Existing-PropertyValue $Settings 'comfyUrl' 'http://127.0.0.1:8188')
if (-not [string]::IsNullOrWhiteSpace($ComfyUrl)) { $DefaultUrl = $ComfyUrl.Trim() }
$DefaultPath = [string](Existing-PropertyValue $ExistingComfy 'path' '')
if (-not [string]::IsNullOrWhiteSpace($ComfyPath)) { $DefaultPath = $ComfyPath.Trim() }
$DefaultModels = [string](Existing-PropertyValue $ExistingComfy 'modelsPath' '')
if (-not [string]::IsNullOrWhiteSpace($ModelsPath)) { $DefaultModels = $ModelsPath.Trim() }

$SelectedUrl = Read-WithDefault 'ComfyUI URL' $DefaultUrl
$SelectedUrl = Normalize-ComfyUrl $SelectedUrl
$SelectedPath = Read-WithDefault 'Existing ComfyUI folder (optional)' $DefaultPath
if (-not $DefaultModels -and $SelectedPath) { $DefaultModels = Join-Path $SelectedPath 'models' }
$SelectedModels = Read-WithDefault 'Existing models folder (optional)' $DefaultModels

if ($SelectedPath -and -not (Test-Path $SelectedPath)) {
  Write-Host "Warning: ComfyUI folder does not currently exist: $SelectedPath" -ForegroundColor Yellow
}
if ($SelectedModels -and -not (Test-Path $SelectedModels)) {
  Write-Host "Warning: models folder does not currently exist: $SelectedModels" -ForegroundColor Yellow
}

Write-Step 'Choosing optional model families'
$FeatureValues = [pscustomobject]@{}
$ExistingFeatures = Existing-PropertyValue $Settings 'features' ([pscustomobject]@{})
$RequestedFeatures = if ($FeatureConfigFile) {
  if (-not (Test-Path $FeatureConfigFile)) { throw "Feature selection file not found: $FeatureConfigFile" }
  Read-JsonObject $FeatureConfigFile
} else { [pscustomobject]@{} }
if (Test-Path $FeatureManifest) {
  $Manifest = Get-Content $FeatureManifest -Raw | ConvertFrom-Json
  $LastGroup = ''
  foreach ($Feature in $Manifest.features) {
    if ($Feature.required -eq $true) { continue }
    $Group = ([string]$Feature.id).Split('.')[0]
    if ($Group -ne $LastGroup) {
      Write-Host "`n$($Group.ToUpperInvariant())" -ForegroundColor DarkCyan
      $LastGroup = $Group
    }
    $SavedDefault = [bool](Existing-PropertyValue $ExistingFeatures ([string]$Feature.id) ([bool]$Feature.default))
    $DefaultEnabled = [bool](Existing-PropertyValue $RequestedFeatures ([string]$Feature.id) $SavedDefault)
    $Enabled = Read-YesNo "Enable $($Feature.label)?" $DefaultEnabled
    Set-ObjectProperty $FeatureValues ([string]$Feature.id) $Enabled
  }
  foreach ($Feature in $Manifest.features) {
    if ($null -eq $Feature.dependsOn) { continue }
    foreach ($Dependency in $Feature.dependsOn) {
      if ((Existing-PropertyValue $FeatureValues ([string]$Dependency) $true) -eq $false) {
        Set-ObjectProperty $FeatureValues ([string]$Feature.id) $false
      }
    }
  }
}

$InstallConfig = [pscustomobject]@{
  schemaVersion = 1
  appId = 'mixbox-studio'
  installMode = 'portable'
  dataDir = 'data'
  createdAt = [string](Existing-PropertyValue $ExistingInstall 'createdAt' ([DateTime]::UtcNow.ToString('o')))
  updatedAt = [DateTime]::UtcNow.ToString('o')
  update = [pscustomobject]@{
    provider = 'git'
    channel = $Branch
  }
  comfy = [pscustomobject]@{
    mode = if ($SelectedPath) { 'external' } else { 'configured' }
    path = $SelectedPath
    modelsPath = $SelectedModels
    url = $SelectedUrl
  }
}

Set-ObjectProperty $Settings 'comfyUrl' $SelectedUrl
if (@($FeatureValues.PSObject.Properties).Count -gt 0) {
  Set-ObjectProperty $Settings 'features' $FeatureValues
}

Write-Step 'Saving portable configuration'
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Backup-File $SettingsFile $Timestamp
Backup-File $InstallFile $Timestamp
Write-JsonAtomic $SettingsFile $Settings
Write-JsonAtomic $InstallFile $InstallConfig
Write-Host 'Saved install.json and merged settings without replacing gallery data.' -ForegroundColor Green

Write-Step 'Testing ComfyUI'
try {
  $ObjectInfoUrl = $SelectedUrl.TrimEnd('/') + '/object_info'
  Invoke-RestMethod -Uri $ObjectInfoUrl -Method Get -TimeoutSec 5 | Out-Null
  Write-Host 'ComfyUI is reachable.' -ForegroundColor Green
} catch {
  Write-Host 'ComfyUI is not reachable yet. Start it, then use Advanced Settings in MixBox Studio to test again.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host 'Use start.bat to launch MixBox Studio. The in-app Update button pulls this Git branch.'
Write-Host 'Existing model files are reused in place; setup does not copy or redownload them.'

if (-not $SkipLaunch -and (Read-YesNo 'Start MixBox Studio now?' $true)) {
  Start-Process (Join-Path $Root 'start.bat') -WorkingDirectory $Root
}
