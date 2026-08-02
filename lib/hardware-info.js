'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function cleanName(value, fallback = 'Unavailable') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function gpuVendor(name, backend = '') {
  const type = String(backend || '').toLowerCase();
  const text = String(name || '').toLowerCase();
  if (type === 'mps' || /^apple\b/.test(text)) return 'apple';
  if (/nvidia|geforce|quadro|\btesla\b/.test(text)) return 'nvidia';
  if (/\bamd\b|radeon|instinct|\bryzen\b/.test(text)) return 'amd';
  if (type === 'xpu' || /\bintel\b|\barc\b/.test(text)) return 'intel';
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
      backend: 'cuda',
    };
  }).filter((gpu) => gpu.name !== 'Unavailable');
}

function parseComfyStatsDevices(stats) {
  const devices = Array.isArray(stats?.devices) ? stats.devices : [];
  return devices.filter((device) => device && String(device.type || '').toLowerCase() !== 'cpu').map((device) => {
    const backend = String(device.type || '').toLowerCase();
    const rawName = String(device.name || '').replace(/^(?:cuda|hip|mps|xpu|privateuseone):\d+\s*/i, '');
    const name = cleanName(rawName.split(' : ')[0], backend === 'mps' ? 'Apple GPU' : 'GPU');
    const memoryBytes = Number(device.vram_total);
    const vendor = gpuVendor(name, backend);
    const entry = {
      name,
      memoryBytes: Number.isFinite(memoryBytes) && memoryBytes > 0 ? Math.round(memoryBytes) : null,
      driver: '',
      vendor,
      backend,
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

async function readGpuInfo(execFileFn = execFile) {
  const output = await runText(execFileFn, 'nvidia-smi', [
    '--query-gpu=name,memory.total,driver_version',
    '--format=csv,noheader,nounits',
  ]);
  return parseNvidiaGpuCsv(output);
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
    readGpuInfo(options.execFileFn || execFile),
    readDiskInfo(exportPath, options.fsPromises || fs.promises),
  ]);
  const connectedGpus = parseComfyStatsDevices(options.comfyStats);
  let gpus = connectedGpus.length ? connectedGpus : detectedGpus;
  if (!gpus.length && platform === 'darwin' && /^Apple\s/i.test(cpuName)) {
    gpus = [{
      name: `${cpuName} GPU`, memoryBytes: totalMemory, memoryKind: 'unified', driver: '',
      vendor: 'apple', backend: 'mps',
    }];
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
  parseComfyStatsDevices,
  readDiskInfo,
  hardwareInfo,
};
