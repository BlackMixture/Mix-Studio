'use strict';

const REGION_COLORS = ['#46B4E6', '#E68246', '#82E646', '#E646B4', '#E6E646', '#46E6C8'];

const DEFAULT_REGION_SETTINGS = {
  seamFeather: 0.08,
  blendOverride: 0,
  refStrength: 0.3,
  refStartPercent: 0,
  refEndPercent: 0.6,
  refFeather: 0.06,
  baseStrength: 1,
  includeBackground: true,
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeLoraName(value) {
  const name = cleanText(value);
  return name && name !== 'None' ? name : 'None';
}

function normalizeRegions(input) {
  const source = Array.isArray(input) ? input : [];
  const out = [];
  source.forEach((region, index) => {
    if (!region || region.enabled === false || region.enable === false) return;
    const description = cleanText(region.description || region.desc || region.prompt);
    const lora = normalizeLoraName(region.lora || region.loraName);
    const refImageName = cleanText(region.refImageName || region.ref_image || region.refImage || region.imageName);
    if (!description && lora === 'None' && !refImageName) return;

    const x = clampNumber(region.x, 0, 1, 0.1);
    const y = clampNumber(region.y, 0, 1, 0.1);
    let w = clampNumber(region.w ?? region.width, 0.03, 1, 0.35);
    let h = clampNumber(region.h ?? region.height, 0.03, 1, 0.5);
    if (x + w > 1) w = Math.max(0.03, 1 - x);
    if (y + h > 1) h = Math.max(0.03, 1 - y);

    out.push({
      id: cleanText(region.id) || `region-${index + 1}`,
      description,
      x,
      y,
      w,
      h,
      lora,
      strength: clampNumber(region.strength, -2, 2, 1),
      enabled: true,
      refImageName,
      color: cleanText(region.color) || REGION_COLORS[out.length % REGION_COLORS.length],
    });
  });
  return out;
}

const SPATIAL_WORDS = /\b(left|right|top|bottom|upper|lower|center|centre|middle|foreground|background|corner|above|below|beside|behind|front)\b/i;

/** Boxes are soft guidance for desc-only regions (the regional node only
 *  masks LoRA/reference deltas) — spatial LANGUAGE in the caption is what
 *  actually pins placement. Derive it from the box when the user's
 *  description doesn't include any. */
function positionPhrase(region) {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  const hSpot = cx < 0.38 ? 'left' : cx > 0.62 ? 'right' : 'center';
  const vSpot = cy < 0.38 ? 'top' : cy > 0.62 ? 'bottom' : 'middle';
  if (region.w > 0.85 && region.h > 0.85) return 'filling the entire frame';
  if (region.w > 0.85) return `spanning the full width across the ${vSpot === 'middle' ? 'center' : vSpot} of the frame`;
  if (region.h > 0.85) return `occupying the full ${hSpot === 'center' ? 'middle column' : hSpot + ' half'} of the frame`;
  if (vSpot === 'middle' && hSpot === 'center') return 'positioned in the center of the frame';
  if (vSpot === 'middle') return `positioned on the ${hSpot} side of the frame`;
  if (hSpot === 'center') return `positioned in the ${vSpot} center of the frame`;
  return `positioned in the ${vSpot} ${hSpot} of the frame`;
}

function elementDesc(region) {
  const desc = region.description || 'subject';
  if (SPATIAL_WORDS.test(desc)) return desc;
  return `${desc}, ${positionPhrase(region)}`;
}

function regionalPromptBuilderJson(regionsInput) {
  const regions = normalizeRegions(regionsInput);
  return JSON.stringify(regions.map((region) => ({
    type: 'obj',
    x: region.x,
    y: region.y,
    w: region.w,
    h: region.h,
    desc: elementDesc(region),
    // Region colors are a UI affordance only — putting them in the caption
    // as color_palette makes Krea2 paint literal swatches into the image.
    palette: [],
  })));
}

function regionalRegionsJson(regionsInput) {
  const regions = normalizeRegions(regionsInput);
  return JSON.stringify(regions.map((region, index) => ({
    name: `region${index + 1}`,
    lora: region.lora,
    strength: region.strength,
    enable: true,
    ref_image: region.refImageName || '',
  })));
}

function regionalBboxes(regionsInput, width, height) {
  const wPx = Math.max(1, Math.round(Number(width) || 1024));
  const hPx = Math.max(1, Math.round(Number(height) || 1024));
  return normalizeRegions(regionsInput).map((region) => ({
    x: Math.round(region.x * wPx),
    y: Math.round(region.y * hPx),
    w: Math.round(region.w * wPx),
    h: Math.round(region.h * hPx),
  }));
}

/** CreateBoundingBoxes editor_state: PIXEL-space boxes with width/height
 *  keys and metadata nested (see comfy_extras/nodes_bounding_boxes.py
 *  boxes_to_regions). Fractions or w/h keys collapse every box to zero. */
function regionalEditorState(regionsInput, width, height) {
  const wPx = Math.max(1, Math.round(Number(width) || 1024));
  const hPx = Math.max(1, Math.round(Number(height) || 1024));
  return normalizeRegions(regionsInput).map((region) => ({
    x: Math.round(region.x * wPx),
    y: Math.round(region.y * hPx),
    width: Math.round(region.w * wPx),
    height: Math.round(region.h * hPx),
    metadata: {
      type: 'obj',
      text: '',
      desc: region.description || 'subject',
      palette: region.color ? [region.color] : [],
    },
  }));
}

function regionSettings(input) {
  const src = input || {};
  return {
    seamFeather: clampNumber(src.seamFeather, 0, 0.5, DEFAULT_REGION_SETTINGS.seamFeather),
    blendOverride: clampNumber(src.blendOverride, 0, 1, DEFAULT_REGION_SETTINGS.blendOverride),
    refStrength: clampNumber(src.refStrength, 0, 2, DEFAULT_REGION_SETTINGS.refStrength),
    refStartPercent: clampNumber(src.refStartPercent, 0, 1, DEFAULT_REGION_SETTINGS.refStartPercent),
    refEndPercent: clampNumber(src.refEndPercent, 0, 1, DEFAULT_REGION_SETTINGS.refEndPercent),
    refFeather: clampNumber(src.refFeather, 0, 0.5, DEFAULT_REGION_SETTINGS.refFeather),
    baseStrength: clampNumber(src.baseStrength, 0, 2, DEFAULT_REGION_SETTINGS.baseStrength),
    includeBackground: src.includeBackground !== false,
  };
}

function addBaseLoaders(graph, settings) {
  const s = settings || {};
  graph.unet = { class_type: 'UNETLoader', inputs: { unet_name: s.unet, weight_dtype: 'default' } };
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: s.clip, type: s.clipType || 'krea2', device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: s.vae } };
}

