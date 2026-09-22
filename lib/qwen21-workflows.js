'use strict';

// Official ComfyUI templates: Comfy-Org/workflow_templates, image_qwen_image_2_1_*.
const { diffusionModelLoader } = require('./model-loader');
const QWEN21_REPO = 'https://huggingface.co/Comfy-Org/Qwen-Image-2.1';
const QWEN21_LICENSE = 'https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE';
const QWEN21_VARIANTS = Object.freeze({
  compact: { label: 'Lower memory', unet: 'qwen_image_2.1_int8_convrot.safetensors', clip: 'qwen3vl_8b_w4a8.safetensors' },
  balanced: { label: 'Balanced', unet: 'qwen_image_2.1_int8_convrot.safetensors', clip: 'qwen3vl_8b_int8_convrot.safetensors' },
  bf16: { label: 'Full precision', unet: 'qwen_image_2.1_bf16.safetensors', clip: 'qwen3vl_8b_bf16.safetensors' },
});
const QWEN21_VAE = 'qwen_image_2.1_vae_bf16.safetensors';
const QWEN21_CLASSES = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'TextEncodeQwenImage21', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'LoadImage', 'ImageScale', 'RepeatLatentBatch'];
function recommendedQwen21Variant(hardware = {}) {
  // ConvRot kernels are intended for NVIDIA; keep other backends on BF16.
  if (hardware.gpuVendor && String(hardware.gpuVendor).toLowerCase() !== 'nvidia') return 'bf16';
  return Number(hardware.vramGb) >= 16 ? 'balanced' : 'compact';
}
function qwen21VariantSettings(value, hardware = {}) {
  const id = Object.hasOwn(QWEN21_VARIANTS, value) ? value : recommendedQwen21Variant(hardware);
  const variant = QWEN21_VARIANTS[id];
  return { qwen21ModelVariant: id, qwen21Unet: variant.unet, qwen21Clip: variant.clip, qwen21Vae: QWEN21_VAE };
}
function qwen21Compatibility(info) {
  const missingNodes = QWEN21_CLASSES.filter((name) => !info?.[name]);
  return { supported: info ? missingNodes.length === 0 : null, missingNodes,
    reason: 'Qwen Image 2.1 needs current ComfyUI with TextEncodeQwenImage21 support. Update ComfyUI, restart it, then check again.' };
}
function buildQwen21Graph(p, settings, references = []) {
  if (references.length > 10) throw new Error('Qwen Image 2.1 supports up to 10 input images');
  if (p.mode === 'edit' && !references.length) throw new Error('Qwen Image 2.1 editing needs an input image');
  if (p.maskImageName || p.editOutpaint || p.qwenAngle || p.regions?.length || p.imageGuideMode === 'depth' || p.imageGuideMode === 'style') {
    throw new Error('Use whole-image editing with Qwen Image 2.1; regional, mask, depth, style, and camera tools use their existing models');
  }
  const round = (v) => Math.max(64, Math.min(4096, Math.round((Number(v) || 1024) / 32) * 32));
  // The shared composer uses "image 1"; Qwen 2.1 expects native image tags.
  const prompt = String(p.enhancedText || p.prompt || '').replace(/(?:@image-|\bimage\s+)(10|[1-9])\b/gi,
    (match, index) => Number(index) <= references.length ? `<image${index}>` : match);
  const graph = {
    model: diffusionModelLoader(settings.qwen21Unet),
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: settings.qwen21Clip, type: 'qwen_image', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: settings.qwen21Vae } },
    text: { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['clip', 0], prompt, negative_prompt: p.negativePrompt || '', resolution: 1024 } },
  };
  let model = ['model', 0];
  for (const [index, lora] of (p.loras || []).entries()) {
    if (lora.on === false) continue;
    const key = `lora${index}`;
    graph[key] = { class_type: 'LoraLoaderModelOnly', inputs: { model, lora_name: lora.name, strength_model: lora.strength ?? 1 } };
    model = [key, 0];
  }
  references.forEach((image, index) => {
    const key = `image${index + 1}`;
    graph[key] = { class_type: 'LoadImage', inputs: { image } };
    let source = [key, 0];
    if (index === 0 && p.editAspectOverride) {
      graph.resize = { class_type: 'ImageScale', inputs: { image: source, width: round(p.width), height: round(p.height), upscale_method: 'lanczos', crop: 'center' } };
      source = ['resize', 0];
      graph.text.inputs.resolution = 0;
    }
    graph.text.inputs[`images.image_${index + 1}`] = source;
    graph.text.inputs.vae = ['vae', 0];
  });
  let latent;
  if (references.length) {
    latent = ['text', 2];
    if (Number(p.batch) > 1) {
      graph.batch = { class_type: 'RepeatLatentBatch', inputs: { samples: latent, amount: p.batch } };
      latent = ['batch', 0];
    }
  } else {
    graph.latent = { class_type: 'EmptyLatentImage', inputs: { width: round(p.width), height: round(p.height), batch_size: p.batch || 1 } };
    latent = ['latent', 0];
  }
  graph.sampler = { class_type: 'KSampler', inputs: { model, positive: ['text', 0], negative: ['text', 1], latent_image: latent, seed: p.seed, steps: p.steps || 25, cfg: p.cfg ?? 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 } };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'MixStudio/qwen21' } };
  return graph;
}
module.exports = { QWEN21_REPO, QWEN21_LICENSE, QWEN21_VARIANTS, QWEN21_VAE, QWEN21_CLASSES, recommendedQwen21Variant, qwen21VariantSettings, qwen21Compatibility, buildQwen21Graph };
