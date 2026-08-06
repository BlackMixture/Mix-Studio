'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseComfyStatsDevices,
  parseNvidiaGpuCsv,
  parseRocmSmiJson,
  parseWindowsGpuJson,
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
    { name: 'NVIDIA GeForce RTX 5090', memoryBytes: 32607 * 1024 * 1024, driver: '576.80', vendor: 'nvidia', backend: 'cuda' },
    { name: 'NVIDIA RTX A6000', memoryBytes: 49140 * 1024 * 1024, driver: '576.80', vendor: 'nvidia', backend: 'cuda' },
  ]);
});

test('reads Apple Metal identity from ComfyUI system stats', () => {
  assert.deepEqual(parseComfyStatsDevices({ devices: [{
    name: 'mps:0 Apple M4 Max', type: 'mps', vram_total: 64 * 1024 ** 3,
  }] }), [{
    name: 'Apple M4 Max', memoryBytes: 64 * 1024 ** 3, memoryKind: 'unified',
    driver: '', vendor: 'apple', backend: 'mps', source: 'comfyui',
  }]);
});

test('parses AMD ROCm identity and filters unsupported Windows display adapters', () => {
  assert.deepEqual(parseRocmSmiJson(JSON.stringify({
    card0: {
      'Card Series': 'AMD Radeon RX 6800',
      'VRAM Total Memory (B)': '17179869184',
      'GFX Version': 'gfx1030',
    },
  })), [{
    name: 'AMD Radeon RX 6800', memoryBytes: 17179869184, driver: '',
    vendor: 'amd', backend: 'rocm', arch: 'gfx1030',
  }]);
  assert.deepEqual(parseWindowsGpuJson(JSON.stringify([
    { name: 'AMD Radeon RX 7900 XTX', memoryBytes: 24 * 1024 ** 3, driver: '32.0' },
    { name: 'Intel Arc A770', memoryBytes: 16 * 1024 ** 3, driver: '31.0' },
    { name: 'Microsoft Basic Display Adapter', memoryBytes: 4 * 1024 ** 3, driver: '' },
  ])), [{
    name: 'AMD Radeon RX 7900 XTX', memoryBytes: 24 * 1024 ** 3, driver: '32.0',
    vendor: 'amd', backend: 'rocm',
  }]);
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
    backend: 'mps',
  }]);
});

test('connected ComfyUI hardware stays authoritative over the local display GPU', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    comfyStats: { devices: [{
      name: 'hip:0 AMD Radeon RX 7900 XTX', type: 'hip', vram_total: 24 * 1024 ** 3,
    }] },
    osModule: {
      cpus: () => [{ model: 'Local CPU' }], platform: () => 'linux',
      totalmem: () => 32 * 1024 ** 3, freemem: () => 20 * 1024 ** 3,
      release: () => '6.8', arch: () => 'x64',
    },
    fsPromises: { statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }) },
    execFileFn: (_command, _args, _options, callback) => callback(null, 'NVIDIA Local GPU, 24576, 999.0'),
  });
  assert.equal(info.gpu.devices[0].vendor, 'amd');
  assert.equal(info.gpu.devices[0].source, 'comfyui');
  assert.equal(info.gpu.devices[0].driver, '');
});

test('connected NVIDIA identity keeps the local driver needed for CUDA compatibility guidance', async () => {
  const info = await hardwareInfo({
    exportPath: '/exports',
    comfyStats: { devices: [{
      name: 'cuda:0 NVIDIA RTX PRO 6000 Blackwell', type: 'cuda', vram_total: 96 * 1024 ** 3,
    }] },
    osModule: {
      cpus: () => [{ model: 'Local CPU' }], platform: () => 'win32',
      totalmem: () => 128 * 1024 ** 3, freemem: () => 64 * 1024 ** 3,
      release: () => '10.0', version: () => 'Windows 11', arch: () => 'x64',
    },
    fsPromises: { statfs: async () => ({ bsize: 4096, bavail: 100, blocks: 400 }) },
    execFileFn: (_command, _args, _options, callback) => callback(null, 'NVIDIA RTX PRO 6000 Blackwell, 97887, 596.36'),
  });
  assert.equal(info.gpu.devices[0].name, 'NVIDIA RTX PRO 6000 Blackwell');
  assert.equal(info.gpu.devices[0].source, 'comfyui');
  assert.equal(info.gpu.devices[0].driver, '596.36');
});

test('Preferences presents hardware as one minimal System readout', () => {
  assert.match(server, /route === '\/api\/hardware'/);
  assert.match(server, /h3PerformanceReport\(\{ hardware, runtime: performanceRuntime, models: settings \}\)/);
  assert.match(html, /class="settings-group hardware-group"/);
  for (const id of ['hardwareGpu', 'hardwareCpu', 'hardwareMemory', 'hardwareOs', 'hardwareDisk', 'hardwareRuntime', 'hardwareH3']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="hardwareRefresh"[^>]+aria-label="Refresh hardware information"/);
  assert.match(app, /async function loadHardwareInfo\(force = false\)/);
  assert.match(app, /api\(force \? '\/api\/hardware\?refresh=1' : '\/api\/hardware'\)/);
  assert.match(app, /if \(name === 'system'\) loadHardwareInfo\(\)/);
  assert.match(css, /\.hardware-row \{[\s\S]*grid-template-columns: 58px minmax\(0, 1fr\)/);
  assert.match(css, /\.hardware-meter i \{[\s\S]*linear-gradient/);
  assert.match(html, /id="runtimeRecommendation"[^>]+data-state="checking"/);
  assert.match(css, /\.runtime-recommendation\[data-state="active"\]/);
  assert.match(html, /id="exportDirectory"/);
  assert.match(app, /api\('\/api\/export-location'/);
});
