'use strict';

const LTX25_FPS = 24;
const LTX25_MAX_SECONDS = 20;
const LTX25_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
const LTX25_SIGMAS_BASE = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';
const LTX25_SIGMAS_REFINE = '0.909375, 0.725, 0.421875, 0.0';
const LTX25_QUALITY_BASE_STEPS = 30;
const LTX25_QUALITY_VIDEO_CFG = 3;
const LTX25_QUALITY_AUDIO_CFG = 7;
const LTX25_QUALITY_STG_SCALE = 1;
const LTX25_QUALITY_MODALITY_SCALE = 3;
const LTX25_QUALITY_DISTILLED_LORA_STRENGTH = 0.8;

function ltx25DurationSeconds(value) {
  const number = Number(value);
  return Math.max(1, Math.min(LTX25_MAX_SECONDS, Number.isFinite(number) ? number : 5));
}

function ltx25FramesForSeconds(value) {
  const seconds = ltx25DurationSeconds(value);
  // At 24 fps every whole-second duration is already 8n; the final +1 is
  // the temporal boundary required by the LTX video VAE.
  return Math.max(25, Math.round((seconds * LTX25_FPS) / 8) * 8 + 1);
}

function ltx25Dimensions(width, height) {
  const sourceWidth = Math.max(1, Number(width) || 1280);
  const sourceHeight = Math.max(1, Number(height) || 720);
  const scale = 1280 / Math.max(sourceWidth, sourceHeight);
  return {
    W: Math.max(256, Math.round((sourceWidth * scale) / 32) * 32),
    H: Math.max(256, Math.round((sourceHeight * scale) / 32) * 32),
  };
}

function loadAndPrepareImage(graph, key, imageName, width, height, compression) {
  graph[`${key}_load`] = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph[`${key}_resize`] = {
    class_type: 'ImageScale',
    inputs: {
      image: [`${key}_load`, 0], upscale_method: 'lanczos',
      width, height, crop: 'center',
    },
  };
  graph[`${key}_prep`] = {
    class_type: 'LTXVPreprocess',
    inputs: { image: [`${key}_resize`, 0], img_compression: compression },
  };
  return [`${key}_prep`, 0];
}

function emptyAudioNode(frames, fps) {
  return {
    class_type: 'LTXVEmptyLatentAudio',
    inputs: {
      frames_number: frames,
      frame_rate: fps,
      batch_size: 1,
      audio_vae: ['audio_vae', 0],
    },
  };
}

function addSampler(graph, key, options) {
  const {
    model, positive, negative, latent, seed,
    sigmas, samplerName, videoCfg = 1, audioCfg = 1, schedulerSteps = 0,
  } = options;
  graph[`${key}_noise`] = { class_type: 'RandomNoise', inputs: { noise_seed: seed } };
  graph[`${key}_guider`] = {
    class_type: 'LTXVDualCFGGuider',
    inputs: { model, positive, negative, video_cfg: videoCfg, audio_cfg: audioCfg },
  };
  graph[`${key}_sampler`] = {
    class_type: 'KSamplerSelect',
    inputs: { sampler_name: samplerName || (key === 'refine' ? 'euler' : 'euler_ancestral') },
  };
  graph[`${key}_sigmas`] = schedulerSteps
    ? {
      class_type: 'LTXVScheduler',
      inputs: {
        steps: schedulerSteps,
        max_shift: 2.05,
        base_shift: 0.95,
        stretch: true,
        terminal: 0.1,
        latent,
      },
    }
    : { class_type: 'ManualSigmas', inputs: { sigmas } };
  graph[`${key}_sample`] = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: [`${key}_noise`, 0], guider: [`${key}_guider`, 0],
      sampler: [`${key}_sampler`, 0], sigmas: [`${key}_sigmas`, 0], latent_image: latent,
    },
  };
  return [`${key}_sample`, 0];
}

function addQualityGuidance(graph, model) {
  graph.quality_stg = {
    class_type: 'LTXVSpatioTemporalGuidance',
    inputs: {
      model,
      scale: LTX25_QUALITY_STG_SCALE,
      blocks: '28',
      start_percent: 0,
      end_percent: 1,
    },
  };
  graph.quality_modality = {
    class_type: 'LTXVModalityGuidance',
    inputs: {
      model: ['quality_stg', 0],
      modality_scale: LTX25_QUALITY_MODALITY_SCALE,
      start_percent: 0,
      end_percent: 1,
    },
  };
  return ['quality_modality', 0];
}

