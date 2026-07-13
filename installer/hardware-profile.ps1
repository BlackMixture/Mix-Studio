$ErrorActionPreference = 'Stop'

function Get-MixStudioProperty($Object, [string]$Name, $Fallback) {
  if ($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]) {
    return $Object.PSObject.Properties[$Name].Value
  }
  return $Fallback
}

function ConvertTo-MixStudioGb($Bytes) {
  $Number = 0.0
  if (-not [double]::TryParse([string]$Bytes, [ref]$Number) -or $Number -le 0) { return 0 }
  return [Math]::Round($Number / 1GB, 1)
}

function Find-MixStudioNvidiaSmi {
  $Command = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
  if ($Command) { return $Command.Source }
  foreach ($Candidate in @(
    (Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'),
    (Join-Path $env:SystemRoot 'System32\nvidia-smi.exe')
  )) {
    if ($Candidate -and (Test-Path -LiteralPath $Candidate)) { return $Candidate }
  }
  return ''
}

function Get-MixStudioHardwareProfile {
  $Gpus = @()
  $Smi = Find-MixStudioNvidiaSmi
  if ($Smi) {
    try {
      $Lines = & $Smi '--query-gpu=name,memory.total,driver_version' '--format=csv,noheader,nounits' 2>$null
      foreach ($Line in @($Lines)) {
        $Parts = ([string]$Line).Split(',') | ForEach-Object { $_.Trim() }
        $MemoryMb = 0.0
        if ($Parts.Count -ge 2 -and [double]::TryParse($Parts[1], [ref]$MemoryMb)) {
          $Gpus += [pscustomobject]@{
            name = $Parts[0]
            vramGb = [Math]::Round($MemoryMb / 1024, 1)
            driver = if ($Parts.Count -ge 3) { $Parts[2] } else { '' }
            source = 'nvidia-smi'
          }
        }
      }
    } catch { $Gpus = @() }
  }

  if (-not $Gpus.Count -and (Get-Command Get-CimInstance -ErrorAction SilentlyContinue)) {
    try {
      foreach ($Controller in @(Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'NVIDIA' })) {
        $Gpus += [pscustomobject]@{
          name = [string]$Controller.Name
          vramGb = ConvertTo-MixStudioGb $Controller.AdapterRAM
          driver = [string]$Controller.DriverVersion
          source = 'windows-video-controller'
        }
      }
    } catch { $Gpus = @() }
  }

  $PrimaryGpu = $null
  if ($Gpus.Count) { $PrimaryGpu = $Gpus | Sort-Object vramGb -Descending | Select-Object -First 1 }
  $MemoryGb = 0
  $CpuName = 'Unavailable'
  $LogicalProcessors = 0
  $OsName = [Environment]::OSVersion.VersionString
  if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
    try {
      $Computer = Get-CimInstance Win32_ComputerSystem
      $MemoryGb = ConvertTo-MixStudioGb $Computer.TotalPhysicalMemory
      $LogicalProcessors = [int]$Computer.NumberOfLogicalProcessors
    } catch {}
    try {
      $Cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
      if ($Cpu -and $Cpu.Name) { $CpuName = ([string]$Cpu.Name).Trim() }
    } catch {}
    try {
      $Os = Get-CimInstance Win32_OperatingSystem
      if ($Os -and $Os.Caption) { $OsName = ([string]$Os.Caption).Trim() }
    } catch {}
  }

  $SystemDriveFreeGb = 0
  try {
    $DriveName = ([IO.Path]::GetPathRoot($env:SystemRoot)).TrimEnd('\').TrimEnd(':')
    $Drive = Get-PSDrive -Name $DriveName -ErrorAction Stop
    $SystemDriveFreeGb = ConvertTo-MixStudioGb $Drive.Free
  } catch {}

  return [pscustomobject]@{
    schemaVersion = 1
    detectedAt = [DateTime]::UtcNow.ToString('o')
    gpu = [pscustomobject]@{
      available = $null -ne $PrimaryGpu
      name = if ($PrimaryGpu) { [string]$PrimaryGpu.name } else { 'No NVIDIA GPU detected' }
      vramGb = if ($PrimaryGpu) { [double]$PrimaryGpu.vramGb } else { 0 }
      driver = if ($PrimaryGpu) { [string]$PrimaryGpu.driver } else { '' }
      source = if ($PrimaryGpu) { [string]$PrimaryGpu.source } else { 'unavailable' }
      devices = @($Gpus)
    }
    memoryGb = [double]$MemoryGb
    cpu = [pscustomobject]@{ name = $CpuName; logicalProcessors = $LogicalProcessors }
    os = $OsName
    systemDriveFreeGb = [double]$SystemDriveFreeGb
  }
}

