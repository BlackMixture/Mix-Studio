'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DIRECTOR_FPS,
  DIRECTOR_MAX_FRAMES,
  DIRECTOR_MAX_WINDOW_FRAMES,
  buildLtxDirectorGraph,
  directorAssetNames,
  directorOutputFrames,
  directorPromptInputs,
  directorTimelineData,
  directorWindowProject,
  normalizeDirectorAssetName,
  normalizeDirectorProject,
} = require('../lib/ltx-director-workflows');

function project(overrides = {}) {
  return Object.assign({
    version: 1,
    fps: 24,
    durationFrames: 480,
    range: { startFrame: 0, lengthFrames: 120 },
    globalPrompt: 'A continuous cinematic scene',
    segments: [
      { id: 'a', type: 'text', start: 24, length: 24, prompt: 'The actor enters' },
      { id: 'b', type: 'image', start: 72, length: 24, prompt: 'The actor turns', imageFile: 'key.png', guideStrength: 0.8 },
    ],
    audioSegments: [],
    motionSegments: [],
    settings: {},
  }, overrides);
}

test('Director projects use a 24 fps, 1000 second timeline and a 20 second generation window', () => {
  assert.equal(DIRECTOR_FPS, 24);
  assert.equal(DIRECTOR_MAX_FRAMES, 24000);
  assert.equal(DIRECTOR_MAX_WINDOW_FRAMES, 480);
  const normalized = normalizeDirectorProject(project({
    durationFrames: 24000,
    range: { startFrame: 23520, lengthFrames: 480 },
  }));
  assert.equal(normalized.durationFrames, 24000);
  assert.deepEqual(normalized.range, { startFrame: 23520, lengthFrames: 480 });
  assert.equal(directorOutputFrames(normalized), 481);
  assert.throws(() => normalizeDirectorProject(project({ durationFrames: 24001 })), /between 1 and 24,000/);
  assert.throws(() => normalizeDirectorProject(project({
    range: { startFrame: 0, lengthFrames: 481 },
  })), /no longer than 20 seconds/);
});

test('Director prompt relay inputs reproduce timeline gap absorption and image strengths', () => {
  const normalized = normalizeDirectorProject(project());
  assert.deepEqual(directorPromptInputs(normalized), {
    localPrompts: 'The actor enters | The actor turns',
    segmentLengths: '72,48',
    guideStrength: '0.80',
  });
});

test('late marked windows are clipped and rebased before reaching the upstream node', () => {
  const normalized = normalizeDirectorProject(project({
    durationFrames: 24000,
    range: { startFrame: 23000, lengthFrames: 480 },
    segments: [{ type: 'image', start: 22990, length: 40, prompt: 'late keyframe', imageFile: 'late.png' }],
    audioSegments: [{ start: 22976, length: 100, trimStart: 12, audioFile: 'score.wav', audioDurationFrames: 500 }],
    motionSegments: [{ start: 23300, length: 240, trimStart: 5, videoFile: 'guide.mp4', videoDurationFrames: 500 }],
  }));
  const window = directorWindowProject(normalized);
  assert.equal(window.durationFrames, 480);
  assert.deepEqual(window.range, { startFrame: 0, lengthFrames: 480 });
  assert.deepEqual({ start: window.segments[0].start, length: window.segments[0].length }, { start: 0, length: 30 });
  assert.deepEqual({ start: window.audioSegments[0].start, length: window.audioSegments[0].length, trimStart: window.audioSegments[0].trimStart }, { start: 0, length: 76, trimStart: 36 });
  assert.deepEqual({ start: window.motionSegments[0].start, length: window.motionSegments[0].length }, { start: 300, length: 180 });
  assert.equal(JSON.parse(directorTimelineData(window)).normalStartFrame, 0);
});

test('Director tracks reject overlaps and unsafe or unsupported media paths', () => {
  assert.throws(() => normalizeDirectorProject(project({
    segments: [
      { type: 'text', start: 0, length: 30, prompt: 'one' },
      { type: 'text', start: 20, length: 20, prompt: 'two' },
    ],
  })), /cannot overlap/);
  assert.throws(() => normalizeDirectorAssetName('../secret.png', 'image'), /invalid media file/);
  assert.throws(() => normalizeDirectorAssetName('clip.exe', 'video'), /unsupported file type/);
});

test('Director projects retain first, middle, last, audio, and IC guidance asset references', () => {
  const normalized = normalizeDirectorProject(project({
    segments: [
      { type: 'image', start: 0, length: 1, prompt: 'first', imageFile: 'first.png' },
      { type: 'image', start: 48, length: 24, prompt: 'middle', imageFile: 'middle.webp' },
      { type: 'image', start: 119, length: 1, prompt: 'last', imageFile: 'last.jpg', isEndFrame: true },
    ],
    audioSegments: [{ start: 0, length: 96, audioFile: 'voice.wav', audioDurationFrames: 96 }],
    motionSegments: [
      { start: 0, length: 120, videoFile: 'motion.mp4', videoDurationFrames: 120 },
    ],
    settings: { inpaintAudio: true, overrideAudio: true, icLoraName: 'LTX\\ingredients.safetensors' },
  }));
  assert.equal(normalized.segments[2].isEndFrame, true);
  assert.equal(normalized.settings.overrideAudio, true);
  assert.deepEqual(directorAssetNames(normalized), ['first.png', 'middle.webp', 'last.jpg', 'voice.wav', 'motion.mp4']);
});

