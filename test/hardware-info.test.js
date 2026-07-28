'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseNvidiaGpuCsv,
  parseRocmSmiJson,
  parseWindowsGpuJson,
  parseComfyStatsDevices,
  readAmdSysfsGpuInfo,
  readDiskInfo,
  hardwareInfo,
} = require('../lib/hardware-info');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('parses NVIDIA GPU identity, VRAM, and driver information', () => {
  assert.deepEqual(parseNvidiaGpuCsv('NVIDIA GeForce RTX 5090, 32607, 576.80\nNVIDIA RTX A6000, 49140, 576.80'), [
    { name: 'NVIDIA GeForce RTX 5090', memoryBytes: 32607 * 1024 * 1024, driver: '576.80', vendor: 'nvidia' },
    { name: 'NVIDIA RTX A6000', memoryBytes: 49140 * 1024 * 1024, driver: '576.80', vendor: 'nvidia' },
  ]);
});

test('parses AMD GPU identity, VRAM, and architecture from rocm-smi JSON', () => {
  const sample = JSON.stringify({
    card0: {
      'VRAM Total Memory (B)': '17163091968',
      'Card Series': 'AMD Radeon RX 6800',
      'Card Vendor': 'Advanced Micro Devices, Inc. [AMD/ATI]',
      'GFX Version': 'gfx1030',
    },
    card1: {
      'VRAM Total Memory (B)': '536870912',
      'Card Series': 'AMD Ryzen 7 7800X3D 8-Core Processor',
      'GFX Version': 'gfx1036',
    },
  });
  assert.deepEqual(parseRocmSmiJson(sample), [
    { name: 'AMD Radeon RX 6800', memoryBytes: 17163091968, driver: '', vendor: 'amd', arch: 'gfx1030' },
    { name: 'AMD Ryzen 7 7800X3D 8-Core Processor', memoryBytes: 536870912, driver: '', vendor: 'amd', arch: 'gfx1036' },
  ]);
  assert.deepEqual(parseRocmSmiJson('not json'), []);
});

test('reads amdgpu VRAM totals from sysfs when rocm-smi is unavailable', async () => {
  const files = {
    '/sys/class/drm/card0/device/vendor': '0x1002\n',
    '/sys/class/drm/card0/device/mem_info_vram_total': '536870912\n',
    '/sys/class/drm/card1/device/vendor': '0x1002\n',
    '/sys/class/drm/card1/device/mem_info_vram_total': '17163091968\n',
  };
  const devices = await readAmdSysfsGpuInfo({
    readdir: async () => ['card0', 'card0-DP-1', 'card1', 'renderD128'],
    readFile: async (file) => {
      if (!files[file]) throw new Error('missing');
      return files[file];
    },
  });
  assert.deepEqual(devices, [
    { name: 'AMD GPU', memoryBytes: 536870912, driver: '', vendor: 'amd' },
    { name: 'AMD GPU', memoryBytes: 17163091968, driver: '', vendor: 'amd' },
  ]);
});

test('parses Windows video controllers and filters virtual adapters', () => {
  const sample = JSON.stringify([
    { name: 'AMD Radeon RX 7900 XTX', memoryBytes: 25753026560, driver: '32.0.11021.1019' },
    { name: 'Microsoft Basic Display Adapter', memoryBytes: null, driver: '' },
  ]);
  assert.deepEqual(parseWindowsGpuJson(sample), [
    { name: 'AMD Radeon RX 7900 XTX', memoryBytes: 25753026560, driver: '32.0.11021.1019', vendor: 'amd' },
  ]);
});

test('adopts ComfyUI system_stats devices for CUDA, ROCm, and MPS backends', () => {
  const amd = parseComfyStatsDevices({
    devices: [{ name: 'cuda:0 AMD Radeon Graphics : native', type: 'cuda', vram_total: 17163091968 }],
  });
  assert.deepEqual(amd, [
    { name: 'AMD Radeon Graphics', memoryBytes: 17163091968, driver: '', vendor: 'amd', source: 'comfyui' },
  ]);
  const mps = parseComfyStatsDevices({
    devices: [{ name: 'mps', type: 'mps', vram_total: 51539607552 }],
  });
  assert.equal(mps[0].vendor, 'apple');
  assert.equal(mps[0].memoryKind, 'unified');
  assert.deepEqual(parseComfyStatsDevices({ devices: [{ name: 'cpu', type: 'cpu' }] }), []);
});

test('reads free and total capacity from the configured export storage drive', async () => {
  const disk = await readDiskInfo('/exports', {
    statfs: async () => ({ bsize: 4096, bavail: 250000, blocks: 1000000 }),
  });
  assert.equal(disk.root, path.parse(path.resolve('/exports')).root);
  assert.equal(disk.freeBytes, 4096 * 250000);
  assert.equal(disk.totalBytes, 4096 * 1000000);
});

