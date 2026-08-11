'use strict';

const WAN_ANIMATE_2_FRAMES = 81;
const WAN_ANIMATE_2_FRAME_ADVANCE = WAN_ANIMATE_2_FRAMES - 1;
const WAN_ANIMATE_2_MAX_SECONDS = 15;
const WAN_ANIMATE_2_STEPS = 6;
const WAN_ANIMATE_2_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';
const WAN_ANIMATE_2_POSE_PROMPT = 'The character follows the exact body motion, gestures, facial expressions, gaze, and timing shown in the performance video.';
const WAN_ANIMATE_2_DEFAULT_PROMPT = 'Character description: Match the reference image exactly. Background description: Keep a coherent natural environment with consistent lighting and camera framing.';

function wanAnimate2Dimensions(width, height) {
  const sourceWidth = Math.max(1, Number(width) || 832);
  const sourceHeight = Math.max(1, Number(height) || 480);
  const targetPixels = 832 * 480;
  const scale = Math.sqrt(targetPixels / (sourceWidth * sourceHeight));
  return {
    W: Math.max(256, Math.round((sourceWidth * scale) / 16) * 16),
    H: Math.max(256, Math.round((sourceHeight * scale) / 16) * 16),
  };
}

function wanAnimate2Prompt(value) {
  const prompt = String(value || '').trim();
  return prompt ? `Character and background description: ${prompt}` : WAN_ANIMATE_2_DEFAULT_PROMPT;
}

function wanAnimate2ContinuationPlan({ sourceFrames, sourceFps, requestedSeconds } = {}) {
  const inputFps = Math.max(1, Math.min(240, Number(sourceFps) || 24));
  // The official workflow recommends 16–24 fps. Preserving 30/60/120 fps
  // multiplies the number of 81-frame diffusion windows without improving
  // the model's temporal detail, and can exhaust RAM during final cleanup.
  const fps = Math.min(24, inputFps);
  const inputFrames = Math.max(1, Math.floor(Number(sourceFrames) || WAN_ANIMATE_2_FRAMES));
  const sourceSeconds = inputFrames / inputFps;
  const availableFrames = Math.max(1, Math.round(sourceSeconds * fps));
  const requested = Number(requestedSeconds);
  const boundedSeconds = Math.min(
    sourceSeconds,
    WAN_ANIMATE_2_MAX_SECONDS,
    Number.isFinite(requested) && requested > 0 ? requested : sourceSeconds,
  );
  const outputFrames = Math.max(1, Math.min(availableFrames, Math.round(boundedSeconds * fps)));
  const windowCount = Math.max(1, Math.ceil((outputFrames - 1) / WAN_ANIMATE_2_FRAME_ADVANCE));
  const generatedFrames = WAN_ANIMATE_2_FRAMES
    + (windowCount - 1) * WAN_ANIMATE_2_FRAME_ADVANCE;
  const segments = [];
  let remaining = outputFrames;
  for (let index = 0; index < windowCount; index += 1) {
    const overlapFrames = index === 0 ? 0 : 1;
    const availableOutputFrames = WAN_ANIMATE_2_FRAMES - overlapFrames;
    const keepFrames = Math.max(1, Math.min(availableOutputFrames, remaining));
    const startFrame = index * WAN_ANIMATE_2_FRAME_ADVANCE;
    // WanAnimate2ToVideo subtracts the one-frame continue_motion anchor before
    // seeking into pose_video. These are therefore the exact cursor values the
    // official chained workflow would pass between 81-frame windows: 0, 81,
    // 161, 241, ... (effective pose starts 0, 80, 160, 240, ...).
    const videoFrameOffset = index === 0 ? 0 : startFrame + overlapFrames;
    segments.push({
      index,
      startFrame,
      videoFrameOffset,
      generationFrames: WAN_ANIMATE_2_FRAMES,
      overlapFrames,
      keepFrames,
    });
    remaining -= keepFrames;
  }
  return {
    fps,
    inputFps,
    inputFrames,
    sourceFrames: availableFrames,
    sourceSeconds,
    requestedSeconds: boundedSeconds,
    outputFrames,
    seconds: outputFrames / fps,
    windowCount,
    generatedFrames,
    segments,
  };
}

function resizeImageMaskToDimensions(input, width, height) {
  return {
    class_type: 'ResizeImageMaskNode',
    inputs: {
      input,
      resize_type: 'scale dimensions',
      'resize_type.width': width,
      'resize_type.height': height,
      'resize_type.crop': 'center',
      scale_method: 'area',
    },
  };
}

