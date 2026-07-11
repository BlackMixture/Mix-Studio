'use strict';

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function buildKrea2LatentInput(options = {}) {
  const width = Math.max(64, Math.round(Number(options.width) || 1024));
  const height = Math.max(64, Math.round(Number(options.height) || 1024));
  const batch = Math.max(1, Math.round(Number(options.batch) || 1));
  const imageName = String(options.imageName || '').trim();

  if (!imageName) {
    return {
      nodes: {
        latent: {
          class_type: 'EmptySD3LatentImage',
          inputs: { width, height, batch_size: batch },
        },
      },
      latent: ['latent', 0],
      denoise: 1,
    };
  }

  const nodes = {
    source: { class_type: 'LoadImage', inputs: { image: imageName } },
    source_scale: {
      class_type: 'ImageScale',
      inputs: {
        image: ['source', 0],
        upscale_method: 'lanczos',
        width,
        height,
        crop: 'center',
      },
    },
    latent: {
      class_type: 'VAEEncode',
      inputs: { pixels: ['source_scale', 0], vae: ['vae', 0] },
    },
  };
  let latent = ['latent', 0];
  if (batch > 1) {
    nodes.latent_batch = {
      class_type: 'RepeatLatentBatch',
      inputs: { samples: latent, amount: batch },
    };
    latent = ['latent_batch', 0];
  }
  return {
    nodes,
    latent,
    denoise: clampNumber(options.denoise, 0.05, 1, 0.45),
  };
}

/** DA3 depth-map estimation nodes for a ComfyUI input image. When width and
 * height are omitted the source is analyzed at its native size. */
function buildDepthMapNodes(options = {}) {
  const imageName = String(options.imageName || '').trim();
  if (!imageName) throw new Error('A depth map needs a source image');
  const scaled = Number(options.width) > 0 && Number(options.height) > 0;
  const nodes = {
    depth_source: { class_type: 'LoadImage', inputs: { image: imageName } },
  };
  if (scaled) {
    nodes.depth_source_scale = {
      class_type: 'ImageScale',
      inputs: {
        image: ['depth_source', 0],
        upscale_method: 'lanczos',
        width: Math.max(64, Math.round(Number(options.width))),
        height: Math.max(64, Math.round(Number(options.height))),
        crop: 'center',
      },
    };
  }
  nodes.depth_model = {
    class_type: 'DownloadAndLoadDepthAnythingV3Model',
    inputs: {
      model: String(options.depthModel || 'da3_large.safetensors'),
      precision: 'auto',
      attention: 'auto',
    },
  };
  nodes.depth_map = {
    class_type: 'DepthAnything_V3',
    inputs: {
      da3_model: ['depth_model', 0],
      images: [scaled ? 'depth_source_scale' : 'depth_source', 0],
      normalization_mode: 'V2-Style',
      resize_method: 'resize',
      invert_depth: false,
      keep_model_size: false,
    },
  };
  return {
    nodes,
    image: ['depth_map', 0],
    source: ['depth_source', 0],
    scaledSource: [scaled ? 'depth_source_scale' : 'depth_source', 0],
  };
}

/** Standalone graph that just renders the DA3 depth map for a source image. */
function buildDepthPreviewGraph(options = {}) {
  const depth = buildDepthMapNodes(options);
  return Object.assign({}, depth.nodes, {
    save: {
      class_type: 'SaveImage',
      inputs: { images: depth.image, filename_prefix: 'KreaStudio/depth_preview' },
    },
  });
}

function buildKrea2DepthControl(options = {}) {
  const imageName = String(options.imageName || '').trim();
  if (!imageName) throw new Error('Krea 2 depth control needs a source image');
  const loraName = String(options.loraName || '').trim();
  if (!loraName) throw new Error('Krea 2 depth control needs a Control LoRA');

  const depth = buildDepthMapNodes({
    imageName,
    depthModel: options.depthModel,
    width: Number(options.width) || 1024,
    height: Number(options.height) || 1024,
  });
  return {
    nodes: Object.assign({}, depth.nodes, {
      depth_encode: {
        class_type: 'Krea2ControlImageEncode',
        inputs: {
          control_image: depth.image,
          vae: ['vae', 0],
          latent: options.latent,
          resize: 'match_latent_size',
          upscale_method: 'lanczos',
          crop: 'center',
          channel_mode: 'rgb',
          normalize: 'none',
          invert: false,
          batch_mode: 'independent_images',
        },
      },
      depth_lora: {
        class_type: 'Krea2ControlLoRALoader',
        inputs: {
          model: options.model,
          lora_name: loraName,
          strength: clampNumber(options.strength, 0.05, 2, 1),
        },
      },
      depth_apply: {
        class_type: 'Krea2ControlApply',
        inputs: { model: ['depth_lora', 0], control_latent: ['depth_encode', 0] },
      },
    }),
    model: ['depth_apply', 0],
  };
}

module.exports = {
  buildDepthMapNodes,
  buildDepthPreviewGraph,
  buildKrea2DepthControl,
  buildKrea2LatentInput,
};
