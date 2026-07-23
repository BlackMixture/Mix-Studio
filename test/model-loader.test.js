'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  diffusionModelInput,
  diffusionModelLoader,
  isGgufModel,
  registeredModelNames,
  resolveRegisteredModelName,
} = require('../lib/model-loader');

const root = path.join(__dirname, '..');

test('diffusion model loader selects the node required by the file format', () => {
  assert.equal(isGgufModel('Wan\\high-noise-Q4_K_S.GGUF'), true);
  assert.deepEqual(diffusionModelLoader('model.safetensors'), {
    class_type: 'UNETLoader',
    inputs: { unet_name: 'model.safetensors', weight_dtype: 'default' },
  });
  assert.deepEqual(diffusionModelLoader('model-q4_k_s.gguf'), {
    class_type: 'UnetLoaderGGUF',
    inputs: { unet_name: 'model-q4_k_s.gguf' },
  });
  assert.deepEqual(diffusionModelInput('model.gguf'), {
    className: 'UnetLoaderGGUF', field: 'unet_name',
  });
});

test('registered model paths resolve unique subfoldered basenames', () => {
  const names = registeredModelNames({
    UNETLoader: { input: { required: { unet_name: [['krea\\krea2.safetensors'], {}] } } },
    LoraLoader: { input: { required: { lora_name: ['COMBO', { options: ['Krea\\turbo.safetensors'] }] } } },
  });
  assert.deepEqual(names, ['krea\\krea2.safetensors', 'Krea\\turbo.safetensors']);
  assert.equal(resolveRegisteredModelName('krea2.safetensors', names), 'krea\\krea2.safetensors');
  assert.equal(resolveRegisteredModelName('KREA/turbo.safetensors', names), 'Krea\\turbo.safetensors');
  assert.equal(resolveRegisteredModelName('missing.safetensors', names), '');
});

test('ambiguous duplicate basenames are not selected automatically', () => {
  const names = ['first\\shared.safetensors', 'second/shared.safetensors'];
  assert.equal(resolveRegisteredModelName('shared.safetensors', names), '');
  assert.equal(resolveRegisteredModelName('second/shared.safetensors', names), 'second/shared.safetensors');
});

test('image and video graph builders route configured GGUF models through UnetLoaderGGUF', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const outpaint = fs.readFileSync(path.join(root, 'lib', 'edit-outpaint-workflows.js'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8');
  assert.match(server, /graph\.high = diffusionModelLoader\(settings\.wanHighUnet\)/);
  assert.match(server, /graph\.unet = diffusionModelLoader\(settings\.scailUnet\)/);
  assert.match(server, /graph\.unet = diffusionModelLoader\(settings\.qwenEditUnet\)/);
  assert.match(outpaint, /unet: diffusionModelLoader\(params\.unetName\)/);
  assert.match(installer, /https:\/\/github\.com\/city96\/ComfyUI-GGUF\.git/);
});
