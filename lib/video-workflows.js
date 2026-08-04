'use strict';

const LTX_MAX_SECONDS = 20;
const LTX_CAMERA_FPS = 24;
const LTX_CAMERA_MAX_SECONDS = 5;
const H3_FPS = 24;
const H3_MIN_SECONDS = 5;
const H3_MAX_SECONDS = 15;
const H3_BASE_SHORT_EDGE = 768;
const H3_MAX_PIXELS = 768 * 1344;
const H3_SIZE_SCALES = Object.freeze({
  0.75: 0.5,
  1: 0.75,
  1.75: 1,
});
const SCAIL_FPS = 16;
const SCAIL_FPS_CHOICES = [16, 24];
const SCAIL_MAX_SECONDS = 60;
const SCAIL_CHUNK_FRAMES = 81;
const SCAIL_OVERLAP_FRAMES = 5;
const SCAIL_STABLE_OVERLAP_FRAMES = 13;
const SCAIL_ADVANCE_FRAMES = SCAIL_CHUNK_FRAMES - SCAIL_OVERLAP_FRAMES;
const SCAIL_CHUNK_FRAME_CHOICES = [41, 61, 81];
const SCAIL_OVERLAP_FRAME_CHOICES = [5, 9, 13, 17];

function ltxDurationSeconds(requestedSeconds, maxSeconds = LTX_MAX_SECONDS) {
  const maximum = Math.max(1, Number(maxSeconds) || LTX_MAX_SECONDS);
  const requested = Number(requestedSeconds);
  return Math.max(1, Math.min(maximum, Number.isFinite(requested) ? requested : 5));
}

function ltxFramesForSeconds(seconds, fps = 25, maxSeconds = LTX_MAX_SECONDS) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 25));
  const raw = Math.round(ltxDurationSeconds(seconds, maxSeconds) * safeFps);
  return Math.max(25, Math.round((raw - 1) / 8) * 8 + 1);
}

function ltxCameraDurationSeconds(requestedSeconds, sourceDurationSeconds = 0, startSeconds = 0) {
  let seconds = ltxDurationSeconds(requestedSeconds, LTX_CAMERA_MAX_SECONDS);
  const sourceDuration = Number(sourceDurationSeconds);
  const start = Math.max(0, Number(startSeconds) || 0);
  if (Number.isFinite(sourceDuration) && sourceDuration > 0) {
    const available = Math.max(0, sourceDuration - start);
    if (available > 0) seconds = Math.min(seconds, available);
  }
  return Math.max(1, Math.min(LTX_CAMERA_MAX_SECONDS, seconds));
}

function h3DurationSeconds(requestedSeconds) {
  const requested = Number(requestedSeconds);
  return Math.max(H3_MIN_SECONDS, Math.min(
    H3_MAX_SECONDS,
    Number.isFinite(requested) ? requested : H3_MIN_SECONDS
  ));
}

function h3FramesForSeconds(seconds) {
  const raw = Math.max(5, Math.round(h3DurationSeconds(seconds) * H3_FPS));
  return raw + ((5 - (raw % 17) + 17) % 17);
}

function h3SizeScale(size = 1.75) {
  const requested = Number(size);
  if (requested <= 0.75) return H3_SIZE_SCALES[0.75];
  if (requested >= 1.75) return H3_SIZE_SCALES[1.75];
  return H3_SIZE_SCALES[1];
}

function h3Dimensions(width, height, size = 1.75) {
  const requestedWidth = Number(width);
  const requestedHeight = Number(height);
  // Accept normalized ratios such as (9 / 16, 1) as well as source pixel
  // dimensions. A minimum of 1 per side collapses every portrait ratio to 1:1.
  const sourceWidth = Number.isFinite(requestedWidth) && requestedWidth > 0 ? requestedWidth : 1344;
  const sourceHeight = Number.isFinite(requestedHeight) && requestedHeight > 0 ? requestedHeight : 768;
  const ratio = sourceWidth / sourceHeight;
  let nominalWidth;
  let nominalHeight;
  if (ratio >= 1) {
    nominalWidth = H3_BASE_SHORT_EDGE * ratio;
    nominalHeight = H3_BASE_SHORT_EDGE;
  } else {
    nominalWidth = H3_BASE_SHORT_EDGE;
    nominalHeight = H3_BASE_SHORT_EDGE / ratio;
  }
  if (nominalWidth * nominalHeight > H3_MAX_PIXELS) {
    const scale = Math.sqrt(H3_MAX_PIXELS / (nominalWidth * nominalHeight));
    nominalWidth *= scale;
    nominalHeight *= scale;
  }
  const scale = h3SizeScale(size);
  return {
    W: Math.max(32, Math.round((nominalWidth * scale) / 32) * 32),
    H: Math.max(32, Math.round((nominalHeight * scale) / 32) * 32),
  };
}

