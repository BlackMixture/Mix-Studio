'use strict';

/*
 * Klein outpaint follows Comfy's official image-extend template:
 * pad the source, paint the new canvas green, condition through a
 * ReferenceLatent, then color-match the decoded result to the source.
 * Qwen uses the same visual signal through its native edit encoder.
 */

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

function appendModelLoras(graph, model, loras, prefix) {
  let current = model;
  let count = 0;
  for (const lora of Array.isArray(loras) ? loras : []) {
    if (!lora || lora.on === false || !lora.name) continue;
    count += 1;
    const key = `${prefix}${count}`;
    graph[key] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: current,
        lora_name: lora.name,
        strength_model: clamp(lora.strength, 0, 2, 1),
      },
    };
    current = [key, 0];
  }
  return current;
}

function appendKreaLoras(graph, loras) {
  let model = ['unet', 0];
  let clip = ['clip', 0];
  let count = 0;
  for (const lora of Array.isArray(loras) ? loras : []) {
    if (!lora || lora.on === false || !lora.name) continue;
    count += 1;
    const key = `krea_lora_${count}`;
    graph[key] = {
      class_type: 'LoraLoader',
      inputs: {
        model,
        clip,
        lora_name: lora.name,
        strength_model: clamp(lora.strength, 0, 2, 1),
        strength_clip: clamp(lora.strength, 0, 2, 1),
      },
    };
    model = [key, 0];
    clip = [key, 1];
  }
  return { model, clip };
}

function greenOutpaintPrompt(prompt) {
  const request = String(prompt || '').trim();
  const instruction = 'Remove the green area and replace it by naturally extending the surrounding image. Preserve the original subject, composition, perspective, lighting, materials, and color continuity';
  return request ? `${instruction}. ${request}` : instruction;
}

function appendPaddedGreenSource(graph, params) {
  const padding = params.padding || {};
  graph.source = { class_type: 'LoadImage', inputs: { image: params.imageName } };
  const sourceWidth = Math.round(Number(params.editOutpaintSourceWidth) || 0);
  const sourceHeight = Math.round(Number(params.editOutpaintSourceHeight) || 0);
  let source = ['source', 0];
  if (sourceWidth > 0 && sourceHeight > 0) {
    graph.resized_source = {
      class_type: 'ImageScale',
      inputs: { image: source, upscale_method: 'lanczos', width: sourceWidth, height: sourceHeight, crop: 'disabled' },
    };
    source = ['resized_source', 0];
  }
  graph.padded = {
    class_type: 'ImagePadForOutpaint',
    inputs: {
      image: source,
      left: Math.max(0, Math.round(padding.left || 0)),
      top: Math.max(0, Math.round(padding.top || 0)),
      right: Math.max(0, Math.round(padding.right || 0)),
      bottom: Math.max(0, Math.round(padding.bottom || 0)),
      feathering: 40,
    },
  };
  graph.green_canvas = {
    class_type: 'DrawMaskOnImage',
    inputs: { image: ['padded', 0], mask: ['padded', 1], color: '0, 255, 0', device: 'cpu' },
  };
  graph.outpaint_source = {
    class_type: 'ImageScale',
    inputs: {
      image: ['green_canvas', 0],
      upscale_method: 'nearest-exact',
      width: params.width,
      height: params.height,
      crop: 'disabled',
    },
  };
  return ['outpaint_source', 0];
}

function appendColorMatchedOutput(graph, decoded, prefix) {
  graph.color_match = {
    class_type: 'ColorMatch',
    inputs: {
      image_ref: ['source', 0],
      image_target: decoded,
      method: 'mkl',
      strength: 1,
      multithread: true,
    },
  };
  graph.save = {
    class_type: 'SaveImage',
    inputs: { images: ['color_match', 0], filename_prefix: prefix },
  };
}

function buildKleinOutpaintGraph(params = {}) {
  const settings = params.settings || {};
  const graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: params.unetName, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: params.clipName, type: 'flux2', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.kleinVae } },
  };
  const model = appendModelLoras(graph, ['unet', 0], params.loras, 'klein_outpaint_lora_');
  const outpaintSource = appendPaddedGreenSource(graph, params);
  graph.encode = { class_type: 'VAEEncode', inputs: { pixels: outpaintSource, vae: ['vae', 0] } };
  graph.positive_text = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['clip', 0], text: greenOutpaintPrompt(params.prompt) },
  };
  graph.negative_zero = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['positive_text', 0] } };
  graph.positive = { class_type: 'ReferenceLatent', inputs: { conditioning: ['positive_text', 0], latent: ['encode', 0] } };
  graph.negative = { class_type: 'ReferenceLatent', inputs: { conditioning: ['negative_zero', 0], latent: ['encode', 0] } };
  graph.latent = {
    class_type: 'EmptyFlux2LatentImage',
    inputs: { width: params.width, height: params.height, batch_size: Math.max(1, Math.min(8, Math.round(Number(params.batch) || 1))) },
  };
  graph.scheduler = { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: params.width, height: params.height, denoise: 1 } };
  graph.guider = { class_type: 'CFGGuider', inputs: { model, positive: ['positive', 0], negative: ['negative', 0], cfg: 1 } };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: Number(params.seed) || 0 } };
  graph.sampler_select = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  graph.sampler = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0],
      guider: ['guider', 0],
      sampler: ['sampler_select', 0],
      sigmas: ['scheduler', 0],
      latent_image: ['latent', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  appendColorMatchedOutput(graph, ['decode', 0], 'KreaStudio/outpaint-klein');
  return graph;
}

