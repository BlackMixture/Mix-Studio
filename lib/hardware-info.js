'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function cleanName(value, fallback = 'Unavailable') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function gpuVendor(name) {
  const text = String(name || '').toLowerCase();
  if (/nvidia|geforce|quadro|\btesla\b/.test(text)) return 'nvidia';
  if (/\bamd\b|radeon|instinct|\bryzen\b/.test(text)) return 'amd';
  if (/\bintel\b|\barc\b/.test(text)) return 'intel';
  if (/^apple\b/.test(text)) return 'apple';
  return 'unknown';
}

function parseNvidiaGpuCsv(text) {
  return String(text || '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split(',').map((part) => part.trim());
    const memoryMb = Number(parts[1]);
    return {
      name: cleanName(parts[0]),
      memoryBytes: Number.isFinite(memoryMb) && memoryMb > 0 ? Math.round(memoryMb * 1024 * 1024) : null,
      driver: cleanName(parts[2], ''),
      vendor: 'nvidia',
    };
  }).filter((gpu) => gpu.name !== 'Unavailable');
}

function parseRocmSmiJson(text) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return []; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.keys(data).filter((key) => /^card\d+$/.test(key)).map((key) => {
    const card = data[key] && typeof data[key] === 'object' ? data[key] : {};
    const memoryBytes = Number(card['VRAM Total Memory (B)']);
    return {
      name: cleanName(card['Card Series'] || card['Card Vendor']),
      memoryBytes: Number.isFinite(memoryBytes) && memoryBytes > 0 ? Math.round(memoryBytes) : null,
      driver: '',
      vendor: 'amd',
      arch: cleanName(card['GFX Version'], ''),
    };
  }).filter((gpu) => gpu.name !== 'Unavailable');
}

// Bare metal fallback when rocm-smi is not installed: amdgpu exposes VRAM
// totals through sysfs, but no marketing name.
async function readAmdSysfsGpuInfo(fsPromises = fs.promises) {
  try {
    const entries = await fsPromises.readdir('/sys/class/drm');
    const devices = [];
    for (const entry of entries.filter((name) => /^card\d+$/.test(name)).sort()) {
      const base = `/sys/class/drm/${entry}/device`;
      try {
        const vendorId = String(await fsPromises.readFile(`${base}/vendor`, 'utf8')).trim();
        if (vendorId !== '0x1002') continue;
        const vram = Number(String(await fsPromises.readFile(`${base}/mem_info_vram_total`, 'utf8')).trim());
        devices.push({
          name: 'AMD GPU',
          memoryBytes: Number.isFinite(vram) && vram > 0 ? vram : null,
          driver: '',
          vendor: 'amd',
        });
      } catch { /* connector nodes and non-amdgpu devices */ }
    }
    return devices;
  } catch { return []; }
}

// Win32_VideoController.AdapterRAM is a uint32 and caps at 4 GB, so real VRAM
// comes from the display-class registry key the driver writes.
const WINDOWS_GPU_QUERY = [
  '$ErrorActionPreference = "SilentlyContinue"',
  '$controllers = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion)',
  '$reg = @(Get-ItemProperty "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*" | Select-Object DriverDesc, "HardwareInformation.qwMemorySize")',
  '$list = foreach ($c in $controllers) {',
  '$mem = $null',
  'foreach ($r in $reg) { if ($r.DriverDesc -eq $c.Name -and $r."HardwareInformation.qwMemorySize") { $mem = [int64]$r."HardwareInformation.qwMemorySize" } }',
  '[pscustomobject]@{ name = $c.Name; memoryBytes = $mem; driver = $c.DriverVersion }',
  '}',
  'ConvertTo-Json @($list)',
].join('; ');

function parseWindowsGpuJson(text) {
  let data;
  try { data = JSON.parse(String(text || '')); } catch { return []; }
  const list = Array.isArray(data) ? data : (data && typeof data === 'object' ? [data] : []);
  return list.map((entry) => {
    const name = cleanName(entry && entry.name);
    const memoryBytes = Number(entry && entry.memoryBytes);
    return {
      name,
      memoryBytes: Number.isFinite(memoryBytes) && memoryBytes > 0 ? Math.round(memoryBytes) : null,
      driver: cleanName(entry && entry.driver, ''),
      vendor: gpuVendor(name),
    };
  }).filter((gpu) => gpu.name !== 'Unavailable' && !/microsoft basic|virtual|vnc|remote|parsec/i.test(gpu.name));
}

