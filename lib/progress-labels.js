'use strict';

const SHARED_SAMPLERS = new Set([
  'KSampler',
  'KSamplerAdvanced',
  'SamplerCustom',
  'SamplerCustomAdvanced',
]);

const NODE_LABELS = {
  UNETLoader: 'Loading Krea 2...',
  CLIPLoader: 'Loading text encoder...',
  VAELoader: 'Loading VAE...',
  LoraLoader: 'Applying LoRAs...',
  TextGenerate: 'Enhancing prompt...',
  CLIPTextEncode: 'Encoding prompt...',
  TextEncodeQwenImageEditPlus: 'Encoding prompt + images...',
  VAEDecode: 'Decoding...',
  SaveImage: 'Saving...',
  SeedVR2LoadDiTModel: 'Loading SeedVR2...',
  SeedVR2LoadVAEModel: 'Loading SeedVR2 VAE...',
  SeedVR2VideoUpscaler: 'Upscaling...',
  ImageScaleBy: 'Pre-resizing...',
  LoadImage: 'Loading image...',
  UpscaleModelLoader: 'Loading upscale model...',
  UltimateSDUpscale: 'Upscaling tiles...',
  Ideogram4PromptBuilderKJ: 'Building region prompt...',
  Krea2RegionalMultiLoRAV3: 'Applying region guidance...',
  ImageToMask: 'Preparing mask...',
  GrowMask: 'Softening mask...',
  VAEEncodeForInpaint: 'Encoding inpaint area...',
  LoadSAM3Model: 'Loading SAM3...',
  SAM3Grounding: 'Finding matching objects...',
  SAM3CreatePoint: 'Preparing selection point...',
  SAM3CombinePoints: 'Combining selection points...',
  SAM3Segmentation: 'Tracing selected object...',
  MaskToImage: 'Preparing mask...',
  CheckpointLoaderSimple: 'Loading LTX 2.3...',
  LTXAVTextEncoderLoader: 'Loading Gemma...',
  TextGenerateLTX2Prompt: 'Enhancing motion prompt...',
  LTXVLatentUpsampler: 'Upsampling video...',
  VAEDecodeTiled: 'Decoding frames...',
  RTXVideoSuperResolution: 'RTX 4K pass...',
  CreateVideo: 'Encoding video...',
  SaveVideo: 'Saving video...',
};

function nodeLabelForJob(job, nodeId) {
  const node = job && job.graph && job.graph[nodeId];
  const classType = node && node.class_type ? node.class_type : '';
  if (SHARED_SAMPLERS.has(classType)) {
    return job && job.kind === 'video' ? 'Generating video...' : 'Sampling...';
  }
  return NODE_LABELS[classType] || 'Working...';
}

module.exports = { nodeLabelForJob };
