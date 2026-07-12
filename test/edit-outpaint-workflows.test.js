'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildKleinOutpaintGraph,
  buildQwenOutpaintGraph,
  buildKrea2MaskedOutpaintGraph,
  greenOutpaintPrompt,
} = require('../lib/edit-outpaint-workflows');

const padding = { left: 120, top: 0, right: 120, bottom: 0 };

test('Klein outpaint follows the official green-canvas ReferenceLatent workflow', () => {
  const graph = buildKleinOutpaintGraph({
    settings: { kleinVae: 'flux2-vae.safetensors' },
    unetName: 'flux-2-klein-9b.safetensors',
    clipName: 'qwen_3_8b.safetensors',
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding,
    editOutpaintSourceWidth: 900,
    editOutpaintSourceHeight: 768,
    editOutpaintFinalWidth: 1800,
    editOutpaintFinalHeight: 1024,
    editOutpaintFinalSourceWidth: 1200,
    editOutpaintFinalSourceHeight: 800,
    editOutpaintFinalPadding: { left: 300, top: 112, right: 300, bottom: 112 },
    composite: true,
    prompt: 'Continue the windows and wall.',
    seed: 7,
    batch: 1,
  });
  assert.equal(graph.padded.class_type, 'ImagePadForOutpaint');
  assert.deepEqual(graph.padded.inputs.image, ['resized_source', 0]);
  assert.equal(graph.green_canvas.class_type, 'DrawMaskOnImage');
  assert.equal(graph.green_canvas.inputs.color, '0, 255, 0');
  assert.equal(graph.positive.class_type, 'ReferenceLatent');
  assert.equal(graph.scheduler.class_type, 'Flux2Scheduler');
  assert.equal(graph.scheduler.inputs.steps, 4);
  assert.equal(graph.color_match, undefined);
  assert.equal(graph.final_scale.inputs.width, 1800);
  assert.equal(graph.color_match_final.class_type, 'ColorMatch');
  assert.equal(graph.color_match_final.inputs.method, 'hm-mvgd-hm');
  assert.equal(graph.native_keep_mask.class_type, 'SolidMask');
  assert.equal(graph.native_keep_feather.class_type, 'FeatherMask');
  assert.equal(graph.preserve_source.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.preserve_source.inputs.source, ['source', 0]);
  assert.equal(graph.preserve_source.inputs.x, 300);
  assert.equal(graph.preserve_source.inputs.y, 112);
  assert.deepEqual(graph.preserve_source.inputs.mask, ['native_keep_feather', 0]);
  assert.deepEqual(graph.save.inputs.images, ['preserve_source', 0]);
  assert.match(graph.positive_text.inputs.text, /Remove the green area/);
});

test('Qwen outpaint sends the padded green canvas through native edit conditioning', () => {
  const graph = buildQwenOutpaintGraph({
    settings: {
      qwenEditUnet: 'qwen-edit.safetensors',
      qwenEditClip: 'qwen-clip.safetensors',
      qwenEditLora: 'lightning.safetensors',
      vae: 'qwen-vae.safetensors',
    },
    preset: { steps: 4, cfg: 1, lightning: true },
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding,
    editOutpaintSourceWidth: 900,
    editOutpaintSourceHeight: 768,
    editOutpaintFinalWidth: 1800,
    editOutpaintFinalHeight: 1024,
    editOutpaintFinalSourceWidth: 1200,
    editOutpaintFinalSourceHeight: 800,
    editOutpaintFinalPadding: { left: 300, top: 112, right: 300, bottom: 112 },
    composite: true,
    prompt: '',
    seed: 8,
  });
  assert.equal(graph.green_canvas.class_type, 'DrawMaskOnImage');
  assert.equal(graph.positive_encode.class_type, 'TextEncodeQwenImageEditPlus');
  assert.deepEqual(graph.positive_encode.inputs.image1, ['outpaint_source', 0]);
  assert.equal(graph.sampler.inputs.steps, 4);
  assert.equal(graph.color_match, undefined);
  assert.equal(graph.color_match_final.class_type, 'ColorMatch');
  assert.equal(graph.preserve_source.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.save.inputs.images, ['preserve_source', 0]);
});

test('Krea2 outpaint uses the padded mask as latent noise and preserves the source area', () => {
  const graph = buildKrea2MaskedOutpaintGraph({
    settings: {
      unet: 'krea2-turbo.safetensors',
      clip: 'qwen3vl.safetensors',
      clipType: 'krea2',
      vae: 'qwen-vae.safetensors',
    },
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding,
    editOutpaintFinalWidth: 1800,
    editOutpaintFinalHeight: 1024,
    editOutpaintFinalSourceWidth: 1200,
    editOutpaintFinalSourceHeight: 800,
    editOutpaintFinalPadding: { left: 300, top: 112, right: 300, bottom: 112 },
    composite: true,
    prompt: 'Continue the room.',
    seed: 9,
  });
  assert.equal(graph.padded.class_type, 'ImagePadForOutpaint');
  assert.equal(graph.scaled_mask.class_type, 'ImageToMask');
  assert.equal(graph.masked_latent.class_type, 'SetLatentNoiseMask');
  assert.equal(graph.sampler.inputs.steps, 8);
  assert.equal(graph.color_match, undefined);
  assert.equal(graph.native_keep_mask.class_type, 'SolidMask');
  assert.equal(graph.native_keep_feather.class_type, 'FeatherMask');
  assert.equal(graph.preserve_source.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.save.inputs.images, ['preserve_source', 0]);
});

test('outpaint can skip the exact-source composite when Preserve is off', () => {
  const graph = buildKleinOutpaintGraph({
    settings: { kleinVae: 'flux2-vae.safetensors' },
    unetName: 'flux-2-klein-4b.safetensors',
    clipName: 'qwen_3_4b.safetensors',
    imageName: 'source.png',
    width: 1344,
    height: 768,
    padding,
    prompt: 'Continue the image.',
  });
  assert.equal(graph.preserve_source, undefined);
  assert.deepEqual(graph.save.inputs.images, ['color_match', 0]);
});

test('green outpaint prompt retains optional creative direction', () => {
  assert.match(greenOutpaintPrompt('Add a continuation of the forest.'), /forest/);
  assert.match(greenOutpaintPrompt(''), /Remove the green area/);
});
