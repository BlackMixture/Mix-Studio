'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseNvidiaGpuCsv,
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
    { name: 'NVIDIA GeForce RTX 5090', memoryBytes: 32607 * 1024 * 1024, driver: '576.80' },
    { name: 'NVIDIA RTX A6000', memoryBytes: 49140 * 1024 * 1024, driver: '576.80' },
  ]);
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
  }]);
});

test('Advanced Settings presents hardware as one minimal System readout', () => {
  assert.match(server, /route === '\/api\/hardware'/);
  assert.match(server, /hardwareInfo\(\{ exportPath: settings\.exportDir \|\| DATA \}\)/);
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
