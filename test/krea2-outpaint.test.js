'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildKrea2OutpaintGraph,
  calculateOutpaintLayout,
  calculateOutpaintPadding,
  normalizeOutpaintDimensions,
} = require('../lib/krea2-outpaint');

test('outpaint padding expands the correct axis and respects source placement', () => {
  assert.deepEqual(calculateOutpaintPadding({
    sourceWidth: 1200, sourceHeight: 800, targetWidth: 16, targetHeight: 9, position: 'center',
  }), { left: 111, top: 0, right: 112, bottom: 0, axis: 'horizontal', position: 'center' });
  assert.deepEqual(calculateOutpaintPadding({
    sourceWidth: 800, sourceHeight: 1200, targetWidth: 9, targetHeight: 16, position: 'start',
  }), { left: 0, top: 0, right: 0, bottom: 223, axis: 'vertical', position: 'start' });
  assert.throws(() => calculateOutpaintPadding({
    sourceWidth: 1200, sourceHeight: 800, targetWidth: 3, targetHeight: 2,
  }), /adds canvas/);
});

test('outpaint can resize and position the source inside the output canvas', () => {
  assert.deepEqual(calculateOutpaintLayout({
    sourceWidth: 800, sourceHeight: 1200, targetWidth: 1344, targetHeight: 768, position: 'end', scale: .75,
  }), {
    sourceWidth: 384,
    sourceHeight: 576,
    padding: { left: 960, top: 96, right: 0, bottom: 96, axis: 'horizontal', position: 'end' },
  });
});

test('outpaint generation stays at or below the recommended two megapixels', () => {
  const dimensions = normalizeOutpaintDimensions(4000, 3000);
  assert.ok(dimensions.width * dimensions.height <= 2_000_000);
  assert.equal(dimensions.width % 16, 0);
  assert.equal(dimensions.height % 16, 0);
});

test('Krea 2 outpaint follows the grounded identity-edit workflow', () => {
  const graph = buildKrea2OutpaintGraph({
    settings: {
      unet: 'krea2_turbo.safetensors',
      clip: 'qwen3vl.safetensors',
      clipType: 'krea2',
      vae: 'qwen_image_vae.safetensors',
      krea2OutpaintLora: 'krea2_identity_edit_v1_1_r128.safetensors',
    },
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding: { left: 0, top: 0, right: 220, bottom: 0 },
    editOutpaintSourceWidth: 576,
    editOutpaintSourceHeight: 768,
    composite: true,
    prompt: 'Continue the room naturally into the new space.',
    seed: 42,
    batch: 2,
    loras: [{ name: 'style.safetensors', strength: 0.7, on: true }],
  });
  assert.equal(graph.identity_lora.class_type, 'LoraLoaderModelOnly');
  assert.equal(graph.identity_lora.inputs.strength_model, 1);
  assert.equal(graph.padded.class_type, 'ImagePadForOutpaint');
  assert.equal(graph.padded.inputs.right, 220);
  assert.deepEqual(graph.padded.inputs.image, ['resized_source', 0]);
  assert.equal(graph.resized_source.inputs.width, 576);
  assert.deepEqual(graph.source_latent.inputs.pixels, ['scaled_source', 0]);
  assert.deepEqual(graph.positive.inputs.image, ['source', 0]);
  assert.equal(graph.positive.inputs.grounding_px, 768);
  assert.equal(graph.model_patch.class_type, 'Krea2EditModelPatch');
  assert.deepEqual(graph.model_patch.inputs.model, ['user_lora_1', 0]);
  assert.equal(graph.sampler.inputs.steps, 8);
  assert.equal(graph.sampler.inputs.cfg, 1);
  assert.equal(graph.sampler.inputs.scheduler, 'simple');
  assert.equal(graph.latent.inputs.batch_size, 2);
  assert.equal(graph.preserve_source.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.preserve_source.inputs.source, ['resized_source', 0]);
  assert.deepEqual(graph.save.inputs.images, ['preserve_source', 0]);
});
