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
const { installSageAttention } = require('./sage-attention');
const {
  normalizeModelPath,
  resolveRegisteredModelName,
  resolveRegisteredModelSetting,
} = require('./model-loader');
const {
  acceleratedHuggingFaceDownload,
  parseHuggingFaceResolveUrl,
} = require('./huggingface-download');
const {
  KREA2_VARIANTS,
  krea2VariantSettings,
  normalizeKrea2Variant,
} = require('./krea2-model');
const { h3FrameVariant, h3ReferenceVariant } = require('./h3-model-variants');
const { H3_TURBO_LORAS, turboBasename } = require('./h3-turbo-presets');
const { applyDynTimePatch } = require('./h3-dyntime-patch');

const hf = (repo, file) => `https://huggingface.co/${repo}/resolve/main/${file}`;
const H3_TURBO_V4_FILENAME = H3_TURBO_LORAS.framesRecommended;
const H3_TURBO_LEGACY_FILENAME = H3_TURBO_LORAS.legacyFrames;
const H3_TURBO_LIGHTX8_FILENAME = H3_TURBO_LORAS.lightx8;
const H3_TURBO_LIGHTX8_REVISION = '050494d5fe05bd1b1140b8565ea51dc33a5085a5';
const h3TurboLightx8Url = () => `https://huggingface.co/lightx2v/Minimax-h3-Turbo/resolve/${H3_TURBO_LIGHTX8_REVISION}/${H3_TURBO_LIGHTX8_FILENAME}`;

function normalizeHuggingFaceEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const endpoint = new URL(raw);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return '';
    endpoint.search = '';
    endpoint.hash = '';
    endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');
    return endpoint.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function huggingFaceEndpointUrl(value, endpointValue) {
  const source = parseHuggingFaceResolveUrl(value);
  const endpoint = normalizeHuggingFaceEndpoint(endpointValue);
  if (!source || !endpoint || endpoint === 'https://huggingface.co') return value;
  const target = new URL(value);
  const base = new URL(endpoint);
  target.protocol = base.protocol;
  target.host = base.host;
  target.pathname = `${base.pathname.replace(/\/+$/, '')}${target.pathname}`;
  return target.toString();
}

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
  rtx: { label: 'NVIDIA RTX Nodes', folder: 'Nvidia_RTX_Nodes_ComfyUI', repo: 'https://github.com/Comfy-Org/Nvidia_RTX_Nodes_ComfyUI.git', ref: '892515e3eb9a4920a131a502a047e47adca9eb0d' },
  vhs: { label: 'Video Helper Suite', folder: 'ComfyUI-VideoHelperSuite', repo: 'https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git', ref: '4ee72c065db22c9d96c2427954dc69e7b908444b' },
  ltxvideo: { label: 'LTXVideo', folder: 'ComfyUI-LTXVideo', repo: 'https://github.com/Lightricks/ComfyUI-LTXVideo.git', ref: 'aceeae9635f6d493f2893ba3c411a1c36031788a', compatibilityPatch: 'kornia-pad' },
  rife: { label: 'Frame Interpolation', folder: 'ComfyUI-Frame-Interpolation', repo: 'https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git', ref: '26545cc2dd95bc3d27f056016300673bdeee78f5' },
  eros: { label: '10S Comfy Nodes', folder: '10S-Comfy-nodes', repo: 'https://github.com/TenStrip/10S-Comfy-nodes.git', ref: '257400c45394efb2fa53a0a8fe3b3e8ac7392548' },
  bfs: {
    label: 'BFS Nodes', folder: 'ComfyUI-BFSNodes', repo: 'https://github.com/alisson-anjos/ComfyUI-BFSNodes.git',
    ref: '7112d6e640941e5f9c6f0402efd592f8bf340a06', compatibilityPatch: 'bfs-optional-audio',
    omitRequirementsByPlatform: { darwin: ['librosa'] },
  },
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
  krea2Edit: {
    label: 'Krea 2 Identity Edit',
    folder: 'comfyui-krea2edit',
    repo: 'https://github.com/lbouaraba/comfyui-krea2edit.git',
    ref: '7e68e90983b25e64dd02ac5d0c10593ea72a4cde',
    enforceRevision: true,
  },
  h3Turbo: {
    label: 'MiniMax H3 Turbo',
    folder: 'ComfyUI-MiniMax-H3-Turbo',
    repo: 'https://github.com/Larryvrh/ComfyUI-MiniMax-H3-Turbo.git',
    ref: '77bfa67575b14e3be6214f1747732e540c68b5dd',
    enforceRevision: true,
  },
  h3MotionContext: {
    label: 'MiniMax H3 Motion Context',
    folder: 'ComfyUI-H3-Motion-Context',
    repo: 'https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git',
    ref: 'c140ae99b8c38f782ebd8564c267b42aacade6a4',
    enforceRevision: true,
  },
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
    ['krea2OutpaintLora', 'loras', hf('conradlocke/krea2-identity-edit', 'krea2_identity_edit_v1_2.safetensors')],
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
    ['qwenEditAnglesLora', 'loras', hf('fal/Qwen-Image-Edit-2511-Multiple-Angles-LoRA', 'qwen-image-edit-2511-multiple-angles-lora.safetensors'), 'qwen_image_edit_2511_multiple-angles-lora.safetensors'],
  ],
  upscale: [
    ['seedvr2Dit', 'SEEDVR2', hf('AInVFX/SeedVR2_comfyUI', 'seedvr2_ema_7b_fp8_e4m3fn_mixed_block35_fp16.safetensors')],
    ['seedvr2Vae', 'SEEDVR2', hf('numz/SeedVR2_comfyUI', 'ema_vae_fp16.safetensors')],
  ],
  ltx: [
    ['ltxCkpt', 'checkpoints', hf('Lightricks/LTX-2.3-fp8', 'ltx-2.3-22b-dev-fp8.safetensors')],
    ['ltxDistilledLora', 'loras', hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-distilled-lora-384.safetensors')],
    ['ltxTextEncoder', 'text_encoders', hf('Comfy-Org/ltx-2', 'split_files/text_encoders/gemma_3_12B_it_fp4_mixed.safetensors')],
    ['ltxGemmaLora', 'loras', hf('Comfy-Org/ltx-2', 'split_files/loras/gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors'), undefined, [hf('Lightricks/LTX-2.3', 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors')]],
    ['ltxUpscaler', 'latent_upscale_models', hf('Lightricks/LTX-2.3', 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors')],
  ],
  ltx25: [
    ['ltx25Unet', 'diffusion_models', hf('Lightricks/LTX-2.5', 'diffusion_models/ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors')],
    ['ltx25TextEncoder', 'text_encoders', hf('Lightricks/LTX-2.5', 'text_encoders/gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors')],
    ['ltx25PromptEnhancer', 'text_encoders', hf('Comfy-Org/gemma-4', 'text_encoders/gemma4_e2b_it_bf16.safetensors')],
    ['ltx25VideoVae', 'vae', hf('Lightricks/LTX-2.5', 'vae/ltx-2.5-video-vae-bf16.safetensors')],
    ['ltx25AudioVae', 'vae', hf('Lightricks/LTX-2.5', 'vae/ltx-2.5-audio-vae-bf16.safetensors')],
    ['ltx25Upscaler', 'latent_upscale_models', hf('Lightricks/LTX-2.5', 'latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors')],
  ],
  ltx25Quality: [
    ['ltx25QualityUnet', 'diffusion_models', hf('Lightricks/LTX-2.5', 'diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors')],
    ['ltx25QualityTextEncoder', 'text_encoders', hf('Lightricks/LTX-2.5', 'text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors')],
    ['ltx25DistilledLora', 'loras', hf('Lightricks/LTX-2.5', 'loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors')],
  ],
  h3: [
    ['h3Unet', 'diffusion_models', hf('Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors')],
    ['h3Clip', 'text_encoders', hf('Comfy-Org/MiniMax-H3', 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')],
    ['h3VideoVae', 'vae', hf('Comfy-Org/MiniMax-H3', 'vae/minimax_h3_video_vae_fp16.safetensors')],
    ['h3AudioVae', 'vae', hf('Comfy-Org/MiniMax-H3', 'vae/minimax_h3_audio_vae_fp32.safetensors')],
  ],
  h3RefCommon: [
    ['h3Clip', 'text_encoders', hf('Comfy-Org/MiniMax-H3', 'text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors')],
    ['h3VideoVae', 'vae', hf('Comfy-Org/MiniMax-H3', 'vae/minimax_h3_video_vae_fp16.safetensors')],
    ['h3AudioVae', 'vae', hf('Comfy-Org/MiniMax-H3', 'vae/minimax_h3_audio_vae_fp32.safetensors')],
  ],
  h3Ref: [
    ['h3RefUnet', 'diffusion_models', hf('Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors')],
  ],
  h3Bf16: [
    ['h3Bf16Unet', 'diffusion_models', hf('Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_fl2va_bf16.safetensors')],
  ],
  h3RefBf16: [
    ['h3Bf16RefUnet', 'diffusion_models', hf('Comfy-Org/MiniMax-H3', 'diffusion_models/minimax_h3_ref2va_bf16.safetensors')],
  ],
  h3DynTimeRef: [
    ['h3DynTimeRefUnet', 'diffusion_models', 'https://huggingface.co/DmitryDB/MiniMax-H3-DynTime-sQKV/resolve/b660b69c97cb0b5661a54cb50066ad11eacc6099/Ref2VA/MiniMax-H3_Ref2VA-DT-sQKV-INT8-ConvRot.safetensors'],
  ],
  h3DynTimeRefHq: [
    ['h3DynTimeRefHqUnet', 'diffusion_models', 'https://huggingface.co/DmitryDB/MiniMax-H3-DynTime-sQKV/resolve/b660b69c97cb0b5661a54cb50066ad11eacc6099/Ref2VA/MiniMax-H3_Ref2VA-DT-sQKV-INT8-ConvRot-HQ.safetensors'],
  ],
  h3Turbo: [
    ['h3TurboLora', 'loras', hf('larryvrh/MiniMax-H3-Turbo-Lora', H3_TURBO_V4_FILENAME)],
  ],
  h3TurboLegacy: [
    ['h3TurboLora', 'loras', hf('larryvrh/MiniMax-H3-Turbo-Lora', H3_TURBO_LEGACY_FILENAME)],
  ],
  h3TurboLightx8: [
    ['h3TurboLora', 'loras', h3TurboLightx8Url()],
  ],
  h3RefTurbo: [
    ['h3RefTurboLora', 'loras', hf('Kijai/MiniMax-H3_comfy', 'loras/minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors')],
  ],
  h3RefTurboLightx8: [
    ['h3RefTurboLora', 'loras', h3TurboLightx8Url()],
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
    ['ltxFaceIdLora', 'loras', hf('Alissonerdx/LTX-Best-Face-ID', 'Best_FaceID_v1.0_LoRA.safetensors')],
    ['ltxFaceIdDistilledLora', 'loras', hf('Comfy-Org/ltx-2.3', 'split_files/loras/ltx_2.3_22b_distilled_1.1_lora_dynamic_fro09_avg_rank_111_bf16.safetensors')],
  ],
  wan: [
    ['wanHighUnet', 'diffusion_models', hf('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors')],
    ['wanLowUnet', 'diffusion_models', hf('Comfy-Org/Wan_2.2_ComfyUI_Repackaged', 'split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors')],
    ['wanClip', 'text_encoders', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')],
    ['wanVae', 'vae', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/vae/wan_2.1_vae.safetensors')],
    ['wanHighLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors')],
    ['wanLowLora', 'loras', hf('lightx2v/Wan2.2-Lightning', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors')],
  ],
  wanAnimate2: [
    ['wanAnimate2Unet', 'diffusion_models', hf('Comfy-Org/Wan-Animate-2', 'diffusion_models/wan_animate_2_int8_convrot.safetensors')],
    ['wanAnimate2Lora', 'loras', hf('Comfy-Org/Wan-Animate-2', 'loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors')],
    ['wanAnimate2Clip', 'text_encoders', hf('Comfy-Org/Wan-Animate-2', 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors')],
    ['wanAnimate2ClipVision', 'clip_vision', hf('Comfy-Org/Wan-Animate-2', 'clip_vision/clip_vision_h.safetensors')],
    ['wanAnimate2Vae', 'vae', hf('Comfy-Org/Wan-Animate-2', 'vae/Wan2_1_VAE_bf16.safetensors')],
  ],
  eros: [
    ['erosCkpt', 'checkpoints', hf('Tridae/ErosDeployment_ComfyUI', 'checkpoints/10Eros_v1.2_fp8mixed_learned.safetensors')],
    ['erosTextEncoder', 'text_encoders', hf('Tridae/ErosDeployment_ComfyUI', 'text_encoders/gemma_3_12B_it_heretic_fp8_e4m3fn.safetensors')],
    ['erosDmdLora', 'loras', hf('Tridae/ErosDeployment_ComfyUI', 'loras/LTX2.3_DMD_reshaped_r256.safetensors')],
  ],
  scail: [
    ['scailUnet', 'diffusion_models', hf('Comfy-Org/SCAIL-2', 'diffusion_models/wan2.1_14B_SCAIL_2_fp8_scaled.safetensors')],
    [
      'scailLora',
      'loras',
      hf('lightx2v/Wan2.1-I2V-14B-480P-StepDistill-CfgDistill-Lightx2v', 'loras/Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors'),
      undefined,
      [hf('lightx2v/Wan2.1-I2V-14B-720P-StepDistill-CfgDistill-Lightx2v', 'loras/Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors')],
    ],
    ['scailPusaLora', 'loras', hf('Kijai/WanVideo_comfy', 'Pusa/Wan21_PusaV1_LoRA_14B_rank512_bf16.safetensors')],
    ['scailClipVision', 'clip_vision', hf('Comfy-Org/Wan_2.1_ComfyUI_repackaged', 'split_files/clip_vision/clip_vision_h.safetensors')],
    ['scailSam', 'checkpoints', hf('Comfy-Org/sam3.1', 'checkpoints/sam3.1_multiplex_fp16.safetensors')],
  ],
});

const KLEIN4_LEGACY_BF16_ASSET = Object.freeze([
  'klein4Unet',
  'diffusion_models',
  hf('black-forest-labs/FLUX.2-klein-4B', 'flux-2-klein-4b.safetensors'),
]);

const LTX_APPLE_BF16_ASSET = Object.freeze([
  'ltxCkpt',
  'checkpoints',
  hf('Lightricks/LTX-2.3', 'ltx-2.3-22b-dev.safetensors'),
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
  const appleLtx = String(options.gpuVendor || '').toLowerCase() === 'apple' && groups.includes('ltx');
  const configuredLtx = normalizeModelName(settings.ltxCkpt);
  if (appleLtx && (!configuredLtx || configuredLtx === 'ltx-2.3-22b-dev-fp8.safetensors')) {
    settingUpdates.ltxCkpt = 'ltx-2.3-22b-dev.safetensors';
  }
  let effectiveSettings = Object.assign({}, settings, settingUpdates);
  const variantAssets = new Map((KREA2_VARIANT_ASSETS[krea2Variant] || []).map((asset) => [asset[0], asset]));
  const frameVariant = h3FrameVariant(effectiveSettings);
  const referenceVariant = h3ReferenceVariant(effectiveSettings);
  const h3FrameAsset = frameVariant.id === 'bf16' ? MODEL_ASSETS.h3Bf16[0] : MODEL_ASSETS.h3[0];
  const h3ReferenceAsset = referenceVariant.id === 'bf16'
    ? MODEL_ASSETS.h3RefBf16[0]
    : referenceVariant.id === 'dyntime'
      ? MODEL_ASSETS.h3DynTimeRef[0]
      : referenceVariant.id === 'dyntime-hq'
        ? MODEL_ASSETS.h3DynTimeRefHq[0]
        : MODEL_ASSETS.h3Ref[0];
  const configuredH3Turbo = turboBasename(effectiveSettings.h3TurboLora || H3_TURBO_V4_FILENAME);
  const configuredH3RefTurbo = turboBasename(effectiveSettings.h3RefTurboLora || H3_TURBO_LORAS.referenceRecommended);
  const h3TurboAsset = configuredH3Turbo === turboBasename(H3_TURBO_LEGACY_FILENAME)
    ? MODEL_ASSETS.h3TurboLegacy[0]
    : configuredH3Turbo === turboBasename(H3_TURBO_LIGHTX8_FILENAME)
      ? MODEL_ASSETS.h3TurboLightx8[0]
      : configuredH3Turbo === turboBasename(H3_TURBO_V4_FILENAME)
      ? MODEL_ASSETS.h3Turbo[0]
      : [...MODEL_ASSETS.h3Turbo[0], undefined, undefined, { checkOnly: true }];
  const h3RefTurboAsset = configuredH3RefTurbo === turboBasename(H3_TURBO_LIGHTX8_FILENAME)
    ? MODEL_ASSETS.h3RefTurboLightx8[0]
    : configuredH3RefTurbo === turboBasename(H3_TURBO_LORAS.referenceRecommended)
      ? MODEL_ASSETS.h3RefTurbo[0]
      : [...MODEL_ASSETS.h3RefTurbo[0], undefined, undefined, { checkOnly: true }];
  const assets = [...new Map(groups.flatMap((key) => (MODEL_ASSETS[key] || []).map((asset) => {
    if ((key === 'image' || key === 'krea2Raw') && variantAssets.has(asset[0])) return variantAssets.get(asset[0]);
    if (key === 'ltx' && asset[0] === 'ltxCkpt' && appleLtx) return LTX_APPLE_BF16_ASSET;
    if (key === 'klein4' && asset[0] === 'klein4Unet'
      && normalizeModelName(effectiveSettings.klein4Unet) === 'flux-2-klein-4b.safetensors') {
      return KLEIN4_LEGACY_BF16_ASSET;
    }
    if (key === 'h3' && asset[0] === 'h3Unet') return h3FrameAsset;
    if (key === 'h3Ref' && asset[0] === 'h3RefUnet') return h3ReferenceAsset;
    if (key === 'h3Turbo' && asset[0] === 'h3TurboLora') return h3TurboAsset;
    if (key === 'h3RefTurbo' && asset[0] === 'h3RefTurboLora') return h3RefTurboAsset;
    return asset;
  })).map((asset) => [asset[0], asset])).values()];
  for (const asset of assets) {
    const settingKey = asset[0];
    const configured = effectiveSettings[settingKey] || asset[3]
      || decodeURIComponent(new URL(asset[2]).pathname.split('/').pop() || '');
    const registered = resolveRegisteredModelSetting(settingKey, configured, options.availableModelNames);
    if (!registered || normalizeModelName(registered) === normalizeModelName(configured)) continue;
    settingUpdates[settingKey] = registered;
  }
  effectiveSettings = Object.assign({}, settings, settingUpdates);
  return { assets, effectiveSettings, krea2Variant, settingUpdates };
}

const COMPONENTS = Object.freeze({
  smartmask: { label: 'Smart Mask Tools', nodes: ['sam3'] },
  regional: { label: 'Regional Prompting', nodes: ['regional', 'kjnodes'], models: ['image'] },
  krea2ref: { label: 'Krea 2 Edit', nodes: ['krea2Edit'], models: ['image', 'krea2Outpaint'] },
  krea2remix: { label: 'Krea 2 Remix', nodes: ['rebalance'], models: ['image'] },
  krea2outpaint: { label: 'Krea 2 Expand', nodes: ['krea2Edit', 'kjnodes'], models: ['image', 'krea2Outpaint'] },
  editoutpaint: { label: 'Klein / Qwen Expand', nodes: ['kjnodes'] },
  upscale: { label: 'SeedVR2 Upscale', nodes: ['seedvr2'], models: ['upscale'] },
  ultimateupscale: { label: 'Ultimate SD Upscale', nodes: ['ultimate'] },
  video: { label: 'LTX 2.3 Video', nodes: ['vhs'], models: ['ltx'] },
  ltx25: { label: 'LTX 2.5 Video', nodes: [], models: ['ltx25'] },
  ltx25quality: { label: 'LTX 2.5 Quality', optional: true, nodes: [], models: ['ltx25Quality'] },
  h3: { label: 'MiniMax H3 Video', nodes: [], models: ['h3'] },
  h3r2v: { label: 'MiniMax H3 Reference-to-Video', nodes: ['vhs'], models: ['h3RefCommon', 'h3Ref'] },
  h3turbo: { label: 'MiniMax H3 Turbo (Preview)', optional: true, nodes: ['h3Turbo'], models: ['h3Turbo'] },
  h3turbor2v: { label: 'MiniMax H3 Reference Turbo (Preview)', optional: true, nodes: ['h3Turbo'], models: ['h3RefTurbo'] },
  h3context: { label: 'MiniMax H3 Long Context (Experimental)', optional: true, nodes: ['h3MotionContext'], models: [] },
  h3dyntime: { label: 'MiniMax H3 DynTime (Experimental)', optional: true, nodes: [], models: [], patches: ['h3DynTime'] },
  h3sage: { label: 'MiniMax H3 SageAttention', optional: true, nodes: ['kjnodes'], pythonPackages: ['sageattention'] },
  ltxdirector: { label: 'LTX 2.3 Director', nodes: ['whatdreamscost', 'ltxvideo', 'kjnodes', 'vhs'], models: ['ltx', 'ltxDirector'] },
  ltxcamera: { label: 'LTX Camera Motion (research adapter)', nodes: ['ltxvideo', 'vhs'], models: ['ltxCamera'] },
  videoedit: { label: 'LTX Edit', nodes: ['vhs'], models: ['ltxEdit'] },
  video4k: { label: 'RTX Video Super Resolution', nodes: ['rtx'] },
  wan: { label: 'Wan 2.2 Video', nodes: ['vhs', 'gguf'], models: ['wan'] },
  wananimate2: { label: 'Wan Animate 2 Character Animation', nodes: [], models: ['wanAnimate2'] },
  eros: { label: '10Eros DMD', nodes: ['eros', 'kjnodes'], models: ['eros', 'ltx'] },
  rife: { label: 'RIFE Frame Interpolation', nodes: ['rife'], models: [] },
  scail: { label: 'SCAIL 2 Motion Transfer', nodes: ['sam3', 'vhs', 'gguf', 'kjnodes'], models: ['scail', 'wan'] },
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

function installedRequirementNames(source) {
  return new Set(String(source || '').split(/\r?\n/)
    .map(requirementPackageName)
    .filter(Boolean));
}

function filterRequirementsForEnvironment(source, environmentSnapshot = '', options = {}) {
  const installed = installedRequirementNames(environmentSnapshot);
  const omitted = new Set((options.omitPackages || []).map((value) => requirementPackageName(value)));
  const installedOpenCv = [...installed].some((name) => name.startsWith('opencv-'));
  return String(source || '').split(/\r?\n/)
    .filter((line) => {
      const name = requirementPackageName(line);
      if (!name) return true;
      if (omitted.has(name)) return false;
      if (options.repair && PROTECTED_RUNTIME_REQUIREMENTS.has(name)) return false;
      if (name.startsWith('opencv-') && installedOpenCv) return false;
      return !(PROTECTED_RUNTIME_REQUIREMENTS.has(name) && installed.has(name));
    })
    .join('\n');
}

function protectedRuntimeConstraints(source) {
  return String(source || '').split(/\r?\n/)
    .filter((line) => {
      if (!PROTECTED_RUNTIME_REQUIREMENTS.has(requirementPackageName(line))) return false;
      // pip freeze can preserve portable-build provenance as a direct local
      // wheel reference (for example `numpy @ file:///D:/a/...`). Those paths
      // belong to the machine that built ComfyUI and poison both pip and uv
      // when copied into a constraints file. Keep only ordinary exact version
      // pins here; safeNodeRequirementsFile separately removes the installed
      // protected package from the custom node's requested requirements.
      return /^[A-Za-z0-9_.-]+\s*={2,3}\s*[^\s;]+(?:\s*;.*)?$/.test(String(line || '').trim());
    })
    .join('\n');
}

async function safeNodeRequirementsFile(requirements, options = {}) {
  const source = await fsp.readFile(requirements, 'utf8');
  let environmentSnapshot = '';
  if (options.environmentSnapshot) {
    try { environmentSnapshot = await fsp.readFile(options.environmentSnapshot, 'utf8'); } catch { /* snapshot is optional */ }
  }
  const filtered = filterRequirementsForEnvironment(source, environmentSnapshot, options);
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
  } catch (pipError) {
    if (options.signal?.aborted || pipError?.code === 'dependency_cancelled' || pipError?.name === 'AbortError') throw dependencyCancelledError();
    if (requirementFallbackReason(pipError)) {
      try {
        report('snapshotting-environment', 'Saving the current ComfyUI uv package list');
        const freeze = await runCommand(status.pythonPath, ['-m', 'uv', 'pip', 'freeze', '--python', status.pythonPath], {
          cwd: status.basePath,
          signal: options.signal,
        });
        await fsp.mkdir(path.dirname(destination), { recursive: true });
        await fsp.writeFile(destination, `${freeze}\n`, 'utf8');
        report('environment-snapshot', 'Saved a ComfyUI package snapshot before installation', { environmentSnapshot: destination });
        return destination;
      } catch (uvError) {
        if (options.signal?.aborted || uvError?.code === 'dependency_cancelled' || uvError?.name === 'AbortError') throw dependencyCancelledError();
        pipError.uvFallbackError = uvError;
      }
    }
    // A package snapshot is a safety net, not a reason to block a legitimate
    // model download when the Comfy Python executable does not support freeze.
    report('snapshot-warning', 'Could not save a Python package snapshot; continuing with the safer installer.', { snapshotWarning: String(pipError.message || pipError) });
    return '';
  }
}

async function checkPythonEnvironment(status, report, options = {}) {
  const runCommand = options.run || run;
  try {
    await runCommand(status.pythonPath, ['-m', 'pip', 'check'], { cwd: status.basePath, signal: options.signal });
    return true;
  } catch (pipError) {
    if (options.signal?.aborted || pipError?.code === 'dependency_cancelled' || pipError?.name === 'AbortError') throw dependencyCancelledError();
    if (requirementFallbackReason(pipError)) {
      try {
        await runCommand(status.pythonPath, ['-m', 'uv', 'pip', 'check', '--python', status.pythonPath], {
          cwd: status.basePath,
          signal: options.signal,
        });
        return true;
      } catch (uvError) {
        if (options.signal?.aborted || uvError?.code === 'dependency_cancelled' || uvError?.name === 'AbortError') throw dependencyCancelledError();
        pipError.uvFallbackError = uvError;
      }
    }
    report('environment-warning', 'The node packs were installed, but the Python environment check found an existing dependency conflict. Use Repair missing tools, then restart ComfyUI.', {
      environmentWarning: String(pipError.message || pipError),
    });
    return false;
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

async function patchBfsOptionalAudio(nodePath) {
  const file = path.join(nodePath, '__init__.py');
  let source;
  try { source = await fsp.readFile(file, 'utf8'); } catch { return false; }
  if (source.includes('[BFSNodes] AMV Guide node not loaded')) return false;
  const imports = [
    'from .amv_guide_node import NODE_CLASS_MAPPINGS as AMV_NODE_CLASS_MAPPINGS',
    'from .amv_guide_node import NODE_DISPLAY_NAME_MAPPINGS as AMV_NODE_DISPLAY_NAME_MAPPINGS',
  ];
  if (!imports.every((line) => source.includes(line))) return false;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const guarded = [
    'try:',
    `    ${imports[0]}`,
    `    ${imports[1]}`,
    'except Exception as _e:  # noqa',
    '    print(f"[BFSNodes] AMV Guide node not loaded: {_e!r}")',
    '    AMV_NODE_CLASS_MAPPINGS, AMV_NODE_DISPLAY_NAME_MAPPINGS = {}, {}',
  ].join(newline);
  const patched = source.replace(`${imports[0]}${newline}${imports[1]}`, guarded);
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
  report('installing-uv', 'Installing uv for accelerated model downloads and isolated custom-node setup');
  try {
    await (options.run || run)(status.pythonPath, [
      '-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', 'uv',
    ], { cwd: status.basePath, signal: options.signal });
  } catch (error) {
    const wrapped = new Error(
      `Dependency setup needs uv beside the ComfyUI Python executable (${status.pythonPath}). `
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

function nodePackError(message, code, detail = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, detail);
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
  throwIfCancelled(options.signal);
  assertNodePackSourceAvailable(pack, status);
  await fsp.mkdir(status.customNodesPath, { recursive: true });
  const inspection = options.nodeInspection || await inspectNodePackSource(pack, status, options);
  const { nodeExists, gitManaged, compatibleMirror, origin } = inspection;
  if (nodeExists && !gitManaged) {
    report('existing-node', `Using the existing ${pack.label} installation without changing its source`, { unmanaged: true });
  } else if (gitManaged) {
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
  if (pack.compatibilityPatch === 'bfs-optional-audio' && await patchBfsOptionalAudio(nodePath)) {
    report('compatibility-patch', `Made ${pack.label}'s optional audio node safe to skip on this platform`);
  }
  const requirements = path.join(nodePath, 'requirements.txt');
  if (existsSync(requirements)) {
    const repair = !!options.repair;
    const omitPackages = pack.omitRequirementsByPlatform?.[options.platform || process.platform] || [];
    const safeRequirements = await safeNodeRequirementsFile(requirements, {
      repair,
      environmentSnapshot: options.environmentSnapshot,
      omitPackages,
    });
    report('requirements', repair
      ? `Repairing ${pack.label} requirements without changing unrelated packages`
      : `Installing ${pack.label} requirements without upgrading unrelated packages`);
    try {
      await installNodeRequirements(status, safeRequirements.path, repair, report, Object.assign({}, options, {
        cwd: nodePath,
      }));
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

async function inspectNodePackSource(pack, status, options = {}) {
  const runCommand = options.run || run;
  const existsSync = options.existsSync || fs.existsSync;
  const gitExecutable = String(options.gitExecutable || process.env.MIX_STUDIO_GIT || 'git').trim() || 'git';
  const preferredNodePath = path.join(status.customNodesPath, pack.folder);
  const compatibleNodePaths = (pack.compatibleFolders || [])
    .map((folder) => path.join(status.customNodesPath, folder));
  const nodePath = [preferredNodePath, ...compatibleNodePaths]
    .find((candidate) => existsSync(candidate)) || preferredNodePath;
  assertNodePackSourceAvailable(pack, status);
  const nodeExists = existsSync(nodePath);
  const gitManaged = existsSync(path.join(nodePath, '.git'));
  if (nodeExists && !gitManaged && !looksLikeCustomNodeFolder(nodePath)) {
    throw nodePackError(
      `${pack.label} already exists at ${nodePath}, but it does not look like a valid custom-node installation. Move or rename it, then try again.`,
      'dependency_node_folder_conflict',
      { failedNode: pack.folder, nodePath, expectedRepo: pack.repo }
    );
  }
  let origin = '';
  let compatibleMirror = false;
  if (gitManaged) {
    origin = String(await runCommand(gitExecutable, ['-C', nodePath, 'remote', 'get-url', 'origin'], {
      cwd: nodePath,
      signal: options.signal,
    })).trim();
    compatibleMirror = !sameRepo(origin, pack.repo)
      && pack.allowCompatibleMirror === true
      && nodePackHasSignatures(pack, nodePath);
    if (!sameRepo(origin, pack.repo) && !compatibleMirror) {
      throw nodePackError(
        `${pack.label} at ${nodePath} points to ${origin || 'an unknown repository'}, not the reviewed source ${pack.repo}, and does not expose the required compatible node classes. Other selected workflows can continue.`,
        'dependency_node_source_mismatch',
        { failedNode: pack.folder, nodePath, actualRepo: origin, expectedRepo: pack.repo }
      );
    }
  }
  return { nodePath, nodeExists, gitManaged, compatibleMirror, origin };
}

function uvRequirementsArgs(requirements, pythonPath, repair = false, options = {}) {
  const args = ['-m', 'uv', 'pip', 'install', '--python', pythonPath];
  if (repair) args.push('--reinstall', '--no-deps');
  if (!repair && options.constraintFile) args.push('--constraint', options.constraintFile);
  args.push('-r', requirements);
  return args;
}

function requirementFallbackReason(error) {
  const message = String(error?.message || error || '');
  if (/No module named ['"]?pip/i.test(message)) return 'pip is unavailable in this ComfyUI Python environment';
  if (/No such file or directory:[\s\S]*\.whl/i.test(message) || /file:\/\/\/[A-Za-z]:[\s\S]*\.whl/i.test(message)) {
    return 'an installed package points to a wheel path from another computer';
  }
  return '';
}

async function installNodeRequirements(status, requirements, repair, report, options = {}) {
  const runCommand = options.run || run;
  const pipArgs = requirementsArgs(requirements, repair, { constraintFile: options.constraintFile });
  try {
    return await runCommand(status.pythonPath, pipArgs, {
      cwd: options.cwd || status.basePath,
      signal: options.signal,
    });
  } catch (pipError) {
    if (options.signal?.aborted || pipError?.code === 'dependency_cancelled' || pipError?.name === 'AbortError') throw pipError;
    if (/(?:WinError 5|Access is denied)[\s\S]*cv2\.pyd/i.test(String(pipError?.message || pipError || ''))) {
      throw nodePackError(
        'ComfyUI is currently using its OpenCV runtime. Mix Studio preserved that installed version; stop ComfyUI completely, retry this dependency once, then restart ComfyUI.',
        'dependency_requirements_locked',
        { cause: pipError }
      );
    }
    const reason = requirementFallbackReason(pipError);
    if (!reason) throw pipError;
    report('requirements-fallback', `Using this ComfyUI environment's uv installer because ${reason}`);
    try {
      return await runCommand(status.pythonPath, uvRequirementsArgs(requirements, status.pythonPath, repair, {
        constraintFile: options.constraintFile,
      }), { cwd: options.cwd || status.basePath, signal: options.signal });
    } catch (uvError) {
      if (options.signal?.aborted || uvError?.code === 'dependency_cancelled' || uvError?.name === 'AbortError') throw uvError;
      throw nodePackError(
        `Could not install custom-node requirements with pip (${String(pipError.message || pipError)}) or uv (${String(uvError.message || uvError)}).`,
        'dependency_requirements_failed',
        { cause: uvError }
      );
    }
  }
}

function responseHeader(response, name) {
  return String(response?.headers?.get?.(name) || '');
}

function parseDownloadContentRange(value) {
  const match = String(value || '').trim().match(/^bytes (?:(\d+)-(\d+)|\*)\/(\d+|\*)$/i);
  if (!match) return null;
  const total = match[3] === '*' ? 0 : Number(match[3]);
  if (match[1] === undefined) return { start: null, end: null, total };
  return { start: Number(match[1]), end: Number(match[2]), total };
}

function transientDownloadStatus(status) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function existingFileSize(file) {
  try {
    const stat = await fsp.stat(file);
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

async function modelFilesNamed(root, folder, basename, limit = 20_000) {
  const start = path.join(String(root || ''), folder);
  const target = String(basename || '').toLowerCase();
  if (!root || !target || !fs.existsSync(start)) return { files: [], truncated: false };
  const files = [];
  const pending = [start];
  let inspected = 0;
  while (pending.length && inspected < limit) {
    const current = pending.pop();
    let entries;
    try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      inspected += 1;
      if (inspected > limit) break;
      const targetPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.')) pending.push(targetPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === target) {
        files.push(targetPath);
      }
    }
  }
  return { files, truncated: pending.length > 0 || inspected > limit };
}

async function findExistingModelByBasename(roots, folder, filename, report = () => {}) {
  const basename = path.basename(filename);
  const candidates = [];
  let truncated = false;
  for (const root of [...new Set((roots || []).filter(Boolean).map((value) => path.resolve(String(value))))]) {
    const found = await modelFilesNamed(root, folder, basename);
    candidates.push(...found.files);
    truncated ||= found.truncated;
  }
  const unique = [...new Map(candidates.map((file) => [path.resolve(file).toLowerCase(), file])).values()];
  const valid = [];
  for (const file of unique) {
    const validation = await validateModelFile(file, path.extname(filename));
    if (validation.valid) valid.push(file);
    else {
      report('invalid-existing-model', `${basename} was found but is incomplete or invalid`, {
        filename,
        existing: file,
        validationReason: validation.reason,
      });
    }
  }
  if (valid.length === 1) return valid[0];
  if (valid.length > 1) {
    report('ambiguous-existing-model', `${basename} exists in more than one configured model location`, {
      filename,
      matches: valid,
    });
  } else if (truncated) {
    report('model-scan-limited', `The configured model folders were too large to finish searching for ${basename}`, {
      filename,
    });
  }
  return '';
}

async function directoryStoredBytes(directory, limit = Number.MAX_SAFE_INTEGER) {
  let total = 0;
  const pending = [directory];
  while (pending.length && total < limit) {
    const current = pending.pop();
    let entries;
    try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) total += await existingFileSize(target);
      if (total >= limit) return limit;
    }
  }
  return Math.min(total, limit);
}

async function readDownloadMetadata(file) {
  try {
    const value = JSON.parse(await fsp.readFile(file, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

async function writeDownloadMetadata(file, value) {
  const temporary = `${file}.tmp`;
  await fsp.writeFile(temporary, JSON.stringify(value), 'utf8');
  await fsp.rm(file, { force: true }).catch(() => {});
  await fsp.rename(temporary, file);
}

async function clearPartialDownload(partial, metadataFile) {
  await fsp.rm(partial, { force: true }).catch(() => {});
  await fsp.rm(metadataFile, { force: true }).catch(() => {});
  await fsp.rm(`${metadataFile}.tmp`, { force: true }).catch(() => {});
}

function downloadRetryDelay(attempt, options = {}) {
  const base = Number.isFinite(Number(options.downloadRetryDelayMs))
    ? Math.max(0, Number(options.downloadRetryDelayMs))
    : 750;
  return Math.min(6000, base * (2 ** Math.max(0, attempt - 1)));
}

async function waitForDownloadRetry(attempt, options = {}) {
  const delay = downloadRetryDelay(attempt, options);
  if (!delay) return;
  await new Promise((resolve, reject) => {
    let timer = null;
    const cancelled = () => {
      if (timer) clearTimeout(timer);
      reject(dependencyCancelledError());
    };
    if (options.signal?.aborted) return cancelled();
    options.signal?.addEventListener('abort', cancelled, { once: true });
    timer = setTimeout(() => {
      options.signal?.removeEventListener('abort', cancelled);
      resolve();
    }, delay);
  });
}

function downloadStagingDirectory(modelsPath, settingKey, sourceUrl) {
  const source = parseHuggingFaceResolveUrl(sourceUrl);
  const sourceKey = source ? `${source.repoId}-${source.revision}-${source.filename}` : sourceUrl;
  const safe = `${settingKey}-${sourceKey}`.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 180);
  return path.join(modelsPath, '.mix-studio-downloads', `${safe}.hf-xet`);
}

async function downloadAsset(asset, modelsPath, settings, report, options = {}) {
  const [settingKey, folder, url, defaultFilename, fallbackUrls, policy] = asset;
  const hfEndpoint = normalizeHuggingFaceEndpoint(options.hfEndpoint || process.env.HF_ENDPOINT);
  const sources = [...new Set([url, ...(Array.isArray(fallbackUrls) ? fallbackUrls : [])]
    .filter(Boolean)
    .map((source) => huggingFaceEndpointUrl(source, hfEndpoint)))];
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
  const discovered = await findExistingModelByBasename(
    [modelsPath, ...(Array.isArray(options.availableModelRoots) ? options.availableModelRoots : [])],
    folder,
    filename,
    report,
  );
  if (discovered) {
    report('already-present', `${filename} is already available in a configured model folder`, {
      settingKey,
      filename,
      existing: discovered,
      discovered: true,
    });
    return { skipped: true, destination: discovered, discovered: true };
  }
  if (policy?.checkOnly === true) {
    const error = new Error(
      `${filename} is a custom MiniMax H3 Turbo adapter and was not found. `
      + 'Install that exact file in ComfyUI first, then run Check again; Mix Studio will not download or rename a different Turbo adapter into its place.'
    );
    error.code = 'dependency_custom_model_missing';
    error.settingKey = settingKey;
    error.failedModel = filename;
    error.checkOnly = true;
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
  const partialMetadata = `${partial}.json`;
  const existingPartialBytes = await existingFileSize(partial);
  report('downloading-model', existingPartialBytes
    ? `Resuming ${filename}`
    : `Downloading ${filename}`, {
    settingKey,
    filename,
    downloaded: existingPartialBytes,
    downloadTotal: 0,
    resumed: existingPartialBytes > 0,
  });
  const hfToken = String(options.hfToken || process.env.HF_TOKEN || '').trim();
  const fetchImpl = options.fetch || fetch;
  const runCommand = options.run || run;
  const maxAttempts = Math.max(1, Math.min(8, Math.round(Number(options.downloadAttempts) || 4)));
  const accelerationThreshold = Number.isFinite(Number(options.hfAccelerationThreshold))
    ? Math.max(0, Number(options.hfAccelerationThreshold))
    : 256 * 1024 * 1024;
  let selectedUrl = url;
  const failures = [];
  const stagingDirectories = new Set();

  const removeStagingDownloads = async () => {
    for (const directory of stagingDirectories) {
      await fsp.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  };
  const cancelled = async () => {
    await clearPartialDownload(partial, partialMetadata);
    await removeStagingDownloads();
    throw dependencyCancelledError();
  };
  const waitForRetry = async (attempt) => {
    try {
      await waitForDownloadRetry(attempt, options);
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled') return cancelled();
      throw error;
    }
  };
  const completeDownload = async (expectedTotal = 0, sourceExtensionOverride = sourceExtension) => {
    if (options.signal?.aborted) return cancelled();
    const downloaded = await existingFileSize(partial);
    if (expectedTotal > 0 && downloaded !== expectedTotal) {
      const error = new Error(`The ${filename} download ended early (${downloaded} of ${expectedTotal} bytes). Retry to resume from the saved progress.`);
      error.code = 'dependency_download_incomplete';
      error.settingKey = settingKey;
      error.failedModel = filename;
      error.resumableBytes = downloaded;
      throw error;
    }
    const validation = await validateModelFile(partial, configuredExtension || sourceExtensionOverride);
    if (!validation.valid) {
      await clearPartialDownload(partial, partialMetadata);
      await removeStagingDownloads();
      const error = new Error(`The downloaded ${filename} file is incomplete or has an invalid model header. Try the download again.`);
      error.code = 'dependency_model_invalid';
      error.settingKey = settingKey;
      error.failedModel = filename;
      error.validationReason = validation.reason;
      throw error;
    }
    await fsp.rename(partial, destination);
    await fsp.rm(partialMetadata, { force: true }).catch(() => {});
    await removeStagingDownloads();
    report('downloaded-model', `Downloaded ${filename}`, {
      settingKey,
      filename,
      downloaded,
      downloadTotal: expectedTotal || downloaded,
    });
    return { skipped: false, destination };
  };

  for (let index = 0; index < sources.length; index += 1) {
    selectedUrl = sources[index];
    let accelerationAttempted = false;
    const stagingDirectory = downloadStagingDirectory(modelsPath, settingKey, selectedUrl);
    stagingDirectories.add(stagingDirectory);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (options.signal?.aborted) return cancelled();
      let metadata = await readDownloadMetadata(partialMetadata);
      let resumeBytes = await existingFileSize(partial);
      if (resumeBytes > 0 && (!metadata || metadata.url !== selectedUrl)) {
        await clearPartialDownload(partial, partialMetadata);
        metadata = null;
        resumeBytes = 0;
      }
      const sourceHost = new URL(selectedUrl).hostname.toLowerCase();
      const headers = hfToken && sourceHost === 'huggingface.co'
        ? { Authorization: `Bearer ${hfToken}` }
        : {};
      if (resumeBytes > 0) {
        headers.Range = `bytes=${resumeBytes}-`;
        if (metadata?.validator) headers['If-Range'] = metadata.validator;
      }

      let response;
      try {
        response = await fetchImpl(selectedUrl, {
          headers,
          redirect: 'follow',
          signal: options.signal,
        });
      } catch (error) {
        if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') return cancelled();
        failures.push({ url: selectedUrl, status: 0, detail: String(error.message || error) });
        if (attempt < maxAttempts) {
          report('downloading-model', `Connection interrupted; retrying ${filename}`, {
            settingKey,
            filename,
            downloaded: await existingFileSize(partial),
            downloadTotal: Number(metadata?.total || 0),
            retryAttempt: attempt + 1,
            resumed: true,
          });
          await waitForRetry(attempt);
          continue;
        }
        break;
      }

      const status = Number(response.status || (response.ok ? 200 : 0));
      const contentRange = parseDownloadContentRange(responseHeader(response, 'content-range'));
      if (status === 416 && resumeBytes > 0 && contentRange?.total === resumeBytes) {
        try {
          return await completeDownload(contentRange.total, path.extname(sourceName).toLowerCase());
        } catch (error) {
          if (error.code !== 'dependency_download_incomplete') throw error;
        }
      }
      if (!response.ok || !response.body) {
        const detail = await response.text().catch(() => '');
        failures.push({ url: selectedUrl, status, detail });
        if (transientDownloadStatus(status) && attempt < maxAttempts) {
          report('downloading-model', `The download source is busy; retrying ${filename}`, {
            settingKey,
            filename,
            downloaded: resumeBytes,
            downloadTotal: Number(metadata?.total || 0),
            retryAttempt: attempt + 1,
            resumed: resumeBytes > 0,
          });
          await waitForRetry(attempt);
          continue;
        }
        break;
      }

      const rangeMatches = resumeBytes > 0 && status === 206 && contentRange?.start === resumeBytes;
      if (resumeBytes > 0 && !rangeMatches) {
        await clearPartialDownload(partial, partialMetadata);
        metadata = null;
        resumeBytes = 0;
      }
      const responseBytes = Number(responseHeader(response, 'content-length') || 0);
      const total = Number(contentRange?.total || (responseBytes > 0 ? resumeBytes + responseBytes : 0));
      const validator = responseHeader(response, 'etag') || responseHeader(response, 'last-modified') || metadata?.validator || '';
      const canAccelerate = !accelerationAttempted
        && resumeBytes === 0
        && !!options.uvExecutable
        && !!parseHuggingFaceResolveUrl(selectedUrl)
        && (total === 0 || total >= accelerationThreshold);
      const acceleratedBytes = canAccelerate && total > 0
        ? await directoryStoredBytes(stagingDirectory, total)
        : 0;
      await ensureDownloadDiskSpace(
        path.dirname(destination),
        total > 0 ? Math.max(0, total - resumeBytes - acceleratedBytes) : 0,
        options
      );
      if (canAccelerate) {
        accelerationAttempted = true;
        await response.body.cancel?.().catch(() => {});
        const transferStartedAt = Date.now();
        report('downloading-model', `Accelerating ${filename} with Hugging Face Xet`, {
          settingKey,
          filename,
          downloaded: 0,
          downloadTotal: total,
          downloadMethod: 'hf-xet',
          downloadStartedAt: transferStartedAt,
        });
        try {
          const accelerated = await acceleratedHuggingFaceDownload({
            url: selectedUrl,
            stagingDirectory,
            uvExecutable: options.uvExecutable,
            run: runCommand,
            hfToken,
            signal: options.signal,
            timeout: options.hfToolTimeout,
            downloadTimeoutSeconds: options.hfDownloadTimeoutSeconds,
            expectedBytes: total,
            progressIntervalMs: options.hfProgressIntervalMs,
            onProgress: ({ downloaded, downloadTotal }) => report(
              'downloading-model',
              `Accelerating ${filename} with Hugging Face Xet`,
              {
                settingKey,
                filename,
                downloaded,
                downloadTotal,
                downloadMethod: 'hf-xet',
                downloadStartedAt: transferStartedAt,
              }
            ),
          });
          if (accelerated) {
            if (total > 0 && accelerated.size !== total) {
              throw new Error(`Hugging Face acceleration returned ${accelerated.size} of ${total} bytes.`);
            }
            await clearPartialDownload(partial, partialMetadata);
            await fsp.rename(accelerated.path, partial);
            return await completeDownload(total, path.extname(accelerated.source.filename).toLowerCase());
          }
        } catch (error) {
          if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR' || error?.code === 'dependency_cancelled') {
            return cancelled();
          }
          failures.push({ url: selectedUrl, status: 0, detail: `Hugging Face Xet: ${String(error.message || error)}` });
          report('download-fallback', `Hugging Face acceleration was unavailable; resuming ${filename} with the built-in downloader`, {
            settingKey,
            filename,
            downloadMethod: 'http-resume',
            acceleratorError: String(error.message || error).slice(0, 400),
          });
        }
        if (attempt < maxAttempts) continue;
        break;
      }

      await writeDownloadMetadata(partialMetadata, {
        url: selectedUrl,
        validator,
        total,
        updatedAt: new Date().toISOString(),
      });
      const handle = await fsp.open(partial, rangeMatches ? 'a' : 'w');
      let downloaded = resumeBytes;
      try {
        const reader = response.body.getReader();
        for (;;) {
          throwIfCancelled(options.signal);
          const { done, value } = await reader.read();
          if (done) break;
          await handle.write(value);
          downloaded += value.byteLength;
          report('downloading-model', `Downloading ${filename}`, {
            settingKey,
            filename,
            downloaded,
            downloadTotal: total,
            resumed: rangeMatches,
            downloadMethod: 'http-resume',
          });
        }
      } catch (error) {
        if (options.signal?.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          await handle.close().catch(() => {});
          return cancelled();
        }
        await handle.close().catch(() => {});
        failures.push({ url: selectedUrl, status: 0, detail: String(error.message || error) });
        if (attempt < maxAttempts) {
          report('downloading-model', `Connection interrupted; retrying ${filename}`, {
            settingKey,
            filename,
            downloaded: await existingFileSize(partial),
            downloadTotal: total,
            retryAttempt: attempt + 1,
            resumed: true,
            downloadMethod: 'http-resume',
          });
          await waitForRetry(attempt);
          continue;
        }
        break;
      } finally {
        await handle.close().catch(() => {});
      }

      const actualSize = await existingFileSize(partial);
      if (total > 0 && actualSize !== total) {
        failures.push({
          url: selectedUrl,
          status: 0,
          detail: `Download ended early (${actualSize} of ${total} bytes).`,
        });
        if (attempt < maxAttempts) {
          report('downloading-model', `Download paused; resuming ${filename}`, {
            settingKey,
            filename,
            downloaded: actualSize,
            downloadTotal: total,
            retryAttempt: attempt + 1,
            resumed: true,
            downloadMethod: 'http-resume',
          });
          await waitForRetry(attempt);
          continue;
        }
        break;
      }
      return completeDownload(total, path.extname(decodeURIComponent(new URL(selectedUrl).pathname.split('/').pop() || primarySourceName)).toLowerCase());
    }

    if (index < sources.length - 1) {
      await clearPartialDownload(partial, partialMetadata);
      report('download-fallback', `The primary source for ${filename} was unavailable; trying a reviewed mirror`, {
        settingKey, filename, sourceIndex: index + 1,
      });
    }
  }

  const failure = failures[failures.length - 1] || { url: selectedUrl, status: 0, detail: '' };
  const accessFailure = [...failures].reverse().find((entry) => entry.status === 401 || entry.status === 403);
  const accessUrl = huggingFaceAccessUrl(accessFailure?.url || '');
  const accessRequired = !!accessUrl;
  const stagedSizes = await Promise.all(
    [...stagingDirectories].map((directory) => directoryStoredBytes(directory))
  );
  const stagedBytes = Math.max(0, ...stagedSizes);
  const resumableBytes = Math.max(await existingFileSize(partial), stagedBytes);
  const error = new Error(accessRequired
    ? `Hugging Face access is required for ${filename}. Accept the model license, then paste a read token into Preferences → General → Hugging Face token and retry.`
    : resumableBytes > 0
      ? `The ${filename} download was interrupted after ${resumableBytes} bytes. Retry to continue from the saved progress.`
      : `Could not download ${filename}${failure.status ? ` (${failure.status})` : ''}. ${failure.detail.slice(0, 240) || 'All reviewed sources were unavailable; check the connection and try again.'}`);
  error.code = accessRequired
    ? 'dependency_model_access_required'
    : resumableBytes > 0 ? 'dependency_download_incomplete' : 'dependency_download_failed';
  error.statusCode = accessFailure?.status || failure.status || null;
  error.settingKey = settingKey;
  error.failedModel = filename;
  error.resumableBytes = resumableBytes;
  if (accessRequired) error.accessUrl = accessUrl;
  throw error;
}

function availableComponents() { return Object.keys(COMPONENTS); }

function componentsForNodePack(nodeId) {
  return Object.entries(COMPONENTS)
    .filter(([, component]) => (component.nodes || []).includes(nodeId))
    .map(([componentId]) => componentId);
}

async function inspectPinnedNodeRevisions(status, options = {}) {
  if (!status?.customNodesPath) return [];
  const runCommand = options.run || run;
  const existsSync = options.existsSync || fs.existsSync;
  const gitExecutable = String(options.gitExecutable || process.env.MIX_STUDIO_GIT || 'git').trim() || 'git';
  const checks = await Promise.all(Object.entries(NODE_PACKS).map(async ([nodeId, pack]) => {
    if (!pack.ref || pack.enforceRevision !== true) return null;
    const preferred = path.join(status.customNodesPath, pack.folder);
    const candidates = [preferred, ...(pack.compatibleFolders || []).map((folder) => path.join(status.customNodesPath, folder))];
    if (!candidates.some((candidate) => existsSync(candidate))) return null;
    try {
      const inspection = await inspectNodePackSource(pack, status, options);
      if (!inspection.gitManaged || inspection.compatibleMirror) return null;
      const currentRef = String(await runCommand(gitExecutable, ['-C', inspection.nodePath, 'rev-parse', 'HEAD'], {
        cwd: inspection.nodePath,
        signal: options.signal,
      })).trim().toLowerCase();
      const expectedRef = String(pack.ref).trim().toLowerCase();
      if (!currentRef || currentRef === expectedRef) return null;
      return {
        nodeId,
        label: pack.label,
        nodePath: inspection.nodePath,
        currentRef,
        expectedRef,
        componentIds: componentsForNodePack(nodeId),
      };
    } catch {
      // Source mismatches and unmanaged folders are handled by install preflight;
      // revision readiness only reports reviewed Git checkouts that can be repinned.
      return null;
    }
  }));
  return checks.filter(Boolean);
}

function nodeFailureRecord(nodeId, componentIds, error) {
  return {
    nodeId,
    componentIds,
    code: error?.code || 'dependency_node_install_failed',
    message: String(error?.message || error),
    failedNode: error?.failedNode || NODE_PACKS[nodeId]?.folder || nodeId,
    nodePath: error?.nodePath || '',
    actualRepo: error?.actualRepo || '',
    expectedRepo: error?.expectedRepo || NODE_PACKS[nodeId]?.repo || '',
  };
}

function componentIdsForNode(selected, nodeId) {
  return selected.filter((componentId) => (COMPONENTS[componentId]?.nodes || []).includes(nodeId));
}

async function preflightNodePacks(selected, nodeIds, status, report, options = {}) {
  const inspections = new Map();
  const failures = [];
  const blockedComponents = new Set();
  for (const nodeId of nodeIds) {
    throwIfCancelled(options.signal);
    const componentIds = componentIdsForNode(selected, nodeId);
    try {
      inspections.set(nodeId, await inspectNodePackSource(NODE_PACKS[nodeId], status, options));
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw error;
      const failure = nodeFailureRecord(nodeId, componentIds, error);
      failures.push(failure);
      componentIds.forEach((componentId) => blockedComponents.add(componentId));
      report('node-preflight-failed', failure.message, { component: nodeId, failure });
    }
  }
  return { inspections, failures, blockedComponents };
}

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
  const nodeIds = [...new Set(selected.flatMap((key) => COMPONENTS[key].nodes || []))];
  const nodeOptions = Object.assign({}, options, {
    gitExecutable: options.gitExecutable || runtime?.update?.gitExecutable,
  });
  report('preflighting', `Checking ${selected.length} selected dependency group${selected.length === 1 ? '' : 's'}`);
  const preflight = await preflightNodePacks(selected, nodeIds, status, report, nodeOptions);
  const failures = [...preflight.failures];
  const blockedComponents = new Set(preflight.blockedComponents);
  let readyComponents = selected.filter((componentId) => !blockedComponents.has(componentId));
  let readyNodeIds = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].nodes || []))];
  let pythonPackageIds = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].pythonPackages || []))];
  const selectedPatchIds = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].patches || []))];
  if (readyComponents.includes('h3r2v') && h3ReferenceVariant(settings).requiresPatch
    && !selectedPatchIds.includes('h3DynTime')) {
    selectedPatchIds.push('h3DynTime');
  }
  let modelGroups = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].models || []))];
  if (readyComponents.includes('h3dyntime')) {
    const selectedReferenceVariant = h3ReferenceVariant(settings);
    modelGroups.push(selectedReferenceVariant.id === 'dyntime-hq' ? 'h3DynTimeRefHq' : 'h3DynTimeRef');
  }
  let modelPlan = dependencyModelPlan(modelGroups, settings, options);
  let { assets, effectiveSettings } = modelPlan;
  let total = readyNodeIds.length + pythonPackageIds.length + selectedPatchIds.length + assets.length;
  let completed = 0;
  report('starting', failures.length
    ? `Preparing ${readyComponents.length} compatible dependency group${readyComponents.length === 1 ? '' : 's'}; ${blockedComponents.size} need attention`
    : `Preparing ${selected.length} dependency group${selected.length === 1 ? '' : 's'}`, { completed, total, failures });
  const environmentSnapshot = readyNodeIds.length
    ? await snapshotPythonEnvironment(status, runtime, (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})), options)
    : '';
  const runtimeConstraintFile = await createRuntimeConstraintFile(environmentSnapshot);
  const hasHuggingFaceAssets = assets.some((asset) => [asset[2], ...(Array.isArray(asset[4]) ? asset[4] : [])]
    .some((source) => !!parseHuggingFaceResolveUrl(source)));
  const configuredHfEndpoint = normalizeHuggingFaceEndpoint(options.hfEndpoint || process.env.HF_ENDPOINT);
  const canUseOfficialHfAcceleration = !configuredHfEndpoint || configuredHfEndpoint === 'https://huggingface.co';
  let uvExecutable = options.uvExecutable || '';
  if (!uvExecutable && hasHuggingFaceAssets && canUseOfficialHfAcceleration && options.disableHfAcceleration !== true) {
    try {
      uvExecutable = await ensureUv(
        status,
        (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})),
        options
      );
    } catch (error) {
      report('download-fallback', 'Hugging Face acceleration is unavailable; using resumable downloads.', {
        completed,
        total,
        acceleratorError: String(error.message || error).slice(0, 400),
      });
    }
  }
  for (const id of readyNodeIds) {
    throwIfCancelled(options.signal);
    const pack = NODE_PACKS[id];
    try {
      await installNodePack(pack, status, (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: id }, detail || {})), Object.assign({}, nodeOptions, {
        constraintFile: runtimeConstraintFile,
        environmentSnapshot,
        platform: options.platform || process.platform,
        nodeInspection: preflight.inspections.get(id),
      }));
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw error;
      const componentIds = componentIdsForNode(readyComponents, id);
      const failure = nodeFailureRecord(id, componentIds, error);
      failures.push(failure);
      componentIds.forEach((componentId) => blockedComponents.add(componentId));
      report('node-failed', `${pack.label} needs attention; continuing with unrelated workflows`, {
        completed,
        total,
        component: id,
        failure,
      });
    }
    completed += 1;
    if (!failures.some((failure) => failure.nodeId === id)) {
      report('node-ready', `${pack.label} is ready`, { completed, total, component: id });
    }
  }
  readyComponents = selected.filter((componentId) => !blockedComponents.has(componentId));
  for (const id of selectedPatchIds) {
    throwIfCancelled(options.signal);
    if (id !== 'h3DynTime') throw new Error(`Unknown reviewed ComfyUI patch: ${id}`);
    report('patching-comfy', 'Checking the reviewed MiniMax H3 DynTime compatibility patch', { completed, total, component: id });
    const patchResult = await applyDynTimePatch(runtime, {
      signal: options.signal,
      gitExecutable: options.gitExecutable || runtime?.update?.gitExecutable,
    });
    completed += 1;
    report('patch-ready', patchResult.changed
      ? 'DynTime compatibility patch applied; the original ComfyUI files were backed up'
      : 'DynTime compatibility patch is already installed', {
      completed, total, component: id, backupDir: patchResult.backupDir || '',
    });
  }
  pythonPackageIds = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].pythonPackages || []))];
  for (const id of pythonPackageIds) {
    throwIfCancelled(options.signal);
    try {
      if (id !== 'sageattention') throw new Error(`Unknown reviewed Python dependency: ${id}`);
      await installSageAttention(runtime, (phase, message, detail) => report(
        phase,
        message,
        Object.assign({ completed, total, component: id }, detail || {})
      ), Object.assign({}, options, { status }));
      completed += 1;
      report('python-package-ready', 'SageAttention is ready', { completed, total, component: id });
    } catch (error) {
      if (options.signal?.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') throw error;
      const componentIds = readyComponents.filter((componentId) => (
        COMPONENTS[componentId].pythonPackages || []
      ).includes(id));
      const failure = {
        nodeId: id,
        componentIds,
        code: error?.code || 'dependency_python_package_failed',
        message: String(error?.message || error),
        failedNode: id,
      };
      failures.push(failure);
      componentIds.forEach((componentId) => blockedComponents.add(componentId));
      report('python-package-failed', 'SageAttention needs attention; continuing with unrelated workflows', {
        completed,
        total,
        component: id,
        failure,
      });
    }
  }
  readyComponents = selected.filter((componentId) => !blockedComponents.has(componentId));
  modelGroups = [...new Set(readyComponents.flatMap((componentId) => COMPONENTS[componentId].models || []))];
  if (readyComponents.includes('h3dyntime')) {
    const selectedReferenceVariant = h3ReferenceVariant(settings);
    modelGroups.push(selectedReferenceVariant.id === 'dyntime-hq' ? 'h3DynTimeRefHq' : 'h3DynTimeRef');
  }
  modelPlan = dependencyModelPlan(modelGroups, settings, options);
  ({ assets, effectiveSettings } = modelPlan);
  total = completed + assets.length;
  if (failures.length) report('continuing', 'Installing models for workflows that passed dependency checks', {
    completed,
    total,
    failures,
  });
  for (const asset of assets) {
    throwIfCancelled(options.signal);
    await downloadAsset(
      asset,
      modelsPath,
      effectiveSettings,
      (phase, message, detail) => report(phase, message, Object.assign({ completed, total, component: asset[0] }, detail || {})),
      Object.assign({}, options, { uvExecutable })
    );
    completed += 1;
    report('model-ready', `${asset[0]} is ready`, { completed, total, component: asset[0] });
  }
  if (readyNodeIds.length) {
    report('checking-environment', 'Checking the ComfyUI Python environment for dependency conflicts', { completed, total });
    await checkPythonEnvironment(status, (phase, message, detail) => report(phase, message, Object.assign({ completed, total }, detail || {})), options);
  }
  throwIfCancelled(options.signal);
  report(failures.length ? 'partial-complete' : 'restart-needed', failures.length
    ? 'Compatible dependencies are installed. Review the blocked workflows, then restart ComfyUI and run Check again.'
    : 'Dependencies are installed. Restart ComfyUI, then run Check again.', { completed, total, failures });
  return {
    restartRequired: completed > 0,
    completed,
    total,
    components: readyComponents,
    requestedComponents: selected,
    failures,
    environmentSnapshot,
    modelVariants: {
      krea2: modelPlan.krea2Variant,
      h3Frame: h3FrameVariant(settings).id,
      h3Reference: h3ReferenceVariant(settings).id,
    },
    settingUpdates: modelPlan.settingUpdates,
  };
}

module.exports = {
  COMPONENTS,
  MODEL_ASSETS,
  NODE_PACKS,
  availableComponents,
  checkPythonEnvironment,
  cleanRelative,
  dependencyCancelledError,
  dependencyModelPlan,
  downloadAsset,
  ensureDownloadDiskSpace,
  findExistingModelByBasename,
  filterProtectedRuntimeRequirements,
  filterRequirementsForEnvironment,
  huggingFaceEndpointUrl,
  huggingFaceAccessUrl,
  ensureUv,
  inspectPinnedNodeRevisions,
  inspectNodePackSource,
  installNodeRequirements,
  nodePackHasSignatures,
  patchLtxVideoKornia,
  patchBfsOptionalAudio,
  protectedRuntimeConstraints,
  installNodePack,
  installComponents,
  looksLikeCustomNodeFolder,
  modelIsRegistered,
  normalizeHuggingFaceEndpoint,
  normalizeModelName,
  requirementsArgs,
  requirementFallbackReason,
  safeNodeRequirementsFile,
  sameRepo,
  snapshotPythonEnvironment,
  validateModelFile,
  uvRequirementsArgs,
};