function h3ReferenceList(value, limit) {
  return (Array.isArray(value) ? value : [])
    .filter((asset) => asset && asset.name)
    .slice(0, limit)
    .map((asset) => ({
      name: String(asset.name),
      label: String(asset.label || ''),
      hasAudio: asset.hasAudio === true,
    }));
}

function normalizeH3References(value = {}) {
  return {
    images: h3ReferenceList(value.images, 9),
    videos: h3ReferenceList(value.videos, 3),
    audios: h3ReferenceList(value.audios, 3),
  };
}

async function buildMiniMaxH3Graph(opts = {}, settings = {}, deps = {}) {
  const nodeFromOrdered = deps.nodeFromOrdered || (async (classType, _ordered, links, overrides) => ({
    class_type: classType,
    inputs: Object.assign({}, links || {}, overrides || {}),
  }));
  const filterInputs = deps.filterInputs || (async (graph) => graph);
  const videoSuperResolutionNode = deps.rtxVideoSuperResolutionNode || ((images) => ({
    class_type: 'RTXVideoSuperResolution',
    inputs: { images, resize_type: 'scale by multiplier', 'resize_type.scale': 2, quality: 'ULTRA' },
  }));
  const mode = opts.mode === 'reference' ? 'reference' : 'frames';
  const steps = Math.max(1, Math.min(100, Math.round(Number(opts.steps) || 20)));
  const references = normalizeH3References(opts.references);
  if (mode === 'reference' && !references.images.length && !references.videos.length && !references.audios.length) {
    throw new Error('MiniMax H3 Reference mode needs at least one image, video, or audio reference.');
  }

  const graph = {
    model: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: mode === 'reference' ? settings.h3RefUnet : settings.h3Unet,
        weight_dtype: 'default',
      },
    },
    clip: {
      class_type: 'CLIPLoader',
      inputs: { clip_name: settings.h3Clip, type: 'minimax', device: 'default' },
    },
    video_vae: { class_type: 'VAELoader', inputs: { vae_name: settings.h3VideoVae } },
    audio_vae: { class_type: 'VAELoader', inputs: { vae_name: settings.h3AudioVae } },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: opts.seed } },
    sampler_select: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } },
    scheduler: {
      class_type: 'BasicScheduler',
      inputs: { model: ['model', 0], scheduler: 'simple', steps, denoise: 1 },
    },
  };

  if (opts.sageAttention) {
    graph.sage_attention = {
      class_type: 'PathchSageAttentionKJ',
      inputs: {
        model: ['model', 0],
        sage_attention: 'auto',
        allow_compile: false,
      },
    };
  }

  if (mode === 'reference') {
    const conditionInputs = {
      clip: ['clip', 0],
      vae: ['video_vae', 0],
      audio_vae: ['audio_vae', 0],
      prompt: String(opts.prompt || ''),
      width: opts.W,
      height: opts.H,
      length: opts.frames,
      ref_image_size: opts.refImageSize === 'max' ? 'max' : 'match',
    };
    references.images.forEach((asset, index) => {
      const key = `ref_image_${index}`;
      graph[key] = { class_type: 'LoadImage', inputs: { image: asset.name } };
      conditionInputs[`ref_images.ref_image_${index}`] = [key, 0];
    });
    for (let index = 0; index < references.videos.length; index += 1) {
      const asset = references.videos[index];
      const key = `ref_video_${index}`;
      graph[key] = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
        video: asset.name,
        force_rate: H3_FPS,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: opts.frames,
        skip_first_frames: 0,
        select_every_nth: 1,
        format: 'None',
      });
      conditionInputs[`ref_videos.ref_video_${index}`] = [key, 0];
      if (asset.hasAudio) conditionInputs[`ref_video_audios.ref_video_audio_${index}`] = [key, 2];
    }
    for (let index = 0; index < references.audios.length; index += 1) {
      const asset = references.audios[index];
      const key = `ref_audio_${index}`;
      graph[key] = await nodeFromOrdered('VHS_LoadAudioUpload', [], {}, {
        audio: asset.name,
        start_time: 0,
        duration: 0,
      });
      conditionInputs[`ref_audios.ref_audio_${index}`] = [key, 0];
    }
    graph.condition = { class_type: 'MiniMaxH3ReferenceToVideo', inputs: conditionInputs };
  } else {
    const conditionInputs = {
      clip: ['clip', 0],
      vae: ['video_vae', 0],
      prompt: String(opts.prompt || ''),
      width: opts.W,
      height: opts.H,
      length: opts.frames,
    };
    if (opts.firstImageName) {
      graph.first_image = { class_type: 'LoadImage', inputs: { image: opts.firstImageName } };
      conditionInputs.first_frame = ['first_image', 0];
    }
    if (opts.lastImageName) {
      graph.last_image = { class_type: 'LoadImage', inputs: { image: opts.lastImageName } };
      conditionInputs.last_frame = ['last_image', 0];
    }
    graph.condition = { class_type: 'MiniMaxH3ImageToVideo', inputs: conditionInputs };
  }

  graph.guider = {
    class_type: 'BasicGuider',
    inputs: {
      model: opts.sageAttention ? ['sage_attention', 0] : ['model', 0],
      conditioning: ['condition', 0],
    },
  };
  graph.sample = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0],
      guider: ['guider', 0],
      sampler: ['sampler_select', 0],
      sigmas: ['scheduler', 0],
      latent_image: ['condition', 1],
    },
  };
  graph.decode = {
    class_type: 'VAEDecode',
    inputs: { samples: ['sample', 0], vae: ['video_vae', 0] },
  };
  graph.decode_audio = {
    class_type: 'VAEDecodeAudio',
    inputs: { samples: ['sample', 0], vae: ['audio_vae', 0] },
  };
  let images = ['decode', 0];
  if (opts.fourK) {
    graph.vsr = videoSuperResolutionNode(images);
    images = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images, audio: ['decode_audio', 0], fps: H3_FPS, crf: 8 },
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

