'use strict';

const { h3EffectiveModelName, h3TurboCompatibility } = require('./h3-model-variants');

const LTX_MAX_SECONDS = 20;
const LTX_CAMERA_FPS = 24;
const LTX_CAMERA_MAX_SECONDS = 5;
const H3_FPS = 24;
const H3_MIN_SECONDS = 5;
const H3_MAX_SECONDS = 15;
const H3_LONG_CONTEXT_MAX_SECONDS = 120;
const H3_LONG_CONTEXT_FRAMES = 22;
const H3_BASE_SHORT_EDGE = 768;
const H3_MAX_PIXELS = 768 * 1344;
const H3_TURBO_REFERENCE_CHUNK_SECONDS = 5;
const H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES = H3_FPS * H3_TURBO_REFERENCE_CHUNK_SECONDS;
const H3_TURBO_REFERENCE_CHUNK_FRAMES = 124;
const H3_XL_SIZE = 3;
const H3_XL_SCALE = 10 / 7;
const H3_SIZE_SCALES = Object.freeze({
  0.75: 0.5,
  1: 0.75,
  1.75: 1,
  [H3_XL_SIZE]: H3_XL_SCALE,
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

function h3EffectiveDurationSeconds(seconds) {
  return h3FramesForSeconds(seconds) / H3_FPS;
}

function h3LongContextSegments(requestedSeconds, options = {}) {
  const seconds = Math.max(
    H3_MIN_SECONDS,
    Math.min(H3_LONG_CONTEXT_MAX_SECONDS, Number(requestedSeconds) || H3_MIN_SECONDS)
  );
  const rawFrames = Math.max(5, Math.round(seconds * H3_FPS));
  const targetFrames = rawFrames + ((5 - (rawFrames % 17) + 17) % 17);
  if (Number(options.maxGenerationFrames) > 0
    && Number(options.maxGenerationFrames) <= H3_TURBO_REFERENCE_CHUNK_FRAMES) {
    const segments = [{
      index: 0,
      startFrame: 0,
      generationFrames: H3_TURBO_REFERENCE_CHUNK_FRAMES,
      keepFrames: Math.min(H3_TURBO_REFERENCE_CHUNK_FRAMES, targetFrames),
      trimFrames: 0,
    }];
    let deliveredFrames = segments[0].keepFrames;
    while (deliveredFrames < targetFrames) {
      const keepFrames = Math.min(
        H3_TURBO_REFERENCE_CHUNK_FRAMES - H3_LONG_CONTEXT_FRAMES,
        targetFrames - deliveredFrames,
      );
      segments.push({
        index: segments.length,
        startFrame: Math.max(0, deliveredFrames - H3_LONG_CONTEXT_FRAMES),
        generationFrames: H3_TURBO_REFERENCE_CHUNK_FRAMES,
        keepFrames,
        trimFrames: H3_LONG_CONTEXT_FRAMES,
      });
      deliveredFrames += keepFrames;
    }
    return segments;
  }
  const targetUnits = Math.max(7, Math.round((targetFrames - 5) / 17));
  const segmentCount = targetUnits <= 21
    ? 1
    : Math.ceil((targetUnits - 21) / 20) + 1;
  const firstUnits = segmentCount === 1
    ? targetUnits
    : Math.min(21, targetUnits - 6 * (segmentCount - 1));
  let remainingUnits = targetUnits - firstUnits;
  const units = [firstUnits];
  for (let index = 1; index < segmentCount; index += 1) {
    const remainingSegments = segmentCount - index;
    const current = Math.max(6, Math.min(
      20,
      Math.round(remainingUnits / remainingSegments)
    ));
    units.push(current);
    remainingUnits -= current;
  }
  return units.map((deliveredUnits, index) => {
    const trimFrames = index === 0 ? 0 : H3_LONG_CONTEXT_FRAMES;
    const keepFrames = 17 * deliveredUnits + (index === 0 ? 5 : 0);
    return {
      index,
      generationFrames: keepFrames + trimFrames,
      keepFrames,
      trimFrames,
    };
  });
}

function h3LongContextSegmentPrompt(prompt, segment, totalSegments) {
  const value = String(prompt || '').trim();
  const index = Math.max(0, Math.round(Number(segment?.index) || 0));
  if (index === 0) return value;
  const total = Math.max(index + 1, Math.round(Number(totalSegments) || index + 1));
  return [
    `[video continuation · clip ${index + 1} of ${total}]`,
    'Continuity airlock: for the opening two seconds, preserve the previous clip\'s exact closing framing, cast, environment, lighting, eyelines, and ongoing sound. Keep subtle natural motion such as breathing or a small weight shift; do not freeze. After the hold, continue the action forward without replaying earlier events or adding contradictory subjects.',
    value,
  ].filter(Boolean).join('\n\n');
}

function h3TurboReferenceSegments(totalFrames) {
  const targetFrames = Math.max(
    H3_TURBO_REFERENCE_CHUNK_FRAMES,
    Math.min(h3FramesForSeconds(H3_MAX_SECONDS), Math.round(Number(totalFrames) || H3_TURBO_REFERENCE_CHUNK_FRAMES))
  );
  const count = Math.max(1, Math.ceil(
    (targetFrames - 4) / H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES
  ));
  return Array.from({ length: count }, (_, index) => {
    const startFrame = index * H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES;
    const keepFrames = index < count - 1
      ? H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES
      : targetFrames - startFrame;
    return {
      index,
      startFrame,
      generationFrames: count === 1 ? targetFrames : H3_TURBO_REFERENCE_CHUNK_FRAMES,
      keepFrames,
    };
  });
}

function h3SizeScale(size = 1.75) {
  const requested = Number(size);
  if (requested >= H3_XL_SIZE) return H3_SIZE_SCALES[H3_XL_SIZE];
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
      w: Math.max(0, Math.min(16384, Math.round(Number(asset.w) || 0))),
      h: Math.max(0, Math.min(16384, Math.round(Number(asset.h) || 0))),
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
  const turbo = opts.turbo === true;
  const longContext = opts.longContext && typeof opts.longContext === 'object'
    ? {
      chainId: String(opts.longContext.chainId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80),
      clipIndex: Math.max(0, Math.min(9998, Math.round(Number(opts.longContext.clipIndex) || 0))),
      contextFrames: H3_LONG_CONTEXT_FRAMES,
    }
    : null;
  if (longContext && !longContext.chainId) throw new Error('MiniMax H3 Long context needs a valid chain ID.');
  const turboCompatibility = h3TurboCompatibility(settings, mode);
  if (turbo && turboCompatibility.supported !== true) {
    const error = new Error(turboCompatibility.reason);
    error.code = 'h3_turbo_model_incompatible';
    throw error;
  }
  const referenceTurbo = turbo && mode === 'reference';
  const steps = turbo
    ? Math.max(4, Math.min(100, Math.round(Number(opts.steps) || (referenceTurbo ? 6 : 4))))
    : Math.max(1, Math.min(100, Math.round(Number(opts.steps) || 20)));
  const turboNativeSampler = turbo && !referenceTurbo && opts.turboNativeSampler === true;
  const samplingModelNode = turbo
    ? (referenceTurbo ? 'turbo_sampling' : (turboNativeSampler ? 'native_av_sampling' : 'turbo_lora'))
    : 'model';
  const turboStrength = Math.max(0.8, Math.min(1.2, Number.isFinite(Number(opts.turboStrength))
    ? Number(opts.turboStrength) : 1));
  const references = normalizeH3References(opts.references);
  if (mode === 'reference' && !references.images.length && !references.videos.length && !references.audios.length) {
    throw new Error('MiniMax H3 Reference mode needs at least one image, video, or audio reference.');
  }

  const graph = {
    model: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: h3EffectiveModelName(settings, mode),
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
    scheduler: {
      class_type: 'BasicScheduler',
      inputs: { model: [samplingModelNode, 0], scheduler: 'simple', steps, denoise: 1 },
    },
  };

  if (turbo) {
    if (referenceTurbo) {
      // Kijai's LightX2V checkpoint is already converted to ComfyUI's native
      // diffusion_model.* LoRA layout. Keep it on the stock loader, then use
      // the creator's adaptive sampler with MiniMax's explicit 12/3 AV shift.
      graph.turbo_lora = {
        class_type: 'LoraLoaderModelOnly',
        inputs: {
          model: ['model', 0],
          lora_name: settings.h3RefTurboLora,
          strength_model: turboStrength,
        },
      };
      graph.turbo_sampling = {
        class_type: 'MiniMaxH3SigmaShift',
        inputs: { model: ['turbo_lora', 0], shift_video: 12, shift_audio: 3 },
      };
      graph.turbo_sampler = { class_type: 'MiniMaxH3TurboSampler', inputs: {} };
    } else {
      graph.turbo_lora = {
        class_type: 'MiniMaxH3TurboLoRA',
        inputs: {
          model: ['model', 0],
          lora_name: settings.h3TurboLora,
          strength: turboStrength,
          low_vram: opts.turboLowVram === true,
        },
      };
    }
    if (!referenceTurbo && turboNativeSampler) {
      // Current ComfyUI cores map H3's packed audio latent onto the video
      // schedule through ModelSamplingAV. Apply that 12/3 model schedule once,
      // then use stock Euler; the creator's older sampler would remap audio a
      // second time and can corrupt it on these cores.
      graph.native_av_sampling = {
        class_type: 'MiniMaxH3SigmaShift',
        inputs: { model: ['turbo_lora', 0], shift_video: 12, shift_audio: 3 },
      };
      graph.sampler_select = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
    } else if (!referenceTurbo) {
      graph.turbo_sampler = { class_type: 'MiniMaxH3TurboSampler', inputs: {} };
    }
  } else {
    graph.sampler_select = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'res_multistep' } };
  }

  if (opts.sageAttention) {
    graph.sage_attention = {
      class_type: 'PathchSageAttentionKJ',
      inputs: {
        model: [samplingModelNode, 0],
        sage_attention: 'auto',
        allow_compile: false,
      },
    };
  }

  const turboReferencePlan = referenceTurbo && references.videos.length
    && opts.frames > H3_TURBO_REFERENCE_CHUNK_FRAMES
    ? h3TurboReferenceSegments(opts.frames)
    : [];
  const suppliedTurboReferenceSegment = referenceTurbo && references.videos.length
    && opts.turboReferenceSegment && Number(opts.turboReferenceSegment.generationFrames) > 0
    ? opts.turboReferenceSegment
    : null;
  const requestedTurboSegmentIndex = Math.round(Number(opts.turboReferenceSegment?.index));
  const turboReferenceSegment = suppliedTurboReferenceSegment
    || turboReferencePlan.find((segment) => segment.index === requestedTurboSegmentIndex)
    || null;
  if (referenceTurbo && references.videos.length && !turboReferenceSegment) {
    throw new Error('Long MiniMax H3 Reference Turbo videos need a planned five-second chunk segment.');
  }

  const addReferenceCondition = async ({ conditionKey, segment = null }) => {
    const conditionInputs = {
      clip: ['clip', 0],
      vae: ['video_vae', 0],
      audio_vae: ['audio_vae', 0],
      prompt: String(opts.prompt || ''),
      width: opts.W,
      height: opts.H,
      length: segment ? segment.generationFrames : opts.frames,
      ref_image_size: opts.refImageSize === 'max' ? 'max' : 'match',
    };
    references.images.forEach((asset, index) => {
      const key = `ref_image_${index}`;
      if (!graph[key]) graph[key] = { class_type: 'LoadImage', inputs: { image: asset.name } };
      conditionInputs[`ref_images.ref_image_${index}`] = [key, 0];
    });
    for (let index = 0; index < references.videos.length; index += 1) {
      const asset = references.videos[index];
      const key = segment ? `ref_video_${segment.index}_${index}` : `ref_video_${index}`;
      graph[key] = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
        video: asset.name,
        force_rate: H3_FPS,
        custom_width: 0,
        custom_height: 0,
        frame_load_cap: segment ? segment.generationFrames : opts.frames,
        skip_first_frames: segment ? segment.startFrame : 0,
        select_every_nth: 1,
        format: 'None',
      });
      conditionInputs[`ref_videos.ref_video_${index}`] = [key, 0];
      if (asset.hasAudio) conditionInputs[`ref_video_audios.ref_video_audio_${index}`] = [key, 2];
    }
    for (let index = 0; index < references.audios.length; index += 1) {
      const asset = references.audios[index];
      const key = segment ? `ref_audio_${segment.index}_${index}` : `ref_audio_${index}`;
      graph[key] = await nodeFromOrdered('VHS_LoadAudioUpload', [], {}, {
        audio: asset.name,
        start_time: segment ? segment.startFrame / H3_FPS : 0,
        duration: segment ? segment.generationFrames / H3_FPS : 0,
      });
      conditionInputs[`ref_audios.ref_audio_${index}`] = [key, 0];
    }
    graph[conditionKey] = { class_type: 'MiniMaxH3ReferenceToVideo', inputs: conditionInputs };
  };

  if (mode === 'reference') {
    await addReferenceCondition({ conditionKey: 'condition', segment: turboReferenceSegment });
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

  const addSamplingBranch = (conditionKey, latentConditionKey = conditionKey, index = null) => {
    const suffix = index === null ? '' : `_${index}`;
    const guiderKey = `guider${suffix}`;
    const sampleKey = index === null ? 'sample' : `ks_${index}`;
    const decodeKey = `decode${suffix}`;
    const decodeAudioKey = `decode_audio${suffix}`;
    const videoKey = `video${suffix}`;
    const saveKey = `save${suffix}`;
    graph[guiderKey] = {
      class_type: 'BasicGuider',
      inputs: {
        model: opts.sageAttention ? ['sage_attention', 0] : [samplingModelNode, 0],
        conditioning: [conditionKey, 0],
      },
    };
    graph[sampleKey] = {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['noise', 0],
        guider: [guiderKey, 0],
        sampler: [turbo && (referenceTurbo || !turboNativeSampler) ? 'turbo_sampler' : 'sampler_select', 0],
        sigmas: ['scheduler', 0],
        latent_image: [latentConditionKey, 1],
      },
    };
    if (longContext) {
      graph[`context_save${suffix}`] = {
        class_type: 'MiniMaxH3MotionContextSaveLatent',
        inputs: {
          latent: [sampleKey, 0],
          filename_prefix: `KreaStudio/h3_context/${longContext.chainId}/clip`,
          clip_index: longContext.clipIndex + 1,
        },
      };
    }
    graph[decodeKey] = {
      class_type: 'VAEDecode',
      inputs: { samples: [sampleKey, 0], vae: ['video_vae', 0] },
    };
    graph[decodeAudioKey] = {
      class_type: 'VAEDecodeAudio',
      inputs: { samples: [sampleKey, 0], vae: ['audio_vae', 0] },
    };
    let images = [decodeKey, 0];
    let audio = [decodeAudioKey, 0];
    if (longContext && longContext.clipIndex > 0) {
      const trimKey = `context_trim${suffix}`;
      graph[trimKey] = {
        class_type: 'MiniMaxH3MotionContextTrim',
        inputs: {
          images,
          audio,
          trim_frames: ['motion_context', 1],
          fps: H3_FPS,
          match_tail: true,
        },
      };
      images = [trimKey, 0];
      audio = [trimKey, 1];
    }
    if (opts.fourK) {
      const vsrKey = `vsr${suffix}`;
      graph[vsrKey] = videoSuperResolutionNode(images);
      images = [vsrKey, 0];
    }
    graph[videoKey] = {
      class_type: 'CreateVideo',
      inputs: { images, audio, fps: H3_FPS, crf: 8 },
    };
    graph[saveKey] = {
      class_type: 'SaveVideo',
      inputs: { video: [videoKey, 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
    };
    return decodeKey;
  };

  let samplingConditionKey = 'condition';
  if (longContext && longContext.clipIndex > 0) {
    graph.context_load = {
      class_type: 'MiniMaxH3MotionContextLoadLatent',
      inputs: {
        latent_path: `KreaStudio/h3_context/${longContext.chainId}`,
        clip_index: longContext.clipIndex,
      },
    };
    graph.motion_context = {
      class_type: 'MiniMaxH3MotionContext',
      inputs: {
        conditioning: ['condition', 0],
        vae: ['video_vae', 0],
        latent: ['condition', 1],
        context_length: String(longContext.contextFrames),
        audio_context_length: longContext.contextFrames,
        context_latent: ['context_load', 0],
      },
    };
    samplingConditionKey = 'motion_context';
  }
  const posterSource = addSamplingBranch(samplingConditionKey, 'condition');
  if (opts.makePoster) {
    graph.poster_pick = {
      class_type: 'ImageFromBatch',
      inputs: { image: [posterSource, 0], batch_index: 0, length: 1 },
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
    info.upscaleEngine = opts.engine === 'seedvr2' ? 'seedvr2' : 'rtx';
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
  H3_LONG_CONTEXT_MAX_SECONDS,
  H3_LONG_CONTEXT_FRAMES,
  H3_XL_SIZE,
  H3_XL_SCALE,
  H3_SIZE_SCALES,
  H3_TURBO_REFERENCE_CHUNK_SECONDS,
  H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES,
  H3_TURBO_REFERENCE_CHUNK_FRAMES,
  h3DurationSeconds,
  h3FramesForSeconds,
  h3EffectiveDurationSeconds,
  h3LongContextSegments,
  h3LongContextSegmentPrompt,
  h3TurboReferenceSegments,
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