test('Director schema v1 retains a profile-scoped continuation source without treating it as guide media', () => {
  const normalized = normalizeDirectorProject(project({
    extensionSource: { itemId: 'item_123', videoId: 'video-456', fileName: 'Opening shot', continueAudio: true },
  }));
  assert.deepEqual(normalized.extensionSource, {
    itemId: 'item_123', videoId: 'video-456', fileName: 'Opening shot', continueAudio: true,
  });
  assert.deepEqual(directorAssetNames(normalized), ['key.png']);
  assert.throws(() => normalizeDirectorProject(project({
    extensionSource: { itemId: '../item', videoId: 'video-456' },
  })), /extension source is invalid/);
});

test('Director graph inserts prompt relay and guide nodes into the existing two-stage LTX pipeline', async () => {
  const normalized = normalizeDirectorProject(project({
    audioSegments: [{ start: 0, length: 120, audioFile: 'voice.wav', audioDurationFrames: 120 }],
    motionSegments: [{ start: 0, length: 120, videoFile: 'motion.mp4', videoDurationFrames: 120 }],
    settings: { icLoraName: 'ingredients.safetensors', inpaintAudio: true },
  }));
  const helpers = {
    async nodeFromOrdered(classType, ordered, links = {}, overrides = {}) {
      if (classType === 'ManualSigmas') return { class_type: classType, inputs: { sigmas: ordered[0] } };
      return { class_type: classType, inputs: Object.assign({}, links, overrides) };
    },
    async filterInputs(graph) { return graph; },
    chainModelLoras(graph, model) { return model; },
    async rifeSmooth(graph, source) { return source; },
    rtxVideoSuperResolutionNode(source) { return { class_type: 'RTXVideoSuperResolution', inputs: { images: source } }; },
    async getObjectInfo() { return { ImageFromBatch: {} }; },
  };
  const settings = {
    ltxCkpt: 'ltx.safetensors',
    ltxDistilledLora: 'distilled.safetensors',
    ltxTextEncoder: 'gemma.safetensors',
    ltxGemmaLora: 'gemma-lora.safetensors',
    ltxUpscaler: 'upscaler.safetensors',
    ltxDirectorIcLora: 'ingredients.safetensors',
  };
  const graph = await buildLtxDirectorGraph(normalized, {
    W: 1280, H: 704, seed: 42, smooth: 1, fourK: false, makePoster: true,
    loras: [], sigmasBase: '1,0', sigmasRefine: '0.5,0',
  }, settings, helpers);
  assert.equal(graph.director.class_type, 'LTXDirector');
  assert.equal(graph.director.inputs.timeline_data.includes('motionSegments'), true);
  assert.equal(graph.director.inputs.use_custom_audio, true);
  assert.equal(graph.director.inputs.inpaint_audio, true);
  assert.equal(graph.director.inputs.start_frame, 0);
  assert.equal(graph.director.inputs.end_frame, 120);
  assert.equal(graph.guide_base.class_type, 'LTXDirectorGuide');
  assert.equal(graph.guide_base.inputs.scale_by, 0.5);
  assert.equal(graph.guide_refine.inputs.scale_by, 1);
  assert.equal(graph.crop1.class_type, 'LTXDirectorCropGuides');
  assert.equal(graph.crop2.class_type, 'LTXDirectorCropGuides');
  assert.deepEqual(graph.samp1.inputs.noise, ['noise', 0]);
  assert.deepEqual(graph.samp2.inputs.noise, ['noise', 0]);
  assert.equal(graph.guide_base.inputs.ic_lora_name, 'ingredients.safetensors');
  assert.equal(graph.poster_save.class_type, 'SaveImage');
});

