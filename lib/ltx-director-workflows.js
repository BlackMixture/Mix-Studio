'use strict';

const path = require('path');

const DIRECTOR_VERSION = 1;
const DIRECTOR_FPS = 24;
const DIRECTOR_MAX_SECONDS = 1000;
const DIRECTOR_MAX_FRAMES = DIRECTOR_FPS * DIRECTOR_MAX_SECONDS;
const DIRECTOR_MAX_WINDOW_FRAMES = DIRECTOR_FPS * 20;
const DIRECTOR_MAX_SEGMENTS = 256;
const DIRECTOR_MAX_PROMPT = 4000;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.ogg', '.aac']);

function finiteInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function promptText(value, label = 'Prompt') {
  const text = String(value || '').trim();
  if (text.length > DIRECTOR_MAX_PROMPT) throw new Error(`${label} is too long`);
  return text;
}

function normalizeDirectorAssetName(value, kind) {
  const name = String(value || '').trim().replace(/\\/g, '/');
  if (!name) throw new Error(`${kind} segment is missing its media file`);
  if (name.length > 512 || name.startsWith('/') || /^[a-zA-Z]:/.test(name) || /[\0\r\n]/.test(name)) {
    throw new Error(`${kind} segment has an invalid media file`);
  }
  const parts = name.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${kind} segment has an invalid media file`);
  }
  const extension = path.posix.extname(name).toLowerCase();
  const allowed = kind === 'image' ? IMAGE_EXTENSIONS : kind === 'video' ? VIDEO_EXTENSIONS : AUDIO_EXTENSIONS;
  if (!allowed.has(extension)) throw new Error(`${kind} segment uses an unsupported file type`);
  return name;
}

function normalizeBounds(segment, durationFrames, label) {
  const start = finiteInt(segment.start, 0);
  const length = finiteInt(segment.length, 1);
  if (start < 0 || length < 1 || start >= durationFrames || start + length > durationFrames) {
    throw new Error(`${label} segment falls outside the project timeline`);
  }
  return { start, length };
}

function normalizeId(value, prefix, index) {
  const id = String(value || `${prefix}-${index + 1}`).trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return id || `${prefix}-${index + 1}`;
}

function rejectOverlaps(segments, label) {
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    if (current.start < previous.start + previous.length) {
      throw new Error(`${label} segments cannot overlap`);
    }
  }
}

function normalizeMainSegments(value, durationFrames) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > DIRECTOR_MAX_SEGMENTS) throw new Error('Director main track has too many segments');
  const segments = source.map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry : {};
    const type = item.type === 'image' ? 'image' : 'text';
    const bounds = normalizeBounds(item, durationFrames, 'Main track');
    const segment = {
      id: normalizeId(item.id, 'main', index),
      type,
      start: bounds.start,
      length: bounds.length,
      prompt: promptText(item.prompt, 'Segment prompt'),
    };
    if (type === 'image') {
      segment.imageFile = normalizeDirectorAssetName(item.imageFile || item.assetName || item.name, 'image');
      segment.fileName = String(item.fileName || path.posix.basename(segment.imageFile)).slice(0, 255);
      segment.guideStrength = clamp(Number.isFinite(Number(item.guideStrength)) ? Number(item.guideStrength) : 1, 0, 1);
      segment.isEndFrame = item.isEndFrame === true;
    }
    return segment;
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  rejectOverlaps(segments, 'Main track');
  return segments;
}

function normalizeAudioSegments(value, durationFrames) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > DIRECTOR_MAX_SEGMENTS) throw new Error('Director audio track has too many segments');
  const segments = source.map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry : {};
    const bounds = normalizeBounds(item, durationFrames, 'Audio track');
    const audioFile = normalizeDirectorAssetName(item.audioFile || item.assetName || item.name, 'audio');
    const trimStart = Math.max(0, finiteInt(item.trimStart, 0));
    const sourceFrames = Math.max(trimStart + bounds.length, finiteInt(item.audioDurationFrames || item.sourceFrames, trimStart + bounds.length));
    return {
      id: normalizeId(item.id, 'audio', index),
      type: 'audio',
      start: bounds.start,
      length: bounds.length,
      trimStart,
      audioDurationFrames: sourceFrames,
      audioFile,
      fileName: String(item.fileName || path.posix.basename(audioFile)).slice(0, 255),
    };
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  rejectOverlaps(segments, 'Audio track');
  return segments;
}

function normalizeMotionSegments(value, durationFrames) {
  const source = Array.isArray(value) ? value : [];
  if (source.length > DIRECTOR_MAX_SEGMENTS) throw new Error('Director IC guidance track has too many segments');
  const segments = source.map((entry, index) => {
    const item = entry && typeof entry === 'object' ? entry : {};
    const bounds = normalizeBounds(item, durationFrames, 'IC guidance track');
    const isStaticImage = item.isStaticImage === true || item.kind === 'image';
    const videoFile = normalizeDirectorAssetName(item.videoFile || item.assetName || item.name, isStaticImage ? 'image' : 'video');
    const trimStart = Math.max(0, finiteInt(item.trimStart, 0));
    const sourceFrames = Math.max(trimStart + bounds.length, finiteInt(item.videoDurationFrames || item.sourceFrames, trimStart + bounds.length));
    return {
      id: normalizeId(item.id, 'motion', index),
      type: 'motion_video',
      isStaticImage,
      start: bounds.start,
      length: bounds.length,
      trimStart,
      videoDurationFrames: sourceFrames,
      videoFile,
      fileName: String(item.fileName || path.posix.basename(videoFile)).slice(0, 255),
      videoStrength: clamp(Number.isFinite(Number(item.videoStrength)) ? Number(item.videoStrength) : 1, 0, 1),
      videoAttentionStrength: clamp(Number.isFinite(Number(item.videoAttentionStrength)) ? Number(item.videoAttentionStrength) : 0.65, 0, 1),
      resampleMode: ['nearest', 'bilinear', 'bicubic'].includes(item.resampleMode) ? item.resampleMode : 'nearest',
    };
  }).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  rejectOverlaps(segments, 'IC guidance track');
  return segments;
}

function normalizeDirectorProject(value = {}) {
  if (!value || typeof value !== 'object' || Number(value.version) !== DIRECTOR_VERSION) {
    throw new Error(`Director project version ${DIRECTOR_VERSION} is required`);
  }
  if (value.fps != null && Number(value.fps) !== DIRECTOR_FPS) throw new Error('Director projects use a fixed 24 fps timeline');
  const durationFrames = finiteInt(value.durationFrames, NaN);
  if (!Number.isSafeInteger(durationFrames) || durationFrames < 1 || durationFrames > DIRECTOR_MAX_FRAMES) {
    throw new Error('Director project length must be between 1 and 24,000 frames');
  }
  const rangeSource = value.range && typeof value.range === 'object' ? value.range : {};
  const startFrame = finiteInt(rangeSource.startFrame, 0);
  const lengthFrames = finiteInt(rangeSource.lengthFrames, Math.min(120, durationFrames));
  if (startFrame < 0 || lengthFrames < 1 || lengthFrames > DIRECTOR_MAX_WINDOW_FRAMES || startFrame + lengthFrames > durationFrames) {
    throw new Error('Director generation range must stay inside the project and be no longer than 20 seconds');
  }
  const globalPrompt = promptText(value.globalPrompt, 'Global prompt');
  const segments = normalizeMainSegments(value.segments, durationFrames);
  const audioSegments = normalizeAudioSegments(value.audioSegments, durationFrames);
  const motionSegments = normalizeMotionSegments(value.motionSegments, durationFrames);
  if (!globalPrompt && !segments.some((segment) => segment.prompt)) throw new Error('Director needs a global or segment prompt');

  const settings = value.settings && typeof value.settings === 'object' ? value.settings : {};
  return {
    version: DIRECTOR_VERSION,
    fps: DIRECTOR_FPS,
    durationFrames,
    range: { startFrame, lengthFrames },
    globalPrompt,
    segments,
    audioSegments,
    motionSegments,
    settings: {
      inpaintAudio: settings.inpaintAudio !== false,
      overrideAudio: settings.overrideAudio === true && motionSegments.some((segment) => !segment.isStaticImage),
      icLoraName: String(settings.icLoraName || '').trim().replace(/\//g, '\\').slice(0, 512),
      icLoraStrength: clamp(Number.isFinite(Number(settings.icLoraStrength)) ? Number(settings.icLoraStrength) : 1, -100, 100),
      epsilon: clamp(Number.isFinite(Number(settings.epsilon)) ? Number(settings.epsilon) : 0.001, 0.0001, 0.99),
      resizeMethod: ['maintain aspect ratio', 'stretch to fit', 'pad', 'pad green', 'crop'].includes(settings.resizeMethod)
        ? settings.resizeMethod : 'maintain aspect ratio',
      imgCompression: clamp(finiteInt(settings.imgCompression, 18), 0, 100),
    },
  };
}

function directorPromptInputs(project) {
  const startFrame = project.range.startFrame;
  const endFrame = startFrame + project.range.lengthFrames;
  const prompts = [];
  const lengths = [];
  let currentCursor = startFrame;
  let pendingGap = 0;
  for (const segment of project.segments) {
    if (segment.start + segment.length <= startFrame) continue;
    if (segment.start >= endFrame) break;
    const effectiveStart = Math.max(segment.start, startFrame);
    if (effectiveStart > currentCursor) {
      const gapLength = Math.min(effectiveStart, endFrame) - currentCursor;
      if (lengths.length) lengths[lengths.length - 1] += gapLength;
      else pendingGap += gapLength;
    }
    const clippedEnd = Math.min(segment.start + segment.length, endFrame);
    const clippedLength = clippedEnd - effectiveStart;
    lengths.push(clippedLength + pendingGap);
    prompts.push(segment.prompt || '');
    pendingGap = 0;
    currentCursor = Math.max(currentCursor, segment.start + segment.length);
  }
  const clampedCursor = Math.min(currentCursor, endFrame);
  if (lengths.length && clampedCursor < endFrame) lengths[lengths.length - 1] += endFrame - clampedCursor;
  const strengths = project.segments
    .filter((segment) => segment.type === 'image' && segment.start + segment.length > startFrame && segment.start < endFrame)
    .map((segment) => segment.guideStrength.toFixed(2));
  return {
    localPrompts: prompts.join(' | '),
    segmentLengths: lengths.join(','),
    guideStrength: strengths.join(','),
  };
}

function directorTimelineData(project) {
  return JSON.stringify({
    mainTrackEnabled: true,
    audioTrackEnabled: project.audioSegments.length > 0,
    motionTrackEnabled: project.motionSegments.length > 0,
    showFilenames: true,
    overrideAudio: project.settings.overrideAudio,
    inpaint_audio: project.settings.inpaintAudio,
    global_prompt: project.globalPrompt,
    retakeMode: false,
    normalStartFrame: project.range.startFrame,
    normalDurationFrames: project.range.lengthFrames,
    segments: project.segments,
    motionSegments: project.motionSegments,
    audioSegments: project.audioSegments,
  });
}

function directorAssetNames(project) {
  return [...new Set([
    ...project.segments.filter((segment) => segment.type === 'image').map((segment) => segment.imageFile),
    ...project.audioSegments.map((segment) => segment.audioFile),
    ...project.motionSegments.map((segment) => segment.videoFile),
  ])];
}

function directorOutputFrames(project) {
  return Math.ceil((project.range.lengthFrames - 1) / 8) * 8 + 1;
}

function directorWindowProject(project) {
  const rangeStart = project.range.startFrame;
  const rangeEnd = rangeStart + project.range.lengthFrames;
  const clip = (segment) => {
    const start = Math.max(segment.start, rangeStart);
    const end = Math.min(segment.start + segment.length, rangeEnd);
    if (end <= start) return null;
    const offset = start - segment.start;
    const next = Object.assign({}, segment, { start: start - rangeStart, length: end - start });
    if (segment.type === 'audio' || segment.type === 'motion_video') {
      next.trimStart = Math.max(0, Number(segment.trimStart || 0) + offset);
    }
    return next;
  };
  return Object.assign({}, project, {
    durationFrames: project.range.lengthFrames,
    range: { startFrame: 0, lengthFrames: project.range.lengthFrames },
    segments: project.segments.map(clip).filter(Boolean),
    audioSegments: project.audioSegments.map(clip).filter(Boolean),
    motionSegments: project.motionSegments.map(clip).filter(Boolean),
  });
}

async function buildLtxDirectorGraph(project, opts, settings, helpers) {
  const {
    nodeFromOrdered, filterInputs, chainModelLoras, rifeSmooth,
    rtxVideoSuperResolutionNode, getObjectInfo,
  } = helpers;
  const graph = {};
  const windowProject = directorWindowProject(project);
  const promptInputs = directorPromptInputs(windowProject);
  const frames = directorOutputFrames(project);
  const fps = DIRECTOR_FPS;
  const modelWidth = Math.max(256, Math.round(Number(opts.W || 1280) / 64) * 64);
  const modelHeight = Math.max(256, Math.round(Number(opts.H || 720) / 64) * 64);

  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.model_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ckpt', 0], lora_name: settings.ltxDistilledLora, strength_model: 0.5 },
  };
  const ltxModel = chainModelLoras(graph, ['model_lora', 0], opts.loras, 'director_lora');
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.ltxTextEncoder, settings.ltxCkpt, 'default'],
    {},
    { text_encoder: settings.ltxTextEncoder, ckpt_name: settings.ltxCkpt },
  );
  graph.te_lora = {
    class_type: 'LoraLoader',
    inputs: {
      model: ['ckpt', 0], clip: ['te', 0], lora_name: settings.ltxGemmaLora,
      strength_model: 0.7, strength_clip: 0.7,
    },
  };
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.director = {
    class_type: 'LTXDirector',
    inputs: {
      model: ltxModel,
      clip: ['te_lora', 1],
      audio_vae: ['audio_vae', 0],
      global_prompt: windowProject.globalPrompt,
      start_second: 0,
      end_second: windowProject.range.lengthFrames / fps,
      duration_seconds: windowProject.range.lengthFrames / fps,
      start_frame: 0,
      end_frame: windowProject.range.lengthFrames,
      duration_frames: windowProject.range.lengthFrames,
      timeline_data: directorTimelineData(windowProject),
      use_custom_audio: windowProject.audioSegments.length > 0,
      use_custom_motion: windowProject.motionSegments.length > 0,
      inpaint_audio: windowProject.settings.inpaintAudio,
      local_prompts: promptInputs.localPrompts,
      segment_lengths: promptInputs.segmentLengths,
      epsilon: windowProject.settings.epsilon,
      frame_rate: fps,
      display_mode: 'seconds',
      guide_strength: promptInputs.guideStrength,
      custom_width: modelWidth,
      custom_height: modelHeight,
      resize_method: windowProject.settings.resizeMethod,
      divisible_by: 32,
      img_compression: windowProject.settings.imgCompression,
      override_audio: windowProject.settings.overrideAudio,
    },
  };
  graph.zero_negative = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['director', 1] } };
  graph.conditioning = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['director', 1], negative: ['zero_negative', 0], frame_rate: fps },
  };

  const icLoraName = windowProject.motionSegments.length ? (windowProject.settings.icLoraName || settings.ltxDirectorIcLora || 'None') : 'None';
  const guideInputs = (positive, negative, latent, scaleBy) => ({
    positive,
    negative,
    vae: ['ckpt', 2],
    latent,
    guide_data: ['director', 4],
    motion_guide_data: ['director', 5],
    model: ['director', 0],
    ic_lora_name: icLoraName,
    ic_lora_strength: windowProject.settings.icLoraStrength,
    scale_by: scaleBy,
    upscale_method: 'bicubic',
    image_attention_strength: 1,
    crop: 'center',
    auto_snap_ic_grid: true,
    use_tiled_encode: false,
    tile_size: 256,
    tile_overlap: 64,
    retake_mode: false,
  });
  graph.guide_base = { class_type: 'LTXDirectorGuide', inputs: guideInputs(['conditioning', 0], ['conditioning', 1], ['director', 2], 0.5) };
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['guide_base', 2], audio_latent: ['director', 3] },
  };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: opts.seed } };
  graph.guider1 = {
    class_type: 'CFGGuider',
    inputs: { model: ['guide_base', 3], positive: ['guide_base', 0], negative: ['guide_base', 1], cfg: 1 },
  };
  graph.sampler_sel1 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } };
  graph.sigmas1 = await nodeFromOrdered('ManualSigmas', [opts.sigmasBase]);
  graph.samp1 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: { noise: ['noise', 0], guider: ['guider1', 0], sampler: ['sampler_sel1', 0], sigmas: ['sigmas1', 0], latent_image: ['concat1', 0] },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp1', 0] } };
  graph.crop1 = {
    class_type: 'LTXDirectorCropGuides',
    inputs: { positive: ['guide_base', 0], negative: ['guide_base', 1], latent: ['sep1', 0] },
  };
  graph.ups_model = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: settings.ltxUpscaler } };
  graph.ups = {
    class_type: 'LTXVLatentUpsampler',
    inputs: { samples: ['crop1', 2], upscale_model: ['ups_model', 0], vae: ['ckpt', 2] },
  };
  graph.guide_refine = { class_type: 'LTXDirectorGuide', inputs: guideInputs(['crop1', 0], ['crop1', 1], ['ups', 0], 1) };
  graph.guider2 = {
    class_type: 'CFGGuider',
    inputs: { model: ['guide_refine', 3], positive: ['guide_refine', 0], negative: ['guide_refine', 1], cfg: 1 },
  };
  graph.sampler_sel2 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_cfg_pp' } };
  graph.sigmas2 = await nodeFromOrdered('ManualSigmas', [opts.sigmasRefine]);
  graph.concat2 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['guide_refine', 2], audio_latent: ['sep1', 1] },
  };
  graph.samp2 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: { noise: ['noise', 0], guider: ['guider2', 0], sampler: ['sampler_sel2', 0], sigmas: ['sigmas2', 0], latent_image: ['concat2', 0] },
  };
  graph.sep2 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp2', 0] } };
  graph.crop2 = {
    class_type: 'LTXDirectorCropGuides',
    inputs: { positive: ['guide_refine', 0], negative: ['guide_refine', 1], latent: ['sep2', 0] },
  };
  graph.decode = await nodeFromOrdered('VAEDecodeTiled', [768, 64, 4096, 4], { samples: ['crop2', 2], vae: ['ckpt', 2] });
  graph.audio_dec = { class_type: 'LTXVAudioVAEDecode', inputs: { samples: ['sep2', 1], audio_vae: ['audio_vae', 0] } };
  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: fps * (opts.smooth > 1 ? opts.smooth : 1) },
  };
  graph.save = { class_type: 'SaveVideo', inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' } };
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  return filterInputs(graph);
}

module.exports = {
  DIRECTOR_FPS,
  DIRECTOR_MAX_FRAMES,
  DIRECTOR_MAX_PROMPT,
  DIRECTOR_MAX_SEGMENTS,
  DIRECTOR_MAX_WINDOW_FRAMES,
  DIRECTOR_VERSION,
  buildLtxDirectorGraph,
  directorAssetNames,
  directorOutputFrames,
  directorPromptInputs,
  directorTimelineData,
  directorWindowProject,
  normalizeDirectorAssetName,
  normalizeDirectorProject,
};
