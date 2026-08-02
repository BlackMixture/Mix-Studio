'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  candidateConfigFiles,
  collectRegisteredModelNames,
  discoverModels,
  parseExtraModelPaths,
} = require('../installer/model-discovery');

test('collects model filenames from legacy and DynamicCombo ComfyUI inputs', () => {
  const names = collectRegisteredModelNames({
    UNETLoader: { input: { required: { unet_name: [['krea.safetensors', 'flux.gguf'], {}], weight_dtype: [['default', 'fp8'], {}] } } },
    LoraLoader: { input: { optional: { lora_name: ['COMBO', { options: ['styles\\film.safetensors', 'None'] }] } } },
  });
  assert.deepEqual(names, ['flux.gguf', 'krea.safetensors', 'styles\\film.safetensors']);
});

test('discovers a standard ComfyUI models root from extra_model_paths yaml', () => {
  const parsed = parseExtraModelPaths(`
shared:
  base_path: D:\\AI\\ComfyUI
  diffusion_models: models\\diffusion_models
  loras: models\\loras
`, { configDir: 'C:\\ComfyUI', pathApi: path.win32, env: {} });
  assert.deepEqual(parsed.roots, ['D:\\AI\\ComfyUI\\models']);
});

test('infers a shared custom model root when configured folders have one ancestor', () => {
  const parsed = parseExtraModelPaths(`
shared:
  base_path: D:\\AI\\Models
  checkpoints: Stable-diffusion
  loras: Lora
`, { configDir: 'C:\\ComfyUI', pathApi: path.win32, env: {} });
  assert.ok(parsed.roots.includes('D:\\AI\\Models'));
});

test('reads the quoted keys and block scalars Comfy Desktop writes', () => {
  const parsed = parseExtraModelPaths(`
comfy.desktop_0:
  base_path: 'C:\\diffusion\\models'
  'checkpoints': 'checkpoints/'
  'controlnet': |-
    controlnet/
    t2i_adapter/
`, { configDir: 'C:\\ComfyUI', pathApi: path.win32, env: {} });
  assert.deepEqual(parsed.roots, ['C:\\diffusion\\models']);
  assert.ok(parsed.configuredPaths.includes('C:\\diffusion\\models\\t2i_adapter'));
});

test('scans Comfy Desktop shared model configs on every supported platform', () => {
  const windows = candidateConfigFiles('C:\\ComfyUI', { APPDATA: 'C:\\Roaming' }, path.win32, 'win32');
  assert.ok(windows.includes('C:\\Roaming\\Comfy Desktop\\shared_model_paths.yaml'));
  const linux = candidateConfigFiles('/opt/ComfyUI', { HOME: '/home/mix' }, path.posix, 'linux', '/home/mix');
  assert.ok(linux.includes('/home/mix/.config/Comfy Desktop/shared_model_paths.yaml'));
  const mac = candidateConfigFiles('/Applications/ComfyUI', { HOME: '/Users/mix' }, path.posix, 'darwin', '/Users/mix');
  assert.ok(mac.includes('/Users/mix/Library/Application Support/Comfy Desktop/shared_model_paths.yaml'));
});

test('combines ComfyUI registry discovery with existing model roots', async () => {
  const files = new Map([
    ['/comfy/extra_model_paths.yaml', 'shared:\n  base_path: /shared\n  checkpoints: models/checkpoints\n  loras: models/loras\n'],
  ]);
  const existing = new Set(['/comfy/models', '/comfy/extra_model_paths.yaml', '/shared/models']);
  const result = await discoverModels({
    comfyUrl: 'http://127.0.0.1:8188',
    comfyPath: '/comfy',
    pathApi: path.posix,
    env: {},
    fsApi: {
      existsSync: (file) => existing.has(file),
      readFileSync: (file) => files.get(file),
    },
    fetchFn: async () => ({
      ok: true,
      json: async () => ({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['existing.safetensors'], {}] } } } }),
    }),
  });
  assert.equal(result.registeredModelCount, 1);
  assert.deepEqual(result.registeredModelNames, ['existing.safetensors']);
  assert.deepEqual(result.modelRoots, ['/comfy/models', '/shared/models']);
  assert.equal(result.preferredModelsPath, '/shared/models');
  assert.deepEqual(result.configFiles, ['/comfy/extra_model_paths.yaml']);
});

test('prefers a reachable Desktop 2 shared-model destination over the checkout models folder', async () => {
  const files = new Map([
    ['/home/mix/.config/comfyui-desktop-2/settings.json', JSON.stringify({ modelsDirs: ['/shared/models'] })],
  ]);
  const existing = new Set(['/comfy/models', '/shared/models', ...files.keys()]);
  const result = await discoverModels({
    comfyUrl: '', comfyPath: '/comfy', pathApi: path.posix, platform: 'linux', home: '/home/mix', env: { HOME: '/home/mix' },
    fsApi: { existsSync: (file) => existing.has(file), readFileSync: (file) => files.get(file) },
  });
  assert.equal(result.preferredModelsPath, '/shared/models');
  assert.deepEqual(result.modelRoots, ['/comfy/models', '/shared/models']);
});

test('prefers a populated external library over an empty built-in model tree', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-model-discovery-'));
  const comfy = path.join(temp, 'ComfyUI');
  const builtIn = path.join(comfy, 'models');
  const shared = path.join(temp, 'shared-models');
  const sharedCheckpoints = path.join(shared, 'checkpoints');
  fs.mkdirSync(builtIn, { recursive: true });
  fs.mkdirSync(sharedCheckpoints, { recursive: true });
  fs.writeFileSync(path.join(sharedCheckpoints, 'krea-model.safetensors'), 'fixture');
  fs.writeFileSync(path.join(comfy, 'extra_model_paths.yaml'), `shared:\n  base_path: ${shared}\n  checkpoints: checkpoints\n`);
  try {
    const result = await discoverModels({ comfyUrl: '', comfyPath: comfy });
    assert.deepEqual(result.populatedModelRoots, [shared]);
    assert.equal(result.preferredModelsPath, shared);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('manual model folder remains the preferred destination and a searchable root after discovery', async () => {
  const result = await discoverModels({
    comfyUrl: '',
    comfyPath: 'C:\\ComfyUI',
    modelsPath: 'E:\\Shared Models',
    pathApi: path.win32,
    env: {},
    fsApi: { existsSync: (file) => file === 'E:\\Shared Models', readFileSync: () => '' },
  });
  assert.equal(result.preferredModelsPath, 'E:\\Shared Models');
  assert.deepEqual(result.modelRoots, ['E:\\Shared Models']);
});
