'use strict';

const { seedVr2DitInputs, seedVr2Profile } = require('./upscale-workflows');

function positiveInt(value) {
  const number = Math.round(Number(value) || 0);
  return number > 0 ? number : 0;
}

function seedVr2Seed(value) {
  const seed = Math.trunc(Number(value) || 0);
  const range = 2 ** 32;
  return ((seed % range) + range) % range;
}

function appendColorMatch(graph, image, key, options = {}) {
  graph[key] = {
    class_type: 'ColorMatch',
    inputs: {
      image_ref: ['source', 0],
      image_target: image,
      method: options.method || 'mkl',
      strength: Number.isFinite(Number(options.strength)) ? Number(options.strength) : 1,
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
      // Mix Studio generation seeds can exceed the unsigned 32-bit range,
      // while SeedVR2 validates this input against UINT32_MAX.
      seed: seedVr2Seed(params.seed),
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
  const seam = Math.max(64, Math.min(384, Math.round(Math.min(sourceWidth || 1000, sourceHeight || 1000) * .12)));
  graph.native_keep_mask = {
    class_type: 'SolidMask',
    inputs: {
      value: 1,
      width: sourceWidth,
      height: sourceHeight,
    },
  };
  graph.native_keep_feather = {
    class_type: 'FeatherMask',
    inputs: {
      mask: ['native_keep_mask', 0],
      left: positiveInt(padding.left) > 0 ? seam : 0,
      top: positiveInt(padding.top) > 0 ? seam : 0,
      right: positiveInt(padding.right) > 0 ? seam : 0,
      bottom: positiveInt(padding.bottom) > 0 ? seam : 0,
    },
  };
  graph.preserve_source = {
    class_type: 'ImageCompositeMasked',
    inputs: {
      destination: generated,
      source: ['source', 0],
      x: Math.max(0, positiveInt(padding.left)),
      y: Math.max(0, positiveInt(padding.top)),
      resize_source: false,
      mask: ['native_keep_feather', 0],
    },
  };
  return ['preserve_source', 0];
}

function appendOutpaintFinish(graph, decoded, params, filenamePrefix) {
  let output = decoded;
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
    // Match once, at final size. Reapplying a global transfer before and
    // after enlargement can flatten contrast and exaggerate color shifts.
    output = appendColorMatch(graph, ['final_scale', 0], 'color_match_final', {
      method: 'hm-mvgd-hm',
      strength: .82,
    });
  } else {
    output = appendColorMatch(graph, output, 'color_match');
  }
  output = appendNativePreserve(graph, output, params);
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: filenamePrefix } };
  return output;
}

module.exports = {
  appendOutpaintFinish,
  appendNativePreserve,
  seedVr2Seed,
};
