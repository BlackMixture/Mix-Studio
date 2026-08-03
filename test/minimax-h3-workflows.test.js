'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  H3_FPS,
  H3_MAX_SECONDS,
  H3_MIN_SECONDS,
  buildMiniMaxH3Graph,
  h3Dimensions,
  h3DurationSeconds,
  h3FramesForSeconds,
  normalizeH3References,
} = require('../lib/video-workflows');

const settings = {
  h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_fp16.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
};

test('MiniMax H3 duration snaps to the official 17k+5 frame grid at 24 fps', () => {
  assert.equal(H3_FPS, 24);
  assert.equal(H3_MIN_SECONDS, 5);
  assert.equal(H3_MAX_SECONDS, 15);
  assert.equal(h3DurationSeconds(2), 5);
  assert.equal(h3DurationSeconds(18), 15);
  assert.equal(h3FramesForSeconds(5), 124);
  assert.equal(h3FramesForSeconds(15), 362);
  assert.equal(h3FramesForSeconds(7) % 17, 5);
});

test('MiniMax H3 canvas follows the native 768 short edge and area cap', () => {
  assert.deepEqual(h3Dimensions(1920, 1080), { W: 1344, H: 768 });
  assert.deepEqual(h3Dimensions(1080, 1920), { W: 768, H: 1344 });
  assert.deepEqual(h3Dimensions(1000, 1000), { W: 768, H: 768 });
  const ultrawide = h3Dimensions(2520, 1080);
  assert.equal(ultrawide.W % 32, 0);
  assert.equal(ultrawide.H % 32, 0);
  assert.ok(ultrawide.W * ultrawide.H <= 768 * 1344 + (32 * 1344));
});

test('MiniMax H3 first/last-frame graph matches the native joint AV workflow', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames',
    prompt: 'A dancer turns. Audio: soft shoes and room tone.',
    firstImageName: 'first.png',
    lastImageName: 'last.png',
    W: 1344,
    H: 768,
    frames: 124,
    seed: 42,
    makePoster: true,
  }, settings);

  assert.equal(graph.model.class_type, 'UNETLoader');
  assert.equal(graph.model.inputs.unet_name, settings.h3Unet);
  assert.equal(graph.clip.inputs.type, 'minimax');
  assert.equal(graph.condition.class_type, 'MiniMaxH3ImageToVideo');
  assert.deepEqual(graph.condition.inputs.first_frame, ['first_image', 0]);
  assert.deepEqual(graph.condition.inputs.last_frame, ['last_image', 0]);
  assert.equal(graph.scheduler.inputs.steps, 20);
  assert.equal(graph.sampler_select.inputs.sampler_name, 'res_multistep');
  assert.deepEqual(graph.decode.inputs.samples, ['sample', 0]);
  assert.deepEqual(graph.decode_audio.inputs.samples, ['sample', 0]);
  assert.deepEqual(graph.video.inputs.audio, ['decode_audio', 0]);
  assert.equal(graph.video.inputs.fps, 24);
  assert.equal(graph.poster_save.class_type, 'SaveImage');
});

test('MiniMax H3 text-to-video does not synthesize placeholder keyframes', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A storm rolls across the sea.', W: 1344, H: 768, frames: 124, seed: 7,
  }, settings);
  assert.equal(graph.first_image, undefined);
  assert.equal(graph.last_image, undefined);
  assert.equal(graph.condition.inputs.first_frame, undefined);
  assert.equal(graph.condition.inputs.last_frame, undefined);
});

test('MiniMax H3 reference graph preserves official reference namespaces and media order', async () => {
  const calls = [];
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference',
    prompt: 'Use <Picture 1>, <Video 1>, and <Audio 2>.',
    references: {
      images: [{ name: 'hero.png' }, { name: 'style.png' }],
      videos: [{ name: 'motion.mp4', hasAudio: true }],
      audios: [{ name: 'voice.wav' }],
    },
    refImageSize: 'max',
    W: 1344,
    H: 768,
    frames: 124,
    seed: 99,
  }, settings, {
    nodeFromOrdered: async (classType, ordered, links, overrides) => {
      calls.push({ classType, ordered, links, overrides });
      return { class_type: classType, inputs: Object.assign({}, links, overrides) };
    },
  });

  assert.equal(graph.model.inputs.unet_name, settings.h3RefUnet);
  assert.equal(graph.condition.class_type, 'MiniMaxH3ReferenceToVideo');
  assert.equal(graph.condition.inputs.ref_image_size, 'max');
  assert.deepEqual(graph.condition.inputs['ref_images.ref_image_0'], ['ref_image_0', 0]);
  assert.deepEqual(graph.condition.inputs['ref_images.ref_image_1'], ['ref_image_1', 0]);
  assert.deepEqual(graph.condition.inputs['ref_videos.ref_video_0'], ['ref_video_0', 0]);
  assert.deepEqual(graph.condition.inputs['ref_video_audios.ref_video_audio_0'], ['ref_video_0', 2]);
  assert.deepEqual(graph.condition.inputs['ref_audios.ref_audio_0'], ['ref_audio_0', 0]);
  assert.equal(calls[0].classType, 'VHS_LoadVideo');
  assert.equal(calls[0].overrides.force_rate, 24);
  assert.equal(calls[1].classType, 'VHS_LoadAudioUpload');
});

test('MiniMax H3 reference inputs are limited to the native node capacities', () => {
  const refs = normalizeH3References({
    images: Array.from({ length: 12 }, (_, index) => ({ name: `i${index}.png` })),
    videos: Array.from({ length: 5 }, (_, index) => ({ name: `v${index}.mp4` })),
    audios: Array.from({ length: 5 }, (_, index) => ({ name: `a${index}.wav` })),
  });
  assert.equal(refs.images.length, 9);
  assert.equal(refs.videos.length, 3);
  assert.equal(refs.audios.length, 3);
});

test('MiniMax H3 reference mode rejects an empty reference set', async () => {
  await assert.rejects(
    buildMiniMaxH3Graph({ mode: 'reference', prompt: 'Empty', W: 768, H: 768, frames: 124 }, settings),
    /needs at least one image, video, or audio reference/
  );
});
