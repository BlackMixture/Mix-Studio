'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_IDENTITY_EDIT_PIXELS,
  buildKrea2IdentityEditGraph,
  normalizeIdentityEditDimensions,
} = require('../lib/krea2-identity-edit');

const settings = {
  unet: 'krea2_turbo_fp8_scaled.safetensors',
  clip: 'qwen3vl_4b_fp8_scaled.safetensors',
  clipType: 'krea2',
  vae: 'qwen_image_vae.safetensors',
  krea2OutpaintLora: 'krea2_identity_edit_v1_2.safetensors',
};

test('identity edit uses the v1.2 dual-conditioning pixel path', () => {
  const graph = buildKrea2IdentityEditGraph({
    settings,
    refNames: ['scene.png', 'person.png', 'ignored.png'],
    prompt: 'Place this person beside the tractor.',
    width: 1344,
    height: 768,
    seed: 12,
    steps: 10,
    batch: 2,
    krea2RefBoost: 4,
    loras: [{ name: 'style.safetensors', strength: 0.7, on: true }],
  });

  assert.equal(graph.identity_lora.inputs.lora_name, 'krea2_identity_edit_v1_2.safetensors');
  assert.equal(graph.identity_lora.inputs.strength_model, 1);
  assert.deepEqual(graph.model_patch.inputs.model, ['user_lora_1', 0]);
  assert.deepEqual(graph.model_patch.inputs.source_latent, ['source_latent', 0]);
  assert.deepEqual(graph.model_patch.inputs.source_latent_b, ['source_latent_b', 0]);
  assert.deepEqual(graph.model_patch.inputs.vae, ['vae', 0]);
  assert.deepEqual(graph.model_patch.inputs.source_image, ['source', 0]);
  assert.deepEqual(graph.model_patch.inputs.source_image_b, ['source_b', 0]);
  assert.equal(graph.model_patch.inputs.fit_mode, 'fit');
  assert.equal(graph.model_patch.inputs.ref_boost, 4);
  assert.equal(graph.model_patch.inputs.ref_boost_a, 1);
  assert.deepEqual(graph.positive.inputs.image_b, ['source_b', 0]);
  assert.deepEqual(graph.negative.inputs.image_b, ['source_b', 0]);
  assert.equal(graph.negative.inputs.prompt, '');
  assert.equal(graph.positive.inputs.grounding_px, 768);
  assert.equal(graph.sampler.inputs.steps, 10);
  assert.equal(graph.sampler.inputs.cfg, 1);
  assert.equal(graph.sampler.inputs.scheduler, 'simple');
  assert.equal(graph.latent.inputs.batch_size, 2);
  assert.equal(graph.source_b.inputs.image, 'person.png');
  assert.equal(graph.source_latent_b.inputs.pixels[0], 'source_b');
});

test('identity edit supports one source, clamps fidelity, and requires its LoRA', () => {
  const graph = buildKrea2IdentityEditGraph({
    settings,
    refNames: ['source.png'],
    width: 1024,
    height: 1024,
    krea2RefBoost: 99,
    steps: 4,
    loras: [{ name: 'krea2_identity_edit_v1_2.safetensors', strength: 0.9, on: true }],
  });
  assert.equal(graph.model_patch.inputs.ref_boost, 20);
  assert.equal(graph.model_patch.inputs.source_latent_b, undefined);
  assert.equal(graph.positive.inputs.image_b, undefined);
  assert.equal(graph.identity_lora.inputs.strength_model, 0.9);
  assert.equal(graph.user_lora_1, undefined);
  assert.equal(graph.sampler.inputs.steps, 8);

  assert.throws(() => buildKrea2IdentityEditGraph({
    settings,
    refNames: ['source.png'],
    loras: [{ name: 'krea2_identity_edit_v1_2.safetensors', strength: 1, on: false }],
  }), /needs the Identity Edit LoRA enabled/);
});

test('identity edit dimensions remain aligned and at or below two megapixels', () => {
  const dimensions = normalizeIdentityEditDimensions(4096, 3072);
  assert.ok(dimensions.width * dimensions.height <= MAX_IDENTITY_EDIT_PIXELS);
  assert.equal(dimensions.width % 16, 0);
  assert.equal(dimensions.height % 16, 0);
});
