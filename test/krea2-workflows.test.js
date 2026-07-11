'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKrea2DepthControl, buildKrea2LatentInput } = require('../lib/krea2-workflows');

test('Krea 2 text-to-image keeps the empty latent path', () => {
  const result = buildKrea2LatentInput({ width: 896, height: 1120, batch: 2 });
  assert.equal(result.nodes.latent.class_type, 'EmptySD3LatentImage');
  assert.deepEqual(result.nodes.latent.inputs, { width: 896, height: 1120, batch_size: 2 });
  assert.deepEqual(result.latent, ['latent', 0]);
  assert.equal(result.denoise, 1);
});

test('Krea 2 image-to-image encodes an exactly sized source and applies denoise', () => {
  const result = buildKrea2LatentInput({
    imageName: 'ks_source.png', width: 1024, height: 768, batch: 1, denoise: 0.35,
  });
  assert.equal(result.nodes.source.class_type, 'LoadImage');
  assert.equal(result.nodes.source.inputs.image, 'ks_source.png');
  assert.equal(result.nodes.source_scale.class_type, 'ImageScale');
  assert.equal(result.nodes.source_scale.inputs.width, 1024);
  assert.equal(result.nodes.source_scale.inputs.height, 768);
  assert.equal(result.nodes.source_scale.inputs.crop, 'center');
  assert.equal(result.nodes.latent.class_type, 'VAEEncode');
  assert.deepEqual(result.latent, ['latent', 0]);
  assert.equal(result.denoise, 0.35);
});

test('Krea 2 image-to-image repeats the encoded latent for batches', () => {
  const result = buildKrea2LatentInput({ imageName: 'ks_source.png', batch: 3, denoise: 2 });
  assert.equal(result.nodes.latent_batch.class_type, 'RepeatLatentBatch');
  assert.equal(result.nodes.latent_batch.inputs.amount, 3);
  assert.deepEqual(result.latent, ['latent_batch', 0]);
  assert.equal(result.denoise, 1);
});

test('Krea 2 depth guidance matches the Reddit DA3 control-LoRA workflow', () => {
  const result = buildKrea2DepthControl({
    imageName: 'room.png', loraName: 'depth-control-lora.safetensors',
    latent: ['latent', 0], model: ['user_lora', 0], strength: 0.85,
    depthModel: 'da3_large.safetensors', width: 768, height: 1152,
  });
  assert.equal(result.nodes.depth_model.class_type, 'DownloadAndLoadDepthAnythingV3Model');
  assert.equal(result.nodes.depth_model.inputs.model, 'da3_large.safetensors');
  assert.equal(result.nodes.depth_map.class_type, 'DepthAnything_V3');
  assert.equal(result.nodes.depth_map.inputs.normalization_mode, 'V2-Style');
  assert.deepEqual(result.nodes.depth_map.inputs.images, ['depth_source_scale', 0]);
  assert.equal(result.nodes.depth_source_scale.inputs.width, 768);
  assert.equal(result.nodes.depth_source_scale.inputs.height, 1152);
  assert.deepEqual(result.nodes.depth_encode.inputs.latent, ['latent', 0]);
  assert.equal(result.nodes.depth_encode.inputs.resize, 'match_latent_size');
  assert.equal(result.nodes.depth_encode.inputs.channel_mode, 'rgb');
  assert.equal(result.nodes.depth_encode.inputs.normalize, 'none');
  assert.deepEqual(result.nodes.depth_lora.inputs.model, ['user_lora', 0]);
  assert.equal(result.nodes.depth_lora.inputs.strength, 0.85);
  assert.deepEqual(result.model, ['depth_apply', 0]);
});

test('Krea 2 depth guidance rejects missing required assets', () => {
  assert.throws(() => buildKrea2DepthControl({ loraName: 'depth.safetensors' }), /source image/);
  assert.throws(() => buildKrea2DepthControl({ imageName: 'room.png' }), /Control LoRA/);
});
