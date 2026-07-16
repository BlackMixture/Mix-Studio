'use strict';

/*
 * API-format adaptation of the Krea 2 outpaint workflow published at
 * civitai.com/models/2772215. It uses the training-matched grounded encoder
 * and source-latent model patch from github.com/lbouaraba/comfyui-krea2edit.
 */
const { appendOutpaintFinish } = require('./outpaint-finish');
const { buildKrea2ModelLoader } = require('./krea2-model');
const MAX_OUTPAINT_PIXELS = 2_000_000;
const MAX_FINAL_OUTPAINT_PIXELS = 32_000_000;

function round16(value) {
  return Math.max(256, Math.round(Number(value) / 16) * 16);
}

function ceil16(value) {
  return Math.max(256, Math.ceil(Number(value) / 16) * 16);
}

function floor16(value) {
  return Math.max(256, Math.floor(Number(value) / 16) * 16);
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

function normalizeOutpaintOffset(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : null;
}

function splitPaddingAt(total, offset) {
  const before = Math.max(0, Math.min(total, Math.round(total * offset)));
  return [before, total - before];
}

function outpaintOffsets(axis, position, offsetX, offsetY) {
  const placement = normalizeOutpaintPosition(position);
  const placementOffset = placement === 'start' ? 0 : (placement === 'end' ? 1 : .5);
  return {
    x: normalizeOutpaintOffset(offsetX) ?? (axis === 'horizontal' ? placementOffset : .5),
    y: normalizeOutpaintOffset(offsetY) ?? (axis === 'vertical' ? placementOffset : .5),
  };
}

function calculateOutpaintPadding({ sourceWidth, sourceHeight, targetWidth, targetHeight, position }) {
  const sw = Math.max(1, Math.round(Number(sourceWidth) || 0));
  const sh = Math.max(1, Math.round(Number(sourceHeight) || 0));
  const tw = Math.max(1, Math.round(Number(targetWidth) || 0));
  const th = Math.max(1, Math.round(Number(targetHeight) || 0));
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    throw new Error('Expand needs valid source and output dimensions');
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

function calculateOutpaintLayout({ sourceWidth, sourceHeight, targetWidth, targetHeight, position, offsetX, offsetY, scale = 1 }) {
  const sw = Math.max(1, Number(sourceWidth) || 0);
  const sh = Math.max(1, Number(sourceHeight) || 0);
  const tw = Math.max(1, Math.round(Number(targetWidth) || 0));
  const th = Math.max(1, Math.round(Number(targetHeight) || 0));
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    throw new Error('Expand needs valid source and output dimensions');
  }
  const factor = Math.max(.45, Math.min(1, Number(scale) || 1));
  const sourceRatio = sw / sh;
  const targetRatio = tw / th;
  const axis = targetRatio >= sourceRatio ? 'horizontal' : 'vertical';
  const fitWidth = axis === 'horizontal' ? th * sourceRatio : tw;
  const fitHeight = axis === 'vertical' ? tw / sourceRatio : th;
  const resizedWidth = Math.max(16, Math.min(tw, Math.round(fitWidth * factor)));
  const resizedHeight = Math.max(16, Math.min(th, Math.round(fitHeight * factor)));
  if (resizedWidth >= tw && resizedHeight >= th) {
    throw new Error('Choose an output ratio or image size that adds canvas beyond the source image');
  }
  const placement = normalizeOutpaintPosition(position);
  const offsets = outpaintOffsets(axis, placement, offsetX, offsetY);
  const horizontal = splitPaddingAt(tw - resizedWidth, offsets.x);
  const vertical = splitPaddingAt(th - resizedHeight, offsets.y);
  return {
    sourceWidth: resizedWidth,
    sourceHeight: resizedHeight,
    padding: {
      left: horizontal[0], top: vertical[0], right: horizontal[1], bottom: vertical[1], axis, position: placement,
    },
  };
}

function exactSourcePadding(sourceWidth, sourceHeight, targetWidth, targetHeight, axis, position, offsetX, offsetY) {
  const placement = normalizeOutpaintPosition(position);
  const offsets = outpaintOffsets(axis, placement, offsetX, offsetY);
  const horizontal = splitPaddingAt(Math.max(0, Math.round(targetWidth) - Math.round(sourceWidth)), offsets.x);
  const vertical = splitPaddingAt(Math.max(0, Math.round(targetHeight) - Math.round(sourceHeight)), offsets.y);
  return {
    left: horizontal[0], top: vertical[0], right: horizontal[1], bottom: vertical[1],
    axis, position: placement,
  };
}

function calculateNativeOutpaintPlan({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  position,
  offsetX,
  offsetY,
  scale = 1,
  maxWorkingPixels = MAX_OUTPAINT_PIXELS,
  maxFinalPixels = MAX_FINAL_OUTPAINT_PIXELS,
}) {
  const sw = Math.max(1, Math.round(Number(sourceWidth) || 0));
  const sh = Math.max(1, Math.round(Number(sourceHeight) || 0));
  const tw = Math.max(1, Math.round(Number(targetWidth) || 0));
  const th = Math.max(1, Math.round(Number(targetHeight) || 0));
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight) {
    throw new Error('Expand needs valid source and output dimensions');
  }
  const factor = Math.max(.45, Math.min(1, Number(scale) || 1));
  const sourceRatio = sw / sh;
  const targetRatio = tw / th;
  const axis = targetRatio >= sourceRatio ? 'horizontal' : 'vertical';
  let finalWidth;
  let finalHeight;
  if (axis === 'horizontal') {
    finalHeight = ceil16(sh / factor);
    finalWidth = ceil16(finalHeight * targetRatio);
  } else {
    finalWidth = ceil16(sw / factor);
    finalHeight = ceil16(finalWidth / targetRatio);
  }

  let limited = false;
  if (finalWidth * finalHeight > maxFinalPixels) {
    const shrink = Math.sqrt(maxFinalPixels / (finalWidth * finalHeight));
    finalWidth = floor16(finalWidth * shrink);
    finalHeight = floor16(finalHeight * shrink);
    limited = true;
  }
  if (finalWidth < sw || finalHeight < sh) {
    throw new Error('The native source is too large for the maximum Expand canvas. Increase Image size or reduce the source resolution.');
  }

  const finalPadding = exactSourcePadding(sw, sh, finalWidth, finalHeight, axis, position, offsetX, offsetY);
  const working = normalizeOutpaintDimensions(finalWidth, finalHeight, maxWorkingPixels);
  const scaleX = working.width / finalWidth;
  const scaleY = working.height / finalHeight;
  const workingSourceWidth = Math.min(working.width, Math.max(1, Math.round(sw * scaleX)));
  const workingSourceHeight = Math.min(working.height, Math.max(1, Math.round(sh * scaleY)));
  // Scale the final placement itself instead of independently rounding a
  // source rectangle. This keeps the generated border registered to the
  // native source after the working canvas is enlarged again.
  const workingLeft = Math.max(0, Math.round(finalPadding.left * scaleX));
  const workingTop = Math.max(0, Math.round(finalPadding.top * scaleY));
  const workingPadding = {
    left: workingLeft,
    top: workingTop,
    right: Math.max(0, working.width - workingLeft - workingSourceWidth),
    bottom: Math.max(0, working.height - workingTop - workingSourceHeight),
    axis,
    position: normalizeOutpaintPosition(position),
  };
  return {
    workingWidth: working.width,
    workingHeight: working.height,
    workingSourceWidth,
    workingSourceHeight,
    workingPadding,
    finalWidth,
    finalHeight,
    finalSourceWidth: sw,
    finalSourceHeight: sh,
    finalPadding,
    axis,
    position: normalizeOutpaintPosition(position),
    requestedScale: factor,
    effectiveScale: axis === 'horizontal' ? sh / finalHeight : sw / finalWidth,
    limited,
    needsRefine: working.width !== finalWidth || working.height !== finalHeight,
  };
}

