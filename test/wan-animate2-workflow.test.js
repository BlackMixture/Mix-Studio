'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WAN_ANIMATE_2_FRAME_ADVANCE,
  WAN_ANIMATE_2_FRAMES,
  WAN_ANIMATE_2_MAX_SECONDS,
  WAN_ANIMATE_2_STEPS,
  buildWanAnimate2Graph,
  wanAnimate2ContinuationPlan,
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

test('Wan Animate 2 plans fixed 81-frame continuation windows against source timing', () => {
  assert.equal(WAN_ANIMATE_2_FRAME_ADVANCE, 80);
  assert.equal(WAN_ANIMATE_2_MAX_SECONDS, 15);
  assert.deepEqual(wanAnimate2ContinuationPlan({
    sourceFrames: 240,
    sourceFps: 30,
    requestedSeconds: 8,
  }), {
    fps: 24,
    inputFps: 30,
    inputFrames: 240,
    sourceFrames: 192,
    sourceSeconds: 8,
    requestedSeconds: 8,
    outputFrames: 192,
    seconds: 8,
    windowCount: 3,
    generatedFrames: 241,
    segments: [
      { index: 0, startFrame: 0, videoFrameOffset: 0, generationFrames: 81, overlapFrames: 0, keepFrames: 81 },
      { index: 1, startFrame: 80, videoFrameOffset: 81, generationFrames: 81, overlapFrames: 1, keepFrames: 80 },
      { index: 2, startFrame: 160, videoFrameOffset: 161, generationFrames: 81, overlapFrames: 1, keepFrames: 31 },
    ],
  });

  const shortened = wanAnimate2ContinuationPlan({
    sourceFrames: 240,
    sourceFps: 30,
    requestedSeconds: 4,
  });
  assert.equal(shortened.outputFrames, 96);
  assert.equal(shortened.windowCount, 2);
  assert.equal(shortened.generatedFrames, 161);
  assert.deepEqual(shortened.segments.map((segment) => segment.keepFrames), [81, 15]);

  const capped = wanAnimate2ContinuationPlan({
    sourceFrames: 900,
    sourceFps: 30,
    requestedSeconds: 30,
  });
  assert.equal(capped.outputFrames, 360);
  assert.equal(capped.seconds, 15);
  assert.equal(capped.windowCount, 5);
  assert.equal(capped.generatedFrames, 401);

  const phone = wanAnimate2ContinuationPlan({
    sourceFrames: 1800,
    sourceFps: 120,
    requestedSeconds: 15,
  });
  assert.equal(phone.fps, 24);
  assert.equal(phone.windowCount, 5);
});

test('Wan Animate 2 continuation plans preserve exact output boundaries and integer cursors', () => {
  for (const [frames, expectedKeeps, expectedOffsets] of [
    [81, [81], [0]],
    [82, [81, 1], [0, 81]],
    [161, [81, 80], [0, 81]],
    [162, [81, 80, 1], [0, 81, 161]],
  ]) {
    const plan = wanAnimate2ContinuationPlan({
      sourceFrames: frames,
      sourceFps: 24,
      requestedSeconds: frames / 24,
    });
    assert.deepEqual(plan.segments.map((segment) => segment.keepFrames), expectedKeeps);
    assert.deepEqual(plan.segments.map((segment) => segment.videoFrameOffset), expectedOffsets);
    assert.equal(plan.segments.reduce((total, segment) => total + segment.keepFrames, 0), frames);
    const last = plan.segments.at(-1);
    assert.equal(last.startFrame + last.overlapFrames + last.keepFrames, frames);
  }

  const fractional = wanAnimate2ContinuationPlan({
    sourceFrames: 192,
    sourceFps: 23.98,
    requestedSeconds: 8,
  });
  assert.ok(fractional.segments.every((segment) => Number.isInteger(segment.videoFrameOffset)));
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
  assert.equal(graph.cache, undefined);
  assert.deepEqual(graph.sampling.inputs.model, ['user_lora_0', 0]);
  assert.equal(graph.performance_load.class_type, 'LoadVideo');
  assert.equal(graph.performance_load.inputs.video, 'performance.mp4');
  assert.equal(graph.performance_slice, undefined);
  assert.deepEqual(graph.performance_parts.inputs.video, ['performance_load', 0]);
  assert.deepEqual(graph.performance_first.inputs, {
    image: ['performance_parts', 0], batch_index: 0, length: 1,
  });
  assert.deepEqual(graph.reference_resize.inputs, {
    input: ['reference_load', 0],
    resize_type: 'scale dimensions',
    'resize_type.width': 480,
    'resize_type.height': 848,
    'resize_type.crop': 'center',
    scale_method: 'area',
  });
  assert.equal(graph.performance_resize, undefined);
  assert.equal(orderedClasses.includes('ResizeImageMaskNode'), false);
  assert.deepEqual(graph.conditioning.inputs.reference_image, ['reference_resize', 0]);
  assert.deepEqual(graph.conditioning.inputs.pose_video, ['performance_parts', 0]);
  assert.equal(graph.conditioning.inputs.length, 81);
  assert.equal(graph.conditioning.inputs.batch_size, 1);
  assert.equal(graph.conditioning.inputs.video_frame_offset, 0);
  assert.equal(graph.conditioning.inputs.reference_image_strength, 1.1);
  assert.equal(graph.conditioning.inputs.pose_strength, 0.9);
  assert.equal(graph.scheduler.inputs.steps, 6);
  assert.equal(graph.sampler_select.inputs.sampler_name, 'lcm');
  assert.deepEqual(graph.trim.inputs.trim_amount, ['conditioning', 3]);
  assert.equal(graph.video.inputs.audio, undefined);
  assert.equal(graph.video.inputs.fps, 24);
  assert.equal(graph.poster_save.class_type, 'SaveImage');
  assert.equal(graph.save.class_type, 'SaveVideo');
});

