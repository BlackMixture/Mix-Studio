'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LTX25_FPS,
  LTX25_MAX_SECONDS,
  LTX25_SIGMAS_BASE,
  LTX25_SIGMAS_REFINE,
  buildLtx25Graph,
  ltx25Dimensions,
  ltx25DurationSeconds,
  ltx25FramesForSeconds,
} = require('../lib/ltx25-workflow');

const settings = {
  ltx25Unet: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
  ltx25TextEncoder: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
  ltx25PromptEnhancer: 'gemma4_e2b_it_bf16.safetensors',
  ltx25VideoVae: 'ltx-2.5-video-vae-bf16.safetensors',
  ltx25AudioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
  ltx25Upscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
};

const deps = {
  filterInputs: async (graph) => graph,
  chainModelLoras(graph, model, loras) {
    const lora = loras?.find((entry) => entry.on !== false);
    if (!lora) return model;
    graph.user_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model, lora_name: lora.name, strength_model: lora.strength },
    };
    return ['user_lora', 0];
  },
  textGenInputs: (seed, maxLength) => ({ seed, max_length: maxLength, sampling_mode: 'on' }),
};

test('LTX 2.5 uses 24 fps, 8n+1 frames, and safe two-stage dimensions', () => {
  assert.equal(LTX25_FPS, 24);
  assert.equal(LTX25_MAX_SECONDS, 20);
  assert.equal(ltx25DurationSeconds(30), 20);
  assert.equal(ltx25FramesForSeconds(5), 121);
  assert.equal((ltx25FramesForSeconds(20) - 1) % 8, 0);
  assert.deepEqual(ltx25Dimensions(1920, 1080), { W: 1280, H: 736 });
  assert.deepEqual(ltx25Dimensions(1080, 1920), { W: 736, H: 1280 });
});

test('LTX 2.5 T2V follows the official distilled two-stage AV workflow', async () => {
  const graph = await buildLtx25Graph('blank.png', {
    prompt: 'A quiet harbor at dawn with distant gulls',
    bypass: true,
    frames: 121,
    W: 1280,
    H: 704,
    seed: 42,
    enhance: true,
    smooth: 1,
    makePoster: true,
    loras: [{ name: 'cinematic.safetensors', strength: 0.6, on: true }],
  }, settings, deps);

  assert.equal(graph.model.class_type, 'UNETLoader');
  assert.equal(graph.clip.inputs.type, 'ltxv');
  assert.equal(graph.prompt_clip.inputs.clip_name, settings.ltx25PromptEnhancer);
  assert.equal(graph.refine_prompt.inputs.clip[0], 'prompt_clip');
  assert.equal(graph.video_vae.inputs.vae_name, settings.ltx25VideoVae);
  assert.equal(graph.audio_vae.inputs.vae_name, settings.ltx25AudioVae);
  assert.equal(graph.first_load, undefined);
  assert.equal(graph.video_latent.inputs.width, 640);
  assert.equal(graph.video_latent.inputs.height, 352);
  assert.equal(graph.audio_latent.inputs.frames_number, 121);
  assert.equal(graph.audio_latent.inputs.frame_rate, 24);
  assert.equal(graph.base_guider.class_type, 'LTXVDualCFGGuider');
  assert.equal(graph.base_guider.inputs.video_cfg, 1);
  assert.equal(graph.base_guider.inputs.audio_cfg, 1);
  assert.equal(graph.base_sigmas.inputs.sigmas, LTX25_SIGMAS_BASE);
  assert.equal(graph.refine_sigmas.inputs.sigmas, LTX25_SIGMAS_REFINE);
  assert.equal(graph.upscale_model.inputs.model_name, settings.ltx25Upscaler);
  assert.equal(graph.refine_noise.inputs.noise_seed, 42);
  assert.equal(graph.refine_prompt.inputs.max_length, 600);
  assert.deepEqual(graph.positive.inputs.text, ['refine_prompt', 0]);
  assert.deepEqual(graph.base_guider.inputs.model, ['user_lora', 0]);
  assert.equal(graph.video.inputs.fps, 24);
  assert.equal(graph.poster_save.class_type, 'SaveImage');
  assert.equal(graph.save.class_type, 'SaveVideo');
});

test('LTX 2.5 I2V conditions both distilled stages and can lock supplied audio', async () => {
  const audioDeps = Object.assign({}, deps, {
    audioLatentNodes(graph, name) {
      graph.loaded_audio = { class_type: 'LoadAudio', inputs: { audio: name } };
      graph.encoded_audio = {
        class_type: 'LTXVAudioVAEEncode',
        inputs: { audio: ['loaded_audio', 0], audio_vae: ['audio_vae', 0] },
      };
      return ['encoded_audio', 0];
    },
  });
  const graph = await buildLtx25Graph('first.png', {
    prompt: 'She looks toward the horizon',
    bypass: false,
    frames: 241,
    W: 704,
    H: 1280,
    seed: 7,
    audioName: 'voice.wav',
  }, settings, audioDeps);

  assert.equal(graph.first_prep.inputs.img_compression, 18);
  assert.equal(graph.first_frame_base.inputs.strength, 0.7);
  assert.equal(graph.first_frame_refine.inputs.strength, 1);
  assert.deepEqual(graph.av_latent.inputs.audio_latent, ['encoded_audio', 0]);
  assert.equal(graph.audio_latent, undefined);
  assert.equal(graph.video.inputs.fps, 24);
});

test('LTX 2.5 first/last-frame mode uses the native single-stage guide path', async () => {
  const graph = await buildLtx25Graph('first.png', {
    prompt: 'A flower opens between the two keyframes',
    endImageName: 'last.png',
    bypass: false,
    frames: 121,
    W: 1280,
    H: 704,
    seed: 99,
  }, settings, deps);

  assert.equal(graph.upscale_model, undefined);
  assert.equal(graph.refine_sample, undefined);
  assert.equal(graph.video_latent.inputs.width, 1280);
  assert.equal(graph.first_guide.inputs.frame_idx, 0);
  assert.equal(graph.first_guide.inputs.strength, 0.7);
  assert.equal(graph.last_guide.inputs.frame_idx, -1);
  assert.equal(graph.last_guide.inputs.strength, 0.7);
  assert.deepEqual(graph.sampled_av.inputs.av_latent, ['base_sample', 1]);
  assert.deepEqual(graph.decode.inputs.samples, ['crop_guides', 2]);
  assert.equal(graph.base_sigmas.inputs.sigmas, LTX25_SIGMAS_BASE);
});
