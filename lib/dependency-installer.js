'use strict';

/*
 * The dependency catalog is deliberately code-owned rather than learned from
 * arbitrary workflow JSON. Every network source below is reviewed, while the
 * installer itself only writes below the configured ComfyUI folders.
 */
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { sam3InstallStatus } = require('./sam3-installer');
const { normalizeModelPath, resolveRegisteredModelName } = require('./model-loader');
const {
  KREA2_VARIANTS,
  krea2VariantSettings,
  normalizeKrea2Variant,
} = require('./krea2-model');

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;

function huggingFaceAccessUrl(value) {
  try {
    const source = new URL(String(value || ''));
    if (source.protocol !== 'https:' || source.hostname.toLowerCase() !== 'huggingface.co') return '';
    const parts = source.pathname.split('/').filter(Boolean);
    if (parts.length < 4 || parts[2] !== 'resolve') return '';
    if (!parts.slice(0, 2).every((part) => /^[A-Za-z0-9._-]+$/.test(part))) return '';
    return `https://huggingface.co/${parts[0]}/${parts[1]}`;
  } catch {
    return '';
  }
}

const NODE_PACKS = Object.freeze({
  gguf: { label: 'ComfyUI GGUF Loader', folder: 'ComfyUI-GGUF', repo: 'https://github.com/city96/ComfyUI-GGUF.git', ref: '6ea2651e7df66d7585f6ffee804b20e92fb38b8a' },
  sam3: { label: 'ComfyUI SAM3', folder: 'ComfyUI-SAM3', repo: 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git', ref: 'de0ff5d2c2ea435d29f800abfa568cffdfb94773' },
  kjnodes: { label: 'KJNodes', folder: 'ComfyUI-KJNodes', repo: 'https://github.com/kijai/ComfyUI-KJNodes.git', ref: 'e27a505b3ba6ce42687fe00500deda103d9d6071' },
  rebalance: { label: 'Conditioning Rebalance', folder: 'ComfyUI-Conditioning-Rebalance', repo: 'https://github.com/nova452/ComfyUI-Conditioning-Rebalance.git', ref: 'aefcfa766fb9d491610a0e04112ffe99c4832b1d' },
  seedvr2: { label: 'SeedVR2 Video Upscaler', folder: 'ComfyUI-SeedVR2_VideoUpscaler', repo: 'https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git', ref: '4490bd1f482e026674543386bb2a4d176da245b9' },
  ultimate: { label: 'Ultimate SD Upscale', folder: 'ComfyUI_UltimateSDUpscale', repo: 'https://github.com/ssitu/ComfyUI_UltimateSDUpscale.git', ref: 'a5547db9e1d07d3318bb21e9e9c474f4c1e9c8df' },
  vhs: { label: 'Video Helper Suite', folder: 'ComfyUI-VideoHelperSuite', repo: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git', ref: '4ee72c065db22c9d96c2427954dc69e7b908444b' },
  ltxvideo: { label: 'LTXVideo', folder: 'ComfyUI-LTXVideo', repo: 'https://github.com/Lightricks/ComfyUI-LTXVideo.git', ref: 'aceeae9635f6d493f2893ba3c411a1c36031788a', compatibilityPatch: 'kornia-pad' },
  rife: { label: 'Frame Interpolation', folder: 'ComfyUI-Frame-Interpolation', repo: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git', ref: '26545cc2dd95bc3d27f056016300673bdeee78f5' },
  eros: { label: '10S Comfy Nodes', folder: '10S-Comfy-nodes', repo: 'https://github.com/TenStrip/10S-Comfy-nodes.git', ref: '257400c45394efb2fa53a0a8fe3b3e8ac7392548' },
  bfs: { label: 'BFS Nodes', folder: 'ComfyUI-BFSNodes', repo: 'https://github.com/alisson-anjos/ComfyUI-BFSNodes.git', ref: '7112d6e640941e5f9c6f0402efd592f8bf340a06' },
  scailInfinity: { label: 'SCAIL 2 Infinity', folder: 'comfyui-scail2-infinity', repo: 'https://github.com/collbroGTR/comfyui-scail2-infinity.git', ref: '08dcf0d56979fc2238ce8c7716dad6cb7e9c9a89' },
  regional: {
    label: 'Krea 2 Regional MultiLoRA',
    folder: 'Krea2-Multi-Character-Lora-Node-w-bounding-box-By-Fedor',
    compatibleFolders: ['ComfyUI-Krea2Regional-MultiLoRA'],
    repo: 'https://github.com/CliffNodes/Krea2-Multi-Character-Lora-Node-w-bounding-box-By-Fedor.git',
    ref: '3c3541029b5de88f0e6eebce7ece7cb7d4f65b0f',
    allowCompatibleMirror: true,
    nodeSignatures: [{ file: 'krea2_regional_multilora_v3.py', values: ['class Krea2RegionalMultiLoRAV3', 'NODE_CLASS_MAPPINGS'] }],
  },
  krea2Control: { label: 'Krea 2 ControlNet', folder: 'comfyui-krea2-controlnet', repo: 'https://github.com/facok/comfyui-krea2-controlnet.git', ref: '79ebfd3bd80d2180b334dd7ce57f3c9ddaa0848f' },
  depthAnything3: { label: 'Depth Anything V3', folder: 'ComfyUI-DepthAnythingV3', repo: 'https://github.com/PozzettiAndrea/ComfyUI-DepthAnythingV3.git', ref: '6b08cf418dff47430a72e07d0eec8fdb07d464b1' },
  krea2Style: { label: 'Krea 2 Style Transfer', folder: 'ComfyUI-Krea2-StyleTransfer', repo: 'https://github.com/jieg9341-lab/ComfyUI-Krea2-StyleTransfer.git', ref: 'b30d495ab7e5626a2effc72a071430297643b718' },
  krea2Edit: { label: 'Krea 2 Identity Edit', folder: 'comfyui-krea2edit', repo: 'https://github.com/lbouaraba/comfyui-krea2edit.git', ref: '26dd9c64fd4c87fb56fcd732a68f41ca27dbe882' },
  whatdreamscost: {
    label: 'WhatDreamsCost LTX Director',
    folder: 'WhatDreamsCost-ComfyUI',
    repo: 'https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git',
    ref: 'd6495f50926ab245a0b96f76ef6b89de40d19f6e',
  },
});

/* Each asset targets the same setting key the app uses at generation time. */
const MODEL_ASSETS = Object.freeze({
  image: [
    ['unet', 'diffusion_models', hf('Comfy-Org/Krea-2', 'diffusion_models/krea2_turbo_fp8_scaled.safetensors')],
    ['clip', 'text_encoders', hf('cusiman/Huihui-Qwen3-VL-4B-Instruct-abliterated-comfy', 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors')],
    ['vae', 'vae', hf('Comfy-Org/Krea-2', 'vae/qwen_image_vae.safetensors')],
  ],
  krea2Raw: [
    ['krea2RawUnet', 'diffusion_models', hf('Comfy-Org/Krea-2', 'diffusion_models/krea2_raw_fp8_scaled.safetensors')],
    ['krea2TurboLora', 'loras', hf('Comfy-Org/Krea-2', 'loras/krea2_turbo_lora_rank_64_bf16.safetensors')],
  ],
  krea2Depth: [
    ['krea2DepthLora', 'loras', hf('Patil/Krea-2-depth-controlnet', 'depth-control-lora.safetensors')],
    ['depthAnythingV3Model', 'depthanything3', hf('depth-anything/DA3-LARGE-1.1', 'model.safetensors'), 'da3_large.safetensors'],
  ],
  krea2Outpaint: [
    ['krea2OutpaintLora', 'loras', hf('conradlocke/krea2-identity-edit', 'krea2_identity_edit_v1_1_r128.safetensors')],
  ],
  klein4: [
    ['klein4Unet', 'diffusion_models', hf('black-forest-labs/FLUX.2-klein-4b-fp8', 'flux-2-klein-4b-fp8.safetensors')],
    ['klein4Clip', 'text_encoders', hf('Comfy-Org/vae-text-encorder-for-flux-klein-4b', 'split_files/text_encoders/qwen_3_4b.safetensors')],
    ['klein4ConsistencyLora', 'loras', hf('lrzjason/Consistance_Edit_Lora', 'f2k_4B_consist_20260314.safetensors')],
    ['kleinVae', 'vae', hf('Comfy-Org/flux2-dev', 'split_files/vae/flux2-vae.safetensors')],
  ],
  klein9: [
    ['klein9Unet', 'diffusion_models', hf('black-forest-labs/FLUX.2-klein-9b-fp8', 'flux-2-klein-9b-fp8.safetensors')],
    ['klein9Clip', 'text_encoders', hf('Comfy-Org/flux2-klein-9B', 'split_files/text_encoders/qwen_3_8b_fp8mixed.safetensors')],
    ['klein9ConsistencyLora', 'loras', hf('lrzjason/Consistance_Edit_Lora', 'f2k_9B_lcs_consist_20260415.safetensors')],
    ['kleinVae', 'vae', hf('Comfy-Org/flux2-dev', 'split_files/vae/flux2-vae.safetensors')],
  ],
  qwen: [
    ['qwenEditUnet', 'diffusion_models', hf('Comfy-Org/Qwen-Image-Edit_ComfyUI', 'split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors')],
    ['qwenEditClip', 'text_encoders', hf('Comfy-Org/Qwen-Image_ComfyUI', 'split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors')],
    ['qwenEditLora', 'loras', hf('art1455/Qwen2511', 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors')],
    ['qwenEditAnglesLora', 'loras', hf('art1455/Qwen2511', 'qwen_image_edit_2511_multiple-angles-lora.safetensors')],
  ],
  upscale: [
    ['seedvr2Dit', 'SEEDVR2', hf('AInVFX/SeedVR2_comfyUI', 'seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors')],
    ['seedvr2Vae', 'SEEDVR2', hf('numz/SeedVR2_comfyUI', 'ema_vae_fp16.safetensors')],
  ],
  ltx: [
    ['ltxCkpt', 'checkpoints', hf('Lightricks/LTX-2.3-fp8', 'ltx-2.3-22b-dev-fp8.safetensors')],
    ['ltxDistilledLora', 'loras', hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-lora-384.safetensors')],
    ['ltxTextEncoder', 'text_encoders', hf('Lightricks/LTX-2.3', 'gemma_3_12B_it_fp4_mixed.safetensors')],
    ['ltxGemmaLora', 'loras', hf('Comfy-Org/ltx-2', 'split_files/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors'), undefined, [hf('Lightricks/LTX-2.3', 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors')]],
    ['ltxUpscaler', 'latent_upscale_models', hf('Lightricks/LTX-2.3', 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors')],
  ],
  ltxCamera: [
    ['ltxCameramanLora', 'loras', hf('Cseti/LTX2.3-22B_IC-LoRA-Cameraman_v2', 'LTX2.3-22B_IC-LoRA-Cameraman_v2_14000.safetensors')],
  ],
  ltxDirector: [
    ['ltxDirectorIcLora', 'loras', hf('Lightricks/LTX-2.3-22b-IC-LoRA-Ingredients', 'ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors')],
  ],
  ltxEdit: [
    ['ltxEditLora', 'loras', hf('Alissonerdx/EditAnything', 'edit_anything_v1.1_r256.safetensors')],
  ],
  faceid: [
    ['ltxFaceIdLora', 'loras', hf('Kijai/LTX-2.3-FaceID', 'Best_FaceID_v1.0_LoRA.safetensors')],
    ['ltxFaceIdDistilledLora', 'loras', hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors')],
  ],
  wan: [
    ['wanHighUnet', 'diffusion_models', hf('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors')],
    ['wanLowUnet', 'diffusion_models', hf('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors')],
    ['wanClip', 'text_encoders', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')],
    ['wanVae', 'vae', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/vae/wan_2.1_vae.safetensors')],
    ['wanHighLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors')],
    ['wanLowLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors')],
  ],
  eros: [
    ['erosCkpt', 'checkpoints', hf('Tridae/ErosDeployment_ComfyUI', 'checkpoints/10Eros_v1.2_fp8mixed_learned.safetensors')],
    ['erosTextEncoder', 'text_encoders', hf('Tridae/ErosDeployment_ComfyUI', 'text_encoders/gemma_3_12B_it_heretic_fp8_e4m3fn.safetensors')],
    ['erosDmdLora', 'loras', hf('Tridae/ErosDeployment_ComfyUI', 'loras/LTX2.3_DMD_reshaped_r256.safetensors')],
  ],
  scail: [
    ['scailUnet', 'diffusion_models', hf('Comfy-Org/SCAIL-2', 'diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors')],
    ['scailLora', 'loras', hf('Comfy-Org/SCAIL-2', 'loras/Wan2.1/Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors')],
    ['scailPusaLora', 'loras', hf('Comfy-Org/SCAIL-2', 'loras/Pusa/Wan21_PusaV1_LoRA_14B_rank512_bf16.safetensors')],
    ['scailClipVision', 'clip_vision', hf('Comfy-Org/SCAIL-2', 'clip_vision/clip_vision_h.safetensors')],
    ['scailSam', 'checkpoints', hf('Comfy-Org/SCAIL-2', 'checkpoints/sam3.1_multiplex_fp16.safetensors')],
  ],
});

const KLEIN4_LEGACY_BF16_ASSET = Object.freeze([
  'klein4Unet',
  'diffusion_models',
  hf('black-forest-labs/FLUX.2-klein-4B', 'flux-2-klein-4b.safetensors'),
]);

const KREA2_VARIANT_ASSETS = Object.freeze({
  fp8: Object.freeze([
    ['unet', 'diffusion_models', hf('Comfy-Org/Krea-2', `diffusion_models/${KREA2_VARIANTS.fp8.turbo}`)],
    ['krea2RawUnet', 'diffusion_models', hf('Comfy-Org/Krea-2', `diffusion_models/${KREA2_VARIANTS.fp8.raw}`)],
  ]),
  'int8-convrot': Object.freeze([
    ['unet', 'diffusion_models', hf('Comfy-Org/Krea-2', `diffusion_models/${KREA2_VARIANTS['int8-convrot'].turbo}`)],
    ['krea2RawUnet', 'diffusion_models', hf('Comfy-Org/Krea-2', `diffusion_models/${KREA2_VARIANTS['int8-convrot'].raw}`)],
  ]),
});

function dependencyModelPlan(modelGroups, settings = {}, options = {}) {
  const groups = [...new Set(modelGroups || [])];
  const requested = options.modelVariants && options.modelVariants.krea2;
  const requestedSettings = requested ? krea2VariantSettings(requested) : settings;
  const krea2Variant = normalizeKrea2Variant(requested || settings.krea2ModelVariant, requestedSettings);
  let settingUpdates = {};
  if (requested && groups.includes('image')) settingUpdates = krea2VariantSettings(krea2Variant);
  else if (requested && groups.includes('krea2Raw')) {
    settingUpdates = { krea2RawUnet: KREA2_VARIANTS[krea2Variant].raw };
  }
  const effectiveSettings = Object.assign({}, settings, settingUpdates);
  const variantAssets = new Map((KREA2_VARIANT_ASSETS[krea2Variant] || []).map((asset) => [asset[0], asset]));
  const assets = [...new Map(groups.flatMap((key) => (MODEL_ASSETS[key] || []).map((asset) => {
    if ((key === 'image' || key === 'krea2Raw') && variantAssets.has(asset[0])) return variantAssets.get(asset[0]);
    if (key === 'klein4' && asset[0] === 'klein4Unet'
      && normalizeModelName(effectiveSettings.klein4Unet) === 'flux-2-klein-4b.safetensors') {
      return KLEIN4_LEGACY_BF16_ASSET;
    }
    return asset;
  })).map((asset) => [asset[0], asset])).values()];
  return { assets, effectiveSettings, krea2Variant, settingUpdates };
}

const COMPONENTS = Object.freeze({
  smartmask: { label: 'Smart Mask Tools', nodes: ['sam3'] },
  regional: { label: 'Regional Prompting', nodes: ['regional', 'kjnodes'], models: ['image'] },
  krea2ref: { label: 'Krea 2 Edit', nodes: ['rebalance'], models: ['image'] },
  krea2outpaint: { label: 'Krea 2 Expand', nodes: ['krea2Edit', 'kjnodes'], models: ['image', 'krea2Outpaint'] },
  editoutpaint: { label: 'Klein / Qwen Expand', nodes: ['kjnodes'] },
  upscale: { label: 'SeedVR2 Upscale', nodes: ['seedvr2'], models: ['upscale'] },
  ultimateupscale: { label: 'Ultimate SD Upscale', nodes: ['ultimate'] },
  video: { label: 'LTX 2.3 Video', nodes: ['vhs'], models: ['ltx'] },
  ltxdirector: { label: 'LTX 2.3 Director', nodes: ['whatdreamscost', 'ltxvideo', 'kjnodes', 'vhs'], models: ['ltx', 'ltxDirector'] },
  ltxcamera: { label: 'LTX Camera Motion (research adapter)', nodes: ['ltxvideo', 'vhs'], models: ['ltxCamera'] },
  videoedit: { label: 'LTX Edit', nodes: ['vhs'], models: ['ltxEdit'] },
  video4k: { label: 'RTX Video Super Resolution', nodes: [] },
  wan: { label: 'Wan 2.2 Video', nodes: ['vhs', 'gguf'], models: ['wan'] },
  eros: { label: '10Eros DMD', nodes: ['eros', 'kjnodes'], models: ['eros', 'ltx'] },
  rife: { label: 'RIFE Frame Interpolation', nodes: ['rife'], models: [] },
  scail: { label: 'SCAIL 2 Motion Transfer', nodes: ['sam3', 'vhs', 'gguf'], models: ['scail', 'wan'] },
  scailinfinity: { label: 'SCAIL 2 Infinity', nodes: ['scailInfinity'], models: ['scail'] },
  faceid: { label: 'LTX Face ID', nodes: ['bfs', 'kjnodes'], models: ['faceid', 'ltx'] },
  image: { label: 'Krea 2 Turbo Image', nodes: [], models: ['image'] },
  krea2raw: { label: 'Krea 2 Raw (optional)', optional: true, nodes: [], models: ['krea2Raw'] },
  krea2depth: { label: 'Krea 2 Depth Guide', nodes: ['krea2Control', 'depthAnything3'], models: ['krea2Depth'] },
  krea2style: { label: 'Krea 2 Style Reference', nodes: ['krea2Style'], models: ['image'] },
  klein4: { label: 'Klein 4B Edit', nodes: ['gguf'], models: ['klein4'] },
  klein9: { label: 'Klein 9B Edit', nodes: ['gguf'], models: ['klein9'] },
  qwen: { label: 'Qwen Image Edit', nodes: ['gguf'], models: ['qwen'] },
});

function cleanRelative(value) {
  const normalized = String(value || '').replace(/[\\/]+/g, path.sep).replace(/^([\\/])+/, '');
  if (!normalized || normalized.split(path.sep).includes('..')) throw new Error('Invalid dependency file path');
  return normalized;
}

function sameRepo(left, right) {
  const normalize = (value) => String(value || '').trim().toLowerCase()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '');
  return normalize(left) === normalize(right);
}

function dependencyCancelledError() {
  const error = new Error('Dependency installation cancelled.');
  error.code = 'dependency_cancelled';
  return error;
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw dependencyCancelledError();
}

function normalizeModelName(value) {
  return normalizeModelPath(value);
}

function modelIsRegistered(filename, availableModelNames) {
  return !!resolveRegisteredModelName(filename, availableModelNames);
}

async function validateModelFile(file, expectedExtension = path.extname(file)) {
  let handle;
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile() || stat.size <= 0) return { valid: false, reason: 'empty', size: stat.size || 0 };
    const extension = String(expectedExtension || '').toLowerCase();
    if (!['.safetensors', '.gguf'].includes(extension)) return { valid: true, size: stat.size };

    handle = await fsp.open(file, 'r');
    if (extension === '.gguf') {
      const magic = Buffer.alloc(4);
      const { bytesRead } = await handle.read(magic, 0, magic.length, 0);
      return bytesRead === 4 && magic.toString('ascii') === 'GGUF'
        ? { valid: true, size: stat.size }
        : { valid: false, reason: 'invalid GGUF header', size: stat.size };
    }

    if (stat.size < 10) return { valid: false, reason: 'truncated safetensors header', size: stat.size };
    const prefix = Buffer.alloc(9);
    const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
    if (bytesRead !== prefix.length) return { valid: false, reason: 'truncated safetensors header', size: stat.size };
    const headerLength = Number(prefix.readBigUInt64LE(0));
    if (!Number.isSafeInteger(headerLength) || headerLength < 2 || headerLength > stat.size - 8 || headerLength > 128 * 1024 * 1024) {
      return { valid: false, reason: 'invalid safetensors header length', size: stat.size };
    }
    if (prefix[8] !== 0x7b) return { valid: false, reason: 'invalid safetensors metadata', size: stat.size };
    return { valid: true, size: stat.size };
  } catch (error) {
    return { valid: false, reason: error.code === 'ENOENT' ? 'missing' : String(error.message || error), size: 0 };
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function ensureDownloadDiskSpace(directory, downloadBytes, options = {}) {
  const requiredDownload = Number(downloadBytes || 0);
  if (!Number.isFinite(requiredDownload) || requiredDownload <= 0) return null;
  const statfs = options.statfs || fsp.statfs;
  let disk;
  try { disk = await statfs(directory); } catch { return null; }
  const available = Number(disk.bavail ?? disk.bfree ?? 0) * Number(disk.bsize ?? 0);
  if (!Number.isFinite(available) || available <= 0) return null;
  const reserve = Math.max(512 * 1024 * 1024, Math.ceil(requiredDownload * 0.05));
  const required = requiredDownload + reserve;
  if (available < required) {
    const error = new Error(
      `Not enough free disk space for this model. The download needs ${Math.ceil(requiredDownload / (1024 ** 3) * 10) / 10} GB plus temporary working space, but only ${Math.floor(available / (1024 ** 3) * 10) / 10} GB is available.`
    );
    error.code = 'dependency_disk_space';
    error.requiredBytes = required;
    error.availableBytes = available;
    throw error;
  }
  return { availableBytes: available, requiredBytes: required };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      throwIfCancelled(options.signal);
      execFile(command, args, {
        cwd: options.cwd,
        windowsHide: true,
        timeout: options.timeout || 45 * 60 * 1000,
        maxBuffer: 8 * 1024 * 1024,
        env: Object.assign({}, process.env, options.env || {}),
        signal: options.signal,
      }, (error, stdout, stderr) => {
        if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          return reject(dependencyCancelledError());
        }
        if (!error) return resolve([stdout, stderr].filter(Boolean).join('\n').trim());
        const wrapped = new Error(([stdout, stderr].filter(Boolean).join('\n') || error.message).slice(-2800));
        wrapped.code = error.killed ? 'dependency_timeout' : 'dependency_install_failed';
        reject(wrapped);
      });
    } catch (error) {
      reject(options.signal?.aborted ? dependencyCancelledError() : error);
    }
  });
}

const PROTECTED_RUNTIME_REQUIREMENTS = new Set([
  'numpy', 'opencv-python', 'opencv-python-headless', 'opencv-contrib-python',
  'torch', 'torchvision', 'torchaudio',
]);

function requirementPackageName(line) {
  const value = String(line || '').split('#')[0].trim();
  if (!value || value.startsWith('-')) return '';
  const match = value.match(/^([a-zA-Z0-9_.-]+)/);
  return match ? match[1].toLowerCase().replace(/[_.]+/g, '-') : '';
}

function filterProtectedRuntimeRequirements(source) {
  return String(source || '').split(/\r?\n/)
    .filter((line) => !PROTECTED_RUNTIME_REQUIREMENTS.has(requirementPackageName(line)))
    .join('\n');
}

function protectedRuntimeConstraints(source) {
  return String(source || '').split(/\r?\n/)
    .filter((line) => PROTECTED_RUNTIME_REQUIREMENTS.has(requirementPackageName(line)))
    .join('\n');
}

async function safeRepairRequirementsFile(requirements) {
  const source = await fsp.readFile(requirements, 'utf8');
  const filtered = filterProtectedRuntimeRequirements(source);
  if (filtered === source) return { path: requirements, temporary: false };
  const safePath = `${requirements}.mixbox-safe`;
  await fsp.writeFile(safePath, filtered, 'utf8');
  return { path: safePath, temporary: true };
}

function requirementsArgs(requirements, repair = false, options = {}) {
  // Never use pip's blanket --upgrade here. ComfyUI custom nodes share one
  // Python environment, so an unrelated node installer can otherwise replace
  // Video Helper Suite / SeedVR2 dependencies. Normal installs are additive;
  // repair only reinstalls the packages named by the affected node pack.
  const args = ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed'];
  if (repair) args.push('--force-reinstall', '--no-deps');
  if (!repair && options.constraintFile) args.push('--constraint', options.constraintFile);
  args.push('-r', requirements);
  return args;
}

async function snapshotPythonEnvironment(status, runtime, report, options = {}) {
  const runCommand = options.run || run;
  const backupRoot = options.backupDir || runtime.dataDir || path.join(status.basePath, 'mixbox-backups');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destination = path.join(backupRoot, 'dependency-backups', `python-${stamp}.freeze.txt`);
  try {
    report('snapshotting-environment', 'Saving the current ComfyUI Python package list');
    const freeze = await runCommand(status.pythonPath, ['-m', 'pip', 'freeze'], { cwd: status.basePath, signal: options.signal });
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, `${freeze}\n`, 'utf8');
    report('environment-snapshot', 'Saved a ComfyUI package snapshot before installation', { environmentSnapshot: destination });
    return destination;
  } catch (error) {
    if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw dependencyCancelledError();
    // A package snapshot is a safety net, not a reason to block a legitimate
    // model download when the Comfy Python executable does not support freeze.
    report('snapshot-warning', 'Could not save a Python package snapshot; continuing with the safer installer.', { snapshotWarning: String(error.message || error) });
    return '';
  }
}

async function createRuntimeConstraintFile(environmentSnapshot) {
  if (!environmentSnapshot) return '';
  const source = await fsp.readFile(environmentSnapshot, 'utf8');
  const constraints = protectedRuntimeConstraints(source).trim();
  if (!constraints) return '';
  const destination = environmentSnapshot.replace(/\.freeze\.txt$/i, '.runtime-constraints.txt');
  await fsp.writeFile(destination, `${constraints}\n`, 'utf8');
  return destination;
}

function looksLikeCustomNodeFolder(nodePath) {
  try {
    if (!fs.statSync(nodePath).isDirectory()) return false;
    for (const marker of ['__init__.py', 'pyproject.toml', 'requirements.txt', 'install.py']) {
      if (fs.existsSync(path.join(nodePath, marker))) return true;
    }
    return fs.readdirSync(nodePath, { withFileTypes: true })
      .some((entry) => entry.isFile() && /\.py$/i.test(entry.name));
  } catch {
    return false;
  }
}

function nodePackHasSignatures(pack, nodePath) {
  const signatures = Array.isArray(pack?.nodeSignatures) ? pack.nodeSignatures : [];
  if (!signatures.length) return false;
  try {
    return signatures.every((signature) => {
      const source = fs.readFileSync(path.join(nodePath, signature.file), 'utf8');
      return (signature.values || []).every((value) => source.includes(value));
    });
  } catch {
    return false;
  }
}

async function patchLtxVideoKornia(nodePath) {
  const file = path.join(nodePath, 'pyramid_blending.py');
  let source;
  try { source = await fsp.readFile(file, 'utf8'); } catch { return false; }
  if (!source.includes('from kornia.geometry.transform.pyramid import (') || !/^[ \t]*pad,\r?$/m.test(source)) return false;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const patched = source
    .replace(/^import torch\r?$/m, (line) => `${line}${newline}from torch.nn.functional import pad`)
    .replace(/^[ \t]*pad,\r?\n/m, '');
  if (patched === source) return false;
  await fsp.writeFile(file, patched, 'utf8');
  return true;
}

function uvCandidates(pythonPath) {
  const pythonDir = pythonPath ? path.dirname(pythonPath) : '';
  return [path.join(pythonDir, 'uv.exe'), path.join(pythonDir, 'uv')];
}

async function ensureUv(status, report, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const found = uvCandidates(status.pythonPath).find((candidate) => existsSync(candidate));
  if (found) return found;
  report('installing-uv', 'Installing uv into the ComfyUI Python environment for isolated custom-node setup');
  try {
    await (options.run || run)(status.pythonPath, [
      '-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', 'uv',
    ], { cwd: status.basePath, signal: options.signal });
  } catch (error) {
    const wrapped = new Error(
      `Custom-node setup needs uv beside the ComfyUI Python executable (${status.pythonPath}). `
      + `Mix Studio could not install it automatically: ${String(error.message || error)}`
    );
    wrapped.code = 'dependency_uv_missing';
    throw wrapped;
  }
  return uvCandidates(status.pythonPath)[0];
}

function unavailableNodePackError(pack, nodePath) {
  const error = new Error(
    `${pack.label} cannot be installed automatically because ${pack.unavailableReason || 'its reviewed source is unavailable'}. `
    + `Mix Studio will not substitute an unreviewed custom node. Install a trusted compatible copy in ${nodePath}, then try again; `
    + 'an existing valid installation will be reused.'
  );
  error.code = 'dependency_node_source_unavailable';
  error.failedNode = pack.folder;
  return error;
}

function assertNodePackSourceAvailable(pack, status) {
  if (pack.automaticInstall !== false) return;
  const nodePath = path.join(status.customNodesPath, pack.folder);
  if (!looksLikeCustomNodeFolder(nodePath)) throw unavailableNodePackError(pack, nodePath);
}

async function installNodePack(pack, status, report, options = {}) {
  const runCommand = options.run || run;
  const existsSync = options.existsSync || fs.existsSync;
  const gitExecutable = String(options.gitExecutable || process.env.MIX_STUDIO_GIT || 'git').trim() || 'git';
  const preferredNodePath = path.join(status.customNodesPath, pack.folder);
  const compatibleNodePaths = (pack.compatibleFolders || [])
    .map((folder) => path.join(status.customNodesPath, folder));
  const nodePath = [preferredNodePath, ...compatibleNodePaths]
    .find((candidate) => existsSync(candidate)) || preferredNodePath;
  const gitDir = path.join(nodePath, '.git');
  throwIfCancelled(options.signal);
  assertNodePackSourceAvailable(pack, status);
  await fsp.mkdir(status.customNodesPath, { recursive: true });
  const nodeExists = existsSync(nodePath);
  const gitManaged = existsSync(gitDir);
  if (nodeExists && !gitManaged) {
    if (!looksLikeCustomNodeFolder(nodePath)) {
      throw new Error(`${pack.label} already exists but does not look like a valid custom-node installation. Move or rename that folder, then try again.`);
    }
    report('existing-node', `Using the existing ${pack.label} installation without changing its source`, { unmanaged: true });
  } else if (gitManaged) {
    const origin = await runCommand(gitExecutable, ['-C', nodePath, 'remote', 'get-url', 'origin'], { cwd: nodePath, signal: options.signal });
    const compatibleMirror = !sameRepo(origin, pack.repo)
      && pack.allowCompatibleMirror === true
      && nodePackHasSignatures(pack, nodePath);
    if (!sameRepo(origin, pack.repo) && !compatibleMirror) {
      throw new Error(`${pack.label} exists but points to a different repository and does not expose the required node classes.`);
    }
    if (compatibleMirror) {
      report('existing-node', `Using the compatible ${pack.label} mirror already installed`, {
        compatibleMirror: true,
        origin: String(origin || '').trim(),
      });
    } else if (pack.automaticInstall === false) {
      report('existing-node', `Using the existing ${pack.label} installation; its reviewed source is unavailable`, {
        sourceUnavailable: true,
      });
    } else if (pack.ref) {
      const currentRef = String(await runCommand(gitExecutable, ['-C', nodePath, 'rev-parse', 'HEAD'], { cwd: nodePath, signal: options.signal })).trim();
      if (currentRef === pack.ref) {
        report('existing-node', `Using the reviewed ${pack.label} checkout`, { pinnedRef: pack.ref });
      } else {
        report('pinning-node', `Selecting the reviewed ${pack.label} version`, { pinnedRef: pack.ref, previousRef: currentRef });
        await runCommand(gitExecutable, ['-C', nodePath, 'fetch', '--depth', '1', 'origin', pack.ref], { cwd: nodePath, signal: options.signal });
        await runCommand(gitExecutable, ['-C', nodePath, 'checkout', '--detach', pack.ref], { cwd: nodePath, signal: options.signal });
      }
    } else {
      report('updating-node', `Updating ${pack.label}`);
      await runCommand(gitExecutable, ['-C', nodePath, 'pull', '--ff-only'], { cwd: nodePath, signal: options.signal });
    }
  } else {
    report('installing-node', `Installing ${pack.label}`);
    const cloneArgs = pack.ref ? ['clone', pack.repo, nodePath] : ['clone', '--depth', '1', pack.repo, nodePath];
    await runCommand(gitExecutable, cloneArgs, { cwd: status.customNodesPath, signal: options.signal });
    if (pack.ref) {
      await runCommand(gitExecutable, ['-C', nodePath, 'checkout', '--detach', pack.ref], { cwd: nodePath, signal: options.signal });
    }
  }
  if (pack.compatibilityPatch === 'kornia-pad' && await patchLtxVideoKornia(nodePath)) {
    report('compatibility-patch', `Updated ${pack.label} for kornia 0.8.3 and newer`);
  }
  const requirements = path.join(nodePath, 'requirements.txt');
  if (existsSync(requirements)) {
    const repair = !!options.repair;
    const safeRequirements = repair ? await safeRepairRequirementsFile(requirements) : { path: requirements, temporary: false };
    report('requirements', repair
      ? `Repairing ${pack.label} requirements without changing unrelated packages`
      : `Installing ${pack.label} requirements without upgrading unrelated packages`);
    try {
      await runCommand(status.pythonPath, requirementsArgs(safeRequirements.path, repair, {
        constraintFile: options.constraintFile,
      }), { cwd: nodePath, signal: options.signal });
    } finally {
      if (safeRequirements.temporary) await fsp.rm(safeRequirements.path, { force: true }).catch(() => {});
    }
  }
  const installScript = path.join(nodePath, 'install.py');
  if (existsSync(installScript)) {
    report('requirements', `Finishing ${pack.label}`);
    await runCommand(status.pythonPath, [installScript], { cwd: nodePath, signal: options.signal });
  }
}

async function downloadAsset(asset, modelsPath, settings, report, options = {}) {
  const [settingKey, folder, url, defaultFilename, fallbackUrls] = asset;
  const sources = [...new Set([url, ...(Array.isArray(fallbackUrls) ? fallbackUrls : [])].filter(Boolean))];
  const primarySourceName = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  let sourceName = primarySourceName;
  const filename = cleanRelative(settings[settingKey] || defaultFilename || sourceName);
  const destination = path.join(modelsPath, folder, filename);
  throwIfCancelled(options.signal);
  if (modelIsRegistered(filename, options.availableModelNames)) {
    report('already-present', `${filename} is already available through ComfyUI`, { settingKey, filename, registered: true });
    return { skipped: true, destination, registered: true };
  }
  for (const root of [...new Set(Array.isArray(options.availableModelRoots) ? options.availableModelRoots : [])]) {
    const existing = path.join(String(root || ''), folder, filename);
    if (root && fs.existsSync(existing)) {
      const validation = await validateModelFile(existing, path.extname(filename));
      if (validation.valid) {
        report('already-present', `${filename} is already available in a configured model root`, { settingKey, filename, existing });
        return { skipped: true, destination: existing, externalRoot: true };
      }
      report('invalid-existing-model', `${filename} exists in a configured model root but is incomplete or invalid`, {
        settingKey, filename, existing, validationReason: validation.reason,
      });
    }
  }
  if (fs.existsSync(destination)) {
    const validation = await validateModelFile(destination, path.extname(filename));
    if (validation.valid) {
      report('already-present', `${filename} is already available`);
      return { skipped: true, destination };
    }
    const error = new Error(`${filename} already exists but is incomplete or is not a valid ${path.extname(filename).slice(1).toUpperCase()} model. Remove or replace that file, then try again.`);
    error.code = 'dependency_model_invalid_existing';
    error.settingKey = settingKey;
    error.failedModel = filename;
    error.validationReason = validation.reason;
    throw error;
  }
  const sourceExtension = path.extname(sourceName).toLowerCase();
  const configuredExtension = path.extname(filename).toLowerCase();
  if (sourceExtension && configuredExtension && sourceExtension !== configuredExtension) {
    const error = new Error(
      `${filename} is a manually configured ${configuredExtension.slice(1).toUpperCase()} model and was not found. `
      + 'Install that exact model file first, then run Check again; Mix Studio will not rename a different model format into its place.'
    );
    error.code = 'dependency_custom_model_missing';
    error.settingKey = settingKey;
    error.failedModel = filename;
    throw error;
  }
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.mixbox.part`;
  await fsp.rm(partial, { force: true }).catch(() => {});
  report('downloading-model', `Downloading ${filename}`, { settingKey, filename, downloaded: 0, downloadTotal: 0 });
  const hfToken = String(options.hfToken || process.env.HF_TOKEN || '').trim();
  let response = null;
  let selectedUrl = url;
  const failures = [];
  for (let index = 0; index < sources.length; index += 1) {
    selectedUrl = sources[index];
    try {
      const sourceHost = new URL(selectedUrl).hostname.toLowerCase();
      const headers = hfToken && sourceHost === 'huggingface.co'
        ? { Authorization: `Bearer ${hfToken}` }
        : {};
      response = await (options.fetch || fetch)(selectedUrl, { headers, redirect: 'follow', signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw dependencyCancelledError();
      failures.push({ url: selectedUrl, status: 0, detail: String(error.message || error) });
      response = null;
    }
    if (response?.ok && response.body) break;
    if (response) failures.push({
      url: selectedUrl,
      status: response.status,
      detail: await response.text().catch(() => ''),
    });
    response = null;
    if (index < sources.length - 1) {
      report('download-fallback', `The primary source for ${filename} was unavailable; trying a reviewed mirror`, {
        settingKey, filename, sourceIndex: index + 1,
      });
    }
  }
  if (!response || !response.ok || !response.body) {
    const failure = failures[failures.length - 1] || { url: selectedUrl, status: 0, detail: '' };
    const accessFailure = [...failures].reverse().find((entry) => entry.status === 401 || entry.status === 403);
    const accessUrl = huggingFaceAccessUrl(accessFailure?.url || '');
    const accessRequired = !!accessUrl;
    const error = new Error(accessRequired
      ? `Hugging Face access is required for ${filename}. Accept the model license, then paste a read token into Settings → General → Hugging Face token and retry.`
      : `Could not download ${filename}${failure.status ? ` (${failure.status})` : ''}. ${failure.detail.slice(0, 240) || 'All reviewed sources were unavailable; check the connection and try again.'}`);
    error.code = accessRequired ? 'dependency_model_access_required' : 'dependency_download_failed';
    error.statusCode = accessFailure?.status || failure.status || null;
    error.settingKey = settingKey;
    error.failedModel = filename;
    if (accessRequired) error.accessUrl = accessUrl;
    throw error;
  }
  sourceName = decodeURIComponent(new URL(selectedUrl).pathname.split('/').pop() || primarySourceName);
  const total = Number(response.headers.get('content-length') || 0);
  try {
    await ensureDownloadDiskSpace(path.dirname(destination), total, options);
    const handle = await fsp.open(partial, 'w');
    let downloaded = 0;
    try {
      const reader = response.body.getReader();
      for (;;) {
        throwIfCancelled(options.signal);
        const { done, value } = await reader.read();
        if (done) break;
        await handle.write(value);
        downloaded += value.byteLength;
        report('downloading-model', `Downloading ${filename}`, { settingKey, filename, downloaded, downloadTotal: total });
      }
    } finally {
      await handle.close();
    }
    throwIfCancelled(options.signal);
    if (total > 0 && downloaded !== total) {
      const error = new Error(`The ${filename} download ended early (${downloaded} of ${total} bytes). Try again; the incomplete file was removed.`);
      error.code = 'dependency_download_incomplete';
      error.settingKey = settingKey;
      error.failedModel = filename;
      throw error;
    }
    const validation = await validateModelFile(partial, configuredExtension || sourceExtension);
    if (!validation.valid) {
      const error = new Error(`The downloaded ${filename} file is incomplete or has an invalid model header. Try the download again.`);
      error.code = 'dependency_model_invalid';
      error.settingKey = settingKey;
      error.failedModel = filename;
      error.validationReason = validation.reason;
      throw error;
    }
    await fsp.rename(partial, destination);
    report('downloaded-model', `Downloaded ${filename}`, { settingKey, filename, downloaded, downloadTotal: total });
    return { skipped: false, destination };
  } catch (error) {
    await fsp.rm(partial, { force: true }).catch(() => {});
    if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw dependencyCancelledError();
    throw error;
  }
}

function availableComponents() { return Object.keys(COMPONENTS); }

async function installComponents({ runtime, settings, components, report = () => {}, options = {} }) {
  throwIfCancelled(options.signal);
  const status = sam3InstallStatus(runtime, options);
  if (!status.canInstall) {
    const error = new Error(status.reason || 'Mix Studio could not find a writable ComfyUI installation and its Python environment.');
    error.code = 'dependency_path_missing';
    throw error;
  }
  const selected = [...new Set((components || []).filter((key) => COMPONENTS[key]))];
  if (!selected.length) throw new Error('No installable dependency groups were selected.');
  const modelsPath = runtime.comfy.modelsPath || path.join(status.basePath, 'models');
  const modelGroups = [...new Set(selected.flatMap((key) => COMPONENTS[key].models || []))];
  const modelPlan = dependencyModelPlan(modelGroups, settings, options);
  const nodeIds = [...new Set(selected.flatMap((key) => COMPONENTS[key].nodes || []))];
  // Check every source before snapshots, Python changes, clones, or model
  // downloads. A removed/private upstream should not leave a partial setup.
  for (const id of nodeIds) assertNodePackSourceAvailable(NODE_PACKS[id], status);
  const { assets, effectiveSettings } = modelPlan;
  const total = nodeIds.length + assets.length;
  let completed = 0;
  report('starting', `Preparing ${selected.length} dependency group${selected.length === 1 ? '' : 's'}`, { completed, total });
  const environmentSnapshot = nodeIds.length
    ? await snapshotPythonEnvironment(status, runtime, (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})), options)
    : '';
  const runtimeConstraintFile = await createRuntimeConstraintFile(environmentSnapshot);
  if (nodeIds.length) {
    await ensureUv(status, (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})), options);
  }
  for (const id of nodeIds) {
    throwIfCancelled(options.signal);
    const pack = NODE_PACKS[id];
    await installNodePack(pack, status, (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: id }, detail || {})), Object.assign({}, options, {
      constraintFile: runtimeConstraintFile,
      gitExecutable: options.gitExecutable || runtime?.update?.gitExecutable,
    }));
    completed += 1;
    report('node-ready', `${pack.label} is ready`, { completed, total, component: id });
  }
  for (const asset of assets) {
    throwIfCancelled(options.signal);
    await downloadAsset(asset, modelsPath, effectiveSettings, (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: asset[0] }, detail || {})), options);
    completed += 1;
    report('model-ready', `${asset[0]} is ready`, { completed, total, component: asset[0] });
  }
  if (nodeIds.length) {
    try {
      report('checking-environment', 'Checking the ComfyUI Python environment for dependency conflicts', { completed, total });
      await (options.run || run)(status.pythonPath, ['-m', 'pip', 'check'], { cwd: status.basePath, signal: options.signal });
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw dependencyCancelledError();
      report('environment-warning', 'The node packs were installed, but pip found an existing dependency conflict. Use Repair missing tools, then restart ComfyUI.', {
        completed, total, environmentWarning: String(error.message || error),
      });
    }
  }
  throwIfCancelled(options.signal);
  report('restart-needed', 'Dependencies are installed. Restart ComfyUI, then run Check again.', { completed, total });
  return {
    restartRequired: true,
    completed,
    total,
    components: selected,
    environmentSnapshot,
    modelVariants: { krea2: modelPlan.krea2Variant },
    settingUpdates: modelPlan.settingUpdates,
  };
}

module.exports = {
  COMPONENTS,
  MODEL_ASSETS,
  NODE_PACKS,
  availableComponents,
  cleanRelative,
  dependencyCancelledError,
  dependencyModelPlan,
  downloadAsset,
  ensureDownloadDiskSpace,
  filterProtectedRuntimeRequirements,
  huggingFaceAccessUrl,
  ensureUv,
  nodePackHasSignatures,
  patchLtxVideoKornia,
  protectedRuntimeConstraints,
  installNodePack,
  installComponents,
  looksLikeCustomNodeFolder,
  modelIsRegistered,
  normalizeModelName,
  requirementsArgs,
  sameRepo,
  snapshotPythonEnvironment,
  validateModelFile,
};
