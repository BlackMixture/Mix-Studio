'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  h3EffectiveModelName,
  h3FrameVariant,
  h3LoraCompatibility,
  h3ReferenceVariant,
  h3TurboCompatibility,
  normalizeH3FrameVariant,
  normalizeH3ReferenceVariant,
} = require('../lib/h3-model-variants');
const { dependencyModelPlan } = require('../lib/dependency-installer');
const { buildMiniMaxH3Graph } = require('../lib/video-workflows');

const baseSettings = {
  h3Unet: 'standard-frames.safetensors',
  h3RefUnet: 'standard-reference.safetensors',
  h3Bf16Unet: 'full-frames-bf16.safetensors',
  h3Bf16RefUnet: 'full-reference-bf16.safetensors',
  h3DynTimeRefUnet: 'dyntime-reference.safetensors',
  h3DynTimeRefHqUnet: 'dyntime-reference-hq.safetensors',
  h3Clip: 'clip.safetensors',
  h3VideoVae: 'video-vae.safetensors',
  h3AudioVae: 'audio-vae.safetensors',
  h3TurboLora: 'turbo.safetensors',
  h3RefTurboLora: 'reference-turbo.safetensors',
};

test('H3 model variants preserve Standard defaults and select explicit BF16 files', () => {
  assert.equal(normalizeH3FrameVariant('unknown'), 'standard');
  assert.equal(normalizeH3ReferenceVariant('unknown'), 'standard');
  assert.equal(h3EffectiveModelName(baseSettings, 'frames'), 'standard-frames.safetensors');
  assert.equal(h3EffectiveModelName(baseSettings, 'reference'), 'standard-reference.safetensors');
  const bf16 = Object.assign({}, baseSettings, { h3FrameModelVariant: 'bf16', h3ReferenceModelVariant: 'bf16' });
  assert.equal(h3FrameVariant(bf16).id, 'bf16');
  assert.equal(h3ReferenceVariant(bf16).id, 'bf16');
  assert.equal(h3EffectiveModelName(bf16, 'frames'), 'full-frames-bf16.safetensors');
  assert.equal(h3EffectiveModelName(bf16, 'reference'), 'full-reference-bf16.safetensors');
  assert.equal(h3TurboCompatibility(bf16, 'frames').supported, true);
  assert.equal(h3TurboCompatibility(bf16, 'reference').supported, true);
  assert.equal(h3LoraCompatibility(bf16, 'frames').supported, true);
  assert.equal(h3LoraCompatibility(bf16, 'reference').supported, true);
});

test('dependency planning downloads the selected H3 model rather than renaming Standard bytes', () => {
  const bf16 = dependencyModelPlan(['h3', 'h3Ref'], Object.assign({}, baseSettings, {
    h3FrameModelVariant: 'bf16',
    h3ReferenceModelVariant: 'bf16',
  }));
  assert.match(bf16.assets.find((asset) => asset[0] === 'h3Bf16Unet')[2], /minimax_h3_fl2va_bf16/);
  assert.match(bf16.assets.find((asset) => asset[0] === 'h3Bf16RefUnet')[2], /minimax_h3_ref2va_bf16/);
  assert.equal(bf16.assets.some((asset) => asset[0] === 'h3Unet'), false);
  assert.equal(bf16.assets.some((asset) => asset[0] === 'h3RefUnet'), false);

  const dyntime = dependencyModelPlan(['h3Ref'], Object.assign({}, baseSettings, {
    h3ReferenceModelVariant: 'dyntime-hq',
  }));
  assert.match(dyntime.assets[0][2], /b660b69c97cb0b5661a54cb50066ad11eacc6099/);
  assert.match(dyntime.assets[0][2], /Ref2VA-DT-sQKV-INT8-ConvRot-HQ/);
});

test('DynTime uses its selected graph model and rejects the incompatible current Turbo adapters', async () => {
  const settings = Object.assign({}, baseSettings, { h3ReferenceModelVariant: 'dyntime' });
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'test', seed: 1, W: 768, H: 768, frames: 124,
    references: { images: [{ name: 'reference.png' }] },
  }, settings);
  assert.equal(graph.model.inputs.unet_name, 'dyntime-reference.safetensors');
  assert.equal(h3TurboCompatibility(settings, 'reference').supported, false);
  assert.equal(h3LoraCompatibility(settings, 'reference').supported, false);
  await assert.rejects(
    buildMiniMaxH3Graph({
      mode: 'reference', turbo: true, prompt: 'test', seed: 1, W: 768, H: 768, frames: 124,
      references: { images: [{ name: 'reference.png' }] },
    }, settings),
    (error) => error.code === 'h3_turbo_model_incompatible' && /separate Q\/K\/V/.test(error.message),
  );
});