function appendLoraChain(graph, loras) {
  let model = ['unet', 0];
  let clip = ['clip', 0];
  let n = 0;
  for (const lora of loras || []) {
    if (!lora || !lora.on || !lora.name) continue;
    n += 1;
    const key = `lora${n}`;
    const strength = Number(lora.strength);
    graph[key] = {
      class_type: 'LoraLoader',
      inputs: {
        model,
        clip,
        lora_name: lora.name,
        strength_model: Number.isFinite(strength) ? strength : 1,
        strength_clip: Number.isFinite(strength) ? strength : 1,
      },
    };
    model = [key, 0];
    clip = [key, 1];
  }
  return { model, clip };
}

function addRegionalPrompting(graph, params, model, clip) {
  const width = Math.round(Number(params.width) || 1024);
  const height = Math.round(Number(params.height) || 1024);
  const prompt = cleanText(params.enhancedText || params.prompt);
  const regions = normalizeRegions(params.regions);
  const opts = regionSettings(params.regionSettings);

  graph.prompt_builder = {
    class_type: 'Ideogram4PromptBuilderKJ',
    inputs: {
      width,
      height,
      high_level_description: prompt,
      background: prompt || 'a coherent image background',
      style: 'none', // V3 DynamicCombo: flat key serialization (API format)
      aesthetics: '',
      lighting: '',
      medium: '',
      style_palette_data: '[]',
      elements_data: regionalPromptBuilderJson(regions),
      bg_brightness: 25,
    },
  };
  // Boxes come from the prompt builder itself (bboxes output, slot 2) —
  // its elements_data is a plain JSON string, which is the only box source
  // that survives ComfyUI's API-format validation (raw dict arrays don't).
  graph.regional = {
    class_type: 'Krea2RegionalMultiLoRAV3',
    inputs: {
      model,
      clip,
      canvas_width: width,
      canvas_height: height,
      regions_json: regionalRegionsJson(regions),
      split_mode: regions.length ? 'bbox' : 'auto_vertical',
      seam_feather: opts.seamFeather,
      blend_override: opts.blendOverride,
      ref_strength: opts.refStrength,
      ref_start_percent: opts.refStartPercent,
      ref_end_percent: opts.refEndPercent,
      ref_feather: opts.refFeather,
      bboxes: ['prompt_builder', 2],
      vae: ['vae', 0],
      base_strength: opts.baseStrength,
      include_background: opts.includeBackground,
    },
  };

  return {
    model: ['regional', 0],
    clip: ['regional', 1],
    promptText: ['prompt_builder', 0],
    regions,
  };
}