test('Wan Animate 2 runs long performances as bounded continuation graphs', async () => {
  const orderedClasses = [];
  const plan = wanAnimate2ContinuationPlan({
    sourceFrames: 240,
    sourceFps: 30,
    requestedSeconds: 8,
  });
  const first = await buildWanAnimate2Graph('character.png', {
    driveVideoName: 'eight-seconds.mp4',
    W: 848,
    H: 480,
    seed: 100,
    wanAnimate2Plan: plan,
    wanAnimate2Segment: plan.segments[0],
    saveContinuationFrame: true,
  }, settings, {
    nodeFromOrdered: async (classType, _ordered, links, overrides) => {
      orderedClasses.push(classType);
      return { class_type: classType, inputs: Object.assign({}, links, overrides) };
    },
    filterInputs: async (value) => value,
  });

  assert.equal(first.conditioning.inputs.length, 81);
  assert.equal(first.conditioning.inputs.continue_motion, undefined);
  assert.equal(first.conditioning.inputs.video_frame_offset, 0);
  assert.equal(first.performance_slice, undefined);
  assert.deepEqual(first.performance_parts.inputs.video, ['performance_load', 0]);
  assert.equal(first.sample.inputs.noise_seed, 100);
  assert.deepEqual(first.continuation_pick.inputs, {
    image: ['decode', 0], batch_index: 80, length: 1,
  });
  assert.equal(first.continuation_save.class_type, 'SaveImage');
  assert.equal(Object.values(first).filter((node) => node.class_type === 'SamplerCustom').length, 1);
  assert.equal(Object.values(first).some((node) => node.class_type === 'ImageBatch'), false);

  const middleSegment = plan.segments[1];
  const middle = await buildWanAnimate2Graph('character.png', {
    driveVideoName: 'eight-seconds.mp4',
    W: 848,
    H: 480,
    seed: 101,
    wanAnimate2Plan: plan,
    wanAnimate2Segment: middleSegment,
    continuationImageName: 'previous-last-frame.png',
    saveContinuationFrame: true,
  }, settings, {
    nodeFromOrdered: async (classType, _ordered, links, overrides) => (
      { class_type: classType, inputs: Object.assign({}, links, overrides) }
    ),
    filterInputs: async (value) => value,
  });
  assert.equal(middle.conditioning.inputs.video_frame_offset, 81);
  assert.deepEqual(middle.conditioning.inputs.continue_motion, ['continuation_load', 0]);
  assert.deepEqual(middle.continuation_pick.inputs, {
    image: ['overlap_trim', 0], batch_index: 79, length: 1,
  });

  const lastSegment = plan.segments[2];
  const continuation = await buildWanAnimate2Graph('character.png', {
    driveVideoName: 'eight-seconds.mp4',
    W: 848,
    H: 480,
    seed: 102,
    wanAnimate2Plan: plan,
    wanAnimate2Segment: lastSegment,
    continuationImageName: 'previous-last-frame.png',
  }, settings, {
    nodeFromOrdered: async (classType, _ordered, links, overrides) => (
      { class_type: classType, inputs: Object.assign({}, links, overrides) }
    ),
    filterInputs: async (value) => value,
  });
  assert.deepEqual(continuation.conditioning.inputs.continue_motion, ['continuation_load', 0]);
  assert.equal(continuation.conditioning.inputs.video_frame_offset, 161);
  assert.equal(continuation.continuation_load.inputs.image, 'previous-last-frame.png');
  assert.equal(continuation.performance_slice, undefined);
  assert.deepEqual(continuation.performance_parts.inputs.video, ['performance_load', 0]);
  assert.deepEqual(continuation.performance_first.inputs, {
    image: ['performance_parts', 0], batch_index: 0, length: 1,
  });
  assert.deepEqual(continuation.overlap_trim.inputs, {
    image: ['decode', 0],
    batch_index: ['conditioning', 4],
    length: 81,
  });
  assert.deepEqual(continuation.output_trim.inputs, {
    image: ['overlap_trim', 0], batch_index: 0, length: 31,
  });
  assert.deepEqual(continuation.video.inputs.images, ['output_trim', 0]);
  assert.equal(Object.values(continuation).filter((node) => node.class_type === 'SamplerCustom').length, 1);
  assert.equal(orderedClasses.filter((className) => className === 'SamplerCustom').length, 1);
});
