'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyLora,
  compatibleCategoriesForContext,
  loraCompatibilityWarning,
} = require('../lib/lora-compat');

test('classifies Krea2 LoRAs from metadata and key samples', () => {
  assert.equal(classifyLora({
    name: 'nathan_likeness_krea2 3500.safetensors',
    metadata: { ss_base_model_version: 'krea2' },
    keys: ['diffusion_model.blocks.0.attn.wq.lora_A.weight'],
  }), 'krea2');
});

test('classifies Klein 9B LoRAs from metadata and filename hints', () => {
  assert.equal(classifyLora({
    name: 'portrait-klein-9b.safetensors',
    metadata: { ss_base_model_version: 'flux2_klein_9b' },
    keys: ['diffusion_model.double_blocks.0.img_attn.proj.lokr_w1'],
  }), 'klein9');
});

test('classifies Qwen edit LoRAs from key patterns', () => {
  assert.equal(classifyLora({
    name: 'qwen_image_edit_2511_multiple-angles-lora.safetensors',
    metadata: {},
    keys: ['transformer.transformer_blocks.0.attn.add_k_proj.lora_A.weight'],
  }), 'qwen-edit');
});

test('unknown LoRAs are allowed by context filters', () => {
  assert.equal(classifyLora({ name: 'mystery.safetensors', metadata: {}, keys: [] }), 'unknown');
  assert.deepEqual(compatibleCategoriesForContext('edit', 'klein9'), ['klein9', 'unknown']);
});

test('warning lists incompatible selected LoRAs', () => {
  const warning = loraCompatibilityWarning(
    [{ name: 'nathan.safetensors', on: true }],
    { 'nathan.safetensors': { category: 'krea2' } },
    'edit',
    'qwen'
  );
  assert.match(warning, /nathan/);
});
