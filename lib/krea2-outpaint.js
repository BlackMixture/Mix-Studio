'use strict';

/*
 * API-format adaptation of the Krea 2 outpaint workflow published at
 * civitai.com/models/2772215. It uses the training-matched grounded encoder
 * and source-latent model patch from github.com/lbouaraba/comfyui-krea2edit.
 */
const MAX_OUTPAINT_PIXELS = 2_000_000;

function round16(value) {
  return Math.max(256, Math.round(Number(value) / 16) * 16);
}

function normalizeOutpaintPosition(value) {
  return ['start', 'center', 'end'].includes(value) ? value : 'center';
}

function normalizeOutpaintDimensions(width, height, maxPixels = MAX_OUTPAINT_PIXELS) {
  let w = round16(width || 1024);
  let h = round16(height || 1024);
  const pixels = w * h;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    w = Math.max(256, Math.floor((w * scale) / 16) * 16);
    h = Math.max(256, Math.floor((h * scale) / 16) * 16);
    while (w * h > maxPixels) {
      if (w >= h && w > 256) w -= 16;
      else if (h > 256) h -= 16;
      else break;
    }
  }
  return { width: w, height: h };
}

function splitPadding(total, position) {
  if (position === 'start') return [0, total];
  if (position === 'end') return [total, 0];
  const before = Math.floor(total / 2);
  return [before, total - before];
}

function calculateOutpaintPadding({ sourceWidth, sourceHeight, targetWidth, targetHeight, position }) {
  const sw = Math.max(1, Math.round(Number(sourceWidth) || 0));
  const sh = Math.max(1, Math.round(Number(sourceHeight) || 0));
  const tw = Math.max(1, Math.round(Number(targetWidth) || 0));
  const th = Math.max(1, Math.round(Number(targetHeight) || 0));
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    throw new Error('Outpaint needs valid source and output dimensions');
  }
  const sourceRatio = sw / sh;
  const targetRatio = tw / th;
  const placement = normalizeOutpaintPosition(position);
  if (Math.abs(Math.log(targetRatio / sourceRatio)) < 0.012) {
    throw new Error('Choose an output ratio that adds canvas beyond the source image');
  }
  if (targetRatio > sourceRatio) {
    const expandedWidth = Math.max(sw + 1, Math.ceil(sh * targetRatio));
    const [left, right] = splitPadding(expandedWidth - sw, placement);
    return { left, top: 0, right, bottom: 0, axis: 'horizontal', position: placement };
  }
  const expandedHeight = Math.max(sh + 1, Math.ceil(sw / targetRatio));
  const [top, bottom] = splitPadding(expandedHeight - sh, placement);
  return { left: 0, top, right: 0, bottom, axis: 'vertical', position: placement };
}

function sameAsset(a, b) {
  const key = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  return key(a) === key(b);
}

function buildKrea2OutpaintGraph(params = {}) {
  const settings = params.settings || {};
  const imageName = String(params.imageName || '').trim();
  const identityLora = String(settings.krea2OutpaintLora || '').trim();
  if (!imageName) throw new Error('Krea 2 outpaint needs a source image');
  if (!identityLora) throw new Error('Krea 2 outpaint needs the Identity Edit LoRA');
  const dimensions = normalizeOutpaintDimensions(params.width, params.height);
  const padding = params.padding || {};
  if (![padding.left, padding.top, padding.right, padding.bottom].every(Number.isFinite)
    || !(padding.left || padding.top || padding.right || padding.bottom)) {
    throw new Error('Krea 2 outpaint needs a larger output canvas');
  }

  const graph = {
    unet: {
      class_type: 'UNETLoader',
      inputs: { unet_name: settings.unet, weight_dtype: 'default' },
    },
    identity_lora: {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ['unet', 0], lora_name: identityLora, strength_model: 1 },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: settings.clip, type: settings.clipType || 'krea2', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
    source: { class_type: 'LoadImage', inputs: { image: imageName } },
    padded: {
      class_type: 'ImagePadForOutpaint',
      inputs: {
        image: ['source', 0],
        left: Math.max(0, Math.round(padding.left)),
        top: Math.max(0, Math.round(padding.top)),
        right: Math.max(0, Math.round(padding.right)),
        bottom: Math.max(0, Math.round(padding.bottom)),
        feathering: 0,
      },
    },
    scaled_source: {
      class_type: 'ImageScale',
      inputs: {
        image: ['padded', 0],
        upscale_method: 'lanczos',
        width: dimensions.width,
        height: dimensions.height,
        crop: 'disabled',
      },
    },
    source_latent: {
      class_type: 'VAEEncode',
      inputs: { pixels: ['scaled_source', 0], vae: ['vae', 0] },
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
          strength_model: Math.max(0, Math.min(2, Number(lora.strength) || 1)),
        },
      };
      model = [key, 0];
    });

  const groundingPx = Math.max(384, Math.min(1024, Math.round(Number(params.groundingPx) || 768)));
  graph.model_patch = {
    class_type: 'Krea2EditModelPatch',
    inputs: { model, source_latent: ['source_latent', 0] },
  };
  graph.positive = {
    class_type: 'Krea2EditGroundedEncode',
    inputs: { prompt: String(params.prompt || ''), grounding_px: groundingPx, clip: ['clip', 0], image: ['source', 0] },
  };
  graph.negative = {
    class_type: 'Krea2EditGroundedEncode',
    inputs: { prompt: '', grounding_px: groundingPx, clip: ['clip', 0], image: ['source', 0] },
  };
  graph.latent = {
    class_type: 'EmptySD3LatentImage',
    inputs: { width: dimensions.width, height: dimensions.height, batch_size: Math.max(1, Math.min(8, Math.round(Number(params.batch) || 1))) },
  };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: ['model_patch', 0],
      positive: ['positive', 0],
      negative: ['negative', 0],
      latent_image: ['latent', 0],
      seed: Number(params.seed) || 0,
      steps: 8,
      cfg: 1,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/outpaint' } };
  return graph;
}

module.exports = {
  MAX_OUTPAINT_PIXELS,
  buildKrea2OutpaintGraph,
  calculateOutpaintPadding,
  normalizeOutpaintDimensions,
  normalizeOutpaintPosition,
};
