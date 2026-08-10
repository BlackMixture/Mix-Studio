'use strict';

const WAN_ANIMATE_2_FRAMES = 81;
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
  const frames = WAN_ANIMATE_2_FRAMES;
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
  // The official workflow recommends CPU caching to avoid short-lived VRAM spikes.
  graph.cache = {
    class_type: 'WanAnimate2Cache',
    inputs: { model: activeModel, device: 'cpu', dtype: 'int8' },
  };
  graph.sampling = {
    class_type: 'ModelSamplingSD3',
    inputs: { model: ['cache', 0], shift: 5 },
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
  graph.performance_parts = {
    class_type: 'GetVideoComponents',
    inputs: { video: ['performance_load', 0] },
  };
  graph.performance_resize = resizeImageMaskToDimensions(['performance_parts', 0], opts.W, opts.H);
  graph.performance_first = {
    class_type: 'ImageFromBatch',
    inputs: { image: ['performance_resize', 0], batch_index: 0, length: 1 },
  };
  graph.performance_vision = {
    class_type: 'CLIPVisionEncode',
    inputs: { clip_vision: ['clip_vision', 0], image: ['performance_first', 0], crop: 'none' },
  };

  graph.conditioning = {
    class_type: 'WanAnimate2ToVideo',
    inputs: {
      positive: ['positive', 0],
      negative: ['negative', 0],
      vae: ['vae', 0],
      reference_image: ['reference_resize', 0],
      pose_video: ['performance_resize', 0],
      clip_vision_output: ['reference_vision', 0],
      positive_pose: ['pose_prompt', 0],
      clip_vision_output_pose: ['performance_vision', 0],
      width: opts.W,
      height: opts.H,
      length: frames,
      video_frame_offset: 0,
      pose_strength: Math.max(0, Math.min(2, Number(opts.motionStrength) || 1)),
      pose_start_percent: 0,
      pose_end_percent: 1,
      reference_image_strength: Math.max(0, Math.min(2, Number(opts.identityStrength) || 1)),
    },
  };
  graph.scheduler = {
    class_type: 'BasicScheduler',
    inputs: { model: ['sampling', 0], scheduler: 'simple', steps: WAN_ANIMATE_2_STEPS, denoise: 1 },
  };
  graph.sampler_select = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'lcm' } };
  graph.sample = await nodeFromOrdered(
    'SamplerCustom',
    [true, opts.seed, 'fixed', 1],
    {
      model: ['sampling', 0],
      positive: ['conditioning', 0],
      negative: ['conditioning', 1],
      sampler: ['sampler_select', 0],
      sigmas: ['scheduler', 0],
      latent_image: ['conditioning', 2],
    },
    { add_noise: true, noise_seed: opts.seed, cfg: 1 },
  );
  graph.trim = {
    class_type: 'TrimVideoLatent',
    inputs: { samples: ['sample', 0], trim_amount: ['conditioning', 3] },
  };
  graph.decode = {
    class_type: 'VAEDecode',
    inputs: { samples: ['trim', 0], vae: ['vae', 0] },
  };
  if (opts.makePoster) {
    graph.poster_pick = {
      class_type: 'ImageFromBatch',
      inputs: { image: ['decode', 0], batch_index: 0, length: 1 },
    };
    graph.poster_save = {
      class_type: 'SaveImage',
      inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' },
    };
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: ['decode', 0], audio: ['performance_parts', 1], fps: ['performance_parts', 2] },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

module.exports = {
  WAN_ANIMATE_2_FRAMES,
  WAN_ANIMATE_2_STEPS,
  WAN_ANIMATE_2_NEGATIVE,
  WAN_ANIMATE_2_POSE_PROMPT,
  wanAnimate2Dimensions,
  wanAnimate2Prompt,
  buildWanAnimate2Graph,
};