function sameAsset(a, b) {
  const key = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  return key(a) === key(b);
}

function buildKrea2OutpaintGraph(params = {}) {
  const settings = params.settings || {};
  const imageName = String(params.imageName || '').trim();
  const identityLora = String(settings.krea2OutpaintLora || '').trim();
  if (!imageName) throw new Error('Krea 2 Expand needs a source image');
  if (!identityLora) throw new Error('Krea 2 Expand needs the Identity Edit LoRA');
  const dimensions = normalizeOutpaintDimensions(params.width, params.height);
  const padding = params.padding || {};
  if (![padding.left, padding.top, padding.right, padding.bottom].every(Number.isFinite)
    || !(padding.left || padding.top || padding.right || padding.bottom)) {
    throw new Error('Krea 2 Expand needs a larger output canvas');
  }

  const identityOverride = (Array.isArray(params.loras) ? params.loras : [])
    .find((lora) => sameAsset(lora && lora.name, identityLora));
  const identityEnabled = !identityOverride || identityOverride.on !== false;
  const graph = {
    unet: buildKrea2ModelLoader(settings, settings.unet),
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: settings.clip, type: settings.clipType || 'krea2', device: 'default' },
    },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.vae } },
    source: { class_type: 'LoadImage', inputs: { image: imageName } },
  };
  if (identityEnabled) {
    graph.identity_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['unet', 0],
        lora_name: identityLora,
        strength_model: identityOverride ? Math.max(0, Math.min(2, Number(identityOverride.strength) || 1)) : 1,
      },
    };
  }
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
  });

  let model = identityEnabled ? ['identity_lora', 0] : ['unet', 0];
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
  appendOutpaintFinish(graph, ['decode', 0], params, 'KreaStudio/outpaint');
  return graph;
}

module.exports = {
  MAX_OUTPAINT_PIXELS,
  MAX_FINAL_OUTPAINT_PIXELS,
  buildKrea2OutpaintGraph,
  calculateNativeOutpaintPlan,
  calculateOutpaintPadding,
  calculateOutpaintLayout,
  normalizeOutpaintDimensions,
  normalizeOutpaintPosition,
};
