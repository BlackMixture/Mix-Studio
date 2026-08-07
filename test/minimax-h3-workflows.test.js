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
  h3EffectiveDurationSeconds,
  h3FramesForSeconds,
  normalizeH3References,
} = require('../lib/video-workflows');

const settings = {
  h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_fp16.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
  h3TurboLora: 'minimax_h3_turbo_4step_ema_ckpt850.safetensors',
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
  assert.equal(h3EffectiveDurationSeconds(5), 124 / 24);
  assert.equal(h3EffectiveDurationSeconds(10), 243 / 24);
  assert.equal(h3EffectiveDurationSeconds(15), 362 / 24);
  assert.equal(h3EffectiveDurationSeconds(h3EffectiveDurationSeconds(10)), 243 / 24);
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

test('MiniMax H3 S, M, L, and XL tiers preserve aspect while scaling memory', () => {
  assert.deepEqual(h3Dimensions(1920, 1080, 0.75), { W: 672, H: 384 });
  assert.deepEqual(h3Dimensions(1920, 1080, 1), { W: 1024, H: 576 });
  assert.deepEqual(h3Dimensions(1920, 1080, 1.75), { W: 1344, H: 768 });
  assert.deepEqual(h3Dimensions(1920, 1080, 3), { W: 1920, H: 1088 });
  assert.deepEqual(h3Dimensions(1000, 1000, 0.75), { W: 384, H: 384 });
  assert.deepEqual(h3Dimensions(1000, 1000, 1), { W: 576, H: 576 });
  assert.deepEqual(h3Dimensions(1000, 1000, 1.75), { W: 768, H: 768 });
  assert.deepEqual(h3Dimensions(1000, 1000, 3), { W: 1088, H: 1088 });
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

test('MiniMax H3 accepts an explicit sampler step count', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A storm rolls across the sea.', W: 1344, H: 768, frames: 124, seed: 7, steps: 28,
  }, settings);
  assert.equal(graph.scheduler.inputs.steps, 28);
});

test('MiniMax H3 SageAttention patches only the guider model and leaves scheduler calculation unchanged', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A storm rolls across the sea.', W: 1344, H: 768, frames: 124, seed: 7,
    sageAttention: true,
  }, settings);
  assert.equal(graph.sage_attention.class_type, 'PathchSageAttentionKJ');
  assert.deepEqual(graph.sage_attention.inputs, {
    model: ['model', 0], sage_attention: 'auto', allow_compile: false,
  });
  assert.deepEqual(graph.guider.inputs.model, ['sage_attention', 0]);
  assert.deepEqual(graph.scheduler.inputs.model, ['model', 0]);

  const standard = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A storm rolls across the sea.', W: 1344, H: 768, frames: 124, seed: 7,
  }, settings);
  assert.equal(standard.sage_attention, undefined);
  assert.deepEqual(standard.guider.inputs.model, ['model', 0]);
});

test('MiniMax H3 Turbo keeps the creator sampler as a legacy-core fallback with adjustable steps', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A singer performs under soft stage light.', W: 1344, H: 768,
    frames: 124, seed: 17, steps: 28, turbo: true, turboStrength: 1.1,
  }, settings);

  assert.deepEqual(graph.turbo_lora, {
    class_type: 'MiniMaxH3TurboLoRA',
    inputs: {
      model: ['model', 0],
      lora_name: settings.h3TurboLora,
      strength: 1.1,
      low_vram: false,
    },
  });
  assert.deepEqual(graph.turbo_sampler, { class_type: 'MiniMaxH3TurboSampler', inputs: {} });
  assert.equal(graph.sampler_select, undefined);
  assert.equal(graph.scheduler.inputs.steps, 28);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_lora', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['turbo_lora', 0]);
  assert.deepEqual(graph.sample.inputs.sampler, ['turbo_sampler', 0]);
  assert.deepEqual(graph.decode_audio.inputs, { samples: ['sample', 0], vae: ['audio_vae', 0] });
  assert.deepEqual(graph.video.inputs.audio, ['decode_audio', 0]);
  assert.equal(Object.values(graph).some((node) => /cache/i.test(node.class_type)), false);
});

test('MiniMax H3 Turbo uses native Euler sampling after ComfyUI audio scheduling is available', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A singer performs under soft stage light.', W: 1344, H: 768,
    frames: 124, seed: 17, steps: 7, turbo: true, turboNativeSampler: true,
  }, settings);

  assert.equal(graph.turbo_sampler, undefined);
  assert.deepEqual(graph.native_av_sampling, {
    class_type: 'MiniMaxH3SigmaShift',
    inputs: { model: ['turbo_lora', 0], shift_video: 12, shift_audio: 3 },
  });
  assert.deepEqual(graph.sampler_select, {
    class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' },
  });
  assert.equal(graph.scheduler.inputs.scheduler, 'simple');
  assert.equal(graph.scheduler.inputs.steps, 7);
  assert.deepEqual(graph.scheduler.inputs.model, ['native_av_sampling', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['native_av_sampling', 0]);
  assert.deepEqual(graph.sample.inputs.sampler, ['sampler_select', 0]);
  assert.equal(Object.values(graph).some((node) => /cache/i.test(node.class_type)), false);
});

test('MiniMax H3 Turbo can stack SageAttention after the Turbo LoRA', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A singer performs under soft stage light.', W: 1344, H: 768,
    frames: 124, seed: 17, turbo: true, sageAttention: true, turboLowVram: true,
  }, settings);

  assert.equal(graph.turbo_lora.inputs.low_vram, true);
  assert.deepEqual(graph.sage_attention.inputs.model, ['turbo_lora', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['sage_attention', 0]);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_lora', 0]);
});

test('MiniMax H3 Reference mode does not apply the FL2VA Turbo LoRA', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Use <Picture 1>.', W: 1344, H: 768, frames: 124, seed: 17,
    turbo: true, references: { images: [{ name: 'hero.png' }] },
  }, settings);

  assert.equal(graph.turbo_lora, undefined);
  assert.equal(graph.turbo_sampler, undefined);
  assert.equal(graph.scheduler.inputs.steps, 20);
  assert.deepEqual(graph.sample.inputs.sampler, ['sampler_select', 0]);
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
