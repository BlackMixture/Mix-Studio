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

module.exports = { buildKrea2LatentInput };
