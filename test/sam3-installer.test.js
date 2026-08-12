'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  SAM3_REPO_URL,
  comfyDesktopInstallations,
  findComfyBase,
  findComfyDataBase,
  findPartialComfyBase,
  findComfyPython,
  installSam3,
  isOfficialSam3Remote,
  sam3InstallStatus,
} = require('../lib/sam3-installer');

test('Comfy Desktop registry requires installed status, main.py, and Python before it is ready', () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mix-comfy-registry-'));
  const appData = path.join(temp, 'app-data');
  const installRoot = path.join(temp, 'installations', 'primary');
  const base = path.join(installRoot, 'ComfyUI');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const registryDir = path.join(appData, 'Comfy Desktop');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(path.join(registryDir, 'installations.json'), JSON.stringify([{
    id: 'primary', status: 'installing', installPath: installRoot, sourceId: 'comfyorg', createdAt: '2026-07-21T00:00:00.000Z',
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
    fs.writeFileSync(path.join(registryDir, 'installations.json'), JSON.stringify([{
      id: 'primary', status: 'installed', installPath: installRoot, sourceId: 'comfyorg', createdAt: '2026-07-21T00:00:00.000Z',
    }]));
    fs.rmSync(path.join(base, 'main.py'));
    assert.equal(findComfyBase({}, options), '');
    assert.equal(findPartialComfyBase({}, options), base);
    fs.writeFileSync(path.join(base, 'main.py'), '');
    assert.equal(findComfyBase({}, options), base);
    assert.equal(sam3InstallStatus({}, options).canInstall, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Comfy Desktop adopted bases receive custom nodes instead of the source checkout', () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mix-comfy-adopted-'));
  const appData = path.join(temp, 'app-data');
  const installRoot = path.join(temp, 'desktop-install');
  const sourceBase = path.join(installRoot, 'ComfyUI');
  const adoptedBase = path.join(temp, 'adopted-base');
  const python = path.join(adoptedBase, '.venv', 'Scripts', 'python.exe');
  const registryDir = path.join(appData, 'Comfy Desktop');
  fs.mkdirSync(sourceBase, { recursive: true });
  fs.mkdirSync(path.join(adoptedBase, 'models'), { recursive: true });
  fs.mkdirSync(path.join(adoptedBase, 'custom_nodes'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(path.join(sourceBase, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(path.join(registryDir, 'installations.json'), JSON.stringify([{
    id: 'adopted',
    status: 'installed',
    sourceId: 'comfyorg',
    installPath: installRoot,
    adoptedBaseDir: adoptedBase,
    adoptedPythonPath: python,
  }]));
  const runtime = { comfy: { path: adoptedBase, modelsPath: path.join(adoptedBase, 'models') } };
  const options = { env: { APPDATA: appData }, home: path.join(temp, 'missing'), fsImpl: fs };
  try {
    assert.equal(findComfyBase(runtime, options), sourceBase);
    assert.equal(findComfyDataBase(runtime, options), adoptedBase);
    const status = sam3InstallStatus(runtime, options);
    assert.equal(status.sourcePath, sourceBase);
    assert.equal(status.basePath, adoptedBase);
    assert.equal(status.customNodesPath, path.join(adoptedBase, 'custom_nodes'));
    assert.equal(status.pythonPath, python);
    assert.equal(status.canInstall, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Comfy Desktop registry surfaces an in-progress installation before ComfyUI files exist', () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mix-comfy-installing-'));
  const appData = path.join(temp, 'app-data');
  const installRoot = path.join(temp, 'installations', 'pending');
  const base = path.join(installRoot, 'ComfyUI');
  const registryDir = path.join(appData, 'Comfy Desktop');
  fs.mkdirSync(installRoot, { recursive: true });
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(path.join(registryDir, 'installations.json'), JSON.stringify([{
    id: 'pending', status: 'installing', installPath: installRoot, sourceId: 'comfyorg',
  }]));
  try {
    const options = { env: { APPDATA: appData }, home: path.join(temp, 'missing'), fsImpl: fs };
    assert.equal(findComfyBase({}, options), '');
    assert.equal(findPartialComfyBase({}, options), base);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('SAM3 installer locates the configured ComfyUI base and its private Python', () => {
  const base = path.resolve('/tmp/mixbox-comfy');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const found = new Set([base, path.join(base, 'models'), path.join(base, 'main.py'), python]);
  const existsSync = (file) => found.has(path.resolve(file));
  const runtime = { comfy: { path: base } };
  assert.equal(findComfyBase(runtime, { existsSync, env: {}, home: '/missing' }), base);
  assert.equal(findComfyPython(base, { existsSync, env: {} }), python);
  const status = sam3InstallStatus(runtime, { existsSync, env: {}, home: '/missing' });
  assert.equal(status.canInstall, true);
  assert.equal(status.downloaded, false);
});

test('ComfyUI discovery finds the standard Windows Portable folder in user download locations', () => {
  const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'mix-comfy-portable-discovery-'));
  const home = path.join(temp, 'home');
  const portableRoot = path.join(home, 'Downloads', 'ComfyUI_windows_portable_nvidia');
  const base = path.join(portableRoot, 'ComfyUI');
  const python = path.join(portableRoot, 'python_embeded', 'python.exe');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  try {
    const options = { env: { HOME: home }, home, fsImpl: fs, appRoot: path.join(temp, 'Mix Studio') };
    assert.equal(findComfyBase({ appRoot: options.appRoot }, options), base);
    assert.equal(sam3InstallStatus({ appRoot: options.appRoot }, options).canInstall, true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('SAM3 installer updates a fixed upstream checkout and uses the ComfyUI environment', async () => {
  const base = path.resolve('/tmp/mixbox-comfy');
  const customNodes = path.join(base, 'custom_nodes');
  const nodePath = path.join(customNodes, 'ComfyUI-SAM3');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const requirements = path.join(nodePath, 'requirements.txt');
  const installScript = path.join(nodePath, 'install.py');
  const gitExecutable = path.join(base, 'tools', 'git.exe');
  const found = new Set([base, customNodes, path.join(base, 'models'), path.join(base, 'main.py'), python, nodePath, path.join(nodePath, '.git'), requirements, installScript]);
  const existsSync = (file) => found.has(path.resolve(file));
  const calls = [];
  const fsImpl = {
    existsSync,
    mkdirSync() {},
    readFileSync: fs.readFileSync,
  };
  const result = await installSam3({ comfy: { path: base }, update: { gitExecutable } }, {
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
  assert.equal(calls[0].command, gitExecutable);
  assert.equal(calls[1].command, gitExecutable);
  assert.equal(calls[2].command, python);
  assert.equal(SAM3_REPO_URL, 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git');
  assert.equal(isOfficialSam3Remote('git@github.com:PozzettiAndrea/ComfyUI-SAM3.git'), true);
  assert.equal(isOfficialSam3Remote('https://github.com/someone/other.git'), false);
});
