'use strict';

const { buildKrea2ModelLoader } = require('./krea2-model');

const MAX_IDENTITY_EDIT_PIXELS = 2_000_000;

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeIdentityEditDimensions(width, height) {
  let w = Math.max(256, Math.round(Number(width) || 1024));
  let h = Math.max(256, Math.round(Number(height) || 1024));
  const pixels = w * h;
  if (pixels > MAX_IDENTITY_EDIT_PIXELS) {
    const scale = Math.sqrt(MAX_IDENTITY_EDIT_PIXELS / pixels);
    w *= scale;
    h *= scale;
  }
  w = Math.max(256, Math.round(w / 16) * 16);
  h = Math.max(256, Math.round(h / 16) * 16);
  while (w * h > MAX_IDENTITY_EDIT_PIXELS) {
    if (w >= h) w -= 16;
    else h -= 16;
  }
  return { width: w, height: h };
}

function sameAsset(a, b) {
  const key = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  return key(a) === key(b);
}

function buildKrea2IdentityEditGraph(params = {}) {
  const settings = params.settings || {};
  const references = (Array.isArray(params.refNames) ? params.refNames : [])
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .slice(0, 2);
  const identityLora = String(settings.krea2OutpaintLora || '').trim();
  if (!references.length) throw new Error('Krea 2 Edit needs a source image');
  if (!identityLora) throw new Error('Krea 2 Edit needs the Identity Edit LoRA');

  const dimensions = normalizeIdentityEditDimensions(params.width, params.height);
  const identityOverride = (Array.isArray(params.loras) ? params.loras : [])
    .find((lora) => sameAsset(lora && lora.name, identityLora));
  const identityEnabled = !identityOverride || identityOverride.on !== false;
  if (!identityEnabled) throw new Error('Krea 2 Edit needs the Identity Edit LoRA enabled');

  const graph = {
    unet: buildKrea2ModelLoader(settings, settings.unet),
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: settings.clip, type: settings.clipType || 'krea2', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
    identity_lora: {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['unet', 0],
        lora_name: identityLora,
        strength_model: clamp(identityOverride && identityOverride.strength, -100, 100, 1),
      },
    },
  };

  let model = ['identity_lora', 0];
  (Array.isArray(params.loras) ? params.loras : [])
    .filter((lora) => lora && lora.on !== false && lora.name && !sameAsset(lora.name, identityLora))
    .forEach((lora, index) => {
      const key = `user_lora_${index + 1}`;
      graph[key] = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model,
          lora_name: lora.name,
          strength_model: clamp(lora.strength, -100, 100, 1),
        },
      };
      model = [key, 0];
    });

  references.forEach((name, index) => {
    const suffix = index ? '_b' : '';
    graph[`source${suffix}`] = { class_type: 'LoadImage', inputs: { image: name } };
    graph[`source_latent${suffix}`] = {
      class_type: 'VAEEncode',
      inputs: { pixels: [`source${suffix}`, 0], vae: ['vae', 0] },
    };
  });

  const refBoost = clamp(params.krea2RefBoost, 0, 20, 4);
  const groundingPx = Math.round(clamp(params.groundingPx, 384, 1024, 768));
  const patchInputs = {
    model,
    source_latent: ['source_latent', 0],
    ref_boost: refBoost,
    ref_boost_a: 1,
    fit_mode: 'fit',
    vae: ['vae', 0],
    source_image: ['source', 0],
  };
  const positiveInputs = {
    prompt: String(params.prompt || ''),
    grounding_px: groundingPx,
    clip: ['clip', 0],
    image: ['source', 0],
  };
  const negativeInputs = {
    prompt: '',
    grounding_px: groundingPx,
    clip: ['clip', 0],
    image: ['source', 0],
  };
  if (references[1]) {
    patchInputs.source_latent_b = ['source_latent_b', 0];
    patchInputs.source_image_b = ['source_b', 0];
    positiveInputs.image_b = ['source_b', 0];
    negativeInputs.image_b = ['source_b', 0];
  }
  graph.model_patch = { class_type: 'Krea2EditModelPatch', inputs: patchInputs };
  graph.positive = { class_type: 'Krea2EditGroundedEncode', inputs: positiveInputs };
  graph.negative = { class_type: 'Krea2EditGroundedEncode', inputs: negativeInputs };
  graph.latent = {
    class_type: 'EmptySD3LatentImage',
    inputs: {
      width: dimensions.width,
      height: dimensions.height,
      batch_size: Math.round(clamp(params.batch, 1, 8, 1)),
    },
  };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: ['model_patch', 0],
      positive: ['positive', 0],
      negative: ['negative', 0],
      latent_image: ['latent', 0],
      seed: Number(params.seed) || 0,
      steps: Math.round(clamp(params.steps, 8, 12, 10)),
      cfg: clamp(params.cfg, 1, 5, 1),
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/edit' } };
  return graph;
}

module.exports = {
  MAX_IDENTITY_EDIT_PIXELS,
  buildKrea2IdentityEditGraph,
  normalizeIdentityEditDimensions,
};
