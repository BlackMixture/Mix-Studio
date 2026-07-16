'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { diffusionModelInput, diffusionModelLoader, isGgufModel } = require('../lib/model-loader');

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