test('collects a compact cross-platform hardware response', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    osModule: {
      cpus: () => Array.from({ length: 24 }, () => ({ model: 'AMD Ryzen 9 9950X' })),
      platform: () => 'win32',
      totalmem: () => 64 * 1024 ** 3,
      freemem: () => 40 * 1024 ** 3,
      version: () => 'Windows 11 Pro',
      release: () => '10.0.26100',
      arch: () => 'x64',
    },
    fsPromises: { statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }) },
    execFileFn: (_command, _args, _options, callback) => callback(null, 'NVIDIA GeForce RTX 5090, 32607, 576.80'),
  });
  assert.equal(info.gpu.devices[0].name, 'NVIDIA GeForce RTX 5090');
  assert.equal(info.cpu.name, 'AMD Ryzen 9 9950X');
  assert.equal(info.cpu.logicalCores, 24);
  assert.equal(info.memory.totalBytes, 64 * 1024 ** 3);
  assert.equal(info.os.name, 'Windows');
  assert.equal(info.os.version, 'Windows 11 Pro');
  assert.equal(info.disk.freeBytes, 409600);
});

test('reports the integrated Apple Silicon GPU with unified memory', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    osModule: {
      cpus: () => Array.from({ length: 14 }, () => ({ model: 'Apple M4 Pro' })),
      platform: () => 'darwin',
      totalmem: () => 48 * 1024 ** 3,
      freemem: () => 20 * 1024 ** 3,
      version: () => 'macOS',
      release: () => '25.5.0',
      arch: () => 'arm64',
    },
    fsPromises: { statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }) },
    execFileFn: (_command, _args, _options, callback) => callback(new Error('nvidia-smi unavailable')),
  });
  assert.deepEqual(info.gpu.devices, [{
    name: 'Apple M4 Pro GPU',
    memoryBytes: 48 * 1024 ** 3,
    memoryKind: 'unified',
    driver: '',
    vendor: 'apple',
  }]);
});

test('detects AMD GPUs through rocm-smi when nvidia-smi is unavailable', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    osModule: {
      cpus: () => Array.from({ length: 16 }, () => ({ model: 'AMD Ryzen 7 7800X3D 8-Core Processor' })),
      platform: () => 'linux',
      totalmem: () => 64 * 1024 ** 3,
      freemem: () => 40 * 1024 ** 3,
      release: () => '7.1.4-1-cachyos',
      arch: () => 'x64',
    },
    fsPromises: { statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }) },
    execFileFn: (command, _args, _options, callback) => {
      if (command === 'rocm-smi') {
        callback(null, JSON.stringify({
          card0: { 'VRAM Total Memory (B)': '17163091968', 'Card Series': 'AMD Radeon RX 6800', 'GFX Version': 'gfx1030' },
        }));
        return;
      }
      callback(new Error(`${command} unavailable`));
    },
  });
  assert.equal(info.gpu.available, true);
  assert.equal(info.gpu.devices[0].name, 'AMD Radeon RX 6800');
  assert.equal(info.gpu.devices[0].vendor, 'amd');
  assert.equal(info.gpu.devices[0].memoryBytes, 17163091968);
});

test('prefers ComfyUI-reported devices over an empty local probe', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    osModule: {
      cpus: () => [{ model: 'Intel Core i5' }],
      platform: () => 'linux',
      totalmem: () => 32 * 1024 ** 3,
      freemem: () => 16 * 1024 ** 3,
      release: () => '6.1.0',
      arch: () => 'x64',
    },
    fsPromises: {
      statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }),
      readdir: async () => { throw new Error('no sysfs'); },
    },
    execFileFn: (_command, _args, _options, callback) => callback(new Error('unavailable')),
    comfyStats: {
      devices: [{ name: 'cuda:0 AMD Radeon RX 9070 XT : native', type: 'cuda', vram_total: 16 * 1024 ** 3 }],
    },
  });
  assert.equal(info.gpu.available, true);
  assert.deepEqual(info.gpu.devices, [{
    name: 'AMD Radeon RX 9070 XT',
    memoryBytes: 16 * 1024 ** 3,
    driver: '',
    vendor: 'amd',
    source: 'comfyui',
  }]);
});

test('Advanced Settings presents hardware as one minimal System readout', () => {
  assert.match(server, /route === '\/api\/hardware'/);
  assert.match(server, /getSetupHardwareInfo\(true\)/);
  assert.match(server, /hardwareInfo\(\{ exportPath: settings\.exportDir \|\| DATA, comfyStats \}\)/);
  assert.match(html, /class="settings-group hardware-group"/);
  for (const id of ['hardwareGpu', 'hardwareCpu', 'hardwareMemory', 'hardwareOs', 'hardwareDisk']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="hardwareRefresh"[^>]+aria-label="Refresh hardware information"/);
  assert.match(app, /async function loadHardwareInfo\(force = false\)/);
  assert.match(app, /api\('\/api\/hardware'\)/);
  assert.match(app, /if \(name === 'system'\) loadHardwareInfo\(\)/);
  assert.match(css, /\.hardware-row \{[\s\S]*grid-template-columns: 58px minmax\(0, 1fr\)/);
  assert.match(css, /\.hardware-meter i \{[\s\S]*linear-gradient/);
  assert.match(html, /id="exportDirectory"/);
  assert.match(app, /api\('\/api\/export-location'/);
});
