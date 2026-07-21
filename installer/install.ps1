param(
  [switch]$NonInteractive,
  [string]$ComfyUrl,
  [string]$ComfyPath,
  [string]$ModelsPath,
  [string]$FeatureConfigFile,
  [string]$HardwareProfileFile,
  [ValidateSet('existing', 'desktop')]
  [string]$ComfyMode = 'existing',
  [switch]$InstallDependencies,
  [switch]$SkipLaunch
)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$InstallFile = Join-Path $Root 'install.json'
$LocalDataDir = Join-Path $Root 'data'
$PreservedDataDir = Join-Path $env:LOCALAPPDATA 'Mix Studio\data'
$PreservedInstallFile = Join-Path $env:LOCALAPPDATA 'Mix Studio\install.json'
$DataDir = if ((Test-Path $LocalDataDir) -or -not (Test-Path $PreservedDataDir)) { $LocalDataDir } else { $PreservedDataDir }
$SettingsFile = Join-Path $DataDir 'settings.json'
$ExistingInstallFile = if (Test-Path $InstallFile) { $InstallFile } elseif (Test-Path $PreservedInstallFile) { $PreservedInstallFile } else { $InstallFile }
$FeatureManifest = Join-Path $PSScriptRoot 'feature-manifest.json'
$DependencyInstaller = Join-Path $PSScriptRoot 'install-dependencies.js'
$ModelDiscoveryScript = Join-Path $PSScriptRoot 'model-discovery.js'
$HardwareProfileScript = Join-Path $PSScriptRoot 'hardware-profile.ps1'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OfficialComfyDesktopUrl = 'https://download.comfy.org/windows/nsis/x64'
if (-not (Test-Path $HardwareProfileScript)) { throw 'The hardware detection helper is missing from this checkout.' }
. $HardwareProfileScript

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

function Get-ComfyDesktopBase {
  if ([string]::IsNullOrWhiteSpace($env:APPDATA)) { return '' }
  $ConfigFile = Join-Path $env:APPDATA 'ComfyUI\config.json'
  if (-not (Test-Path $ConfigFile)) { return '' }
  try {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    foreach ($Name in @('basePath', 'base_path')) {
      if ($null -ne $Config.PSObject.Properties[$Name]) {
        $Value = [string]$Config.PSObject.Properties[$Name].Value
        if ($Value -and (Test-Path $Value)) { return (Resolve-Path $Value).Path }
      }
    }
  } catch { return '' }
  return ''
}