function Get-MixStudioHardwareSummary($Hardware) {
  $Gpu = Get-MixStudioProperty $Hardware 'gpu' ([pscustomobject]@{})
  $Available = [bool](Get-MixStudioProperty $Gpu 'available' $false)
  $Name = [string](Get-MixStudioProperty $Gpu 'name' 'No NVIDIA GPU detected')
  $Vram = [double](Get-MixStudioProperty $Gpu 'vramGb' 0)
  $Memory = [double](Get-MixStudioProperty $Hardware 'memoryGb' 0)
  if (-not $Available) {
    return "No NVIDIA GPU detected | $Memory GB system RAM"
  }
  return "$Name | $Vram GB VRAM | $Memory GB system RAM"
}

function Get-MixStudioFeatureFit($Feature, $Hardware) {
  $Rules = Get-MixStudioProperty $Feature 'hardware' $null
  $FallbackDefault = [bool](Get-MixStudioProperty $Feature 'default' $false)
  if ($null -eq $Rules) {
    return [pscustomobject]@{ level = 'unknown'; label = 'Check requirements'; detail = 'Hardware guidance is unavailable for this workflow.'; recommendedDefault = $FallbackDefault }
  }

  $Gpu = Get-MixStudioProperty $Hardware 'gpu' ([pscustomobject]@{})
  $Available = [bool](Get-MixStudioProperty $Gpu 'available' $false)
  $Vram = [double](Get-MixStudioProperty $Gpu 'vramGb' 0)
  $Memory = [double](Get-MixStudioProperty $Hardware 'memoryGb' 0)
  $MinVram = [double](Get-MixStudioProperty $Rules 'minimumVramGb' 0)
  $RecommendedVram = [double](Get-MixStudioProperty $Rules 'recommendedVramGb' $MinVram)
  $MinMemory = [double](Get-MixStudioProperty $Rules 'minimumRamGb' 0)
  $RecommendedMemory = [double](Get-MixStudioProperty $Rules 'recommendedRamGb' $MinMemory)
  $AutoSelect = [string](Get-MixStudioProperty $Rules 'autoSelect' 'recommended')
  $Variant = [string](Get-MixStudioProperty $Feature 'variant' 'Curated model variant')
  $Requirements = "$MinVram GB VRAM minimum; $RecommendedVram GB recommended"

  if (-not $Available) {
    return [pscustomobject]@{
      level = 'difficult'
      label = 'NVIDIA GPU required'
      detail = "$Variant | No NVIDIA GPU was detected. This workflow is likely to fail."
      recommendedDefault = $false
    }
  }
  if ($Vram -le 0) {
    return [pscustomobject]@{
      level = 'unknown'
      label = 'VRAM unknown'
      detail = "$Variant | $Requirements. Setup could not read VRAM, so no automatic recommendation was made."
      recommendedDefault = $FallbackDefault
    }
  }

  $BelowMinimum = $Vram -lt $MinVram -or ($Memory -gt 0 -and $Memory -lt $MinMemory)
  $BelowRecommended = $Vram -lt $RecommendedVram -or ($Memory -gt 0 -and $Memory -lt $RecommendedMemory)
  if ($BelowMinimum) {
    $Issues = @()
    if ($Vram -lt $MinVram) { $Issues += "$MinVram GB VRAM minimum; detected $Vram GB" }
    if ($Memory -gt 0 -and $Memory -lt $MinMemory) { $Issues += "$MinMemory GB system RAM minimum; detected $Memory GB" }
    return [pscustomobject]@{
      level = 'difficult'
      label = 'Difficult on this PC'
      detail = "$Variant | $($Issues -join '. '). Heavy offload, very long runs, or out-of-memory errors are likely."
      recommendedDefault = $false
    }
  }

  if ($BelowRecommended) {
    $RecommendedDefault = $AutoSelect -eq 'supported'
    return [pscustomobject]@{
      level = 'limited'
      label = 'Can run with offload'
      detail = "$Variant | $Requirements. Expect slower generation and system-memory use."
      recommendedDefault = $RecommendedDefault
    }
  }

  return [pscustomobject]@{
    level = 'recommended'
    label = 'Recommended for this PC'
    detail = "$Variant | Meets the $RecommendedVram GB VRAM and $RecommendedMemory GB RAM recommendation."
    recommendedDefault = $AutoSelect -ne 'never'
  }
}