function buildRegionalT2IGraph(params) {
  const p = params || {};
  const graph = {};
  addBaseLoaders(graph, p.settings);
  const chain = appendLoraChain(graph, p.loras);
  const regional = addRegionalPrompting(graph, p, chain.model, chain.clip);

  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: regional.clip, text: regional.promptText } };
  graph.neg = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } };
  graph.latent = {
    class_type: 'EmptySD3LatentImage',
    inputs: {
      width: Math.round(Number(p.width) || 1024),
      height: Math.round(Number(p.height) || 1024),
      batch_size: Math.max(1, Math.round(Number(p.batch) || 1)),
    },
  };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: regional.model,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['latent', 0],
      seed: Math.floor(Number(p.seed) || 0),
      steps: Math.max(1, Math.round(Number(p.steps) || 12)),
      cfg: Number.isFinite(Number(p.cfg)) ? Number(p.cfg) : 1,
      sampler_name: 'euler',
      scheduler: 'beta',
      denoise: 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/gen' } };
  return graph;
}

function buildKrea2InpaintGraph(params) {
  const p = params || {};
  const graph = {};
  addBaseLoaders(graph, p.settings);
  const chain = appendLoraChain(graph, p.loras);
  const regions = normalizeRegions(p.regions);
  let model = chain.model;
  let clip = chain.clip;
  let textSource = cleanText(p.enhancedText || p.prompt);

  if (regions.length) {
    const regional = addRegionalPrompting(graph, p, model, clip);
    model = regional.model;
    clip = regional.clip;
    textSource = regional.promptText;
  }

  graph.source = { class_type: 'LoadImage', inputs: { image: p.imageName } };
  graph.mask_load = { class_type: 'LoadImage', inputs: { image: p.maskImageName } };
  graph.mask = { class_type: 'ImageToMask', inputs: { image: ['mask_load', 0], channel: 'red' } };
  graph.grow_mask = { class_type: 'GrowMask', inputs: { mask: ['mask', 0], expand: 6, tapered_corners: true } };
  // Soft inpaint: Krea2 is a flow/DiT model — VAEEncodeForInpaint's grey
  // erase makes it reproduce flat grey. Encode the intact source and mask
  // the noise instead; denoise controls how strongly the area changes.
  graph.encode = {
    class_type: 'VAEEncode',
    inputs: { pixels: ['source', 0], vae: ['vae', 0] },
  };
  graph.inpaint_latent = {
    class_type: 'SetLatentNoiseMask',
    inputs: { samples: ['encode', 0], mask: ['grow_mask', 0] },
  };
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip, text: textSource } };
  graph.neg = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } };
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['inpaint_latent', 0],
      seed: Math.floor(Number(p.seed) || 0),
      steps: Math.max(1, Math.round(Number(p.steps) || 16)),
      cfg: Number.isFinite(Number(p.cfg)) ? Number(p.cfg) : 1,
      sampler_name: 'euler',
      scheduler: 'beta',
      denoise: clampNumber(p.denoise, 0.05, 1, 0.9),
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/edit' } };
  return graph;
}

function hasActiveRegions(input) {
  return normalizeRegions(input).length > 0;
}

module.exports = {
  DEFAULT_REGION_SETTINGS,
  normalizeRegions,
  regionalPromptBuilderJson,
  regionalRegionsJson,
  regionalBboxes,
  buildRegionalT2IGraph,
  buildKrea2InpaintGraph,
  hasActiveRegions,
};