function Test-ComfyEnvironmentReady([string]$Base) {
  if (-not $Base) { return $false }
  $Candidates = @(
    (Join-Path $Base '.venv\Scripts\python.exe'),
    (Join-Path $Base 'venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\.venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\venv\Scripts\python.exe'),
    (Join-Path (Split-Path $Base -Parent) 'python_embeded\python.exe')
  )
  return $null -ne ($Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

function Install-ComfyDesktop {
  $Existing = Get-ComfyDesktopBase
  if ($Existing -and (Test-ComfyEnvironmentReady $Existing)) {
    Write-Host "ComfyUI Desktop is already initialized at $Existing" -ForegroundColor Green
    return $Existing
  }

  if (-not $Existing) {
    Write-Step 'Installing official ComfyUI Desktop'
    Write-Host 'The official ComfyUI setup will open. Complete its NVIDIA and install-location steps.' -ForegroundColor Yellow
    $Installer = Join-Path $env:TEMP 'ComfyUI-Desktop-Setup.exe'
    Invoke-WebRequest -Uri $OfficialComfyDesktopUrl -OutFile $Installer -UseBasicParsing
    $Signature = Get-AuthenticodeSignature -FilePath $Installer
    if ($Signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
      Remove-Item $Installer -Force -ErrorAction SilentlyContinue
      throw "The downloaded ComfyUI Desktop installer did not have a valid Windows signature ($($Signature.Status)). Nothing was run."
    }
    $Process = Start-Process -FilePath $Installer -PassThru
    $Process.WaitForExit()
    if ($Process.ExitCode -ne 0) { throw "ComfyUI Desktop setup exited with code $($Process.ExitCode)." }
  } else {
    Write-Host 'ComfyUI Desktop is installed and still finishing its Python environment.' -ForegroundColor Yellow
  }

  Write-Host 'Waiting for ComfyUI Desktop initialization. Finish the steps in its window.' -ForegroundColor Yellow
  $DesktopCandidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\ComfyUI\ComfyUI.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\@comfyorgcomfyui-electron\ComfyUI.exe')
  )
  if (-not (Get-ComfyDesktopBase)) {
    $DesktopApp = $DesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if ($DesktopApp) { Start-Process -FilePath $DesktopApp | Out-Null }
  }
  $Deadline = [DateTime]::UtcNow.AddMinutes(30)
  while ([DateTime]::UtcNow -lt $Deadline) {
    $Base = Get-ComfyDesktopBase
    if ($Base -and (Test-ComfyEnvironmentReady $Base)) { return $Base }
    Start-Sleep -Seconds 2
  }
  throw 'ComfyUI Desktop was installed, but initialization was not completed within 30 minutes. Finish its setup, then run install_MixStudio.bat again; the completed installation will be detected.'
}

$HardwareProfile = if ($HardwareProfileFile) {
  if (-not (Test-Path $HardwareProfileFile)) { throw "Hardware profile file not found: $HardwareProfileFile" }
  Read-JsonObject $HardwareProfileFile
} else {
  Get-MixStudioHardwareProfile
}
$HardwareSummary = Get-MixStudioHardwareSummary $HardwareProfile

Write-Host ''
Write-Host '  Mix Studio portable setup' -ForegroundColor White
Write-Host '  Your gallery and settings are preserved. Setup never deletes data.' -ForegroundColor DarkGray

Write-Step 'Checking the portable checkout'
if (-not (Test-Path (Join-Path $Root '.git'))) {
  throw "This folder is not a Git checkout. Install Git, run 'git clone https://github.com/BlackMixture/Mix-Studio.git', then double-click install_MixStudio.bat inside that folder. A ZIP download cannot use in-app updates."
}
if ($null -eq (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is not installed or is not on PATH. Install Git for Windows, then run install_MixStudio.bat again.'
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
    Write-Host 'Node.js was installed. Close this window, then run install_MixStudio.bat again so Windows can refresh PATH.' -ForegroundColor Yellow
    exit 10
  }
  throw 'Node.js 22+ is required. Install it from https://nodejs.org and run install_MixStudio.bat again.'
}
Write-Host "Node.js $NodeVersion" -ForegroundColor Green

Write-Step 'Checking hardware fit'
Write-Host $HardwareSummary -ForegroundColor Cyan
$DetectedGpu = Get-MixStudioProperty $HardwareProfile 'gpu' ([pscustomobject]@{})
if (-not [bool](Get-MixStudioProperty $DetectedGpu 'available' $false)) {
  Write-Host 'No NVIDIA GPU was detected. Setup will keep optional model families off by default and flag difficult selections.' -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
$UsingPreservedData = [IO.Path]::GetFullPath($DataDir).TrimEnd('\') -ne [IO.Path]::GetFullPath($LocalDataDir).TrimEnd('\')
if ($UsingPreservedData) {
  Write-Host "Reusing preserved profiles, settings, and gallery data from $DataDir" -ForegroundColor Green
}
$Settings = Read-JsonObject $SettingsFile
$ExistingInstall = Read-JsonObject $ExistingInstallFile
$ExistingComfy = Existing-PropertyValue $ExistingInstall 'comfy' ([pscustomobject]@{})

Write-Step 'Connecting your ComfyUI installation'
$DefaultUrl = [string](Existing-PropertyValue $Settings 'comfyUrl' 'http://127.0.0.1:8188')
if (-not [string]::IsNullOrWhiteSpace($ComfyUrl)) { $DefaultUrl = $ComfyUrl.Trim() }
$DefaultPath = [string](Existing-PropertyValue $ExistingComfy 'path' '')
if (-not [string]::IsNullOrWhiteSpace($ComfyPath)) { $DefaultPath = $ComfyPath.Trim() }
$DefaultModels = [string](Existing-PropertyValue $ExistingComfy 'modelsPath' '')
if (-not [string]::IsNullOrWhiteSpace($ModelsPath)) { $DefaultModels = $ModelsPath.Trim() }

if ($ComfyMode -eq 'desktop') {
  $InstalledComfyPath = Install-ComfyDesktop
  if ($InstalledComfyPath) {
    $DefaultPath = $InstalledComfyPath
    $DefaultModels = Join-Path $InstalledComfyPath 'models'
  }
}

$SelectedUrl = Read-WithDefault 'ComfyUI URL' $DefaultUrl
$SelectedUrl = Normalize-ComfyUrl $SelectedUrl
$SelectedPath = Read-WithDefault 'Existing ComfyUI folder (optional)' $DefaultPath
if (-not $DefaultModels -and $SelectedPath) { $DefaultModels = Join-Path $SelectedPath 'models' }
$SelectedModels = Read-WithDefault 'Existing models folder (optional)' $DefaultModels

if ($SelectedPath -and -not (Test-Path $SelectedPath)) {
  Write-Host "Warning: ComfyUI folder does not currently exist: $SelectedPath" -ForegroundColor Yellow
}

Write-Step 'Finding existing models'
$ModelDiscovery = [pscustomobject]@{
  schemaVersion = 1
  detectedAt = [DateTime]::UtcNow.ToString('o')
  registeredModelNames = @()
  registeredModelCount = 0
  modelRoots = @()
  configFiles = @()
  preferredModelsPath = $SelectedModels
  registryError = 'Model discovery did not run.'
}
if (Test-Path $ModelDiscoveryScript) {
  try {
    $DiscoveryJson = (& node $ModelDiscoveryScript "--comfy-url=$SelectedUrl" "--comfy-path=$SelectedPath" "--models-path=$SelectedModels" 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -eq 0 -and $DiscoveryJson) { $ModelDiscovery = $DiscoveryJson | ConvertFrom-Json }
  } catch {
    Write-Host "Automatic model discovery needs attention: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
$DiscoveredModelsPath = [string](Existing-PropertyValue $ModelDiscovery 'preferredModelsPath' '')
if (-not $SelectedModels -and $DiscoveredModelsPath) {
  $SelectedModels = $DiscoveredModelsPath
  Write-Host "Using detected models folder: $SelectedModels" -ForegroundColor Green
}
$RegisteredModelCount = [int](Existing-PropertyValue $ModelDiscovery 'registeredModelCount' 0)
$DiscoveredRoots = @(Existing-PropertyValue $ModelDiscovery 'modelRoots' @())
if ($RegisteredModelCount -gt 0) {
  Write-Host "ComfyUI reports $RegisteredModelCount existing model files. Matching files will not be downloaded again." -ForegroundColor Green
}
if ($DiscoveredRoots.Count) {
  Write-Host ('Detected model roots: ' + ($DiscoveredRoots -join ', ')) -ForegroundColor DarkGray
}
if ((Existing-PropertyValue $ModelDiscovery 'registryError' '') -and -not $RegisteredModelCount) {
  Write-Host 'ComfyUI is not reporting its model registry yet. Setup will still reuse files found under the selected models folder.' -ForegroundColor Yellow
}
if ($SelectedModels -and -not (Test-Path $SelectedModels)) {
  Write-Host "Models folder will be created when dependencies are installed: $SelectedModels" -ForegroundColor Yellow
}

Write-Step 'Choosing optional model families'
$FeatureValues = [pscustomobject]@{}
$ExistingFeatures = Existing-PropertyValue $Settings 'features' ([pscustomobject]@{})
$RequestedFeatures = if ($FeatureConfigFile) {
  if (-not (Test-Path $FeatureConfigFile)) { throw "Feature selection file not found: $FeatureConfigFile" }
  Read-JsonObject $FeatureConfigFile
} else { [pscustomobject]@{} }
$HasExistingFeatureSelection = @($ExistingFeatures.PSObject.Properties).Count -gt 0
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
    $FeatureId = [string]$Feature.id
    $Fit = Get-MixStudioFeatureFit $Feature $HardwareProfile
    $HasSavedValue = $null -ne $ExistingFeatures.PSObject.Properties[$FeatureId]
    $HasRequestedValue = $null -ne $RequestedFeatures.PSObject.Properties[$FeatureId]
    $SavedDefault = if ($HasSavedValue) { [bool]$ExistingFeatures.PSObject.Properties[$FeatureId].Value } elseif ($HasExistingFeatureSelection) { [bool]$Feature.default } else { [bool]$Fit.recommendedDefault }
    $DefaultEnabled = if ($HasRequestedValue) { [bool]$RequestedFeatures.PSObject.Properties[$FeatureId].Value } else { $SavedDefault }
    $FitColor = if ($Fit.level -eq 'recommended') { 'Green' } elseif ($Fit.level -eq 'difficult') { 'Red' } else { 'Yellow' }
    Write-Host "  $($Fit.label): $($Fit.detail)" -ForegroundColor $FitColor
    $Enabled = Read-YesNo "Enable $($Feature.label)?" $DefaultEnabled
    Set-ObjectProperty $FeatureValues $FeatureId $Enabled
  }
  foreach ($Feature in $Manifest.features) {
    if ($null -eq $Feature.dependsOn) { continue }
    foreach ($Dependency in $Feature.dependsOn) {
      if ((Existing-PropertyValue $FeatureValues ([string]$Dependency) $true) -eq $false) {
        Set-ObjectProperty $FeatureValues ([string]$Feature.id) $false
      }
    }
  }

  $SelectedHardwareWarnings = @()
  foreach ($Feature in $Manifest.features) {
    $FeatureId = [string]$Feature.id
    $Selected = $Feature.required -eq $true -or [bool](Existing-PropertyValue $FeatureValues $FeatureId $false)
    if (-not $Selected) { continue }
    $Fit = Get-MixStudioFeatureFit $Feature $HardwareProfile
    if ($Fit.level -in @('limited', 'difficult')) { $SelectedHardwareWarnings += "$($Feature.label): $($Fit.label)" }
  }
  if ($SelectedHardwareWarnings.Count) {
    Write-Host 'Selected hardware warnings:' -ForegroundColor Yellow
    foreach ($Warning in $SelectedHardwareWarnings) { Write-Host "  $Warning" -ForegroundColor Yellow }
  }
}

$InstallConfig = [pscustomobject]@{
  schemaVersion = 1
  appId = 'mix-studio'
  installMode = 'portable'
  dataDir = if ($UsingPreservedData) { $DataDir } else { 'data' }
  createdAt = [string](Existing-PropertyValue $ExistingInstall 'createdAt' ([DateTime]::UtcNow.ToString('o')))
  updatedAt = [DateTime]::UtcNow.ToString('o')
  update = [pscustomobject]@{
    provider = 'git'
    channel = $Branch
  }
  comfy = [pscustomobject]@{
    mode = if ($ComfyMode -eq 'desktop') { 'desktop' } elseif ($SelectedPath) { 'external' } else { 'configured' }
    path = $SelectedPath
    modelsPath = $SelectedModels
    url = $SelectedUrl
  }
  hardware = $HardwareProfile
  modelDiscovery = [pscustomobject]@{
    detectedAt = [string](Existing-PropertyValue $ModelDiscovery 'detectedAt' ([DateTime]::UtcNow.ToString('o')))
    registeredModelCount = $RegisteredModelCount
    modelRoots = $DiscoveredRoots
    configFiles = @(Existing-PropertyValue $ModelDiscovery 'configFiles' @())
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
if ($ExistingInstallFile -eq $PreservedInstallFile -and (Test-Path $PreservedInstallFile)) {
  Remove-Item $PreservedInstallFile -Force -ErrorAction SilentlyContinue
}
Write-Host 'Saved install.json and merged settings without replacing gallery data.' -ForegroundColor Green

if ($InstallDependencies) {
  Write-Step 'Installing selected models and custom nodes'
  if (-not (Test-Path $DependencyInstaller)) { throw 'The dependency installer is missing from this checkout.' }
  if (-not $FeatureConfigFile -or -not (Test-Path $FeatureConfigFile)) { throw 'The selected feature list is required for model installation.' }
  $DiscoveryFile = Join-Path $env:TEMP ("mix-studio-models-" + [Guid]::NewGuid().ToString('N') + '.json')
  try {
    [IO.File]::WriteAllText($DiscoveryFile, ($ModelDiscovery | ConvertTo-Json -Depth 20), $Utf8NoBom)
    & node $DependencyInstaller --features $FeatureConfigFile --discovery $DiscoveryFile
    if ($LASTEXITCODE -ne 0) {
      throw 'One or more selected model or custom-node downloads did not finish. Existing files and saved settings were preserved; rerun setup to continue.'
    }
  } finally {
    if (Test-Path $DiscoveryFile) { Remove-Item $DiscoveryFile -Force -ErrorAction SilentlyContinue }
  }
}

Write-Step 'Testing ComfyUI'
try {
  $ObjectInfoUrl = $SelectedUrl.TrimEnd('/') + '/object_info'
  Invoke-RestMethod -Uri $ObjectInfoUrl -Method Get -TimeoutSec 5 | Out-Null
  Write-Host 'ComfyUI is reachable.' -ForegroundColor Green
} catch {
  Write-Host 'ComfyUI is not reachable yet. Start it, then use Advanced Settings in Mix Studio to test again.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
Write-Host 'Use start.bat to launch Mix Studio. The in-app Update button pulls this Git branch.'
Write-Host 'Existing model files are reused in place; completed downloads are not repeated.'

if (-not $SkipLaunch -and (Read-YesNo 'Start Mix Studio now?' $true)) {
  Start-Process (Join-Path $Root 'start.bat') -WorkingDirectory $Root
}
