'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { resolveRuntimeConfig, publicRuntimeConfig } = require('../lib/runtime-config');

function fakeFs(files = {}) {
  const normalized = new Map(Object.entries(files).map(([file, value]) => [path.resolve(file), value]));
  return {
    existsSync: (file) => normalized.has(path.resolve(file)),
    readFileSync: (file) => {
      const value = normalized.get(path.resolve(file));
      if (value === undefined) throw new Error('missing');
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

test('source installs keep the legacy data folder and Git updater by default', () => {
  const root = path.resolve('/work/mixbox');
  const io = fakeFs({ [path.join(root, '.git')]: true });
  const runtime = resolveRuntimeConfig(root, { env: {}, ...io });
  assert.equal(runtime.installMode, 'source');
  assert.equal(runtime.dataDir, path.join(root, 'data'));
  assert.equal(runtime.update.provider, 'git');
  assert.equal(runtime.configFile, null);
});

test('portable install metadata can reuse an existing ComfyUI and shared models', () => {
  const root = path.resolve('/apps/Mix Studio');
  const installFile = path.join(root, 'install.json');
  const io = fakeFs({
    [installFile]: {
      schemaVersion: 1,
      installMode: 'portable',
      dataDir: 'data',
      update: { provider: 'git', channel: 'main' },
      comfy: { mode: 'external', path: 'D:/AI/ComfyUI', modelsPath: 'E:/SharedModels', url: 'http://127.0.0.1:8188' },
    },
    [path.join(root, '.git')]: true,
  });
  const runtime = resolveRuntimeConfig(root, { env: {}, ...io });
  assert.equal(runtime.installMode, 'portable');
  assert.equal(runtime.dataDir, path.resolve(root, 'data'));
  assert.equal(runtime.update.provider, 'git');
  assert.equal(runtime.update.channel, 'main');
  assert.equal(runtime.comfy.path, path.resolve(root, 'D:/AI/ComfyUI'));
  assert.equal(runtime.comfy.modelsPath, path.resolve(root, 'E:/SharedModels'));
  assert.deepEqual(publicRuntimeConfig(runtime).update, runtime.update);
});

test('environment overrides let a launcher choose data and shared models explicitly', () => {
  const root = path.resolve('/work/mixbox');
  const runtime = resolveRuntimeConfig(root, {
    env: {
      MIXBOX_DATA_DIR: '/persistent/profile-data',
      MIXBOX_UPDATE_CHANNEL: 'main',
      COMFYUI_PATH: '/ai/ComfyUI',
      COMFYUI_MODELS_DIR: '/ai/shared-models',
    },
    ...fakeFs({}),
  });
  assert.equal(runtime.dataDir, path.resolve('/persistent/profile-data'));
  assert.equal(runtime.update.provider, 'unavailable');
  assert.equal(runtime.comfy.path, path.resolve('/ai/ComfyUI'));
  assert.equal(runtime.comfy.modelsPath, path.resolve('/ai/shared-models'));
});

test('a portable copy without Git clearly reports updates as unavailable', () => {
  const root = path.resolve('/copied/mixbox');
  const installFile = path.join(root, 'install.json');
  const runtime = resolveRuntimeConfig(root, {
    env: {},
    ...fakeFs({ [installFile]: { installMode: 'portable', dataDir: 'data' } }),
  });
  assert.equal(runtime.update.provider, 'unavailable');
});