function scailMode(value) {
  if (value === 'direct' || value === 'chunked' || value === 'infinity') return value;
  return 'infinity';
}

function choice(value, allowed, fallback) {
  const n = Math.round(Number(value));
  return allowed.includes(n) ? n : fallback;
}

function normalizeScailChunkOptions(opts = {}) {
  const mode = scailMode(opts.mode);
  return {
    stableTracking: mode === 'chunked' && opts.stableTracking !== false,
    chunkFrames: choice(opts.chunkFrames, SCAIL_CHUNK_FRAME_CHOICES, SCAIL_CHUNK_FRAMES),
    overlapFrames: choice(opts.overlapFrames, SCAIL_OVERLAP_FRAME_CHOICES, SCAIL_STABLE_OVERLAP_FRAMES),
  };
}

function scailDurationSeconds(requestedSeconds, driveDurSeconds) {
  let seconds = Number(requestedSeconds);
  if (!Number.isFinite(seconds)) seconds = 5;
  seconds = Math.max(1, seconds);
  const driveDur = Number(driveDurSeconds);
  if (Number.isFinite(driveDur) && driveDur > 0) seconds = Math.min(seconds, driveDur);
  return Math.max(1, Math.min(SCAIL_MAX_SECONDS, seconds));
}

function normalizeScailFps(value) {
  const fps = Math.round(Number(value));
  return SCAIL_FPS_CHOICES.includes(fps) ? fps : SCAIL_FPS;
}

function scailFramesForSeconds(seconds, fps = SCAIL_FPS) {
  const raw = Math.floor(Math.max(1, Number(seconds) || 1) * normalizeScailFps(fps)) + 1;
  return Math.max(1, Math.round((raw - 1) / 4) * 4 + 1);
}

