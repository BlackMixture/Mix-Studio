'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  H3_FPS,
  H3_MAX_SECONDS,
  H3_LONG_CONTEXT_FRAMES,
  H3_LONG_CONTEXT_MAX_SECONDS,
  H3_MIN_SECONDS,
  H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES,
  H3_TURBO_REFERENCE_CHUNK_FRAMES,
  buildMiniMaxH3Graph,
  h3Dimensions,
  h3DurationSeconds,
  h3EffectiveDurationSeconds,
  h3FramesForSeconds,
  h3LongContextSegments,
  h3LongContextSegmentPrompt,
  h3TurboReferenceSegments,
  normalizeH3References,
} = require('../lib/video-workflows');

const settings = {
  h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_fp16.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
  h3TurboLora: 'minimax_h3_turbo_v4_step600_ema.safetensors',
  h3RefTurboLora: 'minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors',
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

test('MiniMax H3 Reference Turbo plans long outputs as five-second source chunks', () => {
  assert.equal(H3_TURBO_REFERENCE_CHUNK_ADVANCE_FRAMES, 120);
  assert.equal(H3_TURBO_REFERENCE_CHUNK_FRAMES, 124);
  assert.deepEqual(h3TurboReferenceSegments(124), [
    { index: 0, startFrame: 0, generationFrames: 124, keepFrames: 124 },
  ]);
  assert.deepEqual(h3TurboReferenceSegments(243), [
    { index: 0, startFrame: 0, generationFrames: 124, keepFrames: 120 },
    { index: 1, startFrame: 120, generationFrames: 124, keepFrames: 123 },
  ]);
  assert.deepEqual(h3TurboReferenceSegments(362), [
    { index: 0, startFrame: 0, generationFrames: 124, keepFrames: 120 },
    { index: 1, startFrame: 120, generationFrames: 124, keepFrames: 120 },
    { index: 2, startFrame: 240, generationFrames: 124, keepFrames: 122 },
  ]);
});

test('MiniMax H3 Long context distributes a snapped output across valid clips with 22-frame bridges', () => {
  assert.equal(H3_LONG_CONTEXT_MAX_SECONDS, 120);
  assert.equal(H3_LONG_CONTEXT_FRAMES, 22);
  assert.deepEqual(h3LongContextSegments(30), [
    { index: 0, generationFrames: 362, keepFrames: 362, trimFrames: 0 },
    { index: 1, generationFrames: 209, keepFrames: 187, trimFrames: 22 },
    { index: 2, generationFrames: 209, keepFrames: 187, trimFrames: 22 },
  ]);
  const maximum = h3LongContextSegments(120);
  assert.equal(maximum.reduce((total, segment) => total + segment.keepFrames, 0), 2895);
  assert.ok(maximum.every((segment) => segment.generationFrames >= 124 && segment.generationFrames <= 362));
  assert.ok(maximum.every((segment) => segment.generationFrames % 17 === 5));
  assert.match(h3LongContextSegmentPrompt('A rider keeps moving.', { index: 1 }, 3), /Continuity airlock/);
  assert.match(h3LongContextSegmentPrompt('A rider keeps moving.', { index: 1 }, 3), /do not freeze/);
  for (let tenths = 50; tenths <= 1200; tenths += 1) {
    const requested = tenths / 10;
    const rawFrames = Math.max(5, Math.round(requested * H3_FPS));
    const targetFrames = rawFrames + ((5 - (rawFrames % 17) + 17) % 17);
    const plan = h3LongContextSegments(requested);
    assert.equal(plan.reduce((total, segment) => total + segment.keepFrames, 0), targetFrames);
    assert.ok(plan.every((segment) => segment.generationFrames >= 124 && segment.generationFrames <= 362));
    assert.ok(plan.every((segment) => segment.generationFrames % 17 === 5));
  }
});

test('MiniMax H3 Long context keeps Reference Turbo video clips inside the five-second safety window', () => {
  const plan = h3LongContextSegments(30, { maxGenerationFrames: H3_TURBO_REFERENCE_CHUNK_FRAMES });
  assert.equal(plan.length, 7);
  assert.deepEqual(plan[0], {
    index: 0, startFrame: 0, generationFrames: 124, keepFrames: 124, trimFrames: 0,
  });
  assert.deepEqual(plan[1], {
    index: 1, startFrame: 102, generationFrames: 124, keepFrames: 102, trimFrames: 22,
  });
  assert.equal(plan.reduce((total, segment) => total + segment.keepFrames, 0), 736);
  assert.ok(plan.every((segment) => segment.generationFrames === 124));

  const maximum = h3LongContextSegments(120, { maxGenerationFrames: 124 });
  assert.equal(maximum.length, 29);
  assert.equal(maximum.reduce((total, segment) => total + segment.keepFrames, 0), 2895);
  assert.ok(maximum.slice(1).every((segment) => segment.trimFrames === 22));
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

test('MiniMax H3 applies ordered user LoRAs to the model used by its scheduler and guider', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A dramatic close-up.', W: 1344, H: 768, frames: 124, seed: 7,
    loras: [
      { name: 'MiniMax-H3/realism.safetensors', strength: 0.8, on: true },
      { name: 'MiniMax-H3/off.safetensors', strength: 1, on: false },
      { name: 'MiniMax-H3/character.safetensors', strength: -0.25, on: true },
      { name: 'MiniMax-H3/zero.safetensors', strength: 0, on: true },
    ],
  }, settings);

  assert.deepEqual(graph.user_lora_1, {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model: ['model', 0],
      lora_name: 'MiniMax-H3/realism.safetensors',
      strength_model: 0.8,
    },
  });
  assert.deepEqual(graph.user_lora_2.inputs, {
    model: ['user_lora_1', 0],
    lora_name: 'MiniMax-H3/character.safetensors',
    strength_model: -0.25,
  });
  assert.deepEqual(graph.user_lora_3.inputs, {
    model: ['user_lora_2', 0],
    lora_name: 'MiniMax-H3/zero.safetensors',
    strength_model: 0,
  });
  assert.equal(graph.user_lora_4, undefined);
  assert.deepEqual(graph.scheduler.inputs.model, ['user_lora_3', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['user_lora_3', 0]);
});

