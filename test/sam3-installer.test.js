'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  SAM3_REPO_URL,
  comfyDesktopInstallations,
  findComfyBase,
  findPartialComfyBase,
  findComfyPython,
  installSam3,
  isOfficialSam3Remote,
  sam3InstallStatus,
} = require('../lib/sam3-installer');

test('Comfy Desktop registry prefers initialized installations and reports partial ones separately', () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mix-comfy-registry-'));
  const appData = path.join(temp, 'app-data');
  const installRoot = path.join(temp, 'installations', 'primary');
  const base = path.join(installRoot, 'ComfyUI');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const registryDir = path.join(appData, 'Comfy Desktop');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(path.join(registryDir, 'installations.json'), JSON.stringify([{
    id: 'primary', installPath: installRoot, sourceId: 'comfyorg', createdAt: '2026-07-21T00:00:00.000Z',
  }]));
  const options = { env: { APPDATA: appData }, home: path.join(temp, 'missing'), fsImpl: fs };
  try {
    assert.equal(comfyDesktopInstallations(options.env, fs, path).length, 1);
    assert.equal(findComfyBase({}, options), '');
    assert.equal(findPartialComfyBase({}, options), base);
    const partial = sam3InstallStatus({}, options);
    assert.equal(partial.basePath, '');
    assert.equal(partial.partialPath, base);
    assert.match(partial.reason, /incomplete ComfyUI installation/i);
    fs.mkdirSync(path.dirname(python), { recursive: true });
    fs.writeFileSync(python, '');
    assert.equal(findComfyBase({}, options), base);
    assert.equal(sam3InstallStatus({}, options).canInstall, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('SAM3 installer locates the configured ComfyUI base and its private Python', () => {
  const base = path.resolve('/tmp/mixbox-comfy');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const found = new Set([base, path.join(base, 'models'), python]);
  const existsSync = (file) => found.has(path.resolve(file));
  const runtime = { comfy: { path: base } };
  assert.equal(findComfyBase(runtime, { existsSync, env: {}, home: '/missing' }), base);
  assert.equal(findComfyPython(base, { existsSync, env: {} }), python);
  const status = sam3InstallStatus(runtime, { existsSync, env: {}, home: '/missing' });
  assert.equal(status.canInstall, true);
  assert.equal(status.downloaded, false);
});

test('SAM3 installer updates a fixed upstream checkout and uses the ComfyUI environment', async () => {
  const base = path.resolve('/tmp/mixbox-comfy');
  const customNodes = path.join(base, 'custom_nodes');
  const nodePath = path.join(customNodes, 'ComfyUI-SAM3');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const requirements = path.join(nodePath, 'requirements.txt');
  const installScript = path.join(nodePath, 'install.py');
  const found = new Set([base, customNodes, path.join(base, 'models'), python, nodePath, path.join(nodePath, '.git'), requirements, installScript]);
  const existsSync = (file) => found.has(path.resolve(file));
  const calls = [];
  const fsImpl = {
    existsSync,
    mkdirSync() {},
    readFileSync: fs.readFileSync,
  };
  const result = await installSam3({ comfy: { path: base } }, {
    existsSync,
    fsImpl,
    env: {},
    home: '/missing',
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return args.includes('get-url') ? SAM3_REPO_URL : '';
    },
  });
  assert.equal(result.restartRequired, true);
  assert.deepEqual(calls[0].args, ['-C', nodePath, 'remote', 'get-url', 'origin']);
  assert.deepEqual(calls[1].args, ['-C', nodePath, 'pull', '--ff-only']);
  assert.deepEqual(calls[2].args, ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', '-r', requirements]);
  assert.deepEqual(calls[3].args, [installScript]);
  assert.equal(calls[2].command, python);
  assert.equal(SAM3_REPO_URL, 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git');
  assert.equal(isOfficialSam3Remote('git@github.com:PozzettiAndrea/ComfyUI-SAM3.git'), true);
  assert.equal(isOfficialSam3Remote('https://github.com/someone/other.git'), false);
});
