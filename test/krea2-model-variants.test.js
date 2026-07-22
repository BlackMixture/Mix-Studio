'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildKrea2ModelLoader,
  effectiveKrea2Variant,
  krea2VariantSettings,
  normalizeKrea2Variant,
  recommendedKrea2Variant,
} = require('../lib/krea2-model');
const { dependencyModelPlan, NODE_PACKS } = require('../lib/dependency-installer');
const { buildRegionalT2IGraph, buildKrea2InpaintGraph } = require('../lib/regional-workflows');
const { buildKrea2OutpaintGraph } = require('../lib/krea2-outpaint');
const { buildKrea2MaskedOutpaintGraph } = require('../lib/edit-outpaint-workflows');
const { buildUltimateSdUpscaleGraph } = require('../lib/upscale-workflows');

const root = path.join(__dirname, '..');
const int8Settings = Object.assign(krea2VariantSettings('int8-convrot'), {
  clip: 'qwen3vl.safetensors',
  clipType: 'krea2',
  vae: 'qwen-image-vae.safetensors',
  krea2OutpaintLora: 'identity.safetensors',
});

test('Krea 2 recommends INT8 ConvRot below 16 GB VRAM and FP8 otherwise', () => {
  assert.equal(recommendedKrea2Variant({ vramGb: 8 }), 'int8-convrot');
  assert.equal(recommendedKrea2Variant({ gpu: { vramGb: 12 } }), 'int8-convrot');
  assert.equal(recommendedKrea2Variant({ vramGb: 16 }), 'fp8');
  assert.equal(recommendedKrea2Variant({ vramGb: 24 }), 'fp8');
  assert.equal(recommendedKrea2Variant({}), 'fp8');
});

test('Krea 2 variant inference recognizes manually selected ConvRot files', () => {
  assert.equal(normalizeKrea2Variant('fp8', {
    unet: 'krea2_turbo_int8_convrot.safetensors',
    krea2RawUnet: 'krea2_raw_fp8_scaled.safetensors',
  }), 'int8-convrot');
});

test('dependency planning resolves the requested variant before saved settings', () => {
  assert.equal(effectiveKrea2Variant('', krea2VariantSettings('int8-convrot')), 'int8-convrot');
  assert.equal(effectiveKrea2Variant('fp8', krea2VariantSettings('int8-convrot')), 'fp8');
  assert.equal(effectiveKrea2Variant('int8-convrot', krea2VariantSettings('fp8')), 'int8-convrot');
});

test('official INT8 ConvRot uses ComfyUI native quantization through the standard loader', () => {
  const loader = buildKrea2ModelLoader(int8Settings, int8Settings.unet);
  assert.equal(loader.class_type, 'UNETLoader');
  assert.deepEqual(loader.inputs, {
    unet_name: 'krea2_turbo_int8_convrot.safetensors',
    weight_dtype: 'default',
  });
  assert.equal(buildKrea2ModelLoader(krea2VariantSettings('fp8')).class_type, 'UNETLoader');
});

test('core image dependency plan downloads Turbo INT8 without pulling optional Raw assets', () => {
  const plan = dependencyModelPlan(['image'], {}, { modelVariants: { krea2: 'int8-convrot' } });
  const turbo = plan.assets.find((asset) => asset[0] === 'unet');
  const raw = plan.assets.find((asset) => asset[0] === 'krea2RawUnet');
  assert.match(turbo[2], /Comfy-Org\/Krea-2\/resolve\/main\/diffusion_models\/krea2_turbo_int8_convrot\.safetensors$/);
  assert.equal(raw, undefined);
  assert.equal(plan.assets.some((asset) => asset[0] === 'krea2TurboLora'), false);
  assert.equal(plan.effectiveSettings.unet, 'krea2_turbo_int8_convrot.safetensors');
  assert.equal(plan.settingUpdates.krea2ModelVariant, 'int8-convrot');
  assert.equal(NODE_PACKS.int8Fast, undefined);
});

test('optional Raw dependency plan downloads the matching checkpoint and Turbo LoRA only when selected', () => {
  const plan = dependencyModelPlan(['krea2Raw'], {}, { modelVariants: { krea2: 'int8-convrot' } });
  const raw = plan.assets.find((asset) => asset[0] === 'krea2RawUnet');
  assert.match(raw[2], /krea2_raw_int8_convrot\.safetensors$/);
  assert.ok(plan.assets.some((asset) => asset[0] === 'krea2TurboLora'));
  assert.equal(plan.assets.some((asset) => asset[0] === 'unet'), false);
  assert.equal(plan.settingUpdates.krea2RawUnet, 'krea2_raw_int8_convrot.safetensors');
  assert.equal(plan.settingUpdates.unet, undefined);
});

test('dependency plan preserves manually configured Krea model filenames unless a variant is requested', () => {
  const settings = {
    krea2ModelVariant: 'fp8',
    unet: 'custom-krea-turbo.safetensors',
    krea2RawUnet: 'custom-krea-raw.safetensors',
  };
  const plan = dependencyModelPlan(['image'], settings);
  assert.equal(plan.effectiveSettings.unet, settings.unet);
  assert.equal(plan.effectiveSettings.krea2RawUnet, settings.krea2RawUnet);
  assert.deepEqual(plan.settingUpdates, {});
});

test('every Krea 2 image workflow uses the compatible INT8 loader', () => {
  const regional = buildRegionalT2IGraph({
    prompt: 'portrait', width: 1024, height: 1024, regions: [], settings: int8Settings,
  });
  const inpaint = buildKrea2InpaintGraph({
    prompt: 'edit', imageName: 'source.png', maskImageName: 'mask.png', settings: int8Settings,
  });
  const identityOutpaint = buildKrea2OutpaintGraph({
    prompt: 'expand', imageName: 'source.png', width: 1344, height: 768,
    padding: { left: 0, top: 0, right: 320, bottom: 0 }, settings: int8Settings,
  });
  const maskedOutpaint = buildKrea2MaskedOutpaintGraph({
    prompt: 'expand', imageName: 'source.png', width: 1344, height: 768,
    padding: { left: 0, top: 0, right: 320, bottom: 0 }, settings: int8Settings,
  });
  const upscale = buildUltimateSdUpscaleGraph({ imageName: 'source.png', settings: int8Settings });
  for (const graph of [regional, inpaint, identityOutpaint, maskedOutpaint, upscale]) {
    assert.equal(graph.unet.class_type, 'UNETLoader');
    assert.equal(graph.unet.inputs.unet_name, 'krea2_turbo_int8_convrot.safetensors');
  }
});

test('setup and settings expose the low-VRAM choice and persist installer updates', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const installer = fs.readFileSync(path.join(root, 'installer', 'install-dependencies.js'), 'utf8');
  assert.match(html, /INT8 ConvRot · optimized 8-bit/);
  assert.match(app, /modelVariants: \{ krea2: setupSelectedKrea2Variant\(\) \}/);
  assert.match(app, /krea2_turbo_int8_convrot\.safetensors/);
  assert.doesNotMatch(server, /OTUNetLoaderW8A8/);
  assert.match(server, /result\.settingUpdates/);
  assert.match(installer, /writeJsonAtomic\(settingsFile, settings\)/);
});