test('MiniMax H3 user LoRAs stack after Frames Turbo and before native AV sampling and SageAttention', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A singer performs.', W: 1344, H: 768, frames: 124, seed: 17,
    turbo: true, turboNativeSampler: true, sageAttention: true,
    loras: [{ name: 'MiniMax-H3/stage-light.safetensors', strength: 1.15, on: true }],
  }, settings);

  assert.deepEqual(graph.turbo_lora.inputs.model, ['model', 0]);
  assert.deepEqual(graph.user_lora_1.inputs.model, ['turbo_lora', 0]);
  assert.deepEqual(graph.turbo_sampling.inputs.model, ['user_lora_1', 0]);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.sage_attention.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['sage_attention', 0]);
});

test('MiniMax H3 user LoRAs stack after Reference Turbo and before its audio-safe sigma shift', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Use <Picture 1>.', W: 1344, H: 768, frames: 124, seed: 17,
    turbo: true,
    references: { images: [{ name: 'hero.png' }] },
    loras: [{ name: 'MiniMax-H3/film-look.safetensors', strength: 0.65, on: true }],
  }, settings);

  assert.deepEqual(graph.turbo_lora.inputs.model, ['model', 0]);
  assert.deepEqual(graph.user_lora_1.inputs.model, ['turbo_lora', 0]);
  assert.deepEqual(graph.turbo_sampling.inputs.model, ['user_lora_1', 0]);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['turbo_sampling', 0]);
});

test('MiniMax H3 rejects standard fused-QKV LoRAs with the experimental DynTime model', async () => {
  await assert.rejects(buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Use <Picture 1>.', W: 1344, H: 768, frames: 124, seed: 17,
    references: { images: [{ name: 'hero.png' }] },
    loras: [{ name: 'MiniMax-H3/film-look.safetensors', strength: 1, on: true }],
  }, Object.assign({}, settings, {
    h3ReferenceModelVariant: 'dyntime',
    h3DynTimeRefUnet: 'MiniMax-H3_Ref2VA-DT-sQKV-INT8-ConvRot.safetensors',
  })), (error) => error?.code === 'h3_lora_model_incompatible');
});