async function buildWanAnimate2Graph(referenceImageName, opts = {}, settings = {}, deps = {}) {
  const nodeFromOrdered = deps.nodeFromOrdered || (async (classType, _ordered, links, overrides) => ({
    class_type: classType,
    inputs: Object.assign({}, links || {}, overrides || {}),
  }));
  const filterInputs = deps.filterInputs || (async (graph) => graph);
  const plan = opts.wanAnimate2Plan || wanAnimate2ContinuationPlan({
    sourceFrames: opts.frames,
    sourceFps: opts.fps,
    requestedSeconds: opts.seconds,
  });
  const segment = opts.wanAnimate2Segment
    || (Array.isArray(plan.segments) && plan.segments[0])
    || {
      index: 0,
      startFrame: 0,
      videoFrameOffset: 0,
      generationFrames: WAN_ANIMATE_2_FRAMES,
      overlapFrames: 0,
      keepFrames: Math.min(WAN_ANIMATE_2_FRAMES, Math.max(1, Number(plan.outputFrames) || WAN_ANIMATE_2_FRAMES)),
    };
  const graph = {};

  graph.model = {
    class_type: 'UNETLoader',
    inputs: { unet_name: settings.wanAnimate2Unet, weight_dtype: 'default' },
  };
  graph.lightx = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['model', 0], lora_name: settings.wanAnimate2Lora, strength_model: 1 },
  };
  let activeModel = ['lightx', 0];
  for (const [index, lora] of (Array.isArray(opts.loras) ? opts.loras : []).entries()) {
    if (!lora || lora.on === false || !lora.name) continue;
    const key = `user_lora_${index}`;
    graph[key] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: activeModel,
        lora_name: String(lora.name),
        strength_model: Math.max(0, Math.min(2, Number(lora.strength) || 1)),
      },
    };
    activeModel = [key, 0];
  }
  // WanAnimate2Cache is intentionally not forced. Even int8 retains roughly
  // 6.25 GB per 81-frame pose slot until graph cleanup; the uncached path is
  // slower but bounded and reliable across systems with modest RAM/pagefiles.
  graph.sampling = {
    class_type: 'ModelSamplingSD3',
    inputs: { model: activeModel, shift: 5 },
  };
  graph.clip = {
    class_type: 'CLIPLoader',
    inputs: { clip_name: settings.wanAnimate2Clip, type: 'wan', device: 'default' },
  };
  graph.positive = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['clip', 0], text: wanAnimate2Prompt(opts.prompt) },
  };
  graph.negative = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['clip', 0], text: WAN_ANIMATE_2_NEGATIVE },
  };
  graph.pose_prompt = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: ['clip', 0], text: WAN_ANIMATE_2_POSE_PROMPT },
  };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.wanAnimate2Vae } };
  graph.clip_vision = {
    class_type: 'CLIPVisionLoader',
    inputs: { clip_name: settings.wanAnimate2ClipVision },
  };

  graph.reference_load = { class_type: 'LoadImage', inputs: { image: referenceImageName } };
  graph.reference_resize = resizeImageMaskToDimensions(['reference_load', 0], opts.W, opts.H);
  graph.reference_vision = {
    class_type: 'CLIPVisionEncode',
    inputs: { clip_vision: ['clip_vision', 0], image: ['reference_resize', 0], crop: 'none' },
  };

  graph.performance_load = await nodeFromOrdered(
    'LoadVideo',
    [opts.driveVideoName, 'image'],
    {},
    { video: opts.driveVideoName },
  );
  // Keep the same full performance source and advance Wan's native frame
  // cursor on continuation jobs. Time-slicing each job while resetting the
  // cursor made every diffusion pass restart its motion phase and could repeat
  // the opening movement across the joined result.
  graph.performance_parts = {
    class_type: 'GetVideoComponents',
    inputs: { video: ['performance_load', 0] },
  };
  graph.performance_first = {
    class_type: 'ImageFromBatch',
    inputs: { image: ['performance_parts', 0], batch_index: 0, length: 1 },
  };
  graph.performance_vision = {
    class_type: 'CLIPVisionEncode',
    inputs: { clip_vision: ['clip_vision', 0], image: ['performance_first', 0], crop: 'none' },
  };

  graph.scheduler = {
    class_type: 'BasicScheduler',
    inputs: { model: ['sampling', 0], scheduler: 'simple', steps: WAN_ANIMATE_2_STEPS, denoise: 1 },
  };
  graph.sampler_select = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'lcm' } };
  const conditioningInputs = {
      positive: ['positive', 0],
      negative: ['negative', 0],
      vae: ['vae', 0],
      reference_image: ['reference_resize', 0],
      pose_video: ['performance_parts', 0],
      clip_vision_output: ['reference_vision', 0],
      positive_pose: ['pose_prompt', 0],
      clip_vision_output_pose: ['performance_vision', 0],
      width: opts.W,
      height: opts.H,
      length: Math.max(1, Number(segment.generationFrames) || WAN_ANIMATE_2_FRAMES),
      batch_size: 1,
      video_frame_offset: Math.max(0, Math.floor(Number(segment.videoFrameOffset) || 0)),
      pose_strength: Math.max(0, Math.min(2, Number(opts.motionStrength) || 1)),
      pose_start_percent: 0,
      pose_end_percent: 1,
      reference_image_strength: Math.max(0, Math.min(2, Number(opts.identityStrength) || 1)),
    };
  if (Number(segment.index) > 0) {
    graph.continuation_load = {
      class_type: 'LoadImage',
      inputs: { image: opts.continuationImageName },
    };
    conditioningInputs.continue_motion = ['continuation_load', 0];
  }
  graph.conditioning = {
    class_type: 'WanAnimate2ToVideo',
    inputs: conditioningInputs,
  };
  const segmentSeed = Math.max(0, Math.floor(Number(opts.seed) || 0));
  graph.sample = await nodeFromOrdered(
    'SamplerCustom',
    [true, segmentSeed, 'fixed', 1],
    {
      model: ['sampling', 0],
      positive: ['conditioning', 0],
      negative: ['conditioning', 1],
      sampler: ['sampler_select', 0],
      sigmas: ['scheduler', 0],
      latent_image: ['conditioning', 2],
    },
    { add_noise: true, noise_seed: segmentSeed, cfg: 1 },
  );
  graph.trim = {
    class_type: 'TrimVideoLatent',
    inputs: { samples: ['sample', 0], trim_amount: ['conditioning', 3] },
  };
  graph.decode = {
    class_type: 'VAEDecode',
    inputs: { samples: ['trim', 0], vae: ['vae', 0] },
  };

  let frameSource = ['decode', 0];
  const overlapFrames = Math.max(0, Number(segment.overlapFrames) || 0);
  if (overlapFrames > 0) {
    graph.overlap_trim = {
      class_type: 'ImageFromBatch',
      inputs: {
        image: frameSource,
        batch_index: ['conditioning', 4],
        length: WAN_ANIMATE_2_FRAMES,
      },
    };
    frameSource = ['overlap_trim', 0];
  }
  const availableSegmentFrames = WAN_ANIMATE_2_FRAMES - overlapFrames;
  const keepFrames = Math.max(1, Math.min(availableSegmentFrames, Number(segment.keepFrames) || availableSegmentFrames));
  if (keepFrames < availableSegmentFrames) {
    graph.output_trim = {
      class_type: 'ImageFromBatch',
      inputs: { image: frameSource, batch_index: 0, length: keepFrames },
    };
    frameSource = ['output_trim', 0];
  }
  if (opts.saveContinuationFrame) {
    graph.continuation_pick = {
      class_type: 'ImageFromBatch',
      inputs: { image: frameSource, batch_index: keepFrames - 1, length: 1 },
    };
    graph.continuation_save = {
      class_type: 'SaveImage',
      inputs: { images: ['continuation_pick', 0], filename_prefix: 'KreaStudio/wan_continue' },
    };
  }
  if (opts.makePoster) {
    graph.poster_pick = {
      class_type: 'ImageFromBatch',
      inputs: { image: frameSource, batch_index: 0, length: 1 },
    };
    graph.poster_save = {
      class_type: 'SaveImage',
      inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' },
    };
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, fps: Math.max(1, Number(plan.fps) || 24) },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

module.exports = {
  WAN_ANIMATE_2_FRAMES,
  WAN_ANIMATE_2_FRAME_ADVANCE,
  WAN_ANIMATE_2_MAX_SECONDS,
  WAN_ANIMATE_2_STEPS,
  WAN_ANIMATE_2_NEGATIVE,
  WAN_ANIMATE_2_POSE_PROMPT,
  wanAnimate2Dimensions,
  wanAnimate2ContinuationPlan,
  wanAnimate2Prompt,
  buildWanAnimate2Graph,
};
