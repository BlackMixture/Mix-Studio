'use strict';

const { seedVr2DitInputs, seedVr2Profile } = require('./upscale-workflows');

function positiveInt(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? number : 0;
}

function appendColorMatch(graph, image, key) {
  graph[key] = {
    class_type: 'ColorMatch',
    inputs: {
      image_ref: ['source', 0],
      image_target: image,
      method: 'mkl',
      strength: 1,
      multithread: true,
    },
  };
  return [key, 0];
}

function appendSeedVr2Refine(graph, image, params) {
  const settings = params.settings || {};
  const finalWidth = positiveInt(params.editOutpaintFinalWidth);
  const finalHeight = positiveInt(params.editOutpaintFinalHeight);
  const profile = seedVr2Profile(
    settings,
    params.editOutpaintRefineProfile || 'balanced',
    params.seedVr2Models,
    params.editOutpaintRefineNoise || 'low'
  );
  graph.outpaint_refine_dit = {
    class_type: 'SeedVR2LoadDiTModel',
    inputs: seedVr2DitInputs(Object.assign({}, settings, { seedvr2Dit: profile.ditModel })),
  };
  graph.outpaint_refine_vae = {
    class_type: 'SeedVR2LoadVAEModel',
    inputs: {
      model: settings.seedvr2Vae,
      device: 'cuda:0',
      encode_tiled: true,
      encode_tile_size: 1024,
      encode_tile_overlap: 256,
      decode_tiled: true,
      decode_tile_size: 1024,
      decode_tile_overlap: 256,
      tile_debug: 'false',
      offload_device: 'cpu',
      cache_model: false,
    },
  };
  graph.outpaint_refine = {
    class_type: 'SeedVR2VideoUpscaler',
    inputs: {
      image,
      dit: ['outpaint_refine_dit', 0],
      vae: ['outpaint_refine_vae', 0],
      seed: Number(params.seed) || 0,
      resolution: Math.min(finalWidth, finalHeight),
      max_resolution: Math.max(finalWidth, finalHeight),
      batch_size: 1,
      uniform_batch_size: false,
      color_correction: profile.colorCorrection,
      temporal_overlap: 0,
      prepend_frames: 0,
      input_noise_scale: profile.inputNoiseScale,
      latent_noise_scale: 0,
      offload_device: 'cpu',
      enable_debug: false,
    },
  };
  return ['outpaint_refine', 0];
}

function appendNativePreserve(graph, generated, params) {
  if (params.composite !== true) return generated;
  const padding = params.editOutpaintFinalPadding || params.padding || {};
  const sourceWidth = positiveInt(params.editOutpaintFinalSourceWidth);
  const sourceHeight = positiveInt(params.editOutpaintFinalSourceHeight);
  const seam = Math.max(16, Math.min(64, Math.round(Math.min(sourceWidth || 1000, sourceHeight || 1000) * .025)));
  graph.native_padded = {
    class_type: 'ImagePadForOutpaint',
    inputs: {
      image: ['source', 0],
      left: Math.max(0, positiveInt(padding.left)),
      top: Math.max(0, positiveInt(padding.top)),
      right: Math.max(0, positiveInt(padding.right)),
      bottom: Math.max(0, positiveInt(padding.bottom)),
      feathering: seam,
    },
  };
  graph.native_keep_mask = { class_type: 'InvertMask', inputs: { mask: ['native_padded', 1] } };
  graph.preserve_source = {
    class_type: 'ImageCompositeMasked',
    inputs: {
      destination: generated,
      source: ['native_padded', 0],
      x: 0,
      y: 0,
      resize_source: false,
      mask: ['native_keep_mask', 0],
    },
  };
  return ['preserve_source', 0];
}

function appendOutpaintFinish(graph, decoded, params, filenamePrefix) {
  let output = appendColorMatch(graph, decoded, 'color_match');
  const finalWidth = positiveInt(params.editOutpaintFinalWidth);
  const finalHeight = positiveInt(params.editOutpaintFinalHeight);
  const hasNativeCanvas = finalWidth > 0 && finalHeight > 0;
  if (hasNativeCanvas) {
    if (params.editOutpaintRefine === true) output = appendSeedVr2Refine(graph, output, params);
    graph.final_scale = {
      class_type: 'ImageScale',
      inputs: {
        image: output,
        upscale_method: 'lanczos',
        width: finalWidth,
        height: finalHeight,
        crop: 'disabled',
      },
    };
    output = appendColorMatch(graph, ['final_scale', 0], 'color_match_final');
  }
  output = appendNativePreserve(graph, output, params);
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: filenamePrefix } };
  return output;
}

module.exports = {
  appendOutpaintFinish,
  appendNativePreserve,
};