test('MiniMax H3 Long context saves the first AV latent and continues later clips through the lossless latent path', async () => {
  const first = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A singer continues the performance.', W: 1344, H: 768,
    frames: 362, seed: 17, longContext: { chainId: 'chain-abc', clipIndex: 0 },
  }, settings);
  assert.equal(first.motion_context, undefined);
  assert.deepEqual(first.context_save.inputs, {
    latent: ['sample', 0],
    filename_prefix: 'KreaStudio/h3_context/chain-abc/clip',
    clip_index: 1,
  });
  assert.deepEqual(first.video.inputs.images, ['decode', 0]);
  assert.deepEqual(first.video.inputs.audio, ['decode_audio', 0]);

  const next = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Continue with <Picture 1>.', W: 1344, H: 768,
    frames: 209, seed: 18, references: { images: [{ name: 'singer.png' }] },
    longContext: { chainId: 'chain-abc', clipIndex: 1 },
  }, settings);
  assert.deepEqual(next.context_load.inputs, {
    latent_path: 'KreaStudio/h3_context/chain-abc', clip_index: 1,
  });
  assert.deepEqual(next.motion_context.inputs, {
    conditioning: ['condition', 0],
    vae: ['video_vae', 0],
    latent: ['condition', 1],
    context_length: '22',
    audio_context_length: 22,
    context_latent: ['context_load', 0],
  });
  assert.deepEqual(next.guider.inputs.conditioning, ['motion_context', 0]);
  assert.deepEqual(next.sample.inputs.latent_image, ['condition', 1]);
  assert.deepEqual(next.context_trim.inputs.trim_frames, ['motion_context', 1]);
  assert.deepEqual(next.video.inputs.images, ['context_trim', 0]);
  assert.deepEqual(next.video.inputs.audio, ['context_trim', 1]);
  assert.equal(next.context_save.inputs.clip_index, 2);
});

test('MiniMax H3 Long context allows Turbo while preserving the joint latent bridge', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'Continue.', W: 1344, H: 768, frames: 362, seed: 17,
    turbo: true, longContext: { chainId: 'chain-abc', clipIndex: 0 },
  }, settings);
  assert.equal(graph.turbo_lora.class_type, 'MiniMaxH3TurboLoRA');
  assert.equal(graph.turbo_sampler.class_type, 'MiniMaxH3TurboSampler');
  assert.equal(graph.context_save.class_type, 'MiniMaxH3MotionContextSaveLatent');
  assert.deepEqual(graph.sample.inputs.sampler, ['turbo_sampler', 0]);
});

test('MiniMax H3 Reference Turbo continuation combines a five-second source window with Motion Context', async () => {
  const segment = {
    index: 1,
    startFrame: 102,
    generationFrames: 124,
    keepFrames: 102,
    trimFrames: 22,
  };
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Continue <Video 1>.', W: 1344, H: 768, frames: 124, seed: 18,
    turbo: true,
    turboReferenceSegment: segment,
    references: { videos: [{ name: 'source.mp4', hasAudio: true, w: 1080, h: 1920 }] },
    longContext: { chainId: 'chain-turbo', clipIndex: 1 },
  }, settings);
  assert.equal(graph.turbo_lora.class_type, 'LoraLoaderModelOnly');
  assert.equal(graph.ref_video_1_0.inputs.frame_load_cap, 124);
  assert.equal(graph.ref_video_1_0.inputs.skip_first_frames, 102);
  assert.equal(graph.motion_context.class_type, 'MiniMaxH3MotionContext');
  assert.deepEqual(graph.sample.inputs.sampler, ['turbo_sampler', 0]);
  assert.deepEqual(graph.context_trim.inputs.trim_frames, ['motion_context', 1]);
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
  assert.deepEqual(graph.turbo_sampling, {
    class_type: 'MiniMaxH3SigmaShift',
    inputs: { model: ['turbo_lora', 0], shift_video: 12, shift_audio: 3 },
  });
  assert.deepEqual(graph.sampler_select, {
    class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' },
  });
  assert.equal(graph.scheduler.inputs.scheduler, 'simple');
  assert.equal(graph.scheduler.inputs.steps, 7);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['turbo_sampling', 0]);
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

test('MiniMax H3 Reference Turbo uses LightX2V with the audio-safe creator sampler', async () => {
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Use <Picture 1>.', W: 1344, H: 768, frames: 124, seed: 17,
    turbo: true, references: { images: [{ name: 'hero.png' }] },
  }, settings);

  assert.equal(graph.condition.class_type, 'MiniMaxH3ReferenceToVideo');
  assert.equal(graph.turbo_lora.class_type, 'LoraLoaderModelOnly');
  assert.equal(graph.turbo_lora.inputs.lora_name, settings.h3RefTurboLora);
  assert.equal(graph.turbo_lora.inputs.strength_model, 1);
  assert.equal(graph.turbo_sampling.class_type, 'MiniMaxH3SigmaShift');
  assert.deepEqual(graph.turbo_sampling.inputs.model, ['turbo_lora', 0]);
  assert.equal(graph.turbo_sampling.inputs.shift_video, 12);
  assert.equal(graph.turbo_sampling.inputs.shift_audio, 3);
  assert.equal(graph.turbo_sampler.class_type, 'MiniMaxH3TurboSampler');
  assert.equal(graph.scheduler.inputs.steps, 6);
  assert.deepEqual(graph.scheduler.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.guider.inputs.model, ['turbo_sampling', 0]);
  assert.deepEqual(graph.sample.inputs.sampler, ['turbo_sampler', 0]);
  assert.equal(Object.values(graph).some((node) => /cache/i.test(node.class_type)), false);
});

