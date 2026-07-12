'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildKrea2OutpaintGraph,
  calculateNativeOutpaintPlan,
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

test('native preserve keeps a 1000px square source and creates a true 2000px canvas at 50 percent', () => {
  const plan = calculateNativeOutpaintPlan({
    sourceWidth: 1000, sourceHeight: 1000, targetWidth: 1024, targetHeight: 1024,
    position: 'center', scale: .5,
  });
  assert.equal(plan.workingWidth, 1408);
  assert.equal(plan.workingHeight, 1408);
  assert.equal(plan.workingSourceWidth, 704);
  assert.equal(plan.workingSourceHeight, 704);
  assert.equal(plan.finalWidth, 2000);
  assert.equal(plan.finalHeight, 2000);
  assert.deepEqual(plan.finalPadding, {
    left: 500, top: 500, right: 500, bottom: 500, axis: 'horizontal', position: 'center',
  });
  assert.equal(plan.effectiveScale, .5);
  assert.equal(plan.needsRefine, true);
});

test('native preserve keeps asymmetric working placement registered to the final source', () => {
  const plan = calculateNativeOutpaintPlan({
    sourceWidth: 1001, sourceHeight: 667, targetWidth: 1600, targetHeight: 900,
    position: 'end', scale: .55,
  });
  const scaleX = plan.finalWidth / plan.workingWidth;
  const scaleY = plan.finalHeight / plan.workingHeight;
  assert.ok(Math.abs(plan.workingSourceWidth * scaleX - plan.finalSourceWidth) <= scaleX);
  assert.ok(Math.abs(plan.workingSourceHeight * scaleY - plan.finalSourceHeight) <= scaleY);
  assert.ok(Math.abs(plan.workingPadding.left * scaleX - plan.finalPadding.left) <= scaleX);
  assert.ok(Math.abs(plan.workingPadding.top * scaleY - plan.finalPadding.top) <= scaleY);
  assert.equal(plan.workingPadding.right, 0);
  assert.equal(plan.finalPadding.right, 0);
});

test('Krea 2 outpaint follows the grounded identity-edit workflow', () => {
  const graph = buildKrea2OutpaintGraph({
    settings: {
      unet: 'krea2_turbo.safetensors',
      clip: 'qwen3vl.safetensors',
      clipType: 'krea2',
      vae: 'qwen_image_vae.safetensors',
      krea2OutpaintLora: 'krea2_identity_edit_v1_1_r128.safetensors',
      seedvr2Dit: 'seedvr2.safetensors',
      seedvr2Vae: 'seedvr2-vae.safetensors',
    },
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding: { left: 0, top: 0, right: 220, bottom: 0 },
    editOutpaintSourceWidth: 576,
    editOutpaintSourceHeight: 768,
    editOutpaintFinalWidth: 2400,
    editOutpaintFinalHeight: 1360,
    editOutpaintFinalSourceWidth: 1200,
    editOutpaintFinalSourceHeight: 800,
    editOutpaintFinalPadding: { left: 600, top: 280, right: 600, bottom: 280 },
    editOutpaintRefine: true,
    editOutpaintRefineProfile: 'balanced',
    editOutpaintRefineNoise: 'low',
    seedVr2Models: ['seedvr2.safetensors'],
    composite: true,
    prompt: 'Continue the room naturally into the new space.',
    seed: 34003458455767,
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
  assert.equal(graph.color_match.class_type, 'ColorMatch');
  assert.equal(graph.outpaint_refine.class_type, 'SeedVR2VideoUpscaler');
  assert.equal(graph.outpaint_refine.inputs.seed, 202373335);
  assert.equal(graph.outpaint_refine_vae.inputs.decode_tiled, true);
  assert.equal(graph.final_scale.inputs.width, 2400);
  assert.equal(graph.color_match_final.class_type, 'ColorMatch');
  assert.equal(graph.native_keep_mask.class_type, 'SolidMask');
  assert.equal(graph.native_keep_mask.inputs.width, 1200);
  assert.equal(graph.native_keep_feather.class_type, 'FeatherMask');
  assert.equal(graph.native_keep_feather.inputs.left, 20);
  assert.equal(graph.preserve_source.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.preserve_source.inputs.source, ['source', 0]);
  assert.equal(graph.preserve_source.inputs.x, 600);
  assert.equal(graph.preserve_source.inputs.y, 280);
  assert.deepEqual(graph.preserve_source.inputs.mask, ['native_keep_feather', 0]);
  assert.deepEqual(graph.save.inputs.images, ['preserve_source', 0]);
});
