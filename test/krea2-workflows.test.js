'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildKrea2LatentInput } = require('../lib/krea2-workflows');

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