function buildQwenOutpaintGraph(params = {}) {
  const settings = params.settings || {};
  const preset = params.preset || { steps: 20, cfg: 1, lightning: false };
  const graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: settings.qwenEditUnet, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: settings.qwenEditClip, type: 'qwen_image', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
  };
  let model = ['unet', 0];
  if (preset.lightning) {
    graph.lightning = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model, lora_name: settings.qwenEditLora, strength_model: 1 },
    };
    model = ['lightning', 0];
  }
  model = appendModelLoras(graph, model, params.loras, 'qwen_outpaint_lora_');
  graph.model_sampling = { class_type: 'ModelSamplingAuraFlow', inputs: { model, shift: 3.1 } };
  graph.cfg_norm = { class_type: 'CFGNorm', inputs: { model: ['model_sampling', 0], strength: 1 } };
  const outpaintSource = appendPaddedGreenSource(graph, params);
  graph.positive_encode = {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: greenOutpaintPrompt(params.prompt), image1: outpaintSource },
  };
  graph.negative_encode = {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: '', image1: outpaintSource },
  };
  graph.positive = {
    class_type: 'FluxKontextMultiReferenceLatentMethod',
    inputs: { conditioning: ['positive_encode', 0], reference_latents_method: 'index_timestep_zero' },
  };
  graph.negative = {
    class_type: 'FluxKontextMultiReferenceLatentMethod',
    inputs: { conditioning: ['negative_encode', 0], reference_latents_method: 'index_timestep_zero' },
  };
  graph.latent = { class_type: 'VAEEncode', inputs: { pixels: outpaintSource, vae: ['vae', 0] } };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: ['cfg_norm', 0],
      positive: ['positive', 0],
      negative: ['negative', 0],
      latent_image: ['latent', 0],
      seed: Number(params.seed) || 0,
      steps: preset.steps,
      cfg: preset.cfg,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  appendColorMatchedOutput(graph, ['decode', 0], 'KreaStudio/outpaint-qwen');
  return graph;
}

function buildKrea2MaskedOutpaintGraph(params = {}) {
  const settings = params.settings || {};
  const padding = params.padding || {};
  const graph = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: settings.unet, weight_dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType || 'krea2', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
    source: { class_type: 'LoadImage', inputs: { image: params.imageName } },
  };
  const sourceWidth = Math.round(Number(params.editOutpaintSourceWidth) || 0);
  const sourceHeight = Math.round(Number(params.editOutpaintSourceHeight) || 0);
  let source = ['source', 0];
  if (sourceWidth > 0 && sourceHeight > 0) {
    graph.resized_source = {
      class_type: 'ImageScale',
      inputs: { image: source, upscale_method: 'lanczos', width: sourceWidth, height: sourceHeight, crop: 'disabled' },
    };
    source = ['resized_source', 0];
  }
  Object.assign(graph, {
    padded: {
      class_type: 'ImagePadForOutpaint',
      inputs: {
        image: source,
        left: Math.max(0, Math.round(padding.left || 0)),
        top: Math.max(0, Math.round(padding.top || 0)),
        right: Math.max(0, Math.round(padding.right || 0)),
        bottom: Math.max(0, Math.round(padding.bottom || 0)),
        feathering: 40,
      },
    },
    scaled_source: {
      class_type: 'ImageScale',
      inputs: { image: ['padded', 0], upscale_method: 'lanczos', width: params.width, height: params.height, crop: 'disabled' },
    },
    mask_image: { class_type: 'MaskToImage', inputs: { mask: ['padded', 1] } },
    scaled_mask_image: {
      class_type: 'ImageScale',
      inputs: { image: ['mask_image', 0], upscale_method: 'nearest-exact', width: params.width, height: params.height, crop: 'disabled' },
    },
    scaled_mask: { class_type: 'ImageToMask', inputs: { image: ['scaled_mask_image', 0], channel: 'red' } },
  });
  const chain = appendKreaLoras(graph, params.loras);
  graph.positive = { class_type: 'CLIPTextEncode', inputs: { clip: chain.clip, text: String(params.prompt || '') } };
  graph.negative = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['positive', 0] } };
  graph.encode = { class_type: 'VAEEncode', inputs: { pixels: ['scaled_source', 0], vae: ['vae', 0] } };
  graph.masked_latent = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['encode', 0], mask: ['scaled_mask', 0] } };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: chain.model,
      positive: ['positive', 0],
      negative: ['negative', 0],
      latent_image: ['masked_latent', 0],
      seed: Number(params.seed) || 0,
      steps: 8,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'beta',
      denoise: 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.composite = {
    class_type: 'ImageCompositeMasked',
    inputs: {
      destination: ['scaled_source', 0],
      source: ['decode', 0],
      x: 0,
      y: 0,
      resize_source: true,
      mask: ['scaled_mask', 0],
    },
  };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['composite', 0], filename_prefix: 'KreaStudio/outpaint-krea2' } };
  return graph;
}

module.exports = {
  buildKleinOutpaintGraph,
  buildQwenOutpaintGraph,
  buildKrea2MaskedOutpaintGraph,
  greenOutpaintPrompt,
};
