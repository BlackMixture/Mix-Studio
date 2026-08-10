'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WAN_ANIMATE_2_FRAMES,
  WAN_ANIMATE_2_STEPS,
  buildWanAnimate2Graph,
  wanAnimate2Dimensions,
  wanAnimate2Prompt,
} = require('../lib/wan-animate2-workflow');

const settings = {
  wanAnimate2Unet: 'wan_animate_2_int8_convrot.safetensors',
  wanAnimate2Lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  wanAnimate2Clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  wanAnimate2ClipVision: 'clip_vision_h.safetensors',
  wanAnimate2Vae: 'Wan2_1_VAE_bf16.safetensors',
};

test('Wan Animate 2 sizes the reference near the official 480p pixel budget', () => {
  assert.deepEqual(wanAnimate2Dimensions(1920, 1080), { W: 848, H: 480 });
  assert.deepEqual(wanAnimate2Dimensions(1080, 1920), { W: 480, H: 848 });
  const square = wanAnimate2Dimensions(1000, 1000);
  assert.equal(square.W, square.H);
  assert.equal(square.W % 16, 0);
});

test('Wan Animate 2 prompt guidance remains optional and scene-focused', () => {
  assert.match(wanAnimate2Prompt('red jacket in a neon studio'), /^Character and background description:/);
  assert.match(wanAnimate2Prompt(''), /Match the reference image exactly/);
});

test('Wan Animate 2 graph follows the official six-step native workflow and preserves source media timing', async () => {
  let filtered = false;
  const orderedClasses = [];
  const graph = await buildWanAnimate2Graph('character.png', {
    prompt: 'A detective in a rainy alley, medium shot',
    driveVideoName: 'performance.mp4',
    W: 480,
    H: 848,
    seed: 42,
    identityStrength: 1.1,
    motionStrength: 0.9,
    makePoster: true,
    loras: [{ name: 'style.safetensors', strength: 0.7, on: true }],
  }, settings, {
    nodeFromOrdered: async (classType, _ordered, links, overrides) => {
      orderedClasses.push(classType);
      return {
        class_type: classType,
        inputs: Object.assign({}, links, overrides),
      };
    },
    filterInputs: async (value) => { filtered = true; return value; },
  });

  assert.equal(filtered, true);
  assert.equal(WAN_ANIMATE_2_FRAMES, 81);
  assert.equal(WAN_ANIMATE_2_STEPS, 6);
  assert.deepEqual(graph.user_lora_0.inputs.model, ['lightx', 0]);
  assert.deepEqual(graph.cache.inputs.model, ['user_lora_0', 0]);
  assert.equal(graph.cache.inputs.device, 'cpu');
  assert.equal(graph.cache.inputs.dtype, 'int8');
  assert.equal(graph.performance_load.class_type, 'LoadVideo');
  assert.equal(graph.performance_load.inputs.video, 'performance.mp4');
  assert.deepEqual(graph.reference_resize.inputs, {
    input: ['reference_load', 0],
    resize_type: 'scale dimensions',
    'resize_type.width': 480,
    'resize_type.height': 848,
    'resize_type.crop': 'center',
    scale_method: 'area',
  });
  assert.deepEqual(graph.performance_resize.inputs, {
    input: ['performance_parts', 0],
    resize_type: 'scale dimensions',
    'resize_type.width': 480,
    'resize_type.height': 848,
    'resize_type.crop': 'center',
    scale_method: 'area',
  });
  assert.equal(orderedClasses.includes('ResizeImageMaskNode'), false);
  assert.deepEqual(graph.conditioning.inputs.reference_image, ['reference_resize', 0]);
  assert.deepEqual(graph.conditioning.inputs.pose_video, ['performance_resize', 0]);
  assert.equal(graph.conditioning.inputs.length, 81);
  assert.equal(graph.conditioning.inputs.batch_size, 1);
  assert.equal(graph.conditioning.inputs.reference_image_strength, 1.1);
  assert.equal(graph.conditioning.inputs.pose_strength, 0.9);
  assert.equal(graph.scheduler.inputs.steps, 6);
  assert.equal(graph.sampler_select.inputs.sampler_name, 'lcm');
  assert.deepEqual(graph.trim.inputs.trim_amount, ['conditioning', 3]);
  assert.deepEqual(graph.video.inputs.audio, ['performance_parts', 1]);
  assert.deepEqual(graph.video.inputs.fps, ['performance_parts', 2]);
  assert.equal(graph.poster_save.class_type, 'SaveImage');
  assert.equal(graph.save.class_type, 'SaveVideo');
});