function scailSegments(totalFrames, opts = {}) {
  const target = Math.max(1, Math.round(Number(totalFrames) || 1));
  const chunkFrames = choice(opts.chunkFrames, SCAIL_CHUNK_FRAME_CHOICES, SCAIL_CHUNK_FRAMES);
  const overlapFrames = Math.min(
    choice(opts.overlapFrames, SCAIL_OVERLAP_FRAME_CHOICES, SCAIL_OVERLAP_FRAMES),
    chunkFrames - 1
  );
  const segments = [];
  let produced = 0;
  while (produced < target) {
    const index = segments.length;
    const startFrame = index === 0 ? 0 : Math.max(0, produced - overlapFrames);
    const remainingFromStart = target - startFrame;
    const length = Math.min(chunkFrames, remainingFromStart);
    const keepStart = index === 0 ? 0 : Math.min(overlapFrames, length - 1);
    const keepLength = Math.max(1, length - keepStart);
    segments.push({ index, startFrame, length, keepStart, keepLength });
    produced += keepLength;
    if (index > 200) throw new Error('SCAIL segment planning exceeded safety limit');
  }
  return segments;
}

function scailSamTrackArgs() {
  return [0.5, 4, 1];
}

function scailMaskArgs() {
  return ['', 'left_to_right', false];
}

function scailInfinitySamTrackArgs() {
  return [0.5, 0, 1];
}

function scailInfinityMaskArgs() {
  return ['', 'area', false];
}

function videoProcessInfo(baseInfo = {}, opts = {}) {
  const info = Object.assign({}, baseInfo, {
    processed: opts.kind,
    parentVideoId: opts.parentVideoId,
  });
  const recordedFrames = Math.max(0, Math.round(Number(baseInfo.frames) || 0));
  const priorSmooth = baseInfo.exactFrameCount === true || ![2, 3, 4].includes(Number(baseInfo.smooth))
    ? 1 : Number(baseInfo.smooth);
  const exactBaseFrames = recordedFrames ? Math.max(1, recordedFrames - (priorSmooth - 1)) : 0;
  if (opts.kind === 'interpolate') {
    const multiplier = Math.max(2, Math.round(Number(opts.multiplier) || 2));
    info.frames = exactBaseFrames ? (exactBaseFrames - 1) * multiplier + 1 : baseInfo.frames;
    info.fps = Math.round((Number(baseInfo.fps) || 16) * multiplier);
    info.smooth = multiplier;
    if (exactBaseFrames) info.exactFrameCount = true;
  } else if (opts.kind === 'upscale') {
    const scale = Math.max(1, Number(opts.scale) || 2);
    if (exactBaseFrames) {
      info.frames = exactBaseFrames;
      info.exactFrameCount = true;
    }
    if (baseInfo.width) info.width = Math.round(Number(baseInfo.width) * scale);
    if (baseInfo.height) info.height = Math.round(Number(baseInfo.height) * scale);
    info.fourK = true;
  }
  return info;
}

module.exports = {
  LTX_MAX_SECONDS,
  LTX_CAMERA_FPS,
  LTX_CAMERA_MAX_SECONDS,
  ltxDurationSeconds,
  ltxFramesForSeconds,
  ltxCameraDurationSeconds,
  H3_FPS,
  H3_MIN_SECONDS,
  H3_MAX_SECONDS,
  H3_SIZE_SCALES,
  h3DurationSeconds,
  h3FramesForSeconds,
  h3SizeScale,
  h3Dimensions,
  normalizeH3References,
  buildMiniMaxH3Graph,
  SCAIL_FPS,
  SCAIL_FPS_CHOICES,
  SCAIL_MAX_SECONDS,
  SCAIL_CHUNK_FRAMES,
  SCAIL_OVERLAP_FRAMES,
  SCAIL_STABLE_OVERLAP_FRAMES,
  SCAIL_ADVANCE_FRAMES,
  SCAIL_CHUNK_FRAME_CHOICES,
  SCAIL_OVERLAP_FRAME_CHOICES,
  scailMode,
  normalizeScailChunkOptions,
  scailDurationSeconds,
  normalizeScailFps,
  scailFramesForSeconds,
  scailSegments,
  scailSamTrackArgs,
  scailMaskArgs,
  scailInfinitySamTrackArgs,
  scailInfinityMaskArgs,
  videoProcessInfo,
};