// ComfyUI /system_stats reports the device the generation machine actually
// runs on, for every backend (CUDA, ROCm, MPS) — including remote installs
// where local probing would be wrong.
function parseComfyStatsDevices(stats) {
  const devices = Array.isArray(stats?.devices) ? stats.devices : [];
  return devices.filter((device) => device && device.type && device.type !== 'cpu').map((device) => {
    const rawName = String(device.name || '').replace(/^(?:cuda|hip|mps|xpu|privateuseone):\d+\s*/i, '');
    const name = cleanName(rawName.split(' : ')[0], 'GPU');
    const vram = Number(device.vram_total);
    const vendor = device.type === 'mps' ? 'apple' : gpuVendor(name);
    const entry = {
      name,
      memoryBytes: Number.isFinite(vram) && vram > 0 ? Math.round(vram) : null,
      driver: '',
      vendor,
      source: 'comfyui',
    };
    if (vendor === 'apple') entry.memoryKind = 'unified';
    return entry;
  });
}

function runText(execFileFn, command, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFileFn(command, args, { timeout, windowsHide: true }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''));
    });
  });
}

async function readGpuInfo(execFileFn = execFile, platform = process.platform, fsPromises = fs.promises) {
  const nvidia = parseNvidiaGpuCsv(await runText(execFileFn, 'nvidia-smi', [
    '--query-gpu=name,memory.total,driver_version',
    '--format=csv,noheader,nounits',
  ]));
  if (nvidia.length) return nvidia;
  const rocm = parseRocmSmiJson(await runText(execFileFn, 'rocm-smi', [
    '--showproductname', '--showmeminfo', 'vram', '--json',
  ]));
  if (rocm.length) return rocm;
  if (platform === 'linux') {
    const sysfs = await readAmdSysfsGpuInfo(fsPromises);
    if (sysfs.length) return sysfs;
  }
  if (platform === 'win32') {
    const windows = parseWindowsGpuJson(await runText(execFileFn, 'powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', WINDOWS_GPU_QUERY,
    ], 8000));
    if (windows.length) return windows;
  }
  return [];
}

function osLabel(platform) {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return cleanName(platform, 'Unknown OS');
}

async function readDiskInfo(exportPath, fsPromises = fs.promises) {
  try {
    const stats = await fsPromises.statfs(exportPath);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const freeBlocks = Number(stats.bavail ?? stats.bfree ?? 0);
    const totalBlocks = Number(stats.blocks || 0);
    return {
      root: path.parse(path.resolve(exportPath)).root || path.resolve(exportPath),
      freeBytes: blockSize > 0 && freeBlocks >= 0 ? Math.round(blockSize * freeBlocks) : null,
      totalBytes: blockSize > 0 && totalBlocks > 0 ? Math.round(blockSize * totalBlocks) : null,
    };
  } catch {
    return {
      root: path.parse(path.resolve(exportPath)).root || path.resolve(exportPath),
      freeBytes: null,
      totalBytes: null,
    };
  }
}

async function hardwareInfo(options = {}) {
  const osModule = options.osModule || os;
  const exportPath = options.exportPath || process.cwd();
  const cpus = osModule.cpus() || [];
  const platform = osModule.platform();
  const cpuName = cleanName(cpus[0] && cpus[0].model);
  const totalMemory = Number(osModule.totalmem()) || null;
  const release = cleanName(osModule.release(), '');
  const version = platform === 'win32' && typeof osModule.version === 'function'
    ? cleanName(osModule.version(), release) : release;
  const [detectedGpus, disk] = await Promise.all([
    readGpuInfo(options.execFileFn || execFile, platform, options.fsPromises || fs.promises),
    readDiskInfo(exportPath, options.fsPromises || fs.promises),
  ]);
  let gpus = detectedGpus;
  if (!gpus.length) gpus = parseComfyStatsDevices(options.comfyStats);
  if (!gpus.length && platform === 'darwin' && /^Apple\s/i.test(cpuName)) {
    gpus = [{ name: `${cpuName} GPU`, memoryBytes: totalMemory, memoryKind: 'unified', driver: '', vendor: 'apple' }];
  }
  return {
    gpu: {
      available: gpus.length > 0,
      devices: gpus,
    },
    cpu: {
      name: cpuName,
      logicalCores: cpus.length,
    },
    memory: {
      totalBytes: totalMemory,
      freeBytes: Number(osModule.freemem()) || null,
    },
    os: {
      name: osLabel(platform),
      version,
      release,
      arch: cleanName(osModule.arch(), ''),
    },
    disk,
  };
}

module.exports = {
  cleanName,
  gpuVendor,
  parseNvidiaGpuCsv,
  parseRocmSmiJson,
  parseWindowsGpuJson,
  parseComfyStatsDevices,
  readAmdSysfsGpuInfo,
  readDiskInfo,
  hardwareInfo,
};
