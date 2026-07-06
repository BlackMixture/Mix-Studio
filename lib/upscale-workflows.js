'use strict';

const path = require('path');

const LEGACY_KREA_SEEDVR2_DIT = 'seedvr2_ema_3b_fp16.safetensors';
const DEFAULT_SEEDVR2_DIT = 'seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors';
const SHARP_SEEDVR2_DIT = 'seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors';
const DEFAULT_SEEDVR2_VAE = 'ema_vae_fp16.safetensors';
const DEFAULT_SEEDVR2_ATTENTION = 'sdpa';
const ULTIMATE_SD_UPSCALE_MODEL = '4x_foolhardy_Remacri.pth';

const SEEDVR2_NOISE_LEVELS = {
  off: 0,
  low: 0.06,
  medium: 0.15,
};

function isSeedVr2SevenB(model) {
  return /(?:^|[_-])7b(?:[_-]|$)/i.test(String(model || ''));
}

function normalizeSeedVr2Defaults(settings) {
  if (!settings.seedvr2Dit || settings.seedvr2Dit === LEGACY_KREA_SEEDVR2_DIT) {
    settings.seedvr2Dit = DEFAULT_SEEDVR2_DIT;
  }
  if (!settings.seedvr2Vae) settings.seedvr2Vae = DEFAULT_SEEDVR2_VAE;
  if (!settings.seedvr2Attention) settings.seedvr2Attention = DEFAULT_SEEDVR2_ATTENTION;
  return settings;
}

function seedVr2DitInputs(settings) {
  const model = settings.seedvr2Dit || DEFAULT_SEEDVR2_DIT;
  return {
    model,
    device: 'cuda:0',
    blocks_to_swap: isSeedVr2SevenB(model) ? 32 : 0,
    swap_io_components: true,
    offload_device: 'cpu',
    cache_model: false,
    attention_mode: settings.seedvr2Attention || DEFAULT_SEEDVR2_ATTENTION,
  };
}

function modelAvailable(availableModels, model) {
  if (!Array.isArray(availableModels)) return true;
  return availableModels.includes(model);
}

function seedVr2NoiseLevel(requestedNoise) {
  return Object.prototype.hasOwnProperty.call(SEEDVR2_NOISE_LEVELS, requestedNoise)
    ? requestedNoise
    : 'low';
}

function seedVr2Profile(settings, requestedProfile, availableModels, requestedNoise) {
  const noise = seedVr2NoiseLevel(requestedNoise);
  const balanced = {
    key: 'balanced',
    ditModel: settings.seedvr2Dit || DEFAULT_SEEDVR2_DIT,
    colorCorrection: 'lab',
    noise,
    inputNoiseScale: SEEDVR2_NOISE_LEVELS[noise],
  };
  if (requestedProfile === 'sharp' && modelAvailable(availableModels, SHARP_SEEDVR2_DIT)) {
    return {
      key: 'sharp',
      ditModel: SHARP_SEEDVR2_DIT,
      colorCorrection: 'wavelet',
      noise,
      inputNoiseScale: SEEDVR2_NOISE_LEVELS[noise],
    };
  }
  return balanced;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function buildUltimateSdUpscaleGraph(opts = {}) {
  const settings = opts.settings || {};
  const scaleFactor = clampNumber(opts.scaleFactor, 1, 4, 2);
  const seed = Number.isFinite(Number(opts.seed)) && Number(opts.seed) >= 0
    ? Math.floor(Number(opts.seed))
    : Math.floor(Math.random() * 2 ** 31);
  const prompt = String(opts.prompt || '').trim() || 'a faithful, highly detailed upscale of the source image';
  const upscaleModel = opts.upscaleModel || ULTIMATE_SD_UPSCALE_MODEL;

  return {
    load: { class_type: 'LoadImage', inputs: { image: opts.imageName } },
    unet: { class_type: 'UNETLoader', inputs: { unet_name: settings.unet, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
    upscale_model: { class_type: 'UpscaleModelLoader', inputs: { model_name: upscaleModel } },
    pos: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } },
    ultimate: {
      class_type: 'UltimateSDUpscale',
      inputs: {
        image: ['load', 0],
        model: ['unet', 0],
        positive: ['pos', 0],
        negative: ['neg', 0],
        vae: ['vae', 0],
        upscale_by: scaleFactor,
        seed,
        steps: 12,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'beta',
        denoise: 0.22,
        upscale_model: ['upscale_model', 0],
        mode_type: 'Chess',
        tile_width: 768,
        tile_height: 768,
        mask_blur: 8,
        tile_padding: 64,
        seam_fix_mode: 'None',
        seam_fix_denoise: 0.1,
        seam_fix_width: 64,
        seam_fix_mask_blur: 8,
        seam_fix_padding: 16,
        force_uniform_tiles: true,
        tiled_decode: true,
        batch_size: 1,
      },
    },
    save: { class_type: 'SaveImage', inputs: { images: ['ultimate', 0], filename_prefix: 'KreaStudio/upscale' } },
  };
}

function installedSeedVr2Models(modelDirs, fsImpl = require('fs')) {
  const models = new Set();
  for (const dir of modelDirs || []) {
    if (!dir) continue;
    let entries = [];
    try {
      entries = fsImpl.readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry && entry.name;
      if (!name || name.endsWith('.download')) continue;
      const ext = path.extname(name).toLowerCase();
      if (ext === '.safetensors' || ext === '.gguf') models.add(name);
    }
  }
  return [...models];
}

function rtxVideoSuperResolutionNode(images, scale = 2, quality = 'ULTRA') {
  return {
    class_type: 'RTXVideoSuperResolution',
    inputs: {
      images,
      resize_type: 'scale by multiplier',
      'resize_type.scale': scale,
      quality,
    },
  };
}

function targetResolutionForUpscale(opts = {}) {
  const fallback = Number(opts.fallbackResolution) || Number(opts.resolution) || 2160;
  if (opts.mode === 'scale') {
    const width = Number(opts.width);
    const height = Number(opts.height);
    const factor = Number(opts.scaleFactor);
    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
      && Number.isFinite(factor) && factor > 0) {
      return Math.max(512, Math.min(8192, Math.round(Math.min(width, height) * factor)));
    }
  }
  return Math.max(512, Math.min(8192, Math.round(fallback)));
}

module.exports = {
  DEFAULT_SEEDVR2_DIT,
  SHARP_SEEDVR2_DIT,
  DEFAULT_SEEDVR2_VAE,
  DEFAULT_SEEDVR2_ATTENTION,
  LEGACY_KREA_SEEDVR2_DIT,
  ULTIMATE_SD_UPSCALE_MODEL,
  normalizeSeedVr2Defaults,
  installedSeedVr2Models,
  seedVr2Profile,
  seedVr2DitInputs,
  targetResolutionForUpscale,
  rtxVideoSuperResolutionNode,
  buildUltimateSdUpscaleGraph,
};