test('MiniMax H3 LightX2V v1.0 uses the standard LoRA loader and eight-step schedule', async () => {
  const lightx = Object.assign({}, settings, {
    h3TurboLora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
    h3RefTurboLora: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  });
  const frames = await buildMiniMaxH3Graph({
    mode: 'frames', prompt: 'A runner crosses the finish line.', W: 1344, H: 768,
    frames: 124, seed: 23, turbo: true, turboNativeSampler: true,
  }, lightx);
  assert.equal(frames.turbo_lora.class_type, 'LoraLoaderModelOnly');
  assert.equal(frames.turbo_lora.inputs.lora_name, lightx.h3TurboLora);
  assert.equal(frames.scheduler.inputs.steps, 8);
  assert.equal(frames.turbo_sampling.class_type, 'MiniMaxH3SigmaShift');
  assert.deepEqual(frames.sample.inputs.sampler, ['sampler_select', 0]);

  const reference = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Restyle <Video 1>.', W: 1344, H: 768,
    frames: 124, seed: 24, turbo: true, turboNativeSampler: true,
    turboReferenceSegment: h3TurboReferenceSegments(124)[0],
    references: { videos: [{ name: 'source.mp4', hasAudio: true }] },
  }, lightx);
  assert.equal(reference.turbo_lora.class_type, 'LoraLoaderModelOnly');
  assert.equal(reference.turbo_lora.inputs.lora_name, lightx.h3RefTurboLora);
  assert.equal(reference.scheduler.inputs.steps, 8);
  assert.equal(reference.turbo_sampler, undefined);
  assert.deepEqual(reference.sample.inputs.sampler, ['sampler_select', 0]);
});

test('MiniMax H3 Reference Turbo renders a planned long-video segment inside the five-second safety window', async () => {
  const segment = h3TurboReferenceSegments(362)[1];
  const graph = await buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Restyle <Video 1> as hand-drawn anime.', W: 1344, H: 768,
    frames: 362, seed: 17, turbo: true, fourK: true, makePoster: true,
    turboReferenceSegment: segment,
    references: {
      videos: [{ name: 'live-action.mp4', hasAudio: true }],
      audios: [{ name: 'music.wav' }],
    },
  }, settings);

  assert.equal(graph.condition.class_type, 'MiniMaxH3ReferenceToVideo');
  assert.equal(graph.condition.inputs.length, 124);
  assert.deepEqual(graph.condition.inputs['ref_videos.ref_video_0'], ['ref_video_1_0', 0]);
  assert.deepEqual(graph.condition.inputs['ref_video_audios.ref_video_audio_0'], ['ref_video_1_0', 2]);
  assert.equal(graph.ref_video_1_0.inputs.frame_load_cap, 124);
  assert.equal(graph.ref_video_1_0.inputs.skip_first_frames, 120);
  assert.equal(graph.ref_audio_1_0.inputs.start_time, 5);
  assert.equal(graph.ref_audio_1_0.inputs.duration, 124 / 24);
  assert.deepEqual(graph.sample.inputs.latent_image, ['condition', 1]);
  assert.deepEqual(graph.decode.inputs.samples, ['sample', 0]);
  assert.deepEqual(graph.video.inputs.images, ['vsr', 0]);
  assert.deepEqual(graph.save.inputs.video, ['video', 0]);
  assert.deepEqual(graph.poster_pick.inputs.image, ['decode', 0]);
});

test('MiniMax H3 Reference Turbo rejects an unplanned long video graph', async () => {
  await assert.rejects(buildMiniMaxH3Graph({
    mode: 'reference', prompt: 'Restyle <Video 1>.', W: 1344, H: 768,
    frames: 362, seed: 17, turbo: true,
    references: { videos: [{ name: 'live-action.mp4', hasAudio: true }] },
  }, settings), /planned five-second chunk segment/);
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
