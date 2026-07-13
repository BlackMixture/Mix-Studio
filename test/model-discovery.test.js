'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
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
  assert.equal(result.preferredModelsPath, '/comfy/models');
  assert.deepEqual(result.configFiles, ['/comfy/extra_model_paths.yaml']);
});

test('manual model folder remains the preferred destination after discovery', async () => {
  const result = await discoverModels({
    comfyUrl: '',
    comfyPath: 'C:\\ComfyUI',
    modelsPath: 'E:\\Shared Models',
    pathApi: path.win32,
    env: {},
    fsApi: { existsSync: () => false, readFileSync: () => '' },
  });
  assert.equal(result.preferredModelsPath, 'E:\\Shared Models');
});
