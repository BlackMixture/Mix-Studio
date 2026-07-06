'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_SEEDVR2_DIT,
  SHARP_SEEDVR2_DIT,
  LEGACY_KREA_SEEDVR2_DIT,
  normalizeSeedVr2Defaults,
  installedSeedVr2Models,
  seedVr2Profile,
  seedVr2DitInputs,
  targetResolutionForUpscale,
  rtxVideoSuperResolutionNode,
  buildUltimateSdUpscaleGraph,
} = require('../lib/upscale-workflows');

test('normalizes legacy KreaStudio SeedVR2 default to the Pixel Relay 7B model', () => {
  const settings = normalizeSeedVr2Defaults({
    seedvr2Dit: LEGACY_KREA_SEEDVR2_DIT,
    seedvr2Vae: 'ema_vae_fp16.safetensors',
    seedvr2Attention: 'sageattn_2',
  });

  assert.equal(settings.seedvr2Dit, DEFAULT_SEEDVR2_DIT);
});

test('uses 7B-friendly SeedVR2 loader settings', () => {
  const inputs = seedVr2DitInputs({
    seedvr2Dit: DEFAULT_SEEDVR2_DIT,
    seedvr2Attention: 'sageattn_2',
  });

  assert.equal(inputs.model, DEFAULT_SEEDVR2_DIT);
  assert.equal(inputs.blocks_to_swap, 32);
  assert.equal(inputs.swap_io_components, true);
  assert.equal(inputs.offload_device, 'cpu');
  assert.equal(inputs.attention_mode, 'sageattn_2');
});

test('sharp SeedVR2 profile prefers the sharp 7B model and low detail noise by default', () => {
  const profile = seedVr2Profile(
    { seedvr2Dit: DEFAULT_SEEDVR2_DIT },
    'sharp',
    [DEFAULT_SEEDVR2_DIT, SHARP_SEEDVR2_DIT]
  );

  assert.equal(profile.key, 'sharp');
  assert.equal(profile.ditModel, SHARP_SEEDVR2_DIT);
  assert.equal(profile.colorCorrection, 'wavelet');
  assert.equal(profile.noise, 'low');
  assert.equal(profile.inputNoiseScale, 0.06);
});

test('SeedVR2 detail noise supports off, low, and medium levels', () => {
  const available = [DEFAULT_SEEDVR2_DIT, SHARP_SEEDVR2_DIT];

  assert.equal(seedVr2Profile({ seedvr2Dit: DEFAULT_SEEDVR2_DIT }, 'sharp', available, 'off').inputNoiseScale, 0);
  assert.equal(seedVr2Profile({ seedvr2Dit: DEFAULT_SEEDVR2_DIT }, 'sharp', available, 'low').inputNoiseScale, 0.06);
  assert.equal(seedVr2Profile({ seedvr2Dit: DEFAULT_SEEDVR2_DIT }, 'sharp', available, 'medium').inputNoiseScale, 0.15);
});

test('sharp SeedVR2 profile falls back when the sharp model is unavailable', () => {
  const profile = seedVr2Profile(
    { seedvr2Dit: DEFAULT_SEEDVR2_DIT },
    'sharp',
    [DEFAULT_SEEDVR2_DIT]
  );

  assert.equal(profile.key, 'balanced');
  assert.equal(profile.ditModel, DEFAULT_SEEDVR2_DIT);
  assert.equal(profile.colorCorrection, 'lab');
});

test('installed SeedVR2 model scan ignores partial downloads', () => {
  const filesByDir = {
    'models/SEEDVR2': [
      DEFAULT_SEEDVR2_DIT,
      `${SHARP_SEEDVR2_DIT}.download`,
      'ema_vae_fp16.safetensors',
    ],
  };
  const models = installedSeedVr2Models(['models/SEEDVR2'], {
    readdirSync(dir) { return filesByDir[dir] || []; },
  });

  assert.deepEqual(models, [DEFAULT_SEEDVR2_DIT, 'ema_vae_fp16.safetensors']);
});

test('builds RTX 4K node with dynamic scale input and string quality', () => {
  const node = rtxVideoSuperResolutionNode(['decode', 0], 2, 'ULTRA');

  assert.deepEqual(node, {
    class_type: 'RTXVideoSuperResolution',
    inputs: {
      images: ['decode', 0],
      resize_type: 'scale by multiplier',
      'resize_type.scale': 2,
      quality: 'ULTRA',
    },
  });
});

test('targetResolutionForUpscale supports multiplier mode from the original short edge', () => {
  const target = targetResolutionForUpscale({
    mode: 'scale',
    scaleFactor: 2,
    width: 1152,
    height: 1536,
    fallbackResolution: 2160,
  });

  assert.equal(target, 2304);
});

test('builds an Ultimate SD Upscale graph with simple prompt-guided defaults', () => {
  const graph = buildUltimateSdUpscaleGraph({
    imageName: 'source.png',
    prompt: 'a detailed faithful portrait prompt',
    scaleFactor: 2,
    seed: 123,
    settings: {
      unet: 'krea2_turbo_fp8_scaled.safetensors',
      clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
      clipType: 'krea2',
      vae: 'qwen_image_vae.safetensors',
    },
  });

  assert.equal(graph.load.class_type, 'LoadImage');
  assert.equal(graph.upscale_model.class_type, 'UpscaleModelLoader');
  assert.equal(graph.upscale_model.inputs.model_name, '4x_foolhardy_Remacri.pth');
  assert.equal(graph.ultimate.class_type, 'UltimateSDUpscale');
  assert.equal(graph.ultimate.inputs.upscale_by, 2);
  assert.equal(graph.ultimate.inputs.denoise, 0.22);
  assert.equal(graph.ultimate.inputs.tile_width, 768);
  assert.equal(graph.pos.inputs.text, 'a detailed faithful portrait prompt');
});
