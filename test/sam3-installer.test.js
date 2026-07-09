'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const {
  SAM3_REPO_URL,
  findComfyBase,
  findComfyPython,
  installSam3,
  isOfficialSam3Remote,
  sam3InstallStatus,
} = require('../lib/sam3-installer');

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
  assert.deepEqual(calls[2].args, ['-m', 'pip', 'install', '--upgrade', '-r', requirements]);
  assert.deepEqual(calls[3].args, [installScript]);
  assert.equal(calls[2].command, python);
  assert.equal(SAM3_REPO_URL, 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git');
  assert.equal(isOfficialSam3Remote('git@github.com:PozzettiAndrea/ComfyUI-SAM3.git'), true);
  assert.equal(isOfficialSam3Remote('https://github.com/someone/other.git'), false);
});