test('Director graph keeps LoRAs, guide audio override, smoothing, 4K, and poster stages', async () => {
  const normalized = normalizeDirectorProject(project({
    motionSegments: [{ start: 0, length: 120, videoFile: 'motion.mp4', videoDurationFrames: 120 }],
    settings: { overrideAudio: true, inpaintAudio: false },
  }));
  const calls = { loras: null, smooth: null };
  const helpers = {
    async nodeFromOrdered(classType, ordered, links = {}, overrides = {}) {
      return { class_type: classType, inputs: Object.assign({ ordered }, links, overrides) };
    },
    async filterInputs(graph) { return graph; },
    chainModelLoras(graph, model, loras) { calls.loras = loras; return ['user_lora', 0]; },
    async rifeSmooth(graph, source, smooth) { calls.smooth = smooth; graph.rife = { class_type: 'RIFE VFI', inputs: { frames: source } }; return ['rife', 0]; },
    rtxVideoSuperResolutionNode(source) { return { class_type: 'RTXVideoSuperResolution', inputs: { images: source } }; },
    async getObjectInfo() { return { ImageFromBatch: {} }; },
  };
  const graph = await buildLtxDirectorGraph(normalized, {
    W: 1280, H: 720, seed: 99, smooth: 2, fourK: true, makePoster: true,
    loras: [{ name: 'look.safetensors', strength: 0.8, on: true }], sigmasBase: '1,0', sigmasRefine: '0.5,0',
  }, {
    ltxCkpt: 'ltx.safetensors', ltxDistilledLora: 'distilled.safetensors', ltxTextEncoder: 'gemma.safetensors',
    ltxGemmaLora: 'gemma-lora.safetensors', ltxUpscaler: 'up.safetensors', ltxDirectorIcLora: 'ingredients.safetensors',
  }, helpers);
  assert.deepEqual(calls.loras, [{ name: 'look.safetensors', strength: 0.8, on: true }]);
  assert.equal(calls.smooth, 2);
  assert.equal(graph.director.inputs.override_audio, true);
  assert.equal(graph.director.inputs.inpaint_audio, false);
  assert.deepEqual(graph.guide_base.inputs.model, ['director', 0]);
  assert.equal(graph.vsr.class_type, 'RTXVideoSuperResolution');
  assert.deepEqual(graph.video.inputs.images, ['vsr', 0]);
  assert.equal(graph.video.inputs.fps, 48);
  assert.equal(graph.poster_save.class_type, 'SaveImage');
});

test('Director extension anchors both stages and emits a seam-trimmed tail for an encoded join', async () => {
  const normalized = normalizeDirectorProject(project({
    durationFrames: 120,
    range: { startFrame: 0, lengthFrames: 120 },
    extensionSource: { itemId: 'item1', videoId: 'video1', fileName: 'Source' },
  }));
  const helpers = {
    async nodeFromOrdered(classType, ordered, links = {}, overrides = {}) {
      return { class_type: classType, inputs: Object.assign({ ordered }, links, overrides) };
    },
    async filterInputs(graph) { return graph; },
    chainModelLoras(graph, model) { return model; },
    async rifeSmooth(graph, source) { return source; },
    rtxVideoSuperResolutionNode(source) { return { class_type: 'RTXVideoSuperResolution', inputs: { images: source } }; },
    async getObjectInfo() { return { ImageFromBatch: {}, TrimAudioDuration: {} }; },
  };
  const plan = {
    outputFps: 24, outputWidth: 1280, outputHeight: 704,
    sourceFrames: 120, sourceOriginalFrames: 120, sourceSeconds: 5,
    appendedFrames: 120, normalizedSeconds: 5,
    continueAudio: true,
  };
  const graph = await buildLtxDirectorGraph(normalized, {
    W: 1280, H: 704, seed: 42, smooth: 1, fourK: false, makePoster: false,
    loras: [], sigmasBase: '1,0', sigmasRefine: '0.5,0',
    extension: { videoName: 'source.mp4', sourceHasAudio: false, plan },
  }, {
    ltxCkpt: 'ltx.safetensors', ltxDistilledLora: 'distilled.safetensors', ltxTextEncoder: 'gemma.safetensors',
    ltxGemmaLora: 'gemma-lora.safetensors', ltxUpscaler: 'up.safetensors', ltxDirectorIcLora: 'ingredients.safetensors',
  }, helpers);

  assert.equal(graph.extension_source.class_type, 'VHS_LoadVideo');
  assert.equal(graph.extension_source.inputs.force_rate, 0);
  assert.equal(graph.extension_source.inputs.frame_load_cap, 1);
  assert.equal(graph.extension_source.inputs.skip_first_frames, 119);
  assert.equal(graph.extension_tail_prep.inputs.ordered[0], 0);
  assert.deepEqual(graph.extension_guide_base.inputs.latent, ['guide_base', 2]);
  assert.deepEqual(graph.concat1.inputs.video_latent, ['extension_guide_base', 0]);
  assert.deepEqual(graph.extension_guide_refine.inputs.latent, ['guide_refine', 2]);
  assert.deepEqual(graph.concat2.inputs.video_latent, ['extension_guide_refine', 0]);
  assert.deepEqual(graph.extension_tail_frames.inputs, { image: ['decode', 0], batch_index: 1, length: 120 });
  assert.equal(graph.extension_join_frames, undefined);
  assert.deepEqual(graph.video.inputs.images, ['extension_tail_frames', 0]);
  assert.deepEqual(graph.video.inputs.audio, ['audio_dec', 0]);
  assert.equal(graph.video.inputs.fps, 24);
  assert.equal(graph.poster_save, undefined);
  assert.equal(Object.values(graph).filter((node) => node.class_type === 'SaveVideo').length, 1);
});
