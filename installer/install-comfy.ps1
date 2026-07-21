param(
  [Parameter(Mandatory = $true)]
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OfficialComfyDesktopUrl = 'https://dl.todesktop.com/241130tqe9q3y'

function Write-State([string]$Phase, [string]$Message) {
  $Payload = [ordered]@{ phase = $Phase; message = $Message }
  [Console]::Out.WriteLine(($Payload | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

function Find-ComfyPython([string]$Base, [string]$RegisteredPython = '') {
  if (-not $Base) { return '' }
  $Parent = Split-Path $Base -Parent
  $Candidates = @(
    $RegisteredPython,
    (Join-Path $Base '.venv\Scripts\python.exe'),
    (Join-Path $Base 'venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\.venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\venv\Scripts\python.exe'),
    (Join-Path $Parent 'python_embeded\python.exe'),
    (Join-Path $Base 'python_embeded\python.exe')
  )
  $Found = $Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
  if (-not $Found -and -not $RegisteredPython) {
    foreach ($Record in @(Get-ComfyDesktopInstallations)) {
      $AdoptedBase = [string]$Record.adoptedBaseDir
      $AdoptedPython = [string]$Record.adoptedPythonPath
      if ($AdoptedBase -and $AdoptedPython -and (Test-Path $AdoptedPython)) {
        try {
          if ((Resolve-Path $AdoptedBase).Path -eq (Resolve-Path $Base).Path) { return $AdoptedPython }
        } catch { continue }
      }
    }
  }
  return [string]$Found
}

function Get-ComfyDesktopInstallations {
  if ([string]::IsNullOrWhiteSpace($env:APPDATA)) { return @() }
  $RegistryFile = Join-Path $env:APPDATA 'Comfy Desktop\installations.json'
  if (-not (Test-Path $RegistryFile)) { return @() }
  try {
    $Records = @(Get-Content $RegistryFile -Raw | ConvertFrom-Json)
    return @($Records | Where-Object { $_ -and $_.sourceId -ne 'cloud' } | Sort-Object @{ Expression = {
      if ($_.lastLaunchedAt) { [string]$_.lastLaunchedAt } else { [string]$_.createdAt }
    }; Descending = $true })
  } catch { return @() }
}

function Get-ComfyDesktopBase {
  foreach ($Record in @(Get-ComfyDesktopInstallations)) {
    $InstallPath = [string]$Record.installPath
    $AdoptedBase = [string]$Record.adoptedBaseDir
    $Base = if ($AdoptedBase) { $AdoptedBase } elseif ($InstallPath) { Join-Path $InstallPath 'ComfyUI' } else { '' }
    $RegisteredPython = [string]$Record.adoptedPythonPath
    if ($Base -and (Test-Path $Base) -and (Find-ComfyPython $Base $RegisteredPython)) {
      return (Resolve-Path $Base).Path
    }
  }
  if ([string]::IsNullOrWhiteSpace($env:APPDATA)) { return '' }
  $ConfigFile = Join-Path $env:APPDATA 'ComfyUI\config.json'
  if (-not (Test-Path $ConfigFile)) { return '' }
  try {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    foreach ($Name in @('basePath', 'base_path')) {
      if ($null -ne $Config.PSObject.Properties[$Name]) {
        $Value = [string]$Config.PSObject.Properties[$Name].Value
        if ($Value -and (Test-Path $Value) -and (Find-ComfyPython $Value)) { return (Resolve-Path $Value).Path }
      }
    }
  } catch { return '' }
  return ''
}

function Find-ComfyDesktopApp {
  $Candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Comfy Desktop\Comfy Desktop.exe'),
    (Join-Path $env:LOCALAPPDATA 'Comfy Desktop\Comfy Desktop.exe'),
    (Join-Path $env:ProgramFiles 'Comfy Desktop\Comfy Desktop.exe'),
    $(if (${env:ProgramFiles(x86)}) { Join-Path ${env:ProgramFiles(x86)} 'Comfy Desktop\Comfy Desktop.exe' } else { '' }),
    (Join-Path $env:LOCALAPPDATA 'Programs\ComfyUI\ComfyUI.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\@comfyorgcomfyui-electron\ComfyUI.exe')
  )
  return [string]($Candidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1)
}

function Write-Result([string]$Base) {
  $Directory = Split-Path $ResultFile -Parent
  if ($Directory) { New-Item -ItemType Directory -Force -Path $Directory | Out-Null }
  $Temporary = "$ResultFile.tmp"
  $Value = [ordered]@{
    path = $Base
    modelsPath = Join-Path $Base 'models'
    url = 'http://127.0.0.1:8188'
    completedAt = [DateTime]::UtcNow.ToString('o')
  }
  [IO.File]::WriteAllText($Temporary, ($Value | ConvertTo-Json -Depth 8), $Utf8NoBom)
  Move-Item -Force $Temporary $ResultFile
}

$Existing = Get-ComfyDesktopBase
if ($Existing -and (Find-ComfyPython $Existing)) {
  Write-State 'detected' 'Using the initialized ComfyUI Desktop installation already on this PC.'
  Write-Result $Existing
  exit 0
}

$Installer = Join-Path $env:TEMP 'Mix-Studio-Comfy-Desktop-Setup.exe'
$DesktopApp = Find-ComfyDesktopApp
if (-not $DesktopApp) {
  Write-State 'downloading' 'Downloading the signed official Comfy Desktop installer.'
  Invoke-WebRequest -Uri $OfficialComfyDesktopUrl -OutFile $Installer -UseBasicParsing
  $Signature = Get-AuthenticodeSignature -FilePath $Installer
  if ($Signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    Remove-Item $Installer -Force -ErrorAction SilentlyContinue
    throw "The downloaded Comfy Desktop installer did not have a valid Windows signature ($($Signature.Status))."
  }

  Write-State 'installer' 'Complete the official Comfy Desktop steps that just opened.'
  $Process = Start-Process -FilePath $Installer -PassThru
  $Process.WaitForExit()
  if ($Process.ExitCode -ne 0) { throw "Comfy Desktop setup exited with code $($Process.ExitCode)." }
  $DesktopApp = Find-ComfyDesktopApp
}

if ($DesktopApp) {
  Write-State 'initializing' 'Comfy Desktop is open. Create or finish an installation there; Mix Studio will connect when its Python environment is ready.'
  Start-Process -FilePath $DesktopApp | Out-Null
}

$Deadline = [DateTime]::UtcNow.AddMinutes(30)
while ([DateTime]::UtcNow -lt $Deadline) {
  $Base = Get-ComfyDesktopBase
  if ($Base -and (Find-ComfyPython $Base)) {
    Write-State 'complete' 'Comfy Desktop is ready for Mix Studio.'
    Write-Result $Base
    Remove-Item $Installer -Force -ErrorAction SilentlyContinue
    exit 0
  }
  Start-Sleep -Seconds 2
}

throw 'Comfy Desktop is installed but no initialized ComfyUI instance was found. Open Comfy Desktop, create or finish an installation, launch it, then use Check again in Mix Studio.'
