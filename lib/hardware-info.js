'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function cleanName(value, fallback = 'Unavailable') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function parseNvidiaGpuCsv(text) {
  return String(text || '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split(',').map((part) => part.trim());
    const memoryMb = Number(parts[1]);
    return {
      name: cleanName(parts[0]),
      memoryBytes: Number.isFinite(memoryMb) && memoryMb > 0 ? Math.round(memoryMb * 1024 * 1024) : null,
      driver: cleanName(parts[2], ''),
    };
  }).filter((gpu) => gpu.name !== 'Unavailable');
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
  const gpus = detectedGpus.length || platform !== 'darwin' || !/^Apple\s/i.test(cpuName)
    ? detectedGpus
    : [{ name: `${cpuName} GPU`, memoryBytes: totalMemory, memoryKind: 'unified', driver: '' }];
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
  parseNvidiaGpuCsv,
  readDiskInfo,
  hardwareInfo,
};
