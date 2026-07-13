param(
  [Parameter(Mandatory = $true)]
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$OfficialComfyDesktopUrl = 'https://download.comfy.org/windows/nsis/x64'

function Write-State([string]$Phase, [string]$Message) {
  $Payload = [ordered]@{ phase = $Phase; message = $Message }
  [Console]::Out.WriteLine(($Payload | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
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

function Find-ComfyPython([string]$Base) {
  if (-not $Base) { return '' }
  $Parent = Split-Path $Base -Parent
  $Candidates = @(
    (Join-Path $Base '.venv\Scripts\python.exe'),
    (Join-Path $Base 'venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\.venv\Scripts\python.exe'),
    (Join-Path $Base 'ComfyUI\venv\Scripts\python.exe'),
    (Join-Path $Parent 'python_embeded\python.exe'),
    (Join-Path $Base 'python_embeded\python.exe')
  )
  $Found = $Candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
  return [string]$Found
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

$Installer = Join-Path $env:TEMP 'Mix-Studio-ComfyUI-Desktop-Setup.exe'
Write-State 'downloading' 'Downloading the signed official ComfyUI Desktop installer.'
Invoke-WebRequest -Uri $OfficialComfyDesktopUrl -OutFile $Installer -UseBasicParsing
$Signature = Get-AuthenticodeSignature -FilePath $Installer
if ($Signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
  Remove-Item $Installer -Force -ErrorAction SilentlyContinue
  throw "The downloaded ComfyUI Desktop installer did not have a valid Windows signature ($($Signature.Status))."
}

Write-State 'installer' 'Complete the official ComfyUI Desktop steps that just opened.'
$Process = Start-Process -FilePath $Installer -PassThru
$Process.WaitForExit()
if ($Process.ExitCode -ne 0) { throw "ComfyUI Desktop setup exited with code $($Process.ExitCode)." }

$DesktopCandidates = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\ComfyUI\ComfyUI.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\@comfyorgcomfyui-electron\ComfyUI.exe')
)
$DesktopApp = $DesktopCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($DesktopApp) {
  Write-State 'initializing' 'Opening ComfyUI Desktop so it can finish preparing its Python environment.'
  Start-Process -FilePath $DesktopApp | Out-Null
}

$Deadline = [DateTime]::UtcNow.AddMinutes(30)
while ([DateTime]::UtcNow -lt $Deadline) {
  $Base = Get-ComfyDesktopBase
  if ($Base -and (Find-ComfyPython $Base)) {
    Write-State 'complete' 'ComfyUI Desktop is ready for Mix Studio.'
    Write-Result $Base
    Remove-Item $Installer -Force -ErrorAction SilentlyContinue
    exit 0
  }
  Start-Sleep -Seconds 2
}

throw 'ComfyUI Desktop is installed but did not finish initializing. Open ComfyUI Desktop, complete its first-run steps, then use Detect existing in Mix Studio.'
