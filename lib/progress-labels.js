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
  VAEEncodeForInpaint: 'Encoding fill area...',
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
    const phase = progressPhaseForJob(job, nodeId);
    if (job && job.kind === 'video' && phase.phaseCount > 1) {
      return `${phase.phaseLabel} · stage ${phase.phaseIndex} of ${phase.phaseCount}`;
    }
    return job && job.kind === 'video' ? 'Generating video...' : 'Sampling...';
  }
  return NODE_LABELS[classType] || 'Working...';
}

function samplerPhaseLabel(job, nodeId, index, count) {
  const id = String(nodeId || '').toLowerCase();
  if (/ks_high/.test(id)) return 'High-noise pass';
  if (/ks_low/.test(id)) return 'Low-noise pass';
  if (/samp1|first/.test(id)) return 'Base pass';
  if (/samp2|second/.test(id)) return 'Refinement pass';
  if (/^ks\d+$|^ks_\d+$/.test(id)) return `Segment ${index + 1}`;
  return count > 1 ? `Pass ${index + 1}` : 'Generating video';
}

function samplerPhasesForJob(job) {
  if (!job || !job.graph) return [];
  return Object.entries(job.graph)
    .filter(([, node]) => node && SHARED_SAMPLERS.has(node.class_type))
    .map(([nodeId], index, phases) => ({
      nodeId: String(nodeId),
      phaseIndex: index + 1,
      phaseCount: phases.length,
      phaseLabel: samplerPhaseLabel(job, nodeId, index, phases.length),
    }));
}

function progressPhaseForJob(job, nodeId) {
  const phases = samplerPhasesForJob(job);
  const phase = phases.find((entry) => entry.nodeId === String(nodeId));
  if (phase) return Object.assign({ isSampling: true }, phase);
  return {
    isSampling: false,
    phaseIndex: 0,
    phaseCount: phases.length,
    phaseLabel: '',
  };
}

function progressDetailsForJob(job, nodeId, value, max) {
  const local = max > 0 ? Math.max(0, Math.min(1, Number(value) / Number(max))) : 0;
  const phase = progressPhaseForJob(job, nodeId);
  if (!phase.isSampling || !job || job.kind !== 'video' || phase.phaseCount < 2) {
    return Object.assign({}, phase, {
      localPercent: Math.round(local * 100),
      overallPercent: Math.round(local * 100),
    });
  }
  // Reserve the final 4% for decoding, encoding, and saving, which do not
  // emit numeric progress from ComfyUI. This prevents a sampler from
  // claiming the whole job is finished before post-processing starts.
  const samplingOverall = ((phase.phaseIndex - 1) + local) / phase.phaseCount;
  return Object.assign({}, phase, {
    localPercent: Math.round(local * 100),
    overallPercent: Math.min(96, Math.round(samplingOverall * 96)),
  });
}

module.exports = {
  nodeLabelForJob,
  progressDetailsForJob,
  progressPhaseForJob,
  samplerPhasesForJob,
};