function addTwoStagePath(graph, options) {
  const {
    baseModel, refineModel, positive, negative, firstImage, endImage,
    frames, fps, width, height, seed, audioLatent, quality,
  } = options;
  graph.video_latent = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: width / 2, height: height / 2, length: frames, batch_size: 1 },
  };
  let baseVideo = ['video_latent', 0];
  let basePositive = positive;
  let baseNegative = negative;
  if (firstImage && endImage) {
    graph.first_guide_base = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: basePositive, negative: baseNegative,
        vae: ['video_vae', 0], latent: baseVideo,
        image: firstImage, frame_idx: 0, strength: 0.7,
      },
    };
    graph.last_guide_base = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: ['first_guide_base', 0], negative: ['first_guide_base', 1],
        vae: ['video_vae', 0], latent: ['first_guide_base', 2],
        image: endImage, frame_idx: -1, strength: 0.7,
      },
    };
    basePositive = ['last_guide_base', 0];
    baseNegative = ['last_guide_base', 1];
    baseVideo = ['last_guide_base', 2];
  } else if (firstImage) {
    graph.first_frame_base = {
      class_type: 'LTXVImgToVideoInplace',
      inputs: {
        vae: ['video_vae', 0], image: firstImage, latent: baseVideo, strength: 0.7, bypass: false,
      },
    };
    baseVideo = ['first_frame_base', 0];
  }
  if (!audioLatent) graph.audio_latent = emptyAudioNode(frames, fps);
  const audioSource = audioLatent || ['audio_latent', 0];
  graph.av_latent = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: baseVideo, audio_latent: audioSource },
  };
  addSampler(graph, 'base', {
    model: baseModel,
    positive: basePositive,
    negative: baseNegative,
    latent: ['av_latent', 0],
    seed,
    sigmas: LTX25_SIGMAS_BASE,
    samplerName: 'euler_ancestral',
    videoCfg: quality ? LTX25_QUALITY_VIDEO_CFG : 1,
    audioCfg: quality ? LTX25_QUALITY_AUDIO_CFG : 1,
    schedulerSteps: quality ? LTX25_QUALITY_BASE_STEPS : 0,
  });
  graph.base_av = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['base_sample', 0] } };

  let baseUpscaleSource = ['base_av', 0];
  let refinePositive = basePositive;
  let refineNegative = baseNegative;
  if (endImage) {
    graph.crop_guides_base = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: basePositive, negative: baseNegative, latent: baseUpscaleSource },
    };
    refinePositive = ['crop_guides_base', 0];
    refineNegative = ['crop_guides_base', 1];
    baseUpscaleSource = ['crop_guides_base', 2];
  }

  graph.upscale_model = {
    class_type: 'LatentUpscaleModelLoader',
    inputs: { model_name: options.upscaler },
  };
  graph.upscale = {
    class_type: 'LTXVLatentUpsampler',
    inputs: {
      samples: baseUpscaleSource, upscale_model: ['upscale_model', 0], vae: ['video_vae', 0],
    },
  };
  let refineVideo = ['upscale', 0];
  if (firstImage && endImage) {
    graph.first_guide_refine = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: refinePositive, negative: refineNegative,
        vae: ['video_vae', 0], latent: refineVideo,
        image: firstImage, frame_idx: 0, strength: 1,
      },
    };
    graph.last_guide_refine = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: ['first_guide_refine', 0], negative: ['first_guide_refine', 1],
        vae: ['video_vae', 0], latent: ['first_guide_refine', 2],
        image: endImage, frame_idx: -1, strength: 1,
      },
    };
    refinePositive = ['last_guide_refine', 0];
    refineNegative = ['last_guide_refine', 1];
    refineVideo = ['last_guide_refine', 2];
  } else if (firstImage) {
    graph.first_frame_refine = {
      class_type: 'LTXVImgToVideoInplace',
      inputs: {
        vae: ['video_vae', 0], image: firstImage, latent: refineVideo, strength: 1, bypass: false,
      },
    };
    refineVideo = ['first_frame_refine', 0];
  }
  graph.refine_av = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: refineVideo, audio_latent: ['base_av', 1] },
  };
  addSampler(graph, 'refine', {
    model: refineModel,
    positive: refinePositive,
    negative: refineNegative,
    latent: ['refine_av', 0],
    seed,
    sigmas: LTX25_SIGMAS_REFINE,
    samplerName: 'euler',
  });
  graph.sampled_av = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['refine_sample', 0] } };
  if (endImage) {
    graph.crop_guides = {
      class_type: 'LTXVCropGuides',
      inputs: {
        positive: refinePositive, negative: refineNegative, latent: ['sampled_av', 0],
      },
    };
  }
  return {
    video: endImage ? ['crop_guides', 2] : ['sampled_av', 0],
    audio: ['sampled_av', 1],
    stages: 2,
  };
}

async function buildLtx25Graph(imageName, opts = {}, settings = {}, deps = {}) {
  const filterInputs = deps.filterInputs || (async (graph) => graph);
  const graph = {};
  const fps = LTX25_FPS;
  const frames = Math.max(25, Math.round((Math.max(1, Number(opts.frames) || 121) - 1) / 8) * 8 + 1);
  const width = Math.max(256, Math.round((Number(opts.W) || 1280) / 32) * 32);
  const height = Math.max(256, Math.round((Number(opts.H) || 720) / 32) * 32);
  const seed = Math.max(0, Math.floor(Number(opts.seed) || 0));
  const quality = opts.quality === true || opts.fast === false;

  graph.model = {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: quality ? settings.ltx25QualityUnet : settings.ltx25Unet,
      weight_dtype: 'default',
    },
  };
  let model = ['model', 0];
  if (typeof deps.chainModelLoras === 'function') {
    model = deps.chainModelLoras(graph, model, opts.loras, 'ltx25_lora_');
  }
  let baseModel = model;
  let refineModel = model;
  if (quality) {
    baseModel = addQualityGuidance(graph, model);
    graph.quality_distilled_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model,
        lora_name: settings.ltx25DistilledLora,
        strength_model: LTX25_QUALITY_DISTILLED_LORA_STRENGTH,
      },
    };
    refineModel = ['quality_distilled_lora', 0];
  }
  graph.video_vae = { class_type: 'VAELoader', inputs: { vae_name: settings.ltx25VideoVae } };
  graph.audio_vae = { class_type: 'VAELoader', inputs: { vae_name: settings.ltx25AudioVae } };
  graph.clip = {
    class_type: 'CLIPLoader',
    inputs: {
      clip_name: quality ? settings.ltx25QualityTextEncoder : settings.ltx25TextEncoder,
      type: 'ltxv',
      device: 'default',
    },
  };
  if (opts.enhance) {
    graph.prompt_clip = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: settings.ltx25PromptEnhancer, type: 'ltxv', device: 'default' },
    };
  }

  const compression = Math.max(0, Math.min(100, Number(opts.imgCompression) || 18));
  const firstImage = opts.bypass ? null : loadAndPrepareImage(
    graph, 'first', imageName, width, height, compression,
  );
  const endImage = opts.endImageName ? loadAndPrepareImage(
    graph, 'last', opts.endImageName, width, height, compression,
  ) : null;

  let prompt = String(opts.prompt || '').trim();
  if (opts.enhance) {
    const inputs = Object.assign({ clip: ['prompt_clip', 0], prompt },
      typeof deps.textGenInputs === 'function' ? deps.textGenInputs(seed, 600) : {});
    if (firstImage) inputs.image = firstImage;
    graph.refine_prompt = { class_type: 'TextGenerateLTX2Prompt', inputs };
    graph.preview_prompt = { class_type: 'PreviewAny', inputs: { source: ['refine_prompt', 0] } };
    prompt = ['refine_prompt', 0];
  }
  graph.positive = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } };
  graph.negative = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['clip', 0], text: String(opts.negativePrompt || LTX25_NEGATIVE) },
  };
  graph.conditioning = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['positive', 0], negative: ['negative', 0], frame_rate: fps },
  };

  let encodedAudio = null;
  if (opts.audioName && typeof deps.audioLatentNodes === 'function') {
    encodedAudio = deps.audioLatentNodes(graph, opts.audioName);
  }
  const result = addTwoStagePath(graph, {
    baseModel,
    refineModel,
    positive: ['conditioning', 0],
    negative: ['conditioning', 1],
    firstImage,
    endImage,
    frames,
    fps,
    width,
    height,
    seed,
    quality,
    upscaler: settings.ltx25Upscaler,
    audioLatent: encodedAudio,
  });

  graph.decode = {
    class_type: 'VAEDecodeTiled',
    inputs: {
      samples: result.video, vae: ['video_vae', 0],
      tile_size: 768, overlap: 64, temporal_size: 4096, temporal_overlap: 32,
    },
  };
  graph.audio_decode = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: result.audio, audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  if (typeof deps.rifeSmooth === 'function') frameSource = await deps.rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK && typeof deps.rtxVideoSuperResolutionNode === 'function') {
    graph.vsr = deps.rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  const outputFps = fps * ([2, 3].includes(Number(opts.smooth)) ? Number(opts.smooth) : 1);
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_decode', 0], fps: outputFps },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  if (opts.makePoster) {
    graph.poster_pick = {
      class_type: 'ImageFromBatch',
      inputs: { image: ['decode', 0], batch_index: 0, length: 1 },
    };
    graph.poster_save = {
      class_type: 'SaveImage',
      inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' },
    };
  }
  return filterInputs(graph);
}

module.exports = {
  LTX25_FPS,
  LTX25_MAX_SECONDS,
  LTX25_NEGATIVE,
  LTX25_SIGMAS_BASE,
  LTX25_SIGMAS_REFINE,
  LTX25_QUALITY_BASE_STEPS,
  LTX25_QUALITY_DISTILLED_LORA_STRENGTH,
  buildLtx25Graph,
  ltx25Dimensions,
  ltx25DurationSeconds,
  ltx25FramesForSeconds,
};
