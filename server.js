#!/usr/bin/env node
/*
 * Mix Studio - mobile-first ComfyUI generation app
 * Zero-dependency Node server (Node >= 20 recommended, >= 22 for live progress).
 * Serves a mobile-first web app; ComfyUI does the heavy lifting.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { gitCommand, readAppRelease, updateFromGit } = require('./lib/app-update');
const {
  inspectCriticalPublicAssets,
  isCriticalPublicAsset,
  isUsableCriticalPublicAsset,
  loadCriticalPublicAssetCache,
} = require('./lib/app-assets');
const { createGithubReleaseChecker } = require('./lib/github-releases');
const { resolveRuntimeConfig, publicAnalyticsConfig } = require('./lib/runtime-config');
const { sam3InstallStatus } = require('./lib/sam3-installer');
const { probeSageAttention } = require('./lib/sage-attention');
const { h3PerformanceReport } = require('./lib/h3-performance');
const {
  krea2ClipCompatibility,
  krea2ClipCompatibilityError,
  ltx25Compatibility,
  ltx25CompatibilityError,
  minimaxH3Compatibility,
  minimaxH3CompatibilityError,
  minimaxH3NativeAudioSampling,
  nativeInt8Compatibility,
  nativeInt8CompatibilityError,
  objectInfoComboChoices,
} = require('./lib/comfy-compatibility');
const {
  COMPONENTS: DEPENDENCY_COMPONENTS,
  NODE_PACKS: DEPENDENCY_NODE_PACKS,
  availableComponents,
  inspectPinnedNodeRevisions,
  installComponents,
  MODEL_ASSETS: DEPENDENCY_MODEL_ASSETS,
  normalizeHuggingFaceEndpoint,
} = require('./lib/dependency-installer');
const {
  activeH3ModelSettingKeys,
  h3EffectiveModelName,
  h3FrameVariant,
  h3LoraCompatibility,
  h3ReferenceVariant,
  h3TurboCompatibility,
  h3VariantSettingDefaults,
  normalizeH3FrameVariant,
  normalizeH3ReferenceVariant,
} = require('./lib/h3-model-variants');
const {
  H3_TURBO_LORAS,
  h3TurboDefaultSteps,
  h3TurboFixedCanvas,
  h3TurboPreset,
  h3TurboReferenceIsExperimental,
  h3TurboSigmaShifts,
  h3TurboUsesStandardLoader,
} = require('./lib/h3-turbo-presets');
const { dynTimePatchStatus, restoreDynTimePatch } = require('./lib/h3-dyntime-patch');
const {
  deleteManagedModelCandidate,
  managedModelCleanupCandidates,
} = require('./lib/model-cleanup');
const { discoverModels } = require('./installer/model-discovery');
const { restartComfy, restartStatus, startComfy, startStatus } = require('./lib/comfy-restart');
const { discoverComfyEndpoints, probeComfyUrl } = require('./lib/comfy-discovery');
const {
  normalizeGenerationDefaults,
  normalizeAssetPickerPreferences,
  normalizeContextOverrides,
  mergeContextOverrides,
} = require('./lib/user-preferences');
const {
  EDIT_FEATURES,
  VIDEO_FEATURES,
  DEFAULT_FEATURES,
  normalizeFeatures,
} = require('./lib/features');
const {
  DEFAULT_PRIVATE_PASSWORD,
  galleryPassword,
  galleryView,
  setFolderLocked,
  canMoveToFolder,
  parseCookies,
} = require('./lib/private-gallery');
const { comfyResetRequests } = require('./lib/comfy-reset');
const {
  assessQueueHealth,
  parseNvidiaSmiCsv,
  parseRocmSmiUseJson,
} = require('./lib/queue-health');
const { classifyLora } = require('./lib/lora-compat');
const { buildLoraContext } = require('./lib/lora-context');
const {
  DEFAULT_SEEDVR2_DIT,
  normalizeSeedVr2Defaults,
  seedVr2AttentionForVendor,
  installedSeedVr2Models,
  seedVr2Profile,
  targetResolutionForUpscale,
  rtxVideoSuperResolutionNode,
  seedVr2UpscaleNodes,
  ULTIMATE_SD_UPSCALE_MODEL,
  buildUltimateSdUpscaleGraph,
} = require('./lib/upscale-workflows');
const {
  LTX25_FPS,
  buildLtx25Graph,
  ltx25Dimensions,
  ltx25DurationSeconds,
  ltx25FramesForSeconds,
} = require('./lib/ltx25-workflow');
const { IMAGE_RECREATION_INSTRUCTION, imagePromptRevisionParts } = require('./lib/image-prompt');
const {
  ENHANCE_TAIL,
  cleanGeneratedPrompt,
  h3PromptEnhanceParts,
  motionPromptEnhanceParts,
  promptEnhanceParts,
  regionPromptEnhanceParts,
  videoPromptEnhanceParts,
  videoPromptRevisionParts,
} = require('./lib/prompt-enhance');
const {
  appendH3ValidationFeedback,
  h3PromptReferenceTokens,
  validatedH3Prompt,
} = require('./lib/h3-prompt-validation');
const {
  DEFAULTS: EXTERNAL_LLM_DEFAULTS,
  externalLlmEnabled,
  externalLlmProviderConfig,
  externalLlmRequest,
  externalLlmStructuredRequest,
  normalizeExternalLlmSettings,
  normalizeOllamaUrl,
  parseStructuredText,
} = require('./lib/external-llm');
const {
  SMART_LOCAL_PLAN_SCHEMA,
  SMART_PLAN_SCHEMA,
  compileSmartSteps,
  normalizeSmartPlan,
  normalizeSmartReferences,
  reconcileSmartPlanReferences,
  smartPlanAudit,
  smartPlanHash,
  smartPlanningPrompt,
} = require('./lib/smart-mode');
const {
  localPromptAiCatalog,
  localPromptAiConfig,
  normalizeLocalPromptAiSettings,
  smartPlannerPromptAiConfig,
} = require('./lib/local-prompt-ai');
const { combineNegativePrompts, normalizeNegativePrompt } = require('./lib/negative-prompt');
const {
  buildDepthMapNodes,
  buildDepthPreviewGraph,
  buildKrea2DepthControl,
  buildKrea2LatentInput,
  buildKrea2StyleReference,
} = require('./lib/krea2-workflows');
const {
  buildKrea2OutpaintGraph,
  calculateNativeOutpaintPlan,
  calculateOutpaintLayout,
  normalizeOutpaintDimensions,
  normalizeOutpaintPosition,
} = require('./lib/krea2-outpaint');
const {
  buildKrea2IdentityEditGraph,
  normalizeIdentityEditDimensions,
} = require('./lib/krea2-identity-edit');
const {
  buildKleinOutpaintGraph,
  buildQwenOutpaintGraph,
  buildKrea2MaskedOutpaintGraph,
} = require('./lib/edit-outpaint-workflows');
const { detectAudioStream, detectAudioStreamFile } = require('./lib/media-inspection');
const {
  MAX_INPUT_BYTES,
  inputAssetPath,
  receiveInputFile,
  multipartFileUpload,
} = require('./lib/input-assets');
const {
  uploadedAssetKind,
  uploadedAssetUsage,
  publicUploadedAsset,
} = require('./lib/uploaded-assets');
const { normalizeEditSequence, supportsSequentialEdit } = require('./lib/edit-sequence');
const { normalizeQwenEditQuality, qwenEditPreset } = require('./lib/qwen-edit');
const { normalizeEditAngle, supportsEditAngles, editAnglePrompt } = require('./lib/edit-angle');
const {
  cameraMotionById,
  cameraMotionPhrase,
  ensureCameraMotionPrompt,
  normalizeCameraMotions,
  stripCameraMotionPhrase,
} = require('./public/camera-motion');
const {
  appendEditMaskNodes,
  appendEditMaskComposite,
  buildSam3MaskGraph,
  SAM3_MASK_CLASSES,
  supportsEditMask,
  localizedEditPrompt,
  maskExpand,
  maskInfluence,
  maskInfluenceDenoise,
} = require('./lib/edit-mask');
const {
  H3_FPS,
  H3_LONG_CONTEXT_MAX_SECONDS,
  H3_MIN_SECONDS,
  H3_TURBO_REFERENCE_CHUNK_FRAMES,
  LTX_MAX_SECONDS,
  LTX_CAMERA_FPS,
  LTX_CAMERA_MAX_SECONDS,
  buildMiniMaxH3Graph,
  h3Dimensions,
  h3DurationSeconds,
  h3EffectiveDurationSeconds,
  h3FramesForSeconds,
  h3LongContextSegments,
  h3LongContextSegmentPrompt,
  h3TurboReferenceSegments,
  ltxCameraDurationSeconds,
  ltxDurationSeconds,
  ltxFramesForSeconds,
  normalizeH3References,
  scailMode,
  normalizeScailChunkOptions,
  normalizeScailFps,
  scailDurationSeconds,
  scailFramesForSeconds,
  scailInfinityMaskArgs,
  scailInfinitySamTrackArgs,
  scailMaskArgs,
  scailSegments,
  scailSamTrackArgs,
  videoProcessInfo,
} = require('./lib/video-workflows');
const {
  WAN_ANIMATE_2_STEPS,
  buildWanAnimate2Graph,
  wanAnimate2ContinuationPlan,
  wanAnimate2Dimensions,
} = require('./lib/wan-animate2-workflow');
const {
  normalizeDirectorExtensionPlan,
  resolveDurableUploadedVideo,
  videoExtensionInfo,
} = require('./lib/video-extension');
const {
  joinVideoChunks,
  joinVideoExtension,
  joinWanAnimate2Chunks,
  normalizeVideoPreviewOptions,
  prepareWanAnimate2Performance,
  probeVideoFile,
  resolveFfmpegExecutable,
  transcodeVideoFileToMp4,
  transcodeVideoPreview,
} = require('./lib/video-extension-join');
const {
  DIRECTOR_FPS,
  buildLtxDirectorGraph,
  directorAssetNames,
  directorOutputFrames,
  normalizeDirectorAssetName,
  normalizeDirectorProject,
} = require('./lib/ltx-director-workflows');
const {
  buildRegionalT2IGraph,
  buildKrea2InpaintGraph,
  hasActiveRegions,
  normalizeRegions,
} = require('./lib/regional-workflows');
const {
  nodeLabelForJob,
  progressDetailsForJob,
  progressPhaseForJob,
} = require('./lib/progress-labels');
const { decodePreviewPayload } = require('./lib/preview-payload');
const { selectionAssetRefs, selectionSummary } = require('./lib/selection-summary');
const {
  emptyTrashDirectory,
  moveAssetRefsToTrash,
  trashDirectorySummary,
  unreferencedAssetRefs,
} = require('./lib/deleted-media');
const { applyProfileOutputPrefix, profileOutputFolder } = require('./lib/output-prefix');
const { expandGalleryGroupSelection } = require('./lib/gallery-grouping');
const { updateGalleryGroupName } = require('./lib/gallery-group-names');
const {
  buildStrengthHuntPlan,
  buildStrengthHuntSheet,
  huntLoras,
  mergeStrengthHuntGraphs,
} = require('./lib/strength-hunt');
const { streamStoredZip } = require('./lib/zip-stream');
const {
  enableTailscaleHttps,
  mobileAccessAddresses,
  mobileAccessSummary,
  tailscaleHttpsStatus,
} = require('./lib/mobile-access');
const {
  disableSparkFunnel,
  enableSparkFunnel,
  newSparkAccessToken,
  normalizeSparkAccess,
  sparkFunnelStatus,
} = require('./lib/spark-access');
const { SUPPORTED_PROTOCOL_VERSIONS, handleMcpPayload, mcpToolDefinitions } = require('./lib/spark-mcp');
const { hardwareInfo } = require('./lib/hardware-info');
const { isWidgetSpec } = require('./lib/comfy-widget-spec');
const { browseGenerationFolder } = require('./lib/folder-picker');
const {
  appleGenerationProfile,
  configuredVideoEngineCapability,
  configuredVideoEngineCapabilities,
  dependencyComponentBlock,
  ltxRefinePreflight,
} = require('./lib/generation-capabilities');
const {
  buildKrea2ModelLoader,
  effectiveKrea2Variant,
  krea2VariantSettings,
  normalizeKrea2Variant,
  recommendedKrea2Variant,
} = require('./lib/krea2-model');
const {
  diffusionModelInput,
  diffusionModelLoader,
  modelChoice,
  normalizeModelPath,
  registeredModelNames,
  resolveRegisteredModelName,
  resolveRegisteredModelSetting,
} = require('./lib/model-loader');
const {
  applyLowVramImageLimits,
  normalizeVramProfile,
  recommendedVramProfile,
  resolveVramProfile,
} = require('./lib/vram-profile');
const {
  QUICK_SETUP_COMPONENTS,
  combinedHardwareFit,
  componentHardwareGuidance,
  recommendedQuickSetup,
  portableSetupConfig,
  setupHardwareProfile,
  writePortableSetupConfig,
} = require('./lib/setup-guide');
const {
  normalizeExportDirectory,
  validateExportDirectory,
  copyToExportDirectory,
} = require('./lib/export-location');
const {
  normalizeGenerationName,
  generationFileStem,
  smartGenerationName,
  smartAssetFilename,
} = require('./lib/generation-name');
const {
  PROFILE_COOKIE,
  hashPin,
  verifyPin,
  signProfileId,
  parseProfileToken,
  publicProfile,
  defaultOpenProfile,
  adoptOrphans,
  hasOrphans,
  isLoopbackAddress,
  createLoginThrottle,
} = require('./lib/profiles');
const {
  MAX_PROMPT_PACK_BYTES,
  comparePackVersions,
  inspectPromptPackBuffer,
  installPromptPack,
  listInstalledPromptPacks,
  promptPackInspectionSummary,
  publicPromptPack,
  readInstalledPromptPack,
  removePromptPack,
  setPromptPackEnabled,
} = require('./lib/prompt-packs');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const CRITICAL_PUBLIC_STARTUP_CACHE = loadCriticalPublicAssetCache(ROOT);
const CRITICAL_PUBLIC_GIT_CACHE = new Map();
const officialReleaseChecker = createGithubReleaseChecker();
const SETUP_FEATURE_MANIFEST = loadJson(path.join(ROOT, 'installer', 'feature-manifest.json'), { features: [] });
let RUNTIME = resolveRuntimeConfig(ROOT);
let videoExtensionFfmpeg = '';
const DATA = RUNTIME.dataDir;
const IMAGES = path.join(DATA, 'images');
const VIDEOS = path.join(DATA, 'videos');
const VIDEO_PREVIEWS = path.join(DATA, 'video-previews');
const INPUTS = path.join(DATA, 'inputs');
const TRASH_ROOT = path.join(DATA, 'trash');
const PROMPT_PACKS = path.join(DATA, 'addons', 'prompt-packs');
const PORT = Number(process.env.PORT || 3300);
const MAX_DOCUMENTATION_VIDEO_BYTES = 256 * 1024 * 1024;

fs.mkdirSync(IMAGES, { recursive: true });
fs.mkdirSync(VIDEOS, { recursive: true });
fs.mkdirSync(VIDEO_PREVIEWS, { recursive: true });
fs.mkdirSync(INPUTS, { recursive: true });
fs.mkdirSync(TRASH_ROOT, { recursive: true });
fs.mkdirSync(PROMPT_PACKS, { recursive: true });
const FACES = path.join(DATA, 'faces');
fs.mkdirSync(FACES, { recursive: true });
const AVATARS = path.join(DATA, 'avatars');
fs.mkdirSync(AVATARS, { recursive: true });
const LORATHUMBS = path.join(DATA, 'lorathumbs');
fs.mkdirSync(LORATHUMBS, { recursive: true });

const PROMPT_PACK_INSPECTION_TTL = 15 * 60 * 1000;
const MAX_PROMPT_PACK_INSPECTIONS = 5;
const promptPackInspections = new Map();
let promptPackMutation = Promise.resolve();

function prunePromptPackInspections(now = Date.now()) {
  for (const [id, entry] of promptPackInspections) {
    if (now - entry.createdAt > PROMPT_PACK_INSPECTION_TTL) promptPackInspections.delete(id);
  }
  while (promptPackInspections.size >= MAX_PROMPT_PACK_INSPECTIONS) {
    promptPackInspections.delete(promptPackInspections.keys().next().value);
  }
}

function serializePromptPackMutation(task) {
  const next = promptPackMutation.then(task, task);
  promptPackMutation = next.catch(() => {});
  return next;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const SETTINGS_FILE = path.join(DATA, 'settings.json');
const SPARK_ACCESS_FILE = path.join(DATA, 'spark_access.json');
const SETTINGS_SCHEMA_VERSION = 3;
const DEFAULT_H3_TURBO_LORA = H3_TURBO_LORAS.framesRecommended;
const DEFAULT_SYSTEM_PROMPT = `You are an expert prompt engineer for text-to-image models. Your task is to expand the user's prompt into a highly effective image-generation prompt.

Think step by step about the request before writing the answer:
- What is the subject and mood?
- What visual styles, mediums, and lighting options would fit? Consider two or three alternatives and pick the one that best serves the caption.
- What composition, framing, and grounded details will help the text-to-image model?

Then output a single expanded prompt paragraph.

Follow these rules strictly:
1. **Faithfulness First:** When the user supplies a concrete scene, preserve all original subjects, actions, colors, and spatial relationships. When the user instead supplies an abstract concept or asks you to invent an image, creatively resolve it into one specific visual scene and add the details needed to express that idea.
2. **Practical T2I Structure:** Write a prompt that a text-to-image model can parse cleanly. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout.
3. **Style Planning Stays Internal:** Use your internal reasoning to choose style, medium, framing, and lighting. Do not emit planning tags or wrappers in the visible answer body.
4. **Text Rendering:** If the user requests visible text, quotes, labels, or typography, specify the exact text clearly and wrap requested words in quotes.
5. **Avoid Over-Specification:** Do not invent highly specific clothing, colors, materials, or scene details unless the input supports them.
6. **Structure:** Write one cohesive paragraph after the thinking block. No bullets, JSON, or markdown.
7. **Respect Existing Detail:** If the user's prompt is already detailed, lightly polish and finalize rather than heavily expanding - preserve their phrasing and direction.
8. **Respect the Human Form:** Treat depictions of people with dignity. Assume clothing covers genitals and intimate anatomy.
9. **Preserve User Medium:** When the user explicitly requests a medium (e.g. "photo of", "photograph of", "illustration of", "painting of", "sketch of", "3D render of"), honor it. Do not pivot to a different medium to avoid difficulty - match the user's stated intent.

User's Input:`;

const DEFAULT_SETTINGS = {
  settingsSchemaVersion: SETTINGS_SCHEMA_VERSION,
  comfyUrl: RUNTIME.comfy.url || 'http://127.0.0.1:8188',
  hfToken: '',
  hfEndpoint: '',
  unet: 'krea2_turbo_fp8_scaled.safetensors',
  krea2RawUnet: 'krea2_raw_fp8_scaled.safetensors',
  krea2ModelVariant: 'fp8',
  vramProfile: 'auto',
  krea2TurboLora: 'krea2_turbo_lora_rank_64_bf16.safetensors',
  krea2DepthLora: 'depth-control-lora.safetensors',
  krea2OutpaintLora: 'krea2_identity_edit_v1_2.safetensors',
  depthAnythingV3Model: 'da3_large.safetensors',
  clip: 'Huihui-Qwen3-VL-4B-Instruct-abliterated-fp8_scaled.safetensors',
  clipType: 'krea2',
  vae: 'qwen_image_vae.safetensors',
  seedvr2Dit: DEFAULT_SEEDVR2_DIT,
  seedvr2Vae: 'ema_vae_fp16.safetensors',
  seedvr2Attention: 'sdpa',
  kleinUnet: 'flux-2-klein-4b-fp8.safetensors',
  kleinClip: 'qwen_3_4b.safetensors',
  klein4Unet: 'flux-2-klein-4b-fp8.safetensors',
  klein4Clip: 'qwen_3_4b.safetensors',
  klein4ConsistencyLora: 'f2k_4B_consist_20260314.safetensors',
  klein4ConsistencyTrigger: 'transform the image to realistic photograph. add realistic details to the corrupted image. restore high frequence details from the corrupted image.',
  klein9Unet: 'flux-2-klein-9b-fp8.safetensors',
  klein9Clip: 'qwen_3_8b_fp8mixed.safetensors',
  klein9ConsistencyLora: 'f2k_9B_lcs_consist_20260415.safetensors',
  klein9ConsistencyTrigger: 'restore image details',
  kleinVae: 'flux2-vae.safetensors',
  qwenEditUnet: 'qwen_image_edit_2511_bf16.safetensors',
  qwenEditClip: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
  qwenEditLora: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
  qwenEditAnglesLora: 'qwen_image_edit_2511_multiple-angles-lora.safetensors',
  ltxCkpt: 'ltx-2.3-22b-dev-fp8.safetensors',
  ltxDistilledLora: 'ltx-2.3-22b-distilled-lora-384.safetensors',
  ltxCameramanLora: 'LTX2.3-22B_IC-LoRA-Cameraman_v2_14000.safetensors',
  ltxEditLora: 'edit_anything_v1.1_r256.safetensors',
  ltxDirectorIcLora: 'ltx-2.3-22b-ic-lora-ingredients-0.9.safetensors',
  ltxTextEncoder: 'gemma_3_12B_it_fp4_mixed.safetensors',
  ltxGemmaLora: 'gemma-3-12b-it-abliterated_lora_rank64_bf16.safetensors',
  ltxUpscaler: 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors',
  ltx25Unet: 'ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors',
  ltx25TextEncoder: 'gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors',
  ltx25QualityUnet: 'ltx-2.5-22b-dev-transformer-bf16.safetensors',
  ltx25QualityTextEncoder: 'gemma4-12b-with-proj-ltx-2.5-bf16.safetensors',
  ltx25DistilledLora: 'ltx-2.5-22b-distilled-lora-450-bf16.safetensors',
  ltx25PromptEnhancer: 'gemma4_e2b_it_bf16.safetensors',
  ltx25VideoVae: 'ltx-2.5-video-vae-bf16.safetensors',
  ltx25AudioVae: 'ltx-2.5-audio-vae-bf16.safetensors',
  ltx25Upscaler: 'ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors',
  h3Unet: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
  h3RefUnet: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
  h3Clip: 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors',
  h3VideoVae: 'minimax_h3_video_vae_fp16.safetensors',
  h3AudioVae: 'minimax_h3_audio_vae_fp32.safetensors',
  h3TurboLora: DEFAULT_H3_TURBO_LORA,
  h3RefTurboLora: H3_TURBO_LORAS.referenceRecommended,
  ...h3VariantSettingDefaults(),
  wanHighUnet: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
  wanLowUnet: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
  wanClip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  wanVae: 'wan_2.1_vae.safetensors',
  wanHighLora: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
  wanLowLora: 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
  erosCkpt: '10Eros_v1.2_fp8mixed_learned.safetensors',
  erosTextEncoder: 'gemma_3_12B_it_heretic_fp8_e4m3fn.safetensors',
  erosDmdLora: 'LTX2.3_DMD_reshaped_r256.safetensors',
  erosSigmasFirst: '',
  erosSigmasUpscale: '',
  ltxFaceIdLora: 'Best_FaceID_v1.0_LoRA.safetensors',
  ltxFaceIdDistilledLora: 'ltx-2.3-22b-distilled-1.1_lora-dynamic_fro09_avg_rank_111_bf16.safetensors',
  scailUnet: 'wan2.1_14B_SCAIL_2_fp8_scaled.safetensors',
  scailLora: 'Wan2.1\\Wan21_I2V_14B_lightx2v_cfg_step_distill_lora_rank64.safetensors',
  scailPusaLora: 'Pusa\\Wan21_PusaV1_LoRA_14B_rank512_bf16.safetensors',
  scailClipVision: 'clip_vision_h.safetensors',
  scailSam: 'sam3.1_multiplex_fp16.safetensors',
  wanAnimate2Unet: 'wan_animate_2_int8_convrot.safetensors',
  wanAnimate2Lora: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
  wanAnimate2Clip: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  wanAnimate2ClipVision: 'clip_vision_h.safetensors',
  wanAnimate2Vae: 'Wan2_1_VAE_bf16.safetensors',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  externalLlmProvider: EXTERNAL_LLM_DEFAULTS.externalLlmProvider,
  externalLlmLocalProvider: EXTERNAL_LLM_DEFAULTS.externalLlmLocalProvider,
  externalLlmExternalProvider: EXTERNAL_LLM_DEFAULTS.externalLlmExternalProvider,
  externalLlmOpenAiApiKey: '',
  externalLlmOpenAiModel: EXTERNAL_LLM_DEFAULTS.externalLlmOpenAiModel,
  externalLlmGeminiApiKey: '',
  externalLlmGeminiModel: EXTERNAL_LLM_DEFAULTS.externalLlmGeminiModel,
  externalLlmOllamaUrl: EXTERNAL_LLM_DEFAULTS.externalLlmOllamaUrl,
  externalLlmOllamaModel: EXTERNAL_LLM_DEFAULTS.externalLlmOllamaModel,
  externalLlmImageRevise: true,
  externalLlmImageEnhance: true,
  externalLlmVideoRevise: true,
  externalLlmVideoEnhance: true,
  localPromptAiClip: '',
  localPromptAiClipType: 'krea2',
  smartPlannerModelOverride: false,
  smartPlannerClip: '',
  smartPlannerClipType: 'krea2',
  galleryPassword: DEFAULT_PRIVATE_PASSWORD,
  exportDir: '',
  smartFilenames: true,
  // Existing installs default every optional workflow on. The installer writes
  // explicit choices only for a brand-new machine.
  features: DEFAULT_FEATURES,
};

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJsonSync(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function normalizeSettings(s) {
  s.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
  normalizeSeedVr2Defaults(s);
  s.krea2ModelVariant = normalizeKrea2Variant(s.krea2ModelVariant, s);
  s.vramProfile = normalizeVramProfile(s.vramProfile);
  s.h3FrameModelVariant = normalizeH3FrameVariant(s.h3FrameModelVariant);
  s.h3ReferenceModelVariant = normalizeH3ReferenceVariant(s.h3ReferenceModelVariant);
  s.h3TurboLora = String(s.h3TurboLora || '').trim() || DEFAULT_H3_TURBO_LORA;
  s.h3RefTurboLora = String(s.h3RefTurboLora || '').trim() || H3_TURBO_LORAS.referenceRecommended;
  s.hfEndpoint = normalizeHuggingFaceEndpoint(s.hfEndpoint);
  if (!s.klein4Unet) s.klein4Unet = s.kleinUnet || DEFAULT_SETTINGS.klein4Unet;
  if (!s.klein4Clip) s.klein4Clip = s.kleinClip || DEFAULT_SETTINGS.klein4Clip;
  if (!s.klein9Unet) s.klein9Unet = DEFAULT_SETTINGS.klein9Unet;
  if (!s.klein9Clip) s.klein9Clip = DEFAULT_SETTINGS.klein9Clip;
  if (!s.kleinUnet) s.kleinUnet = s.klein4Unet;
  if (!s.kleinClip) s.kleinClip = s.klein4Clip;
  if (/^krea2_identity_edit_v1(?:_1)?(?:_r(?:64|128))?\.safetensors$/i.test(String(s.krea2OutpaintLora || ''))) {
    s.krea2OutpaintLora = DEFAULT_SETTINGS.krea2OutpaintLora;
  }
  s.galleryPassword = galleryPassword(s);
  try { s.exportDir = normalizeExportDirectory(s.exportDir); } catch { s.exportDir = ''; }
  s.smartFilenames = s.smartFilenames !== false;
  Object.assign(s, normalizeExternalLlmSettings(s));
  Object.assign(s, normalizeLocalPromptAiSettings(s));
  s.features = normalizeFeatures(s.features);
  return s;
}

function migrateStoredSettings(value) {
  const stored = value && typeof value === 'object' ? Object.assign({}, value) : {};
  const version = Math.max(0, Math.round(Number(stored.settingsSchemaVersion) || 0));
  const changed = version < SETTINGS_SCHEMA_VERSION;
  // Schema v3 makes the selected Turbo filename authoritative. In particular,
  // keep the original ckpt850 four-step adapter when an existing install or a
  // user explicitly selects it; only brand-new settings inherit the v4 default.
  stored.settingsSchemaVersion = SETTINGS_SCHEMA_VERSION;
  return { stored, changed };
}

const storedSettingsMigration = migrateStoredSettings(loadJson(SETTINGS_FILE, {}));
let settings = normalizeSettings(Object.assign({}, DEFAULT_SETTINGS, storedSettingsMigration.stored));
if (storedSettingsMigration.changed && fs.existsSync(SETTINGS_FILE)) saveJsonSync(SETTINGS_FILE, settings);
let sparkAccess = normalizeSparkAccess(loadJson(SPARK_ACCESS_FILE, {}));
const APP_RESTART_SETTINGS_AT_BOOT = Object.freeze({ comfyUrl: settings.comfyUrl });

function saveSparkAccess() {
  saveJsonSync(SPARK_ACCESS_FILE, sparkAccess);
}

function settingsRequireAppRestart() {
  return settings.comfyUrl !== APP_RESTART_SETTINGS_AT_BOOT.comfyUrl;
}

function settingsResponse() {
  const response = Object.assign({}, settings, {
    hfTokenConfigured: !!String(settings.hfToken || process.env.HF_TOKEN || '').trim(),
    externalLlmOpenAiApiKeyConfigured: !!String(settings.externalLlmOpenAiApiKey || process.env.OPENAI_API_KEY || '').trim(),
    externalLlmGeminiApiKeyConfigured: !!String(settings.externalLlmGeminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
    externalLlmOpenAiApiKeyStored: !!String(settings.externalLlmOpenAiApiKey || '').trim(),
    externalLlmGeminiApiKeyStored: !!String(settings.externalLlmGeminiApiKey || '').trim(),
    appRestartRequired: settingsRequireAppRestart(),
    gpuVendor: setupHardwareProfile(setupHardwareSnapshot || {}).gpuVendor || '',
  });
  delete response.hfToken;
  delete response.externalLlmOpenAiApiKey;
  delete response.externalLlmGeminiApiKey;
  return response;
}

function configuredModelsRoot() {
  const install = sam3InstallStatus(RUNTIME);
  return String(RUNTIME.comfy.modelsPath || (install.basePath ? path.join(install.basePath, 'models') : '')).trim();
}

function publicModelCleanupCandidate(candidate) {
  return {
    id: candidate.id,
    settingKey: candidate.settingKey,
    filename: candidate.filename,
    folder: candidate.folder,
    bytes: candidate.bytes,
    modifiedAt: candidate.modifiedAt,
  };
}

function adoptDeviceCompatibleModelSettings(hardwareProfile = {}) {
  let changed = false;
  if (appleGenerationProfile(hardwareProfile)) {
    const configured = normalizeModelPath(settings.ltxCkpt).split('/').pop();
    if (!configured || configured === 'ltx-2.3-22b-dev-fp8.safetensors') {
      settings.ltxCkpt = 'ltx-2.3-22b-dev.safetensors';
      changed = true;
    }
  }
  const safeAttention = seedVr2AttentionForVendor(settings.seedvr2Attention, hardwareProfile.gpuVendor);
  if (safeAttention !== settings.seedvr2Attention) {
    settings.seedvr2Attention = safeAttention;
    changed = true;
  }
  if (changed) saveJsonSync(SETTINGS_FILE, settings);
  return changed;
}

function seedVr2ModelDirs() {
  const roots = [
    process.env.KREASTUDIO_SEEDVR2_DIR,
    process.env.COMFYUI_SEEDVR2_DIR,
  ];
  const modelRoot = process.env.COMFYUI_MODEL_ROOT || RUNTIME.comfy.modelsPath;
  if (modelRoot) {
    roots.push(path.join(modelRoot, 'SEEDVR2'), path.join(modelRoot, 'seedvr2'));
  }
  if (RUNTIME.comfy.path) {
    roots.push(
      path.join(RUNTIME.comfy.path, 'models', 'SEEDVR2'),
      path.join(RUNTIME.comfy.path, 'models', 'seedvr2')
    );
  }
  const home = os.homedir();
  roots.push(
    path.join(home, 'Documents', 'ComfyUI', 'models', 'SEEDVR2'),
    path.join(home, 'Documents', 'ComfyUI', 'models', 'seedvr2')
  );
  return [...new Set(roots.filter(Boolean))];
}

/* ------------------------------------------------------------------ */
/* Gallery DB                                                          */
/* ------------------------------------------------------------------ */

const DB_FILE = path.join(DATA, 'db.json');
let db = loadJson(DB_FILE, { folders: [], items: [] });
let dbSaveTimer = null;
let dbRevision = 1;
let mediaDeletionQueue = Promise.resolve();
function saveDb() {
  dbRevision += 1;
  clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => saveJsonSync(DB_FILE, db), 150);
}
function uid() { return crypto.randomBytes(8).toString('hex'); }

function serializeMediaDeletion(task) {
  const run = mediaDeletionQueue.then(task, task);
  mediaDeletionQueue = run.then(() => undefined, () => undefined);
  return run;
}

const PRIVATE_COOKIE = 'ks_private';
const privateUnlockToken = crypto.randomBytes(18).toString('hex');

function isPrivateUnlocked(req) {
  return parseCookies(req.headers.cookie || '')[PRIVATE_COOKIE] === privateUnlockToken;
}

function privateCookie(value, maxAge) {
  const encoded = encodeURIComponent(value || '');
  return `${PRIVATE_COOKIE}=${encoded}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Video track dimensions from an MP4 buffer (tkhd box). Needed to build
 *  even-dimension composites — libx264 refuses odd widths/heights. */
function mp4Dims(buf) {
  for (let i = 4; i < buf.length - 100; i++) {
    if (buf[i] === 0x74 && buf[i + 1] === 0x6b && buf[i + 2] === 0x68 && buf[i + 3] === 0x64) { // 'tkhd'
      const size = buf.readUInt32BE(i - 4);
      const ver = buf[i + 4];
      if (!((ver === 0 && size === 92) || (ver === 1 && size === 104))) continue;
      const wOff = (i - 4) + (ver === 1 ? 96 : 84);
      if (wOff + 8 > buf.length) continue;
      const w = buf.readUInt32BE(wOff) >>> 16;
      const h = buf.readUInt32BE(wOff + 4) >>> 16;
      if (w > 0 && h > 0 && w < 16384 && h < 16384) return { w, h }; // audio tracks report 0x0
    }
  }
  return null;
}

/** JPEG dimensions from SOF markers (phone photos arrive as JPEG). */
function jpegDims(buf) {
  if (!buf || buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let off = 2;
  while (off + 9 < buf.length) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) return null;
    off += 2 + len;
  }
  return null;
}

function imageDims(buf) {
  return pngDims(buf) || jpegDims(buf);
}

/** Actual pixel dimensions from a PNG buffer (IHDR). Edit pipelines snap
 *  output to their own resolution buckets, so recorded request dims can lie. */
function pngDims(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return w > 0 && h > 0 ? { w, h } : null;
}

// Migrate legacy single-video items to the videos[] array
{
  let migrated = false;
  if (!Array.isArray(db.folders)) db.folders = [];
  if (!Array.isArray(db.items)) db.items = [];
  for (const f of db.folders) f.locked = !!f.locked;
  for (const it of db.items) {
    if (it.video) {
      it.videos = (Array.isArray(it.videos) ? it.videos : []).concat([
        { id: uid(), file: it.video, createdAt: it.createdAt || Date.now(), info: it.videoInfo || {} },
      ]);
      delete it.video;
      delete it.videoInfo;
      migrated = true;
    }
    if (!Array.isArray(it.videos)) it.videos = [];
  }
  if (migrated) saveJsonSync(DB_FILE, db);
}
if (!Array.isArray(db.history)) db.history = [];
if (!Array.isArray(db.loraPresets)) db.loraPresets = [];
if (!Array.isArray(db.userPreferences)) db.userPreferences = [];
if (!Array.isArray(db.faces)) db.faces = [];
if (!Array.isArray(db.uploadedAssets)) db.uploadedAssets = [];
if (!Array.isArray(db.smartRuns)) db.smartRuns = [];
for (const run of db.smartRuns) {
  if (!run || !['running', 'queueing'].includes(run.status)) continue;
  run.status = 'attention';
  run.error = 'Mix Studio restarted while this production was active. Review it, then retry the interrupted step.';
  run.updatedAt = Date.now();
  for (const step of run.steps || []) {
    if (['running', 'queueing'].includes(step.status)) step.status = 'attention';
  }
}

/* ---------------------- Profiles (accounts) ------------------------ */
// Signing secret persists so logins survive server restarts
const AUTH_SECRET_FILE = path.join(DATA, 'auth_secret.txt');
let AUTH_SECRET;
try {
  AUTH_SECRET = fs.readFileSync(AUTH_SECRET_FILE, 'utf8').trim();
  if (!AUTH_SECRET) throw new Error('empty');
} catch {
  AUTH_SECRET = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(AUTH_SECRET_FILE, AUTH_SECRET);
}
const profileLoginThrottle = createLoginThrottle();

function rotateAuthSecret() {
  AUTH_SECRET = crypto.randomBytes(24).toString('hex');
  fs.writeFileSync(AUTH_SECRET_FILE, AUTH_SECRET);
  // EventSource connections authenticate only during the initial request.
  // Close them when profile credentials change so a revoked browser cannot
  // keep receiving profile-scoped events with an old cookie.
  if (typeof sseClients !== 'undefined') {
    for (const res of sseClients.keys()) {
      try { res.end(); } catch { /* noop */ }
    }
    sseClients.clear();
  }
}
if (!db.loraThumbs || typeof db.loraThumbs !== 'object') db.loraThumbs = {};
if (!Array.isArray(db.profiles)) db.profiles = [];
{
  // A fresh install opens directly into one local owner workspace. The user
  // can rename it, add a PIN, or create more profiles later from the app.
  if (!db.profiles.length) {
    db.profiles.push({ id: uid(), name: 'Owner', pinHash: null, pinSalt: null, createdAt: Date.now() });
    console.log('[profiles] created default open profile "Owner"');
  }
  const adopted = db.profiles.length ? adoptOrphans(db, db.profiles[0].id) : 0;
  if (adopted) {
    console.log(`[profiles] assigned ${adopted} existing entr${adopted === 1 ? 'y' : 'ies'} to "${db.profiles[0].name}"`);
  }
  saveJsonSync(DB_FILE, db);
}

/* Rolling db backups: on boot and every 30 minutes, keep the last 40.
   (Added after the profile-deletion incident — never again.) */
const BACKUPS = path.join(DATA, 'backups');
fs.mkdirSync(BACKUPS, { recursive: true });
function backupDb(tag) {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DB_FILE, path.join(BACKUPS, `db-${stamp}${tag ? '-' + tag : ''}.json`));
    const all = fs.readdirSync(BACKUPS).filter((f) => f.startsWith('db-')).sort();
    while (all.length > 40) fs.unlinkSync(path.join(BACKUPS, all.shift()));
  } catch (e) { console.error('[backup]', e.message); }
}
backupDb('boot');
setInterval(() => backupDb(''), 30 * 60 * 1000);

function requestAddress(req) {
  return String(req?.socket?.remoteAddress || req?.connection?.remoteAddress || '');
}

function isLoopbackRequest(req) {
  return isLoopbackAddress(requestAddress(req));
}

function currentProfile(req) {
  const cookies = parseCookies(req.headers.cookie);
  const id = parseProfileToken(cookies[PROFILE_COOKIE], AUTH_SECRET);
  if (id) {
    return db.profiles.find((p) => p.id === id) || null;
  }
  const fallback = defaultOpenProfile(db);
  if (fallback && isLoopbackRequest(req)) {
    req.usedDefaultProfile = true;
    return fallback;
  }
  return null;
}

function profileCookie(token, maxAge) {
  return `${PROFILE_COOKIE}=${encodeURIComponent(token || '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

// One-time repair: recorded dims can differ from the actual file (edit
// pipelines snap to resolution buckets). Reads 24 bytes per image.
(async () => {
  let fixed = 0;
  for (const it of db.items) {
    if (!it.file) continue;
    try {
      const fh = await fsp.open(path.join(IMAGES, it.file), 'r');
      const b = Buffer.alloc(24);
      await fh.read(b, 0, 24, 0);
      await fh.close();
      const d = pngDims(b);
      if (d && (d.w !== it.width || d.h !== it.height)) {
        it.width = d.w;
        it.height = d.h;
        fixed++;
      }
    } catch { /* file missing; leave as-is */ }
  }
  if (fixed) {
    saveDb();
    console.log(`[dims] corrected stored dimensions on ${fixed} item(s)`);
  }
})();

function pushHistory(entry) {
  db.history.unshift(Object.assign({ ts: Date.now() }, entry));
  if (db.history.length > 50) db.history.length = 50;
  saveDb();
}

/* ------------------------------------------------------------------ */
/* SSE                                                                 */
/* ------------------------------------------------------------------ */

const sseClients = new Map();

function eventProfileId(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.profileId) return String(data.profileId);
  if (data.item?.profileId) return String(data.item.profileId);
  if (Array.isArray(data.items)) {
    const item = data.items.find((entry) => entry?.profileId);
    if (item) return String(item.profileId);
  }
  return '';
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const profileId = eventProfileId(data);
  for (const [res, clientProfileId] of sseClients) {
    if (profileId && profileId !== clientProfileId) continue;
    try { res.write(payload); } catch { /* noop */ }
  }
}

/* ------------------------------------------------------------------ */
/* ComfyUI bridge                                                      */
/* ------------------------------------------------------------------ */

const CLIENT_ID = 'kreastudio-' + crypto.randomBytes(6).toString('hex');
// A boot-scoped id lets browsers distinguish the old process from the
// replacement process even when a restart is too fast to produce a failed
// network request.
const SERVER_INSTANCE_ID = crypto.randomBytes(12).toString('hex');
const jobs = new Map(); // promptId -> job
const externalPromptPreflights = new Map(); // synthetic id -> external prompt enhancement
const queueHealthState = { lowGpuSince: null };
let dependencyInstallRunning = false;
let dependencyInstallController = null;
let comfyRestartRunning = false;
let appUpdateRunning = false;
let appUpdateRestartWaitTimer = null;
let setupHardwareSnapshot = null;
let setupHardwareAt = 0;
let comfyCompatibilitySnapshot = null;
let comfyCompatibilityAt = 0;
let comfySetupProcess = null;
let comfySetupCancelRequested = false;
let comfySetupExpectedBasePath = '';
let comfyStartRunning = false;
let comfyStartState = {
  state: 'idle',
  phase: 'idle',
  message: 'ComfyUI has not been started from Mix Studio.',
  error: null,
  matches: [],
  updatedAt: Date.now(),
};
let comfySetupState = {
  state: 'idle',
  phase: 'idle',
  message: 'ComfyUI setup has not started.',
  error: null,
  updatedAt: Date.now(),
};
let dependencyInstallState = {
  state: 'idle',
  phase: 'idle',
  message: 'No dependency installation is running.',
  completed: 0,
  total: 0,
  restartRequired: false,
  changed: 0,
  changedItems: [],
  checkedComponents: [],
  checkedMissingComponents: [],
  readinessDiagnostics: [],
  error: null,
  errorCode: null,
  accessUrl: null,
  failedModel: null,
  failedSettingKey: null,
  statusCode: null,
  resumableBytes: 0,
  failedNode: null,
  nodePath: null,
  actualRepo: null,
  expectedRepo: null,
  nodeFailures: [],
  updatedAt: Date.now(),
};
let pinnedNodeRevisionCache = { key: '', at: 0, nodes: [], components: [] };

const EMPTY_DEPENDENCY_FAILURE = Object.freeze({
  errorCode: null,
  accessUrl: null,
  failedModel: null,
  failedSettingKey: null,
  statusCode: null,
  resumableBytes: 0,
  failedNode: null,
  nodePath: null,
  actualRepo: null,
  expectedRepo: null,
  nodeFailures: [],
});

function dependencyFailureState(error) {
  return {
    errorCode: error?.code || null,
    accessUrl: error?.accessUrl || null,
    failedModel: error?.failedModel || null,
    failedSettingKey: error?.settingKey || null,
    statusCode: Number.isFinite(error?.statusCode) ? error.statusCode : null,
    resumableBytes: Math.max(0, Number(error?.resumableBytes || 0)),
    failedNode: error?.failedNode || null,
    nodePath: error?.nodePath || null,
    actualRepo: error?.actualRepo || null,
    expectedRepo: error?.expectedRepo || null,
    nodeFailures: Array.isArray(error?.nodeFailures) ? error.nodeFailures : [],
  };
}

function updateDependencyInstallState(patch) {
  dependencyInstallState = Object.assign({}, dependencyInstallState, patch, { updatedAt: Date.now() });
  broadcast('dependencyInstall', dependencyInstallState);
}

function invalidatePinnedNodeRevisionCache() {
  pinnedNodeRevisionCache = { key: '', at: 0, nodes: [], components: [] };
}

async function pinnedNodeRevisionStatus(status, force = false) {
  const customNodesPath = String(status?.customNodesPath || '');
  const pins = Object.entries(DEPENDENCY_NODE_PACKS)
    .map(([id, pack]) => `${id}:${pack.ref || ''}`)
    .join('|');
  const key = `${customNodesPath}::${pins}`;
  if (!force && pinnedNodeRevisionCache.key === key && Date.now() - pinnedNodeRevisionCache.at < 60_000) {
    return pinnedNodeRevisionCache;
  }
  let nodes = [];
  try {
    nodes = await inspectPinnedNodeRevisions(status, {
      gitExecutable: RUNTIME?.update?.gitExecutable,
    });
  } catch { /* node classes remain the fallback when revision inspection is unavailable */ }
  const components = [...new Set(nodes.flatMap((entry) => entry.componentIds || []))];
  pinnedNodeRevisionCache = { key, at: Date.now(), nodes, components };
  return pinnedNodeRevisionCache;
}

function updateComfySetupState(patch) {
  comfySetupState = Object.assign({}, comfySetupState, patch, { updatedAt: Date.now() });
  broadcast('comfySetup', comfySetupState);
}

function updateComfyStartState(patch) {
  comfyStartState = Object.assign({}, comfyStartState, patch, { updatedAt: Date.now() });
  broadcast('comfyStart', comfyStartState);
}

async function getSetupHardwareInfo(force = false) {
  if (!force && setupHardwareSnapshot && Date.now() - setupHardwareAt < 5 * 60 * 1000) return setupHardwareSnapshot;
  let comfyStats = null;
  try {
    const response = await comfyFetch('/system_stats', { signal: AbortSignal.timeout(4000) });
    comfyStats = await response.json();
  } catch { /* local detection remains available while ComfyUI is offline */ }
  setupHardwareSnapshot = await hardwareInfo({ exportPath: settings.exportDir || DATA, comfyStats });
  setupHardwareAt = Date.now();
  return setupHardwareSnapshot;
}

async function activeVramProfile() {
  try {
    const hardware = setupHardwareProfile(await getSetupHardwareInfo());
    return resolveVramProfile(settings.vramProfile, hardware);
  } catch {
    return settings.vramProfile === 'low' ? 'low' : 'standard';
  }
}

function applySetupConnection(values) {
  const previousUrl = settings.comfyUrl;
  const config = portableSetupConfig(ROOT, RUNTIME, values);
  // Installation completion can intentionally leave endpoint selection
  // pending. portableSetupConfig normally supplies the conventional 8188
  // default, which would make an unrelated local ComfyUI look selected.
  if (values.clearUrl === true) config.comfy.url = '';
  writePortableSetupConfig(ROOT, config);
  RUNTIME = resolveRuntimeConfig(ROOT);
  settings.comfyUrl = config.comfy.url;
  saveJsonSync(SETTINGS_FILE, settings);
  objectInfoCache = null;
  objectInfoAt = 0;
  comfyCompatibilitySnapshot = null;
  comfyCompatibilityAt = 0;
  if (previousUrl !== settings.comfyUrl) resetComfyTransport();
  return config;
}

async function connectedModelsPath(comfyPath, existingModelsPath = '') {
  const saved = String(existingModelsPath || '').trim();
  if (saved) return saved;
  const basePath = String(comfyPath || '').trim();
  if (!basePath) return '';
  const fallback = path.join(basePath, 'models');
  try {
    const discovery = await discoverModels({
      comfyUrl: '',
      comfyPath: basePath,
      platform: process.platform,
    });
    return discovery.preferredModelsPath || fallback;
  } catch {
    return fallback;
  }
}

function startOfficialComfySetup() {
  const script = path.join(ROOT, 'installer', 'install-comfy.ps1');
  if (!fs.existsSync(script)) throw new Error('The official ComfyUI setup helper is missing from this checkout.');
  const systemRoot = String(process.env.SystemRoot || 'C:\\Windows');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const resultFile = path.join(DATA, 'comfy-setup-result.json');
  try { fs.unlinkSync(resultFile); } catch { /* no previous result */ }
  comfySetupCancelRequested = false;
  comfySetupExpectedBasePath = '';
  updateComfySetupState({
    state: 'running',
    phase: 'starting',
    message: 'Preparing the signed official Comfy Desktop installer…',
    error: null,
  });
  const child = spawn(powershell, [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, '-ResultFile', resultFile,
  ], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  comfySetupProcess = child;
  let stdout = '';
  let stderr = '';
  const consumeLines = () => {
    const lines = stdout.split(/\r?\n/);
    stdout = lines.pop() || '';
    for (const line of lines) {
      try {
        const update = JSON.parse(line);
        if (update && update.phase && update.message) {
          updateComfySetupState({ state: 'running', phase: update.phase, message: update.message, error: null });
        }
      } catch { /* non-JSON PowerShell output is retained only for diagnostics */ }
    }
  };
  child.stdout.on('data', (chunk) => { stdout += String(chunk || ''); consumeLines(); });
  child.stderr.on('data', (chunk) => { stderr = `${stderr}${String(chunk || '')}`.slice(-3000); });
  child.on('error', (error) => {
    comfySetupProcess = null;
    if (comfySetupCancelRequested) {
      updateComfySetupState({ state: 'cancelled', phase: 'cancelled', message: 'ComfyUI setup was cancelled.', error: null });
      return;
    }
    updateComfySetupState({ state: 'error', phase: 'error', message: 'ComfyUI setup could not start.', error: String(error.message || error) });
  });
  child.on('close', (code) => {
    consumeLines();
    comfySetupProcess = null;
    if (comfySetupCancelRequested) {
      comfySetupCancelRequested = false;
      updateComfySetupState({ state: 'cancelled', phase: 'cancelled', message: 'ComfyUI setup was cancelled.', error: null });
      fsp.unlink(resultFile).catch(() => {});
      return;
    }
    void (async () => {
      try {
        if (code !== 0) throw new Error(stderr.trim() || `Official ComfyUI setup exited with code ${code}.`);
        const result = loadJson(resultFile, {});
        if (!result.path || result.state !== 'installed') {
          throw new Error('ComfyUI finished, but no completed installation folder was reported.');
        }
        // Save the completed installation without preserving an endpoint from
        // another portable/Desktop instance. Comfy Desktop may allocate a
        // different port for each installation.
        applySetupConnection({ path: result.path, modelsPath: result.modelsPath, clearUrl: true });
        const discovery = await discoverComfyEndpoints('', {
          env: process.env,
          platform: process.platform,
          timeoutMs: 1200,
          expectedBasePath: result.path,
        });
        if (discovery.url) {
          applySetupConnection({ path: result.path, modelsPath: result.modelsPath, url: discovery.url });
          comfySetupExpectedBasePath = '';
          updateComfySetupState({ state: 'complete', phase: 'connected', message: `ComfyUI Desktop is connected at ${discovery.url}.`, error: null });
        } else {
          comfySetupExpectedBasePath = result.path;
          if (discovery.ambiguous) {
            updateComfyStartState({
              state: 'choice', phase: 'choose', message: 'A running ComfyUI was found, but Mix Studio could not verify that it belongs to this installation. Choose it explicitly or start the new Comfy Desktop installation.', error: null,
              matches: discovery.matches.map((entry) => ({ url: entry.url, installationName: entry.installationName || '' })),
            });
          }
          updateComfySetupState({
            state: 'installed', phase: discovery.ambiguous ? 'choose' : 'installed',
            message: discovery.ambiguous
              ? 'Comfy Desktop is installed. Choose the running instance Mix Studio should use.'
              : 'Comfy Desktop is installed. Open its ComfyUI instance and press Play; Mix Studio will find the port automatically.',
            error: null,
          });
        }
      } catch (error) {
        updateComfySetupState({ state: 'error', phase: 'error', message: 'ComfyUI setup needs attention.', error: String(error.message || error) });
      } finally {
        fsp.unlink(resultFile).catch(() => {});
      }
    })();
  });
}

function stopOfficialComfySetup() {
  const child = comfySetupProcess;
  if (!child) return false;
  comfySetupCancelRequested = true;
  updateComfySetupState({ state: 'cancelling', phase: 'cancelling', message: 'Stopping ComfyUI setup…', error: null });
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, (error) => {
      if (error) {
        try { child.kill(); } catch { /* process may already be gone */ }
      }
    });
  } else {
    try { child.kill('SIGTERM'); } catch { /* process may already be gone */ }
  }
  return true;
}

async function assertDesktopIsIdle() {
  const busy = (message) => {
    const error = new Error(message);
    error.code = 'desktop_busy';
    return error;
  };
  if (jobs.size || externalPromptPreflights.size) {
    throw busy('Wait for the Mix Studio queue to finish before changing desktop dependencies.');
  }
  try {
    const queue = await (await comfyFetch('/queue')).json();
    if ((queue.queue_running || []).length || (queue.queue_pending || []).length) {
      throw busy('Wait for the ComfyUI queue to finish before changing desktop dependencies.');
    }
  } catch (error) {
    if (error?.code === 'desktop_busy') throw error;
    // A stopped ComfyUI instance is recoverable during dependency installation.
  }
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForComfyReconnect(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await comfyFetch('/system_stats');
      return true;
    } catch { await pause(1500); }
  }
  return false;
}

async function discoverLocalComfy(options = {}) {
  return discoverComfyEndpoints(settings.comfyUrl, {
    env: process.env,
    platform: process.platform,
    timeoutMs: options.timeoutMs || 1000,
    skipProcessQuery: options.skipProcessQuery === true,
    expectedBasePath: options.expectedBasePath || '',
  });
}

function adoptComfyEndpoint(url) {
  const detected = sam3InstallStatus(RUNTIME);
  const comfyPath = RUNTIME.comfy.path || detected.basePath || '';
  const modelsPath = RUNTIME.comfy.modelsPath || (comfyPath ? path.join(comfyPath, 'models') : '');
  applySetupConnection({ url, path: comfyPath, modelsPath });
  objectInfoCache = null;
  objectInfoAt = 0;
  return settings.comfyUrl;
}

async function waitForStartedComfy(timeoutMs = 5 * 60_000, expectedBasePath = '') {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastDiscovery = null;
  while (Date.now() < deadline) {
    const discovery = await discoverLocalComfy({ timeoutMs: 900, skipProcessQuery: attempt++ % 4 !== 0, expectedBasePath });
    lastDiscovery = discovery;
    if (discovery.url) return discovery;
    // While starting a known Desktop installation, an unrelated running
    // ComfyUI is not evidence that the requested installation has started.
    if (discovery.ambiguous && !expectedBasePath) return discovery;
    await pause(1500);
  }
  if (lastDiscovery?.ambiguous) return Object.assign({}, lastDiscovery, { timedOut: true });
  return { url: '', matches: [], ambiguous: false, checked: 0, timedOut: true };
}

function trackJob(pid, job) {
  const now = Date.now();
  jobs.set(pid, Object.assign({ enqueuedAt: now, startedAt: null }, job));
}

function jobBaseTime(job) {
  return job && (job.startedAt || job.enqueuedAt || job.createdAt) || Date.now();
}

function jobDurationMs(job, now = Date.now()) {
  return Math.max(0, now - jobBaseTime(job));
}

function queueEntryCreatedAt(entry) {
  const t = entry && entry[3] && Number(entry[3].create_time);
  return Number.isFinite(t) && t > 0 ? t : null;
}

function jobThumbnail(job) {
  if (!job) return null;
  const linkedId = job.itemId || (job.params && job.params.sourceItemId);
  const linked = linkedId && db.items.find((item) => item.id === linkedId && (!job.profileId || item.profileId === job.profileId));
  if (linked && linked.file) return '/images/' + encodeURIComponent(linked.upscaled || linked.file);
  const inputName = job.thumbnailName || (job.kind === 'video'
    ? job.videoInfo && job.videoInfo.imageName
    : job.params && (job.params.imageName || (Array.isArray(job.params.refImages) && job.params.refImages[0])));
  return inputName ? '/api/input?name=' + encodeURIComponent(String(inputName)) : null;
}

function describeQueueEntry(entry, running) {
  const now = Date.now();
  const pid = entry[1];
  const job = jobs.get(pid);
  const createdAt = queueEntryCreatedAt(entry);
  const startedAt = running ? (job && (job.startedAt || createdAt)) || createdAt || now : null;
  const queuedAt = (job && job.enqueuedAt) || createdAt || now;
  return {
    jobId: pid,
    kind: job ? job.kind : 'external',
    itemId: job ? (job.itemId || null) : null,
    thumbnail: jobThumbnail(job),
    label: jobLabel(job),
    queuedAt,
    startedAt,
    elapsedMs: now - (running ? (startedAt || queuedAt) : queuedAt),
    durationMs: now - (running ? (startedAt || queuedAt) : queuedAt),
  };
}

function readGpuStats() {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=utilization.gpu,memory.used,memory.total,power.draw', '--format=csv,noheader,nounits'],
      { timeout: 4000 },
      (err, stdout) => {
        const nvidia = err ? null : parseNvidiaSmiCsv(stdout);
        if (nvidia) return resolve(nvidia);
        execFile(
          'rocm-smi',
          ['--showuse', '--showmeminfo', 'vram', '--json'],
          { timeout: 4000 },
          (rocmError, rocmStdout) => resolve(rocmError ? null : parseRocmSmiUseJson(rocmStdout))
        );
      }
    );
  });
}

async function queueHealth(running, pending) {
  const now = Date.now();
  const gpu = await readGpuStats();
  const longestRunningMs = running.reduce((max, job) => Math.max(max, Number(job.elapsedMs) || 0), 0);
  const assessed = assessQueueHealth({
    runningCount: running.length,
    pendingCount: pending.length,
    longestRunningMs,
    gpu,
    now,
    lowGpuSince: queueHealthState.lowGpuSince,
  });
  queueHealthState.lowGpuSince = assessed.lowGpuSince;
  return Object.assign({
    gpu,
    runningCount: running.length,
    pendingCount: pending.length,
    longestRunningMs,
  }, assessed);
}

async function comfyFetch(p, opts) {
  const url = settings.comfyUrl.replace(/\/$/, '') + p;
  let res;
  try {
    res = await fetch(url, opts);
  } catch (error) {
    const detail = String(error?.cause?.message || error?.message || error || 'connection failed');
    const wrapped = new Error(
      `Could not reach ComfyUI for ${String(opts?.method || 'GET').toUpperCase()} ${p}: ${detail}. `
      + `Check that ComfyUI is running at ${settings.comfyUrl}.`
    );
    wrapped.code = 'comfy_connection_failed';
    wrapped.cause = error;
    throw wrapped;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ComfyUI ${p} -> ${res.status} ${text.slice(0, 400)}`);
  }
  return res;
}

async function getComfyCompatibility(force = false, basePath = '') {
  if (!force && comfyCompatibilitySnapshot && comfyCompatibilitySnapshot.supported !== null
    && Date.now() - comfyCompatibilityAt < 5 * 60 * 1000) {
    return comfyCompatibilitySnapshot;
  }
  let stats = null;
  try {
    const response = await comfyFetch('/system_stats', { signal: AbortSignal.timeout(4000) });
    stats = await response.json();
  } catch { /* an offline install can still expose its version on disk */ }
  const detectedPath = basePath || sam3InstallStatus(RUNTIME).basePath;
  comfyCompatibilitySnapshot = nativeInt8Compatibility(stats, detectedPath);
  comfyCompatibilityAt = Date.now();
  return comfyCompatibilitySnapshot;
}

async function directorInputAssetAvailable(name) {
  try {
    await fsp.access(inputAssetPath(INPUTS, name));
    return true;
  } catch { /* fall through to ComfyUI's input folder */ }
  const parts = name.split('/');
  const filename = parts.pop();
  const subfolder = parts.join('/');
  try {
    const response = await comfyFetch(`/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=input`);
    if (response.body?.cancel) await response.body.cancel().catch(() => {});
    return true;
  } catch { return false; }
}

let objectInfoCache = null;
let objectInfoAt = 0;
const COMFY_OBJECT_INFO_TIMEOUT_MS = 60_000;

function comfyRequestTimedOut(error) {
  for (let current = error; current; current = current.cause) {
    if (['AbortError', 'TimeoutError'].includes(current?.name)) return true;
    if (/timed?\s*out|timeout/i.test(String(current?.message || ''))) return true;
  }
  return false;
}

async function getObjectInfo(force, fetchOptions = {}) {
  if (!force && objectInfoCache && Date.now() - objectInfoAt < 5 * 60 * 1000) return objectInfoCache;
  const options = Object.assign({}, fetchOptions);
  if (!options.signal) options.signal = AbortSignal.timeout(COMFY_OBJECT_INFO_TIMEOUT_MS);
  let res;
  try {
    res = await comfyFetch('/object_info', options);
    objectInfoCache = await res.json();
  } catch (error) {
    if (!comfyRequestTimedOut(error)) throw error;
    const wrapped = new Error(
      'ComfyUI took longer than 60 seconds to describe its installed nodes. It may still be loading custom nodes; wait for the ComfyUI console to settle, then Check again.'
    );
    wrapped.code = 'comfy_object_info_timeout';
    wrapped.cause = error;
    throw wrapped;
  }
  objectInfoAt = Date.now();
  adoptRegisteredModelPaths(objectInfoCache);
  return objectInfoCache;
}

function adoptRegisteredModelPaths(info) {
  const available = registeredModelNames(info);
  let changed = false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!modelChoice(settings[key])) continue;
    const resolved = resolveRegisteredModelSetting(key, settings[key], available);
    if (!resolved || normalizeModelPath(resolved) === normalizeModelPath(settings[key])) continue;
    settings[key] = resolved;
    changed = true;
  }
  if (changed) saveJsonSync(SETTINGS_FILE, settings);
  return changed;
}

function comboList(info, cls, field) {
  return objectInfoComboChoices(info, cls, field);
}

function modelStatus(info, cls, field, name, fallbackList) {
  const list = fallbackList || comboList(info, cls, field);
  const resolved = resolveRegisteredModelName(name, list);
  return { name: resolved || name, ok: !name || !!resolved };
}

function diffusionModelStatus(info, name) {
  const input = diffusionModelInput(name);
  return modelStatus(info, input.className, input.field, name);
}

function modelStatusAny(info, name, choices, fallbackList) {
  const list = fallbackList || choices.flatMap(([cls, field]) => comboList(info, cls, field));
  const resolved = resolveRegisteredModelName(name, list);
  return { name: resolved || name, ok: !name || !!resolved };
}

function scailInfinityStatus(info) {
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  return {
    node: { name: 'WanSCAILInfinity', ok: !!info.WanSCAILInfinity },
    pusa: {
      name: settings.scailPusaLora,
      ok: !!settings.scailPusaLora && !!resolveRegisteredModelName(settings.scailPusaLora, loraList),
    },
  };
}

function scailInfinityError(info) {
  const status = scailInfinityStatus(info);
  if (!status.node.ok) {
    return 'SCAIL-2 Infinity needs the comfyui-scail2-infinity custom node installed and ComfyUI restarted.';
  }
  if (!status.pusa.ok) {
    return `SCAIL-2 Infinity needs the Pusa LoRA in ComfyUI loras: ${settings.scailPusaLora}`;
  }
  return null;
}

function configuredModelsStatus(info) {
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  const krea2Core = krea2ClipCompatibility(info);
  return {
    krea2: {
      label: 'Krea 2',
      turbo: diffusionModelStatus(info, settings.unet),
      raw: diffusionModelStatus(info, settings.krea2RawUnet),
      turboLora: modelStatus(info, 'LoraLoader', 'lora_name', settings.krea2TurboLora, loraList),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.clip),
      clipType: { name: settings.clipType, ok: krea2Core.supported === true },
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.vae),
    },
    krea2Depth: {
      label: 'Krea 2 Depth',
      lora: modelStatus(info, 'Krea2ControlLoRALoader', 'lora_name', settings.krea2DepthLora, loraList),
      depthModel: modelStatus(info, 'DownloadAndLoadDepthAnythingV3Model', 'model', settings.depthAnythingV3Model),
    },
    krea2IdentityEdit: {
      label: 'Krea 2 Identity Edit',
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.krea2OutpaintLora, loraList),
    },
    klein4: {
      label: 'Flux Klein 4B',
      unet: diffusionModelStatus(info, settings.klein4Unet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.klein4Clip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.kleinVae),
      consistencyLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.klein4ConsistencyLora, loraList),
    },
    klein9: {
      label: 'Flux Klein 9B',
      unet: diffusionModelStatus(info, settings.klein9Unet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.klein9Clip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.kleinVae),
      consistencyLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.klein9ConsistencyLora, loraList),
    },
    qwen: {
      label: 'Qwen Edit',
      unet: diffusionModelStatus(info, settings.qwenEditUnet),
      clip: modelStatus(info, 'CLIPLoader', 'clip_name', settings.qwenEditClip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.vae),
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.qwenEditLora, loraList),
      angles: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.qwenEditAnglesLora, loraList),
    },
    upscale: {
      label: 'SeedVR2 Upscale',
      dit: { name: settings.seedvr2Dit, ok: installedSeedVr2Models(seedVr2ModelDirs()).includes(settings.seedvr2Dit) },
      vae: modelStatusAny(info, settings.seedvr2Vae, [['SeedVR2LoadVAEModel', 'model']]),
    },
    ltx: {
      label: 'LTX 2.3',
      checkpoint: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.ltxCkpt),
      distilled: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxDistilledLora, loraList),
      textEncoder: modelStatusAny(info, settings.ltxTextEncoder, [['LTXAVTextEncoderLoader', 'text_encoder']]),
      gemmaLora: modelStatus(info, 'LoraLoader', 'lora_name', settings.ltxGemmaLora, loraList),
      upscaler: modelStatus(info, 'LatentUpscaleModelLoader', 'model_name', settings.ltxUpscaler),
    },
    ltx25: {
      label: 'LTX 2.5',
      model: diffusionModelStatus(info, settings.ltx25Unet),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.ltx25TextEncoder),
      promptEnhancer: modelStatus(info, 'CLIPLoader', 'clip_name', settings.ltx25PromptEnhancer),
      videoVae: modelStatus(info, 'VAELoader', 'vae_name', settings.ltx25VideoVae),
      audioVae: modelStatus(info, 'VAELoader', 'vae_name', settings.ltx25AudioVae),
      upscaler: modelStatus(info, 'LatentUpscaleModelLoader', 'model_name', settings.ltx25Upscaler),
    },
    ltx25Quality: {
      label: 'LTX 2.5 Quality',
      model: diffusionModelStatus(info, settings.ltx25QualityUnet),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.ltx25QualityTextEncoder),
      distilledLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltx25DistilledLora, loraList),
    },
    h3: {
      label: 'MiniMax H3',
      model: diffusionModelStatus(info, h3EffectiveModelName(settings, 'frames')),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.h3Clip),
      videoVae: modelStatus(info, 'VAELoader', 'vae_name', settings.h3VideoVae),
      audioVae: modelStatus(info, 'VAELoader', 'vae_name', settings.h3AudioVae),
    },
    h3Ref: {
      label: 'MiniMax H3 Reference-to-Video',
      model: diffusionModelStatus(info, h3EffectiveModelName(settings, 'reference')),
    },
    h3Turbo: {
      label: 'MiniMax H3 Turbo',
      lora: modelStatus(
        info,
        h3TurboUsesStandardLoader(settings, 'frames') ? 'LoraLoaderModelOnly' : 'MiniMaxH3TurboLoRA',
        'lora_name',
        settings.h3TurboLora,
        loraList,
      ),
    },
    h3RefTurbo: {
      label: 'MiniMax H3 Reference Turbo',
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.h3RefTurboLora, loraList),
    },
    ltxDirector: {
      label: 'LTX 2.3 Director',
      ingredients: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxDirectorIcLora, loraList),
    },
    ltxCamera: {
      label: 'LTX Camera Motion',
      lora: modelStatus(info, 'LTXICLoRALoaderModelOnly', 'lora_name', settings.ltxCameramanLora, loraList),
    },
    ltxEdit: {
      label: 'LTX Edit',
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxEditLora, loraList),
    },
    faceid: {
      label: 'LTX Face ID',
      faceLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxFaceIdLora, loraList),
      distilled: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.ltxFaceIdDistilledLora, loraList),
    },
    wan: {
      label: 'Wan 2.2',
      high: diffusionModelStatus(info, settings.wanHighUnet),
      low: diffusionModelStatus(info, settings.wanLowUnet),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.wanClip),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.wanVae),
      highLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.wanHighLora, loraList),
      lowLora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.wanLowLora, loraList),
    },
    eros: {
      label: '10Eros DMD',
      checkpoint: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.erosCkpt),
      textEncoder: modelStatusAny(info, settings.erosTextEncoder, [['LTXAVTextEncoderLoader', 'text_encoder']]),
      lora: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.erosDmdLora, loraList),
    },
    scail: {
      label: 'SCAIL 2',
      unet: diffusionModelStatus(info, settings.scailUnet),
      lightx: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.scailLora, loraList),
      clipVision: modelStatus(info, 'CLIPVisionLoader', 'clip_name', settings.scailClipVision),
      sam: modelStatus(info, 'CheckpointLoaderSimple', 'ckpt_name', settings.scailSam),
    },
    wanAnimate2: {
      label: 'Wan Animate 2',
      unet: diffusionModelStatus(info, settings.wanAnimate2Unet),
      lightx: modelStatus(info, 'LoraLoaderModelOnly', 'lora_name', settings.wanAnimate2Lora, loraList),
      textEncoder: modelStatus(info, 'CLIPLoader', 'clip_name', settings.wanAnimate2Clip),
      clipVision: modelStatus(info, 'CLIPVisionLoader', 'clip_name', settings.wanAnimate2ClipVision),
      vae: modelStatus(info, 'VAELoader', 'vae_name', settings.wanAnimate2Vae),
    },
    scailInfinity: Object.assign({ label: 'SCAIL 2 Infinity' }, scailInfinityStatus(info)),
  };
}

const DEPENDENCY_NODE_GROUP_COMPONENTS = Object.freeze({
    regional: ['regional'],
    krea2ref: ['krea2ref'],
    krea2remix: ['krea2remix'],
    krea2outpaint: ['krea2outpaint'],
    editoutpaint: ['editoutpaint'],
    smartmask: ['smartmask'],
    upscale: ['upscale'],
    ultimateupscale: ['ultimateupscale'],
    video: ['video'],
    ltx25: ['ltx25'],
    ltx25quality: ['ltx25quality'],
    h3: ['h3'],
    h3r2v: ['h3r2v'],
    h3turbo: ['h3turbo'],
    h3turbor2v: ['h3turbor2v'],
    h3context: ['h3context'],
    h3sage: ['h3sage'],
    ltxcamera: ['ltxcamera'],
    ltxdirector: ['ltxdirector'],
    videoedit: ['videoedit'],
    video4k: ['video4k'],
    rife: ['rife'],
    wan: ['wan'],
    wananimate2: ['wananimate2'],
    eros: ['eros'],
    scail: ['scail'],
    scailinfinity: ['scailinfinity'],
    faceid: ['faceid'],
    klein: ['klein4', 'klein9'],
    qwenedit: ['qwen'],
    krea2inpaint: ['image'],
    krea2depth: ['krea2depth'],
    krea2style: ['krea2style'],
});

const DEPENDENCY_MODEL_GROUP_COMPONENTS = Object.freeze({
  krea2Depth: ['krea2depth'],
  krea2IdentityEdit: ['krea2ref', 'krea2outpaint'],
  klein4: ['klein4'],
  klein9: ['klein9'],
  qwen: ['qwen'],
  upscale: ['upscale'],
  ltx: ['video'],
  ltx25: ['ltx25'],
  ltx25Quality: ['ltx25quality'],
  h3: ['h3'],
  h3Ref: ['h3r2v'],
  h3Turbo: ['h3turbo'],
  h3RefTurbo: ['h3turbor2v'],
  ltxDirector: ['ltxdirector'],
  ltxCamera: ['ltxcamera'],
  ltxEdit: ['videoedit'],
  faceid: ['faceid'],
  wan: ['wan'],
  wanAnimate2: ['wananimate2'],
  eros: ['eros'],
  scail: ['scail'],
  scailInfinity: ['scailinfinity'],
});

function missingDependencyComponentIds(missing, models, capabilities = {}) {
  const ids = new Set();
  for (const [group, classes] of Object.entries(missing || {})) {
    if (Array.isArray(classes) && classes.length) for (const component of DEPENDENCY_NODE_GROUP_COMPONENTS[group] || []) ids.add(component);
  }
  const krea2 = models?.krea2 || {};
  const krea2CoreChecks = ['turbo', 'clip', 'vae'].map((key) => krea2[key]).filter(Boolean);
  if (krea2CoreChecks.some((check) => !check.ok)) ids.add('image');
  if (krea2.raw && !krea2.raw.ok) ids.add('krea2raw');
  for (const [model, value] of Object.entries(models || {})) {
    const checks = Object.values(value || {}).filter((check) => check && typeof check === 'object' && Object.prototype.hasOwnProperty.call(check, 'ok'));
    if (checks.some((check) => !check.ok)) {
      for (const component of DEPENDENCY_MODEL_GROUP_COMPONENTS[model] || []) ids.add(component);
    }
  }
  if (Object.prototype.hasOwnProperty.call(capabilities, 'sageAttention')
    && capabilities.sageAttention?.ready !== true) ids.add('h3sage');
  for (const component of capabilities.repairComponents || []) ids.add(component);
  return [...ids];
}

function dependencyReadinessDiagnostics(componentIds, missing, models, capabilities = {}, installStatus = {}) {
  const requested = new Set((componentIds || []).filter(Boolean));
  const diagnostics = new Map([...requested].map((id) => [id, {
    id,
    label: DEPENDENCY_COMPONENTS[id]?.label || id,
    missingNodes: [],
    missingModels: [],
    nodePacks: [],
    reasons: [],
  }]));
  for (const [group, classes] of Object.entries(missing || {})) {
    if (!Array.isArray(classes) || !classes.length) continue;
    for (const componentId of DEPENDENCY_NODE_GROUP_COMPONENTS[group] || []) {
      const diagnostic = diagnostics.get(componentId);
      if (diagnostic) diagnostic.missingNodes.push(...classes);
    }
  }
  for (const [modelGroup, value] of Object.entries(models || {})) {
    const missingNames = Object.values(value || {})
      .filter((check) => check && typeof check === 'object' && check.ok === false && check.name)
      .map((check) => String(check.name));
    if (!missingNames.length) continue;
    for (const componentId of DEPENDENCY_MODEL_GROUP_COMPONENTS[modelGroup] || []) {
      const diagnostic = diagnostics.get(componentId);
      if (diagnostic) diagnostic.missingModels.push(...missingNames);
    }
  }
  const krea2 = models?.krea2 || {};
  const krea2CoreNames = ['turbo', 'clip', 'vae']
    .map((key) => krea2[key])
    .filter((check) => check?.ok === false && check.name)
    .map((check) => String(check.name));
  if (diagnostics.has('image')) diagnostics.get('image').missingModels.push(...krea2CoreNames);
  if (diagnostics.has('krea2raw') && krea2.raw?.ok === false && krea2.raw.name) {
    diagnostics.get('krea2raw').missingModels.push(String(krea2.raw.name));
  }
  for (const componentId of capabilities.repairComponents || []) {
    const diagnostic = diagnostics.get(componentId);
    if (diagnostic) diagnostic.reasons.push('A reviewed custom-node update is required.');
  }
  if (diagnostics.has('h3sage') && capabilities.sageAttention?.ready !== true) {
    diagnostics.get('h3sage').reasons.push(capabilities.sageAttention?.reason || 'SageAttention is not ready in the connected ComfyUI runtime.');
  }
  for (const [componentId, diagnostic] of diagnostics) {
    const nodeIds = DEPENDENCY_COMPONENTS[componentId]?.nodes || [];
    diagnostic.nodePacks = nodeIds.map((nodeId) => {
      const pack = DEPENDENCY_NODE_PACKS[nodeId];
      return {
        label: pack?.label || nodeId,
        path: installStatus.customNodesPath && pack?.folder
          ? path.join(installStatus.customNodesPath, pack.folder)
          : '',
      };
    });
    diagnostic.missingNodes = [...new Set(diagnostic.missingNodes)];
    diagnostic.missingModels = [...new Set(diagnostic.missingModels)];
    diagnostic.reasons = [...new Set(diagnostic.reasons)];
  }
  return [...diagnostics.values()];
}

const LORA_INFO_TTL = 5 * 60 * 1000;
let loraInfoCache = { key: '', at: 0, value: {} };

function uniqueExistingDirs(dirs) {
  const seen = new Set();
  const out = [];
  for (const dir of dirs.filter(Boolean)) {
    const full = path.resolve(dir);
    const key = full.toLowerCase();
    if (seen.has(key) || !fs.existsSync(full)) continue;
    seen.add(key);
    out.push(full);
  }
  return out;
}

function candidateLoraRoots() {
  return uniqueExistingDirs([
    process.env.COMFYUI_LORA_DIR,
    process.env.COMFYUI_MODELS_DIR ? path.join(process.env.COMFYUI_MODELS_DIR, 'loras') : '',
    process.env.COMFYUI_PATH ? path.join(process.env.COMFYUI_PATH, 'models', 'loras') : '',
    RUNTIME.comfy.modelsPath ? path.join(RUNTIME.comfy.modelsPath, 'loras') : '',
    RUNTIME.comfy.path ? path.join(RUNTIME.comfy.path, 'models', 'loras') : '',
    path.join(os.homedir(), 'Documents', 'ComfyUI', 'models', 'loras'),
    path.join(os.homedir(), 'ComfyUI', 'models', 'loras'),
  ]);
}

function resolveLoraPath(root, loraName) {
  const rel = String(loraName || '').replace(/[\\/]+/g, path.sep);
  const full = path.resolve(root, rel);
  const back = path.relative(root, full);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) return null;
  return full;
}

async function readSafetensorsInfo(file) {
  const fh = await fsp.open(file, 'r');
  try {
    const lenBuf = Buffer.alloc(8);
    const lenRead = await fh.read(lenBuf, 0, 8, 0);
    if (lenRead.bytesRead !== 8) return null;
    const headerLen = Number(lenBuf.readBigUInt64LE(0));
    if (!Number.isSafeInteger(headerLen) || headerLen <= 0 || headerLen > 4 * 1024 * 1024) return null;
    const headerBuf = Buffer.alloc(headerLen);
    const headerRead = await fh.read(headerBuf, 0, headerLen, 8);
    if (headerRead.bytesRead !== headerLen) return null;
    const header = JSON.parse(headerBuf.toString('utf8'));
    const metadata = header.__metadata__ || {};
    const keys = Object.keys(header).filter((k) => k !== '__metadata__').slice(0, 80);
    return { metadata, keys };
  } finally {
    await fh.close().catch(() => {});
  }
}

async function loraMetadataMap(loras, force) {
  const key = (loras || []).join('\n');
  if (!force && loraInfoCache.key === key && Date.now() - loraInfoCache.at < LORA_INFO_TTL) {
    return loraInfoCache.value;
  }
  const roots = candidateLoraRoots();
  const value = {};
  for (const name of loras || []) {
    let info = { name, metadata: {}, keys: [] };
    for (const root of roots) {
      const file = resolveLoraPath(root, name);
      if (!file || !fs.existsSync(file)) continue;
      try {
        info = Object.assign(info, await readSafetensorsInfo(file));
      } catch {
        // Header inspection is only for better filtering; filename fallback is fine.
      }
      break;
    }
    value[name] = { category: classifyLora(info) };
  }
  loraInfoCache = { key, at: Date.now(), value };
  return value;
}

/**
 * Build a node's inputs by zipping ordered widget values against the node
 * class definition from /object_info. Used for nodes whose exact input
 * names vary between custom-node versions.
 */
async function nodeFromOrdered(classType, ordered, links = {}, overrides = {}) {
  const info = await getObjectInfo();
  const def = info[classType];
  if (!def) throw new Error(`ComfyUI is missing node class "${classType}" (install/enable the custom node).`);
  const entries = [
    ...Object.entries(def.input?.required || {}),
    ...Object.entries(def.input?.optional || {}),
  ];
  const inputs = {};
  let i = 0;
  for (const [name, spec] of entries) {
    if (links[name] !== undefined) { inputs[name] = links[name]; continue; }
    if (!isWidgetSpec(spec)) continue; // unlinked connection input -> omit
    if (Object.prototype.hasOwnProperty.call(overrides, name)) { inputs[name] = overrides[name]; i++; continue; }
    if (i < ordered.length) { inputs[name] = ordered[i++]; }
    else if (spec[1] && spec[1].default !== undefined) { inputs[name] = spec[1].default; }
  }
  for (const [k, v] of Object.entries(overrides)) if (!(k in inputs)) inputs[k] = v;
  return { class_type: classType, inputs };
}

async function ltxEmptyAudioNode(frames, frameRate) {
  return nodeFromOrdered(
    'LTXVEmptyLatentAudio',
    [frames, frameRate, 1],
    { audio_vae: ['audio_vae', 0] },
    {
      frames_number: frames,
      frame_rate: frameRate,
      batch_size: 1,
    }
  );
}

/** Drop input keys the installed node class doesn't know about (core-node drift). */
async function filterInputs(graph) {
  const info = await getObjectInfo();
  const krea2Compatibility = krea2ClipCompatibility(info);
  for (const node of Object.values(graph)) {
    const def = info[node.class_type];
    if (!def) continue;
    if (node.class_type === 'CLIPLoader' && node.inputs?.type === 'krea2'
      && krea2Compatibility.supported !== true) {
      const error = new Error(krea2ClipCompatibilityError(krea2Compatibility));
      error.code = 'comfy_krea2_update_required';
      throw error;
    }
    const known = new Set([
      ...Object.keys(def.input?.required || {}),
      ...Object.keys(def.input?.optional || {}),
      ...Object.keys(def.input?.hidden || {}),
    ]);
    for (const key of Object.keys(node.inputs)) {
      if (!known.has(key) && !key.includes('.')) delete node.inputs[key];
    }
  }
  return graph;
}

async function uploadToComfy(buffer, filename) {
  const boundary = '----kreastudio' + crypto.randomBytes(8).toString('hex');
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const mid = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([head, buffer, mid]);
  let res;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      res = await comfyFetch('/upload/image', {
        method: 'POST',
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
        body,
      });
      break;
    } catch (error) {
      if (error?.code !== 'comfy_connection_failed' || attempt > 0) throw error;
      resetComfyTransport();
      await pause(750);
    }
  }
  const json = await res.json();
  return (json.subfolder ? json.subfolder + '/' : '') + json.name;
}

async function uploadCameraMotionGuides(value) {
  const ids = normalizeCameraMotions(value);
  const uploaded = [];
  for (const id of ids) {
    const motion = cameraMotionById(id);
    if (!motion) continue;
    const assetName = path.basename(String(motion.asset || ''));
    const assetPath = path.join(PUBLIC, 'camera-motions', assetName);
    if (!assetName || !fs.existsSync(assetPath)) {
      throw new Error(`Camera motion reference is missing: ${assetName || id}`);
    }
    const buffer = await fsp.readFile(assetPath);
    uploaded.push(await uploadToComfy(buffer, `ks_camera_${id}${path.extname(assetName) || '.mp4'}`));
  }
  return uploaded;
}

async function uploadFileToComfy(file, filename) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const upload = await multipartFileUpload(file, filename);
    try {
      const res = await comfyFetch('/upload/image', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${upload.boundary}`,
          'Content-Length': String(upload.contentLength),
        },
        body: upload.body,
        duplex: 'half',
      });
      const result = await res.json();
      return (result.subfolder ? result.subfolder + '/' : '') + result.name;
    } catch (error) {
      if (error?.code !== 'comfy_connection_failed' || attempt > 0) {
        throw new Error(`Could not upload ${filename} to ComfyUI: ${String(error.message || error)}`, { cause: error });
      }
      resetComfyTransport();
      await pause(750);
    }
  }
  throw new Error(`Could not upload ${filename} to ComfyUI.`);
}

async function queuePrompt(graph, options = {}) {
  if (options.profileId) {
    const outputProfile = db.profiles.find((profile) => profile.id === options.profileId);
    if (outputProfile) applyProfileOutputPrefix(graph, outputProfile);
  }
  const body = { prompt: graph, client_id: CLIENT_ID };
  if (options.front === true) body.front = true;
  const res = await comfyFetch('/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.node_errors && Object.keys(json.node_errors).length) {
    throw new Error('ComfyUI validation: ' + JSON.stringify(json.node_errors).slice(0, 500));
  }
  return json.prompt_id;
}

/* --------------------------- WebSocket ---------------------------- */

let ws = null;
let wsTimer = null;
let lastPreviewAt = 0;
let activeWsPromptId = '';
let lastWsMessageAt = 0;

function resetComfyTransport() {
  clearTimeout(wsTimer);
  wsTimer = null;
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch { /* the next job will create a fresh transport */ }
  }
  ws = null;
  activeWsPromptId = '';
  lastWsMessageAt = 0;
  objectInfoCache = null;
  objectInfoAt = 0;
  comfyCompatibilitySnapshot = null;
  comfyCompatibilityAt = 0;
}

function ensureWs() {
  if (typeof WebSocket === 'undefined') return; // Node < 22 -> polling fallback
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const url = settings.comfyUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws?clientId=' + CLIENT_ID;
  try { ws = new WebSocket(url); } catch { return scheduleWsRetry(); }
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    lastWsMessageAt = Date.now();
    // ComfyUI 0.27 sends sampler previews through PREVIEW_IMAGE_WITH_METADATA
    // only after this first-message capability negotiation.
    try { ws.send(JSON.stringify({ type: 'feature_flags', data: { supports_preview_metadata: true } })); } catch { /* noop */ }
  };
  ws.onmessage = async (ev) => {
    lastWsMessageAt = Date.now();
    if (typeof ev.data === 'string') {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      handleWsMessage(msg);
    } else {
      try {
        const data = ev.data;
        const buf = Buffer.isBuffer(data)
          ? data
          : (data instanceof ArrayBuffer
            ? Buffer.from(data)
            : (ArrayBuffer.isView(data)
              ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
              : (data && typeof data.arrayBuffer === 'function' ? Buffer.from(await data.arrayBuffer()) : null)));
        if (buf) handleWsBinary(buf);
      } catch (e) {
        console.warn('[preview] could not decode ComfyUI websocket frame:', e.message);
      }
    }
  };
  ws.onclose = scheduleWsRetry;
  ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
}
function scheduleWsRetry() {
  clearTimeout(wsTimer);
  if (jobs.size) wsTimer = setTimeout(ensureWs, 2000);
}

function handleWsMessage(msg) {
  const d = msg.data || {};
  const pid = d.prompt_id;
  if (msg.type === 'progress' && pid && jobs.has(pid)) {
    const job = jobs.get(pid);
    const phase = progressDetailsForJob(job, d.node ?? null, d.value, d.max);
    broadcast('progress', {
      jobId: pid,
      profileId: job.profileId,
      value: d.value,
      max: d.max,
      nodeId: d.node ?? null,
      itemId: job.itemId || null,
      ...phase,
    });
  } else if (msg.type === 'executing' && pid && jobs.has(pid)) {
    const job = jobs.get(pid);
    activeWsPromptId = d.node === null ? '' : pid;
    if (job && d.node !== null && !job.startedAt) job.startedAt = Date.now();
    if (d.node === null) completeJob(pid).catch((e) => failJob(pid, e.message));
    else broadcast('status', {
      jobId: pid,
      profileId: job.profileId,
      kind: job.kind,
      text: nodeLabel(pid, d.node),
      itemId: job.itemId || null,
      ...progressPhaseForJob(job, d.node),
    });
  } else if (msg.type === 'execution_error' && pid && jobs.has(pid)) {
    failJob(pid, (d.exception_message || 'execution error') + (d.node_type ? ` (${d.node_type})` : ''));
  } else if (msg.type === 'execution_interrupted' && pid && jobs.has(pid)) {
    const job = jobs.get(pid);
    if (job.cancelRequested) cancelJob(pid, job.cancelMessage || 'Cancelled');
    else failJob(pid, 'Interrupted');
  }
}

function nodeLabel(pid, nodeId) {
  return nodeLabelForJob(jobs.get(pid), nodeId);
}

function handleWsBinary(buf) {
  const preview = decodePreviewPayload(buf);
  if (!preview) return;
  const now = Date.now();
  if (now - lastPreviewAt < 450) return;
  const jobId = preview.metadata?.prompt_id || activeWsPromptId;
  const job = jobs.get(jobId);
  if (!job) return;
  lastPreviewAt = now;
  broadcast('preview', {
    jobId,
    profileId: job.profileId,
    dataUrl: `data:${preview.mime};base64,${preview.image.toString('base64')}`,
  });
}

/* --------------------------- Job lifecycle ------------------------ */

function clearPendingJobState(job) {
  if (!job) return;
  const temporarySourcePath = job.videoChunkSequence?.temporarySourcePath;
  if (temporarySourcePath) {
    job.videoChunkSequence.temporarySourcePath = '';
    fsp.unlink(temporarySourcePath).catch(() => {});
  }
  if (job.kind === 'upscale' && job.itemId) {
    const item = db.items.find((entry) => entry.id === job.itemId);
    if (item && item.upscalePending) {
      item.upscalePending = false;
      saveDb();
    }
  }
}

async function stopComfyPrompt(pid) {
  await comfyFetch('/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delete: [pid] }),
  }).catch(() => { /* prompt may already be running or complete */ });
  let running = false;
  try {
    const queue = await (await comfyFetch('/queue')).json();
    running = (queue.queue_running || []).some((entry) => String(entry?.[1] || '') === pid);
  } catch { /* ComfyUI may be temporarily offline */ }
  if (running) await comfyFetch('/interrupt', { method: 'POST' }).catch(() => { /* noop */ });
  return running;
}

function cancelJob(pid, message = 'Cancelled') {
  const job = jobs.get(pid);
  if (!job) return false;
  const durationMs = jobDurationMs(job);
  failSmartJob(job, message, true);
  jobs.delete(pid);
  clearPendingJobState(job);
  broadcast('jobCancelled', {
    jobId: pid,
    kind: job.kind,
    operation: job.videoInfo ? job.videoInfo.processed : undefined,
    profileId: job.profileId,
    itemId: job.itemId || null,
    message,
    durationMs,
  });
  if (job.kind === 'enhance' || job.kind === 'motionPrompt' || job.kind === 'smartMask') {
    const error = new Error(message);
    error.code = 'job_cancelled';
    job.reject(error);
  }
  return true;
}

function failJob(pid, message) {
  const job = jobs.get(pid);
  const durationMs = job ? jobDurationMs(job) : undefined;
  failSmartJob(job, message, false);
  jobs.delete(pid);
  if (job && (job.kind === 'enhance' || job.kind === 'motionPrompt' || job.kind === 'smartMask')) {
    job.reject(new Error(message));
    return;
  }
  clearPendingJobState(job);
  pushHistory({ kind: 'error', profileId: job ? job.profileId : undefined, itemId: job ? (job.itemId || null) : null, label: `${jobLabel(job)} — ${String(message).slice(0, 80)}` });
  broadcast('jobError', {
    jobId: pid,
    kind: job ? job.kind : 'gen',
    operation: job && job.videoInfo ? job.videoInfo.processed : undefined,
    profileId: job ? job.profileId : undefined,
    itemId: job ? job.itemId : null,
    message,
    durationMs,
  });
}

function findOutputFiles(outputs, extRe) {
  const files = [];
  for (const out of Object.values(outputs)) {
    for (const arr of Object.values(out)) {
      if (!Array.isArray(arr)) continue;
      for (const entry of arr) {
        if (entry && typeof entry === 'object' && typeof entry.filename === 'string'
          && entry.type === 'output' && extRe.test(entry.filename)) {
          files.push(entry);
        }
      }
    }
  }
  return files;
}

async function downloadOutput(entry) {
  return Buffer.from(await (await comfyFetch(
    `/view?filename=${encodeURIComponent(entry.filename)}&subfolder=${encodeURIComponent(entry.subfolder || '')}&type=output`
  )).arrayBuffer());
}

function strengthHuntOutputIndex(entry) {
  const match = String(entry && entry.filename || '').match(/strength_hunt_(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function completeStrengthHuntJob(pid, job, outputFiles, durationMs, textOut) {
  const plan = job.huntPlan;
  const files = [...outputFiles].sort((a, b) => strengthHuntOutputIndex(a) - strengthHuntOutputIndex(b));
  if (!plan || files.length < plan.variants.length) {
    return failJob(pid, `Strength Hunt expected ${plan ? plan.variants.length : 0} images but ComfyUI returned ${files.length}`);
  }
  const createdAt = Date.now();
  const created = [];
  const sheetInputs = [];
  let sourceFile = null;
  const sourceImageName = job.refImageNames && job.refImageNames[0];
  if (sourceImageName && (job.params.mode === 'edit' || job.params.imageName)) {
    try {
      const parts = String(sourceImageName).split('/');
      const fn = parts.pop();
      const sub = parts.join('/');
      const source = Buffer.from(await (await comfyFetch(
        `/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`
      )).arrayBuffer());
      sourceFile = `${plan.id}_src.png`;
      await fsp.writeFile(path.join(IMAGES, sourceFile), source);
    } catch { /* source copy is best-effort */ }
  }
  for (let index = 0; index < plan.variants.length; index += 1) {
    const variant = plan.variants[index];
    const buf = await downloadOutput(files[index]);
    const id = uid();
    const fname = settings.smartFilenames
      ? smartAssetFilename(job.params.prompt, id, '.png', 'strength-hunt')
      : `${id}.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    const dims = pngDims(buf) || {};
    const item = {
      id,
      file: fname,
      name: settings.smartFilenames ? smartGenerationName(job.params.prompt, `Strength Hunt ${index + 1}`) : undefined,
      mode: job.params.mode,
      krea2Turbo: job.params.mode === 't2i' ? job.params.krea2Turbo !== false : undefined,
      imageGuideMode: job.params.mode === 't2i' && job.params.imageName ? job.params.imageGuideMode : undefined,
      depthStrength: job.params.mode === 't2i' && job.params.imageGuideMode === 'depth' ? job.params.depthStrength : undefined,
      styleStrength: job.params.mode === 't2i' && job.params.imageGuideMode === 'style' ? job.params.styleStrength : undefined,
      editEngine: job.params.mode === 'edit' ? (job.params.editEngine || 'klein4') : undefined,
      qwenQuality: job.params.mode === 'edit' && job.params.editEngine === 'qwen'
        ? normalizeQwenEditQuality(job.params.qwenQuality) : undefined,
      krea2RefBoost: job.params.mode === 'edit' && job.params.editEngine === 'krea2ref'
        ? job.params.krea2RefBoost : undefined,
      sourceFile,
      sourceItemId: job.params.sourceItemId || null,
      profileId: job.profileId,
      regions: Array.isArray(job.params.regions) && job.params.regions.length
        ? normalizeRegions(job.params.regions) : undefined,
      prompt: job.params.prompt,
      negativePrompt: job.params.negativePrompt || undefined,
      promptTemplate: job.params.promptTemplate,
      promptPresets: job.params.promptPresets,
      refinedPrompt: job.refinedPrompt || textOut,
      enhance: !!job.params.enhance,
      width: dims.w || job.params.width,
      height: dims.h || job.params.height,
      seed: job.params.seed,
      steps: job.params.steps,
      cfg: job.params.cfg,
      denoise: job.params.denoise,
      batch: 1,
      loras: variant.loras.filter((lora) => lora && lora.on && lora.name),
      refImages: job.refImageNames || [],
      folder: job.params.folder || null,
      createdAt: createdAt + index,
      durationMs,
      upscaled: null,
      video: null,
      generationGroupId: plan.id,
      strengthHunt: {
        id: plan.id,
        axes: plan.axes,
        strengths: variant.strengths,
        row: variant.row,
        column: variant.column,
        label: variant.label,
      },
    };
    created.push(item);
    sheetInputs.push({
      buffer: buf, label: variant.label, strengths: variant.strengths,
      row: variant.row, column: variant.column,
    });
  }
  const model = job.params.mode === 'edit'
    ? ({ qwen: 'Qwen Edit', klein9: 'Flux Klein 9B', krea2: 'Krea 2', krea2ref: 'Krea 2 Edit', krea2remix: 'Krea 2 Remix' }[job.params.editEngine] || 'Flux Klein 4B')
    : (job.params.krea2Turbo === false ? 'Krea 2 Raw' : 'Krea 2 Turbo');
  const documentationInfo = {
    columns: plan.columns,
    rows: plan.rows,
    prompt: job.params.prompt,
    seed: job.params.seed,
    cfg: job.params.cfg,
    steps: job.params.steps,
    model,
    axes: plan.axes,
  };
  const documentation = buildStrengthHuntSheet(sheetInputs, documentationInfo);
  const compositeId = uid();
  const compositeFile = settings.smartFilenames
    ? smartAssetFilename(job.params.prompt, compositeId, '.png', 'strength-hunt-documentation')
    : `${compositeId}_strength_hunt.png`;
  await fsp.writeFile(path.join(IMAGES, compositeFile), documentation.buffer);
  const layouts = {
    row: { file: compositeFile, width: documentation.width, height: documentation.height },
  };
  if (plan.axes.length === 1) {
    const squareColumns = Math.ceil(Math.sqrt(sheetInputs.length));
    const squareRows = Math.ceil(sheetInputs.length / squareColumns);
    const squareDocumentation = buildStrengthHuntSheet(sheetInputs.map((entry) => ({
      buffer: entry.buffer,
      label: entry.label,
      strengths: entry.strengths,
    })), {
      ...documentationInfo,
      columns: squareColumns,
      rows: squareRows,
      squareCanvas: true,
      desiredTileWidth: 512,
    });
    const squareId = uid();
    const squareFile = settings.smartFilenames
      ? smartAssetFilename(job.params.prompt, squareId, '.png', 'strength-hunt-square')
      : `${compositeId}_strength_hunt_square.png`;
    await fsp.writeFile(path.join(IMAGES, squareFile), squareDocumentation.buffer);
    layouts.square = {
      file: squareFile,
      width: squareDocumentation.width,
      height: squareDocumentation.height,
    };
  }
  const composite = {
    id: compositeId,
    file: compositeFile,
    name: settings.smartFilenames ? smartGenerationName(job.params.prompt, 'LoRA Strength Hunt') : undefined,
    mode: 'composite',
    compositeInfo: {
      type: 'strength-hunt',
      label: 'LoRA Strength Hunt',
      axes: plan.axes,
      count: created.length,
    },
    profileId: job.profileId,
    prompt: job.params.prompt,
    negativePrompt: job.params.negativePrompt || undefined,
    promptTemplate: job.params.promptTemplate,
    promptPresets: job.params.promptPresets,
    refinedPrompt: job.refinedPrompt || textOut,
    width: documentation.width,
    height: documentation.height,
    seed: job.params.seed,
    steps: job.params.steps,
    cfg: job.params.cfg,
    denoise: job.params.denoise,
    loras: job.params.loras.filter((lora) => lora && lora.on && lora.name),
    refImages: job.refImageNames || [],
    folder: job.params.folder || null,
    createdAt: createdAt + plan.variants.length + 1,
    durationMs,
    generationGroupId: plan.id,
    strengthHunt: {
      id: plan.id,
      axes: plan.axes,
      documentation: true,
      count: created.length,
      layouts,
    },
    upscaled: null,
    video: null,
  };
  db.items.unshift(composite, ...created.slice().reverse());
  saveDb();
  pushHistory({
    kind: 'gen', profileId: job.profileId, itemId: composite.id, durationMs,
    label: `LoRA Strength Hunt · ${created.length} comparisons: ${(job.params.prompt || '').slice(0, 50)}`,
  });
  jobs.delete(pid);
  broadcast('jobDone', { jobId: pid, items: [composite, ...created], strengthHunt: true, count: created.length });
}

async function queueNextVideoChunk(job) {
  const sequence = job && job.videoChunkSequence;
  if (!sequence || sequence.index >= sequence.segments.length - 1) return null;
  const nextIndex = sequence.index + 1;
  const nextSegment = sequence.segments[nextIndex];
  if (sequence.type === 'wan-animate2') {
    const nextOpts = Object.assign({}, sequence.opts, {
      seed: (Number(sequence.opts.seed) + nextIndex) % (2 ** 48),
      makePoster: false,
      wanAnimate2Segment: nextSegment,
      continuationImageName: sequence.continuationImageName,
      saveContinuationFrame: nextIndex < sequence.segments.length - 1,
    });
    const graph = await buildWanAnimate2Graph(sequence.referenceImageName, nextOpts, settings, {
      nodeFromOrdered, filterInputs,
    });
    const nextPid = await queuePrompt(graph, { profileId: job.profileId });
    trackJob(nextPid, {
      kind: 'video',
      profileId: job.profileId,
      itemId: job.itemId || null,
      createItem: job.createItem,
      graph,
      videoInfo: job.videoInfo,
      thumbnailName: job.thumbnailName,
      videoChunkSequence: Object.assign({}, sequence, { index: nextIndex }),
    });
    ensureWs();
    return nextPid;
  }
  const nextOpts = sequence.type === 'long-context'
    ? Object.assign({}, sequence.opts, {
      prompt: h3LongContextSegmentPrompt(sequence.basePrompt, nextSegment, sequence.segments.length),
      frames: nextSegment.generationFrames,
      seed: (Number(sequence.opts.seed) + nextIndex) % (2 ** 48),
      makePoster: false,
      firstImageName: null,
      endImageName: nextIndex === sequence.segments.length - 1 ? sequence.finalEndImageName : null,
      longContext: { chainId: sequence.chainId, clipIndex: nextIndex },
      turboReferenceSegment: sequence.turboReferenceVideo ? nextSegment : null,
    })
    : Object.assign({}, sequence.opts, {
      makePoster: false,
      turboReferenceSegment: nextSegment,
    });
  const graph = await buildMiniMaxH3Graph(nextOpts, settings, {
    nodeFromOrdered, filterInputs, rtxVideoSuperResolutionNode,
  });
  const nextPid = await queuePrompt(graph, { profileId: job.profileId });
  trackJob(nextPid, {
    kind: 'video',
    profileId: job.profileId,
    itemId: job.itemId || null,
    createItem: job.createItem,
    graph,
    videoInfo: job.videoInfo,
    thumbnailName: job.thumbnailName,
    videoChunkSequence: Object.assign({}, sequence, { index: nextIndex }),
  });
  ensureWs();
  return nextPid;
}

async function completeJob(pid) {
  const job = jobs.get(pid);
  if (!job) return;
  if (job.kind === 'smartMask') {
    // Keep this job in the Map until its output has been verified. The old
    // lifecycle removed it before checking /history, so a missing or delayed
    // SAM3 output could not reject the waiting browser request and appeared
    // to be stuck until its timeout.
    if (job.completing) return;
    job.completing = true;
    const res = await comfyFetch(`/history/${pid}`);
    const hist = (await res.json())[pid];
    if (!hist) return failJob(pid, 'SAM3 finished but ComfyUI did not return its history entry. Try again after ComfyUI is idle.');
    const files = findOutputFiles(hist.outputs || {}, /\.(png|jpg|jpeg|webp)$/i);
    if (!files.length) return failJob(pid, 'SAM3 finished without a mask image. Check the ComfyUI console for the SAM3 node error.');
    broadcast('status', { jobId: pid, kind: 'smartMask', profileId: job.profileId, text: 'Reading selected mask…', itemId: null });
    const dataUrls = await Promise.all(files.map(async (entry) => {
      const buf = await downloadOutput(entry);
      const ext = path.extname(entry.filename).toLowerCase();
      const mime = ext === '.webp' ? 'image/webp' : (ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png');
      return `data:${mime};base64,${buf.toString('base64')}`;
    }));
    jobs.delete(pid);
    broadcast('status', { jobId: pid, kind: 'smartMask', profileId: job.profileId, text: 'Mask ready', itemId: null });
    job.resolve({ dataUrl: dataUrls[0], dataUrls });
    return;
  }
  // ComfyUI removes a prompt from /queue before Mix Studio has downloaded
  // and saved its outputs. Keep the tracked job authoritative during that
  // finalization window so a resumed browser does not clear it too early.
  if (job.completing) return;
  job.completing = true;
  let durationMs = jobDurationMs(job);
  const res = await comfyFetch(`/history/${pid}`);
  const hist = (await res.json())[pid];
  if (!hist) return failJob(pid, 'No history entry from ComfyUI');
  const outputs = hist.outputs || {};

  // text output (PreviewAny)
  let textOut = null;
  for (const out of Object.values(outputs)) {
    if (out && Array.isArray(out.text) && out.text.length) textOut = String(out.text[0]);
  }

  if (job.kind === 'enhance' || job.kind === 'motionPrompt') {
    if (textOut === null) return failJob(pid, 'Prompt enhance produced no text');
    jobs.delete(pid);
    job.resolve(textOut);
    return;
  }

  if (job.kind === 'video') {
    const vids = findOutputFiles(outputs, /\.(mp4|webm|mov|mkv)$/i);
    if (!vids.length) return failJob(pid, 'ComfyUI produced no video file');
    let buf = await downloadOutput(vids[vids.length - 1]);
    const videoChunkSequence = job.videoChunkSequence;
    if (videoChunkSequence) {
      videoChunkSequence.chunkBuffers[videoChunkSequence.index] = buf;
      if (videoChunkSequence.index === 0 && job.createItem && !videoChunkSequence.posterBuffer) {
        const posters = findOutputFiles({ poster_save: outputs.poster_save || {} }, /\.(png|jpg|jpeg|webp)$/i);
        if (posters.length) videoChunkSequence.posterBuffer = await downloadOutput(posters[0]);
      }
      if (videoChunkSequence.index < videoChunkSequence.segments.length - 1) {
        try {
          if (videoChunkSequence.type === 'wan-animate2') {
            const continuationFiles = findOutputFiles({
              continuation_save: outputs.continuation_save || {},
            }, /\.(png|jpg|jpeg|webp)$/i);
            if (!continuationFiles.length) {
              throw new Error('ComfyUI did not save the continuation frame');
            }
            const continuationBuffer = await downloadOutput(continuationFiles[0]);
            videoChunkSequence.continuationImageName = await uploadToComfy(
              continuationBuffer,
              `ks_wan_continue_${videoChunkSequence.id}_${videoChunkSequence.index + 1}.png`,
            );
          }
          const nextJobId = await queueNextVideoChunk(job);
          updateSmartChunkJob(job, nextJobId, videoChunkSequence.index + 1, videoChunkSequence.segments.length);
          jobs.delete(pid);
          broadcast('videoChunkStep', {
            jobId: pid,
            nextJobId,
            profileId: job.profileId,
            completedChunk: videoChunkSequence.index + 1,
            nextChunk: videoChunkSequence.index + 2,
            total: videoChunkSequence.segments.length,
            sequenceKind: videoChunkSequence.type || 'turbo-reference',
          });
        } catch (error) {
          const label = videoChunkSequence.type === 'wan-animate2' ? 'Wan Animate 2 clip' : 'MiniMax H3 chunk';
          return failJob(pid, `${label} ${videoChunkSequence.index + 2} could not start: ${error.message}`);
        }
        return;
      }
      broadcast('status', {
        jobId: pid,
        profileId: job.profileId,
        kind: 'video',
        text: videoChunkSequence.type === 'wan-animate2'
          ? 'Joining Wan Animate 2 clips…'
          : (videoChunkSequence.type === 'long-context'
            ? 'Joining H3 long-context clips…'
            : 'Joining H3 video chunks…'),
        itemId: job.itemId || null,
      });
      try {
        const ffmpegPath = await resolveFfmpegExecutable(RUNTIME);
        if (videoChunkSequence.chunkBuffers.length !== videoChunkSequence.segments.length
          || videoChunkSequence.chunkBuffers.some((chunk) => !chunk)) {
          throw new Error('One or more generated chunks are missing');
        }
        buf = videoChunkSequence.type === 'wan-animate2'
          ? await joinWanAnimate2Chunks({
            chunkBuffers: videoChunkSequence.chunkBuffers,
            segments: videoChunkSequence.segments,
            fps: videoChunkSequence.fps,
            width: videoChunkSequence.width,
            height: videoChunkSequence.height,
            audioSourcePath: videoChunkSequence.audioSourcePath,
            sourceHasAudio: videoChunkSequence.sourceHasAudio,
            ffmpegPath,
          })
          : await joinVideoChunks({
            chunkBuffers: videoChunkSequence.chunkBuffers,
            segments: videoChunkSequence.segments,
            fps: videoChunkSequence.fps,
            width: videoChunkSequence.width,
            height: videoChunkSequence.height,
            ffmpegPath,
          });
        durationMs = Math.max(jobDurationMs(job), Date.now() - videoChunkSequence.startedAt);
        if (videoChunkSequence.type === 'wan-animate2' && videoChunkSequence.temporarySourcePath) {
          await fsp.unlink(videoChunkSequence.temporarySourcePath).catch(() => {});
          videoChunkSequence.temporarySourcePath = '';
        }
      } catch (error) {
        return failJob(pid, error.message || 'Could not join the generated H3 video chunks');
      }
    }
    if (job.extensionJoin) {
      broadcast('status', {
        jobId: pid,
        profileId: job.profileId,
        kind: 'video',
        text: 'Joining video extension…',
        itemId: job.itemId || null,
      });
      try {
        buf = await joinVideoExtension(Object.assign({}, job.extensionJoin, { tailBuffer: buf }));
        durationMs = jobDurationMs(job);
      } catch (error) {
        return failJob(pid, error.message || 'Could not join the generated video extension');
      }
    }
    const completedRefinedMotionPrompt = cleanEnhancedText(textOut, '')
      || (job.videoInfo && job.videoInfo.refinedMotionPrompt)
      || null;
    let item;
    if (job.itemId) {
      item = db.items.find((it) => it.id === job.itemId && it.profileId === job.profileId);
      if (!item) return failJob(pid, 'Gallery item no longer exists');
    } else {
      // standalone video (Video tab): create a gallery item with a poster frame
      const id = uid();
      const videoPrompt = job.videoInfo.motionPrompt || '';
      const posterName = settings.smartFilenames
        ? smartAssetFilename(videoPrompt, id, '.png', 'video')
        : `${id}.png`;
      const posters = findOutputFiles(outputs, /\.(png|jpg|jpeg|webp)$/i);
      const pbuf = videoChunkSequence?.posterBuffer
        || (posters.length ? await downloadOutput(posters[0]) : BLANK_PNG);
      await fsp.writeFile(path.join(IMAGES, posterName), pbuf);
      item = {
        id,
        file: posterName,
        name: settings.smartFilenames ? smartGenerationName(videoPrompt, 'Untitled video') : undefined,
        mode: 'video',
        profileId: job.profileId,
        prompt: job.videoInfo.motionPrompt,
        negativePrompt: job.videoInfo.negativePrompt || undefined,
        promptTemplate: job.videoInfo.promptTemplate,
        promptPresets: job.videoInfo.promptPresets,
        refinedPrompt: completedRefinedMotionPrompt,
        enhance: !!job.videoInfo.enhance,
        width: job.videoInfo.width,
        height: job.videoInfo.height,
        seed: job.videoInfo.seed,
        steps: null, cfg: null, denoise: null,
        loras: [], refImages: [],
        folder: null,
        createdAt: Date.now(),
        upscaled: null,
        videos: [],
      };
      db.items.unshift(item);
    }
    const videoId = uid();
    const fname = settings.smartFilenames
      ? smartAssetFilename(job.videoInfo.motionPrompt, videoId, '.mp4', 'video')
      : `${item.id}_${Date.now()}.mp4`;
    const storedVideoPath = path.join(VIDEOS, fname);
    await fsp.writeFile(storedVideoPath, buf);
    const completedVideoInfo = Object.assign({}, job.videoInfo, {
      refinedMotionPrompt: completedRefinedMotionPrompt,
      durationMs,
    });
    if (completedVideoInfo.engine === 'wan-animate2') {
      try {
        const ffmpegPath = await resolveFfmpegExecutable(RUNTIME);
        const probe = await probeVideoFile(storedVideoPath, ffmpegPath);
        Object.assign(completedVideoInfo, {
          frames: probe.frames,
          fps: probe.fps,
          seconds: probe.durationSeconds,
          width: probe.width,
          height: probe.height,
          exactFrameCount: true,
          driveDurSeconds: probe.durationSeconds,
        });
      } catch { /* The saved video remains valid; browser metadata is the fallback. */ }
    }
    const entry = {
      id: videoId,
      file: fname,
      createdAt: Date.now(),
      info: completedVideoInfo,
    };
    item.videos = (Array.isArray(item.videos) ? item.videos : []).concat([entry]);
    completeSmartJob(job, [item]);
    saveDb();
    const videoActionLabel = job.videoInfo.processed === 'upscale'
      ? `Video upscale (${{ seedvr2: 'SeedVR2', rtx: 'RTX' }[job.videoInfo.upscaleEngine] || 'RTX'})`
      : (job.videoInfo.processed === 'interpolate'
        ? 'Frame interpolation'
        : (job.videoInfo.processed === 'extend' ? 'Video extension' : (job.videoInfo.composite ? 'Side-by-side' : 'Video')));
    pushHistory({
      kind: 'video', profileId: job.profileId, itemId: item.id, videoId: entry.id, durationMs,
      label: `${videoActionLabel} (${{ ltx25: 'LTX 2.5', h3: 'MiniMax H3', wan: 'Wan 2.2', 'wan-animate2': 'Wan Animate 2', eros: '10Eros', scail: 'SCAIL 2' }[job.videoInfo.engine] || 'LTX 2.3'}): ${(job.videoInfo.motionPrompt || '').slice(0, 60)}`,
    });
    jobs.delete(pid);
    broadcast('videoDone', { jobId: pid, item });
    return;
  }

  const files = findOutputFiles(outputs, /\.(png|jpg|jpeg|webp)$/i);
  if (!files.length) return failJob(pid, 'ComfyUI produced no output images');

  if (job.kind === 'loraHunt') {
    return completeStrengthHuntJob(pid, job, files, durationMs, textOut);
  }

  if (job.kind === 'upscale') {
    const buf = await downloadOutput(files[0]);
    const item = db.items.find((it) => it.id === job.itemId);
    if (!item) return failJob(pid, 'Gallery item no longer exists');
    const fname = `${item.id}_up.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    item.upscaled = fname;
    item.upscalePending = false;
    item.upscaleInfo = job.upscaleInfo;
    item.upscaleDurationMs = durationMs;
    saveDb();
    pushHistory({ kind: 'upscale', profileId: job.profileId, itemId: item.id, durationMs, label: `Upscaled: ${(item.prompt || '').slice(0, 60)}` });
    jobs.delete(pid);
    broadcast('upscaleDone', { jobId: pid, item });
    return;
  }

  if (job.kind === 'imageComposite') {
    const buf = await downloadOutput(files[0]);
    const info = job.compositeInfo || {};
    const id = uid();
    const fname = settings.smartFilenames
      ? smartAssetFilename(info.prompt, id, '.png', 'composite')
      : `${id}_composite.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    const dims = pngDims(buf) || {};
    // Source/result composites belong to the generation they document.
    // Keeping them on that item makes the gallery read as one coherent
    // generation rather than a second, disconnected card.
    if (['before-after', 'reference-generation', 'depth-map'].includes(info.type) && info.sourceItemId) {
      const parent = db.items.find((it) => it.id === info.sourceItemId && it.profileId === job.profileId);
      if (!parent) return failJob(pid, 'Composite source item no longer exists');
      const composite = {
        id,
        file: fname,
        type: info.type,
        label: info.label || (info.type === 'reference-generation' ? 'Reference + generation'
          : (info.type === 'depth-map' ? 'Source + depth + generation' : 'Before + after')),
        createdAt: Date.now(),
        width: dims.w || info.width || parent.width || 1024,
        height: dims.h || info.height || parent.height || 1024,
        durationMs,
        sourceFiles: Array.isArray(info.sourceFiles) ? info.sourceFiles : undefined,
      };
      parent.composites = (Array.isArray(parent.composites) ? parent.composites : []).concat([composite]);
      saveDb();
      pushHistory({ kind: 'composite', profileId: job.profileId, itemId: parent.id, durationMs, label: `${composite.label}: ${(parent.prompt || '').slice(0, 60)}` });
      jobs.delete(pid);
      broadcast('imageCompositeDone', { jobId: pid, item: parent, composite });
      return;
    }
    const item = {
      id,
      file: fname,
      name: settings.smartFilenames ? smartGenerationName(info.prompt, 'Untitled composite') : undefined,
      mode: 'composite',
      compositeInfo: info,
      profileId: job.profileId,
      prompt: info.prompt || '',
      width: dims.w || info.width || 1024,
      height: dims.h || info.height || 1024,
      seed: null,
      steps: null,
      cfg: null,
      denoise: null,
      loras: [],
      refImages: [],
      folder: info.folder || null,
      createdAt: Date.now(),
      durationMs,
      upscaled: null,
      video: null,
    };
    db.items.unshift(item);
    saveDb();
    pushHistory({ kind: 'composite', profileId: job.profileId, itemId: item.id, durationMs, label: `${info.label || 'Image composite'}: ${(item.prompt || '').slice(0, 60)}` });
    jobs.delete(pid);
    broadcast('jobDone', { jobId: pid, items: [item] });
    return;
  }

  const editSequence = job.params.editSequence;
  const sequenceFinal = !editSequence || editSequence.index >= editSequence.prompts.length - 1;
  const created = [];
  for (const img of files) {
    const buf = await downloadOutput(img);
    const id = uid();
    const fname = settings.smartFilenames
      ? smartAssetFilename(job.params.prompt, id, '.png', job.params.mode === 'edit' ? 'edit' : 'image')
      : `${id}.png`;
    await fsp.writeFile(path.join(IMAGES, fname), buf);
    // Keep a durable copy of edit and image-to-image sources so gallery
    // reuse still works if ComfyUI's input folder is later cleaned.
    let sourceFile = null;
    const sourceImageName = job.refImageNames && job.refImageNames[0];
    if (sourceImageName && (job.params.mode === 'edit' || job.params.imageName)) {
      try {
        const parts = String(sourceImageName).split('/');
        const fn = parts.pop();
        const sub = parts.join('/');
        const sbuf = Buffer.from(await (await comfyFetch(
          `/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`
        )).arrayBuffer());
        sourceFile = `${id}_src.png`;
        await fsp.writeFile(path.join(IMAGES, sourceFile), sbuf);
      } catch { /* source copy is best-effort */ }
    }
    // Resolve this immediately before insertion so a rename that lands while
    // output/source files are downloading is inherited by the late result.
    const inheritedAngleGroupName = job.params.angleGroupId
      ? normalizeGenerationName(db.items.find((item) => item.profileId === job.profileId
        && item.angleGroupId === job.params.angleGroupId
        && item.angleGroupName)?.angleGroupName)
      : '';
    const item = {
      id,
      file: fname,
      name: settings.smartFilenames
        ? smartGenerationName(job.params.prompt, job.params.mode === 'edit' ? 'Untitled edit' : 'Untitled image')
        : undefined,
      mode: job.params.mode,
      krea2Turbo: job.params.mode === 't2i' ? job.params.krea2Turbo !== false : undefined,
      krea2RawTurboLora: job.params.mode === 't2i' ? job.params.krea2RawTurboLora : undefined,
      imageGuideMode: job.params.mode === 't2i' && job.params.imageName ? job.params.imageGuideMode : undefined,
      depthStrength: job.params.mode === 't2i' && job.params.imageGuideMode === 'depth' ? job.params.depthStrength : undefined,
      styleStrength: job.params.mode === 't2i' && job.params.imageGuideMode === 'style' ? job.params.styleStrength : undefined,
      editEngine: job.params.mode === 'edit' ? (job.params.editEngine || 'klein4') : undefined,
      qwenQuality: job.params.mode === 'edit' && job.params.editEngine === 'qwen'
        ? normalizeQwenEditQuality(job.params.qwenQuality) : undefined,
      krea2RefBoost: job.params.mode === 'edit' && ['krea2ref', 'krea2'].includes(job.params.editEngine)
        ? job.params.krea2RefBoost : undefined,
      editSequence: job.params.editSequence ? {
        id: job.params.editSequence.id,
        index: job.params.editSequence.index,
        total: job.params.editSequence.total,
      } : undefined,
      angleView: job.params.qwenAngle || undefined,
      anglePrompt: job.params.anglePrompt || undefined,
      angleGroupId: job.params.angleGroupId || undefined,
      angleGroupName: inheritedAngleGroupName || undefined,
      editAspectOverride: job.params.mode === 'edit' ? !!job.params.editAspectOverride : undefined,
      editOutpaint: job.params.mode === 'edit' && job.params.editOutpaint ? {
        position: normalizeOutpaintPosition(job.params.editOutpaintPosition),
        offsetX: job.params.editOutpaintOffsetX,
        offsetY: job.params.editOutpaintOffsetY,
        scale: job.params.editOutpaintScale,
        feather: job.params.editOutpaintFeather,
        maskOffset: job.params.editOutpaintMaskOffset,
        preserveMask: !!job.params.maskImageName,
        effectiveScale: job.params.editOutpaintEffectiveScale,
        axis: job.params.editOutpaintAxis,
        padding: job.params.editOutpaintPadding,
        finalPadding: job.params.editOutpaintFinalPadding,
        finalWidth: job.params.editOutpaintFinalWidth,
        finalHeight: job.params.editOutpaintFinalHeight,
        nativePreserve: job.params.composite === true,
        tiledRefine: job.params.editOutpaintRefine === true,
        canvasLimited: job.params.editOutpaintCanvasLimited === true,
      } : undefined,
      composite: job.params.mode === 'edit' ? !!job.params.composite : undefined,
      maskImageName: job.params.mode === 'edit' ? (job.params.maskImageName || undefined) : undefined,
      editMaskMode: job.params.mode === 'edit' && job.params.maskImageName ? job.params.editMaskMode : undefined,
      editMaskFeather: job.params.mode === 'edit' && job.params.maskImageName && !job.params.editOutpaint ? job.params.editMaskFeather : undefined,
      editMaskInvert: job.params.mode === 'edit' && job.params.maskImageName && !job.params.editOutpaint ? job.params.editMaskInvert : undefined,
      editMaskInfluence: job.params.mode === 'edit' && job.params.maskImageName && !job.params.editOutpaint ? job.params.maskInfluence : undefined,
      editMaskExpand: job.params.mode === 'edit' && job.params.maskImageName && !job.params.editOutpaint ? job.params.maskExpand : undefined,
      postUpscale: job.params.postUpscale && sequenceFinal ? job.params.postUpscale : undefined,
      sourceFile,
      sourceItemId: job.params.sourceItemId || null,
      profileId: job.profileId,
      regions: Array.isArray(job.params.regions) && job.params.regions.length
        ? normalizeRegions(job.params.regions) : undefined,
      prompt: job.params.prompt,
      negativePrompt: job.params.negativePrompt || undefined,
      promptTemplate: job.params.promptTemplate,
      promptPresets: job.params.promptPresets,
      refinedPrompt: job.refinedPrompt || textOut,
      enhance: !!job.params.enhance,
      width: (pngDims(buf) || {}).w || job.params.width,
      height: (pngDims(buf) || {}).h || job.params.height,
      seed: job.params.seed,
      steps: job.params.steps,
      cfg: job.params.cfg,
      denoise: job.params.denoise,
      batch: job.params.batch,
      loras: (job.params.loras || []).filter((l) => l.on && l.name),
      refImages: job.refImageNames || [],
      folder: job.params.folder || null,
      createdAt: Date.now(),
      durationMs,
      upscaled: null,
      video: null,
    };
    db.items.unshift(item);
    created.push(item);
  }
  saveDb();
  if (job.params.postUpscale && sequenceFinal) {
    for (const item of created) {
      try {
        await queuePostUpscale(item, job.params.postUpscale, job.profileId);
      } catch (error) {
        console.error('[Mix Studio] Could not queue SeedVR2 finish upscale:', error.message);
      }
    }
    saveDb();
  }
  for (const it of created) {
    pushHistory({ kind: it.mode === 'edit' ? 'edit' : 'gen', profileId: job.profileId, itemId: it.id, durationMs, label: `${it.mode === 'edit' ? 'Edit' : 'Create'}: ${(it.prompt || '').slice(0, 60)}` });
  }
  completeSmartJob(job, created);
  if (editSequence && !sequenceFinal) {
    try {
      const next = await queueNextSequentialEdit(job, created[0]);
      jobs.delete(pid);
      broadcast('sequenceStep', {
        jobId: pid,
        nextJobId: next.pid,
        profileId: job.profileId,
        items: created,
        completedStep: editSequence.index + 1,
        nextStep: editSequence.index + 2,
        total: editSequence.total,
      });
    } catch (error) {
      jobs.delete(pid);
      const message = `Sequential edit stopped after step ${editSequence.index + 1}: ${error.message}`;
      pushHistory({ kind: 'error', profileId: job.profileId, itemId: created[0] && created[0].id, label: message.slice(0, 120) });
      broadcast('jobError', { jobId: pid, kind: 'gen', profileId: job.profileId, itemId: created[0] && created[0].id, items: created, message, durationMs });
    }
  } else {
    jobs.delete(pid);
    broadcast('jobDone', { jobId: pid, items: created, sequenceComplete: !!editSequence });
  }
}

/* Polling fallback: no native WebSocket (Node < 22) OR the WS connection is down. */
setInterval(async () => {
  if (!jobs.size) return;
  const socketOpen = typeof WebSocket !== 'undefined' && ws && ws.readyState === 1;
  const socketStale = socketOpen && Date.now() - lastWsMessageAt > 15_000;
  const needsTextReconciliation = [...jobs.values()]
    .some((job) => ['enhance', 'motionPrompt', 'smartMask'].includes(job.kind));
  // Video encoding/SaveVideo can finish without the browser process receiving
  // ComfyUI's final executing(node:null) event. Reconcile video history even
  // while the socket looks healthy so a missed terminal event cannot strand it.
  const needsVideoReconciliation = [...jobs.values()].some((job) => job.kind === 'video');
  if (socketOpen && !socketStale && !needsTextReconciliation && !needsVideoReconciliation) return;
  if (socketStale) {
    resetComfyTransport();
    ensureWs();
  }
  for (const pid of [...jobs.keys()]) {
    try {
      const hist = (await (await comfyFetch(`/history/${pid}`)).json())[pid];
      if (hist && hist.status && hist.status.completed) await completeJob(pid);
      else if (hist && hist.status && hist.status.status_str === 'error') failJob(pid, 'Execution error (see ComfyUI console)');
    } catch (error) {
      if (jobs.get(pid)?.completing) failJob(pid, error.message || 'Could not finalize ComfyUI output');
      // Otherwise ComfyUI is temporarily offline; retry on the next poll.
    }
  }
}, 2500);

/* ------------------------------------------------------------------ */
/* Prompt enhance (two-pass): run TextGenerate alone, sanitize the     */
/* output in Node, then feed the clean text to the image job.          */
/* ------------------------------------------------------------------ */

function cleanEnhancedText(raw, fallback) {
  return cleanGeneratedPrompt(raw, fallback);
}

const MAX_EXTERNAL_LLM_IMAGE_BYTES = 20 * 1024 * 1024;

function configuredExternalLlm() {
  return externalLlmProviderConfig(Object.assign({}, settings, {
    externalLlmOpenAiApiKey: settings.externalLlmOpenAiApiKey || process.env.OPENAI_API_KEY || '',
    externalLlmGeminiApiKey: settings.externalLlmGeminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
  }));
}

function configuredSmartPlannerLlm() {
  const provider = configuredExternalLlm();
  if (provider.provider !== 'local') return provider;
  const planner = smartPlannerPromptAiConfig(settings);
  return Object.assign({}, provider, {
    model: planner.model,
    type: planner.type,
    label: planner.override ? 'Local ComfyUI · Smart model' : provider.label,
  });
}

const SMART_RUN_LIMIT = 50;
const SMART_AUDIO_LIMIT = 25 * 1024 * 1024;

function smartRunForProfile(id, profileId) {
  return db.smartRuns.find((run) => run.id === id && run.profileId === profileId) || null;
}

function smartStepResultItems(step, profileId) {
  const ids = new Set(Array.isArray(step?.resultItemIds) ? step.resultItemIds : []);
  return db.items.filter((item) => ids.has(item.id) && item.profileId === profileId);
}

function publicSmartRun(run) {
  if (!run) return null;
  return {
    id: run.id,
    profileId: run.profileId,
    title: run.plan?.title || 'Smart production',
    brief: String(run.brief || run.plan?.summary || '').slice(0, 8000),
    status: run.status,
    error: run.error || '',
    plan: run.plan,
    planHash: run.planHash,
    references: normalizeSmartReferences(run.references),
    reviewReference: run.reviewReference === true,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    steps: (run.steps || []).map((step) => {
      const items = smartStepResultItems(step, run.profileId);
      return {
        id: step.id,
        kind: step.kind,
        sceneIndex: Number.isInteger(step.sceneIndex) ? step.sceneIndex : null,
        clip: step.clip || null,
        referenceState: step.referenceState || null,
        label: step.label,
        status: step.status,
        dependsOn: step.dependsOn || [],
        jobId: step.jobId || null,
        resultItemIds: step.resultItemIds || [],
        progress: step.progress || null,
        error: step.error || '',
        result: items[0] ? {
          itemId: items[0].id,
          thumbnail: `/images/${encodeURIComponent(items[0].file)}`,
          width: items[0].width,
          height: items[0].height,
          videoId: items[0].videos?.at(-1)?.id || null,
        } : null,
      };
    }),
  };
}

function broadcastSmartRun(run) {
  run.updatedAt = Date.now();
  saveDb();
  broadcast('smartRunUpdated', { profileId: run.profileId, run: publicSmartRun(run) });
}

function retainSmartRuns(profileId) {
  const own = db.smartRuns
    .filter((run) => run.profileId === profileId)
    .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0));
  if (own.length <= SMART_RUN_LIMIT) return;
  const keep = new Set(own.slice(0, SMART_RUN_LIMIT).map((run) => run.id));
  db.smartRuns = db.smartRuns.filter((run) => run.profileId !== profileId || keep.has(run.id));
}

function smartRunFinished(run) {
  return ['complete', 'failed', 'cancelled'].includes(run?.status);
}

async function smartReferenceForStep(run, step) {
  const dependency = (run.steps || []).find((candidate) => step.dependsOn?.includes(candidate.id)
    && candidate.kind === 'reference');
  const item = dependency && smartStepResultItems(dependency, run.profileId)[0];
  if (!item?.file) throw new Error('The canonical reference image is unavailable');
  const buffer = await fsp.readFile(path.join(IMAGES, item.file));
  const comfyName = await uploadToComfy(buffer, `ks_smart_reference_${run.id}_${item.id}.png`);
  return {
    name: comfyName,
    label: dependency.referenceState?.label || 'Canonical reference',
    w: item.width || 1024,
    h: item.height || 1024,
  };
}

function currentSmartStepRequest(run, step) {
  const compiled = compileSmartSteps(run.plan, {}, run.references);
  let current = null;
  if (step.kind === 'video') {
    current = compiled.find((candidate) => candidate.kind === 'video'
      && candidate.sceneIndex === step.sceneIndex);
  } else if (step.kind === 'reference') {
    const stateId = step.referenceState?.id;
    current = compiled.find((candidate) => candidate.kind === 'reference'
      && (!stateId || candidate.referenceState?.id === stateId));
  } else {
    current = compiled.find((candidate) => candidate.kind === step.kind);
  }
  return current?.request || step.request;
}

async function advanceSmartRun(run) {
  if (!run || smartRunFinished(run) || run.status === 'review') return;
  if ((run.steps || []).some((step) => ['running', 'queueing'].includes(step.status))) return;
  const step = (run.steps || []).find((candidate) => candidate.status === 'pending'
    && (candidate.dependsOn || []).every((id) => run.steps.some((dependency) => dependency.id === id && dependency.status === 'complete')));
  if (!step) {
    if ((run.steps || []).every((candidate) => candidate.status === 'complete')) {
      run.status = 'complete';
      run.error = '';
      broadcastSmartRun(run);
    }
    return;
  }
  const profile = db.profiles.find((candidate) => candidate.id === run.profileId);
  if (!profile) {
    run.status = 'failed';
    run.error = 'The profile for this Smart production no longer exists.';
    broadcastSmartRun(run);
    return;
  }
  run.status = 'queueing';
  run.error = '';
  step.status = 'queueing';
  step.error = '';
  broadcastSmartRun(run);
  try {
    step.request = currentSmartStepRequest(run, step);
    const body = JSON.parse(JSON.stringify(step.request.body));
    if (step.kind === 'video' && step.dependsOn?.length) {
      const reference = await smartReferenceForStep(run, step);
      body.h3References = { images: [reference], videos: [], audios: [] };
    }
    const queued = await mcpOwnerApi(profile, step.request.route, body);
    const jobId = String(queued.jobId || '');
    if (!jobId) throw new Error('Mix Studio did not return a queued job');
    step.jobId = jobId;
    step.status = 'running';
    run.status = 'running';
    const tracked = jobs.get(jobId);
    if (tracked) {
      tracked.smartRunId = run.id;
      tracked.smartStepId = step.id;
    }
    broadcastSmartRun(run);
  } catch (error) {
    step.status = 'failed';
    step.error = String(error.message || error).slice(0, 1000);
    run.status = 'failed';
    run.error = step.error;
    broadcastSmartRun(run);
  }
}

function completeSmartJob(job, items) {
  if (!job?.smartRunId || !job.smartStepId) return;
  const run = smartRunForProfile(job.smartRunId, job.profileId);
  if (!run || run.status === 'cancelled') return;
  const step = run.steps.find((candidate) => candidate.id === job.smartStepId);
  if (!step) return;
  const resultItems = (items || []).filter(Boolean);
  for (const item of resultItems) {
    item.smartRunId = run.id;
    item.smartStepId = step.id;
  }
  step.status = 'complete';
  step.jobId = null;
  step.progress = null;
  step.error = '';
  step.resultItemIds = resultItems.map((item) => item.id);
  const moreReferencesPending = (run.steps || []).some((candidate) => candidate.kind === 'reference'
    && ['pending', 'queueing', 'running'].includes(candidate.status));
  if (step.kind === 'reference' && run.reviewReference && !moreReferencesPending) {
    run.status = 'review';
    broadcastSmartRun(run);
    return;
  }
  run.status = 'running';
  broadcastSmartRun(run);
  setImmediate(() => advanceSmartRun(run).catch((error) => {
    run.status = 'failed';
    run.error = String(error.message || error);
    broadcastSmartRun(run);
  }));
}

function updateSmartChunkJob(job, nextJobId, completedChunk, total) {
  if (!job?.smartRunId || !job.smartStepId) return;
  const next = jobs.get(nextJobId);
  if (next) {
    next.smartRunId = job.smartRunId;
    next.smartStepId = job.smartStepId;
  }
  const run = smartRunForProfile(job.smartRunId, job.profileId);
  const step = run?.steps.find((candidate) => candidate.id === job.smartStepId);
  if (!run || !step || run.status === 'cancelled') return;
  step.jobId = nextJobId;
  step.progress = { completed: completedChunk, total };
  broadcastSmartRun(run);
}

function failSmartJob(job, message, cancelled = false) {
  if (!job?.smartRunId || !job.smartStepId) return;
  const run = smartRunForProfile(job.smartRunId, job.profileId);
  if (!run || run.status === 'cancelled') return;
  const step = run.steps.find((candidate) => candidate.id === job.smartStepId);
  if (!step) return;
  step.jobId = null;
  step.status = cancelled ? 'cancelled' : 'failed';
  step.error = String(message || (cancelled ? 'Cancelled' : 'Generation failed')).slice(0, 1000);
  run.status = cancelled ? 'cancelled' : 'failed';
  run.error = step.error;
  broadcastSmartRun(run);
}

async function transcribeSmartAudio(buffer, contentType) {
  const apiKey = String(settings.externalLlmOpenAiApiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    const error = new Error('Voice transcription needs an OpenAI API key in Preferences. Text planning still works with any configured provider.');
    error.code = 'smart_transcription_unavailable';
    throw error;
  }
  const mime = /^audio\/[a-z0-9.+-]+$/i.test(contentType) ? contentType.toLowerCase() : 'audio/webm';
  const extension = ({
    'audio/mp4': 'm4a', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/vnd.wave': 'wav', 'audio/flac': 'flac', 'audio/webm': 'webm', 'audio/aac': 'aac',
  })[mime] || 'webm';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `smart-brief.${extension}`);
  form.append('model', 'gpt-transcribe');
  form.append('response_format', 'json');
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(180_000) : undefined,
    });
  } catch (error) {
    throw new Error(`Voice transcription failed: ${error.message || error}`);
  }
  const raw = await response.text().catch(() => '');
  let payload;
  try { payload = JSON.parse(raw || '{}'); } catch { payload = {}; }
  if (!response.ok) {
    const detail = String(payload?.error?.message || payload?.error || raw || `HTTP ${response.status}`).slice(0, 600);
    throw new Error(`Voice transcription failed: ${detail}`);
  }
  const text = String(payload.text || '').trim();
  if (!text) throw new Error('Voice transcription returned no text');
  return text.slice(0, 8000);
}

function externalPromptStatus(action, provider) {
  const verb = action === 'revise' ? 'Revising' : 'Enhancing';
  return `${verb} prompt with ${provider.label}...`;
}

function startExternalPromptPreflight(provider, options = {}) {
  if (options.action !== 'enhance') return null;
  const jobId = `prompt-preflight-${crypto.randomUUID()}`;
  const imageName = orderedPromptImageNames(options)[0] || '';
  const entry = {
    jobId,
    kind: 'enhance',
    profileId: options.profileId,
    label: String(options.statusText || externalPromptStatus(options.action, provider)).replace(/\.{3}$/, ''),
    thumbnail: imageName ? '/api/input?name=' + encodeURIComponent(imageName) : null,
    queuedAt: Date.now(),
  };
  externalPromptPreflights.set(jobId, entry);
  broadcast('queueChanged', { profileId: options.profileId });
  return entry;
}

function finishExternalPromptPreflight(entry) {
  if (!entry || !externalPromptPreflights.delete(entry.jobId)) return;
  broadcast('queueChanged', { profileId: entry.profileId });
}

async function externalPromptImage(imageName, profileId) {
  const name = String(imageName || '').trim();
  if (!name) return null;
  const catalogedAsset = db.uploadedAssets.find((asset) => asset.name === name);
  if (catalogedAsset && (catalogedAsset.profileId !== profileId || catalogedAsset.deletedAt)) {
    throw new Error('The selected reference image is unavailable');
  }
  const ext = path.extname(name.split('/').pop()).toLowerCase();
  const mimeType = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif',
  }[ext];
  if (!mimeType) throw new Error('External prompt vision supports PNG, JPEG, WebP, or GIF references');
  const local = inputAssetPath(INPUTS, name);
  try {
    const stat = await fsp.stat(local);
    if (stat.size > MAX_EXTERNAL_LLM_IMAGE_BYTES) throw new Error('The reference image is larger than the 20 MB external prompt limit');
    return { data: await fsp.readFile(local), mimeType };
  } catch (error) {
    if (/20 MB external prompt limit/.test(String(error?.message || ''))) throw error;
  }
  const parts = name.split('/');
  const filename = parts.pop();
  const subfolder = parts.join('/');
  const response = await comfyFetch(`/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=input`);
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > MAX_EXTERNAL_LLM_IMAGE_BYTES) throw new Error('The reference image is larger than the 20 MB external prompt limit');
  return { data, mimeType };
}

function orderedPromptImageNames(options = {}) {
  const plural = Array.isArray(options.imageNames)
    ? options.imageNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  if (plural.length) return plural.slice(0, 8);
  const singular = String(options.imageName || '').trim();
  return singular ? [singular] : [];
}

function h3ReferenceInputTokens(references = {}) {
  const tokens = [];
  (references.images || []).forEach((_asset, index) => tokens.push(`<Picture ${index + 1}>`));
  let audioIndex = 0;
  (references.videos || []).forEach((asset, index) => {
    tokens.push(`<Video ${index + 1}>`);
    if (asset?.hasAudio) {
      audioIndex += 1;
      tokens.push(`<Audio ${audioIndex}>`);
    }
  });
  (references.audios || []).forEach(() => {
    audioIndex += 1;
    tokens.push(`<Audio ${audioIndex}>`);
  });
  return tokens;
}

function h3PromptPartsWithAllowedReferences(parts, options = {}) {
  const allowed = Array.isArray(options.allowedReferenceTokens)
    ? options.allowedReferenceTokens.filter((token) => /^<(?:Picture|Video|Audio)\s+\d+>$/.test(token))
    : [];
  if (String(options.mode || '').toLowerCase() !== 'reference' || !allowed.length) return parts;
  return Object.assign({}, parts, {
    instruction: `${parts.instruction}\n\nAvailable reference tokens: ${allowed.join(', ')}. Use only these exact supplied tokens; never invent a different number or media type.`,
  });
}

function h3PromptPartsWithVisionOrder(parts, options = {}, layout = 'attachments') {
  const imageNames = orderedPromptImageNames(options);
  if (String(options.engine || '').toLowerCase() !== 'h3'
    || options.hasFirstFrame !== true
    || options.hasLastFrame !== true
    || imageNames.length < 2) return parts;
  const note = layout === 'stitched'
    ? 'Visual-input mapping: the supplied image is a left-to-right composite of the two exact anchors. The left panel is Picture 1, the first frame at 0.00 seconds; the right panel is Picture 2, the last frame at the effective duration. The narrow black divider is only a separator and is not part of either frame.'
    : 'Visual-input mapping: the two image attachments are supplied in Picture order. Attachment 1 is Picture 1, the first frame at 0.00 seconds; attachment 2 is Picture 2, the last frame at the effective duration.';
  return Object.assign({}, parts, { instruction: `${parts.instruction}\n\n${note}` });
}

async function runConfiguredPromptAi(parts, maxTokens, options = {}) {
  const provider = configuredExternalLlm();
  const imageNames = orderedPromptImageNames(options);
  parts = h3PromptPartsWithVisionOrder(parts, options, 'attachments');
  if (provider.provider === 'local') {
    return queueTextEnhancement(
      parts,
      Math.floor(Math.random() * 2 ** 31),
      options.statusText === false ? '' : (options.statusText || externalPromptStatus(options.action, provider)),
      maxTokens,
      Object.assign({}, options, { imageNames, profileId: options.profileId }),
    );
  }
  const preflight = startExternalPromptPreflight(provider, options);
  const statusText = options.statusText || externalPromptStatus(options.action, provider);
  if (options.statusText !== false) {
    broadcast('status', {
      jobId: preflight ? 'pre' : 'external-prompt',
      profileId: options.profileId,
      scope: preflight ? 'generation-preflight' : undefined,
      text: statusText,
    });
  }
  try {
    const images = await Promise.all(imageNames.map((name) => externalPromptImage(name, options.profileId)));
    return await externalLlmRequest({
      provider: provider.provider,
      model: provider.model,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      instruction: parts.instruction,
      userInput: parts.userInput,
      images,
      maxTokens,
    });
  } finally {
    finishExternalPromptPreflight(preflight);
  }
}

function shouldUseConfiguredPromptAi(domain, action) {
  return externalLlmEnabled(settings, domain, action);
}

function textGenInputs(seed, maxLength) {
  return {
    max_length: maxLength,
    sampling_mode: 'on',
    'sampling_mode.temperature': 0.7,
    'sampling_mode.top_k': 64,
    'sampling_mode.top_p': 0.95,
    'sampling_mode.min_p': 0.05,
    'sampling_mode.repetition_penalty': 1.05,
    'sampling_mode.seed': seed % 2147483647,
    'sampling_mode.presence_penalty': 0,
    thinking: false,
    use_default_template: true,
  };
}

function localPromptAiLoaderInputs(override = null) {
  const promptAi = override?.model ? override : localPromptAiConfig(settings);
  return { clip_name: promptAi.model, type: promptAi.type, device: 'default' };
}

function armPromptJobDeadline(pid, reject, label) {
  let stopped = false;
  let timer = null;
  const check = () => {
    if (stopped) return;
    const job = jobs.get(pid);
    if (!job) return;
    // Prompt tools share ComfyUI with long video generations. Waiting in the
    // queue is not a failed prompt; only apply the short deadline once the
    // text graph actually starts executing.
    const base = job.startedAt || job.enqueuedAt || Date.now();
    const limit = job.startedAt ? 5 * 60_000 : 20 * 60_000;
    const remaining = limit - (Date.now() - base);
    if (remaining <= 0) {
      stopped = true;
      const timedOutJob = jobs.get(pid);
      if (timedOutJob) {
        timedOutJob.cancelRequested = true;
        timedOutJob.cancelMessage = `${label} timed out`;
      }
      jobs.delete(pid);
      const error = new Error(`${label} timed out`);
      error.code = 'prompt_timeout';
      reject(error);
      stopComfyPrompt(pid).catch(() => { /* best-effort orphan cleanup */ });
      return;
    }
    timer = setTimeout(check, Math.min(30_000, remaining));
  };
  timer = setTimeout(check, 30_000);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

const motionPromptFlights = new Map();
const h3PromptFlights = new Map();
const promptRevisionRequests = new Map();

function promptRevisionRequestId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,96}$/.test(id) ? id : '';
}

function startPromptRevisionRequest(requestId, profileId) {
  if (!requestId) return null;
  const record = {
    requestId,
    profileId,
    stage: 'preparing',
    attempt: 1,
    jobId: '',
    cancelled: false,
    warnings: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  promptRevisionRequests.set(requestId, record);
  return record;
}

function updatePromptRevisionRequest(record, stage, details = {}) {
  if (!record) return;
  Object.assign(record, details, { stage, updatedAt: Date.now() });
}

function promptRevisionCancellationError() {
  const error = new Error('Prompt revision cancelled');
  error.code = 'job_cancelled';
  return error;
}

function finishPromptRevisionRequest(record, stage, details = {}) {
  if (!record) return;
  updatePromptRevisionRequest(record, stage, Object.assign({ jobId: '' }, details));
  const summary = {
    requestId: record.requestId,
    profileId: record.profileId,
    stage,
    attempts: record.attempt,
    durationMs: Date.now() - record.createdAt,
    warningCodes: (record.warnings || []).map((warning) => warning.code).filter(Boolean),
    errorCode: record.errorCode || undefined,
  };
  if (stage === 'error') console.error('[prompt-revise]', JSON.stringify(summary));
  else console.info('[prompt-revise]', JSON.stringify(summary));
  const timer = setTimeout(() => {
    if (promptRevisionRequests.get(record.requestId) === record) {
      promptRevisionRequests.delete(record.requestId);
    }
  }, 5 * 60_000);
  if (typeof timer.unref === 'function') timer.unref();
}

function h3PromptMaxTokens(mode) {
  // Full-reference rewrites contain six sections and normally need a much
  // longer detailed_description than the three-field frame-mode format.
  return mode === 'reference' ? 1400 : 900;
}

async function appendPromptVisionImages(graph, options = {}) {
  const imageNames = orderedPromptImageNames(options);
  if (!imageNames.length) return null;
  imageNames.forEach((name, index) => {
    const key = index === 0 ? 'img' : `img_${index + 1}`;
    graph[key] = { class_type: 'LoadImage', inputs: { image: name } };
  });
  let image = ['img', 0];
  for (let index = 1; index < imageNames.length; index += 1) {
    const key = `img_stitch_${index + 1}`;
    graph[key] = await nodeFromOrdered(
      'ImageStitch',
      ['right', true, 8, 'black'],
      { image1: image, image2: [`img_${index + 1}`, 0] }
    );
    image = [key, 0];
  }
  return image;
}

/** Vision pass: Qwen3-VL looks at the image and suggests a motion prompt. */
function suggestMotionPrompt(comfyImageName, seed, profileId, userPrompt = '', options = {}) {
  const imageNames = orderedPromptImageNames(Object.assign({ imageName: comfyImageName }, options));
  if (shouldUseConfiguredPromptAi('video', 'enhance')) {
    const parts = appendH3ValidationFeedback(
      motionPromptEnhanceParts(userPrompt, options),
      String(options.engine || '').toLowerCase() === 'h3' ? options.validationFeedback : '',
    );
    return runConfiguredPromptAi(parts, String(options.engine || '').toLowerCase() === 'h3' ? h3PromptMaxTokens(options.mode) : 384, Object.assign({}, options, {
      action: 'enhance',
      imageName: comfyImageName,
      imageNames,
      profileId,
    }));
  }
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      let parts = appendH3ValidationFeedback(
        motionPromptEnhanceParts(userPrompt, options),
        String(options.engine || '').toLowerCase() === 'h3' ? options.validationFeedback : '',
      );
      parts = h3PromptPartsWithVisionOrder(
        parts,
        Object.assign({}, options, { imageName: comfyImageName, imageNames }),
        'stitched',
      );
      graph.clip = { class_type: 'CLIPLoader', inputs: localPromptAiLoaderInputs() };
      const promptImage = await appendPromptVisionImages(graph, { imageName: comfyImageName, imageNames });
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: promptImage, prompt: parts.instruction + parts.userInput },
          textGenInputs(seed, String(options.engine || '').toLowerCase() === 'h3' ? h3PromptMaxTokens(options.mode) : 256)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph, { profileId, front: true });
      let clearDeadline = () => {};
      trackJob(pid, {
        kind: 'motionPrompt',
        profileId,
        thumbnailName: comfyImageName,
        graph,
        resolve: (t) => { clearDeadline(); resolve(t); },
        reject: (e) => { clearDeadline(); reject(e); },
      });
      clearDeadline = armPromptJobDeadline(pid, reject, 'Motion prompt');
      ensureWs();
    })().catch(reject);
  });
}

function sharedMotionPrompt(comfyImageName, seed, profileId, userPrompt = '', options = {}) {
  const key = JSON.stringify([
    profileId || '',
    String(comfyImageName || ''),
    String(userPrompt || '').trim(),
    String(options.engine || ''),
    Number(options.seconds) || 0,
    options.longContext === true,
    orderedPromptImageNames(Object.assign({ imageName: comfyImageName }, options)),
    options.hasFirstFrame === true,
    options.hasLastFrame === true,
  ]);
  const active = motionPromptFlights.get(key);
  if (active) return active;
  const run = String(options.engine || '').toLowerCase() === 'h3'
    ? validatedH3Prompt(
      (attempt, validationFeedback) => suggestMotionPrompt(
        comfyImageName,
        (Number(seed) || 0) + attempt,
        profileId,
        userPrompt,
        Object.assign({}, options, { validationFeedback }),
      ),
      userPrompt,
      Object.assign({
        preserveAuthoredText: true,
        referenceSource: userPrompt,
        allowDialogueFormatFallback: true,
        fallbackOnFailure: true,
      }, options),
    )
    : suggestMotionPrompt(comfyImageName, seed, profileId, userPrompt, options);
  const flight = run
    .finally(() => {
      if (motionPromptFlights.get(key) === flight) motionPromptFlights.delete(key);
    });
  motionPromptFlights.set(key, flight);
  return flight;
}

/** Vision pass: Qwen3-VL writes a detailed prompt to recreate the image. */
function suggestImagePrompt(comfyImageName, seed, profileId) {
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      graph.clip = { class_type: 'CLIPLoader', inputs: localPromptAiLoaderInputs() };
      graph.img = { class_type: 'LoadImage', inputs: { image: comfyImageName } };
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: ['img', 0], prompt: IMAGE_RECREATION_INSTRUCTION + ENHANCE_TAIL },
          textGenInputs(seed, 384)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph, { profileId });
      const timer = setTimeout(() => {
        jobs.delete(pid);
        reject(new Error('Image prompt timed out (3 min)'));
      }, 180000);
      trackJob(pid, {
        kind: 'enhance',
        profileId,
        graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
    })().catch(reject);
  });
}

function queueTextEnhancement(parts, seed, statusText, maxTokens = 512, options = {}) {
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      parts = h3PromptPartsWithVisionOrder(parts, options, 'stitched');
      graph.clip = { class_type: 'CLIPLoader', inputs: localPromptAiLoaderInputs(options.clipConfig) };
      const promptImage = await appendPromptVisionImages(graph, options);
      graph.concat = {
        class_type: 'StringConcatenate',
        inputs: { string_a: parts.instruction, string_b: parts.userInput, delimiter: '\n' },
      };
      const refineInputs = Object.assign({ clip: ['clip', 0], prompt: ['concat', 0] }, textGenInputs(seed, maxTokens));
      if (promptImage) refineInputs.image = promptImage;
      graph.refine = {
        class_type: 'TextGenerate',
        inputs: refineInputs,
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
      await filterInputs(graph);
      if (promptImage && options.requireVision === true && !graph.refine.inputs.image) {
        const error = new Error('The selected local Prompt AI workflow cannot inspect images. Choose a vision-capable Qwen3-VL model or switch Prompt AI to External.');
        error.code = 'local_prompt_ai_vision_required';
        throw error;
      }
      const pid = await queuePrompt(graph, { profileId: options.profileId, front: true });
      let clearDeadline = () => {};
      trackJob(pid, {
        kind: 'enhance',
        profileId: options.profileId,
        graph,
        resolve: (t) => {
          clearDeadline();
          if (typeof options.onPromptJobSettled === 'function') options.onPromptJobSettled(pid, null);
          resolve(t);
        },
        reject: (e) => {
          clearDeadline();
          if (typeof options.onPromptJobSettled === 'function') options.onPromptJobSettled(pid, e);
          reject(e);
        },
      });
      clearDeadline = armPromptJobDeadline(pid, reject, 'Prompt enhance');
      if (typeof options.onPromptJobQueued === 'function') options.onPromptJobQueued(pid);
      ensureWs();
      if (statusText && options.broadcastStatus !== false) {
        broadcast('status', {
          jobId: 'pre',
          profileId: options.profileId,
          scope: 'generation-preflight',
          text: statusText,
        });
      }
    })().catch(reject);
  });
}

async function requestSmartPlan(provider, prompt, references, profileId, onProgress = () => {}) {
  if (provider.provider === 'local') {
    const schemaInstruction = [
      prompt.localInstruction || prompt.instruction,
      'Produce the entire production plan in one response. Every requested second must be represented by a distinct scene of no more than 10 seconds, and every scene must contain its own renderable action, shot, camera, spatial composition, continuity, audio, and reference decision. Develop the narrative or purposeful action progression before spending words on reference continuity.',
      'Return only one valid JSON object with the exact property names and value types in this schema. Do not use Markdown, XML, commentary, ellipses, placeholders, or a code fence.',
      JSON.stringify(SMART_LOCAL_PLAN_SCHEMA),
    ].join('\n\n');
    const queueLocalPlan = (userInput, pass) => {
      onProgress(pass, pass === 'repair'
        ? 'Completing missing shots in the local draft…'
        : 'The local model is writing the production plan…');
      return queueTextEnhancement({
        instruction: schemaInstruction,
        userInput,
      }, Math.floor(Math.random() * 2 ** 31), 'Building Smart plan with the local model...', 8192, {
        profileId,
        clipConfig: { model: provider.model, type: provider.type },
        imageNames: references.map((reference) => reference.name),
        requireVision: references.length > 0,
        broadcastStatus: false,
        onPromptJobQueued: (promptId) => onProgress(pass, pass === 'repair'
          ? 'The completion pass is queued in ComfyUI…'
          : 'The production plan is queued in ComfyUI…', promptId),
        onPromptJobSettled: () => onProgress(pass, pass === 'repair'
          ? 'Checking the completed production plan…'
          : 'Checking the first production draft…', ''),
      });
    };
    const raw = await queueLocalPlan(prompt.userInput, 'draft');
    onProgress('audit', 'Checking shot coverage, timing, and continuity…');
    let plan = null;
    let audit;
    try {
      plan = parseStructuredText(raw, provider.label);
      audit = smartPlanAudit(plan);
    } catch (error) {
      audit = {
        complete: false,
        issues: [`The first response was not valid complete JSON: ${String(error.message || error).slice(0, 240)}`],
      };
    }
    if (audit.complete) return plan;
    console.info('[smart-plan]', JSON.stringify({
      provider: 'local', pass: 'repair', issueCount: audit.issues.length,
      issues: audit.issues.slice(0, 8),
    }));
    const issueLines = audit.issues.slice(0, 16).map((issue) => `- ${issue}`).join('\n');
    const repairedRaw = await queueLocalPlan([
      prompt.userInput,
      '<incomplete_draft>',
      String(raw || '').slice(0, 30000),
      '</incomplete_draft>',
      '<required_corrections>',
      issueLines,
      '</required_corrections>',
      'Rewrite the incomplete draft as one complete production plan. Preserve the creator brief as the binding instruction, replace repeated or missing beats with distinct causal or purposeful actions, cover the exact full runtime, and return the entire JSON object rather than a patch or explanation. Keep subject.description, referenceStates, and imagePrompt compact; spend the output budget on the story spine and scene progression.',
    ].join('\n'), 'repair');
    const repairedPlan = parseStructuredText(repairedRaw, provider.label);
    const repairedAudit = smartPlanAudit(repairedPlan);
    if (!repairedAudit.complete) {
      console.warn('[smart-plan]', JSON.stringify({
        provider: 'local', pass: 'repair-incomplete', issueCount: repairedAudit.issues.length,
        issues: repairedAudit.issues.slice(0, 8),
      }));
    }
    return repairedPlan;
  }
  onProgress('draft', `Waiting for ${provider.label} to return the production plan…`);
  const images = await Promise.all(references.map((reference) => externalPromptImage(reference.name, profileId)));
  return externalLlmStructuredRequest({
    provider: provider.provider,
    model: provider.model,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl,
    instruction: prompt.instruction,
    userInput: prompt.userInput,
    images,
    schema: SMART_PLAN_SCHEMA,
    schemaName: 'mix_studio_smart_plan',
    maxTokens: 8192,
  });
}

const smartPlanRequests = new Map();
const SMART_PLAN_REQUEST_TTL_MS = 30 * 60_000;

function smartPlanRequestId(value) {
  const id = String(value || '').trim();
  return /^[A-Za-z0-9_-]{8,96}$/.test(id) ? id : '';
}

function pruneSmartPlanRequests(now = Date.now()) {
  for (const [id, request] of smartPlanRequests) {
    const settled = request.status === 'complete' || request.status === 'failed';
    const age = now - Number(request.updatedAt || request.createdAt || now);
    if ((settled && age > SMART_PLAN_REQUEST_TTL_MS) || age > 2 * SMART_PLAN_REQUEST_TTL_MS) {
      smartPlanRequests.delete(id);
    }
  }
}

function smartPlanRequestStatus(request) {
  let message = request.message;
  if (request.promptId) {
    const promptJob = jobs.get(request.promptId);
    if (promptJob && !promptJob.startedAt) {
      message = request.phase === 'repair'
        ? 'The completion pass is waiting for ComfyUI…'
        : 'The production plan is waiting for ComfyUI…';
    }
  }
  return {
    requestId: request.id,
    status: request.status,
    phase: request.phase,
    message,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    provider: request.provider,
    result: request.status === 'complete' ? request.result : undefined,
    error: request.status === 'failed' ? request.error : undefined,
    code: request.status === 'failed' ? request.code : undefined,
  };
}

async function executeSmartPlanRequest(request, provider, prompt, references) {
  const progress = (phase, message, promptId = request.promptId) => {
    request.status = 'planning';
    request.phase = phase;
    request.message = message;
    request.promptId = promptId;
    request.updatedAt = Date.now();
  };
  try {
    progress('starting', 'Preparing the production planner…', '');
    const rawPlan = await requestSmartPlan(provider, prompt, references, request.profileId, progress);
    progress('finalizing', 'Finalizing reference routing and clip timing…', '');
    const plan = reconcileSmartPlanReferences(normalizeSmartPlan(rawPlan, request.brief), references);
    request.result = {
      plan,
      references,
      planHash: smartPlanHash(plan, references),
      provider: request.provider,
    };
    request.status = 'complete';
    request.phase = 'complete';
    request.message = 'Production plan ready.';
    request.promptId = '';
    request.updatedAt = Date.now();
  } catch (error) {
    const needsConfig = /API key|Choose an external prompt provider/i.test(String(error.message || ''));
    request.status = 'failed';
    request.phase = 'failed';
    request.message = '';
    request.promptId = '';
    request.error = String(error.message || error);
    request.code = needsConfig ? 'smart_provider_unavailable' : (error.code || 'smart_plan_failed');
    request.updatedAt = Date.now();
  }
}

function enhancePrompt(p, profileId) {
  const parts = promptEnhanceParts(settings.systemPrompt, p.prompt);
  if (shouldUseConfiguredPromptAi('image', 'enhance')) {
    return runConfiguredPromptAi(parts, 512, { action: 'enhance', profileId });
  }
  return queueTextEnhancement(
    parts,
    p.seed,
    'Enhancing global prompt...',
    512,
    { profileId },
  );
}

function reviseImagePrompt(currentPrompt, changeRequest, seed, options = {}) {
  const parts = imagePromptRevisionParts(currentPrompt, changeRequest, { hasImage: !!options.imageName });
  parts.userInput += ENHANCE_TAIL;
  if (shouldUseConfiguredPromptAi('image', 'revise')) {
    return runConfiguredPromptAi(parts, 384, Object.assign({ action: 'revise' }, options));
  }
  return queueTextEnhancement(
    parts,
    seed,
    'Revising prompt...',
    384,
    options,
  );
}

function reviseVideoPrompt(currentPrompt, changeRequest, seed, options = {}) {
  const imageNames = orderedPromptImageNames(options);
  let parts = appendH3ValidationFeedback(videoPromptRevisionParts(currentPrompt, changeRequest, {
    engine: options.engine,
    seconds: options.seconds,
    longContext: options.longContext === true,
    mode: options.mode,
    hasImage: imageNames.length > 0,
    hasFirstImage: options.hasFirstFrame === true,
    hasEndImage: options.hasLastFrame === true,
  }), options.engine === 'h3' ? options.validationFeedback : '');
  if (options.engine === 'h3') parts = h3PromptPartsWithAllowedReferences(parts, options);
  parts.userInput += ENHANCE_TAIL;
  if (shouldUseConfiguredPromptAi('video', 'revise')) {
    return runConfiguredPromptAi(parts, options.engine === 'h3' ? h3PromptMaxTokens(options.mode) : 384, Object.assign({ action: 'revise' }, options));
  }
  return queueTextEnhancement(
    parts,
    seed,
    'Revising video prompt...',
    options.engine === 'h3' ? h3PromptMaxTokens(options.mode) : 384,
    options,
  );
}

function enhanceH3Prompt(userPrompt, seed, options = {}) {
  const h3Options = Object.assign({}, options, { engine: 'h3' });
  const imageNames = orderedPromptImageNames(h3Options);
  let parts = appendH3ValidationFeedback(h3PromptEnhanceParts(userPrompt, {
    seconds: h3Options.seconds,
    longContext: h3Options.longContext === true,
    mode: h3Options.mode,
    hasImage: imageNames.length > 0,
    hasFirstImage: h3Options.hasFirstFrame === true,
    hasEndImage: h3Options.hasLastFrame === true,
  }), h3Options.validationFeedback);
  parts = h3PromptPartsWithAllowedReferences(parts, h3Options);
  if (shouldUseConfiguredPromptAi('video', 'enhance')) {
    return runConfiguredPromptAi(parts, h3PromptMaxTokens(h3Options.mode), Object.assign({ action: 'enhance' }, h3Options));
  }
  return queueTextEnhancement(
    parts,
    seed,
    'Enhancing MiniMax H3 prompt...',
    h3PromptMaxTokens(h3Options.mode),
    h3Options,
  );
}

function sharedH3PromptEnhancement(userPrompt, seed, options = {}) {
  const key = JSON.stringify([
    options.profileId || '',
    String(userPrompt || '').trim(),
    orderedPromptImageNames(options),
    String(options.mode || ''),
    Number(options.seconds) || 0,
    options.longContext === true,
    options.hasFirstFrame === true,
    options.hasLastFrame === true,
  ]);
  const active = h3PromptFlights.get(key);
  if (active) return active;
  const flight = validatedH3Prompt(
    (attempt, validationFeedback) => enhanceH3Prompt(
      userPrompt,
      (Number(seed) || 0) + attempt,
      Object.assign({}, options, { validationFeedback }),
    ),
    userPrompt,
    Object.assign({
      referenceSource: userPrompt,
      preserveAuthoredText: true,
      allowDialogueFormatFallback: true,
      fallbackOnFailure: true,
    }, options),
  )
    .finally(() => {
      if (h3PromptFlights.get(key) === flight) h3PromptFlights.delete(key);
    });
  h3PromptFlights.set(key, flight);
  return flight;
}

function enhanceRegionPrompt(description, globalPrompt, seed, options = {}) {
  const parts = regionPromptEnhanceParts(settings.systemPrompt, globalPrompt, description, {
    hasReference: !!options.imageName,
  });
  if (shouldUseConfiguredPromptAi('image', 'enhance')) {
    return runConfiguredPromptAi(parts, 384, Object.assign({ action: 'enhance' }, options));
  }
  return queueTextEnhancement(
    parts,
    seed,
    options.statusText || '',
    384,
    options,
  );
}

/** Wan 2.2 enhance: Qwen3-VL sees the image + user's idea, writes the video prompt. */
function wanEnhance(comfyImageName, userPrompt, seed, profileId) {
  const instruction = "Look at the provided image. Rewrite the user's motion idea into one vivid video-generation prompt paragraph (under 90 words) for an image-to-video model: describe subject actions, secondary motion, camera behavior and atmosphere, staying faithful to what is actually in the image and to the user's intent. Use present-progressive verbs.";
  const promptInput = `User's motion idea: ${userPrompt}`;
  if (shouldUseConfiguredPromptAi('video', 'enhance')) {
    return runConfiguredPromptAi({ instruction, userInput: promptInput + ENHANCE_TAIL }, 384, {
      action: 'enhance', imageName: comfyImageName, profileId,
    });
  }
  return new Promise((resolve, reject) => {
    (async () => {
      const graph = {};
      graph.clip = { class_type: 'CLIPLoader', inputs: localPromptAiLoaderInputs() };
      graph.img = { class_type: 'LoadImage', inputs: { image: comfyImageName } };
      graph.gen = {
        class_type: 'TextGenerate',
        inputs: Object.assign(
          { clip: ['clip', 0], image: ['img', 0], prompt: `${instruction}\n\n${promptInput}${ENHANCE_TAIL}` },
          textGenInputs(seed, 300)
        ),
      };
      graph.show = { class_type: 'PreviewAny', inputs: { source: ['gen', 0] } };
      await filterInputs(graph);
      const pid = await queuePrompt(graph, { profileId });
      const timer = setTimeout(() => { jobs.delete(pid); reject(new Error('Wan prompt enhance timed out')); }, 180000);
      trackJob(pid, {
        kind: 'enhance', profileId, graph,
        resolve: (t) => { clearTimeout(timer); resolve(t); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      ensureWs();
      broadcast('status', {
        jobId: 'pre', profileId, scope: 'generation-preflight', text: 'Enhancing motion prompt...',
      });
    })().catch(reject);
  });
}

/* ------------------------------------------------------------------ */
/* Graph builders                                                      */
/* ------------------------------------------------------------------ */

function buildLoraChain(graph, loras) {
  let model = ['unet', 0];
  let clip = ['clip', 0];
  let n = 0;
  for (const l of loras || []) {
    if (!l || !l.on || !l.name) continue;
    n += 1;
    const key = 'lora' + n;
    graph[key] = {
      class_type: 'LoraLoader',
      inputs: {
        model, clip,
        lora_name: l.name,
        strength_model: Number(l.strength) || 0,
        strength_clip: Number(l.strength) || 0,
      },
    };
    model = [key, 0];
    clip = [key, 1];
  }
  return { model, clip };
}

function baseLoaders(graph, params = {}) {
  const unetName = params.krea2Turbo === false ? settings.krea2RawUnet : settings.unet;
  graph.unet = buildKrea2ModelLoader(settings, unetName);
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };
}

async function buildT2I(p) {
  const graph = {};
  baseLoaders(graph, p);
  let { model, clip } = buildLoraChain(graph, p.loras);

  const textSource = p.enhancedText || p.prompt;
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip, text: textSource } };
  graph.neg = p.negativePrompt
    ? { class_type: 'CLIPTextEncode', inputs: { clip, text: p.negativePrompt } }
    : { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos', 0] } };
  const depthGuide = p.imageGuideMode === 'depth' && !!p.imageName;
  const styleGuide = p.imageGuideMode === 'style' && !!p.imageName;
  const latentInput = buildKrea2LatentInput(Object.assign({}, p, { imageName: depthGuide || styleGuide ? '' : p.imageName }));
  Object.assign(graph, latentInput.nodes);
  if (depthGuide) {
    const depth = buildKrea2DepthControl({
      imageName: p.imageName,
      loraName: settings.krea2DepthLora,
      depthModel: settings.depthAnythingV3Model,
      strength: p.depthStrength,
      latent: latentInput.latent,
      model,
      width: p.width,
      height: p.height,
    });
    Object.assign(graph, depth.nodes);
    model = depth.model;
  }
  if (styleGuide) {
    const style = buildKrea2StyleReference({
      imageName: p.imageName,
      strength: p.styleStrength,
      latent: latentInput.latent,
      model,
      conditioning: ['pos', 0],
    });
    Object.assign(graph, style.nodes);
    model = style.model;
  }
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model, positive: ['pos', 0], negative: ['neg', 0], latent_image: latentInput.latent,
      seed: p.seed, steps: p.steps, cfg: p.cfg,
      sampler_name: styleGuide ? 'euler_ancestral' : 'euler',
      scheduler: styleGuide ? 'simple' : 'beta',
      denoise: latentInput.denoise,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/gen' } };
  return filterInputs(graph);
}

async function buildRegionalT2I(p) {
  return filterInputs(buildRegionalT2IGraph(Object.assign({}, p, { settings })));
}

async function buildKrea2Inpaint(p, refNames) {
  const info = await getObjectInfo();
  return filterInputs(buildKrea2InpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    maskImageName: p.maskImageName,
    useSourceConditioning: !!info.Krea2EditRebalance,
  })));
}

async function comfyInputImageDimensions(imageName) {
  const parts = String(imageName || '').split('/');
  const filename = parts.pop();
  const subfolder = parts.join('/');
  const response = await comfyFetch(`/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=input`);
  const dimensions = imageDims(Buffer.from(await response.arrayBuffer()));
  if (!dimensions || !dimensions.w || !dimensions.h) throw new Error('Could not read source image dimensions');
  return dimensions;
}

function outpaintRefineReadiness(info) {
  const required = ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'];
  const models = installedSeedVr2Models(seedVr2ModelDirs());
  const key = (value) => String(value || '').replace(/\\/g, '/').toLowerCase();
  const vaeModels = comboList(info, 'SeedVR2LoadVAEModel', 'model');
  return {
    ready: required.every((className) => !!info[className])
      && models.some((name) => key(name) === key(settings.seedvr2Dit))
      && vaeModels.some((name) => key(name) === key(settings.seedvr2Vae)),
    models,
  };
}

async function prepareOutpaintParams(p, refNames, info) {
  const encodedSource = await comfyInputImageDimensions(refNames[0]);
  const displayWidth = clampInt(p.editOutpaintSourceWidth, 1, 32768, encodedSource.w);
  const displayHeight = clampInt(p.editOutpaintSourceHeight, 1, 32768, encodedSource.h);
  // Browsers and ComfyUI both apply JPEG EXIF rotation, while the lightweight
  // server dimension reader sees the encoded pixel matrix. Accept only an
  // exact or swapped client pair so phone portrait sources use display-space
  // dimensions without trusting arbitrary geometry from the request.
  const displayMatchesEncoded = displayWidth === encodedSource.w && displayHeight === encodedSource.h;
  const displayMatchesRotated = displayWidth === encodedSource.h && displayHeight === encodedSource.w;
  const source = displayMatchesEncoded || displayMatchesRotated
    ? { w: displayWidth, h: displayHeight }
    : encodedSource;
  p.editOutpaintPosition = normalizeOutpaintPosition(p.editOutpaintPosition);
  p.editOutpaintScale = clampInt(p.editOutpaintScale, 45, 100, 100);
  if (p.composite === true) {
    const plan = calculateNativeOutpaintPlan({
      sourceWidth: source.w,
      sourceHeight: source.h,
      targetWidth: p.width,
      targetHeight: p.height,
      position: p.editOutpaintPosition,
      offsetX: p.editOutpaintOffsetX,
      offsetY: p.editOutpaintOffsetY,
      scale: p.editOutpaintScale / 100,
    });
    const refine = outpaintRefineReadiness(info || {});
    p.width = plan.workingWidth;
    p.height = plan.workingHeight;
    p.editOutpaintSourceWidth = plan.workingSourceWidth;
    p.editOutpaintSourceHeight = plan.workingSourceHeight;
    p.editOutpaintAxis = plan.axis;
    p.editOutpaintPadding = plan.workingPadding;
    p.editOutpaintFinalWidth = plan.finalWidth;
    p.editOutpaintFinalHeight = plan.finalHeight;
    p.editOutpaintFinalSourceWidth = plan.finalSourceWidth;
    p.editOutpaintFinalSourceHeight = plan.finalSourceHeight;
    p.editOutpaintFinalPadding = plan.finalPadding;
    p.editOutpaintEffectiveScale = Math.round(plan.effectiveScale * 100);
    p.editOutpaintCanvasLimited = plan.limited;
    // Keep diffusion inside the edit model's supported working canvas. When
    // Native Preserve requests a larger final image, SeedVR2 enlarges the
    // generated canvas first and the untouched source is composited last.
    // Never silently stretch a large outpaint with ordinary interpolation.
    if (plan.needsRefine && !refine.ready) {
      throw new Error('Large Native Preserve needs SeedVR2. Install the Upscale dependencies or reduce the source size / final canvas.');
    }
    p.editOutpaintRefine = plan.needsRefine;
    p.editOutpaintRefineProfile = p.postUpscale?.profile || 'balanced';
    p.editOutpaintRefineNoise = p.postUpscale?.noise || 'low';
    p.seedVr2Models = refine.models;
    // Preserve is completed inside the outpaint graph after the automatic
    // detail upscale. A later whole-image upscale would resample the native
    // source and defeat non-destructive preservation.
    p.postUpscale = undefined;
    return plan.workingPadding;
  }

  const dimensions = normalizeOutpaintDimensions(p.width, p.height);
  p.width = dimensions.width;
  p.height = dimensions.height;
  const layout = calculateOutpaintLayout({
    sourceWidth: source.w,
    sourceHeight: source.h,
    targetWidth: p.width,
    targetHeight: p.height,
    position: p.editOutpaintPosition,
    offsetX: p.editOutpaintOffsetX,
    offsetY: p.editOutpaintOffsetY,
    scale: p.editOutpaintScale / 100,
  });
  const padding = layout.padding;
  p.editOutpaintSourceWidth = layout.sourceWidth;
  p.editOutpaintSourceHeight = layout.sourceHeight;
  p.editOutpaintAxis = padding.axis;
  p.editOutpaintPadding = padding;
  return padding;
}

function appendOutpaintFinishRequirements(requiredNodes, p) {
  if (p.composite) {
    requiredNodes.push('ImageCompositeMasked');
    if (p.maskImageName) requiredNodes.push('ImageToMask');
    else requiredNodes.push('SolidMask', 'FeatherMask');
  }
  if (p.editOutpaintRefine) requiredNodes.push('SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler');
  return requiredNodes;
}

async function buildEditKrea2Outpaint(p, refNames) {
  const info = await getObjectInfo();
  const padding = await prepareOutpaintParams(p, refNames, info);
  const requiredNodes = ['Krea2EditModelPatch', 'Krea2EditGroundedEncode', 'ImagePadForOutpaint', 'ColorMatch'];
  appendOutpaintFinishRequirements(requiredNodes, p);
  const missingNodes = requiredNodes
    .filter((className) => !info[className]);
  if (missingNodes.length) {
    throw new Error(`Krea 2 Expand needs its Identity Edit nodes installed: ${missingNodes.join(', ')}`);
  }
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  const assetKey = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  const identityOverride = (Array.isArray(p.loras) ? p.loras : [])
    .find((lora) => assetKey(lora && lora.name) === assetKey(settings.krea2OutpaintLora));
  const identityEnabled = !identityOverride || identityOverride.on !== false;
  if (identityEnabled && !loraList.some((name) => assetKey(name) === assetKey(settings.krea2OutpaintLora))) {
    throw new Error(`Krea 2 Expand needs the Identity Edit LoRA in ComfyUI loras: ${settings.krea2OutpaintLora}`);
  }
  return filterInputs(buildKrea2OutpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    padding,
    groundingPx: 768,
    krea2RefBoost: p.krea2RefBoost,
  })));
}

async function buildEditKleinOutpaint(p, refNames) {
  const info = await getObjectInfo();
  const padding = await prepareOutpaintParams(p, refNames, info);
  const requiredNodes = ['ImagePadForOutpaint', 'DrawMaskOnImage', 'ColorMatch'];
  appendOutpaintFinishRequirements(requiredNodes, p);
  const missingNodes = requiredNodes
    .filter((className) => !info[className]);
  if (missingNodes.length) {
    throw new Error(`Klein Expand needs the image-extend nodes installed: ${missingNodes.join(', ')}`);
  }
  const consistencyLora = p.editEngine === 'klein9'
    ? settings.klein9ConsistencyLora
    : settings.klein4ConsistencyLora;
  const assetKey = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  const consistencyOverride = (Array.isArray(p.loras) ? p.loras : [])
    .find((lora) => assetKey(lora && lora.name) === assetKey(consistencyLora));
  const consistencyEnabled = !consistencyOverride || consistencyOverride.on !== false;
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  if (consistencyEnabled && consistencyLora && !loraList.some((name) => assetKey(name) === assetKey(consistencyLora))) {
    const label = p.editEngine === 'klein9' ? 'Klein 9B' : 'Klein 4B';
    throw new Error(`${label} Expand needs its Consistence Edit LoRA in ComfyUI loras: ${consistencyLora}`);
  }
  const klein = kleinConfigForEngine(p.editEngine);
  return filterInputs(buildKleinOutpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    padding,
    unetName: klein.unet,
    clipName: klein.clip,
  })));
}

async function buildEditQwenOutpaint(p, refNames) {
  const info = await getObjectInfo();
  const padding = await prepareOutpaintParams(p, refNames, info);
  const requiredNodes = ['ImagePadForOutpaint', 'DrawMaskOnImage', 'ColorMatch'];
  appendOutpaintFinishRequirements(requiredNodes, p);
  const missingNodes = requiredNodes
    .filter((className) => !info[className]);
  if (missingNodes.length) {
    throw new Error(`Qwen Expand needs the image-extend nodes installed: ${missingNodes.join(', ')}`);
  }
  return filterInputs(buildQwenOutpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    padding,
    preset: qwenEditPreset(p.qwenQuality),
  })));
}

async function buildEditKrea2MaskedOutpaint(p, refNames) {
  const info = await getObjectInfo();
  const padding = await prepareOutpaintParams(p, refNames, info);
  const requiredNodes = ['ImagePadForOutpaint', 'MaskToImage', 'ImageToMask', 'SetLatentNoiseMask', 'ColorMatch'];
  appendOutpaintFinishRequirements(requiredNodes, p);
  const missingNodes = requiredNodes
    .filter((className) => !info[className]);
  if (missingNodes.length) {
    throw new Error(`Krea2 Expand needs the masked-canvas nodes installed: ${missingNodes.join(', ')}`);
  }
  return filterInputs(buildKrea2MaskedOutpaintGraph(Object.assign({}, p, {
    settings,
    imageName: refNames[0],
    padding,
  })));
}

async function matchKrea2ReferenceDimensions(p, refNames) {
  let width = p.width || 1024;
  let height = p.height || 1024;
  if (!p.editAspectOverride) try {
    const parts = String(refNames[0]).split('/');
    const filename = parts.pop();
    const subfolder = parts.join('/');
    const response = await comfyFetch(`/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent(subfolder)}&type=input`);
    const dims = imageDims(Buffer.from(await response.arrayBuffer()));
    if (dims && dims.w && dims.h) {
      const scale = Math.sqrt((1.3 * 1024 * 1024) / (dims.w * dims.h));
      width = Math.max(256, Math.round((dims.w * scale) / 16) * 16);
      height = Math.max(256, Math.round((dims.h * scale) / 16) * 16);
    }
  } catch { /* fall back to the selected output size */ }
  const normalized = normalizeIdentityEditDimensions(width, height);
  p.width = normalized.width;
  p.height = normalized.height;
  return normalized;
}

async function buildEditKrea2Identity(p, refNames) {
  const info = await getObjectInfo();
  const requiredNodes = ['Krea2EditModelPatch', 'Krea2EditGroundedEncode', 'LoraLoaderModelOnly'];
  const missingNodes = requiredNodes.filter((className) => !info[className]);
  if (missingNodes.length) {
    throw new Error(`Krea 2 Edit needs its Identity Edit nodes installed: ${missingNodes.join(', ')}`);
  }
  const loraList = comboList(info, 'LoraLoaderModelOnly', 'lora_name').length
    ? comboList(info, 'LoraLoaderModelOnly', 'lora_name')
    : comboList(info, 'LoraLoader', 'lora_name');
  const assetKey = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  if (!loraList.some((name) => assetKey(name) === assetKey(settings.krea2OutpaintLora))) {
    throw new Error(`Krea 2 Edit needs the Identity Edit LoRA in ComfyUI loras: ${settings.krea2OutpaintLora}`);
  }
  await matchKrea2ReferenceDimensions(p, refNames);
  return filterInputs(buildKrea2IdentityEditGraph(Object.assign({}, p, {
    settings,
    refNames: refNames.slice(0, 2),
    groundingPx: 768,
  })));
}

/* Edit (Krea2 Remix): the nova452 Conditioning-Rebalance technique — the
 * instruction and up to 4 reference images are fused by Krea2EditRebalance
 * into a single conditioning (IP-Adapter-like identity/composition
 * preservation), sampled cfg-free on the Krea2 turbo model from an EMPTY
 * latent (the refs steer content; nothing is latent-copied). */
async function buildEditKrea2Remix(p, refNames) {
  const graph = {};
  graph.unet = buildKrea2ModelLoader(settings, settings.unet);
  const model = chainModelLoras(graph, ['unet', 0], p.loras, 'kelora');
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.clip, type: settings.clipType, device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };

  const { width, height } = await matchKrea2ReferenceDimensions(p, refNames);

  const rebalanceInputs = {
    text: p.prompt,
    clip: ['clip', 0],
    // Conditioning-Rebalance renamed these controls. Keep both schemas here;
    // filterInputs() retains only the fields supported by the installed node.
    refocus_strength: 0.8,
    guidance_strength: 0.5,
    enable_split: true,
    steering: 1,
    layer_multiplier: 1,
    enable_step: true,
  };
  refNames.slice(0, 4).forEach((name, i) => {
    const k = i + 1;
    graph[`ref${k}`] = { class_type: 'LoadImage', inputs: { image: name } };
    rebalanceInputs[`image${k}`] = [`ref${k}`, 0];
    // The primary reference carries the subject: give it the bigger budget
    rebalanceInputs[`image${k}_tokens`] = i === 0 ? 'high' : 'normal';
  });
  graph.rebalance = { class_type: 'Krea2EditRebalance', inputs: rebalanceInputs };
  graph.guider = { class_type: 'BasicGuider', inputs: { model, conditioning: ['rebalance', 0] } };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: p.seed } };
  graph.sampler_sel = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  graph.sched = {
    class_type: 'BasicScheduler',
    inputs: { model, scheduler: 'simple', steps: p.steps || 8, denoise: 1 },
  };
  graph.latent = {
    class_type: 'EmptySD3LatentImage',
    inputs: { width, height, batch_size: p.batch || 1 },
  };
  graph.samp = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_sel', 0],
      sigmas: ['sched', 0], latent_image: ['latent', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['samp', 0], vae: ['vae', 0] } };
  graph.save = { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

/* Edit (Qwen): the real Qwen-Image-Edit 2511 pipeline (official template):
 * dedicated edit UNET, optional Lightning acceleration, source image encoded
 * as the starting latent, FluxKontext scaling + multi-reference conditioning. */
async function buildEditQwen(p, refNames) {
  const graph = {};
  const preset = qwenEditPreset(p.qwenQuality);
  graph.unet = diffusionModelLoader(settings.qwenEditUnet);
  let qwenBaseModel = ['unet', 0];
  const assetKey = (value) => String(value || '').replace(/\\/g, '/').split('/').pop().toLowerCase();
  const lightningOverride = (Array.isArray(p.loras) ? p.loras : [])
    .find((lora) => assetKey(lora && lora.name) === assetKey(settings.qwenEditLora));
  if (preset.lightning && (!lightningOverride || lightningOverride.on !== false)) {
    graph.lightning = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: qwenBaseModel,
        lora_name: settings.qwenEditLora,
        strength_model: lightningOverride ? clampNum(lightningOverride.strength, 0, 2, 1) : 1,
      },
    };
    qwenBaseModel = ['lightning', 0];
  }
  if (p.qwenAngle) {
    graph.angle_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: qwenBaseModel, lora_name: settings.qwenEditAnglesLora, strength_model: 0.9 },
    };
    qwenBaseModel = ['angle_lora', 0];
  }
  const userLoras = (Array.isArray(p.loras) ? p.loras : [])
    .filter((lora) => assetKey(lora && lora.name) !== assetKey(settings.qwenEditLora));
  const qModel = chainModelLoras(graph, qwenBaseModel, userLoras, 'qlora');
  graph.ms = { class_type: 'ModelSamplingAuraFlow', inputs: { model: qModel, shift: 3.1 } };
  graph.cfgnorm = { class_type: 'CFGNorm', inputs: { model: ['ms', 0], strength: 1 } };
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.qwenEditClip, type: 'qwen_image', device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.vae } };

  const qwenPrompt = p.anglePrompt || p.qwenAnglePrompt || p.prompt;
  const encodeInputs = { clip: ['clip', 0], vae: ['vae', 0], prompt: p.maskImageName ? localizedEditPrompt(qwenPrompt) : qwenPrompt };
  const negInputs = { clip: ['clip', 0], vae: ['vae', 0], prompt: p.negativePrompt || '' };
  refNames.slice(0, 3).forEach((name, idx) => {
    const i = idx + 1;
    graph['img' + i] = { class_type: 'LoadImage', inputs: { image: name } };
    let src = ['img' + i, 0];
    if (p.editAspectOverride) {
      graph['scale' + i] = {
        class_type: 'ImageScale',
        inputs: { image: src, upscale_method: 'lanczos', width: p.width, height: p.height, crop: 'center' },
      };
      src = ['scale' + i, 0];
    } else if (i === 1) {
      graph.scale1 = { class_type: 'FluxKontextImageScale', inputs: { image: src } };
      src = ['scale1', 0];
    }
    encodeInputs['image' + i] = src;
    negInputs['image' + i] = src;
  });

  graph.pos = { class_type: 'TextEncodeQwenImageEditPlus', inputs: encodeInputs };
  graph.neg = { class_type: 'TextEncodeQwenImageEditPlus', inputs: negInputs };
  graph.posm = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['pos', 0], reference_latents_method: 'index_timestep_zero' } };
  graph.negm = { class_type: 'FluxKontextMultiReferenceLatentMethod', inputs: { conditioning: ['neg', 0], reference_latents_method: 'index_timestep_zero' } };
  graph.latent = { class_type: 'VAEEncode', inputs: { pixels: ['scale1', 0], vae: ['vae', 0] } };
  const editMask = appendEditMaskNodes(graph, {
    prefix: 'qwen_mask',
    maskImageName: p.maskImageName,
    samples: ['latent', 0],
    expand: p.maskExpand,
  });
  graph.sampler = {
    class_type: 'KSampler',
    inputs: {
      model: ['cfgnorm', 0], positive: ['posm', 0], negative: ['negm', 0], latent_image: editMask ? editMask.latent : ['latent', 0],
      seed: p.seed, steps: preset.steps, cfg: preset.cfg, sampler_name: 'euler', scheduler: 'simple', denoise: editMask ? maskInfluenceDenoise(p.maskInfluence) : 1,
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sampler', 0], vae: ['vae', 0] } };

  let out = ['decode', 0];
  if (editMask) {
    out = appendEditMaskComposite(graph, {
      key: 'qwen_mask_composite',
      original: ['scale1', 0],
      generated: ['decode', 0],
      mask: editMask.mask,
    });
  } else if (p.composite !== false) {
    const info = await getObjectInfo();
    if (info.KleinEditComposite) {
      graph.composite = await nodeFromOrdered(
        'KleinEditComposite',
        [],
        { generated_image: ['decode', 0], original_image: ['scale1', 0] }
      );
      out = ['composite', 0];
    }
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

/* Edit (Klein): Flux 2 Klein 4B image editing (ReferenceLatent conditioning,
 * Flux2Scheduler 4 steps, cfg 1 — from the flux2_klein_editV2 workflow). */
function kleinConfigForEngine(engine) {
  if (engine === 'klein9') return { unet: settings.klein9Unet, clip: settings.klein9Clip };
  return {
    unet: settings.klein4Unet || settings.kleinUnet,
    clip: settings.klein4Clip || settings.kleinClip,
  };
}

async function buildEdit(p, refNames) {
  const graph = {};
  const klein = kleinConfigForEngine(p.editEngine);
  graph.unet = diffusionModelLoader(klein.unet);
  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: klein.clip, type: 'flux2', device: 'default' } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.kleinVae } };

  const kModel = chainModelLoras(graph, ['unet', 0], p.loras, 'klora');
  const editPrompt = p.anglePrompt || p.prompt;
  graph.pos_text = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: p.maskImageName ? localizedEditPrompt(editPrompt) : editPrompt } };
  graph.neg0 = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['pos_text', 0] } };
  let pos = ['pos_text', 0];
  let neg = ['neg0', 0];
  refNames.slice(0, 3).forEach((name, idx) => {
    const i = idx + 1;
    graph['img' + i] = { class_type: 'LoadImage', inputs: { image: name } };
    graph['scale' + i] = {
      class_type: 'ImageScaleToTotalPixels',
      inputs: { image: ['img' + i, 0], upscale_method: 'nearest-exact', megapixels: 1, resolution_steps: 1 },
    };
    graph['enc' + i] = { class_type: 'VAEEncode', inputs: { pixels: ['scale' + i, 0], vae: ['vae', 0] } };
    graph['refp' + i] = { class_type: 'ReferenceLatent', inputs: { conditioning: pos, latent: ['enc' + i, 0] } };
    graph['refn' + i] = { class_type: 'ReferenceLatent', inputs: { conditioning: neg, latent: ['enc' + i, 0] } };
    pos = ['refp' + i, 0];
    neg = ['refn' + i, 0];
  });

  // With a source image, output size follows it; otherwise the picker
  let wRef = p.width;
  let hRef = p.height;
  if (refNames.length && !p.editAspectOverride) {
    graph.size = { class_type: 'GetImageSize', inputs: { image: ['scale1', 0] } };
    wRef = ['size', 0];
    hRef = ['size', 1];
  }
  const editMask = appendEditMaskNodes(graph, {
    prefix: 'klein_mask',
    maskImageName: p.maskImageName,
    samples: ['enc1', 0],
    expand: p.maskExpand,
  });
  if (!editMask) {
    graph.latent = { class_type: 'EmptyFlux2LatentImage', inputs: { width: wRef, height: hRef, batch_size: p.batch || 1 } };
  }
  graph.sched = { class_type: 'Flux2Scheduler', inputs: { steps: 4, width: wRef, height: hRef, denoise: editMask ? maskInfluenceDenoise(p.maskInfluence) : 1 } };
  graph.guider = { class_type: 'CFGGuider', inputs: { model: kModel, positive: pos, negative: neg, cfg: 1 } };
  graph.noise = { class_type: 'RandomNoise', inputs: { noise_seed: p.seed } };
  graph.sampler_sel = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } };
  graph.samp = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler_sel', 0],
      sigmas: ['sched', 0], latent_image: editMask ? editMask.latent : ['latent', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['samp', 0], vae: ['vae', 0] } };

  // Optional: composite changed pixels back onto the original so untouched
  // areas stay pristine across successive edits (KleinEditComposite node).
  let out = ['decode', 0];
  if (editMask) {
    out = appendEditMaskComposite(graph, {
      key: 'klein_mask_composite',
      original: ['scale1', 0],
      generated: ['decode', 0],
      mask: editMask.mask,
    });
  } else if (p.composite !== false && refNames.length) {
    const info = await getObjectInfo();
    if (info.KleinEditComposite) {
      graph.composite = await nodeFromOrdered(
        'KleinEditComposite',
        [],
        { generated_image: ['decode', 0], original_image: ['scale1', 0] }
      );
      out = ['composite', 0];
    }
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: out, filename_prefix: 'KreaStudio/edit' } };
  return filterInputs(graph);
}

async function buildGenerationGraph(p, refNames) {
  if (p.mode === 'edit') {
    if (p.editOutpaint && p.editEngine === 'qwen') return buildEditQwenOutpaint(p, refNames);
    if (p.editOutpaint && (p.editEngine === 'klein4' || p.editEngine === 'klein9')) return buildEditKleinOutpaint(p, refNames);
    if (p.editOutpaint && p.editEngine === 'krea2') return buildEditKrea2Outpaint(p, refNames);
    if (p.editEngine === 'qwen') return buildEditQwen(p, refNames);
    if (p.editEngine === 'krea2ref' && p.editOutpaint) return buildEditKrea2Outpaint(p, refNames);
    if (p.editEngine === 'krea2ref') return buildEditKrea2Identity(p, refNames);
    if (p.editEngine === 'krea2remix') return buildEditKrea2Remix(p, refNames);
    if (p.editEngine === 'krea2' && p.maskImageName) return buildKrea2Inpaint(p, refNames);
    if (p.editEngine === 'krea2') return hasActiveRegions(p.regions) ? buildRegionalT2I(p) : buildT2I(p);
    return buildEdit(p, refNames);
  }
  return hasActiveRegions(p.regions) ? buildRegionalT2I(p) : buildT2I(p);
}

async function queueGenerationJob(p, profileId, refNames, refinedPrompt = null) {
  const graph = await buildGenerationGraph(p, refNames);
  const pid = await queuePrompt(graph, { profileId });
  trackJob(pid, { kind: 'gen', profileId, params: p, graph, refImageNames: refNames, refinedPrompt });
  ensureWs();
  return { pid, graph };
}

async function queueStrengthHuntJob(p, profileId, refNames, refinedPrompt = null) {
  const huntPlan = buildStrengthHuntPlan(p.loras, { id: uid() });
  if (!huntPlan) throw new Error('Choose at least one enabled LoRA for Strength Hunt');
  const graphs = [];
  for (const variant of huntPlan.variants) {
    graphs.push(await buildGenerationGraph(Object.assign({}, p, {
      loras: variant.loras,
      batch: 1,
      postUpscale: undefined,
      strengthHunt: undefined,
    }), refNames));
  }
  const graph = mergeStrengthHuntGraphs(graphs);
  const pid = await queuePrompt(graph, { profileId });
  trackJob(pid, {
    kind: 'loraHunt', profileId, params: Object.assign({}, p, { batch: 1, postUpscale: undefined }),
    graph, refImageNames: refNames, refinedPrompt, huntPlan,
  });
  ensureWs();
  return { pid, graph, huntPlan };
}

async function queueNextSequentialEdit(job, sourceItem) {
  const sequence = job.params.editSequence;
  if (!sequence || sequence.index >= sequence.prompts.length - 1) return null;
  const nextIndex = sequence.index + 1;
  const source = await fsp.readFile(path.join(IMAGES, sourceItem.file));
  const sourceName = await uploadToComfy(source, `ks_sequence_${sequence.id}_${nextIndex + 1}.png`);
  const refNames = [sourceName, ...(job.refImageNames || []).slice(1)];
  const nextParams = Object.assign({}, job.params, {
    prompt: sequence.prompts[nextIndex],
    seed: (Number(job.params.seed) + 1) % (2 ** 48),
    batch: 1,
    sourceItemId: sourceItem.id,
    refImages: refNames,
    qwenAngle: undefined,
    qwenAnglePrompt: undefined,
    anglePrompt: undefined,
    angleGroupId: undefined,
    editSequence: Object.assign({}, sequence, { index: nextIndex }),
  });
  const queued = await queueGenerationJob(nextParams, job.profileId, refNames, null);
  return { pid: queued.pid, params: nextParams };
}

async function buildUpscale(imageName, opts) {
  if (opts.engine === 'ultimate') {
    return filterInputs(buildUltimateSdUpscaleGraph({
      imageName,
      settings,
      prompt: opts.prompt,
      scaleFactor: opts.scaleFactor,
      seed: opts.seed,
    }));
  }

  const graph = {};
  const gpuVendor = setupHardwareProfile(await getSetupHardwareInfo()).gpuVendor;
  const installedDitModels = installedSeedVr2Models(seedVr2ModelDirs());
  const profile = seedVr2Profile(settings, opts.profile || 'sharp', installedDitModels, opts.noise || 'low');
  opts.profile = profile.key;
  opts.noise = profile.noise;
  opts.profileModel = profile.ditModel;
  graph.load = { class_type: 'LoadImage', inputs: { image: imageName } };
  let imgRef = ['load', 0];
  if (opts.preScale && opts.preScale !== 1) {
    graph.prescale = {
      class_type: 'ImageScaleBy',
      inputs: { image: imgRef, upscale_method: 'lanczos', scale_by: opts.preScale },
    };
    imgRef = ['prescale', 0];
  }
  // Explicit inputs matching the current SeedVR2 node pack schema
  // (verified against /object_info via /api/debug/upscale).
  const seedVr2 = seedVr2UpscaleNodes(imgRef, {
    settings,
    availableModels: installedDitModels,
    gpuVendor,
    profile: opts.profile,
    noise: opts.noise,
    resolution: opts.resolution || 2160,
    batchSize: 1,
  });
  Object.assign(graph, seedVr2.nodes);
  graph.save = { class_type: 'SaveImage', inputs: { images: ['upscale', 0], filename_prefix: 'KreaStudio/upscale' } };
  return filterInputs(graph);
}

async function buildImageComposite(imageNames) {
  const names = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (names.length < 2) throw new Error('A composite needs at least two images');
  const graph = {};
  names.forEach((name, index) => {
    graph[`image_${index}`] = { class_type: 'LoadImage', inputs: { image: name } };
  });
  let output = ['image_0', 0];
  for (let index = 1; index < names.length; index += 1) {
    const key = `stitch_${index}`;
    graph[key] = await nodeFromOrdered(
      'ImageStitch',
      ['right', true, 8, 'black'],
      { image1: output, image2: [`image_${index}`, 0] }
    );
    output = [key, 0];
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: 'KreaStudio/composite' } };
  return filterInputs(graph);
}

async function buildImageContactSheet(imageNames) {
  const names = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (names.length < 2) throw new Error('A contact sheet needs at least two images');
  const graph = {};
  names.forEach((name, index) => {
    graph[`image_${index}`] = { class_type: 'LoadImage', inputs: { image: name } };
  });
  const columns = Math.ceil(Math.sqrt(names.length));
  const rows = [];
  for (let start = 0; start < names.length; start += columns) {
    let row = [`image_${start}`, 0];
    const end = Math.min(names.length, start + columns);
    for (let index = start + 1; index < end; index += 1) {
      const key = `row_${start}_${index}`;
      graph[key] = await nodeFromOrdered(
        'ImageStitch',
        ['right', true, 8, 'black'],
        { image1: row, image2: [`image_${index}`, 0] }
      );
      row = [key, 0];
    }
    rows.push(row);
  }
  let output = rows[0];
  for (let index = 1; index < rows.length; index += 1) {
    const key = `column_${index}`;
    graph[key] = await nodeFromOrdered(
      'ImageStitch',
      ['down', true, 8, 'black'],
      { image1: output, image2: rows[index] }
    );
    output = [key, 0];
  }
  graph.save = { class_type: 'SaveImage', inputs: { images: output, filename_prefix: 'KreaStudio/contact_sheet' } };
  return filterInputs(graph);
}

/* Source | depth map | generation, stitched left to right. The depth map is
 * recomputed from the saved source so the strip always documents exactly what
 * guided the generation. */
async function buildDepthComposite(imageNames, dims = {}) {
  const [sourceName, resultName] = Array.isArray(imageNames) ? imageNames.filter(Boolean) : [];
  if (!sourceName || !resultName) throw new Error('A depth composite needs the source and the result');
  // Analyze at the generation's dimensions — DA3 degrades on native multi-MP
  // sources, and this reproduces exactly the map that guided the generation.
  const depth = buildDepthMapNodes({
    imageName: sourceName,
    depthModel: settings.depthAnythingV3Model,
    width: clampInt(dims.width, 64, 4096, 1024),
    height: clampInt(dims.height, 64, 4096, 1024),
  });
  const graph = Object.assign({}, depth.nodes, {
    result: { class_type: 'LoadImage', inputs: { image: resultName } },
  });
  graph.stitch_depth = await nodeFromOrdered(
    'ImageStitch',
    ['right', true, 8, 'black'],
    { image1: depth.scaledSource, image2: depth.image }
  );
  graph.stitch_result = await nodeFromOrdered(
    'ImageStitch',
    ['right', true, 8, 'black'],
    { image1: ['stitch_depth', 0], image2: ['result', 0] }
  );
  graph.save = { class_type: 'SaveImage', inputs: { images: ['stitch_result', 0], filename_prefix: 'KreaStudio/depth_composite' } };
  return filterInputs(graph);
}

/* Synchronously wait for a queued ComfyUI prompt to produce its first output
 * image (used by short helper jobs like the depth-map preview). */
async function waitForComfyImage(pid, timeoutMs = 3 * 60 * 1000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    let entry;
    try {
      const history = await (await comfyFetch(`/history/${pid}`)).json();
      entry = history && history[pid];
    } catch { continue; }
    if (!entry) continue;
    if (entry.status && entry.status.status_str === 'error') {
      const messages = JSON.stringify(entry.status.messages || []).slice(0, 300);
      throw new Error(`ComfyUI failed: ${messages}`);
    }
    const files = findOutputFiles(entry.outputs || {}, /\.(png|jpg|jpeg|webp)$/i);
    if (files.length) return downloadOutput(files[0]);
  }
  throw new Error('Timed out waiting for ComfyUI');
}

function normalizePostUpscale(value) {
  if (!value || value.enabled !== true) return undefined;
  return {
    engine: 'seedvr2',
    resolution: clampInt(value.resolution, 512, 8192, 2160),
    profile: value.profile === 'balanced' ? 'balanced' : 'sharp',
    noise: ['off', 'low', 'medium'].includes(value.noise) ? value.noise : 'low',
    preScale: 1,
  };
}

async function queuePostUpscale(item, options, profileId) {
  const buf = await fsp.readFile(path.join(IMAGES, item.file));
  const comfyName = await uploadToComfy(buf, `ks_finish_${item.id}.png`);
  const graph = await buildUpscale(comfyName, options);
  const pid = await queuePrompt(graph, { profileId });
  item.upscalePending = true;
  trackJob(pid, { kind: 'upscale', profileId, itemId: item.id, graph, upscaleInfo: options });
  ensureWs();
  return pid;
}

function ultimateSdUpscaleReadinessError(info) {
  const missing = [
    'LoadImage', 'UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode',
    'ConditioningZeroOut', 'UpscaleModelLoader', 'UltimateSDUpscale', 'SaveImage',
  ].filter((cls) => !info[cls]);
  if (missing.length) return `Ultimate SD Upscale is missing ComfyUI node(s): ${missing.join(', ')}`;

  const models = comboList(info, 'UpscaleModelLoader', 'model_name');
  if (models.length && !models.includes(ULTIMATE_SD_UPSCALE_MODEL)) {
    return `Ultimate SD Upscale needs ${ULTIMATE_SD_UPSCALE_MODEL} in ComfyUI upscale_models.`;
  }
  return null;
}

/* --------------------------- LTX 2.3 Animate ---------------------- */
/* Replicates the "Black Mixture LTX 2.3 Image to Video" subgraph:     */
/* two-stage AV generation (base at half res -> x2 latent upsample)    */
/* with audio and Gemma motion-prompt enhancement.                     */

const LTX_NEGATIVE = 'pc game, console game, video game, cartoon, childish, ugly';
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const LTX_SIGMAS_BASE = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';
const LTX_SIGMAS_REFINE = '0.85, 0.7250, 0.4219, 0.0';

function videoDims(w, h) {
  const long = 1280;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 64) * 64);
  const H = Math.max(256, Math.round((h * s) / 64) * 64);
  return { W, H };
}

function cameraMotionDims(w, h) {
  // Cameraman v2 is trained around a ~960x512 first pass. LTX refines at
  // 2x, so a 1920px long edge keeps the control signal in its useful range.
  const long = 1920;
  const sourceW = Math.max(1, Number(w) || 1024);
  const sourceH = Math.max(1, Number(h) || 1024);
  const scale = long / Math.max(sourceW, sourceH);
  const W = Math.max(512, Math.round((sourceW * scale) / 64) * 64);
  const H = Math.max(512, Math.round((sourceH * scale) / 64) * 64);
  return { W, H };
}

async function buildAnimate(imageName, opts) {
  const { W, H } = opts;
  const seed = opts.seed;
  const graph = {};

  // Models
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.model_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ckpt', 0], lora_name: settings.ltxDistilledLora, strength_model: 0.5 },
  };
  let ltxBaseModel = ['model_lora', 0];
  // Edit Anything is trained as a normal LTX 2.3 model LoRA. Keep it at
  // its authored strength; raising it can make the source clip less stable.
  if (opts.editAnything) {
    graph.edit_anything_lora = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: ltxBaseModel, lora_name: settings.ltxEditLora, strength_model: 1 },
    };
    ltxBaseModel = ['edit_anything_lora', 0];
  }
  if (opts.cameraMotionGuideNames?.length) {
    graph.camera_motion_lora = await nodeFromOrdered(
      'LTXICLoRALoaderModelOnly',
      [settings.ltxCameramanLora, 1],
      { model: ltxBaseModel },
      { lora_name: settings.ltxCameramanLora, strength_model: 1, strength: 1 }
    );
    ltxBaseModel = ['camera_motion_lora', 0];
  }
  const ltxModel = chainModelLoras(graph, ltxBaseModel, opts.loras, 'ulora');
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.ltxTextEncoder, settings.ltxCkpt, 'default'],
    {},
    { text_encoder: settings.ltxTextEncoder, ckpt_name: settings.ltxCkpt }
  );
  graph.te_lora = {
    class_type: 'LoraLoader',
    inputs: {
      model: ['ckpt', 0], clip: ['te', 0],
      lora_name: settings.ltxGemmaLora, strength_model: 0.7, strength_clip: 0.7,
    },
  };

  // Prompt (optional Gemma LTX2 enhancement, exactly like the workflow)
  let promptSource = opts.prompt;
  if (opts.enhance) {
    // Give Gemma the image too - its I2V system prompt analyzes the frame
    // and writes motion that respects what's actually in the picture.
    graph.refine = {
      class_type: 'TextGenerateLTX2Prompt',
      inputs: Object.assign(
        {
          clip: ['te_lora', 1],
          image: ['resize', 0],
          prompt: opts.cameraMotionPromptBase || opts.prompt,
        },
        textGenInputs(seed, 256)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
    if (opts.cameraMotionPhrase) {
      graph.camera_motion_prompt = {
        class_type: 'StringConcatenate',
        inputs: { string_a: promptSource, string_b: opts.cameraMotionPhrase, delimiter: ' ' },
      };
      promptSource = ['camera_motion_prompt', 0];
    }
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: combineNegativePrompts(LTX_NEGATIVE, opts.negativePrompt) } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };

  // Standard LTX uses a first-frame guide. Edit Anything uses every frame
  // from the supplied clip as an LTX guide, with the edit prompt steering
  // what changes. VHS decodes at the final sampling frame rate so temporal
  // alignment remains 8n+1 after LTX crops the sequence.
  if (opts.guideVideoName) {
    graph.edit_source = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.guideVideoName, force_rate: opts.fps, custom_width: W, custom_height: H,
      frame_load_cap: opts.frames, skip_first_frames: opts.guideSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.edit_source_base = {
      class_type: 'ImageScale',
      inputs: { image: ['edit_source', 0], upscale_method: 'lanczos', width: W / 2, height: H / 2, crop: 'center' },
    };
  } else {
    // Source image -> preprocessed guide
    graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
    graph.resize = {
      class_type: 'ImageScale',
      inputs: { image: ['img', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' },
    };
    graph.prep = await nodeFromOrdered('LTXVPreprocess', [opts.imgCompression != null ? opts.imgCompression : 35], { image: ['resize', 0] });
  }

  // Optional end frame
  if (opts.endImageName && !opts.guideVideoName) {
    graph.img_end = { class_type: 'LoadImage', inputs: { image: opts.endImageName } };
    graph.resize_end = {
      class_type: 'ImageScale',
      inputs: { image: ['img_end', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'center' },
    };
    graph.prep_end = await nodeFromOrdered('LTXVPreprocess', [opts.imgCompression != null ? opts.imgCompression : 35], { image: ['resize_end', 0] });
  }

  let cameraGuideSource = null;
  if (opts.cameraMotionGuideNames?.length) {
    const segmentBase = Math.floor(opts.frames / opts.cameraMotionGuideNames.length);
    const segmentRemainder = opts.frames % opts.cameraMotionGuideNames.length;
    const guideSources = [];
    for (let index = 0; index < opts.cameraMotionGuideNames.length; index += 1) {
      const key = `camera_motion_video_${index + 1}`;
      const segmentFrames = Math.max(1, segmentBase + (index < segmentRemainder ? 1 : 0));
      graph[key] = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
        video: opts.cameraMotionGuideNames[index],
        force_rate: opts.fps,
        custom_width: W / 2,
        custom_height: H / 2,
        frame_load_cap: segmentFrames,
        skip_first_frames: index === 0 ? (opts.cameraMotionGuideSkipFrames || 0) : 0,
        select_every_nth: 1,
        format: 'None',
      });
      guideSources.push([key, 0]);
    }
    cameraGuideSource = imageBatchChain(graph, guideSources, 'camera_motion_join_');
  }

  // Stage 1: base generation at half resolution
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: W / 2, height: H / 2, length: opts.frames, batch_size: 1 },
  };
  let basePositive = ['cond', 0];
  let baseNegative = ['cond', 1];
  let baseLatent;
  if (cameraGuideSource) {
    graph.camera_image_condition1 = await nodeFromOrdered(
      'LTXVImgToVideoConditionOnly',
      [0.5, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['latent1', 0] }
    );
    graph.camera_guide1 = await nodeFromOrdered(
      'LTXAddVideoICLoRAGuide',
      [0, 1, 1, 'disabled', false, 256, 64],
      {
        positive: basePositive,
        negative: baseNegative,
        vae: ['ckpt', 2],
        latent: ['camera_image_condition1', 0],
        image: cameraGuideSource,
      }
    );
    basePositive = ['camera_guide1', 0];
    baseNegative = ['camera_guide1', 1];
    baseLatent = ['camera_guide1', 2];
  } else if (opts.guideVideoName) {
    graph.edit_guide1 = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: basePositive, negative: baseNegative, vae: ['ckpt', 2], latent: ['latent1', 0],
        image: ['edit_source_base', 0], frame_idx: 0, strength: 1,
      },
    };
    basePositive = ['edit_guide1', 0];
    baseNegative = ['edit_guide1', 1];
    baseLatent = ['edit_guide1', 2];
  } else if (opts.endImageName) {
    graph.i2v1 = {
      class_type: 'LTXVImgToVideoInplaceKJ',
      inputs: {
        vae: ['ckpt', 2], latent: ['latent1', 0],
        num_images: '2',
        'num_images.strength_1': 0.95, 'num_images.image_1': ['prep', 0], 'num_images.index_1': 0,
        'num_images.strength_2': 0.95, 'num_images.image_2': ['prep_end', 0], 'num_images.index_2': opts.frames - 1,
      },
    };
    baseLatent = ['i2v1', 0];
  } else {
    graph.i2v1 = await nodeFromOrdered(
      'LTXVImgToVideoInplace',
      [0.95, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['latent1', 0] }
    );
    baseLatent = ['i2v1', 0];
  }
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.ltxCkpt } };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await ltxEmptyAudioNode(opts.frames, opts.fps);
    audioLatent = ['audio_lat', 0];
  }
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: baseLatent, audio_latent: audioLatent },
  };
  graph.noise1 = { class_type: 'RandomNoise', inputs: { noise_seed: seed } };
  graph.guider1 = {
    class_type: 'CFGGuider',
    inputs: { model: ltxModel, positive: basePositive, negative: baseNegative, cfg: 1 },
  };
  graph.sampler_sel1 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } };
  graph.sigmas1 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_BASE]);
  graph.samp1 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise1', 0], guider: ['guider1', 0], sampler: ['sampler_sel1', 0],
      sigmas: ['sigmas1', 0], latent_image: ['concat1', 0],
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp1', 0] } };

  // Stage 2: x2 latent upsample + refine
  graph.ups_model = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: settings.ltxUpscaler } };
  graph.ups = {
    class_type: 'LTXVLatentUpsampler',
    inputs: { samples: ['sep1', 0], upscale_model: ['ups_model', 0], vae: ['ckpt', 2] },
  };
  let refinePositive;
  let refineNegative;
  let refineLatent;
  if (cameraGuideSource) {
    graph.camera_crop1 = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: basePositive, negative: baseNegative, latent: ['sep1', 0] },
    };
    graph.camera_image_condition2 = await nodeFromOrdered(
      'LTXVImgToVideoConditionOnly',
      [0.7, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['ups', 0] }
    );
    refinePositive = ['camera_crop1', 0];
    refineNegative = ['camera_crop1', 1];
    refineLatent = ['camera_image_condition2', 0];
  } else if (opts.guideVideoName) {
    // Crop first-pass guide tokens before inserting the full-resolution
    // source clip for refinement. This mirrors LTX's multi-guide flow.
    graph.edit_crop1 = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: basePositive, negative: baseNegative, latent: ['sep1', 0] },
    };
    graph.edit_guide2 = {
      class_type: 'LTXVAddGuide',
      inputs: {
        positive: ['edit_crop1', 0], negative: ['edit_crop1', 1], vae: ['ckpt', 2], latent: ['ups', 0],
        image: ['edit_source', 0], frame_idx: 0, strength: 1,
      },
    };
    refinePositive = ['edit_guide2', 0];
    refineNegative = ['edit_guide2', 1];
    refineLatent = ['edit_guide2', 2];
  } else if (opts.endImageName) {
    graph.i2v2 = {
      class_type: 'LTXVImgToVideoInplaceKJ',
      inputs: {
        vae: ['ckpt', 2], latent: ['ups', 0],
        num_images: '2',
        'num_images.strength_1': 1, 'num_images.image_1': ['prep', 0], 'num_images.index_1': 0,
        'num_images.strength_2': 1, 'num_images.image_2': ['prep_end', 0], 'num_images.index_2': opts.frames - 1,
      },
    };
    refineLatent = ['i2v2', 0];
  } else {
    graph.i2v2 = await nodeFromOrdered(
      'LTXVImgToVideoInplace',
      [1, !!opts.bypass],
      { vae: ['ckpt', 2], image: ['prep', 0], latent: ['ups', 0] }
    );
    refineLatent = ['i2v2', 0];
  }
  if (!opts.guideVideoName && !cameraGuideSource) {
    graph.crop = {
      class_type: 'LTXVCropGuides',
      inputs: { positive: ['cond', 0], negative: ['cond', 1], latent: ['sep1', 0] },
    };
    refinePositive = ['crop', 0];
    refineNegative = ['crop', 1];
  }
  graph.guider2 = {
    class_type: 'CFGGuider',
    inputs: { model: ltxModel, positive: refinePositive, negative: refineNegative, cfg: 1 },
  };
  graph.noise2 = { class_type: 'RandomNoise', inputs: { noise_seed: 42 } };
  graph.sampler_sel2 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_cfg_pp' } };
  graph.sigmas2 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_REFINE]);
  graph.concat2 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: refineLatent, audio_latent: ['sep1', 1] },
  };
  graph.samp2 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise2', 0], guider: ['guider2', 0], sampler: ['sampler_sel2', 0],
      sigmas: ['sigmas2', 0], latent_image: ['concat2', 0],
    },
  };
  graph.sep2 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp2', 0] } };

  // Decode + mux
  graph.decode = await nodeFromOrdered(
    'VAEDecodeTiled',
    [768, 64, 4096, 4],
    { samples: ['sep2', 0], vae: ['ckpt', 2] }
  );
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep2', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  // Standalone videos (no gallery source): save the first frame as a poster
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  return filterInputs(graph);
}

/* ---------------- LTX Face ID (reference-to-video) ---------------- */
/* Replicates Alissonerdx's "Best-FaceID v1.0" workflow: LTX 2.3 base  */
/* + distilled-1.1 LoRA @0.6 + Best_FaceID LoRA @1.0, the BFS          */
/* LTXIdentityOverlapConditioning node injects the reference face      */
/* latent at frame-0 with a TASS-RoPE source tag, single-stage,        */
/* euler_ancestral_cfg_pp on the base sigma schedule, 24 fps.          */

const FACEID_PROMPT_INTRO = 'You will receive two inputs:\n\n1. A reference face image showing the person whose appearance must be preserved.\n2. An original `ref_t2v` video caption describing the scene, action, environment, camera framing, movement, lighting, mood, clothing, and props.\n\nYour task is to analyze the reference face image, extract the person’s visible appearance characteristics, and merge those characteristics naturally into the original video caption.\n\nREFERENCE FACE IMAGE:\n[REFERENCE IMAGE PROVIDED TO THE MODEL]\n\nORIGINAL VIDEO CAPTION:\n';

const FACEID_PROMPT_RULES = '\nSTRICT EDITING RULE:\n\nTreat the original video caption as locked text.\n\nYou are allowed to make only these edits:\n\n1. Expand the first subject phrase:\n   - Replace only `A person`, `A man`, or `A woman` with the same original subject noun plus visible appearance details.\n   - The original subject noun must remain present.\n   - Insert the appearance details immediately around the original subject noun.\n   - Do not delete or replace any words that appear after the original subject phrase.\n\n2. Optionally replace later subject pronouns:\n   - `They`, `He`, or `She` may be replaced with a short appearance-based reference.\n   - Preserve every verb, object, action, and remaining word from the original sentence.\n   - Do not alter the order of the words or actions.\n\nEverything else in the original caption is immutable.\n\nYou must preserve verbatim:\n\n- clothing and costumes;\n- actions;\n- action order;\n- environments;\n- objects and props;\n- camera framing;\n- camera movement;\n- lighting;\n- mood;\n- adjectives;\n- temporal transitions;\n- all principal nouns and verbs.\n\nCRITICAL PRESERVATION RULES:\n\n- Never remove clothing or costume descriptions.\n- Never remove phrases between the original subject and the main action.\n- Never replace original words with synonyms.\n- Never summarize or simplify the caption.\n- Never improve or creatively rewrite the caption.\n- Never add new actions, clothing, props, people, or environments.\n- Never mention or infer the person’s identity or name.\n- Never repeat labels such as `REFERENCE FACE IMAGE` or `ORIGINAL VIDEO CAPTION`.\n- Never write introductory text such as:\n  - `Okay`\n  - `I understand`\n  - `Let\'s proceed`\n  - `Here is the merged caption`\n  - `The result is`\n\nFACE IMAGE ANALYSIS:\n\nExtract only clearly visible, non-sensitive appearance details, such as:\n\n- apparent age group;\n- skin tone;\n- hair color;\n- hair length;\n- hair texture;\n- hairstyle;\n- face shape;\n- visible facial hair;\n- glasses;\n- clearly visible eye color;\n- other distinctive visible facial features.\n\nDo not:\n\n- identify the person;\n- repeat a name supplied in image metadata or surrounding text;\n- infer ethnicity, nationality, occupation, personality, religion, health, or background;\n- invent unclear characteristics;\n- infer clothing from the face image.\n\nMINIMUM-EDIT PROCEDURE:\n\nStep 1:\nCopy the original caption exactly.\n\nStep 2:\nLocate only the first subject phrase:\n- `A person`\n- `A man`\n- `A woman`\n\nStep 3:\nExpand that phrase with the extracted appearance while preserving the original subject noun.\n\nStep 4:\nFor later pronouns, either preserve the original pronoun or replace only the pronoun with a concise appearance-based subject reference.\n\nFINAL VALIDATION:\n\nBefore answering, silently compare the output with the original caption and verify:\n\n- every original costume and clothing phrase remains;\n- every original action remains;\n- every original prop remains;\n- every original environment remains;\n- every original framing term remains;\n- every original lighting and mood phrase remains;\n- the action order is unchanged;\n- no original principal word was removed;\n- no synonym replaced an original word;\n- only subject appearance information was added;\n- no introductory or explanatory text appears.\n\nOUTPUT REQUIREMENT:\n\nOutput exactly one line containing only the final `ref_t2v` caption.\n\nDo not output analysis, headings, labels, explanations, acknowledgements, or quotation marks.\n\nThe line must begin with exactly:\n\nref_t2v:';

function faceIdDims(w, h) {
  const long = 1024;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 32) * 32);
  const H = Math.max(256, Math.round((h * s) / 32) * 32);
  return { W, H };
}

async function buildAnimateFaceId(faceName, opts) {
  const { W, H } = opts;
  const graph = {};

  // Models: base ckpt -> distilled-1.1 @0.6 -> FaceID LoRA @1.0 -> user LoRAs
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.ltxCkpt } };
  graph.model_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ckpt', 0], lora_name: settings.ltxFaceIdDistilledLora, strength_model: 0.6 },
  };
  graph.faceid_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['model_lora', 0], lora_name: settings.ltxFaceIdLora, strength_model: 1 },
  };
  const ltxModel = chainModelLoras(graph, ['faceid_lora', 0], opts.loras, 'flora');
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.ltxTextEncoder, settings.ltxCkpt, 'default'],
    {},
    { text_encoder: settings.ltxTextEncoder, ckpt_name: settings.ltxCkpt }
  );
  graph.te_lora = {
    class_type: 'LoraLoader',
    inputs: {
      model: ['ckpt', 0], clip: ['te', 0],
      lora_name: settings.ltxGemmaLora, strength_model: 0.7, strength_clip: 0.7,
    },
  };

  // Reference face (resized ~512, aspect kept — matches the FaceID workflow)
  graph.face_img = { class_type: 'LoadImage', inputs: { image: faceName } };
  graph.face = await nodeFromOrdered(
    'ImageResizeKJv2',
    [512, 512, 'lanczos', 'resize', '0, 0, 0', 'center', 2],
    { image: ['face_img', 0] }
  );

  // Prompt: ref_t2v caption; optional Gemma pass that looks at the face and
  // weaves its visible attributes into the caption (workflow's enhancer).
  const userPrompt = /^\s*ref_t2v:/i.test(opts.prompt) ? opts.prompt : `ref_t2v: ${opts.prompt}`;
  let promptSource = userPrompt;
  if (opts.enhance) {
    graph.refine = {
      class_type: 'TextGenerate',
      inputs: Object.assign(
        {
          clip: ['te_lora', 1],
          image: ['face', 0],
          prompt: FACEID_PROMPT_INTRO + userPrompt + FACEID_PROMPT_RULES,
        },
        textGenInputs(opts.seed, 1024)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te_lora', 1], text: combineNegativePrompts(LTX_NEGATIVE, opts.negativePrompt) } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };

  // Empty AV latent (pure t2v — identity comes from the overlap reference)
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: W, height: H, length: opts.frames, batch_size: 1 },
  };
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.ltxCkpt } };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await ltxEmptyAudioNode(opts.frames, opts.fps);
    audioLatent = ['audio_lat', 0];
  }
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['latent1', 0], audio_latent: audioLatent },
  };

  // BFS identity overlap: reference latent shares the frame-0 RoPE grid
  // with a distinct source phase (widgets: projector None, source_id 2,
  // phase_scale 1, strength 1, per workflow defaults).
  graph.ident = await nodeFromOrdered(
    'LTXIdentityOverlapConditioning',
    ['None', 2, 1, 1, 'disable', false],
    {
      model: ltxModel,
      positive: ['cond', 0],
      negative: ['cond', 1],
      vae: ['ckpt', 2],
      latent: ['concat1', 0],
      reference_face: ['face', 0],
    }
  );

  graph.noise1 = { class_type: 'RandomNoise', inputs: { noise_seed: opts.seed } };
  graph.guider1 = {
    class_type: 'CFGGuider',
    inputs: { model: ['ident', 0], positive: ['ident', 1], negative: ['ident', 2], cfg: 1 },
  };
  graph.sampler_sel1 = { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler_ancestral_cfg_pp' } };
  graph.sigmas1 = await nodeFromOrdered('ManualSigmas', [LTX_SIGMAS_BASE]);
  graph.samp1 = {
    class_type: 'SamplerCustomAdvanced',
    inputs: {
      noise: ['noise1', 0], guider: ['guider1', 0], sampler: ['sampler_sel1', 0],
      sigmas: ['sigmas1', 0], latent_image: ['ident', 3],
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['samp1', 0] } };

  // Trim the overlap reference frame off the output, then decode
  graph.crop = {
    class_type: 'LTXVCropGuides',
    inputs: { positive: ['ident', 1], negative: ['ident', 2], latent: ['sep1', 0] },
  };
  graph.decode = await nodeFromOrdered(
    'VAEDecodeTiled',
    [768, 64, 4096, 4],
    { samples: ['crop', 2], vae: ['ckpt', 2] }
  );
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep1', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  return filterInputs(graph);
}

/* ------------------- 10Eros DMD Animate (alt LTX) ----------------- */
/* Replicates TenStrip's "10Eros_10SNodes_I2V_DMD_v1" workflow:        */
/* 10Eros v1.2 finetune + DMD distilled LoRA + Echo sampler +          */
/* LTXReferenceConditioning, two passes with x2 latent upsample, 24fps */

const EROS_SIGMA_PRESETS = {
  dmd: { first: '1.0, 0.99375, 0.9875, 0.975, 0.909375, 0.78, 0.725, 0.421875, 0.0', up: '0.92, 0.909375, 0.725, 0.421875, 0.0' },
  card: { first: '1.000, 0.955, 0.893, 0.812, 0.715, 0.603, 0.482, 0.241, 0.121, 0.0', up: '0.92, 0.725, 0.421875, 0.0' },
  v5: { first: '1.000, 0.955, 0.893, 0.812, 0.715, 0.603, 0.482, 0.241, 0.121, 0.0', up: '0.6435, 0.4342, 0.2171, 0.0' },
};
function erosSigmas(preset) {
  if (preset === 'custom' && settings.erosSigmasFirst.trim() && settings.erosSigmasUpscale.trim()) {
    return { first: settings.erosSigmasFirst.trim(), up: settings.erosSigmasUpscale.trim() };
  }
  return EROS_SIGMA_PRESETS[preset] || EROS_SIGMA_PRESETS.dmd;
}

function manualSigmaStepCount(value) {
  const sigmas = String(value || '')
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter(Number.isFinite);
  return Math.max(0, sigmas.length - 1);
}

/** Chain user LoRAs (model-only) onto a video model path. */
function chainModelLoras(graph, model, loras, prefix) {
  let m = model;
  let n = 0;
  for (const l of loras || []) {
    if (!l || !l.on || !l.name) continue;
    n += 1;
    const key = prefix + n;
    graph[key] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: { model: m, lora_name: l.name, strength_model: Number(l.strength) || 0 },
    };
    m = [key, 0];
  }
  return m;
}

/** Shared: encode an uploaded audio file into a noise-locked AV audio latent. */
function audioLatentNodes(graph, audioName) {
  graph.load_audio = { class_type: 'LoadAudio', inputs: { audio: audioName } };
  graph.audio_enc = { class_type: 'LTXVAudioVAEEncode', inputs: { audio: ['load_audio', 0], audio_vae: ['audio_vae', 0] } };
  graph.amask = { class_type: 'SolidMask', inputs: { value: 0, width: 1024, height: 1024 } };
  graph.audio_locked = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['audio_enc', 0], mask: ['amask', 0] } };
  return ['audio_locked', 0];
}

async function buildAnimateEros(imageName, opts) {
  const graph = {};
  const halfW = Math.max(64, Math.round(opts.W / 2 / 32) * 32);
  const halfH = Math.max(64, Math.round(opts.H / 2 / 32) * 32);

  // Models (checkpoint provides transformer + video VAE + audio VAE)
  graph.ckpt = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.erosCkpt } };
  graph.audio_vae = { class_type: 'LTXVAudioVAELoader', inputs: { ckpt_name: settings.erosCkpt } };
  graph.te = await nodeFromOrdered(
    'LTXAVTextEncoderLoader',
    [settings.erosTextEncoder, settings.erosCkpt, 'default'],
    {},
    { text_encoder: settings.erosTextEncoder, ckpt_name: settings.erosCkpt }
  );

  // Prompt (optional in-graph Gemma LTX2 enhancement, like the stock LTX path)
  let promptSource = opts.prompt;
  if (opts.enhance) {
    graph.refine = {
      class_type: 'TextGenerateLTX2Prompt',
      inputs: Object.assign(
        { clip: ['te', 0], image: ['resize_full', 0], prompt: opts.prompt },
        textGenInputs(opts.seed, 256)
      ),
    };
    graph.showPrompt = { class_type: 'PreviewAny', inputs: { source: ['refine', 0] } };
    promptSource = ['refine', 0];
  }
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['te', 0], text: promptSource } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['te', 0], text: '' } };
  graph.cond = {
    class_type: 'LTXVConditioning',
    inputs: { positive: ['pos', 0], negative: ['neg', 0], frame_rate: opts.fps },
  };
  graph.negz = { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['cond', 1] } };

  // Source image: full-res guide + half-res guide for the first pass
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.resize_full = {
    class_type: 'ImageResizeKJv2',
    inputs: {
      image: ['img', 0], width: opts.W, height: opts.H,
      upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
      crop_position: 'center', divisible_by: 32, device: 'cpu',
    },
  };
  graph.resize_half = {
    class_type: 'ImageResizeKJv2',
    inputs: {
      image: ['img', 0], width: halfW, height: halfH,
      upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
      crop_position: 'center', divisible_by: 32, device: 'cpu',
    },
  };
  graph.prep = await nodeFromOrdered(
    'LTXVPreprocess',
    [opts.imgCompression != null ? opts.imgCompression : 35],
    { image: ['resize_half', 0] }
  );

  // Optional end frame (pinned to the last frame index on both passes)
  if (opts.endImageName) {
    graph.img_end = { class_type: 'LoadImage', inputs: { image: opts.endImageName } };
    graph.resize_end_full = {
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: ['img_end', 0], width: opts.W, height: opts.H,
        upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 32, device: 'cpu',
      },
    };
    graph.resize_end_half = {
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: ['img_end', 0], width: halfW, height: halfH,
        upscale_method: 'area', keep_proportion: 'crop', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 32, device: 'cpu',
      },
    };
    graph.prep_end = await nodeFromOrdered(
      'LTXVPreprocess',
      [opts.imgCompression != null ? opts.imgCompression : 35],
      { image: ['resize_end_half', 0] }
    );
  }

  // Model chain: reference-enable -> DMD LoRA
  graph.ref_enable = {
    class_type: 'LTXReferenceEnable',
    inputs: { model: ['ckpt', 0], zero_ref_timesteps: false, verbose: false },
  };
  graph.dmd_lora = {
    class_type: 'LoraLoaderModelOnly',
    inputs: { model: ['ref_enable', 0], lora_name: settings.erosDmdLora, strength_model: 1 },
  };
  const erosModel = chainModelLoras(graph, ['dmd_lora', 0], opts.loras, 'ulora');

  // Stage 1 (half res)
  graph.latent1 = {
    class_type: 'EmptyLTXVLatentVideo',
    inputs: { width: halfW, height: halfH, length: opts.frames, batch_size: 1 },
  };
  let audioLatent;
  if (opts.audioName) {
    audioLatent = audioLatentNodes(graph, opts.audioName);
  } else {
    graph.audio_lat = await ltxEmptyAudioNode(opts.frames, opts.fps);
    audioLatent = ['audio_lat', 0];
  }
  const i2v1Inputs = {
    vae: ['ckpt', 2], latent: ['latent1', 0],
    num_images: opts.endImageName ? '2' : '1',
    'num_images.strength_1': 1,
    'num_images.image_1': ['prep', 0],
    'num_images.index_1': 0,
  };
  if (opts.endImageName) {
    i2v1Inputs['num_images.strength_2'] = 1;
    i2v1Inputs['num_images.image_2'] = ['prep_end', 0];
    i2v1Inputs['num_images.index_2'] = opts.frames - 1;
  }
  graph.i2v1 = { class_type: 'LTXVImgToVideoInplaceKJ', inputs: i2v1Inputs };
  graph.concat1 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['i2v1', 0], audio_latent: audioLatent },
  };
  graph.ref1 = {
    class_type: 'LTXReferenceConditioning',
    inputs: {
      model: erosModel, vae: ['ckpt', 2], image: ['resize_half', 0],
      target_latent: ['i2v1', 0], strength: 1, position_mode: 'reference', verbose: false,
    },
  };
  graph.sig1 = { class_type: 'EchoDMDSigmas', inputs: { preset: 'custom', custom_sigmas: opts.sigmaFirst } };
  graph.sig1_remap = { class_type: 'EchoDMDSigmaRemap', inputs: { sigmas: ['sig1', 0], method: 'interpolate' } };
  graph.dmd_sampler = { class_type: 'EchoDMDSampler', inputs: {} };
  graph.first = {
    class_type: 'SamplerCustom',
    inputs: {
      model: ['ref1', 0], positive: ['cond', 0], negative: ['negz', 0],
      sampler: ['dmd_sampler', 0], sigmas: ['sig1_remap', 0], latent_image: ['concat1', 0],
      add_noise: true, noise_seed: opts.seed, cfg: 1,
    },
  };
  graph.sep1 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['first', 1] } };

  // Stage 2 (x2 latent upsample + refine)
  graph.ups_model = { class_type: 'LatentUpscaleModelLoader', inputs: { model_name: settings.ltxUpscaler } };
  graph.ups = {
    class_type: 'LTXVLatentUpsampler',
    inputs: { samples: ['sep1', 0], upscale_model: ['ups_model', 0], vae: ['ckpt', 2] },
  };
  const i2v2Inputs = {
    vae: ['ckpt', 2], latent: ['ups', 0],
    num_images: opts.endImageName ? '2' : '1',
    'num_images.strength_1': 1,
    'num_images.image_1': ['resize_full', 0],
    'num_images.index_1': 0,
  };
  if (opts.endImageName) {
    i2v2Inputs['num_images.strength_2'] = 1;
    i2v2Inputs['num_images.image_2'] = ['resize_end_full', 0];
    i2v2Inputs['num_images.index_2'] = opts.frames - 1;
  }
  graph.i2v2 = { class_type: 'LTXVImgToVideoInplaceKJ', inputs: i2v2Inputs };
  graph.concat2 = {
    class_type: 'LTXVConcatAVLatent',
    inputs: { video_latent: ['i2v2', 0], audio_latent: ['sep1', 1] },
  };
  graph.ref2 = {
    class_type: 'LTXReferenceConditioning',
    inputs: {
      model: erosModel, vae: ['ckpt', 2], image: ['resize_full', 0],
      target_latent: ['i2v2', 0], strength: 1, position_mode: 'reference', verbose: false,
    },
  };
  graph.sig2 = await nodeFromOrdered('ManualSigmas', [opts.sigmaUp]);
  graph.sig2_remap = { class_type: 'EchoDMDSigmaRemap', inputs: { sigmas: ['sig2', 0], method: 'none' } };
  graph.second = {
    class_type: 'SamplerCustom',
    inputs: {
      model: ['ref2', 0], positive: ['cond', 0], negative: ['negz', 0],
      sampler: ['dmd_sampler', 0], sigmas: ['sig2_remap', 0], latent_image: ['concat2', 0],
      add_noise: true, noise_seed: opts.seed, cfg: 1,
    },
  };
  graph.sep2 = { class_type: 'LTXVSeparateAVLatent', inputs: { av_latent: ['second', 1] } };

  // Decode + mux
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['sep2', 0], vae: ['ckpt', 2] } };
  graph.audio_dec = {
    class_type: 'LTXVAudioVAEDecode',
    inputs: { samples: ['sep2', 1], audio_vae: ['audio_vae', 0] },
  };

  let frameSource = ['decode', 0];
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(['decode', 0]);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  graph.video = {
    class_type: 'CreateVideo',
    inputs: { images: frameSource, audio: ['audio_dec', 0], fps: opts.fps },
  };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* --------------------------- Wan 2.2 Animate ---------------------- */
/* Replicates ComfyUI's official "Wan2.2 14B I2V" template: dual UNET  */
/* (high-noise -> low-noise expert handoff via two KSamplerAdvanced),  */
/* ModelSamplingSD3 shift 5, 16 fps, optional lightx2v 4-step LoRAs.   */

const WAN_NEGATIVE = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

function wanDims(w, h) {
  const long = 960;
  const s = long / Math.max(w || 1024, h || 1024);
  const W = Math.max(256, Math.round((w * s) / 16) * 16);
  const H = Math.max(256, Math.round((h * s) / 16) * 16);
  return { W, H };
}

async function buildAnimateWan(imageName, opts) {
  const graph = {};
  const fast = opts.fast !== false;
  const steps = fast ? 4 : 20;
  const cfg = fast ? 1 : 3.5;
  const split = fast ? 2 : 10;

  graph.high = diffusionModelLoader(settings.wanHighUnet);
  graph.low = diffusionModelLoader(settings.wanLowUnet);
  let hiModel = ['high', 0];
  let loModel = ['low', 0];
  if (fast) {
    graph.high_lora = { class_type: 'LoraLoaderModelOnly', inputs: { model: hiModel, lora_name: settings.wanHighLora, strength_model: 1 } };
    graph.low_lora = { class_type: 'LoraLoaderModelOnly', inputs: { model: loModel, lora_name: settings.wanLowLora, strength_model: 1 } };
    hiModel = ['high_lora', 0];
    loModel = ['low_lora', 0];
  }
  hiModel = chainModelLoras(graph, hiModel, opts.loras, 'uhlora');
  loModel = chainModelLoras(graph, loModel, opts.loras, 'ullora');
  graph.ms_high = { class_type: 'ModelSamplingSD3', inputs: { model: hiModel, shift: 5 } };
  graph.ms_low = { class_type: 'ModelSamplingSD3', inputs: { model: loModel, shift: 5 } };

  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.wanClip, type: 'wan', device: 'default' } };
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: opts.prompt } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: combineNegativePrompts(WAN_NEGATIVE, opts.negativePrompt) } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.wanVae } };
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.i2v = {
    class_type: 'WanImageToVideo',
    inputs: {
      positive: ['pos', 0], negative: ['neg', 0], vae: ['vae', 0], start_image: ['img', 0],
      width: opts.W, height: opts.H, length: opts.frames, batch_size: 1,
    },
  };
  graph.ks_high = {
    class_type: 'KSamplerAdvanced',
    inputs: {
      add_noise: 'enable', noise_seed: opts.seed, steps, cfg,
      sampler_name: 'euler', scheduler: 'simple',
      start_at_step: 0, end_at_step: split, return_with_leftover_noise: 'enable',
      model: ['ms_high', 0], positive: ['i2v', 0], negative: ['i2v', 1], latent_image: ['i2v', 2],
    },
  };
  graph.ks_low = {
    class_type: 'KSamplerAdvanced',
    inputs: {
      add_noise: 'disable', noise_seed: 0, steps, cfg,
      sampler_name: 'euler', scheduler: 'simple',
      start_at_step: split, end_at_step: 10000, return_with_leftover_noise: 'disable',
      model: ['ms_low', 0], positive: ['i2v', 0], negative: ['i2v', 1], latent_image: ['ks_high', 0],
    },
  };
  graph.decode = { class_type: 'VAEDecode', inputs: { samples: ['ks_low', 0], vae: ['vae', 0] } };

  let frameSource = ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['decode', 0], batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  graph.video = { class_type: 'CreateVideo', inputs: { images: frameSource, fps: 16 * (opts.smooth > 1 ? opts.smooth : 1) } };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* ------------------------------------------------------------------ */
/* SCAIL-2 motion transfer (video-to-video)                            */
/* ------------------------------------------------------------------ */
/* Replicates his "SCAIL-2 to LTX 2.3 Motion Transfer" workflow's      */
/* SCAIL stage: SAM3 tracks the human in both the driving video and    */
/* the reference image, SCAIL2ColoredMask pairs the tracks, and        */
/* WanSCAILToVideo conditions a Wan 2.1 SCAIL UNET (lightx2v 4-step    */
/* distill LoRA, 6 steps cfg 1) to re-animate the reference.           */

const SCAIL_NEGATIVE = 'worst quality, blurry, jittery, distorted, deformed, extra limbs, fused fingers, static, low quality, watermark, text';

function scailDims(w, h) {
  // Reference image target ~0.5 MP, dims snapped down to /32 (workflow behavior)
  const target = 0.5 * 1024 * 1024;
  const s = Math.sqrt(target / Math.max(1, (w || 832) * (h || 832)));
  const W = Math.max(256, Math.floor((w * s) / 32) * 32);
  const H = Math.max(256, Math.floor((h * s) / 32) * 32);
  return { W, H };
}

function imageBatchChain(graph, sources, prefix) {
  if (!sources.length) return null;
  let current = sources[0];
  for (let i = 1; i < sources.length; i += 1) {
    const key = `${prefix}${i}`;
    graph[key] = { class_type: 'ImageBatch', inputs: { image1: current, image2: sources[i] } };
    current = [key, 0];
  }
  return current;
}

async function scailAudioRef(graph, opts, fallbackDriveKey) {
  if (opts.driveAudio === false || !opts.driveVideoName) return null;
  const info = await getObjectInfo();
  if (info.VHS_LoadAudioUpload) {
    graph.drive_audio = await nodeFromOrdered('VHS_LoadAudioUpload', [], {}, {
      audio: opts.driveVideoName,
      start_time: opts.driveStartSeconds || 0,
      duration: opts.seconds || 0,
    });
    return ['drive_audio', 0];
  }
  return fallbackDriveKey ? [fallbackDriveKey, 2] : null;
}

async function buildAnimateScail(imageName, opts) {
  const graph = {};

  graph.unet = diffusionModelLoader(settings.scailUnet);
  graph.lightx = { class_type: 'LoraLoaderModelOnly', inputs: { model: ['unet', 0], lora_name: settings.scailLora, strength_model: 1 } };
  let infinityModel = null;
  if (opts.scailMode === 'infinity') {
    graph.ms = { class_type: 'ModelSamplingSD3', inputs: { model: ['lightx', 0], shift: 5 } };
    let pusaModel = ['ms', 0];
    if (settings.scailPusaLora) {
      graph.pusa = {
        class_type: 'LoraLoaderModelOnly',
        inputs: { model: ['ms', 0], lora_name: settings.scailPusaLora, strength_model: 1 },
      };
      pusaModel = ['pusa', 0];
    }
    infinityModel = chainModelLoras(graph, pusaModel, opts.loras, 'slora');
  } else {
    const model = chainModelLoras(graph, ['lightx', 0], opts.loras, 'slora');
    graph.ms = { class_type: 'ModelSamplingSD3', inputs: { model, shift: 5 } };
  }

  graph.clip = { class_type: 'CLIPLoader', inputs: { clip_name: settings.wanClip, type: 'wan', device: 'default' } };
  graph.pos = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: opts.prompt } };
  graph.neg = { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: combineNegativePrompts(SCAIL_NEGATIVE, opts.negativePrompt) } };
  graph.vae = { class_type: 'VAELoader', inputs: { vae_name: settings.wanVae } };

  // Reference image, scaled to ~0.5 MP /32
  graph.img = { class_type: 'LoadImage', inputs: { image: imageName } };
  graph.ref = {
    class_type: 'ImageScale',
    inputs: { image: ['img', 0], upscale_method: 'lanczos', width: opts.W, height: opts.H, crop: 'disabled' },
  };

  // SAM3 human tracking on the reference. Stable chunks track the driving clip once.
  graph.sam = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: settings.scailSam } };
  graph.sam_txt = { class_type: 'CLIPTextEncode', inputs: { clip: ['sam', 1], text: 'human' } };
  const trackArgs = opts.scailMode === 'infinity' ? scailInfinitySamTrackArgs() : scailSamTrackArgs();
  const maskArgs = opts.scailMode === 'infinity' ? scailInfinityMaskArgs() : scailMaskArgs();
  graph.track_ref = await nodeFromOrdered('SAM3_VideoTrack', trackArgs,
    { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['ref', 0] });

  // CLIP-vision embedding of the reference
  graph.cv = { class_type: 'CLIPVisionLoader', inputs: { clip_name: settings.scailClipVision } };
  graph.cv_enc = { class_type: 'CLIPVisionEncode', inputs: { clip_vision: ['cv', 0], image: ['ref', 0], crop: 'none' } };

  const chunkOptions = normalizeScailChunkOptions({
    mode: opts.scailMode,
    stableTracking: opts.scailStableTracking,
    chunkFrames: opts.scailChunkFrames,
    overlapFrames: opts.scailChunkOverlap,
  });
  const useStableChunks = opts.scailMode === 'chunked' && chunkOptions.stableTracking;
  const segments = opts.scailMode === 'chunked'
    ? scailSegments(opts.frames, {
      chunkFrames: chunkOptions.chunkFrames,
      overlapFrames: chunkOptions.overlapFrames,
    })
    : [{ index: 0, startFrame: 0, length: opts.frames, keepStart: 0, keepLength: opts.frames }];
  const frameRanges = [];
  let previousDecode = null;
  let previousScail = null;
  let firstDriveKey = null;
  let posterSource = null;

  if (opts.scailMode === 'infinity') {
    graph.drive_infinity = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.driveVideoName, force_rate: opts.fps, custom_width: 0, custom_height: 0,
      frame_load_cap: opts.frames, skip_first_frames: opts.driveSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.track_drive_infinity = await nodeFromOrdered('SAM3_VideoTrack', trackArgs,
      { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['drive_infinity', 0] });
    graph.masks_infinity = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
      { driving_track_data: ['track_drive_infinity', 0], ref_track_data: ['track_ref', 0] });
    graph.scail_infinity = {
      class_type: 'WanSCAILInfinity',
      inputs: {
        positive: ['pos', 0], negative: ['neg', 0], model: infinityModel, vae: ['vae', 0],
        width: opts.W, height: opts.H,
        seed: opts.seed, steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        window_length: 81, previous_frame_count: 5, max_frames: opts.frames,
        decode_tiled: false, vary_seed_per_window: false,
        pose_video: ['drive_infinity', 0], pose_video_mask: ['masks_infinity', 0],
        reference_image: ['ref', 0], reference_image_mask: ['masks_infinity', 1],
        clip_vision_output: ['cv_enc', 0],
        replacement_mode: false, pose_strength: 1, pose_start: 0, pose_end: 1,
      },
    };

    let frameSource = ['scail_infinity', 0];
    frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
    if (opts.fourK) {
      graph.vsr = rtxVideoSuperResolutionNode(frameSource);
      frameSource = ['vsr', 0];
    }
    if (opts.makePoster) {
      const info = await getObjectInfo();
      if (info.ImageFromBatch) {
        graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: ['scail_infinity', 0], batch_index: 0, length: 1 } };
        graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
      }
    }
    const videoInputs = { images: frameSource, fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) };
    const audioRef = await scailAudioRef(graph, opts, 'drive_infinity');
    if (audioRef) videoInputs.audio = audioRef;
    graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
    graph.save = {
      class_type: 'SaveVideo',
      inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
    };
    return filterInputs(graph);
  }

  if (useStableChunks) {
    graph.drive_full = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: opts.driveVideoName, force_rate: opts.fps, custom_width: 0, custom_height: 0,
      frame_load_cap: opts.frames, skip_first_frames: opts.driveSkipFrames || 0,
      select_every_nth: 1, format: 'None',
    });
    graph.track_drive_full = await nodeFromOrdered('SAM3_VideoTrack', scailSamTrackArgs(),
      { model: ['sam', 0], conditioning: ['sam_txt', 0], images: ['drive_full', 0] });
    graph.masks_full = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
      { driving_track_data: ['track_drive_full', 0], ref_track_data: ['track_ref', 0] });
    firstDriveKey = 'drive_full';
  }

  for (const seg of segments) {
    const suffix = segments.length === 1 ? '' : String(seg.index);
    const driveKey = `drive${suffix}`;
    const masksKey = `masks${suffix}`;
    const scailKey = `scail${suffix}`;
    const ksKey = `ks${suffix}`;
    const decodeKey = `decode${suffix}`;
    let driveImage = [driveKey, 0];
    let poseMask = [masksKey, 0];
    let referenceMask = [masksKey, 1];

    if (useStableChunks) {
      graph[driveKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: ['drive_full', 0], start_index: seg.startFrame, num_frames: seg.length },
      };
      graph[masksKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: ['masks_full', 0], start_index: seg.startFrame, num_frames: seg.length },
      };
      referenceMask = ['masks_full', 1];
    } else {
      const trackKey = `track_drive${suffix}`;
      if (!firstDriveKey) firstDriveKey = driveKey;
      graph[driveKey] = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
        video: opts.driveVideoName, force_rate: opts.fps, custom_width: 0, custom_height: 0,
        frame_load_cap: seg.length, skip_first_frames: (opts.driveSkipFrames || 0) + seg.startFrame,
        select_every_nth: 1, format: 'None',
      });
      graph[trackKey] = await nodeFromOrdered('SAM3_VideoTrack', scailSamTrackArgs(),
        { model: ['sam', 0], conditioning: ['sam_txt', 0], images: [driveKey, 0] });
      graph[masksKey] = await nodeFromOrdered('SCAIL2ColoredMask', maskArgs,
        { driving_track_data: [trackKey, 0], ref_track_data: ['track_ref', 0] });
      driveImage = [driveKey, 0];
      poseMask = [masksKey, 0];
      referenceMask = [masksKey, 1];
    }

    const scailLinks = {
      positive: ['pos', 0], negative: ['neg', 0], vae: ['vae', 0],
      pose_video: driveImage, pose_video_mask: poseMask,
      reference_image: ['ref', 0], reference_image_mask: referenceMask,
      clip_vision_output: ['cv_enc', 0],
    };
    if (previousDecode) scailLinks.previous_frames = previousDecode;
    const scailOverrides = {
      width: opts.W,
      height: opts.H,
      length: seg.length,
      previous_frame_count: 5,
    };
    if (previousScail) scailOverrides.video_frame_offset = [previousScail, 3];
    graph[scailKey] = await nodeFromOrdered(
      'WanSCAILToVideo',
      [512, 896, 81, 1, 1, 0, 1, 0, 5, false],
      scailLinks,
      scailOverrides
    );

    graph[ksKey] = {
      class_type: 'KSampler',
      inputs: {
        model: ['ms', 0], positive: [scailKey, 0], negative: [scailKey, 1], latent_image: [scailKey, 2],
        seed: opts.seed + seg.index, steps: 6, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
      },
    };
    graph[decodeKey] = { class_type: 'VAEDecode', inputs: { samples: [ksKey, 0], vae: ['vae', 0] } };
    previousDecode = [decodeKey, 0];
    previousScail = scailKey;
    if (!posterSource) posterSource = previousDecode;

    let kept = previousDecode;
    if (seg.keepStart || seg.keepLength !== seg.length) {
      const rangeKey = `range${suffix}`;
      graph[rangeKey] = {
        class_type: 'GetImageRangeFromBatch',
        inputs: { images: previousDecode, start_index: seg.keepStart, num_frames: seg.keepLength },
      };
      kept = [rangeKey, 0];
    }
    frameRanges.push(kept);
  }

  let frameSource = imageBatchChain(graph, frameRanges, 'join') || ['decode', 0];
  frameSource = await rifeSmooth(graph, frameSource, opts.smooth);
  if (opts.fourK) {
    graph.vsr = rtxVideoSuperResolutionNode(frameSource);
    frameSource = ['vsr', 0];
  }
  if (opts.makePoster) {
    const info = await getObjectInfo();
    if (info.ImageFromBatch) {
      graph.poster_pick = { class_type: 'ImageFromBatch', inputs: { image: posterSource || frameSource, batch_index: 0, length: 1 } };
      graph.poster_save = { class_type: 'SaveImage', inputs: { images: ['poster_pick', 0], filename_prefix: 'KreaStudio/poster' } };
    }
  }
  const videoInputs = { images: frameSource, fps: opts.fps * (opts.smooth > 1 ? opts.smooth : 1) };
  const audioRef = await scailAudioRef(graph, opts, firstDriveKey);
  if (audioRef) videoInputs.audio = audioRef;
  graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/** Optional RIFE interpolation stage for any supported video frame batch. */
async function rifeSmooth(graph, frameSource, smooth) {
  if (!smooth || smooth <= 1) return frameSource;
  const info = await getObjectInfo();
  if (!info['RIFE VFI']) {
    throw new Error('RIFE VFI node not found — install ComfyUI-Frame-Interpolation for smooth frame rates.');
  }
  const ckpts = info['RIFE VFI'].input?.required?.ckpt_name?.[0] || [];
  const ckpt = ckpts.includes('rife49.pth') ? 'rife49.pth' : (ckpts[ckpts.length - 1] || 'rife47.pth');
  graph.rife = await nodeFromOrdered(
    'RIFE VFI',
    [ckpt, 10, smooth, true, true, 1],
    { frames: frameSource }
  );
  return ['rife', 0];
}

async function buildExistingVideoUpscale(videoName, opts) {
  const graph = {};
  graph.src = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
    video: videoName,
    force_rate: opts.fps || 0,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: opts.frames || 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: 'None',
  });
  const engine = opts.engine === 'seedvr2' ? 'seedvr2' : 'rtx';
  let frameSource;
  if (engine === 'seedvr2') {
    const gpuVendor = setupHardwareProfile(await getSetupHardwareInfo()).gpuVendor;
    const availableModels = installedSeedVr2Models(seedVr2ModelDirs());
    const seedVr2 = seedVr2UpscaleNodes(['src', 0], {
      settings,
      availableModels,
      gpuVendor,
      profile: opts.profile || 'sharp',
      noise: opts.noise || 'low',
      resolution: opts.resolution || 1080,
      batchSize: 5,
      uniformBatchSize: true,
      temporalOverlap: 2,
    });
    Object.assign(graph, seedVr2.nodes);
    frameSource = seedVr2.output;
  } else {
    graph.vsr = rtxVideoSuperResolutionNode(['src', 0], opts.scale || 2);
    frameSource = ['vsr', 0];
  }
  const videoInputs = { images: frameSource, fps: opts.fps || 16 };
  if (opts.hasAudio) videoInputs.audio = ['src', 2];
  graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: `KreaStudio/video_upscale_${engine}`, format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

async function buildExistingVideoInterpolate(videoName, opts) {
  const graph = {};
  const smooth = [2, 3, 4].includes(Number(opts.smooth)) ? Number(opts.smooth) : 2;
  const fps = opts.fps || 16;
  graph.src = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
    video: videoName,
    force_rate: fps,
    custom_width: 0,
    custom_height: 0,
    frame_load_cap: opts.frames || 0,
    skip_first_frames: 0,
    select_every_nth: 1,
    format: 'None',
  });
  const frameSource = await rifeSmooth(graph, ['src', 0], smooth);
  const videoInputs = { images: frameSource, fps: fps * smooth };
  if (opts.hasAudio) videoInputs.audio = ['src', 2];
  graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
  graph.save = {
    class_type: 'SaveVideo',
    inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/video_interp', format: 'auto', codec: 'auto' },
  };
  return filterInputs(graph);
}

/* ------------------------------------------------------------------ */
/* HTTP helpers                                                        */
/* ------------------------------------------------------------------ */

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function promptPackErrorResponse(res, error) {
  const code = error?.code || 'invalid_prompt_pack';
  const status = code === 'prompt_pack_too_large' ? 413
    : code === 'prompt_pack_not_found' ? 404
      : ['prompt_pack_exists', 'prompt_pack_downgrade', 'prompt_pack_inspection_expired'].includes(code) ? 409
        : 400;
  return json(res, status, { error: String(error?.message || error || 'Prompt pack could not be processed'), code });
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJsonBody(req) {
  const buf = await readBody(req, 8 * 1024 * 1024);
  return JSON.parse(buf.toString('utf8') || '{}');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.aac': 'audio/aac', '.opus': 'audio/opus',
};
function serveFile(res, file, range) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const dataFile = file === DATA || file.startsWith(DATA + path.sep);
    const cacheHeaders = dataFile
      ? { 'Cache-Control': 'private, max-age=31536000, immutable', Vary: 'Cookie' }
      : { 'Cache-Control': 'no-cache' };
    // Range support so <video> can seek
    if (range) {
      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? Math.min(parseInt(m[2], 10), st.size - 1) : st.size - 1;
        res.writeHead(206, {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': end - start + 1,
          ...cacheHeaders,
        });
        fs.createReadStream(file, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      ...cacheHeaders,
    });
    fs.createReadStream(file).pipe(res);
  });
}

function sendPublicAssetBuffer(res, name, buffer, recoveredFrom = '') {
  const mime = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
  const headers = {
    'Content-Type': mime,
    'Content-Length': buffer.length,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
  };
  if (recoveredFrom) headers['X-Mix-Studio-Asset-Recovery'] = recoveredFrom;
  res.writeHead(200, headers);
  res.end(buffer);
}

async function trackedCriticalPublicAsset(name) {
  if (!isCriticalPublicAsset(name)) return null;
  if (CRITICAL_PUBLIC_GIT_CACHE.has(name)) return CRITICAL_PUBLIC_GIT_CACHE.get(name);
  try {
    const text = await gitCommand(ROOT, ['show', `HEAD:public/${name}`], {
      gitExecutable: RUNTIME.update.gitExecutable,
    });
    const data = Buffer.from(text, 'utf8');
    if (!isUsableCriticalPublicAsset(name, data)) return null;
    CRITICAL_PUBLIC_GIT_CACHE.set(name, data);
    return data;
  } catch (error) {
    console.error(`[static] Could not recover public/${name} from Git:`, error.message);
    return null;
  }
}

async function serveCriticalPublicAsset(res, file, name) {
  try {
    const data = await fsp.readFile(file);
    if (isUsableCriticalPublicAsset(name, data)) return sendPublicAssetBuffer(res, name, data);
  } catch { /* Use the startup or Git fallback below. */ }

  const startup = CRITICAL_PUBLIC_STARTUP_CACHE.get(name);
  if (startup) {
    console.warn(`[static] Recovered missing public/${name} from the startup cache.`);
    return sendPublicAssetBuffer(res, name, startup, 'startup-cache');
  }
  const tracked = await trackedCriticalPublicAsset(name);
  if (tracked) {
    console.warn(`[static] Recovered missing public/${name} from Git HEAD.`);
    return sendPublicAssetBuffer(res, name, tracked, 'git-head');
  }
  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  return res.end(`Mix Studio cannot load public/${name}. Repair or reinstall the app.`);
}

function safeMediaPath(root, encodedName) {
  let decoded;
  try { decoded = decodeURIComponent(String(encodedName || '')); } catch { return null; }
  if (!decoded || decoded.includes('\0')) return null;
  const file = path.resolve(root, decoded);
  if (file === root || !file.startsWith(root + path.sep)) return null;
  return {
    file,
    name: path.relative(root, file).split(path.sep).join('/'),
  };
}

const videoPreviewJobs = new Map();
let videoPreviewQueue = Promise.resolve();

async function cachedVideoPreview(media, options = {}) {
  const preview = normalizeVideoPreviewOptions(options);
  const sourceStat = await fsp.stat(media.file);
  if (!sourceStat.isFile()) throw Object.assign(new Error('Video not found'), { code: 'ENOENT' });
  const fingerprint = crypto.createHash('sha256')
    .update(`preview-v2\0${media.name}\0${sourceStat.size}\0${Math.round(sourceStat.mtimeMs)}\0${preview.size}\0${preview.fps}`)
    .digest('hex')
    .slice(0, 24);
  const output = path.join(VIDEO_PREVIEWS, `${fingerprint}.mp4`);
  const existing = await fsp.stat(output).catch(() => null);
  if (existing?.isFile() && existing.size > 0) return output;
  if (videoPreviewJobs.has(output)) return videoPreviewJobs.get(output);

  const temp = path.join(VIDEO_PREVIEWS, `${fingerprint}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp.mp4`);
  const create = async () => {
    if (!videoExtensionFfmpeg) videoExtensionFfmpeg = await resolveFfmpegExecutable(RUNTIME);
    if (!videoExtensionFfmpeg) throw Object.assign(new Error('Video previews require FFmpeg'), { code: 'ffmpeg_unavailable' });
    try {
      await transcodeVideoPreview({
        sourcePath: media.file,
        outputPath: temp,
        ffmpegPath: videoExtensionFfmpeg,
        size: preview.size,
        fps: preview.fps,
      });
      await fsp.rename(temp, output);
      return output;
    } finally {
      await fsp.rm(temp, { force: true }).catch(() => {});
    }
  };
  const job = videoPreviewQueue.then(create, create);
  videoPreviewQueue = job.then(() => undefined, () => undefined);
  videoPreviewJobs.set(output, job);
  job.finally(() => videoPreviewJobs.delete(output)).catch(() => {});
  return job;
}

function storedMediaName(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function itemImageFiles(item) {
  const files = new Set([item?.file, item?.upscaled, item?.sourceFile]
    .map(storedMediaName).filter(Boolean));
  for (const composite of item?.composites || []) {
    const file = storedMediaName(composite?.file);
    if (file) files.add(file);
  }
  for (const layout of Object.values(item?.strengthHunt?.layouts || {})) {
    const file = storedMediaName(layout?.file);
    if (file) files.add(file);
  }
  return files;
}

function canAccessProfileMedia(req, profile, kind, fileName) {
  if (!profile) return false;
  const requested = storedMediaName(fileName);
  if (!requested) return false;
  if (kind === 'face') {
    return db.faces.some((face) => (
      face.profileId === profile.id && storedMediaName(face.file) === requested
    ));
  }
  const visibleItems = galleryView(db, isPrivateUnlocked(req)).items
    .filter((item) => item.profileId === profile.id);
  if (kind === 'video') {
    return visibleItems.some((item) => (item.videos || []).some((video) => (
      storedMediaName(video?.file) === requested
    )));
  }
  if (kind === 'image') {
    return visibleItems.some((item) => itemImageFiles(item).has(requested));
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* API routes                                                          */
/* ------------------------------------------------------------------ */

const REQUIRED_CLASSES = {
  core: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoader', 'CLIPTextEncode', 'ConditioningZeroOut',
    'EmptySD3LatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'LoadImage', 'ImageScale', 'ImageScaleBy',
    'VAEEncode', 'RepeatLatentBatch',
    'ImageScaleToTotalPixels', 'StringConcatenate', 'TextEncodeQwenImageEditPlus'],
  enhance: ['TextGenerate', 'PreviewAny'],
  klein: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode', 'ConditioningZeroOut', 'VAEEncode',
    'ReferenceLatent', 'GetImageSize', 'EmptyFlux2LatentImage', 'Flux2Scheduler', 'CFGGuider',
    'RandomNoise', 'KSamplerSelect', 'SamplerCustomAdvanced', 'VAEDecode', 'SaveImage',
    'ImageToMask', 'GrowMask', 'SetLatentNoiseMask', 'ImageCompositeMasked'],
  qwenedit: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingAuraFlow',
    'CFGNorm', 'FluxKontextImageScale', 'TextEncodeQwenImageEditPlus', 'FluxKontextMultiReferenceLatentMethod',
    'VAEEncode', 'KSampler', 'VAEDecode', 'SaveImage', 'ImageToMask', 'GrowMask',
    'SetLatentNoiseMask', 'ImageCompositeMasked'],
  regional: ['Ideogram4PromptBuilderKJ', 'Krea2RegionalMultiLoRAV3'],
  faceid: ['LTXIdentityOverlapConditioning', 'ImageResizeKJv2', 'TextGenerate'],
  krea2ref: ['Krea2EditModelPatch', 'Krea2EditGroundedEncode', 'LoraLoaderModelOnly'],
  krea2remix: ['Krea2EditRebalance', 'BasicGuider', 'BasicScheduler', 'SamplerCustomAdvanced'],
  krea2outpaint: ['Krea2EditModelPatch', 'Krea2EditGroundedEncode', 'ImagePadForOutpaint', 'ColorMatch', 'ImageToMask', 'SolidMask', 'FeatherMask'],
  editoutpaint: ['ImagePadForOutpaint', 'DrawMaskOnImage', 'ColorMatch', 'ImageToMask', 'SolidMask', 'FeatherMask'],
  krea2inpaint: ['LoadImage', 'ImageToMask', 'GrowMask', 'VAEEncode', 'SetLatentNoiseMask',
    'ImageCompositeMasked', 'KSampler', 'VAEDecode', 'SaveImage'],
  krea2depth: ['DownloadAndLoadDepthAnythingV3Model', 'DepthAnything_V3',
    'Krea2ControlLoRALoader', 'Krea2ControlImageEncode', 'Krea2ControlApply'],
  krea2style: ['Krea2StyleReference', 'Krea2StyleTransfer'],
  smartmask: SAM3_MASK_CLASSES,
  upscale: ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler'],
  ultimateupscale: ['UltimateSDUpscale', 'UpscaleModelLoader'],
    video: ['CheckpointLoaderSimple', 'LoraLoaderModelOnly', 'LTXAVTextEncoderLoader', 'TextGenerateLTX2Prompt',
    'LTXVConditioning', 'EmptyLTXVLatentVideo', 'LTXVImgToVideoInplace', 'LTXVAudioVAELoader',
    'LTXVEmptyLatentAudio', 'LTXVConcatAVLatent', 'LTXVSeparateAVLatent', 'RandomNoise', 'CFGGuider',
    'KSamplerSelect', 'ManualSigmas', 'SamplerCustomAdvanced', 'LatentUpscaleModelLoader',
    'LTXVLatentUpsampler', 'LTXVCropGuides', 'VAEDecodeTiled', 'LTXVAudioVAEDecode', 'CreateVideo',
    'SaveVideo', 'ImageScale', 'LTXVPreprocess'],
  ltx25: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'CLIPTextEncode', 'TextGenerateLTX2Prompt',
    'PreviewAny', 'LTXVConditioning', 'EmptyLTXVLatentVideo', 'LTXVImgToVideoInplace',
    'LTXVAddGuide', 'LTXVCropGuides', 'LTXVEmptyLatentAudio', 'LTXVConcatAVLatent',
    'LTXVSeparateAVLatent', 'LTXVDualCFGGuider', 'RandomNoise', 'KSamplerSelect',
    'ManualSigmas', 'SamplerCustomAdvanced', 'LatentUpscaleModelLoader', 'LTXVLatentUpsampler',
    'VAEDecodeTiled', 'LTXVAudioVAEDecode', 'CreateVideo', 'SaveVideo', 'ImageScale',
    'LTXVPreprocess', 'LoadImage', 'LoadAudio', 'LTXVAudioVAEEncode', 'SolidMask',
    'SetLatentNoiseMask', 'ImageFromBatch', 'SaveImage'],
  ltx25quality: ['LTXVScheduler', 'LTXVSpatioTemporalGuidance', 'LTXVModalityGuidance'],
  h3: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'MiniMaxH3ImageToVideo', 'RandomNoise', 'BasicGuider',
    'KSamplerSelect', 'BasicScheduler', 'SamplerCustomAdvanced', 'VAEDecode', 'VAEDecodeAudio',
    'CreateVideo', 'SaveVideo', 'ImageFromBatch', 'SaveImage'],
  h3r2v: ['MiniMaxH3ReferenceToVideo', 'VHS_LoadVideo', 'VHS_LoadAudioUpload'],
  h3turbo: ['MiniMaxH3TurboLoRA', 'MiniMaxH3TurboSampler'],
  h3turbor2v: ['LoraLoaderModelOnly', 'MiniMaxH3SigmaShift', 'MiniMaxH3TurboSampler'],
  h3context: ['MiniMaxH3MotionContext', 'MiniMaxH3MotionContextTrim',
    'MiniMaxH3MotionContextSaveLatent', 'MiniMaxH3MotionContextLoadLatent'],
  h3sage: ['PathchSageAttentionKJ'],
  ltxdirector: ['LTXDirector', 'LTXDirectorGuide', 'LTXDirectorCropGuides'],
  ltxcamera: ['LTXICLoRALoaderModelOnly', 'LTXAddVideoICLoRAGuide', 'LTXVImgToVideoConditionOnly',
    'VHS_LoadVideo', 'ImageBatch'],
  videoedit: ['VHS_LoadVideo', 'LTXVAddGuide'],
  video4k: ['RTXVideoSuperResolution'],
  rife: ['RIFE VFI'],
  wan: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingSD3',
    'WanImageToVideo', 'KSamplerAdvanced', 'VAEDecode', 'CreateVideo', 'SaveVideo'],
  wananimate2: ['UNETLoader', 'LoraLoaderModelOnly', 'CLIPLoader', 'CLIPTextEncode', 'CLIPVisionLoader',
    'CLIPVisionEncode', 'VAELoader', 'LoadImage', 'LoadVideo', 'GetVideoComponents',
    'ResizeImageMaskNode', 'ImageFromBatch', 'WanAnimate2ToVideo', 'ModelSamplingSD3', 'BasicScheduler',
    'KSamplerSelect', 'SamplerCustom', 'TrimVideoLatent', 'VAEDecode', 'CreateVideo', 'SaveVideo', 'SaveImage'],
  eros: ['CheckpointLoaderSimple', 'LTXVAudioVAELoader', 'LTXAVTextEncoderLoader', 'ImageResizeKJv2',
    'LTXVPreprocess', 'LTXReferenceEnable', 'LTXReferenceConditioning', 'LoraLoaderModelOnly',
    'EmptyLTXVLatentVideo', 'LTXVEmptyLatentAudio', 'LTXVImgToVideoInplaceKJ', 'LTXVConcatAVLatent',
    'EchoDMDSigmas', 'EchoDMDSigmaRemap', 'EchoDMDSampler', 'SamplerCustom', 'LTXVSeparateAVLatent',
    'LatentUpscaleModelLoader', 'LTXVLatentUpsampler', 'ManualSigmas', 'VAEDecode', 'LTXVAudioVAEDecode',
    'CreateVideo', 'SaveVideo'],
  scail: ['UNETLoader', 'CLIPLoader', 'VAELoader', 'LoraLoaderModelOnly', 'ModelSamplingSD3',
    'CLIPVisionLoader', 'CLIPVisionEncode', 'CheckpointLoaderSimple', 'CLIPTextEncode', 'ImageScale',
    'VHS_LoadVideo', 'SAM3_VideoTrack', 'SCAIL2ColoredMask', 'WanSCAILToVideo', 'KSampler',
    'VAEDecode', 'GetImageRangeFromBatch', 'ImageBatch', 'VHS_LoadAudioUpload', 'CreateVideo', 'SaveVideo'],
  scailinfinity: ['WanSCAILInfinity'],
};

const KREA2_DEPENDENCY_COMPONENTS = new Set([
  'image', 'krea2raw', 'regional', 'krea2ref', 'krea2remix', 'krea2outpaint', 'krea2depth', 'krea2style',
]);
const H3_DEPENDENCY_COMPONENTS = new Set(['h3', 'h3r2v', 'h3turbo', 'h3turbor2v', 'h3context', 'h3sage', 'h3dyntime']);

function dependencyComponentInfo(id, fit = null) {
  const component = DEPENDENCY_COMPONENTS[id] || {};
  const unavailableNode = (component.nodes || [])
    .map((nodeId) => DEPENDENCY_NODE_PACKS[nodeId])
    .find((pack) => pack?.automaticInstall === false);
  return {
    id,
    label: component.label || id,
    optional: component.optional === true,
    fit,
    installable: !unavailableNode,
    installReason: unavailableNode
      ? `${unavailableNode.label} requires a reviewed manual installation because ${unavailableNode.unavailableReason || 'automatic installation is unavailable'}.`
      : '',
  };
}

function setupDependencyComponentInfo(id, fit, krea2Core, h3Core, ltx25Core = null, wanAnimate2Core = null, sageAttention = null) {
  const component = dependencyComponentInfo(id, fit);
  if (fit?.blocked) {
    component.installable = false;
    component.blockedBy = 'hardware';
    component.installReason = fit.detail || 'This workflow is not supported on the connected generation device.';
  }
  if (krea2Core && krea2Core.supported !== true && KREA2_DEPENDENCY_COMPONENTS.has(id)) {
    component.installable = false;
    component.blockedBy = 'comfy-core';
    component.installReason = krea2ClipCompatibilityError(krea2Core);
  }
  if (h3Core && h3Core.supported !== true && H3_DEPENDENCY_COMPONENTS.has(id)) {
    component.installable = false;
    component.blockedBy = 'comfy-core';
    component.installReason = minimaxH3CompatibilityError(h3Core);
  }
  if ((id === 'ltx25' || id === 'ltx25quality') && ltx25Core && ltx25Core.supported !== true) {
    component.installable = false;
    component.blockedBy = 'comfy-core';
    component.installReason = ltx25CompatibilityError(ltx25Core);
  }
  if (id === 'wananimate2' && wanAnimate2Core && wanAnimate2Core.supported !== true) {
    component.installable = false;
    component.blockedBy = 'comfy-core';
    component.installReason = wanAnimate2Core.reason;
  }
  if (id === 'h3sage' && sageAttention && sageAttention.ready !== true && sageAttention.installable !== true) {
    component.installable = false;
    component.blockedBy = 'sage-runtime';
    component.installReason = sageAttention.reason || 'SageAttention cannot be installed automatically in this ComfyUI Python environment.';
  }
  return component;
}

function wanAnimate2CoreCompatibility(info, version = '') {
  const required = ['WanAnimate2ToVideo', 'LoadVideo', 'GetVideoComponents',
    'ResizeImageMaskNode', 'ImageFromBatch', 'TrimVideoLatent', 'CreateVideo', 'SaveVideo', 'SaveImage'];
  const missingNodes = required.filter((className) => !info?.[className]);
  const conditioningInfo = info?.WanAnimate2ToVideo;
  const inputGroups = conditioningInfo?.input;
  const inputNames = inputGroups && typeof inputGroups === 'object'
    ? new Set(Object.values(inputGroups).flatMap((group) => Object.keys(group || {})))
    : null;
  const missingInputs = inputNames
    ? ['continue_motion', 'video_frame_offset'].filter((name) => !inputNames.has(name))
    : [];
  const missingOutputs = Array.isArray(conditioningInfo?.output) && conditioningInfo.output.length < 6
    ? ['trim_image', 'video_frame_offset']
    : [];
  return {
    supported: missingNodes.length === 0 && missingInputs.length === 0 && missingOutputs.length === 0,
    version: String(version || ''),
    missingNodes,
    missingInputs,
    missingOutputs,
    reason: missingNodes.length || missingInputs.length || missingOutputs.length
      ? 'Update ComfyUI to a current build with native Wan Animate 2 support, restart it, then check again.'
      : '',
  };
}

let mobileAccessStatusCache = null;
let mobileAccessStatusExpiresAt = 0;

async function currentMobileAccessStatus(force = false) {
  if (!force && mobileAccessStatusCache && Date.now() < mobileAccessStatusExpiresAt) {
    return mobileAccessStatusCache;
  }
  const discovered = mobileAccessSummary(os.networkInterfaces(), PORT);
  const https = discovered.tailscaleDetected
    ? await tailscaleHttpsStatus(PORT)
    : { available: false, configured: false, secureUrl: '', reason: 'Tailscale is not connected.' };
  mobileAccessStatusCache = Object.assign({}, discovered, {
    secureUrl: https.secureUrl || '',
    installableUrl: https.secureUrl || '',
    httpsAvailable: https.available === true,
    httpsConfigured: https.configured === true,
    httpsConflict: https.conflict === true,
    httpsReason: https.reason || '',
  });
  mobileAccessStatusExpiresAt = Date.now() + 15_000;
  return mobileAccessStatusCache;
}

async function currentSparkAccessStatus() {
  const owner = db.profiles[0] || null;
  const token = sparkAccess.token;
  const funnel = token
    ? await sparkFunnelStatus(token, PORT)
    : { available: true, configured: false, conflict: false, url: '', reason: '' };
  const enabled = sparkAccess.enabled === true
    && !!token
    && !!owner
    && sparkAccess.profileId === owner.id;
  return {
    enabled,
    configured: enabled && funnel.configured === true,
    available: funnel.available === true,
    conflict: funnel.conflict === true,
    url: enabled && funnel.configured ? funnel.url : '',
    reason: funnel.reason || '',
    scope: ['status', 'recent generations', 'generate image', 'generate video'],
  };
}

async function setupStatusPayload(forceCompatibility = false) {
  const detected = sam3InstallStatus(RUNTIME);
  const launch = startStatus(RUNTIME);
  const ownerHasPin = !!db.profiles[0]?.pinHash;
  const discoveredMobileAccess = await currentMobileAccessStatus(forceCompatibility);
  const mobileAccess = Object.assign({}, discoveredMobileAccess, {
    pinProtected: ownerHasPin,
    remoteAccessReady: !!(discoveredMobileAccess.tailscaleUrl || discoveredMobileAccess.localUrl),
  });
  const hardwareInfoValue = await getSetupHardwareInfo();
  const hardwareProfile = setupHardwareProfile(hardwareInfoValue);
  adoptDeviceCompatibleModelSettings(hardwareProfile);
  const krea2Recommendation = recommendedKrea2Variant(hardwareProfile);
  const vramRecommendation = recommendedVramProfile(hardwareProfile);
  const guidance = componentHardwareGuidance(SETUP_FEATURE_MANIFEST, hardwareInfoValue);
  const quickSetup = recommendedQuickSetup(hardwareInfoValue);
  let connected = false;
  let connectionError = '';
  let info = null;
  try {
    info = await getObjectInfo(forceCompatibility);
    connected = true;
  } catch (error) {
    connectionError = String(error.message || error);
  }
  const compatibility = connected
    ? await getComfyCompatibility(forceCompatibility, detected.basePath)
    : nativeInt8Compatibility(null, detected.basePath);
  const krea2Core = connected
    ? krea2ClipCompatibility(info, compatibility.version)
    : krea2ClipCompatibility(null, compatibility.version);
  const h3Core = minimaxH3Compatibility(connected ? info : null, compatibility.version);
  const ltx25Core = ltx25Compatibility(connected ? info : null, compatibility.version);
  const wanAnimate2Core = connected ? wanAnimate2CoreCompatibility(info, compatibility.version) : null;
  const sageRuntime = await probeSageAttention(RUNTIME, {
    status: detected,
    force: forceCompatibility,
  });
  const sageAttention = Object.assign({}, sageRuntime, {
    packageReady: sageRuntime.ready === true,
    nodeReady: !!info?.PathchSageAttentionKJ,
    ready: sageRuntime.ready === true && !!info?.PathchSageAttentionKJ,
  });
  if (sageRuntime.ready === true && !sageAttention.nodeReady) {
    sageAttention.reason = 'ComfyUI-KJNodes is needed for the H3 SageAttention graph patch.';
  }
  const detectedModelsPath = await connectedModelsPath(detected.basePath || RUNTIME.comfy.path);
  return {
    appReady: true,
    platform: process.platform,
    quickComponents: quickSetup.components,
    quickSetup,
    quickFit: combinedHardwareFit(quickSetup.components, guidance),
    hardware: hardwareProfile,
    capabilities: { video: configuredVideoEngineCapabilities(hardwareProfile, settings) },
    modelRecommendations: { krea2: krea2Recommendation },
    modelVariants: { krea2: settings.krea2ModelVariant },
    vramProfile: {
      configured: settings.vramProfile,
      recommended: vramRecommendation,
      effective: resolveVramProfile(settings.vramProfile, hardwareProfile),
    },
    huggingFace: {
      tokenConfigured: !!String(settings.hfToken || process.env.HF_TOKEN || '').trim(),
    },
    restart: Object.assign(restartStatus(RUNTIME), { running: comfyRestartRunning }),
    mobileAccess,
    components: availableComponents().map((id) => setupDependencyComponentInfo(
      id,
      guidance[id] || null,
      connected ? krea2Core : null,
      h3Core,
      ltx25Core,
      wanAnimate2Core,
      sageAttention,
    )),
    comfy: {
      connected,
      connectionError,
      version: compatibility.version,
      krea2: krea2Core,
      minimaxH3: h3Core,
      ltx25: ltx25Core,
      wanAnimate2: wanAnimate2Core,
      sageAttention,
      nativeInt8: compatibility,
      url: settings.comfyUrl,
      configuredPath: RUNTIME.comfy.path || '',
      detectedPath: detected.basePath || '',
      partialPath: detected.partialPath || '',
      modelsPath: RUNTIME.comfy.modelsPath || detectedModelsPath,
      pythonReady: !!detected.pythonPath,
      canInstallDependencies: detected.canInstall,
      dependencyReason: detected.reason || '',
      canInstallOfficial: process.platform === 'win32',
      install: comfySetupState,
      start: Object.assign({}, launch, comfyStartState, { running: comfyStartRunning }),
    },
  };
}

async function handleApi(req, res, url) {
  const route = url.pathname;

  if (route === '/api/analytics-config' && req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, publicAnalyticsConfig(RUNTIME));
  }

  /* ------------------------- Auth / profiles ----------------------- */
  const profile = currentProfile(req);
  req.profile = profile;

  if (appUpdateRunning && req.method !== 'GET' && route !== '/api/update') {
    res.setHeader('Retry-After', '5');
    return json(res, 503, { error: 'Mix Studio is applying an update. Try again after it reconnects.', code: 'app_updating' });
  }

  if (route === '/api/me') {
    if (!profile) return json(res, 401, { error: 'Not signed in', code: 'auth' });
    if (req.usedDefaultProfile) {
      res.setHeader('Set-Cookie', profileCookie(signProfileId(profile.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    }
    return json(res, 200, { profile: publicProfile(profile, db) });
  }
  if (route === '/api/profiles' && req.method === 'GET') {
    const remote = !isLoopbackRequest(req);
    return json(res, 200, {
      profiles: db.profiles.map((p) => publicProfile(p, db)),
      access: {
        remote,
        ownerHasPin: !!db.profiles[0]?.pinHash,
        hasOpenProfiles: db.profiles.some((entry) => !entry.pinHash),
      },
    });
  }
  if (route === '/api/profiles' && req.method === 'POST') {
    const owner = db.profiles[0];
    const ownerSignedIn = !!(profile && owner && profile.id === owner.id);
    if (!isLoopbackRequest(req) && !ownerSignedIn) {
      return json(res, 403, { error: 'Create profiles from the generation computer or while signed in as the Owner.' });
    }
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 30);
    if (!name) return json(res, 400, { error: 'Profile name required' });
    if (db.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return json(res, 400, { error: 'That profile name is taken' });
    }
    const pin = String(body.pin || '').trim();
    const entry = { id: uid(), name, pinHash: null, pinSalt: null, createdAt: Date.now() };
    if (pin) {
      const { salt, hash } = hashPin(pin);
      entry.pinSalt = salt;
      entry.pinHash = hash;
    }
    db.profiles.push(entry);
    saveDb();
    res.setHeader('Set-Cookie', profileCookie(signProfileId(entry.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    return json(res, 200, { profile: publicProfile(entry, db) });
  }
  const profLogin = route.match(/^\/api\/profiles\/([\w]+)\/login$/);
  if (profLogin && req.method === 'POST') {
    const body = await readJsonBody(req);
    const target = db.profiles.find((p) => p.id === profLogin[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    const throttleKey = `${requestAddress(req)}:${target.id}`;
    const allowance = profileLoginThrottle.check(throttleKey);
    if (!allowance.allowed) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil(allowance.retryAfterMs / 1000))));
      return json(res, 429, { error: 'Too many incorrect PIN attempts. Wait before trying again.', code: 'pin_rate_limited' });
    }
    if (!verifyPin(target, String(body.pin || ''))) {
      const blocked = profileLoginThrottle.fail(throttleKey);
      if (!blocked.allowed) res.setHeader('Retry-After', String(Math.max(1, Math.ceil(blocked.retryAfterMs / 1000))));
      return json(res, 401, { error: 'Wrong PIN' });
    }
    profileLoginThrottle.success(throttleKey);
    if (target.pinHash && !String(target.pinHash).startsWith('scrypt$')) {
      const upgraded = hashPin(String(body.pin || ''));
      target.pinSalt = upgraded.salt;
      target.pinHash = upgraded.hash;
      saveDb();
    }
    res.setHeader('Set-Cookie', profileCookie(signProfileId(target.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  if (route === '/api/logout' && req.method === 'POST') {
    res.setHeader('Set-Cookie', profileCookie('', 0));
    return json(res, 200, { ok: true });
  }
  // Profile management: you can manage yourself; the first profile (owner)
  // can manage everyone.
  const isAdmin = () => profile && db.profiles[0] && profile.id === db.profiles[0].id;
  const canManage = (target) => profile && target && (profile.id === target.id || isAdmin());
  const profAvatar = route.match(/^\/api\/profiles\/([\w]+)\/avatar$/);
  if (profAvatar && req.method === 'POST') {
    const target = db.profiles.find((p) => p.id === profAvatar[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to change its photo' });
    const buf = await readBody(req, 10 * 1024 * 1024);
    if (!buf.length) return json(res, 400, { error: 'No image received' });
    const file = `${target.id}_${Date.now()}.png`;
    if (target.avatar) fsp.unlink(path.join(AVATARS, target.avatar)).catch(() => { /* noop */ });
    await fsp.writeFile(path.join(AVATARS, file), buf);
    target.avatar = file;
    saveDb();
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  const profMan = route.match(/^\/api\/profiles\/([\w]+)$/);
  if (profMan && req.method === 'POST') {
    const target = db.profiles.find((p) => p.id === profMan[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to edit it' });
    const body = await readJsonBody(req);
    if (typeof body.name === 'string' && body.name.trim()) {
      const name = body.name.trim().slice(0, 30);
      if (db.profiles.some((p) => p.id !== target.id && p.name.toLowerCase() === name.toLowerCase())) {
        return json(res, 400, { error: 'That profile name is taken' });
      }
      target.name = name;
    }
    if (typeof body.pin === 'string') {
      const pin = body.pin.trim();
      if (pin) {
        const { salt, hash } = hashPin(pin);
        target.pinSalt = salt;
        target.pinHash = hash;
      } else {
        target.pinSalt = null;
        target.pinHash = null; // clear PIN
      }
      // A PIN change revokes cookies issued under the previous access policy.
      // The caller receives a replacement cookie below; other devices sign in again.
      rotateAuthSecret();
      res.setHeader('Set-Cookie', profileCookie(signProfileId(profile.id, AUTH_SECRET), 60 * 60 * 24 * 365));
    }
    saveDb();
    return json(res, 200, { profile: publicProfile(target, db) });
  }
  if (profMan && req.method === 'DELETE') {
    const target = db.profiles.find((p) => p.id === profMan[1]);
    if (!target) return json(res, 404, { error: 'Profile not found' });
    if (!canManage(target)) return json(res, 401, { error: 'Sign in as this profile to delete it' });
    if (db.profiles.length <= 1) return json(res, 400, { error: 'The last profile cannot be deleted' });
    // Hard confirmation: the exact profile name must accompany the request
    const body = await readJsonBody(req).catch(() => ({}));
    if (String(body.confirmName || '') !== target.name) {
      return json(res, 400, { error: `Deletion needs confirmName: "${target.name}"` });
    }
    backupDb('pre-delete');
    // Content moves to a trash folder instead of being destroyed
    const TRASH = path.join(DATA, 'trash', `${Date.now()}_${target.name.replace(/[^\w]+/g, '_')}`);
    await fsp.mkdir(TRASH, { recursive: true });
    const toTrash = (dir, f) => {
      if (!f) return Promise.resolve();
      return fsp.rename(path.join(dir, f), path.join(TRASH, f)).catch(() => { /* noop */ });
    };
    const owned = db.items.filter((it) => it.profileId === target.id);
    for (const it of owned) {
      for (const f of [it.file, it.upscaled, it.sourceFile, ...(it.composites || []).map((composite) => composite.file)]) await toTrash(IMAGES, f);
      for (const v of it.videos || []) await toTrash(VIDEOS, v.file);
    }
    db.items = db.items.filter((it) => it.profileId !== target.id);
    db.folders = db.folders.filter((f) => f.profileId !== target.id);
    db.history = db.history.filter((h) => h.profileId !== target.id);
    db.loraPresets = db.loraPresets.filter((p) => p.profileId !== target.id);
    db.userPreferences = db.userPreferences.filter((p) => p.profileId !== target.id);
    db.smartRuns = db.smartRuns.filter((run) => run.profileId !== target.id);
    for (const asset of db.uploadedAssets.filter((entry) => entry.profileId === target.id && !entry.deletedAt)) {
      const durable = inputAssetPath(INPUTS, asset.name);
      await fsp.rename(durable, path.join(TRASH, path.basename(durable))).catch(() => { /* noop */ });
    }
    db.uploadedAssets = db.uploadedAssets.filter((entry) => entry.profileId !== target.id);
    for (const f of db.faces.filter((x) => x.profileId === target.id)) await toTrash(FACES, f.file);
    db.faces = db.faces.filter((f) => f.profileId !== target.id);
    if (target.avatar) await toTrash(AVATARS, target.avatar);
    db.profiles = db.profiles.filter((p) => p.id !== target.id);
    saveDb();
    if (profile && profile.id === target.id) res.setHeader('Set-Cookie', profileCookie('', 0));
    return json(res, 200, { ok: true, profiles: db.profiles.map((p) => publicProfile(p, db)) });
  }
  // Everything else needs a signed-in profile. Metadata stays available for
  // the pre-login connection indicator, but live events can contain prompts,
  // previews, and completed gallery records and are always profile-scoped.
  if (!profile && route !== '/api/meta') {
    return json(res, 401, { error: 'Sign in to continue', code: 'auth' });
  }

  if (route === '/api/smart/plan/status' && req.method === 'GET') {
    pruneSmartPlanRequests();
    const requestId = smartPlanRequestId(url.searchParams.get('id'));
    const request = requestId ? smartPlanRequests.get(requestId) : null;
    if (!request || request.profileId !== req.profile.id) {
      return json(res, 404, { error: 'Smart planning request not found', code: 'smart_plan_request_missing' });
    }
    res.setHeader('Retry-After', '2');
    return json(res, 200, smartPlanRequestStatus(request));
  }

  if (route === '/api/smart/plan' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const brief = String(body.brief || '').trim().slice(0, 8000);
    if (!brief) return json(res, 400, { error: 'Describe what you want Smart mode to create' });
    const references = normalizeSmartReferences(body.references);
    const requestId = smartPlanRequestId(body.requestId) || crypto.randomUUID();
    const provider = configuredSmartPlannerLlm();
    const prompt = smartPlanningPrompt(brief, { references });
    const publicProvider = { provider: provider.provider, label: provider.label, model: provider.model };
    const signature = crypto.createHash('sha256').update(JSON.stringify([
      req.profile.id, brief, references, publicProvider,
    ])).digest('hex');
    pruneSmartPlanRequests();
    const existing = smartPlanRequests.get(requestId);
    if (existing) {
      if (existing.profileId !== req.profile.id || existing.signature !== signature) {
        return json(res, 409, {
          error: 'That Smart planning request belongs to different inputs',
          code: 'smart_plan_request_conflict',
        });
      }
      return json(res, 202, smartPlanRequestStatus(existing));
    }
    const request = {
      id: requestId,
      profileId: req.profile.id,
      signature,
      brief,
      provider: publicProvider,
      status: 'queued',
      phase: 'queued',
      message: 'Smart planning request accepted…',
      promptId: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      result: null,
      error: '',
      code: '',
    };
    smartPlanRequests.set(requestId, request);
    executeSmartPlanRequest(request, provider, prompt, references);
    res.setHeader('Retry-After', '2');
    return json(res, 202, smartPlanRequestStatus(request));
  }

  if (route === '/api/smart/plan/review' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const references = normalizeSmartReferences(body.references);
    const plan = reconcileSmartPlanReferences(
      normalizeSmartPlan(body.plan, body.plan?.summary || ''), references,
    );
    return json(res, 200, {
      plan,
      references,
      planHash: smartPlanHash(plan, references),
    });
  }

  if (route === '/api/smart/transcribe' && req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!contentType.startsWith('audio/')) {
      req.resume();
      return json(res, 415, { error: 'Smart voice input accepts an audio recording' });
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > SMART_AUDIO_LIMIT) {
      req.resume();
      return json(res, 413, { error: 'Voice recording is larger than 25 MB' });
    }
    try {
      const audio = await readBody(req, SMART_AUDIO_LIMIT);
      if (!audio.length) return json(res, 400, { error: 'No voice recording received' });
      return json(res, 200, { text: await transcribeSmartAudio(audio, contentType) });
    } catch (error) {
      return json(res, error.code === 'smart_transcription_unavailable' ? 409 : 502, {
        error: String(error.message || error), code: error.code || 'smart_transcription_failed',
      });
    }
  }

  if (route === '/api/smart/runs' && req.method === 'GET') {
    const runs = db.smartRuns
      .filter((run) => run.profileId === req.profile.id)
      .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))
      .slice(0, SMART_RUN_LIMIT)
      .map(publicSmartRun);
    return json(res, 200, { runs });
  }

  if (route === '/api/smart/runs' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (body.approved !== true) {
      return json(res, 409, {
        error: 'Review and approve this Smart plan before queueing it.',
        code: 'smart_plan_not_approved',
      });
    }
    const references = normalizeSmartReferences(body.references);
    const plan = reconcileSmartPlanReferences(
      normalizeSmartPlan(body.plan, body.plan?.summary || ''), references,
    );
    const planHash = String(body.planHash || '');
    if (!/^[a-f0-9]{64}$/.test(planHash) || smartPlanHash(plan, references) !== planHash) {
      return json(res, 409, { error: 'This Smart plan changed after review. Build the plan again before queueing.', code: 'smart_plan_changed' });
    }
    try {
      await Promise.all(references.map((reference) => externalPromptImage(reference.name, req.profile.id)));
    } catch (error) {
      return json(res, 409, { error: String(error.message || error), code: 'smart_reference_unavailable' });
    }
    const clientToken = String(body.clientToken || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 96);
    if (clientToken) {
      const existing = db.smartRuns.find((run) => run.profileId === req.profile.id && run.clientToken === clientToken);
      if (existing) return json(res, 200, { run: publicSmartRun(existing), existing: true });
    }
    const now = Date.now();
    const steps = compileSmartSteps(plan, {}, references);
    const run = {
      id: uid(), profileId: req.profile.id, clientToken: clientToken || uid(),
      brief: String(body.brief || plan.summary || '').trim().slice(0, 8000),
      planHash, plan, references,
      reviewReference: steps.some((step) => step.kind === 'reference') && body.reviewReference === true,
      steps, status: 'ready', error: '', createdAt: now, updatedAt: now,
    };
    db.smartRuns.push(run);
    retainSmartRuns(req.profile.id);
    broadcastSmartRun(run);
    await advanceSmartRun(run);
    return json(res, 201, { run: publicSmartRun(run) });
  }

  const smartRunAction = route.match(/^\/api\/smart\/runs\/([a-f0-9]+)\/(resume|retry|cancel)$/);
  if (smartRunAction && req.method === 'POST') {
    const run = smartRunForProfile(smartRunAction[1], req.profile.id);
    if (!run) return json(res, 404, { error: 'Smart production not found' });
    const action = smartRunAction[2];
    if (action === 'cancel') {
      if (smartRunFinished(run)) return json(res, 200, { run: publicSmartRun(run) });
      const active = run.steps.find((step) => ['running', 'queueing'].includes(step.status));
      const activeJob = active?.jobId ? jobs.get(active.jobId) : null;
      run.status = 'cancelled';
      run.error = 'Cancelled';
      if (active) {
        active.status = 'cancelled';
        active.error = 'Cancelled';
      }
      pushHistory({
        kind: 'cancelled',
        profileId: run.profileId,
        itemId: activeJob?.itemId || null,
        durationMs: activeJob ? jobDurationMs(activeJob) : Math.max(0, Date.now() - Number(run.createdAt || Date.now())),
        label: `Smart: ${run.plan?.title || 'production'}`,
        smartRunId: run.id,
      });
      broadcastSmartRun(run);
      if (active?.jobId) {
        await stopComfyPrompt(active.jobId);
        cancelJob(active.jobId, 'Smart production cancelled');
      }
      return json(res, 200, { run: publicSmartRun(run) });
    }
    if (action === 'resume') {
      if (run.status !== 'review') return json(res, 409, { error: 'This Smart production is not waiting for review' });
      run.status = 'running';
      run.error = '';
      broadcastSmartRun(run);
      await advanceSmartRun(run);
      return json(res, 200, { run: publicSmartRun(run) });
    }
    if (!['failed', 'attention'].includes(run.status)) {
      return json(res, 409, { error: 'This Smart production does not have a failed step to retry' });
    }
    const step = run.steps.find((candidate) => ['failed', 'attention'].includes(candidate.status));
    if (!step) return json(res, 409, { error: 'No interrupted Smart step was found' });
    step.status = 'pending';
    step.jobId = null;
    step.progress = null;
    step.error = '';
    run.status = 'running';
    run.error = '';
    broadcastSmartRun(run);
    await advanceSmartRun(run);
    return json(res, 200, { run: publicSmartRun(run) });
  }

  if (route === '/api/spark-access' && req.method === 'GET') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage Gemini Spark access' });
    res.setHeader('Cache-Control', 'no-store');
    return json(res, 200, { sparkAccess: await currentSparkAccessStatus() });
  }
  if (route === '/api/spark-access/enable' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can enable Gemini Spark access' });
    if (!sparkAccess.token) sparkAccess.token = newSparkAccessToken();
    sparkAccess.profileId = profile.id;
    sparkAccess.createdAt = sparkAccess.createdAt || Date.now();
    sparkAccess.enabled = false;
    saveSparkAccess();
    try {
      const funnel = await enableSparkFunnel(sparkAccess.token, PORT);
      sparkAccess.enabled = true;
      saveSparkAccess();
      return json(res, 200, {
        sparkAccess: Object.assign(await currentSparkAccessStatus(), { url: funnel.url }),
      });
    } catch (error) {
      return json(res, error?.code === 'tailscale_funnel_conflict' ? 409 : 400, {
        error: String(error?.message || error || 'Could not enable Gemini Spark access'),
        code: error?.code || 'spark_access_failed',
        approvalUrl: error?.approvalUrl || '',
      });
    }
  }
  if (route === '/api/spark-access/disable' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can disable Gemini Spark access' });
    const token = sparkAccess.token;
    sparkAccess.enabled = false;
    saveSparkAccess();
    try {
      await disableSparkFunnel(token);
      return json(res, 200, { sparkAccess: await currentSparkAccessStatus() });
    } catch (error) {
      return json(res, 400, {
        error: `Gemini Spark access is blocked in Mix Studio, but Tailscale could not remove its stale Funnel route: ${String(error?.message || error)}`,
        code: error?.code || 'spark_funnel_disable_failed',
      });
    }
  }

  if (route === '/api/addons' && req.method === 'GET') {
    const packs = await listInstalledPromptPacks(PROMPT_PACKS);
    return json(res, 200, {
      canManage: isAdmin(),
      packs: packs.map((pack) => publicPromptPack(pack, '/api/addons')),
    });
  }

  if (route === '/api/addons/inspect' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install add-ons' });
    try {
      const buffer = await readBody(req, MAX_PROMPT_PACK_BYTES);
      const inspected = inspectPromptPackBuffer(buffer);
      prunePromptPackInspections();
      const inspectionId = crypto.randomUUID();
      promptPackInspections.set(inspectionId, {
        inspected,
        createdAt: Date.now(),
        filename: String(req.headers['x-filename'] || '').slice(0, 180),
      });
      const current = await readInstalledPromptPack(PROMPT_PACKS, inspected.manifest.id);
      return json(res, 200, {
        inspectionId,
        ...promptPackInspectionSummary(inspected),
        current,
        versionChange: current
          ? (comparePackVersions(inspected.manifest.version, current.version) > 0
            ? 'upgrade'
            : comparePackVersions(inspected.manifest.version, current.version) < 0
              ? 'downgrade'
              : 'same')
          : 'new',
      });
    } catch (error) {
      if (String(error?.message || '') === 'Body too large') {
        error.code = 'prompt_pack_too_large';
        error.message = `Prompt pack exceeds the ${MAX_PROMPT_PACK_BYTES / (1024 * 1024)} MB limit`;
      }
      return promptPackErrorResponse(res, error);
    }
  }

  const promptPackInspectionRoute = route.match(/^\/api\/addons\/inspect\/([0-9a-f-]{36})$/i);
  if (promptPackInspectionRoute && req.method === 'DELETE') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage add-on reviews' });
    return json(res, 200, {
      ok: true,
      discarded: promptPackInspections.delete(promptPackInspectionRoute[1]),
    });
  }

  if (route === '/api/addons/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install add-ons' });
    try {
      const body = await readJsonBody(req);
      prunePromptPackInspections();
      const staged = promptPackInspections.get(String(body.inspectionId || ''));
      if (!staged || Date.now() - staged.createdAt > PROMPT_PACK_INSPECTION_TTL) {
        const error = new Error('This add-on review expired. Choose the .mixpack again.');
        error.code = 'prompt_pack_inspection_expired';
        throw error;
      }
      const installed = await serializePromptPackMutation(async () => {
        const current = await readInstalledPromptPack(PROMPT_PACKS, staged.inspected.manifest.id);
        const pack = await installPromptPack(PROMPT_PACKS, staged.inspected, {
          replace: body.replace === true,
          allowDowngrade: body.allowDowngrade === true,
        });
        return {
          pack,
          operation: current ? 'updated' : 'installed',
          previousVersion: current?.version || '',
        };
      });
      promptPackInspections.delete(String(body.inspectionId || ''));
      return json(res, 200, {
        ok: true,
        operation: installed.operation,
        previousVersion: installed.previousVersion,
        pack: publicPromptPack(installed.pack, '/api/addons'),
      });
    } catch (error) {
      return promptPackErrorResponse(res, error);
    }
  }

  const promptPackEnabled = route.match(/^\/api\/addons\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/enabled$/);
  if (promptPackEnabled && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage add-ons' });
    try {
      const body = await readJsonBody(req);
      const pack = await serializePromptPackMutation(() => setPromptPackEnabled(
        PROMPT_PACKS,
        promptPackEnabled[1],
        body.enabled === true,
      ));
      return json(res, 200, { ok: true, pack: publicPromptPack(pack, '/api/addons') });
    } catch (error) {
      return promptPackErrorResponse(res, error);
    }
  }

  const promptPackRoute = route.match(/^\/api\/addons\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)$/);
  if (promptPackRoute && req.method === 'DELETE') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can remove add-ons' });
    try {
      const removed = await serializePromptPackMutation(() => removePromptPack(
        PROMPT_PACKS,
        promptPackRoute[1],
      ));
      return json(res, 200, {
        ok: true,
        removed: { id: removed.pack.id, name: removed.pack.name, version: removed.pack.version },
        deleted: true,
        recoverable: false,
      });
    } catch (error) {
      return promptPackErrorResponse(res, error);
    }
  }

  const promptPackAsset = route.match(/^\/api\/addons\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)\/assets\/([^/]+)$/);
  if (promptPackAsset && req.method === 'GET') {
    let filename = '';
    try { filename = decodeURIComponent(promptPackAsset[2]); } catch { /* handled below */ }
    const pack = await readInstalledPromptPack(PROMPT_PACKS, promptPackAsset[1]);
    const allowed = pack?.categories.some((category) => (
      category.presets.some((preset) => preset.thumbnailFile === filename)
    ));
    if (!allowed || filename !== path.basename(filename)) {
      res.writeHead(404);
      return res.end('not found');
    }
    return serveFile(res, path.join(PROMPT_PACKS, pack.id, filename), req.headers.range);
  }

  if (route === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    sseClients.set(res, profile.id);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* noop */ } }, 25000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  if (route === '/api/releases/latest' && req.method === 'GET') {
    try {
      const app = readAppRelease(ROOT);
      return json(res, 200, await officialReleaseChecker.check(app.version));
    } catch (error) {
      return json(res, 503, {
        error: String(error.message || 'Could not check official Mix Studio releases'),
        code: error.code || 'release_check_failed',
      });
    }
  }

  if (route === '/api/trash' && req.method === 'GET') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage trash' });
    return json(res, 200, await trashDirectorySummary(TRASH_ROOT));
  }

  if (route === '/api/trash' && req.method === 'DELETE') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can empty trash' });
    const body = await readJsonBody(req).catch(() => ({}));
    if (String(body.confirm || '') !== 'EMPTY TRASH') {
      return json(res, 400, { error: 'Type EMPTY TRASH to permanently delete trashed files' });
    }
    return serializeMediaDeletion(async () => {
      try {
        const removed = await emptyTrashDirectory(TRASH_ROOT);
        return json(res, 200, { ok: true, removed });
      } catch (error) {
        console.error('[trash] empty failed:', error.message);
        return json(res, 500, { error: 'Could not completely empty Mix Studio trash. Any remaining files are still recoverable.' });
      }
    });
  }

  if (route === '/api/update' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can update Mix Studio' });
    if (appUpdateRunning) return json(res, 409, { error: 'A Mix Studio update is already running', code: 'app_updating' });
    appUpdateRunning = true;
    let keepMaintenanceUntilRestart = false;
    try {
      // Enter maintenance before the first queue check so another browser
      // cannot submit work while the network-bound fast-forward is running.
      await assertDesktopIsIdle();
      const update = await updateFromGit(ROOT, {
        channel: RUNTIME.update.channel,
        gitExecutable: RUNTIME.update.gitExecutable,
        inspectAssets: () => inspectCriticalPublicAssets(ROOT),
      });
      // ComfyUI can receive work outside Mix Studio. Check it again directly
      // before scheduling a process restart. If that race occurs after Git has
      // already updated the checkout, keep maintenance active and restart as
      // soon as the external queue becomes idle instead of stranding the new
      // files under the old server process.
      let waitingForIdle = false;
      if (update.updated && update.restartRequired) {
        try {
          await assertDesktopIsIdle();
        } catch (error) {
          if (error?.code !== 'desktop_busy') throw error;
          waitingForIdle = true;
        }
        keepMaintenanceUntilRestart = true;
      }
      json(res, 200, {
        ok: true,
        updated: update.updated,
        restarting: update.updated && update.restartRequired,
        waitingForIdle,
        instanceId: SERVER_INSTANCE_ID,
        branch: update.branch,
        version: update.release.version || update.after.slice(0, 7),
        previousVersion: update.releaseBefore.version || update.before.slice(0, 7),
        releasedAt: update.release.releasedAt,
        revision: update.after.slice(0, 7),
        changedFiles: update.changedFiles,
      });
      if (update.updated && update.restartRequired) {
        if (waitingForIdle) scheduleServerRestartWhenIdle();
        else scheduleServerRestart();
      }
      return;
    } catch (e) {
      const status = ['desktop_busy', 'update_dirty', 'update_branch', 'update_channel', 'update_origin'].includes(e.code) ? 409 : 500;
      const payload = { error: String(e.message || e), code: e.code || 'update_failed' };
      if (e.code === 'update_dirty' && Array.isArray(e.dirtyFiles)) {
        payload.dirtyFiles = e.dirtyFiles;
        payload.dirtyFileCount = Number.isFinite(e.dirtyFileCount) ? e.dirtyFileCount : e.dirtyFiles.length;
      }
      if (e.code === 'update_assets_missing' && Array.isArray(e.missingFiles)) payload.missingFiles = e.missingFiles;
      return json(res, status, payload);
    } finally {
      if (!keepMaintenanceUntilRestart) appUpdateRunning = false;
    }
  }

  if (route === '/api/app/restart' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can restart Mix Studio' });
    const assets = inspectCriticalPublicAssets(ROOT);
    if (!assets.ok) {
      return json(res, 409, {
        error: `Mix Studio cannot restart because critical app files are missing: ${assets.missing.join(', ')}.`,
        code: 'app_assets_missing',
        missingFiles: assets.missing,
      });
    }
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    json(res, 202, { ok: true, restarting: true, instanceId: SERVER_INSTANCE_ID });
    scheduleServerRestart();
    return;
  }

  if (route === '/api/settings' && req.method === 'GET') {
    await getSetupHardwareInfo().catch(() => null);
    return json(res, 200, settingsResponse());
  }
  if (route === '/api/h3/models/status' && req.method === 'GET') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can inspect shared H3 model setup' });
    const frame = h3FrameVariant(settings);
    const reference = h3ReferenceVariant(settings);
    return json(res, 200, {
      frame: Object.assign({}, frame, { filename: h3EffectiveModelName(settings, 'frames') }),
      reference: Object.assign({}, reference, { filename: h3EffectiveModelName(settings, 'reference') }),
      turbo: {
        frames: h3TurboCompatibility(settings, 'frames'),
        reference: h3TurboCompatibility(settings, 'reference'),
        preset: h3TurboPreset(settings),
      },
      dynTimePatch: await dynTimePatchStatus(RUNTIME),
    });
  }
  if (route === '/api/h3/dyntime/restore' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can restore shared ComfyUI files' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'Wait for the active dependency installation to finish.' });
    const body = await readJsonBody(req);
    if (body.confirm !== 'RESTORE COMFYUI') {
      return json(res, 400, { error: 'Type RESTORE COMFYUI exactly to restore the verified pre-DynTime files.' });
    }
    try { await assertDesktopIsIdle(); }
    catch (error) { return json(res, 409, { error: String(error.message || error) }); }
    try {
      const restored = await restoreDynTimePatch(RUNTIME);
      return json(res, 200, { ok: true, restored: restored.restored, restartRequired: true });
    } catch (error) {
      return json(res, 409, { error: String(error.message || error), code: error?.code || 'h3_dyntime_restore_failed' });
    }
  }
  if (route === '/api/models/cleanup' && req.method === 'GET') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage shared model files' });
    const candidates = await managedModelCleanupCandidates(configuredModelsRoot(), settings, DEPENDENCY_MODEL_ASSETS);
    return json(res, 200, {
      candidates: candidates.map(publicModelCleanupCandidate),
      bytes: candidates.reduce((sum, candidate) => sum + candidate.bytes, 0),
      scope: 'inactive-mix-studio-managed',
    });
  }
  if (route === '/api/models/cleanup' && req.method === 'DELETE') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can manage shared model files' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'Wait for the active model download or dependency installation to finish.' });
    try { await assertDesktopIsIdle(); }
    catch (error) { return json(res, 409, { error: String(error.message || error) }); }
    const body = await readJsonBody(req);
    try {
      const deleted = await deleteManagedModelCandidate(
        configuredModelsRoot(), settings, DEPENDENCY_MODEL_ASSETS, body.id, body.confirmName,
      );
      objectInfoCache = null;
      return json(res, 200, { ok: true, deleted: publicModelCleanupCandidate(deleted), permanent: true });
    } catch (error) {
      return json(res, error?.code === 'model_cleanup_stale' ? 409 : 400, {
        error: String(error.message || error),
        code: error?.code || 'model_cleanup_failed',
      });
    }
  }
  if (route === '/api/setup/status' && req.method === 'GET') {
    return json(res, 200, await setupStatusPayload(url.searchParams.has('refresh')));
  }
  if (route === '/api/mobile-access/enable-https' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can configure phone access' });
    try {
      await enableTailscaleHttps(PORT);
      mobileAccessStatusCache = null;
      mobileAccessStatusExpiresAt = 0;
      return json(res, 200, { mobileAccess: await currentMobileAccessStatus(true) });
    } catch (error) {
      return json(res, error?.code === 'tailscale_serve_conflict' ? 409 : 400, {
        error: String(error?.message || error || 'Could not enable secure phone access'),
        code: error?.code || 'tailscale_https_failed',
        approvalUrl: error?.approvalUrl || '',
      });
    }
  }
  if (route === '/api/setup/vram-profile' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can configure the generation computer' });
    const body = await readJsonBody(req);
    settings.vramProfile = normalizeVramProfile(body.vramProfile);
    saveJsonSync(SETTINGS_FILE, settings);
    return json(res, 200, await setupStatusPayload());
  }
  if (route === '/api/setup/krea2-variant' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can configure the generation computer' });
    const body = await readJsonBody(req);
    Object.assign(settings, krea2VariantSettings(body.krea2ModelVariant));
    saveJsonSync(SETTINGS_FILE, settings);
    return json(res, 200, await setupStatusPayload());
  }
  if (route === '/api/setup/connection' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can configure the generation desktop' });
    if (dependencyInstallRunning || comfySetupProcess) return json(res, 409, { error: 'Wait for the current setup operation to finish.' });
    try {
      await assertDesktopIsIdle();
      const body = await readJsonBody(req);
      const requestedPath = String(body.path || '').trim();
      const suppliedModelsPath = String(body.modelsPath || '').trim();
      const existingModelsPath = Object.prototype.hasOwnProperty.call(body, 'modelsPath')
        ? ''
        : RUNTIME.comfy.modelsPath;
      applySetupConnection({
        path: requestedPath,
        modelsPath: suppliedModelsPath || await connectedModelsPath(requestedPath, existingModelsPath),
        url: body.url || settings.comfyUrl,
      });
      comfySetupExpectedBasePath = '';
      updateComfySetupState({ state: 'complete', phase: 'connected', message: 'ComfyUI location saved. Checking models and nodes…', error: null });
      return json(res, 200, await setupStatusPayload());
    } catch (error) {
      return json(res, 400, { error: String(error.message || error) });
    }
  }
  if (route === '/api/setup/comfy/discover' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can discover the generation desktop' });
    try {
      const body = await readJsonBody(req).catch(() => ({}));
      const launch = startStatus(RUNTIME);
      const expectedBasePath = String(comfySetupExpectedBasePath
        || (launch.kind === 'desktop' ? launch.basePath : '') || '').trim();
      const discovery = await discoverLocalComfy({ timeoutMs: 1000, expectedBasePath });
      const requested = String(body.url || '').trim();
      let selected = discovery.url;
      if (requested) {
        const matched = discovery.matches.find((entry) => entry.url === requested);
        if (!matched || !(await probeComfyUrl(requested, { timeoutMs: 1000 }))) {
          return json(res, 400, { error: 'That address is not a running ComfyUI server.' });
        }
        selected = matched.url;
      }
      if (selected) {
        adoptComfyEndpoint(selected);
        comfySetupExpectedBasePath = '';
        updateComfySetupState({ state: 'complete', phase: 'connected', message: `ComfyUI is connected at ${selected}.`, error: null });
        updateComfyStartState({ state: 'complete', phase: 'connected', message: `Connected to ComfyUI at ${selected}.`, error: null, matches: [] });
      }
      const publicDiscovery = {
        url: selected || '',
        ambiguous: !selected && discovery.ambiguous,
        checked: discovery.checked,
        matches: discovery.matches.map((entry) => ({
          url: entry.url,
          source: entry.source,
          installationName: entry.installationName || '',
        })),
      };
      return json(res, 200, {
        ok: !!selected,
        discovery: publicDiscovery,
        status: await setupStatusPayload(),
      });
    } catch (error) {
      return json(res, 500, { error: String(error.message || error) });
    }
  }
  if (route === '/api/setup/browse' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can choose generation folders' });
    if (dependencyInstallRunning || comfySetupProcess || comfyRestartRunning) return json(res, 409, { error: 'Wait for the current desktop operation to finish.' });
    try {
      const body = await readJsonBody(req);
      const kind = body.kind === 'models' ? 'models' : 'comfy';
      const directory = await browseGenerationFolder(kind);
      return json(res, 200, { ok: true, directory, cancelled: !directory });
    } catch (error) {
      return json(res, 400, { error: String(error.message || error) });
    }
  }
  if (route === '/api/setup/comfy/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install ComfyUI' });
    if (process.platform !== 'win32') return json(res, 400, { error: 'Automatic ComfyUI Desktop installation is available on Windows.' });
    if (comfySetupProcess) return json(res, 409, { error: 'ComfyUI setup is already running.' });
    if (dependencyInstallRunning || comfyRestartRunning) return json(res, 409, { error: 'Wait for the current desktop operation to finish.' });
    try {
      await assertDesktopIsIdle();
      startOfficialComfySetup();
      return json(res, 202, { ok: true, install: comfySetupState });
    } catch (error) {
      return json(res, 500, { error: String(error.message || error) });
    }
  }
  if (route === '/api/setup/comfy/cancel' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can stop ComfyUI setup' });
    if (!comfySetupProcess) return json(res, 409, { error: 'No ComfyUI setup is running.' });
    stopOfficialComfySetup();
    return json(res, 202, { ok: true, install: comfySetupState });
  }
  if (route === '/api/hardware' && req.method === 'GET') {
    try {
      const force = url.searchParams.get('refresh') === '1';
      const hardware = await getSetupHardwareInfo(force);
      const installStatus = sam3InstallStatus(RUNTIME);
      const sageRuntime = await probeSageAttention(RUNTIME, { status: installStatus, force });
      let sageNodeReady = false;
      try {
        const info = await getObjectInfo(force);
        sageNodeReady = !!info.PathchSageAttentionKJ;
      } catch { /* Python runtime details remain useful while ComfyUI is offline. */ }
      const performanceRuntime = Object.assign({}, sageRuntime, {
        ready: sageRuntime.ready === true && sageNodeReady,
        reason: sageRuntime.ready === true && !sageNodeReady
          ? 'ComfyUI-KJNodes is needed for the H3 SageAttention graph patch.'
          : sageRuntime.reason,
      });
      return json(res, 200, Object.assign({}, hardware, {
        performance: h3PerformanceReport({ hardware, runtime: performanceRuntime, models: settings }),
      }));
    } catch (error) {
      return json(res, 500, { error: String(error.message || error) });
    }
  }
  if (route === '/api/export-location' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can change the default save folder' });
    const body = await readJsonBody(req);
    try {
      const directory = String(body.directory || '').trim()
        ? await validateExportDirectory(body.directory)
        : '';
      settings.exportDir = directory;
      saveJsonSync(SETTINGS_FILE, settings);
      return json(res, 200, { ok: true, directory, configured: Boolean(directory) });
    } catch (error) {
      return json(res, 400, { error: String(error.message || error) });
    }
  }
  if (route === '/api/settings' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (typeof body.externalLlmOllamaUrl === 'string' && body.externalLlmOllamaUrl.trim()) {
      try { body.externalLlmOllamaUrl = normalizeOllamaUrl(body.externalLlmOllamaUrl); }
      catch (error) { return json(res, 400, { error: String(error.message || error) }); }
    }
    const changesExternalLlm = body.clearExternalLlmOpenAiApiKey === true
      || body.clearExternalLlmGeminiApiKey === true
      || ['externalLlmOpenAiApiKey', 'externalLlmGeminiApiKey'].some((key) => typeof body[key] === 'string' && body[key].trim())
      || ['externalLlmProvider', 'externalLlmLocalProvider', 'externalLlmExternalProvider', 'externalLlmOpenAiModel', 'externalLlmGeminiModel', 'externalLlmOllamaUrl', 'externalLlmOllamaModel']
        .some((key) => typeof body[key] === 'string' && body[key].trim() && body[key].trim() !== String(settings[key] || ''))
      || ['externalLlmImageRevise', 'externalLlmImageEnhance', 'externalLlmVideoRevise', 'externalLlmVideoEnhance']
        .some((key) => typeof body[key] === 'boolean' && body[key] !== settings[key]);
    const changesLocalPromptAi = ['localPromptAiClip', 'localPromptAiClipType', 'smartPlannerClip', 'smartPlannerClipType']
      .some((key) => typeof body[key] === 'string' && body[key].trim() !== String(settings[key] || ''))
      || (typeof body.smartPlannerModelOverride === 'boolean'
        && body.smartPlannerModelOverride !== settings.smartPlannerModelOverride);
    const changesH3ModelVariant = [
      'h3FrameModelVariant', 'h3ReferenceModelVariant', 'h3Unet', 'h3RefUnet',
      'h3Bf16Unet', 'h3Bf16RefUnet', 'h3DynTimeRefUnet', 'h3DynTimeRefHqUnet',
      'h3TurboLora', 'h3RefTurboLora', 'h3Clip', 'h3VideoVae', 'h3AudioVae',
    ]
      .some((key) => typeof body[key] === 'string' && body[key].trim() !== String(settings[key] || ''));
    const changesHfToken = body.clearHfToken === true
      || (typeof body.hfToken === 'string' && body.hfToken.trim());
    if (changesHfToken && !isAdmin()) {
      return json(res, 403, { error: 'Only the owner profile can change the shared Hugging Face token' });
    }
    if ((changesExternalLlm || changesLocalPromptAi || changesH3ModelVariant) && !isAdmin()) {
      return json(res, 403, { error: 'Only the owner profile can change the shared prompt AI settings or shared H3 model settings' });
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key === 'exportDir') continue;
      if (typeof body[key] === 'string' && body[key].trim()) settings[key] = body[key].trim();
    }
    if (typeof body.krea2ModelVariant === 'string') {
      settings.krea2ModelVariant = body.krea2ModelVariant;
    }
    if (typeof body.hfEndpoint === 'string') settings.hfEndpoint = body.hfEndpoint.trim();
    if (typeof body.localPromptAiClip === 'string') settings.localPromptAiClip = body.localPromptAiClip.trim();
    if (typeof body.localPromptAiClipType === 'string' && body.localPromptAiClipType.trim()) {
      settings.localPromptAiClipType = body.localPromptAiClipType.trim();
    }
    if (typeof body.smartPlannerModelOverride === 'boolean') {
      settings.smartPlannerModelOverride = body.smartPlannerModelOverride;
    }
    if (typeof body.smartPlannerClip === 'string') settings.smartPlannerClip = body.smartPlannerClip.trim();
    if (typeof body.smartPlannerClipType === 'string' && body.smartPlannerClipType.trim()) {
      settings.smartPlannerClipType = body.smartPlannerClipType.trim();
    }
    if (typeof body.smartFilenames === 'boolean') settings.smartFilenames = body.smartFilenames;
    if (body.clearHfToken === true) settings.hfToken = '';
    if (body.clearExternalLlmOpenAiApiKey === true) settings.externalLlmOpenAiApiKey = '';
    if (body.clearExternalLlmGeminiApiKey === true) settings.externalLlmGeminiApiKey = '';
    for (const key of ['externalLlmImageRevise', 'externalLlmImageEnhance', 'externalLlmVideoRevise', 'externalLlmVideoEnhance']) {
      if (typeof body[key] === 'boolean') settings[key] = body[key];
    }
    if (body.features && typeof body.features === 'object') settings.features = normalizeFeatures(body.features);
    settings = normalizeSettings(settings);
    const hardwareProfile = setupHardwareProfile(await getSetupHardwareInfo().catch(() => ({})));
    settings.seedvr2Attention = seedVr2AttentionForVendor(settings.seedvr2Attention, hardwareProfile.gpuVendor);
    saveJsonSync(SETTINGS_FILE, settings);
    objectInfoCache = null;
    loraInfoCache = { key: '', at: 0, value: {} };
    return json(res, 200, settingsResponse());
  }

  if (route === '/api/meta') {
    const app = Object.assign(readAppRelease(ROOT), { instanceId: SERVER_INSTANCE_ID });
    try {
      const info = await getObjectInfo(url.searchParams.has('refresh'));
      const loras = (info.LoraLoader?.input?.required?.lora_name?.[0]) || [];
      const lorasInfo = await loraMetadataMap(loras, url.searchParams.has('refresh'));
      const missing = {};
      for (const [group, classes] of Object.entries(REQUIRED_CLASSES)) {
        missing[group] = classes.filter((c) => !info[c]);
      }
      const hardwareInfoValue = await getSetupHardwareInfo(url.searchParams.has('refresh'));
      const hardwareProfile = setupHardwareProfile(hardwareInfoValue);
      adoptDeviceCompatibleModelSettings(hardwareProfile);
      const hardwareGuidance = componentHardwareGuidance(SETUP_FEATURE_MANIFEST, hardwareInfoValue);
      const models = configuredModelsStatus(info);
      const installStatus = sam3InstallStatus(RUNTIME);
      const compatibility = await getComfyCompatibility(url.searchParams.has('refresh'));
      const krea2Core = krea2ClipCompatibility(info, compatibility.version);
      const h3Core = minimaxH3Compatibility(info, compatibility.version);
      const ltx25Core = ltx25Compatibility(info, compatibility.version);
      const wanAnimate2Core = wanAnimate2CoreCompatibility(info, compatibility.version);
      if (h3Core.nativeAudioSampling) {
        // Current ComfyUI supplies the audio-safe AV schedule, so the legacy
        // custom sampler is bypassed. LightX2V's generic ComfyUI adapter uses
        // the stock model-only loader; Larry's adapters retain their loader.
        missing.h3turbo = [
          h3TurboUsesStandardLoader(settings, 'frames') ? 'LoraLoaderModelOnly' : 'MiniMaxH3TurboLoRA',
          'MiniMaxH3SigmaShift',
        ].filter((className) => !info[className]);
        missing.h3turbor2v = ['LoraLoaderModelOnly', 'MiniMaxH3SigmaShift']
          .filter((className) => !info[className]);
      }
      const sageRuntime = await probeSageAttention(RUNTIME, {
        status: installStatus,
        force: url.searchParams.has('refresh'),
      });
      const sageAttention = Object.assign({}, sageRuntime, {
        packageReady: sageRuntime.ready === true,
        nodeReady: !missing.h3sage.length,
        ready: sageRuntime.ready === true && !missing.h3sage.length,
      });
      if (sageRuntime.ready === true && !sageAttention.nodeReady) {
        sageAttention.reason = 'ComfyUI-KJNodes is needed for the H3 SageAttention graph patch.';
      }
      const nodeRevisions = await pinnedNodeRevisionStatus(installStatus, url.searchParams.has('refresh'));
      const missingComponents = missingDependencyComponentIds(missing, models, {
        sageAttention,
        repairComponents: nodeRevisions.components,
      });
      const readinessDiagnostics = dependencyReadinessDiagnostics(missingComponents, missing, models, {
        sageAttention,
        repairComponents: nodeRevisions.components,
      }, installStatus);
      if (url.searchParams.has('afterRestart') && dependencyInstallState.restartRequired) {
        const checkedComponents = Array.isArray(dependencyInstallState.components)
          ? dependencyInstallState.components.filter(Boolean)
          : [];
        const checkedMissingComponents = checkedComponents.length
          ? checkedComponents.filter((component) => missingComponents.includes(component))
          : missingComponents;
        const checkedMissingLabels = checkedMissingComponents.map((component) => (
          DEPENDENCY_COMPONENTS[component]?.label || component
        ));
        const checkedDiagnostics = readinessDiagnostics.filter((entry) => checkedMissingComponents.includes(entry.id));
        updateDependencyInstallState({
          state: 'complete',
          phase: 'checked',
          message: checkedMissingComponents.length
            ? `ComfyUI was checked after restart. Still needed: ${checkedMissingLabels.join(', ')}.`
            : 'ComfyUI was checked after restart. Installed dependencies are ready.',
          checkedComponents,
          checkedMissingComponents,
          readinessDiagnostics: checkedDiagnostics,
          restartRequired: false,
          error: null,
          ...EMPTY_DEPENDENCY_FAILURE,
        });
      }
      return json(res, 200, {
        ok: true,
        app,
        loras,
        lorasInfo,
        loraThumbs: db.loraThumbs,
        missing,
        dependencies: {
          canInstall: installStatus.canInstall,
          reason: installStatus.reason,
          restart: Object.assign(restartStatus(RUNTIME), { running: comfyRestartRunning }),
          components: availableComponents().map((id) => setupDependencyComponentInfo(
            id,
            hardwareGuidance[id] || null,
            krea2Core,
            h3Core,
            ltx25Core,
            wanAnimate2Core,
            sageAttention,
          )),
          missingComponents,
          diagnostics: {
            components: readinessDiagnostics,
            comfyPath: isAdmin() ? (RUNTIME.comfy.path || installStatus.basePath || '') : '',
            customNodesPath: isAdmin() ? (installStatus.customNodesPath || '') : '',
            modelsPath: isAdmin() ? (RUNTIME.comfy.modelsPath || '') : '',
            comfyUrl: isAdmin() ? (settings.comfyUrl || '') : '',
          },
          repairComponents: nodeRevisions.components,
          outdatedNodes: nodeRevisions.nodes,
          install: dependencyInstallState,
          sam3: { canInstall: installStatus.canInstall, downloaded: installStatus.downloaded, reason: installStatus.reason },
          sageAttention,
        },
        models,
        krea2: {
          modelVariant: settings.krea2ModelVariant,
          nativeInt8: compatibility,
          rawUnet: settings.krea2RawUnet,
          turboLora: settings.krea2TurboLora,
          depthLora: settings.krea2DepthLora,
          depthModel: settings.depthAnythingV3Model,
          outpaintLora: settings.krea2OutpaintLora,
        },
        minimaxH3: Object.assign({}, h3Core, {
          frameVariant: h3FrameVariant(settings),
          referenceVariant: h3ReferenceVariant(settings),
          lora: {
            frames: h3LoraCompatibility(settings, 'frames'),
            reference: h3LoraCompatibility(settings, 'reference'),
          },
          turbo: {
            frames: h3TurboCompatibility(settings, 'frames'),
            reference: h3TurboCompatibility(settings, 'reference'),
          },
        }),
        ltx25: ltx25Core,
        wanAnimate2: wanAnimate2Core,
        features: settings.features,
        capabilities: { video: configuredVideoEngineCapabilities(hardwareProfile, settings) },
        queue: jobs.size + externalPromptPreflights.size,
      });
    } catch (e) {
      return json(res, 200, {
        ok: false,
        app,
        error: String(e.message || e),
        loras: [],
        lorasInfo: {},
        missing: null,
        models: null,
        features: settings.features,
        queue: jobs.size + externalPromptPreflights.size,
      });
    }
  }

  // Serve a file back out of ComfyUI's input dir (reuse previews: audio,
  // end frames, motion videos). Client fetches to a blob, so no Range needed.
  if (route === '/api/input' && req.method === 'GET') {
    const name = String(url.searchParams.get('name') || '');
    if (!name) return json(res, 400, { error: 'name required' });
    const catalogedAsset = db.uploadedAssets.find((asset) => asset.name === name);
    if (catalogedAsset && catalogedAsset.profileId !== req.profile.id) {
      return json(res, 404, { error: 'Uploaded asset not found' });
    }
    if (catalogedAsset && catalogedAsset.deletedAt) {
      return json(res, 404, { error: 'This uploaded asset was deleted' });
    }
    const local = inputAssetPath(INPUTS, name);
    try {
      await fsp.access(local);
      return serveFile(res, local, req.headers.range);
    } catch { /* older inputs fall back to ComfyUI */ }
    const parts = name.split('/');
    const fn = parts.pop();
    const sub = parts.join('/');
    try {
      const r = await comfyFetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`);
      if (!r.ok) return json(res, 404, { error: 'File no longer in the ComfyUI input folder' });
      const buf = Buffer.from(await r.arrayBuffer());
      const extra = {
        '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
        '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.aac': 'audio/aac',
      };
      const ext = path.extname(fn).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || extra[ext] || 'application/octet-stream',
        'Content-Length': buf.length,
        'Cache-Control': 'no-cache',
      });
      res.end(buf);
    } catch (e) {
      return json(res, 502, { error: String(e.message || e) });
    }
    return;
  }

  if (route === '/api/upload' && req.method === 'POST') {
    const decodedFilename = decodeURIComponent(req.headers['x-filename'] || 'ref.png');
    const uploadLabel = decodedFilename.split(/[\\/]+/).pop().replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 240) || 'Uploaded asset';
    const orig = uploadLabel.replace(/[^\w.\-]+/g, '_');
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_INPUT_BYTES) {
      req.resume();
      return json(res, 413, { error: 'This file is larger than the 2 GB input limit.' });
    }
    const name = `ks_${Date.now()}_${crypto.randomBytes(4).toString('hex')}_${orig}`;
    const temporary = path.join(INPUTS, `.upload-${crypto.randomBytes(10).toString('hex')}.tmp`);
    try {
      await receiveInputFile(req, temporary, MAX_INPUT_BYTES);
      const [comfyName, hasAudio] = await Promise.all([
        uploadFileToComfy(temporary, name),
        detectAudioStreamFile(temporary, orig),
      ]);
      const durable = inputAssetPath(INPUTS, comfyName);
      await fsp.unlink(durable).catch(() => {});
      await fsp.rename(temporary, durable);
      let asset = null;
      if (req.headers['x-asset-catalog'] === '1') {
        const stat = await fsp.stat(durable);
        asset = {
          id: uid(),
          profileId: req.profile.id,
          name: comfyName,
          label: uploadLabel,
          kind: uploadedAssetKind(orig, req.headers['content-type']),
          size: stat.size,
          hasAudio: hasAudio === true,
          createdAt: Date.now(),
        };
        db.uploadedAssets.push(asset);
        saveDb();
      }
      return json(res, 200, {
        name: comfyName,
        hasAudio: hasAudio === true,
        durable: true,
        asset: asset ? publicUploadedAsset(asset) : null,
      });
    } catch (error) {
      await fsp.unlink(temporary).catch(() => {});
      if (error && error.code === 'INPUT_TOO_LARGE') {
        return json(res, 413, { error: 'This file is larger than the 2 GB input limit.' });
      }
      throw error;
    }
  }

  if (route === '/api/dependencies/status' && req.method === 'GET') {
    return json(res, 200, dependencyInstallState);
  }

  if (route === '/api/dependencies/cancel' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can cancel desktop dependency installs' });
    if (!dependencyInstallRunning || !dependencyInstallController) {
      return json(res, 409, { error: 'No dependency installation is running.' });
    }
    if (!dependencyInstallController.signal.aborted) {
      updateDependencyInstallState({ state: 'cancelling', phase: 'cancelling', message: 'Stopping the dependency installer safely…', error: null, ...EMPTY_DEPENDENCY_FAILURE });
      dependencyInstallController.abort();
    }
    return json(res, 202, { ok: true, install: dependencyInstallState });
  }

  if (route === '/api/comfy/start' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can start ComfyUI' });
    if (dependencyInstallRunning || comfyRestartRunning || comfyStartRunning || comfySetupProcess) {
      return json(res, 409, { error: 'Wait for the current desktop operation to finish.' });
    }
    try {
      await assertDesktopIsIdle();
      const launch = startStatus(RUNTIME);
      const expectedBasePath = String(comfySetupExpectedBasePath
        || (launch.kind === 'desktop' ? launch.basePath : '') || '').trim();
      const alreadyRunning = await discoverLocalComfy({ timeoutMs: 900, expectedBasePath });
      if (alreadyRunning.url) {
        adoptComfyEndpoint(alreadyRunning.url);
        comfySetupExpectedBasePath = '';
        updateComfyStartState({
          state: 'complete', phase: 'connected', message: 'ComfyUI was already running. Mix Studio connected automatically.',
          error: null, matches: [],
        });
        return json(res, 200, { ok: true, alreadyRunning: true, status: await setupStatusPayload() });
      }
      if (alreadyRunning.ambiguous && !expectedBasePath) {
        const matches = alreadyRunning.matches.map((entry) => ({ url: entry.url, installationName: entry.installationName || '' }));
        updateComfyStartState({
          state: 'choice', phase: 'choose', message: 'More than one running ComfyUI was found. Choose the one Mix Studio should use.',
          error: null, matches,
        });
        return json(res, 200, { ok: false, needsChoice: true, matches, status: await setupStatusPayload() });
      }
      if (!launch.canStart) return json(res, 409, { error: launch.reason || 'ComfyUI start is not configured for this machine.' });
      comfyStartRunning = true;
      updateComfyStartState({
        state: 'running',
        phase: 'opening',
        message: launch.kind === 'desktop'
          ? `Comfy Desktop is opening.${launch.installationName ? ` Choose ${launch.installationName} and press Play if it does not start automatically.` : ' Press Play on the installed ComfyUI if it does not start automatically.'}`
          : 'Starting portable ComfyUI and finding its local port…',
        error: null,
        matches: [],
      });
      await startComfy(RUNTIME, (phase, message) => updateComfyStartState({ state: 'running', phase, message, error: null }));
      if (launch.kind === 'desktop') {
        updateComfyStartState({
          state: 'running', phase: 'desktop',
          message: `Comfy Desktop is open.${launch.installationName ? ` Choose ${launch.installationName} and press Play.` : ' Press Play on the ComfyUI installation.'} Mix Studio will connect automatically.`,
        });
      }
      (async () => {
        try {
          const discovery = await waitForStartedComfy(5 * 60_000, expectedBasePath);
          if (discovery.url) {
            adoptComfyEndpoint(discovery.url);
            comfySetupExpectedBasePath = '';
            updateComfyStartState({
              state: 'complete', phase: 'connected', message: `Connected to ComfyUI at ${discovery.url}.`, error: null, matches: [],
            });
          } else if (discovery.ambiguous) {
            updateComfyStartState({
              state: 'choice', phase: 'choose', message: 'More than one running ComfyUI was found. Choose which one to use.',
              error: null,
              matches: discovery.matches.map((entry) => ({ url: entry.url, installationName: entry.installationName || '' })),
            });
          } else {
            updateComfyStartState({
              state: 'error', phase: 'timeout',
              message: 'ComfyUI has not started yet. Open Comfy Desktop, press Play, then choose Find running ComfyUI.',
              error: 'ComfyUI startup timed out.', matches: [],
            });
          }
        } catch (error) {
          updateComfyStartState({
            state: 'error', phase: 'error', message: 'Mix Studio could not finish starting ComfyUI.',
            error: String(error.message || error), matches: [],
          });
        } finally {
          comfyStartRunning = false;
        }
      })();
      return json(res, 202, { ok: true, start: Object.assign({}, launch, comfyStartState, { running: true }) });
    } catch (error) {
      comfyStartRunning = false;
      updateComfyStartState({ state: 'error', phase: 'error', message: 'Mix Studio could not start ComfyUI.', error: String(error.message || error), matches: [] });
      return json(res, 500, { error: String(error.message || error) });
    }
  }

  if (route === '/api/comfy/restart' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can restart ComfyUI' });
    if (dependencyInstallRunning || comfyRestartRunning) return json(res, 409, { error: 'Wait for the current desktop operation to finish.' });
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    const restart = restartStatus(RUNTIME);
    if (!restart.canRestart) return json(res, 409, { error: restart.reason || 'ComfyUI restart is not configured for this machine.' });
    comfyRestartRunning = true;
    updateDependencyInstallState({ state: 'restarting', phase: 'stopping', message: 'Stopping ComfyUI…', error: null, ...EMPTY_DEPENDENCY_FAILURE });
    (async () => {
      try {
        await restartComfy(RUNTIME, (phase, message) => updateDependencyInstallState({ state: 'restarting', phase, message, error: null }));
        const reconnected = await waitForComfyReconnect();
        objectInfoCache = null;
        comfyCompatibilitySnapshot = null;
        comfyCompatibilityAt = 0;
        updateDependencyInstallState(reconnected
          ? { state: 'complete', phase: 'reconnected', message: 'ComfyUI is back online. Checking installed models and nodes…', restartRequired: false, error: null, ...EMPTY_DEPENDENCY_FAILURE }
          : { state: 'error', phase: 'timeout', message: 'ComfyUI did not reconnect yet. Check the desktop app, then press Check again.', error: 'Reconnect timed out.', ...EMPTY_DEPENDENCY_FAILURE });
      } catch (error) {
        updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Could not restart ComfyUI.', error: String(error.message || error), ...EMPTY_DEPENDENCY_FAILURE });
      } finally {
        comfyRestartRunning = false;
      }
    })();
    return json(res, 202, { ok: true, restart: true, install: dependencyInstallState });
  }

  if (route === '/api/dependencies/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install desktop dependencies' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'A dependency installation is already running' });
    const body = await readJsonBody(req);
    const requested = Array.isArray(body.components) ? body.components.map((value) => String(value)) : [];
    const repair = body.repair === true;
    const requestedKrea2Variant = body.modelVariants && typeof body.modelVariants === 'object'
      ? body.modelVariants.krea2
      : '';
    const krea2Variant = effectiveKrea2Variant(requestedKrea2Variant, settings);
    const modelVariants = { krea2: krea2Variant };
    const components = [...new Set(requested.filter((id) => Object.prototype.hasOwnProperty.call(DEPENDENCY_COMPONENTS, id)))];
    if (!components.length) return json(res, 400, { error: 'Choose at least one missing model or node group to install.' });
    const hardwareProfile = setupHardwareProfile(await getSetupHardwareInfo());
    adoptDeviceCompatibleModelSettings(hardwareProfile);
    const hardwareBlocked = components
      .map((id) => ({ id, reason: dependencyComponentBlock(id, hardwareProfile) }))
      .find((entry) => entry.reason);
    if (hardwareBlocked) {
      return json(res, 409, {
        error: hardwareBlocked.reason,
        code: 'generation_device_unsupported',
        component: hardwareBlocked.id,
      });
    }
    const installsKrea2 = components.some((id) => KREA2_DEPENDENCY_COMPONENTS.has(id));
    const installsH3 = components.some((id) => H3_DEPENDENCY_COMPONENTS.has(id));
    if (installsH3) {
      try {
        const info = await getObjectInfo(true);
        const coreCompatibility = await getComfyCompatibility(true);
        const h3Compatibility = minimaxH3Compatibility(info, coreCompatibility.version);
        if (h3Compatibility.supported !== true) {
          return json(res, 409, {
            error: minimaxH3CompatibilityError(h3Compatibility),
            code: 'comfy_h3_update_required',
            compatibility: h3Compatibility,
          });
        }
      } catch (error) {
        // A stopped source install can be checked by its version file before
        // model downloads begin; connected installs are checked by nodes too.
        const coreCompatibility = await getComfyCompatibility(true);
        const h3Compatibility = minimaxH3Compatibility(null, coreCompatibility.version);
        if (h3Compatibility.supported !== true) {
          return json(res, 409, {
            error: minimaxH3CompatibilityError(h3Compatibility),
            code: 'comfy_h3_update_required',
            compatibility: h3Compatibility,
          });
        }
      }
    }
    if (installsKrea2) {
      try {
        const info = await getObjectInfo(true);
        const coreCompatibility = await getComfyCompatibility(true);
        const krea2Compatibility = krea2ClipCompatibility(info, coreCompatibility.version);
        if (krea2Compatibility.supported !== true) {
          return json(res, 409, {
            error: krea2ClipCompatibilityError(krea2Compatibility),
            code: 'comfy_krea2_update_required',
            compatibility: krea2Compatibility,
          });
        }
      } catch (error) {
        if (error?.code === 'comfy_krea2_update_required') throw error;
        // A stopped ComfyUI can still receive dependency files on disk. The
        // capability is checked again after it restarts.
      }
    }
    if (installsKrea2 && krea2Variant === 'int8-convrot') {
      const compatibility = await getComfyCompatibility(true);
      if (compatibility.supported !== true) {
        return json(res, 409, {
          error: nativeInt8CompatibilityError(compatibility),
          code: 'comfy_int8_update_required',
          compatibility,
        });
      }
    }
    try {
      await assertDesktopIsIdle();
    } catch (error) {
      return json(res, 409, { error: String(error.message || error) });
    }
    let availableModelNames = [];
    try {
      availableModelNames = [...registeredModelNames(
        await getObjectInfo(true),
      )];
    } catch { /* ComfyUI may be stopped during installation. */ }
    let availableModelRoots = [RUNTIME.comfy.modelsPath].filter(Boolean);
    try {
      const discovery = await discoverModels({
        comfyUrl: '',
        comfyPath: RUNTIME.comfy.path,
        modelsPath: RUNTIME.comfy.modelsPath,
      });
      availableModelRoots = [...new Set([...availableModelRoots, ...discovery.modelRoots])];
    } catch { /* The primary configured model root remains available. */ }
    const installController = new AbortController();
    dependencyInstallController = installController;
    dependencyInstallRunning = true;
    updateDependencyInstallState({
      state: 'running', phase: 'queued', message: 'Starting dependency installation…',
      components, repair, completed: 0, total: 0, restartRequired: false,
      changed: 0, changedItems: [], checkedComponents: [], checkedMissingComponents: [], readinessDiagnostics: [], error: null,
      ...EMPTY_DEPENDENCY_FAILURE,
    });
    (async () => {
      try {
        const result = await installComponents({
          runtime: RUNTIME,
          settings,
          components,
          options: {
            repair,
            signal: installController.signal,
            availableModelNames,
            availableModelRoots,
            modelVariants,
            gpuVendor: hardwareProfile.gpuVendor,
            platform: process.platform,
            hfToken: settings.hfToken,
            hfEndpoint: settings.hfEndpoint,
          },
          report: (phase, message, detail) => {
            if (!installController.signal.aborted) updateDependencyInstallState(Object.assign({ state: 'running', phase, message }, detail || {}));
          },
        });
        if (result.settingUpdates && Object.keys(result.settingUpdates).length) {
          Object.assign(settings, result.settingUpdates);
          settings = normalizeSettings(settings);
          saveJsonSync(SETTINGS_FILE, settings);
        }
        objectInfoCache = null;
        invalidatePinnedNodeRevisionCache();
        if (result.failures?.length) {
          const firstFailure = result.failures[0];
          updateDependencyInstallState({
            ...EMPTY_DEPENDENCY_FAILURE,
            state: 'error',
            phase: 'partial-complete',
            message: `Installed compatible dependencies; ${result.failures.length} node pack${result.failures.length === 1 ? '' : 's'} need attention.`,
            restartRequired: result.restartRequired,
            changed: result.changed,
            changedItems: result.changedItems,
            environmentSnapshot: result.environmentSnapshot || null,
            error: result.failures.map((failure) => failure.message).join('\n'),
            errorCode: firstFailure.code,
            failedNode: firstFailure.failedNode || null,
            nodePath: firstFailure.nodePath || null,
            actualRepo: firstFailure.actualRepo || null,
            expectedRepo: firstFailure.expectedRepo || null,
            nodeFailures: result.failures,
          });
        } else {
          updateDependencyInstallState({
            state: 'complete',
            phase: result.restartRequired ? 'complete' : 'already-present',
            message: result.restartRequired
              ? (repair ? 'Repair finished. Restart ComfyUI, then Check again.' : 'Dependencies installed. Restart ComfyUI to load new nodes, then Check again.')
              : 'Selected files are already installed. Mix Studio is checking what the connected ComfyUI has loaded.',
            restartRequired: result.restartRequired,
            changed: result.changed,
            changedItems: result.changedItems,
            environmentSnapshot: result.environmentSnapshot || null,
            error: null,
            ...EMPTY_DEPENDENCY_FAILURE,
          });
        }
      } catch (error) {
        if (installController.signal.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') {
          updateDependencyInstallState({ state: 'cancelled', phase: 'cancelled', message: 'Dependency installation cancelled. Finished files were kept; partial downloads were removed.', error: null, ...EMPTY_DEPENDENCY_FAILURE });
        } else {
          updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Dependency installation stopped.', error: String(error.message || error), ...dependencyFailureState(error) });
        }
      } finally {
        dependencyInstallRunning = false;
        if (dependencyInstallController === installController) dependencyInstallController = null;
      }
    })();
    return json(res, 202, { ok: true, install: dependencyInstallState });
  }

  if (route === '/api/dependencies/sam3/install' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can install desktop dependencies' });
    if (dependencyInstallRunning) return json(res, 409, { error: 'A dependency installation is already running' });
    try {
      await assertDesktopIsIdle();
    } catch (error) { return json(res, 409, { error: String(error.message || error) }); }
    const installController = new AbortController();
    dependencyInstallController = installController;
    dependencyInstallRunning = true;
    updateDependencyInstallState({ state: 'running', phase: 'queued', message: 'Starting the safe Smart Mask installation…', components: ['smartmask'], repair: false, completed: 0, total: 0, restartRequired: false, error: null, ...EMPTY_DEPENDENCY_FAILURE });
    (async () => {
      try {
        const result = await installComponents({
          runtime: RUNTIME, settings, components: ['smartmask'],
          options: {
            signal: installController.signal,
            hfToken: settings.hfToken,
            hfEndpoint: settings.hfEndpoint,
          },
          report: (phase, message, detail) => {
            if (!installController.signal.aborted) updateDependencyInstallState(Object.assign({ state: 'running', phase, message }, detail || {}));
          },
        });
        objectInfoCache = null;
        updateDependencyInstallState({ state: 'complete', phase: 'complete', message: 'Smart Mask tools installed safely. Restart ComfyUI, then Check again.', restartRequired: result.restartRequired, environmentSnapshot: result.environmentSnapshot || null, error: null, ...EMPTY_DEPENDENCY_FAILURE });
      } catch (error) {
        if (installController.signal.aborted || error?.code === 'dependency_cancelled' || error?.name === 'AbortError') {
          updateDependencyInstallState({ state: 'cancelled', phase: 'cancelled', message: 'Smart Mask installation cancelled safely.', error: null, ...EMPTY_DEPENDENCY_FAILURE });
        } else {
          updateDependencyInstallState({ state: 'error', phase: 'error', message: 'Smart Mask installation stopped.', error: String(error.message || error), ...dependencyFailureState(error) });
        }
      } finally {
        dependencyInstallRunning = false;
        if (dependencyInstallController === installController) dependencyInstallController = null;
      }
    })();
    return json(res, 202, { ok: true, install: dependencyInstallState });
  }

  if (route === '/api/edit-mask/sam3' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const imageName = String(body.imageName || '').trim();
    const prompt = String(body.prompt || '').trim().slice(0, 240);
    const points = Array.isArray(body.points) ? body.points.slice(0, 10) : [];
    if (!imageName) return json(res, 400, { error: 'Add a source image before using smart select' });
    if (!prompt && !points.length) return json(res, 400, { error: 'Describe an object or tap the image' });
    const info = await getObjectInfo();
    const needed = prompt
      ? ['LoadSAM3Model', 'SAM3Grounding', 'MaskToImage', 'SaveImage']
      : ['LoadSAM3Model', 'SAM3CreatePoint', 'SAM3CombinePoints', 'SAM3Segmentation', 'MaskToImage', 'SaveImage'];
    const missing = needed.filter((name) => !info[name]);
    if (missing.length) {
      return json(res, 501, {
        error: 'Smart Select needs the ComfyUI-SAM3 custom node pack. Brush and Box selection still work.',
        code: 'sam3_unavailable',
        missing,
      });
    }
    const graph = buildSam3MaskGraph({ imageName, prompt, points });
    await filterInputs(graph);
    const result = await new Promise((resolve, reject) => {
      (async () => {
        const pid = await queuePrompt(graph, { profileId: req.profile.id });
        const timer = setTimeout(() => {
          jobs.delete(pid);
          reject(new Error('SAM3 selection timed out after 8 minutes. Check the ComfyUI console for a model download or SAM3 error.'));
        }, 480000);
        trackJob(pid, {
          kind: 'smartMask',
          graph,
          profileId: req.profile.id,
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        ensureWs();
        broadcast('status', {
          jobId: pid,
          profileId: req.profile.id,
          kind: 'smartMask',
          text: 'Queued Smart Select…',
          itemId: null,
        });
      })().catch(reject);
    });
    return json(res, 200, result);
  }

  if (route === '/api/generate' && req.method === 'POST') {
    const p = await readJsonBody(req);
    p.prompt = String(p.prompt || '').trim();
    p.negativePrompt = normalizeNegativePrompt(p.negativePrompt);
    p.promptTemplate = (p.mode === 'edit' || p.mode === 't2i')
      ? String(p.promptTemplate || '').trim().slice(0, 8000) || undefined
      : undefined;
    p.promptPresets = (p.mode === 't2i' || p.mode === 'edit')
      ? normalizePromptPresets(p.promptPresets, [p.promptTemplate, p.prompt].filter(Boolean).join('\n'))
      : undefined;
    p.krea2RefBoost = p.mode === 'edit' ? clampNum(p.krea2RefBoost, 0, 20, 4) : undefined;
    p.editOutpaint = p.mode === 'edit' && p.editOutpaint === true;
    p.editOutpaintScale = p.editOutpaint ? clampInt(p.editOutpaintScale, 45, 100, 100) : undefined;
    p.editOutpaintFeather = p.editOutpaint ? clampInt(p.editOutpaintFeather, 0, 25, 12) : undefined;
    p.editOutpaintMaskOffset = p.editOutpaint ? clampInt(p.editOutpaintMaskOffset, -15, 15, 0) : undefined;
    const hasOutpaintOffsetX = p.editOutpaintOffsetX !== null && p.editOutpaintOffsetX !== undefined && p.editOutpaintOffsetX !== '';
    const hasOutpaintOffsetY = p.editOutpaintOffsetY !== null && p.editOutpaintOffsetY !== undefined && p.editOutpaintOffsetY !== '';
    const outpaintOffsetX = Number(p.editOutpaintOffsetX);
    const outpaintOffsetY = Number(p.editOutpaintOffsetY);
    p.editOutpaintOffsetX = p.editOutpaint && hasOutpaintOffsetX && Number.isFinite(outpaintOffsetX) ? clampNum(outpaintOffsetX, 0, 1, .5) : undefined;
    p.editOutpaintOffsetY = p.editOutpaint && hasOutpaintOffsetY && Number.isFinite(outpaintOffsetY) ? clampNum(outpaintOffsetY, 0, 1, .5) : undefined;
    if (!p.prompt && p.editOutpaint) {
      p.prompt = 'Extend the image naturally into the empty canvas, preserving the original image and continuing its scene, lighting, perspective, and details.';
    }
    p.qwenAngle = normalizeEditAngle(p.qwenAngle);
    p.angleGroupId = p.qwenAngle && /^[a-z0-9_-]{8,96}$/i.test(String(p.angleGroupId || ''))
      ? String(p.angleGroupId) : undefined;
    p.regions = Array.isArray(p.regions) ? p.regions : [];
    // Region descriptions can carry the whole composition — no general
    // prompt needed in that case (the builder supplies a neutral background).
    if (!p.prompt && !p.qwenAngle && !hasActiveRegions(p.regions)) return json(res, 400, { error: 'Prompt is empty' });
    p.width = clampInt(p.width, 64, 4096, 1024);
    p.height = clampInt(p.height, 64, 4096, 1024);
    p.batch = clampInt(p.batch, 1, 8, 1);
    const vramProfile = await activeVramProfile();
    let vramAdjustments = [];
    if (vramProfile === 'low') {
      const guarded = applyLowVramImageLimits(p);
      if (guarded.adjustments.length) {
        const lowVramChoice = ['safe', 'bypass'].includes(p.lowVramChoice) ? p.lowVramChoice : '';
        if (!lowVramChoice) {
          return json(res, 409, {
            error: 'Low VRAM mode recommends safer settings for this generation',
            code: 'low_vram_confirmation',
            adjustments: guarded.adjustments,
            requested: { width: p.width, height: p.height, batch: p.batch },
            guarded: {
              width: guarded.params.width,
              height: guarded.params.height,
              batch: guarded.params.batch,
            },
          });
        }
        if (lowVramChoice === 'safe') {
          Object.assign(p, guarded.params);
          vramAdjustments = guarded.adjustments;
        }
      }
    }
    delete p.lowVramChoice;
    if (p.editOutpaint) Object.assign(p, normalizeOutpaintDimensions(p.width, p.height));
    p.krea2Turbo = p.mode === 'edit' ? true : p.krea2Turbo !== false;
    p.steps = clampInt(p.steps, 1, 100, p.mode === 't2i' && p.krea2Turbo ? 8 : 12);
    p.cfg = clampNum(p.cfg, 0, 30, 1);
    p.krea2RawTurboLora = p.krea2Turbo || !p.krea2RawTurboLora || typeof p.krea2RawTurboLora !== 'object'
      ? undefined
      : {
          name: String(p.krea2RawTurboLora.name || settings.krea2TurboLora),
          strength: clampNum(p.krea2RawTurboLora.strength, 0, 2, 0.6),
          on: p.krea2RawTurboLora.on !== false,
        };
    p.imageName = p.mode === 'edit' ? '' : String(p.imageName || '').trim();
    p.imageGuideMode = p.imageName && ['depth', 'style'].includes(p.imageGuideMode) ? p.imageGuideMode : 'image';
    p.depthStrength = p.imageGuideMode === 'depth' ? clampNum(p.depthStrength, 0.05, 2, 1) : undefined;
    p.styleStrength = p.imageGuideMode === 'style' ? clampNum(p.styleStrength, 0, 2, 1) : undefined;
    p.denoise = p.imageGuideMode === 'depth' || p.imageGuideMode === 'style'
      ? 1
      : clampNum(p.denoise, 0.05, 1, p.mode === 'edit' ? 0.4 : (p.imageName ? 0.45 : 1));
    p.editAspectOverride = p.editAspectOverride === true;
    p.postUpscale = p.mode === 'edit' || p.mode === 't2i' ? normalizePostUpscale(p.postUpscale) : undefined;
    p.seed = Number.isFinite(Number(p.seed)) && Number(p.seed) >= 0
      ? Math.floor(Number(p.seed)) : Math.floor(Math.random() * 2 ** 48);
    p.loras = (Array.isArray(p.loras) ? p.loras : []).slice(0, 64)
      .filter((lora) => lora && lora.name)
      .map((lora) => ({
        name: String(lora.name).slice(0, 512),
        strength: clampNum(lora.strength, -100, 100, 1),
        on: lora.on !== false,
        strengthHunt: lora.strengthHunt === true,
      }));
    const requestedHuntLoras = huntLoras(p.loras);
    if (requestedHuntLoras.length > 2) {
      return json(res, 400, { error: 'Strength Hunt supports up to two enabled LoRAs at a time' });
    }
    p.regions = Array.isArray(p.regions) ? p.regions : [];
    p.maskImageName = String(p.maskImageName || '').trim();
    p.editMaskMode = ['smart', 'box', 'brush'].includes(p.editMaskMode) ? p.editMaskMode : 'brush';
    p.editMaskFeather = clampInt(p.editMaskFeather, 0, 64, 0);
    p.editMaskInvert = p.editMaskInvert === true;
    p.maskInfluence = maskInfluence(p.maskInfluence);
    p.maskExpand = maskExpand(p.maskExpand);
    if (p.mode === 'edit') {
      const editEngines = ['qwen', 'klein9', 'krea2', 'krea2ref', 'krea2remix'];
      p.editEngine = editEngines.includes(p.editEngine) ? p.editEngine : 'klein4';
    }
    const usesKrea2Model = p.mode !== 'edit' || ['krea2', 'krea2ref', 'krea2remix'].includes(p.editEngine);
    if (usesKrea2Model) {
      const info = await getObjectInfo();
      const coreCompatibility = await getComfyCompatibility();
      const krea2Compatibility = krea2ClipCompatibility(info, coreCompatibility.version);
      if (krea2Compatibility.supported !== true) {
        return json(res, 409, {
          error: krea2ClipCompatibilityError(krea2Compatibility),
          code: 'comfy_krea2_update_required',
          compatibility: krea2Compatibility,
        });
      }
    }

    let refined = null;
    if (p.mode !== 'edit') {
      if (p.prompt) {
        if (p.enhance) {
          const rawText = await enhancePrompt(p, req.profile.id);
          refined = cleanEnhancedText(rawText, p.prompt);
          p.enhancedText = refined;
        }
      }
      const regionInputs = p.regions.map((region) => ({
        description: String(region && (region.description || region.desc || region.prompt) || '').trim(),
        enhance: !region || region.enhance !== false,
        imageName: String(region && (region.refImageName || region.ref_image || region.refImage) || '').trim(),
      }));
      const regionCount = regionInputs.filter((region) => region.description && region.enhance).length;
      if (regionCount) {
        const globalContext = refined || p.prompt;
        const enhancedRegions = Array(regionInputs.length).fill('');
        let completed = 0;
        for (let index = 0; index < regionInputs.length; index += 1) {
          const region = regionInputs[index];
          if (!region.description || !region.enhance) continue;
          completed += 1;
          const seed = (Number(p.seed) + index + 1) % (2 ** 48);
          const rawText = await enhanceRegionPrompt(region.description, globalContext, seed, {
            imageName: region.imageName,
            profileId: req.profile.id,
            statusText: `Enhancing region prompt ${completed} of ${regionCount}...`,
          });
          enhancedRegions[index] = cleanEnhancedText(rawText, region.description);
        }
        p.regions = p.regions.map((region, index) => enhancedRegions[index]
          ? Object.assign({}, region, { refinedDescription: enhancedRegions[index] })
          : region);
      }
    }

    const refNames = p.mode === 'edit'
      ? (Array.isArray(p.refImages)
        ? p.refImages.filter(Boolean).slice(0, p.editEngine === 'krea2ref' ? 2 : 3)
        : [])
      : (p.imageName ? [p.imageName] : []);
    if (p.mode !== 'edit') p.editSequence = undefined;
    if (p.mode === 'edit') {
      if (settings.features[EDIT_FEATURES[p.editEngine]] === false) {
        return json(res, 400, { error: 'This edit model was not installed on this machine.' });
      }
      const sequenceRequested = !!p.editSequence;
      if (p.editOutpaint && sequenceRequested) {
        return json(res, 400, { error: 'Expand and sequential edits must be generated separately' });
      }
      if (p.editOutpaint && p.editEngine === 'krea2remix') {
        return json(res, 400, { error: 'Krea 2 Remix does not support Expand; use Krea 2 Edit for identity-aware expansion' });
      }
      if (sequenceRequested && !supportsSequentialEdit(p.editEngine)) {
        return json(res, 400, { error: 'Sequential edits are available with Klein 4B, Klein 9B, Qwen Edit, Krea 2 Edit, and Krea 2 Remix only' });
      }
      p.editSequence = normalizeEditSequence(p.editSequence, p.editEngine) || undefined;
      if (sequenceRequested && !p.editSequence) {
        return json(res, 400, { error: 'Sequential edits need at least two valid sentences' });
      }
      if (p.editSequence && p.qwenAngle) {
        return json(res, 400, { error: 'Use either sequential edits or camera angles for a single run' });
      }
      if (p.editSequence) {
        p.prompt = p.editSequence.prompts[p.editSequence.index];
        p.batch = 1;
      }
      if (p.qwenAngle && !supportsEditAngles(p.editEngine)) {
        return json(res, 400, { error: 'Camera variations are available with Klein 4B, Klein 9B, and Qwen Edit only' });
      }
      if (p.qwenAngle && p.maskImageName) {
        return json(res, 400, { error: 'Use either a camera angle or a localized edit area for a single run' });
      }
      if (p.editOutpaint && p.qwenAngle) {
        return json(res, 400, { error: 'Expand and camera variations must be generated separately' });
      }
      if (p.qwenAngle) {
        p.anglePrompt = editAnglePrompt(p.editEngine, p.qwenAngle, p.prompt);
        if (p.editEngine === 'qwen') p.qwenAnglePrompt = p.anglePrompt;
      }
      if (p.qwenAngle && !refNames.length) {
        return json(res, 400, { error: 'Camera variations need a source image in reference slot 1' });
      }
      if (['qwen', 'krea2ref', 'krea2remix'].includes(p.editEngine) && !refNames.length) {
        const label = p.editEngine === 'qwen' ? 'Qwen Edit' : (p.editEngine === 'krea2remix' ? 'Krea 2 Remix' : 'Krea 2 Edit');
        return json(res, 400, { error: `${label} needs at least one reference image` });
      }
      if (p.editOutpaint && !refNames.length) {
        return json(res, 400, { error: 'Expand needs a source image in reference slot 1' });
      }
      if (p.editOutpaint && !p.editAspectOverride) {
        return json(res, 400, { error: 'Choose a Resolution ratio that extends beyond the source image' });
      }
      p.editOutpaintPosition = p.editOutpaint ? normalizeOutpaintPosition(p.editOutpaintPosition) : undefined;
      if (p.maskImageName && !p.editOutpaint && !supportsEditMask(p.editEngine)) {
        return json(res, 400, { error: 'Edit areas are available with Klein 4B, Klein 9B, Qwen Edit, and Krea2 only' });
      }
      if (p.maskImageName && !refNames.length) {
        return json(res, 400, { error: 'An edit area needs a source image in reference slot 1' });
      }
      if (p.maskImageName && !p.editOutpaint) p.editAspectOverride = false;
      if (p.maskImageName && !p.editOutpaint) p.denoise = maskInfluenceDenoise(p.maskInfluence);
      if (p.editEngine === 'krea2') {
        if (p.editOutpaint) {
          p.steps = 8; p.cfg = 1; p.denoise = null;
        }
        if (p.maskImageName && !refNames.length) {
          return json(res, 400, { error: 'Krea2 Fill needs a source image' });
        }
      } else if (p.editEngine === 'krea2ref') {
        p.steps = clampInt(p.steps, 8, 12, 10); p.cfg = clampNum(p.cfg, 1, 5, 1); p.denoise = null;
      } else if (p.editEngine === 'krea2remix') {
        p.steps = clampInt(p.steps, 4, 20, 8); p.cfg = 1; p.denoise = null;
      } else if (p.editEngine === 'qwen') {
        p.qwenQuality = normalizeQwenEditQuality(p.qwenQuality);
        const preset = qwenEditPreset(p.qwenQuality);
        p.steps = preset.steps; p.cfg = preset.cfg; p.denoise = null;
      } else {
        p.steps = 4; p.cfg = 1; p.denoise = null;
      }
      if (p.editEngine !== 'qwen' || p.qwenQuality !== 'quality') p.negativePrompt = '';
      // Pixel compositing needs identical source/output dimensions. A custom
      // output ratio intentionally changes the canvas, so retain the edit
      // itself but skip the incompatible preservation pass.
      if (p.editAspectOverride && !p.editOutpaint) p.composite = false;
    }
    if (usesKrea2Model && settings.krea2ModelVariant === 'int8-convrot') {
      const compatibility = await getComfyCompatibility();
      if (compatibility.supported !== true) {
        return json(res, 409, {
          error: nativeInt8CompatibilityError(compatibility),
          code: 'comfy_int8_update_required',
          compatibility,
        });
      }
    }
    if (requestedHuntLoras.length && (p.editSequence || p.qwenAngle)) {
      return json(res, 400, { error: 'Run Strength Hunt separately from sequential edits and camera variations' });
    }
    let requestedHuntPlan = null;
    if (requestedHuntLoras.length) {
      try { requestedHuntPlan = buildStrengthHuntPlan(p.loras); }
      catch (error) { return json(res, 400, { error: error.message }); }
    }
    const huntCount = requestedHuntPlan ? requestedHuntPlan.variants.length : 0;
    if (huntCount && Number(p.strengthHuntConfirmed) !== huntCount) {
      return json(res, 409, { error: `Confirm the ${huntCount}-image Strength Hunt before queueing it` });
    }
    if (huntCount) {
      p.batch = 1;
      p.postUpscale = undefined;
    }
    const queued = huntCount
      ? await queueStrengthHuntJob(p, req.profile.id, refNames, refined)
      : await queueGenerationJob(p, req.profile.id, refNames, refined);
    return json(res, 200, {
      jobId: queued.pid,
      seed: p.seed,
      refinedPrompt: refined,
      sequenceId: p.editSequence ? p.editSequence.id : undefined,
      strengthHunt: huntCount || undefined,
      vramProfile,
      adjustments: vramAdjustments.length ? vramAdjustments : undefined,
    });
  }

  if (route === '/api/upscale' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Image not found' });
    const buf = await fsp.readFile(path.join(IMAGES, item.file));
    const real = pngDims(buf);
    const width = (real && real.w) || item.width || 1024;
    const height = (real && real.h) || item.height || 1024;
    const engine = body.engine === 'ultimate' ? 'ultimate' : 'seedvr2';
    const upscaleMode = body.upscaleMode === 'scale' ? 'scale' : 'resolution';
    const scaleFactor = clampNum(body.scaleFactor, 1, 4, 2);
    if (engine === 'ultimate' && settings.krea2ModelVariant === 'int8-convrot') {
      const compatibility = await getComfyCompatibility();
      if (compatibility.supported !== true) {
        return json(res, 409, {
          error: nativeInt8CompatibilityError(compatibility),
          code: 'comfy_int8_update_required',
          compatibility,
        });
      }
    }
    const comfyName = await uploadToComfy(buf, `ks_upsrc_${item.id}.png`);
    let opts;
    if (engine === 'ultimate') {
      const info = await getObjectInfo();
      const readinessError = ultimateSdUpscaleReadinessError(info);
      if (readinessError) return json(res, 400, { error: readinessError });
      const promptOverride = String(body.prompt || '').trim();
      const fallbackPrompt = item.refinedPrompt || item.prompt || '';
      opts = {
        engine,
        upscaleMode: 'scale',
        scaleFactor,
        prompt: promptOverride || fallbackPrompt || 'a faithful, highly detailed upscale of the source image',
        promptSource: promptOverride ? 'custom' : (item.refinedPrompt ? 'enhanced' : (item.prompt ? 'original' : 'fallback')),
        seed: Math.floor(Math.random() * 2 ** 31),
      };
    } else {
      opts = {
        engine,
        resolution: targetResolutionForUpscale({
          mode: upscaleMode,
          scaleFactor,
          width,
          height,
          fallbackResolution: clampInt(body.resolution, 512, 8192, 2160),
        }),
        upscaleMode,
        scaleFactor: upscaleMode === 'scale' ? scaleFactor : undefined,
        preScale: clampNum(body.preScale, 1, 4, 1),
        profile: body.profile === 'balanced' ? 'balanced' : 'sharp',
        noise: ['off', 'low', 'medium'].includes(body.noise) ? body.noise : 'low',
      };
    }
    const graph = await buildUpscale(comfyName, opts);
    const pid = await queuePrompt(graph, { profileId: req.profile.id });
    trackJob(pid, { kind: 'upscale', profileId: req.profile.id, itemId: item.id, graph, upscaleInfo: opts });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  if (route === '/api/director/assets' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const assets = Array.isArray(body.assets) ? body.assets.slice(0, 768) : [];
    const missingAssets = [];
    for (const entry of assets) {
      try {
        const kind = ['image', 'video', 'audio'].includes(entry?.kind) ? entry.kind : 'image';
        const name = normalizeDirectorAssetName(entry?.name, kind);
        if (!(await directorInputAssetAvailable(name))) missingAssets.push(name);
      } catch {
        missingAssets.push(String(entry?.name || 'invalid asset'));
      }
    }
    return json(res, 200, { missingAssets: [...new Set(missingAssets)] });
  }

  if (route === '/api/director/generate' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (settings.features['video.ltx'] === false) {
      return json(res, 400, { error: 'LTX 2.3 was not installed on this machine.' });
    }
    let project;
    try {
      project = normalizeDirectorProject(body.project);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const requestedOutput = body.project?.output && typeof body.project.output === 'object'
      ? body.project.output : {};
    const requestedBatch = Math.max(1, Math.min(8, Math.round(Number(requestedOutput.batch) || 1)));
    const requestedSeedValue = Number(body.batchSeed);
    const requestedSeed = Number.isSafeInteger(requestedSeedValue) && requestedSeedValue >= 0
      ? requestedSeedValue : null;
    const directorComposerMode = ['extend', 'keyframes', 'timeline'].includes(body.composerMode)
      ? body.composerMode : (project.extensionSource ? 'extend' : 'timeline');

    const info = await getObjectInfo();
    const extensionClasses = project.extensionSource
      ? ['VHS_LoadVideo', 'ImageFromBatch']
      : [];
    const missingNodes = [...new Set([...REQUIRED_CLASSES.video, ...REQUIRED_CLASSES.ltxdirector, ...extensionClasses])]
      .filter((name) => !info[name]);
    if (missingNodes.length) {
      return json(res, 400, {
        error: `Director mode needs its ComfyUI dependencies installed and ComfyUI restarted. Missing: ${missingNodes.join(', ')}`,
        component: 'ltxdirector',
      });
    }
    if (project.motionSegments.length) {
      const model = configuredModelsStatus(info).ltxDirector.ingredients;
      if (!model.ok) {
        return json(res, 400, {
          error: `IC guidance needs the Ingredients IC-LoRA in ComfyUI loras: ${model.name}`,
          component: 'ltxdirector',
        });
      }
    }

    const missingAssets = [];
    for (const name of directorAssetNames(project)) {
      if (!(await directorInputAssetAvailable(name))) missingAssets.push(name);
    }
    if (missingAssets.length) {
      return json(res, 400, { error: 'Replace or remove missing Director media before generating.', missingAssets });
    }

    let extension = null;
    let extensionItem = null;
    let extensionVideo = null;
    if (project.extensionSource) {
      let sourcePath;
      let sourceBuffer = null;
      let sourceInfo;
      let sourceWidth;
      let sourceHeight;
      let sourceHasAudio = false;
      let videoName;
      let durableSource = null;
      if (project.extensionSource.inputName) {
        let durable;
        try {
          durable = await resolveDurableUploadedVideo(INPUTS, project.extensionSource.inputName);
        } catch (error) {
          const status = error?.code === 'missing_extension_source' ? 404 : 400;
          return json(res, status, { error: error.message });
        }
        if (!videoExtensionFfmpeg) videoExtensionFfmpeg = await resolveFfmpegExecutable(RUNTIME);
        if (!videoExtensionFfmpeg) {
          return json(res, 400, {
            error: 'Video extension needs FFmpeg. Install it or make the ComfyUI imageio-ffmpeg executable available.',
          });
        }
        let probe;
        try {
          probe = await probeVideoFile(durable.file, videoExtensionFfmpeg);
        } catch (error) {
          return json(res, 400, { error: error.message });
        }
        sourcePath = durable.file;
        sourceInfo = probe;
        sourceWidth = probe.width;
        sourceHeight = probe.height;
        sourceHasAudio = await detectAudioStreamFile(sourcePath, durable.name) === true;
        durableSource = durable;
      } else {
        const visibleItems = galleryView(db, isPrivateUnlocked(req)).items
          .filter((item) => item.profileId === req.profile.id);
        extensionItem = visibleItems.find((item) => item.id === project.extensionSource.itemId);
        extensionVideo = extensionItem?.videos?.find((video) => video.id === project.extensionSource.videoId) || null;
        if (!extensionItem || !extensionVideo) {
          return json(res, 404, { error: 'The video being extended is no longer available in this gallery.' });
        }
        if (extensionVideo.info?.composite) {
          return json(res, 400, { error: 'Side-by-side comparison videos cannot be extended.' });
        }
        const videosRoot = `${path.resolve(VIDEOS)}${path.sep}`;
        sourcePath = path.resolve(VIDEOS, String(extensionVideo.file || ''));
        if (!sourcePath.startsWith(videosRoot)) {
          return json(res, 400, { error: 'The extension source has an invalid gallery path.' });
        }
        try {
          sourceBuffer = await fsp.readFile(sourcePath);
        } catch {
          return json(res, 404, { error: 'The video file being extended is missing.' });
        }
        sourceInfo = extensionVideo.info || {};
        const sourceDims = mp4Dims(sourceBuffer) || {};
        sourceWidth = sourceInfo.width || extensionItem.width || sourceDims.w;
        sourceHeight = sourceInfo.height || extensionItem.height || sourceDims.h;
        sourceHasAudio = detectAudioStream(sourceBuffer, extensionVideo.file) === true;
      }
      let plan;
      try {
        plan = normalizeDirectorExtensionPlan({
          info: sourceInfo,
          width: sourceWidth,
          height: sourceHeight,
          rangeFrames: project.range.lengthFrames,
          smooth: body.smooth,
          continueAudio: project.extensionSource.continueAudio,
        });
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
      if (!videoExtensionFfmpeg) videoExtensionFfmpeg = await resolveFfmpegExecutable(RUNTIME);
      if (!videoExtensionFfmpeg) {
        return json(res, 400, {
          error: 'Video extension needs FFmpeg. Install it or make the ComfyUI imageio-ffmpeg executable available.',
        });
      }
      if (durableSource) {
        // Restore the durable local copy into ComfyUI in case its input folder
        // was cleaned or the backend was reinstalled. This streams from disk
        // and does not load a potentially large video into Node's heap.
        videoName = await uploadFileToComfy(durableSource.file, durableSource.name);
      } else {
        const sourceExtension = ['.mp4', '.webm', '.mov'].includes(path.extname(extensionVideo.file).toLowerCase())
          ? path.extname(extensionVideo.file).toLowerCase()
          : '.mp4';
        videoName = await uploadToComfy(sourceBuffer, `ks_extend_${extensionVideo.id}${sourceExtension}`);
      }
      extension = {
        videoName,
        sourceHasAudio,
        sourcePath,
        ffmpegPath: videoExtensionFfmpeg,
        plan,
      };
    }

    const seedValue = Number(body.seed);
    const seed = Number.isSafeInteger(seedValue) && seedValue >= 0
      ? seedValue : Math.floor(Math.random() * 0x7fffffff);
    let { W, H } = videoDims(
      clampInt(body.width, 64, 8192, 1280),
      clampInt(body.height, 64, 8192, 720),
    );
    let smooth = [1, 2, 3].includes(Number(body.smooth)) ? Number(body.smooth) : 1;
    let fourK = body.fourK === true;
    if (extension) {
      ({ W, H, smooth, fourK } = extension.plan);
    }
    const loras = Array.isArray(body.loras) ? body.loras.filter((lora) => lora && lora.on && lora.name) : [];
    const savedLoras = Array.isArray(requestedOutput.loras)
      ? requestedOutput.loras.slice(0, 64).filter((lora) => lora && lora.name).map((lora) => ({
        name: String(lora.name).slice(0, 512),
        strength: Number.isFinite(Number(lora.strength)) ? Number(lora.strength) : 1,
        on: lora.on !== false,
      }))
      : loras;
    const outputFrames = directorOutputFrames(project);
    const graph = await buildLtxDirectorGraph(project, {
      W, H, seed, smooth, fourK, makePoster: !extension || !extensionItem, loras, extension,
      sigmasBase: LTX_SIGMAS_BASE, sigmasRefine: LTX_SIGMAS_REFINE,
    }, settings, {
      nodeFromOrdered, filterInputs, chainModelLoras, rifeSmooth,
      rtxVideoSuperResolutionNode, getObjectInfo,
    });
    const pid = await queuePrompt(graph, { profileId: req.profile.id });
    const directorProject = Object.assign({}, project, {
      output: { width: W, height: H, seed: requestedSeed ?? seed, batch: requestedBatch, smooth, fourK, loras: savedLoras },
    });
    const baseVideoInfo = {
        engine: 'ltx', workflow: 'director',
        directorProject,
        directorComposerMode,
        seconds: project.range.lengthFrames / DIRECTOR_FPS,
        motionPrompt: project.globalPrompt || project.segments.find((segment) => segment.prompt)?.prompt || 'Director project',
        enhance: false,
        frames: (outputFrames - 1) * smooth + 1, fps: DIRECTOR_FPS * smooth,
        exactFrameCount: true,
        smooth: smooth > 1 ? smooth : undefined,
        fourK,
        width: fourK ? W * 2 : W,
        height: fourK ? H * 2 : H,
        seed, t2v: !project.segments.some((segment) => segment.type === 'image'),
        drivenAudio: project.audioSegments.length > 0 || project.settings.inpaintAudio,
        motionVideo: project.motionSegments.length > 0,
        endFrame: project.segments.some((segment) => segment.type === 'image' && segment.isEndFrame),
        loras,
    };
    const videoInfo = extension
      ? videoExtensionInfo(baseVideoInfo, extension.plan, {
        parentVideoId: extensionVideo ? extensionVideo.id : undefined,
        prompt: baseVideoInfo.motionPrompt,
        sourceHasAudio: extension.sourceHasAudio,
      })
      : baseVideoInfo;
    if (extension) {
      videoInfo.workflow = 'director';
      videoInfo.directorProject = directorProject;
      videoInfo.t2v = false;
      videoInfo.drivenAudio = project.audioSegments.length > 0 || project.settings.inpaintAudio;
    }
    trackJob(pid, {
      kind: 'video', profileId: req.profile.id,
      itemId: extensionItem ? extensionItem.id : null,
      createItem: !extensionItem,
      graph,
      videoInfo,
      extensionJoin: extension ? {
        sourcePath: extension.sourcePath,
        sourceHasAudio: extension.sourceHasAudio,
        ffmpegPath: extension.ffmpegPath,
        plan: extension.plan,
      } : null,
    });
    ensureWs();
    return json(res, 200, {
      jobId: pid,
      frames: extension ? extension.plan.totalFrames : outputFrames,
      engine: 'ltx',
      workflow: extension ? 'extend' : 'director',
    });
  }

  if (route === '/api/animate' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const engine = ['ltx25', 'h3', 'wan', 'wan-animate2', 'eros', 'scail', 'ltx-edit'].includes(body.engine) ? body.engine : 'ltx';
    const wanAnimate2 = engine === 'wan-animate2';
    const h3Mode = engine === 'h3' && ['reference', 'replace'].includes(body.h3Mode)
      ? body.h3Mode
      : 'frames';
    const h3ReferenceBacked = engine === 'h3' && (h3Mode === 'reference' || h3Mode === 'replace');
    const h3GraphMode = h3ReferenceBacked ? 'reference' : 'frames';
    const h3SelectedModelVariant = engine === 'h3'
      ? (h3ReferenceBacked ? h3ReferenceVariant(settings) : h3FrameVariant(settings))
      : null;
    const h3ReplaceKind = body.h3ReplaceKind === 'character' ? 'character' : 'object';
    const h3ReplaceTarget = String(body.h3ReplaceTarget || '').trim().slice(0, 240);
    const h3TurboRequested = engine === 'h3' && body.h3Turbo === true;
    const h3Turbo = h3TurboRequested;
    const h3TurboCanvas = h3Turbo ? h3TurboFixedCanvas(settings, h3GraphMode) : null;
    const ltx25Quality = engine === 'ltx25' && body.fast === false;
    const h3LongContext = engine === 'h3' && body.h3LongContext === true;
    const h3SageAttention = engine === 'h3' && body.sageAttention !== false;
    const h3References = normalizeH3References(body.h3References);
    let requestedVideoLoras = Array.isArray(body.loras)
      ? body.loras.filter((lora) => lora && lora.on && lora.name && String(lora.name).trim())
      : [];
    let h3TurboNativeSampler = false;
    const h3AllowedReferenceTokens = h3ReferenceInputTokens(h3References);
    // Every video route except Wan Full Quality and LTX 2.5 Quality is fixed at CFG 1 (or
    // explicitly zeroes negative conditioning), so a negative prompt cannot
    // influence sampling there. Do not silently retain a placebo setting.
    const negativePrompt = ((engine === 'wan' && body.fast === false) || ltx25Quality)
      ? normalizeNegativePrompt(body.negativePrompt)
      : '';
    if (settings.features[VIDEO_FEATURES[engine]] === false) {
      return json(res, 400, { error: 'This video model was not installed on this machine.' });
    }
    const generationHardwareProfile = setupHardwareProfile(await getSetupHardwareInfo());
    adoptDeviceCompatibleModelSettings(generationHardwareProfile);
    const engineCapability = configuredVideoEngineCapability(engine, generationHardwareProfile, settings);
    if (!engineCapability.supported) {
      return json(res, 409, {
        error: engineCapability.reason,
        code: 'generation_device_unsupported',
        engine,
      });
    }
    if (engine === 'ltx25') {
      const info = await getObjectInfo();
      const coreCompatibility = await getComfyCompatibility();
      const compatibility = ltx25Compatibility(info, coreCompatibility.version);
      if (compatibility.supported !== true) {
        return json(res, 409, {
          error: ltx25CompatibilityError(compatibility),
          code: 'comfy_ltx25_update_required',
          component: 'ltx25',
          compatibility,
        });
      }
      const requiredNodes = ltx25Quality
        ? [...REQUIRED_CLASSES.ltx25, ...REQUIRED_CLASSES.ltx25quality]
        : REQUIRED_CLASSES.ltx25;
      const missingNodes = requiredNodes.filter((className) => !info[className]);
      const modelStatuses = configuredModelsStatus(info);
      const selectedStatuses = ltx25Quality
        ? [modelStatuses.ltx25, modelStatuses.ltx25Quality]
        : [modelStatuses.ltx25];
      const missingModels = selectedStatuses.flatMap((modelStatusValue) => Object.entries(modelStatusValue)
        .filter(([key, value]) => key !== 'label' && value?.ok === false)
        .map(([key]) => key));
      if (missingNodes.length || missingModels.length) {
        return json(res, 409, {
          error: ltx25Quality
            ? 'LTX 2.5 Quality needs the full Dev model, BF16 text encoder, distilled refinement LoRA, and current native ComfyUI workflow. Install or repair LTX 2.5 Quality in Generation Setup, restart ComfyUI, and try again.'
            : 'LTX 2.5 needs its official model pack and current native ComfyUI workflow. Install or repair LTX 2.5 in Generation Setup, restart ComfyUI, and try again.',
          code: 'ltx25_unavailable',
          component: ltx25Quality ? 'ltx25quality' : 'ltx25',
          missingNodes,
          missingModels,
        });
      }
    }
    if (engine === 'h3') {
      const info = await getObjectInfo();
      const coreCompatibility = await getComfyCompatibility();
      const h3Compatibility = minimaxH3Compatibility(info, coreCompatibility.version);
      if (h3Compatibility.supported !== true) {
        return json(res, 409, {
          error: minimaxH3CompatibilityError(h3Compatibility),
          code: 'comfy_h3_update_required',
          compatibility: h3Compatibility,
        });
      }
      const selectedVariant = h3SelectedModelVariant;
      if (requestedVideoLoras.length) {
        const loraCompatibility = h3LoraCompatibility(settings, h3GraphMode);
        if (!loraCompatibility.supported) {
          return json(res, 409, {
            error: loraCompatibility.reason,
            code: 'h3_lora_model_incompatible',
            modelVariant: loraCompatibility.variant,
          });
        }
        if (!info.LoraLoaderModelOnly) {
          return json(res, 409, {
            error: 'MiniMax H3 LoRAs need ComfyUI’s model-only LoRA loader. Update ComfyUI, restart it, and try again.',
            code: 'h3_lora_loader_unavailable',
            component: 'h3',
            missingNodes: ['LoraLoaderModelOnly'],
          });
        }
        const managedTurboNames = new Set([settings.h3TurboLora, settings.h3RefTurboLora]
          .map((name) => normalizeModelPath(name).split('/').pop())
          .filter(Boolean));
        const duplicateManaged = requestedVideoLoras.find((lora) => (
          managedTurboNames.has(normalizeModelPath(lora.name).split('/').pop())
        ));
        if (duplicateManaged) {
          return json(res, 400, {
            error: 'The selected Turbo adapter is managed by the H3 Turbo switch and cannot also be added as a user LoRA. Remove it from the LoRA stack and try again.',
            code: 'h3_managed_lora_duplicate',
            lora: String(duplicateManaged.name),
          });
        }
        const modelOnlyH3Loras = comboList(info, 'LoraLoaderModelOnly', 'lora_name');
        const availableH3Loras = modelOnlyH3Loras.length
          ? modelOnlyH3Loras
          : comboList(info, 'LoraLoader', 'lora_name');
        const resolvedH3Loras = requestedVideoLoras.map((lora) => ({
          lora,
          resolved: resolveRegisteredModelName(String(lora.name), availableH3Loras),
        }));
        const unavailableH3Lora = resolvedH3Loras.find((entry) => !entry.resolved);
        if (unavailableH3Lora) {
          return json(res, 409, {
            error: `MiniMax H3 cannot find this LoRA in ComfyUI: ${String(unavailableH3Lora.lora.name)}`,
            code: 'h3_lora_unavailable',
            lora: String(unavailableH3Lora.lora.name),
          });
        }
        requestedVideoLoras = resolvedH3Loras.map(({ lora, resolved }) => (
          Object.assign({}, lora, { name: resolved })
        ));
      }
      if (h3LongContext && h3Mode === 'replace') {
        return json(res, 400, {
          error: 'MiniMax H3 Long context supports Text + Frames and Reference modes. Replace remains a single-clip workflow.',
          code: 'h3_long_context_mode_incompatible',
        });
      }
      if (h3LongContext && selectedVariant.requiresPatch) {
        return json(res, 409, {
          error: 'MiniMax H3 Long context is not yet validated with DynTime. Choose Standard or Full BF16 for this generation.',
          code: 'h3_long_context_model_incompatible',
        });
      }
      if (h3LongContext) {
        const missingContextNodes = REQUIRED_CLASSES.h3context.filter((className) => !info[className]);
        if (missingContextNodes.length) {
          return json(res, 409, {
            error: 'MiniMax H3 Long context needs the reviewed Motion Context node. Install Long Context, restart ComfyUI, and try again.',
            code: 'h3_long_context_unavailable',
            component: 'h3context',
            missingNodes: missingContextNodes,
          });
        }
      }
      if (selectedVariant.requiresPatch) {
        const patchStatus = await dynTimePatchStatus(RUNTIME);
        if (!patchStatus.ready) {
          return json(res, 409, {
            error: 'MiniMax H3 DynTime needs its reviewed ComfyUI compatibility patch. Open Preferences → Video Models and run DynTime setup.',
            code: 'h3_dyntime_patch_required',
            component: 'h3dyntime',
            patch: patchStatus,
          });
        }
      }
      const selectedModel = diffusionModelStatus(info, h3EffectiveModelName(settings, h3GraphMode));
      if (!selectedModel.ok) {
        return json(res, 409, {
          error: `MiniMax H3 needs this ${selectedVariant.label} model in ComfyUI: ${selectedModel.name}`,
          code: 'h3_model_unavailable',
          component: selectedVariant.requiresPatch ? 'h3dyntime' : (h3ReferenceBacked ? 'h3r2v' : 'h3'),
          model: selectedModel,
        });
      }
      if (h3Turbo) {
        const turboCompatibility = h3TurboCompatibility(settings, h3GraphMode);
        if (!turboCompatibility.supported) {
          return json(res, 409, {
            error: turboCompatibility.reason,
            code: 'h3_turbo_model_incompatible',
            modelVariant: turboCompatibility.variant,
          });
        }
        h3TurboNativeSampler = minimaxH3NativeAudioSampling(info);
        const referenceTurbo = h3ReferenceBacked;
        const standardTurboLoader = h3TurboUsesStandardLoader(settings, h3GraphMode);
        const requiredTurboNodes = h3TurboNativeSampler
          ? [standardTurboLoader ? 'LoraLoaderModelOnly' : 'MiniMaxH3TurboLoRA', 'MiniMaxH3SigmaShift']
          : (referenceTurbo || standardTurboLoader
            ? REQUIRED_CLASSES.h3turbor2v
            : REQUIRED_CLASSES.h3turbo);
        const missingTurboNodes = requiredTurboNodes.filter((className) => !info[className]);
        const turboLora = configuredModelsStatus(info)[referenceTurbo ? 'h3RefTurbo' : 'h3Turbo'].lora;
        if (missingTurboNodes.length || !turboLora.ok) {
          return json(res, 409, {
            error: missingTurboNodes.length
              ? 'MiniMax H3 Turbo needs the current creator sampler workflow. Install or repair H3 Turbo, restart ComfyUI, and try again.'
              : `MiniMax H3 ${referenceTurbo ? 'Reference ' : ''}Turbo needs this LoRA in ComfyUI: ${referenceTurbo ? settings.h3RefTurboLora : settings.h3TurboLora}`,
            code: 'h3_turbo_unavailable',
            component: referenceTurbo ? 'h3turbor2v' : 'h3turbo',
            missingNodes: missingTurboNodes,
            lora: turboLora,
          });
        }
      }
      if (h3SageAttention) {
        const sageRuntime = await probeSageAttention(RUNTIME, { status: sam3InstallStatus(RUNTIME) });
        const nodeReady = !!info.PathchSageAttentionKJ;
        if (!sageRuntime.ready || !nodeReady) {
          return json(res, 409, {
            error: !nodeReady
              ? 'MiniMax H3 SageAttention needs the KJNodes patch node. Install the H3 SageAttention workflow, restart ComfyUI, and try again.'
              : (sageRuntime.reason || 'SageAttention is not ready in the ComfyUI Python environment.'),
            code: 'h3_sage_attention_unavailable',
            component: 'h3sage',
            sageAttention: Object.assign({}, sageRuntime, {
              packageReady: sageRuntime.ready === true,
              nodeReady,
              ready: sageRuntime.ready === true && nodeReady,
            }),
          });
        }
      }
      if (h3ReferenceBacked
        && !h3References.images.length
        && !h3References.videos.length
        && !h3References.audios.length) {
        return json(res, 400, { error: 'MiniMax H3 Reference mode needs at least one image, video, or audio reference.' });
      }
      if (h3Mode === 'replace') {
        if (!h3ReplaceTarget) {
          return json(res, 400, { error: 'Describe the original character or object you want to replace.' });
        }
        if (h3References.videos.length !== 1 || h3References.images.length !== 1 || h3References.audios.length) {
          return json(res, 400, { error: 'MiniMax H3 Replace mode needs exactly one master video and one replacement image.' });
        }
      }
    }
    if (wanAnimate2) {
      const info = await getObjectInfo();
      const coreStatus = wanAnimate2CoreCompatibility(info);
      const missingNodes = REQUIRED_CLASSES.wananimate2.filter((className) => !info[className]);
      const modelStatusValue = configuredModelsStatus(info).wanAnimate2;
      const missingModels = Object.entries(modelStatusValue)
        .filter(([key, value]) => key !== 'label' && value?.ok === false)
        .map(([key]) => key);
      if (!coreStatus.supported || missingNodes.length || missingModels.length) {
        return json(res, 409, {
          error: 'Wan Animate 2 needs the current ComfyUI core nodes and official model pack. Install or repair Wan Animate 2 in Generation Setup, restart ComfyUI, and try again.',
          code: 'wan_animate2_unavailable',
          component: 'wananimate2',
          missingNodes,
          missingInputs: coreStatus.missingInputs,
          missingOutputs: coreStatus.missingOutputs,
          missingModels,
        });
      }
    }
    const requestedCameraMotions = normalizeCameraMotions(body.cameraMotions);
    const blockedCameraMotionPhrase = engine === 'scail' ? cameraMotionPhrase(requestedCameraMotions) : '';
    const cameraMotions = engine === 'scail' || engine === 'h3' ? [] : requestedCameraMotions;
    const selectedCameraMotionPhrase = cameraMotionPhrase(cameraMotions);
    const suppliedPrompt = engine === 'scail'
      ? stripCameraMotionPhrase(String(body.prompt || '').trim(), blockedCameraMotionPhrase)
      : String(body.prompt || '').trim();
    const promptTemplate = String(body.promptTemplate || '').trim().slice(0, 8000) || undefined;
    const promptPresets = normalizePromptPresets(
      body.promptPresets,
      [promptTemplate, suppliedPrompt].filter(Boolean).join('\n'),
    );
    let suppliedMotionPrompt = ensureCameraMotionPrompt(suppliedPrompt, cameraMotions);
    const userMotionPrompt = suppliedMotionPrompt;
    const autoMotionRequested = body.autoMotionPrompt === true
      && !h3ReferenceBacked;
    const preparedMotionPrompt = body.preparedMotionPrompt === true && !!suppliedMotionPrompt;
    // SCAIL follows its driving clip, so a motion sentence is an optional
    // creative nudge rather than a prerequisite for a faithful transfer.
    if (!suppliedMotionPrompt && engine !== 'scail' && !autoMotionRequested) {
      if (!wanAnimate2) return json(res, 400, { error: 'Describe the motion first' });
    }
    let motionPrompt = suppliedMotionPrompt || 'preserve the movement from the driving video';
    const isLtxEdit = engine === 'ltx-edit';
    let item = body.id ? db.items.find((it) => it.id === body.id && it.profileId === req.profile.id) : null;
    if (body.id && !item) return json(res, 404, { error: 'Image not found' });
    // Video-tab jobs that started from a gallery image group under that item
    if (!item && body.sourceItemId && !h3ReferenceBacked) {
      item = db.items.find((it) => it.id === body.sourceItemId && it.profileId === req.profile.id) || null;
    }

    let comfyName;
    let srcW; let srcH;
    let bypass = false;
    if (item) {
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_vidsrc_${item.id}.png`);
      // Trust the file, not the recorded dims (edits snap to their own buckets)
      const real = pngDims(buf);
      srcW = (real && real.w) || item.width;
      srcH = (real && real.h) || item.height;
    } else if (body.imageName) {
      comfyName = String(body.imageName); // already uploaded via /api/upload
      srcW = clampInt(body.width, 64, 8192, 1024);
      srcH = clampInt(body.height, 64, 8192, 1024);
    } else if (isLtxEdit) {
      // Edit Anything conditions from the uploaded video, rather than a
      // still image. A placeholder keeps shared job metadata code simple.
      comfyName = await uploadToComfy(BLANK_PNG, 'ks_blank.png');
      srcW = clampInt(body.width, 64, 8192, 1280);
      srcH = clampInt(body.height, 64, 8192, 720);
    } else {
      // pure text-to-video: image guide bypassed, aspect from the picker
      comfyName = await uploadToComfy(BLANK_PNG, 'ks_blank.png');
      srcW = clampInt(body.width, 64, 8192, 704);
      srcH = clampInt(body.height, 64, 8192, 1280);
      bypass = true;
    }

    if (engine !== 'ltx' && engine !== 'ltx25' && engine !== 'h3' && bypass) {
      const label = { wan: 'Wan 2.2', 'wan-animate2': 'Wan Animate 2', eros: '10Eros DMD', scail: 'SCAIL 2', 'ltx-edit': 'LTX Edit' }[engine];
      return json(res, 400, { error: `${label} needs a source image. Use LTX 2.3 or LTX 2.5 for text-to-video.` });
    }
    if (autoMotionRequested && bypass) {
      return json(res, 400, { error: 'Automatic motion prompts need a first-frame image.' });
    }
    const faceImageName = engine === 'ltx' && body.faceImageName ? String(body.faceImageName) : null;
    const driveVideoName = (engine === 'scail' || wanAnimate2 || isLtxEdit) && body.driveVideoName ? String(body.driveVideoName) : null;
    const cameraGuideVideoName = engine === 'ltx' && body.cameraGuideVideoName
      ? String(body.cameraGuideVideoName)
      : null;
    const cameraReferenceGuided = engine === 'ltx'
      && (cameraMotions.length > 0 || !!cameraGuideVideoName)
      && !faceImageName
      && !body.endImageName;
    const driveStart = clampNum(body.driveStartSeconds, 0, 3600, 0);
    const driveDur = clampNum(body.driveDurSeconds, 0, 3600, 0);
    const cameraGuideStart = clampNum(body.cameraGuideStartSeconds, 0, 3600, 0);
    const cameraGuideSourceDuration = clampNum(body.cameraGuideSourceDuration, 0, 3600, 0);
    if (cameraReferenceGuided && cameraGuideVideoName && cameraGuideSourceDuration > 0
      && cameraGuideSourceDuration - cameraGuideStart < 1) {
      return json(res, 400, { error: 'Choose a camera-motion segment with at least 1 second remaining.' });
    }
    const selectedScailMode = scailMode(body.scailMode);
    const selectedScailFps = normalizeScailFps(body.scailFps);
    const selectedScailChunkOptions = normalizeScailChunkOptions({
      mode: selectedScailMode,
      stableTracking: body.scailStableTracking,
      chunkFrames: body.scailChunkFrames,
      overlapFrames: body.scailChunkOverlap,
    });
    if (engine === 'scail' && !driveVideoName) {
      return json(res, 400, { error: 'SCAIL 2 needs a driving motion video. Attach one with the 🎥 chip.' });
    }
    if (wanAnimate2 && !driveVideoName) {
      return json(res, 400, { error: 'Wan Animate 2 needs a performance video for motion and expression.' });
    }
    if (isLtxEdit && !driveVideoName) {
      return json(res, 400, { error: 'LTX Edit needs the source video you want to edit.' });
    }
    if (engine === 'scail' && selectedScailMode === 'infinity') {
      const info = await getObjectInfo();
      const err = scailInfinityError(info);
      if (err) return json(res, 400, { error: err });
    }

    let wanAnimate2Plan = null;
    let wanAnimate2SourcePath = '';
    let wanAnimate2PreparedPath = '';
    if (wanAnimate2) {
      if (!videoExtensionFfmpeg) videoExtensionFfmpeg = await resolveFfmpegExecutable(RUNTIME);
      if (!videoExtensionFfmpeg) {
        return json(res, 409, {
          error: 'Wan Animate 2 needs FFmpeg to match the generated video to the performance timing. Install FFmpeg or make the ComfyUI imageio-ffmpeg executable available.',
          code: 'wan_animate2_probe_unavailable',
        });
      }
      try {
        const durablePerformance = await resolveDurableUploadedVideo(INPUTS, driveVideoName);
        wanAnimate2SourcePath = durablePerformance.file;
        const performanceProbe = await probeVideoFile(durablePerformance.file, videoExtensionFfmpeg);
        const requestedPerformanceSeconds = Number(body.seconds);
        wanAnimate2Plan = wanAnimate2ContinuationPlan({
          sourceFrames: performanceProbe.frames,
          sourceFps: performanceProbe.fps,
          requestedSeconds: Number.isFinite(requestedPerformanceSeconds) && requestedPerformanceSeconds > 0
            ? requestedPerformanceSeconds
            : (driveDur || performanceProbe.durationSeconds),
        });
      } catch (error) {
        return json(res, 400, {
          error: `Could not read reliable timing from the Wan Animate 2 performance video. Reattach it and try again. ${String(error.message || error)}`,
          code: 'wan_animate2_probe_failed',
        });
      }
    }

    // Duration: prefer seconds; fall back to legacy frames (25 fps)
    let seconds = Number(body.seconds);
    let h3LongContextPlan = [];
    const h3LongContextTurboVideo = h3LongContext && h3Turbo && h3ReferenceBacked
      && h3References.videos.length > 0;
    if (!Number.isFinite(seconds)) seconds = clampInt(body.frames, 25, 505, 121) / 25;
    seconds = engine === 'h3'
      ? (h3LongContext
        ? Math.max(H3_MIN_SECONDS, Math.min(H3_LONG_CONTEXT_MAX_SECONDS, seconds))
        : h3DurationSeconds(seconds))
      : wanAnimate2
        ? wanAnimate2Plan.seconds
      : engine === 'scail'
      ? scailDurationSeconds(seconds, driveDur)
      : isLtxEdit && driveDur > 0
        ? Math.max(1, Math.min(15, driveDur, seconds))
        : engine === 'ltx25'
          ? ltx25DurationSeconds(seconds)
        : engine === 'ltx'
          ? cameraReferenceGuided
            ? ltxCameraDurationSeconds(seconds, cameraGuideVideoName ? cameraGuideSourceDuration : 0, cameraGuideStart)
            : ltxDurationSeconds(seconds)
          : Math.max(1, Math.min(15, seconds));
    let frames; let fps; let W; let H; let h3OutputAspectRatio; let h3OutputResolutionSize;
    if (engine === 'h3') {
      fps = H3_FPS;
      if (h3LongContext) {
        h3LongContextPlan = h3LongContextSegments(seconds, {
          maxGenerationFrames: h3LongContextTurboVideo ? H3_TURBO_REFERENCE_CHUNK_FRAMES : undefined,
        });
        frames = h3LongContextPlan.reduce((total, segment) => total + segment.keepFrames, 0);
        seconds = frames / H3_FPS;
      } else {
        frames = h3FramesForSeconds(seconds);
        seconds = h3EffectiveDurationSeconds(seconds);
      }
      // H3's first frame supplies visual conditioning, not the output canvas.
      // Honor the aspect and S/M/L size captured by this submission so lower
      // memory tiers also work for image-to-video and gallery reuse.
      if (h3TurboCanvas) {
        W = h3TurboCanvas.width;
        H = h3TurboCanvas.height;
        h3OutputAspectRatio = h3TurboCanvas.aspectRatio;
        h3OutputResolutionSize = h3TurboCanvas.resolutionSize;
      } else {
        const requestedWidth = clampInt(body.width, 64, 8192, srcW);
        const requestedHeight = clampInt(body.height, 64, 8192, srcH);
        const requestedAspectRatio = clampNum(
          body.h3AspectRatio,
          0.25,
          4,
          requestedWidth / Math.max(1, requestedHeight)
        );
        h3OutputAspectRatio = requestedAspectRatio;
        h3OutputResolutionSize = Number(body.h3ResolutionSize) || 1;
        ({ W, H } = h3Dimensions(requestedAspectRatio, 1, h3OutputResolutionSize));
      }
    } else if (engine === 'ltx25') {
      fps = LTX25_FPS;
      frames = ltx25FramesForSeconds(seconds);
      seconds = (frames - 1) / fps;
      ({ W, H } = ltx25Dimensions(srcW, srcH));
    } else if (wanAnimate2) {
      fps = wanAnimate2Plan.fps;
      frames = wanAnimate2Plan.outputFrames;
      ({ W, H } = wanAnimate2Dimensions(srcW, srcH));
    } else if (engine === 'scail') {
      fps = selectedScailFps;
      frames = scailFramesForSeconds(seconds, fps);
      ({ W, H } = scailDims(srcW, srcH));
    } else if (engine === 'wan') {
      fps = 16;
      frames = Math.floor(seconds * 16) + 1; // Wan needs 4n+1
      frames = Math.round((frames - 1) / 4) * 4 + 1;
      ({ W, H } = wanDims(srcW, srcH));
    } else if (engine === 'eros') {
      fps = 24;
      frames = Math.round(seconds * 24);
      frames = Math.max(25, Math.min(361, Math.round((frames - 1) / 8) * 8 + 1)); // LTX 8n+1
      ({ W, H } = videoDims(srcW, srcH));
    } else if (faceImageName) {
      // Face ID reference-to-video: single-stage, 24 fps (workflow spec)
      fps = 24;
      frames = ltxFramesForSeconds(seconds, fps);
      ({ W, H } = faceIdDims(srcW, srcH));
    } else {
      fps = cameraReferenceGuided ? LTX_CAMERA_FPS : 25;
      frames = ltxFramesForSeconds(
        seconds,
        fps,
        cameraReferenceGuided ? LTX_CAMERA_MAX_SECONDS : (isLtxEdit ? 15 : LTX_MAX_SECONDS)
      );
      ({ W, H } = cameraReferenceGuided ? cameraMotionDims(srcW, srcH) : videoDims(srcW, srcH));
    }

    if ((engine === 'ltx' || engine === 'ltx25' || isLtxEdit) && !faceImageName) {
      const refinePreflight = ltxRefinePreflight({
        width: W, height: H, frames, fps, profile: generationHardwareProfile,
      });
      if (!refinePreflight.ok) {
        return json(res, 409, Object.assign({
          error: refinePreflight.error,
          code: 'ltx_refine_too_large',
          engine,
        }, refinePreflight));
      }
    }

    let graphDriveVideoName = driveVideoName;
    if (wanAnimate2) {
      const preparedName = `ks_wan2_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.mp4`;
      wanAnimate2PreparedPath = path.join(INPUTS, preparedName);
      try {
        await prepareWanAnimate2Performance({
          sourcePath: wanAnimate2SourcePath,
          outputPath: wanAnimate2PreparedPath,
          ffmpegPath: videoExtensionFfmpeg,
          fps: wanAnimate2Plan.fps,
          frames: wanAnimate2Plan.outputFrames,
          width: W,
          height: H,
        });
        graphDriveVideoName = await uploadToComfy(
          await fsp.readFile(wanAnimate2PreparedPath),
          preparedName,
        );
      } catch (error) {
        await fsp.unlink(wanAnimate2PreparedPath).catch(() => {});
        wanAnimate2PreparedPath = '';
        return json(res, 400, {
          error: String(error.message || error),
          code: 'wan_animate2_prepare_failed',
        });
      }
    }

    const requestedSeed = Number(body.seed);
    const seed = Number.isSafeInteger(requestedSeed) && requestedSeed >= 0
      ? requestedSeed
      : Math.floor(Math.random() * 2 ** 48);
    // Edit Anything expects concise, literal editing instructions. Its author
    // specifically advises against the LTX prompt rewriter for this workflow.
    if (wanAnimate2) body.enhance = false;
    const enhance = isLtxEdit ? false : body.enhance !== false;
    const h3PromptImageNames = engine !== 'h3'
      ? []
      : h3ReferenceBacked
        ? [h3References.images[0]?.name].filter(Boolean)
        : [!bypass ? comfyName : null, body.endImageName ? String(body.endImageName) : null].filter(Boolean);
    let autoGeneratedMotion = preparedMotionPrompt;
    if (autoMotionRequested) {
      const suggested = await sharedMotionPrompt(comfyName, seed, req.profile.id, userMotionPrompt, {
        engine,
        seconds,
        longContext: h3LongContext,
        mode: h3GraphMode,
        imageNames: engine === 'h3' ? h3PromptImageNames : undefined,
        hasFirstFrame: engine === 'h3' && !bypass,
        hasLastFrame: engine === 'h3' && !!body.endImageName,
      });
      suppliedMotionPrompt = cleanEnhancedText(suggested, userMotionPrompt || 'subtle natural movement with a steady camera');
      suppliedMotionPrompt = ensureCameraMotionPrompt(suppliedMotionPrompt, cameraMotions);
      motionPrompt = suppliedMotionPrompt;
      autoGeneratedMotion = true;
    }
    let prompt = motionPrompt;
    let refinedMotionPrompt = null;
    const frameAwareEnhance = !bypass && !faceImageName && !isLtxEdit && engine !== 'h3';
    if (engine !== 'h3' && shouldUseConfiguredPromptAi('video', 'enhance') && enhance && suppliedMotionPrompt && !autoGeneratedMotion) {
      const externalImageNames = [faceImageName || (!bypass ? comfyName : undefined)].filter(Boolean);
      const externalImageName = externalImageNames[0];
      const parts = videoPromptEnhanceParts(motionPrompt, {
        engine,
        seconds,
        mode: h3GraphMode,
        hasImage: !!externalImageName,
      });
      const raw = await runConfiguredPromptAi(parts, 384, {
        action: 'enhance',
        imageName: externalImageName,
        imageNames: externalImageNames,
        profileId: req.profile.id,
      });
      refinedMotionPrompt = cleanEnhancedText(raw, motionPrompt);
      refinedMotionPrompt = ensureCameraMotionPrompt(refinedMotionPrompt, cameraMotions);
      prompt = refinedMotionPrompt;
    } else if (engine === 'h3' && enhance && suppliedMotionPrompt && !autoGeneratedMotion) {
      const h3EnhanceImageName = h3PromptImageNames[0];
      const raw = await sharedH3PromptEnhancement(motionPrompt, seed, {
        profileId: req.profile.id,
        imageName: h3EnhanceImageName,
        imageNames: h3PromptImageNames,
        mode: h3GraphMode,
        seconds,
        longContext: h3LongContext,
        hasFirstFrame: h3Mode === 'frames' && !bypass,
        hasLastFrame: h3Mode === 'frames' && !!body.endImageName,
        allowedReferenceTokens: h3ReferenceBacked ? h3AllowedReferenceTokens : [],
      });
      refinedMotionPrompt = cleanEnhancedText(raw, motionPrompt);
      prompt = refinedMotionPrompt;
    } else if (!wanAnimate2 && frameAwareEnhance && enhance && suppliedMotionPrompt && !autoGeneratedMotion) {
      // Every image-to-video enhancer sees both the actual first frame and
      // the user's initial motion idea before the generation graph is built.
      const raw = await wanEnhance(comfyName, motionPrompt, seed, req.profile.id);
      refinedMotionPrompt = cleanEnhancedText(raw, motionPrompt);
      refinedMotionPrompt = ensureCameraMotionPrompt(refinedMotionPrompt, cameraMotions);
      prompt = refinedMotionPrompt;
    } else if (autoGeneratedMotion) {
      refinedMotionPrompt = suppliedMotionPrompt;
      prompt = suppliedMotionPrompt;
    }
    prompt = ensureCameraMotionPrompt(prompt, cameraMotions);
    const recordedMotionPrompt = promptTemplate || userMotionPrompt || suppliedMotionPrompt
      || ((engine === 'scail' || wanAnimate2) ? 'Motion copied from performance video' : motionPrompt);
    const recordedRefinedMotionPrompt = refinedMotionPrompt && refinedMotionPrompt !== recordedMotionPrompt
      ? refinedMotionPrompt
      : null;
    const cameraMotionPromptBase = stripCameraMotionPhrase(prompt, selectedCameraMotionPhrase);

    const sigmaPreset = ['dmd', 'card', 'v5', 'custom'].includes(body.sigmaPreset) ? body.sigmaPreset : 'dmd';
    const sig = erosSigmas(sigmaPreset);
    const videoSteps = engine === 'h3'
      ? (h3Turbo
        ? clampInt(body.steps, 4, 100, h3TurboDefaultSteps(settings, h3GraphMode))
        : clampInt(body.steps, 1, 100, 20))
      : engine === 'wan'
        ? (body.fast !== false ? 4 : 20)
        : engine === 'ltx25'
          ? (ltx25Quality ? 33 : 11)
        : wanAnimate2
          ? WAN_ANIMATE_2_STEPS
        : engine === 'scail'
          ? 6
          : engine === 'eros'
            ? manualSigmaStepCount(sig.first) + manualSigmaStepCount(sig.up)
            : faceImageName
              ? manualSigmaStepCount(LTX_SIGMAS_BASE)
              : manualSigmaStepCount(LTX_SIGMAS_BASE) + manualSigmaStepCount(LTX_SIGMAS_REFINE);
    // RIFE frame interpolation for LTX, Wan, and SCAIL video outputs.
    const smooth = (engine === 'ltx' || engine === 'ltx25' || isLtxEdit || engine === 'wan' || engine === 'scail') && [2, 3].includes(Number(body.smooth))
      ? Number(body.smooth) : 1;
    const isLtxLike = engine === 'ltx' || engine === 'ltx25' || engine === 'eros';
    const audioName = isLtxLike && body.audioName ? String(body.audioName) : null;
    const endImageName = (isLtxLike || (engine === 'h3' && h3Mode === 'frames'))
      && !faceImageName && body.endImageName ? String(body.endImageName) : null;
    const cameraMotionGuideNames = cameraReferenceGuided
      ? (cameraGuideVideoName ? [cameraGuideVideoName] : await uploadCameraMotionGuides(cameraMotions))
      : [];
    const h3LongContextChainId = h3LongContextPlan.length ? uid() : '';
    const firstH3LongContextSegment = h3LongContextPlan[0] || null;
    const opts = {
      prompt: firstH3LongContextSegment
        ? h3LongContextSegmentPrompt(prompt, firstH3LongContextSegment, h3LongContextPlan.length)
        : prompt,
      negativePrompt,
      cameraMotionPhrase: selectedCameraMotionPhrase,
      cameraMotionPromptBase,
      cameraMotionGuideNames,
      cameraMotionGuideSkipFrames: cameraGuideVideoName ? Math.max(0, Math.round(cameraGuideStart * fps)) : 0,
      // I2V was enhanced by the shared vision pass above. T2V and Face ID
      // retain their specialized in-graph prompt enhancement.
      enhance: isLtxLike ? enhance && !refinedMotionPrompt : false,
      frames: firstH3LongContextSegment ? firstH3LongContextSegment.generationFrames : frames,
      fps,
      steps: videoSteps,
      fourK: !!body.fourK,
      seed,
      W, H, bypass,
      makePoster: !item,
      imgCompression: clampInt(body.motionFreedom, 0, 100, 35),
      fast: body.fast !== false,
      quality: ltx25Quality,
      audioName,
      endImageName: !firstH3LongContextSegment || h3LongContextPlan.length === 1 ? endImageName : null,
      sigmaFirst: sig.first,
      sigmaUp: sig.up,
      driveVideoName: wanAnimate2 ? graphDriveVideoName : driveVideoName,
      guideVideoName: isLtxEdit ? driveVideoName : null,
      guideSkipFrames: isLtxEdit ? Math.max(0, Math.round(driveStart * fps)) : 0,
      editAnything: isLtxEdit,
      faceImageName,
      driveSkipFrames: Math.max(0, Math.round(driveStart * (engine === 'scail' ? fps : 16))),
      driveStartSeconds: driveStart,
      seconds,
      scailMode: selectedScailMode,
      scailStableTracking: selectedScailChunkOptions.stableTracking,
      scailChunkFrames: selectedScailChunkOptions.chunkFrames,
      scailChunkOverlap: selectedScailChunkOptions.overlapFrames,
      driveAudio: engine === 'scail' && body.driveHasAudio === true,
      identityStrength: clampNum(body.wanAnimate2IdentityStrength, 0, 2, 1),
      motionStrength: clampNum(body.wanAnimate2MotionStrength, 0, 2, 1),
      wanAnimate2Plan,
      wanAnimate2Segment: wanAnimate2 ? wanAnimate2Plan.segments[0] : undefined,
      saveContinuationFrame: wanAnimate2 ? wanAnimate2Plan.segments.length > 1 : undefined,
      smooth,
      loras: requestedVideoLoras,
      mode: h3GraphMode,
      turbo: h3Turbo,
      turboStrength: clampNum(body.h3TurboStrength, 0.8, 1.2, 1),
      turboLowVram: body.h3TurboLowVram === true,
      turboNativeSampler: h3TurboNativeSampler,
      sageAttention: h3SageAttention,
      firstImageName: engine === 'h3' && !bypass && h3Mode === 'frames' ? comfyName : null,
      references: h3References,
      refImageSize: body.h3RefImageSize === 'max' ? 'max' : 'match',
      longContext: firstH3LongContextSegment ? {
        chainId: h3LongContextChainId,
        clipIndex: 0,
      } : null,
    };
    if (h3LongContextTurboVideo && firstH3LongContextSegment) {
      opts.turboReferenceSegment = firstH3LongContextSegment;
    }
    // Always attach the normalized plan, including the single five-second
    // segment. This keeps short Reference Turbo requests independent of raw
    // floating-point duration values and reserves orchestration for 2+ chunks.
    const h3TurboReferenceChunks = engine === 'h3' && h3ReferenceBacked && h3Turbo
      && !h3LongContext && h3References.videos.length
      ? h3TurboReferenceSegments(frames)
      : [];
    if (h3TurboReferenceChunks.length) {
      opts.turboReferenceSegment = h3TurboReferenceChunks[0];
    }
    const graph = engine === 'h3' ? await buildMiniMaxH3Graph(opts, settings, {
      nodeFromOrdered, filterInputs, rtxVideoSuperResolutionNode,
    })
      : engine === 'ltx25' ? await buildLtx25Graph(comfyName, opts, settings, {
        filterInputs, chainModelLoras, textGenInputs, audioLatentNodes,
        rifeSmooth, rtxVideoSuperResolutionNode,
      })
      : wanAnimate2 ? await buildWanAnimate2Graph(comfyName, opts, settings, { nodeFromOrdered, filterInputs })
      : engine === 'scail' ? await buildAnimateScail(comfyName, opts)
      : engine === 'wan' ? await buildAnimateWan(comfyName, opts)
        : engine === 'eros' ? await buildAnimateEros(comfyName, opts)
          : faceImageName ? await buildAnimateFaceId(faceImageName, opts)
            : await buildAnimate(comfyName, opts);
    let pid;
    try {
      pid = await queuePrompt(graph, { profileId: req.profile.id });
    } catch (error) {
      if (wanAnimate2PreparedPath) await fsp.unlink(wanAnimate2PreparedPath).catch(() => {});
      throw error;
    }
    const h3ChunkSequenceId = h3LongContextPlan.length > 1
      ? h3LongContextChainId
      : (h3TurboReferenceChunks.length > 1 ? uid() : '');
    const h3VideoChunkSequence = h3LongContextPlan.length > 1 ? {
      type: 'long-context',
      id: h3ChunkSequenceId,
      chainId: h3LongContextChainId,
      index: 0,
      segments: h3LongContextPlan,
      chunkBuffers: [],
      posterBuffer: null,
      startedAt: Date.now(),
      opts: Object.assign({}, opts),
      basePrompt: prompt,
      finalEndImageName: endImageName,
      turboReferenceVideo: h3LongContextTurboVideo,
      fps: H3_FPS,
      width: opts.fourK ? W * 2 : W,
      height: opts.fourK ? H * 2 : H,
    } : (h3TurboReferenceChunks.length > 1 ? {
      type: 'turbo-reference',
      id: h3ChunkSequenceId,
      index: 0,
      segments: h3TurboReferenceChunks,
      chunkBuffers: [],
      posterBuffer: null,
      startedAt: Date.now(),
      opts: Object.assign({}, opts),
      fps: H3_FPS,
      width: opts.fourK ? W * 2 : W,
      height: opts.fourK ? H * 2 : H,
    } : undefined);
    const wanAnimate2VideoChunkSequence = wanAnimate2 ? {
      type: 'wan-animate2',
      id: uid(),
      index: 0,
      segments: wanAnimate2Plan.segments,
      chunkBuffers: [],
      posterBuffer: null,
      startedAt: Date.now(),
      opts: Object.assign({}, opts),
      referenceImageName: comfyName,
      fps: wanAnimate2Plan.fps,
      width: W,
      height: H,
      audioSourcePath: wanAnimate2PreparedPath,
      temporarySourcePath: wanAnimate2PreparedPath,
      sourceHasAudio: body.driveHasAudio === true,
    } : undefined;
    trackJob(pid, {
      kind: 'video', profileId: req.profile.id, itemId: item ? item.id : null, createItem: !item, graph,
      videoChunkSequence: wanAnimate2VideoChunkSequence || h3VideoChunkSequence,
      videoInfo: {
        engine,
        seconds: opts.seconds,
        motionPrompt: recordedMotionPrompt,
        refinedMotionPrompt: recordedRefinedMotionPrompt,
        negativePrompt: opts.negativePrompt || undefined,
        promptTemplate,
        promptPresets,
        enhance: enhance && !!suppliedMotionPrompt,
        frames: h3LongContextPlan.length ? frames : (opts.frames - 1) * smooth + 1, fps: opts.fps * smooth,
        exactFrameCount: true,
        smooth: smooth > 1 ? smooth : undefined,
        fourK: opts.fourK, width: opts.fourK ? W * 2 : W, height: opts.fourK ? H * 2 : H,
        seed: opts.seed, steps: opts.steps, t2v: engine === 'h3' ? h3Mode === 'frames' && bypass : bypass,
        motionFreedom: isLtxLike ? opts.imgCompression : undefined,
        fast: engine === 'wan' ? opts.fast : undefined,
        sigmaPreset: engine === 'eros' ? sigmaPreset : undefined,
        drivenAudio: engine === 'h3' ? true : (engine === 'scail' ? opts.driveAudio === true : (wanAnimate2 ? body.driveHasAudio === true : !!audioName)),
        endFrame: !!endImageName,
        motionVideo: !!driveVideoName,
        cameraMotions: cameraMotions.length ? cameraMotions : undefined,
        cameraReferenceGuided: cameraMotionGuideNames.length > 0 || undefined,
        cameraMotionLora: cameraMotionGuideNames.length ? settings.ltxCameramanLora : undefined,
        cameraGuideVideoName: cameraGuideVideoName || undefined,
        cameraGuideStartSeconds: cameraGuideVideoName && cameraGuideStart > 0 ? cameraGuideStart : undefined,
        cameraGuideUsedSeconds: cameraGuideVideoName ? seconds : undefined,
        scailMode: engine === 'scail' ? selectedScailMode : undefined,
        scailFps: engine === 'scail' ? opts.fps : undefined,
        scailStableTracking: engine === 'scail' ? selectedScailChunkOptions.stableTracking : undefined,
        scailChunkFrames: engine === 'scail' ? selectedScailChunkOptions.chunkFrames : undefined,
        scailChunkOverlap: engine === 'scail' ? selectedScailChunkOptions.overlapFrames : undefined,
        wanAnimate2IdentityStrength: wanAnimate2 ? opts.identityStrength : undefined,
        wanAnimate2MotionStrength: wanAnimate2 ? opts.motionStrength : undefined,
        wanAnimate2Windows: wanAnimate2 ? wanAnimate2Plan.windowCount : undefined,
        sourceFrameRate: wanAnimate2 ? wanAnimate2Plan.inputFps : undefined,
        wanAnimate2PlaybackFps: wanAnimate2 ? wanAnimate2Plan.fps : undefined,
        h3Mode: engine === 'h3' ? h3Mode : undefined,
        h3Turbo: engine === 'h3' ? opts.turbo || undefined : undefined,
        h3ModelVariant: engine === 'h3' ? h3SelectedModelVariant?.id : undefined,
        h3ModelName: engine === 'h3' ? h3EffectiveModelName(settings, h3GraphMode) : undefined,
        ltx25ModelName: engine === 'ltx25'
          ? (ltx25Quality ? settings.ltx25QualityUnet : settings.ltx25Unet)
          : undefined,
        ltx25Quality: engine === 'ltx25' ? ltx25Quality || undefined : undefined,
        ltx25RefinementLora: ltx25Quality ? settings.ltx25DistilledLora : undefined,
        h3TurboLora: engine === 'h3' && opts.turbo
          ? (h3ReferenceBacked ? settings.h3RefTurboLora : settings.h3TurboLora)
          : undefined,
        h3TurboPreset: engine === 'h3' && opts.turbo ? h3TurboPreset(settings).id : undefined,
        h3TurboSigmaShifts: engine === 'h3' && opts.turbo ? h3TurboSigmaShifts(settings, h3GraphMode) : undefined,
        h3TurboReferenceExperimental: engine === 'h3' && opts.turbo && h3ReferenceBacked
          ? h3TurboReferenceIsExperimental(settings) || undefined
          : undefined,
        h3TurboStrength: engine === 'h3' && opts.turbo ? opts.turboStrength : undefined,
        h3TurboLowVram: engine === 'h3' && opts.turbo ? opts.turboLowVram || undefined : undefined,
        h3TurboSampler: engine === 'h3' && opts.turbo
          ? (opts.turboNativeSampler ? 'native-euler' : (h3ReferenceBacked ? 'creator-reference' : 'creator-legacy'))
          : undefined,
        h3TurboChunks: h3TurboReferenceChunks.length > 1 ? h3TurboReferenceChunks.length : undefined,
        h3LongContext: h3LongContextPlan.length > 1 || undefined,
        h3LongContextClips: h3LongContextPlan.length > 1 ? h3LongContextPlan.length : undefined,
        h3LongContextFrames: h3LongContextPlan.length > 1 ? 22 : undefined,
        h3AspectRatio: engine === 'h3' ? h3OutputAspectRatio : undefined,
        h3ResolutionSize: engine === 'h3' ? h3OutputResolutionSize : undefined,
        h3MatchSource: engine === 'h3' && h3Mode === 'frames' ? body.h3MatchSource === true : undefined,
        h3MatchReferenceVideo: engine === 'h3' && h3Mode === 'reference'
          ? body.h3MatchReferenceVideo === true : undefined,
        attentionBackend: engine === 'h3' ? (opts.sageAttention ? 'sageattention' : 'standard') : undefined,
        h3RefImageSize: h3ReferenceBacked ? opts.refImageSize : undefined,
        h3References: h3ReferenceBacked ? h3References : undefined,
        h3ReplaceKind: engine === 'h3' && h3Mode === 'replace' ? h3ReplaceKind : undefined,
        h3ReplaceTarget: engine === 'h3' && h3Mode === 'replace' ? h3ReplaceTarget : undefined,
        // Asset names (ComfyUI input dir) so "Reuse" can restore them
        imageName: bypass ? undefined : comfyName,
        srcWidth: bypass ? undefined : srcW,
        srcHeight: bypass ? undefined : srcH,
        audioName: audioName || undefined,
        endImageName: endImageName || undefined,
        driveVideoName: driveVideoName || undefined,
        driveHasAudio: (engine === 'scail' || wanAnimate2) ? body.driveHasAudio === true : undefined,
        faceId: !!faceImageName || undefined,
        faceImageName: faceImageName || undefined,
        driveStartSeconds: (engine === 'scail' || isLtxEdit) && driveStart > 0 ? driveStart : undefined,
        driveDurSeconds: wanAnimate2
          ? seconds
          : ((engine === 'scail' || isLtxEdit) && driveDur > 0 ? driveDur : undefined),
        loras: opts.loras,
      },
    });
    ensureWs();
    return json(res, 200, {
      jobId: pid,
      frames,
      engine,
      h3Turbo: engine === 'h3' ? opts.turbo : undefined,
      h3TurboChunks: h3TurboReferenceChunks.length > 1 ? h3TurboReferenceChunks.length : undefined,
      h3LongContextClips: h3LongContextPlan.length > 1 ? h3LongContextPlan.length : undefined,
      sequenceId: wanAnimate2VideoChunkSequence?.id || h3ChunkSequenceId || undefined,
      attentionBackend: engine === 'h3' ? (opts.sageAttention ? 'sageattention' : 'standard') : undefined,
    });
  }

  if ((route === '/api/video/upscale' || route === '/api/video/interpolate') && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Item not found' });
    const entry = (item.videos || []).find((v) => v.id === body.videoId);
    if (!entry) return json(res, 404, { error: 'Video not found' });

    const buf = await fsp.readFile(path.join(VIDEOS, entry.file));
    const hasAudio = detectAudioStream(buf, entry.file) === true;
    const info = entry.info || {};
    const dims = mp4Dims(buf) || {};
    const baseInfo = Object.assign({}, info, {
      motionPrompt: info.motionPrompt || item.prompt || 'Processed video',
      fps: info.fps || 16,
      frames: info.frames || 0,
      width: info.width || dims.w || item.width || undefined,
      height: info.height || dims.h || item.height || undefined,
    });
    const comfyName = await uploadToComfy(buf, route === '/api/video/upscale'
      ? `ks_vup_${entry.id}.mp4`
      : `ks_vfi_${entry.id}.mp4`);

    const fps = clampNum(baseInfo.fps, 1, 120, 16);
    const frames = clampInt(baseInfo.frames, 0, 1000000, 0);
    let graph;
    let videoInfo;
    if (route === '/api/video/upscale') {
      const scale = clampNum(body.scale, 1, 4, 2);
      const upscaleEngine = body.engine === 'seedvr2' ? 'seedvr2' : 'rtx';
      const objectInfo = await getObjectInfo();
      if (upscaleEngine === 'seedvr2') {
        const readiness = outpaintRefineReadiness(objectInfo);
        if (!readiness.ready) {
          return json(res, 409, {
            error: 'SeedVR2 video upscale needs the SeedVR2 nodes and configured DiT/VAE models. Install the Upscale component in Generation setup.',
            code: 'seedvr2_setup_required',
          });
        }
      } else if (!objectInfo.RTXVideoSuperResolution) {
        return json(res, 409, {
          error: 'RTX video upscale needs the RTX Video Super Resolution node. Install the optional RTX 4K component in Generation setup.',
          code: 'rtx_video_upscale_setup_required',
        });
      }
      const sourceShortEdge = Math.min(
        Number(baseInfo.width) || Number(dims.w) || 0,
        Number(baseInfo.height) || Number(dims.h) || 0,
      );
      const resolution = sourceShortEdge > 0
        ? clampInt(sourceShortEdge * scale, 512, 8192, 1080)
        : 1080;
      graph = await buildExistingVideoUpscale(comfyName, {
        fps, frames, scale, hasAudio, engine: upscaleEngine, resolution,
      });
      videoInfo = videoProcessInfo(baseInfo, {
        kind: 'upscale', scale, engine: upscaleEngine, parentVideoId: entry.id,
      });
    } else {
      const multiplier = [2, 3, 4].includes(Number(body.multiplier)) ? Number(body.multiplier) : 2;
      graph = await buildExistingVideoInterpolate(comfyName, { fps, frames, smooth: multiplier, hasAudio });
      videoInfo = videoProcessInfo(baseInfo, { kind: 'interpolate', multiplier, parentVideoId: entry.id });
    }
    if (hasAudio) videoInfo.preservedAudio = true;
    else delete videoInfo.preservedAudio;

    const pid = await queuePrompt(graph, { profileId: req.profile.id });
    trackJob(pid, { kind: 'video', profileId: req.profile.id, itemId: item.id, graph, videoInfo });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  if (route === '/api/video/convert-mp4' && req.method === 'POST') {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!['video/webm', 'video/x-matroska', 'application/octet-stream'].includes(contentType)) {
      req.resume();
      return json(res, 415, { error: 'MP4 conversion accepts WebM video recordings only' });
    }
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > MAX_DOCUMENTATION_VIDEO_BYTES) {
      req.resume();
      return json(res, 413, { error: 'The documentation video is larger than the 256 MB conversion limit' });
    }
    if (!videoExtensionFfmpeg) videoExtensionFfmpeg = await resolveFfmpegExecutable(RUNTIME);
    if (!videoExtensionFfmpeg) {
      req.resume();
      return json(res, 503, { error: 'MP4 conversion needs FFmpeg. Install FFmpeg or make the ComfyUI imageio-ffmpeg executable available.' });
    }

    let temporaryDirectory = '';
    try {
      temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'mixstudio-documentation-video-'));
      const source = path.join(temporaryDirectory, 'recording.webm');
      const output = path.join(temporaryDirectory, 'documentation.mp4');
      const bytes = await receiveInputFile(req, source, MAX_DOCUMENTATION_VIDEO_BYTES);
      if (!bytes) return json(res, 400, { error: 'No WebM recording received' });
      await transcodeVideoFileToMp4({
        sourcePath: source,
        outputPath: output,
        ffmpegPath: videoExtensionFfmpeg,
      });
      const stat = await fsp.stat(output);
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="mix-studio-documentation.mp4"',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      await pipeline(fs.createReadStream(output), res);
    } catch (error) {
      if (res.headersSent) {
        if (!res.destroyed) res.destroy(error);
        return;
      }
      const status = error?.code === 'INPUT_TOO_LARGE' ? 413
        : error?.code === 'ffmpeg_unavailable' ? 503
          : error?.code === 'video_transcode_failed' ? 422
            : 500;
      return json(res, status, { error: String(error.message || error) });
    } finally {
      if (temporaryDirectory) await fsp.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
    }
    return;
  }

  // Side-by-side comparison: original motion video (left) + SCAIL result
  // (right), stitched frame-by-frame in ComfyUI and saved as a new video
  // entry on the same gallery item.
  if (route === '/api/composite' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Item not found' });
    const entry = (item.videos || []).find((v) => v.id === body.videoId);
    if (!entry) return json(res, 404, { error: 'Video not found' });
    const info = entry.info || {};
    if (!info.driveVideoName) {
      return json(res, 400, { error: 'No stored motion video for this generation (older videos predate asset tracking)' });
    }
    const fps = info.fps || 16;
    const frames = info.frames || 81;

    // The result lives in our data dir -> push it into ComfyUI's input
    const buf = await fsp.readFile(path.join(VIDEOS, entry.file));
    const hasAudio = detectAudioStream(buf, entry.file) === true;
    const outName = await uploadToComfy(buf, `ks_cmp_${entry.id}.mp4`);

    const graph = {};
    graph.drive = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: info.driveVideoName, force_rate: fps, custom_width: 0, custom_height: 0,
      frame_load_cap: frames, skip_first_frames: Math.max(0, Math.round((info.driveStartSeconds || 0) * fps)),
      select_every_nth: 1, format: 'None',
    });
    graph.result = await nodeFromOrdered('VHS_LoadVideo', [], {}, {
      video: outName, force_rate: fps, custom_width: 0, custom_height: 0,
      frame_load_cap: frames, skip_first_frames: 0, select_every_nth: 1, format: 'None',
    });

    // libx264 requires even dims, and container metadata lies about phone
    // videos (rotation). Resize the DECODED frames in-graph instead:
    // shared even height, width auto-computed from each stream's true
    // aspect (width: 0), snapped even via divisible_by. Spacing 8 is even,
    // so the stitched total stays even.
    const rdims = mp4Dims(buf) || { w: info.width || 512, h: info.height || 960 };
    const H = Math.max(2, rdims.h - (rdims.h % 2));
    const kjResize = (src) => ({
      class_type: 'ImageResizeKJv2',
      inputs: {
        image: src, width: 0, height: H, upscale_method: 'lanczos',
        keep_proportion: 'resize', pad_color: '0, 0, 0',
        crop_position: 'center', divisible_by: 2,
      },
    });
    graph.drive_s = kjResize(['drive', 0]);
    graph.result_s = kjResize(['result', 0]);
    graph.stitch = await nodeFromOrdered(
      'ImageStitch',
      ['right', true, 8, 'black'],
      { image1: ['drive_s', 0], image2: ['result_s', 0] }
    );
    // Keep the result video's already-trimmed audio track. Pulling audio from
    // the original drive clip here can drift when the generation used a
    // start offset, duration trim, or frame interpolation.
    const videoInputs = { images: ['stitch', 0], fps };
    if (hasAudio) videoInputs.audio = ['result', 2];
    graph.video = { class_type: 'CreateVideo', inputs: videoInputs };
    graph.save = {
      class_type: 'SaveVideo',
      inputs: { video: ['video', 0], filename_prefix: 'KreaStudio/side', format: 'auto', codec: 'auto' },
    };
    const pid = await queuePrompt(await filterInputs(graph), { profileId: req.profile.id });
    trackJob(pid, {
      kind: 'video', profileId: req.profile.id, itemId: item.id, graph,
      videoInfo: {
        engine: info.engine, composite: true,
        motionPrompt: info.motionPrompt || '',
        enhance: false, frames, fps, seed: info.seed,
        preservedAudio: hasAudio || undefined,
      },
    });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  // Fast DA3 pass over an uploaded guide image so the user can inspect the
  // structure a depth-guided generation will follow. Returns the PNG directly.
  if (route === '/api/depth-preview' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const imageName = String(body.imageName || '').trim();
    if (!imageName) return json(res, 400, { error: 'Upload a source image first' });
    try {
      const graph = await filterInputs(buildDepthPreviewGraph({
        imageName,
        depthModel: settings.depthAnythingV3Model,
        width: body.width ? clampInt(body.width, 64, 4096, 1024) : 0,
        height: body.height ? clampInt(body.height, 64, 4096, 1024) : 0,
      }));
      const pid = await queuePrompt(graph, { profileId: req.profile.id });
      const buf = await waitForComfyImage(pid);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      return res.end(buf);
    } catch (error) {
      return json(res, 502, { error: `Could not build the depth map: ${error.message}` });
    }
  }

  // Static image composites: a grouped Qwen multi-angle contact strip, an
  // edit's original/result, an image-to-image reference/result pair, or a
  // source/depth-map/result strip for depth-guided generations.
  if (route === '/api/image-composite' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const type = body.type === 'selection'
      ? 'selection'
      : (['before-after', 'reference-generation', 'depth-map'].includes(body.type) ? body.type : 'angles');
    let root;
    let sources;
    let label;
    let sourceItems = [];
    if (type === 'selection') {
      const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))];
      if (ids.length < 2) return json(res, 400, { error: 'Choose at least two images for a composite' });
      if (ids.length > 16) return json(res, 400, { error: 'A contact sheet supports up to 16 selected images' });
      const unlocked = isPrivateUnlocked(req);
      const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
      const byId = new Map(visible.map((item) => [item.id, item]));
      sourceItems = ids.map((id) => byId.get(id)).filter(Boolean);
      if (sourceItems.length !== ids.length) return json(res, 404, { error: 'One or more selected images are unavailable' });
      root = sourceItems[0];
      sources = sourceItems.map((item) => item.upscaled || item.file);
      label = `${sourceItems.length} generation contact sheet`;
    } else {
      root = db.items.find((item) => item.id === body.id && item.profileId === req.profile.id);
      if (!root) return json(res, 404, { error: 'Image not found' });
    }
    if (type === 'before-after') {
      if (root.mode !== 'edit' || !root.sourceFile) {
        return json(res, 400, { error: 'This edit no longer has its original source image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Before + after';
    } else if (type === 'reference-generation') {
      if (root.mode !== 't2i' || !root.sourceFile) {
        return json(res, 400, { error: 'This generation no longer has its saved reference image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Reference + generation';
    } else if (type === 'depth-map') {
      if (root.mode !== 't2i' || root.imageGuideMode !== 'depth' || !root.sourceFile) {
        return json(res, 400, { error: 'This generation was not depth guided or no longer has its saved source image' });
      }
      sources = [root.sourceFile, root.upscaled || root.file];
      label = 'Source + depth + generation';
    } else if (type === 'angles') {
      if (!root.angleGroupId) return json(res, 400, { error: 'This image is not part of a multi-angle set' });
      const set = db.items
        .filter((item) => item.profileId === req.profile.id && item.angleGroupId === root.angleGroupId)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      if (set.length < 2) return json(res, 400, { error: 'This angle set needs at least two completed views' });
      sources = set.map((item) => item.upscaled || item.file);
      label = `${set.length} camera angles`;
    }
    if (['before-after', 'reference-generation', 'depth-map'].includes(type)) {
      const existing = (Array.isArray(root.composites) ? root.composites : []).find((composite) => {
        if (!composite || composite.type !== type) return false;
        if (Array.isArray(composite.sourceFiles)) {
          return composite.sourceFiles.length === sources.length
            && composite.sourceFiles.every((file, index) => file === sources[index]);
        }
        // Composites created before sourceFiles was recorded are safe to
        // reuse until a newer upscale changes the current source pair.
        return !root.upscaled;
      });
      if (existing) {
        try {
          await fsp.access(path.join(IMAGES, existing.file));
          return json(res, 200, { existing: true, item: root, composite: existing });
        } catch { /* stale attachment: rebuild it below */ }
      }
    }
    let buffers;
    try {
      buffers = await Promise.all(sources.map((file) => fsp.readFile(path.join(IMAGES, file))));
    } catch {
      return json(res, 404, { error: 'One of the saved source images is unavailable' });
    }
    const comfyNames = [];
    for (let index = 0; index < buffers.length; index += 1) {
      comfyNames.push(await uploadToComfy(buffers[index], `ks_composite_${root.id}_${index + 1}.png`));
    }
    const graph = type === 'selection'
      ? await buildImageContactSheet(comfyNames)
      : (type === 'depth-map'
        ? await buildDepthComposite(comfyNames, { width: root.width, height: root.height })
        : await buildImageComposite(comfyNames));
    const pid = await queuePrompt(graph, { profileId: req.profile.id });
    trackJob(pid, {
      kind: 'imageComposite', profileId: req.profile.id, graph,
      compositeInfo: {
        type,
        label,
        prompt: root.prompt || '',
        folder: root.folder || null,
        sourceItemId: type === 'selection' ? undefined : root.id,
        sourceFiles: sources,
        sourceItemIds: type === 'selection' ? sourceItems.map((item) => item.id) : undefined,
      },
    });
    ensureWs();
    return json(res, 200, { jobId: pid });
  }

  if (route === '/api/motionprompt' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const initialPrompt = String(body.prompt || '').trim();
    const engine = body.engine === 'h3' ? 'h3' : '';
    const h3LongContext = engine === 'h3' && body.h3LongContext === true;
    const endImageName = engine === 'h3' ? String(body.endImageName || '').trim().slice(0, 500) : '';
    const requestedSeconds = Number(body.seconds);
    const seconds = engine === 'h3'
      ? (h3LongContext
        ? h3LongContextSegments(requestedSeconds)
          .reduce((total, segment) => total + segment.keepFrames, 0) / H3_FPS
        : h3EffectiveDurationSeconds(requestedSeconds))
      : requestedSeconds;
    let comfyName = '';
    if (body.id) {
      const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
      if (!item) return json(res, 404, { error: 'Image not found' });
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_motion_${item.id}.png`);
    } else if (body.imageName) {
      // The Video tab has already uploaded its start frame to ComfyUI.
      comfyName = String(body.imageName);
    }
    if (!comfyName) return json(res, 400, { error: 'Attach a start frame first' });
    const imageNames = [comfyName, endImageName].filter(Boolean);
    let raw = await sharedMotionPrompt(comfyName, Math.floor(Math.random() * 2 ** 31), req.profile.id, initialPrompt, {
      engine,
      seconds,
      longContext: h3LongContext,
      mode: 'frames',
      imageNames,
      hasFirstFrame: engine === 'h3',
      hasLastFrame: engine === 'h3' && !!endImageName,
    });
    let prompt = cleanEnhancedText(raw, initialPrompt);
    if (!prompt) {
      raw = await sharedMotionPrompt(comfyName, Math.floor(Math.random() * 2 ** 31), req.profile.id, initialPrompt, {
        engine,
        seconds,
        longContext: h3LongContext,
        mode: 'frames',
        imageNames,
        hasFirstFrame: engine === 'h3',
        hasLastFrame: engine === 'h3' && !!endImageName,
      });
      prompt = cleanEnhancedText(raw, initialPrompt);
    }
    if (!prompt) return json(res, 500, { error: 'Vision model returned no usable text' });
    return json(res, 200, { prompt });
  }

  if (route === '/api/imageprompt' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let comfyName = '';
    if (body.id) {
      const item = db.items.find((it) => it.id === body.id && it.profileId === req.profile.id);
      if (!item) return json(res, 404, { error: 'Image not found' });
      const buf = await fsp.readFile(path.join(IMAGES, item.file));
      comfyName = await uploadToComfy(buf, `ks_prompt_${item.id}.png`);
    } else if (body.imageName) {
      comfyName = String(body.imageName);
    }
    if (!comfyName) return json(res, 400, { error: 'Upload an image first' });
    const raw = await suggestImagePrompt(comfyName, Math.floor(Math.random() * 2 ** 31), req.profile.id);
    const prompt = cleanEnhancedText(raw, '');
    if (!prompt) return json(res, 500, { error: 'Vision model returned no usable prompt' });
    return json(res, 200, { prompt });
  }

  if (route === '/api/prompt/revise/status' && req.method === 'GET') {
    const requestId = promptRevisionRequestId(url.searchParams.get('requestId'));
    const record = requestId && promptRevisionRequests.get(requestId);
    if (!record || record.profileId !== req.profile.id) {
      return json(res, 404, { error: 'Prompt revision status is no longer available' });
    }
    let stage = record.stage;
    let position = null;
    const job = record.jobId ? jobs.get(record.jobId) : null;
    if (job) {
      stage = job.startedAt ? 'running' : 'queued';
      if (!job.startedAt) {
        try {
          const queue = await (await comfyFetch('/queue')).json();
          const index = (queue.queue_pending || []).findIndex((entry) => String(entry?.[1] || '') === record.jobId);
          if (index >= 0) position = index + 1;
        } catch { /* retain generic waiting state while ComfyUI reconnects */ }
      }
    }
    const message = stage === 'queued'
      ? `Waiting for ComfyUI${position ? ` · queue position ${position}` : ''}`
      : stage === 'running'
        ? `Rewriting prompt · attempt ${record.attempt}/2`
        : stage === 'validating'
          ? 'Checking the revised prompt…'
          : stage === 'cancelled'
            ? 'Prompt revision cancelled'
            : stage === 'error'
              ? 'Prompt revision failed'
              : stage === 'done'
                ? 'Prompt revision ready'
                : 'Preparing prompt revision…';
    return json(res, 200, {
      requestId,
      stage,
      message,
      jobId: record.jobId || null,
      attempt: record.attempt,
      position,
    });
  }

  if (route === '/api/prompt/revise/cancel' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const requestId = promptRevisionRequestId(body.requestId);
    const record = requestId && promptRevisionRequests.get(requestId);
    if (!record || record.profileId !== req.profile.id) {
      return json(res, 404, { error: 'This prompt revision is no longer available' });
    }
    record.cancelled = true;
    updatePromptRevisionRequest(record, 'cancelled');
    let running = false;
    if (record.jobId) {
      const job = jobs.get(record.jobId);
      if (job) {
        job.cancelRequested = true;
        job.cancelMessage = 'Prompt revision cancelled';
        running = await stopComfyPrompt(record.jobId);
        cancelJob(record.jobId, job.cancelMessage);
      }
    }
    return json(res, 200, { ok: true, running });
  }

  if (route === '/api/prompt/revise' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const requestId = promptRevisionRequestId(body.requestId);
    const currentPrompt = String(body.currentPrompt || '').trim().slice(0, 12000);
    const changeRequest = String(body.changeRequest || '').trim().slice(0, 1200);
    const imageName = String(body.imageName || '').trim().slice(0, 500);
    const endImageName = String(body.endImageName || '').trim().slice(0, 500);
    if (!changeRequest) return json(res, 400, { error: 'Describe what you want to change' });
    const revisionRequest = startPromptRevisionRequest(requestId, req.profile.id);
    const videoRevision = body.kind === 'video';
    const revisionMode = ['reference', 'replace'].includes(body.h3Mode) ? 'reference' : 'frames';
    const revisionEngine = String(body.engine || '').trim().slice(0, 40);
    const revisionH3LongContext = revisionEngine === 'h3' && body.h3LongContext === true;
    const hasFirstFrame = body.hasFirstFrame === undefined
      ? revisionMode === 'frames' && !!imageName
      : body.hasFirstFrame === true;
    const hasLastFrame = body.hasLastFrame === true;
    const allowedReferenceTokens = revisionMode === 'reference'
      ? h3PromptReferenceTokens(...(Array.isArray(body.allowedReferenceTokens) ? body.allowedReferenceTokens : []))
      : [];
    const revisionImageNames = videoRevision && revisionEngine === 'h3'
      ? revisionMode === 'reference'
        ? [imageName].filter(Boolean)
        : [hasFirstFrame ? imageName : null, hasLastFrame ? (endImageName || (!hasFirstFrame ? imageName : '')) : null].filter(Boolean)
      : [imageName].filter(Boolean);
    const revisionWarnings = [];
    const revisionOptions = {
      imageName: imageName || undefined,
      endImageName: endImageName || undefined,
      imageNames: revisionImageNames,
      profileId: req.profile.id,
      engine: revisionEngine,
      seconds: revisionEngine === 'h3'
        ? (revisionH3LongContext
          ? h3LongContextSegments(body.seconds)
            .reduce((total, segment) => total + segment.keepFrames, 0) / H3_FPS
          : h3EffectiveDurationSeconds(body.seconds))
        : clampNum(body.seconds, 1, 60, 5),
      longContext: revisionH3LongContext,
      mode: revisionMode,
      // Clients predating explicit frame flags sent only imageName. Preserve
      // their I2VA behavior while keeping Reference-mode vision distinct.
      hasFirstFrame,
      hasLastFrame,
      allowedReferenceTokens,
      preserveAuthoredText: body.preserveAuthoredText === true,
      // Speaker-ID syntax improves H3 results but is never a hard gate for a
      // user-authored revision. Reference-token integrity remains strict.
      allowDialogueFormatFallback: true,
      // The prompt-assistant sheet owns its own progress state. A generic
      // pre-generation status would otherwise overwrite the completed media
      // card and linger after this request resolves.
      broadcastStatus: false,
      onPromptJobQueued(pid) {
        updatePromptRevisionRequest(revisionRequest, 'queued', { jobId: pid });
      },
      onPromptJobSettled(pid) {
        if (!revisionRequest?.cancelled && revisionRequest?.jobId === pid) {
          updatePromptRevisionRequest(revisionRequest, 'validating', { jobId: '' });
        }
      },
    };
    const revisionSeed = Math.floor(Math.random() * 2 ** 31);
    try {
      const raw = videoRevision && revisionEngine === 'h3'
        ? await validatedH3Prompt(
          (attempt, validationFeedback) => {
            if (revisionRequest?.cancelled) throw promptRevisionCancellationError();
            updatePromptRevisionRequest(revisionRequest, 'preparing', { attempt: attempt + 1, jobId: '' });
            return reviseVideoPrompt(
              currentPrompt,
              changeRequest,
              revisionSeed + attempt,
              Object.assign({}, revisionOptions, { validationFeedback }),
            );
          },
          currentPrompt || changeRequest,
          Object.assign({}, revisionOptions, {
            referenceSource: `${currentPrompt}\n${changeRequest}`,
            authoredTextSource: currentPrompt,
            // The official H3 guide is optional. A useful rewrite should not
            // be discarded for cosmetic structure differences; only empty
            // output and damaged reference contracts trigger a retry/error.
            advisoryStructure: true,
            useFallbackOnEmpty: false,
            onAdvisoryResult(result) {
              revisionWarnings.push(...result.audit.issues.map((issue) => ({
                code: issue.code,
                message: issue.message,
              })));
              if (revisionRequest) revisionRequest.warnings = revisionWarnings;
            },
          }),
        )
        : (videoRevision
          ? await reviseVideoPrompt(currentPrompt, changeRequest, revisionSeed, revisionOptions)
          : await reviseImagePrompt(currentPrompt, changeRequest, revisionSeed, revisionOptions));
      if (revisionRequest?.cancelled) throw promptRevisionCancellationError();
      const prompt = videoRevision && revisionEngine === 'h3'
        ? String(raw || '').trim()
        : cleanEnhancedText(raw, currentPrompt || changeRequest);
      if (!prompt) {
        const error = new Error('Prompt assistant returned no usable text');
        error.code = 'prompt_empty';
        throw error;
      }
      finishPromptRevisionRequest(revisionRequest, 'done');
      return json(res, 200, { prompt, warnings: revisionWarnings });
    } catch (error) {
      const cancelled = error?.code === 'job_cancelled' || revisionRequest?.cancelled;
      if (revisionRequest) {
        revisionRequest.errorCode = cancelled ? 'job_cancelled' : (error?.code || 'prompt_revision_failed');
        finishPromptRevisionRequest(revisionRequest, cancelled ? 'cancelled' : 'error');
      }
      const status = cancelled ? 409 : (error?.code === 'prompt_timeout' ? 504 : (error?.code === 'h3_prompt_format' ? 422 : 500));
      return json(res, status, {
        error: String(error?.message || error),
        code: cancelled ? 'job_cancelled' : (error?.code || 'prompt_revision_failed'),
        issues: Array.isArray(error?.issues) ? error.issues : undefined,
      });
    }
  }

  if (route === '/api/prompt/provider/test' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can test the shared prompt planner' });
    const provider = configuredExternalLlm();
    const parts = {
      instruction: 'You are checking a prompt-writing connection. Follow the user request exactly.',
      userInput: 'Reply with exactly: Connection ready',
    };
    const text = provider.provider === 'local'
      ? await queueTextEnhancement(parts, Math.floor(Math.random() * 2 ** 31), '', 64, {
        profileId: req.profile.id, broadcastStatus: false,
      })
      : await externalLlmRequest({
        provider: provider.provider,
        model: provider.model,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        instruction: parts.instruction,
        userInput: parts.userInput,
        maxTokens: 64,
      });
    return json(res, 200, {
      ok: true,
      provider: provider.provider,
      model: provider.model,
      response: String(text).trim().slice(0, 120),
    });
  }

  if (route === '/api/prompt/local-models' && req.method === 'GET') {
    try {
      const info = await getObjectInfo(url.searchParams.has('refresh'));
      return json(res, 200, localPromptAiCatalog(info, settings));
    } catch (error) {
      return json(res, 503, {
        error: String(error?.message || error || 'Could not read local prompt models from ComfyUI'),
        code: error?.code || 'local_prompt_models_unavailable',
      });
    }
  }

  if (route === '/api/prompt/local-model/test' && req.method === 'POST') {
    if (!isAdmin()) return json(res, 403, { error: 'Only the owner profile can test the shared local prompt model' });
    try {
      const raw = await queueTextEnhancement({
        instruction: 'Return exactly one <final_prompt> XML element containing the requested text and nothing else.',
        userInput: 'Write exactly: Local prompt model ready',
      }, Math.floor(Math.random() * 2 ** 31), '', 64, {
        profileId: req.profile.id,
        broadcastStatus: false,
      });
      const response = cleanEnhancedText(raw, '');
      if (!response) throw new Error('The selected local model returned no usable text');
      const active = localPromptAiConfig(settings);
      return json(res, 200, { ok: true, model: active.model, type: active.type, response: response.slice(0, 120) });
    } catch (error) {
      return json(res, error?.code === 'prompt_timeout' ? 504 : 409, {
        error: String(error?.message || error || 'The selected local prompt model could not run'),
        code: error?.code || 'local_prompt_model_failed',
      });
    }
  }

  if (route === '/api/debug/models') {
    const info = await getObjectInfo();
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const pick = (cls, field) => ((info[cls]?.input?.required?.[field]?.[0]) || []).filter((n) => n.toLowerCase().includes(q));
    return json(res, 200, {
      unets: pick('UNETLoader', 'unet_name'),
      gguf_unets: pick('UnetLoaderGGUF', 'unet_name'),
      clips: pick('CLIPLoader', 'clip_name'),
      vaes: pick('VAELoader', 'vae_name'),
      loras: pick('LoraLoader', 'lora_name'),
      checkpoints: pick('CheckpointLoaderSimple', 'ckpt_name'),
      clip_visions: pick('CLIPVisionLoader', 'clip_name'),
    });
  }

  if (route === '/api/debug/classes') {
    const info = await getObjectInfo();
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const names = Object.keys(info).filter((k) => k.toLowerCase().includes(q)).slice(0, 60);
    return json(res, 200, { names });
  }

  if (route === '/api/debug/upscale') {
    const info = await getObjectInfo(true);
    const defs = {};
    for (const c of ['SeedVR2LoadDiTModel', 'SeedVR2LoadVAEModel', 'SeedVR2VideoUpscaler', 'UltimateSDUpscale', 'UpscaleModelLoader']) {
      defs[c] = info[c] ? info[c].input : 'MISSING';
    }
    const graph = await buildUpscale('debug.png', { resolution: 2160, preScale: 1, profile: 'sharp', noise: 'low' });
    return json(res, 200, { nodeDefinitions: defs, graphTheAppWouldSend: graph });
  }

  if (route === '/api/debug/animate') {
    const info = await getObjectInfo(true);
    const defs = {};
    for (const c of [...REQUIRED_CLASSES.video, ...REQUIRED_CLASSES.video4k]) {
      if (['LTXVImgToVideoInplace', 'LTXVPreprocess'].includes(c)) {
        defs[c] = info[c] ? info[c].input : 'MISSING'; // full spec incl. tooltips
      } else {
        defs[c] = info[c] ? { required: Object.keys(info[c].input?.required || {}), optional: Object.keys(info[c].input?.optional || {}) } : 'MISSING';
      }
    }
    const graph = await buildAnimate('debug.png', {
      prompt: 'debug motion', enhance: true, frames: 121, fps: 25, fourK: false,
      seed: 1234, W: 704, H: 1280,
    });
    return json(res, 200, { nodeDefinitions: defs, graphTheAppWouldSend: graph });
  }

  if (route === '/api/interrupt' && req.method === 'POST') {
    await comfyFetch('/interrupt', { method: 'POST' });
    return json(res, 200, { ok: true });
  }

  if (route === '/api/queue') {
    const queueNow = Date.now();
    const dependencyDownloadActive = dependencyInstallState.state === 'running'
      && dependencyInstallState.phase === 'downloading-model';
    const activeDownloads = dependencyDownloadActive ? [{
      id: 'dependency-model-download',
      label: dependencyInstallState.filename || dependencyInstallState.message || 'Model download',
      message: dependencyInstallState.message || 'Downloading model',
      filename: dependencyInstallState.filename || '',
      downloaded: Math.max(0, Number(dependencyInstallState.downloaded || 0)),
      downloadTotal: Math.max(0, Number(dependencyInstallState.downloadTotal || 0)),
      downloadMethod: dependencyInstallState.downloadMethod || '',
      downloadStartedAt: dependencyInstallState.downloadStartedAt || dependencyInstallState.updatedAt || queueNow,
      updatedAt: dependencyInstallState.updatedAt || queueNow,
      canCancel: isAdmin(),
    }] : [];
    try {
      const q = await (await comfyFetch('/queue')).json();
      // Other profiles' jobs stay visible (shared GPU) but get redacted labels
      const sanitize = (row) => {
        const job = jobs.get(row.jobId) || externalPromptPreflights.get(row.jobId);
        const owned = !!job && job.profileId === req.profile.id;
        if (job && job.profileId && job.profileId !== req.profile.id) {
          const who = db.profiles.find((p) => p.id === job.profileId);
          return Object.assign({}, row, {
            label: `${who ? who.name : 'Another profile'}'s job`,
            itemId: null, videoId: null, thumbnail: null,
            owned: false,
          });
        }
        return Object.assign({}, row, {
          owned,
          sequenceId: owned && job.params && job.params.editSequence
            ? job.params.editSequence.id
            : (owned && job.videoChunkSequence ? job.videoChunkSequence.id : undefined),
        });
      };
      const markReorderable = (row) => {
        const job = jobs.get(row.jobId);
        return Object.assign(row, {
          reorderable: !!job && !job.completing && job.profileId === req.profile.id && !!job.graph,
        });
      };
      const running = (q.queue_running || []).map((entry) => markReorderable(sanitize(describeQueueEntry(entry, true))));
      const pending = (q.queue_pending || []).map((entry) => markReorderable(sanitize(describeQueueEntry(entry, false))));
      const preparing = [...externalPromptPreflights.values()].map((entry) => markReorderable(sanitize({
        jobId: entry.jobId,
        kind: entry.kind,
        itemId: null,
        thumbnail: entry.thumbnail,
        label: entry.label,
        queuedAt: entry.queuedAt,
        startedAt: entry.queuedAt,
        elapsedMs: Math.max(0, queueNow - entry.queuedAt),
        durationMs: Math.max(0, queueNow - entry.queuedAt),
        preparing: true,
        cancellable: false,
      })));
      const queuedIds = new Set([...running, ...pending].map((row) => row.jobId));
      const now = Date.now();
      const finalizing = [...jobs.entries()]
        .filter(([jobId, job]) => job.completing && !queuedIds.has(jobId))
        .map(([jobId, job]) => markReorderable(sanitize({
          jobId,
          kind: job.kind,
          itemId: job.itemId || null,
          thumbnail: jobThumbnail(job),
          label: jobLabel(job),
          queuedAt: job.enqueuedAt || now,
          startedAt: job.startedAt || job.enqueuedAt || now,
          elapsedMs: jobDurationMs(job, now),
          durationMs: jobDurationMs(job, now),
          finalizing: true,
        })));
      return json(res, 200, {
        ok: true,
        preparing,
        running,
        pending,
        finalizing,
        downloads: activeDownloads,
        health: await queueHealth(running, pending),
        history: db.history.filter((h) => h.profileId === req.profile.id).slice(0, 20).map((entry) => {
          const item = entry.itemId && db.items.find((candidate) => candidate.id === entry.itemId && candidate.profileId === req.profile.id);
          return Object.assign({}, entry, { thumbnail: item && item.file ? '/images/' + encodeURIComponent(item.upscaled || item.file) : null });
        }),
      });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e), preparing: [], running: [], pending: [], finalizing: [], downloads: activeDownloads });
    }
  }

  if (route === '/api/queue/history/clear' && req.method === 'POST') {
    const before = db.history.length;
    db.history = db.history.filter((entry) => entry.profileId !== req.profile.id);
    const cleared = before - db.history.length;
    saveDb();
    broadcast('queueHistoryCleared', { profileId: req.profile.id, cleared });
    return json(res, 200, { ok: true, cleared });
  }

  if (route === '/api/queue/reorder' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const order = Array.isArray(body.order) ? body.order.map((id) => String(id || '')).filter(Boolean) : [];
    const q = await (await comfyFetch('/queue')).json();
    const pendingIds = (q.queue_pending || []).map((entry) => String(entry && entry[1] || '')).filter(Boolean);
    if (!pendingIds.length) return json(res, 409, { error: 'There are no queued jobs to reorder' });
    const requestedSet = new Set(order);
    if (order.length !== pendingIds.length || requestedSet.size !== order.length
      || pendingIds.some((id) => !requestedSet.has(id))) {
      return json(res, 409, { error: 'The queue changed — refresh and try again' });
    }
    for (const pid of order) {
      const job = jobs.get(pid);
      if (!job || job.profileId !== req.profile.id || !job.graph) {
        return json(res, 409, { error: 'Only Mix Studio jobs from this profile can be reordered' });
      }
    }
    await comfyFetch('/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: pendingIds }),
    });
    const mapping = {};
    try {
      for (const oldPid of order) {
        const job = jobs.get(oldPid);
        const newPid = await queuePrompt(job.graph, { profileId: job.profileId });
        jobs.delete(oldPid);
        jobs.set(newPid, Object.assign(job, {
          enqueuedAt: Date.now(),
          startedAt: null,
          requeuedFrom: oldPid,
        }));
        mapping[oldPid] = newPid;
      }
    } catch (error) {
      return json(res, 502, { error: `Could not rebuild the queue: ${error.message}` });
    }
    broadcast('queueReordered', { profileId: req.profile.id });
    return json(res, 200, { ok: true, mapping });
  }

  if (route === '/api/queue/cancel' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const pid = String(body.jobId || '');
    if (!pid) return json(res, 400, { error: 'jobId required' });
    const job = jobs.get(pid);
    if (!job || job.profileId !== req.profile.id) {
      return json(res, 404, { error: 'This job is no longer available' });
    }
    if (job.completing) return json(res, 409, { error: 'This job is already finishing' });
    job.cancelRequested = true;
    job.cancelMessage = 'Cancelled by user';
    // If it is already running, ComfyUI may emit execution_interrupted before
    // this request returns. The cancel marker keeps that event neutral.
    const stillRunning = await stopComfyPrompt(pid);
    // Remove tracking immediately as a polling fallback and to settle any
    // preprocessing request even when the ComfyUI websocket is unavailable.
    cancelJob(pid, job.cancelMessage);
    return json(res, 200, { ok: true, running: stillRunning });
  }

  if (route === '/api/queue/reset' && req.method === 'POST') {
    const clearedJobs = [...jobs.keys()];
    for (const pid of clearedJobs) {
      const job = jobs.get(pid);
      if (!job) continue;
      job.cancelRequested = true;
      job.cancelMessage = 'Stopped by hard reset';
    }
    const reset = [];
    for (const reqInfo of comfyResetRequests()) {
      try {
        await comfyFetch(reqInfo.path, reqInfo.init);
        reset.push({ name: reqInfo.name, ok: true });
      } catch (e) {
        reset.push({ name: reqInfo.name, ok: false, error: String(e.message || e) });
      }
    }
    for (const pid of clearedJobs) {
      cancelJob(pid, 'Stopped by hard reset');
    }
    broadcast('queueReset', { profileId: req.profile.id, reset, clearedJobs: clearedJobs.length });
    return json(res, 200, { ok: true, reset, clearedJobs: clearedJobs.length });
  }

  if (route === '/api/private/status') {
    return json(res, 200, { unlocked: isPrivateUnlocked(req) });
  }

  if (route === '/api/private/unlock' && req.method === 'POST') {
    const body = await readJsonBody(req);
    if (String(body.password || '') !== galleryPassword(settings)) {
      return json(res, 401, { error: 'Wrong gallery password' });
    }
    res.setHeader('Set-Cookie', privateCookie(privateUnlockToken, 60 * 60 * 12));
    return json(res, 200, { unlocked: true });
  }

  if (route === '/api/private/lock' && req.method === 'POST') {
    res.setHeader('Set-Cookie', privateCookie('', 0));
    return json(res, 200, { unlocked: false });
  }

  if (route === '/api/gallery') {
    const unlocked = isPrivateUnlocked(req);
    const revision = `${SERVER_INSTANCE_ID}.${dbRevision}`;
    if (url.searchParams.get('revision') === revision) {
      return json(res, 200, { unchanged: true, revision });
    }
    const view = galleryView(db, unlocked);
    view.items = view.items.filter((it) => it.profileId === req.profile.id);
    view.folders = view.folders.filter((f) => f.profileId === req.profile.id);
    const uploadedAssets = db.uploadedAssets
      .filter((asset) => asset.profileId === req.profile.id && !asset.deletedAt)
      .map(publicUploadedAsset);
    return json(res, 200, Object.assign({ unlocked, uploadedAssets, profile: publicProfile(req.profile, db), revision }, view));
  }

  const uploadedAssetDelete = route.match(/^\/api\/uploaded-assets\/([\w]+)$/);
  if (uploadedAssetDelete && req.method === 'DELETE') {
    const asset = db.uploadedAssets.find((entry) => (
      entry.id === uploadedAssetDelete[1] && entry.profileId === req.profile.id && !entry.deletedAt
    ));
    if (!asset) return json(res, 404, { error: 'Uploaded asset not found' });
    const usage = uploadedAssetUsage(asset, { items: db.items, jobs: [...jobs.values()] });
    if (usage.inUse) {
      const reasons = [];
      if (usage.savedGenerations) reasons.push(`${usage.savedGenerations} saved generation${usage.savedGenerations === 1 ? '' : 's'}`);
      if (usage.activeJobs) reasons.push(`${usage.activeJobs} active job${usage.activeJobs === 1 ? '' : 's'}`);
      return json(res, 409, {
        error: `This asset is still used by ${reasons.join(' and ')}. Remove those references before deleting it.`,
        code: 'asset_in_use',
        usage,
      });
    }
    await serializeMediaDeletion(async () => {
      const durable = inputAssetPath(INPUTS, asset.name);
      const trash = path.join(TRASH_ROOT, 'uploaded-assets', asset.profileId);
      await fsp.mkdir(trash, { recursive: true });
      await fsp.rename(durable, path.join(trash, `${Date.now()}_${path.basename(durable)}`)).catch((error) => {
        if (error && error.code !== 'ENOENT') throw error;
      });
      asset.deletedAt = Date.now();
      saveDb();
    });
    return json(res, 200, { ok: true, id: asset.id });
  }

  if (route === '/api/items/selection-stats' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 500);
    if (!ids.length) return json(res, 400, { error: 'Select at least one generation' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (items.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    let bytes = 0;
    for (const ref of selectionAssetRefs(items)) {
      const base = ref.kind === 'video' ? VIDEOS : IMAGES;
      const full = path.resolve(base, ref.file);
      if (full !== base && !full.startsWith(base + path.sep)) continue;
      try { bytes += (await fsp.stat(full)).size; } catch { /* missing assets do not block the summary */ }
    }
    return json(res, 200, selectionSummary(items, bytes));
  }

  if (route === '/api/items/download' && req.method === 'GET') {
    const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').filter(Boolean))].slice(0, 250);
    if (!ids.length) return json(res, 400, { error: 'Select at least one generation' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    if (items.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const usedNames = new Set();
    const entries = [];
    for (const [index, item] of items.entries()) {
      const file = item.upscaled || item.file;
      const full = path.resolve(IMAGES, file || '');
      if (!file || (full !== IMAGES && !full.startsWith(IMAGES + path.sep))) {
        return json(res, 400, { error: 'A selected generation has an invalid image path' });
      }
      try { await fsp.access(full); } catch { return json(res, 404, { error: 'A selected image file is unavailable' }); }
      const ext = path.extname(file) || '.png';
      const base = generationFileStem(item, `generation-${index + 1}`).replace(/_/g, '-');
      let name = `${base}${ext}`;
      let duplicate = 2;
      while (usedNames.has(name.toLowerCase())) name = `${base}-${duplicate++}${ext}`;
      usedNames.add(name.toLowerCase());
      entries.push({ name, path: full });
    }
    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="mix-studio-selection.zip"',
      'Cache-Control': 'no-store',
    });
    try {
      await streamStoredZip(res, entries);
    } catch (error) {
      if (!res.destroyed) res.destroy(error);
    }
    return;
  }

  if (route === '/api/export' && req.method === 'POST') {
    if (!settings.exportDir) return json(res, 409, { error: 'Choose a default save folder in Preferences first' });
    const body = await readJsonBody(req);
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const requestedIds = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 250);
    const assets = [];
    if (requestedIds.length) {
      const items = requestedIds.map((id) => byId.get(id)).filter(Boolean);
      if (items.length !== requestedIds.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
      for (const [index, item] of items.entries()) {
        const file = item.upscaled || item.file;
        if (file) assets.push({ item, file, base: IMAGES, suffix: item.upscaled ? '_upscaled' : '_original', fallback: `generation-${index + 1}` });
      }
    } else {
      const item = byId.get(String(body.id || ''));
      if (!item) return json(res, 404, { error: 'Generation not found' });
      if (body.asset === 'video') {
        const video = (Array.isArray(item.videos) ? item.videos : []).find((entry) => entry.id === body.videoId);
        if (!video?.file) return json(res, 404, { error: 'Video not found' });
        assets.push({ item, file: video.file, base: VIDEOS, suffix: `_video_${Math.max(1, item.videos.indexOf(video) + 1)}` });
      } else if (body.asset === 'composite') {
        const composite = (Array.isArray(item.composites) ? item.composites : []).find((entry) => entry.id === body.compositeId);
        if (!composite?.file) return json(res, 404, { error: 'Composite not found' });
        assets.push({ item, file: composite.file, base: IMAGES, suffix: `_${String(composite.type || 'composite').replace(/[^a-z0-9]+/gi, '_')}` });
      } else {
        const useOriginal = body.variant === 'original';
        const useUpscaled = body.variant === 'upscaled' || (!useOriginal && item.upscaled);
        const file = useUpscaled ? item.upscaled : item.file;
        if (!file) return json(res, 404, { error: 'Image not found' });
        assets.push({ item, file, base: IMAGES, suffix: useUpscaled ? '_upscaled' : '_original' });
      }
    }
    const saved = [];
    try {
      for (const [index, asset] of assets.entries()) {
        const source = path.resolve(asset.base, asset.file);
        if (source !== asset.base && !source.startsWith(asset.base + path.sep)) throw new Error('Invalid saved asset path');
        await fsp.access(source);
        const extension = path.extname(asset.file) || (asset.base === VIDEOS ? '.mp4' : '.png');
        const stem = generationFileStem(asset.item, asset.fallback || `mix-studio-${index + 1}`);
        const target = await copyToExportDirectory(source, settings.exportDir, `${stem}${asset.suffix}${extension}`);
        saved.push(path.basename(target));
      }
      return json(res, 200, { ok: true, count: saved.length, files: saved, directory: settings.exportDir });
    } catch (error) {
      return json(res, 500, { error: `Could not save to the default folder: ${error.message}` });
    }
  }

  if (route === '/api/export-file' && req.method === 'POST') {
    if (!settings.exportDir) return json(res, 409, { error: 'Choose a default save folder in Preferences first' });
    try {
      const buffer = await readBody(req, 64 * 1024 * 1024);
      if (!buffer.length) return json(res, 400, { error: 'No file received' });
      const requestedName = decodeURIComponent(String(req.headers['x-filename'] || 'mix-studio-export.png'));
      const temporary = path.join(DATA, `.export-${crypto.randomUUID()}.tmp`);
      await fsp.writeFile(temporary, buffer);
      try {
        const target = await copyToExportDirectory(temporary, settings.exportDir, requestedName);
        return json(res, 200, { ok: true, count: 1, files: [path.basename(target)], directory: settings.exportDir });
      } finally {
        await fsp.unlink(temporary).catch(() => {});
      }
    } catch (error) {
      return json(res, 500, { error: `Could not save to the default folder: ${error.message}` });
    }
  }

  if (route === '/api/items/group' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 100);
    if (ids.length < 2) return json(res, 400, { error: 'Choose at least two generations to group' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean);
    if (requested.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const visibleIds = new Set(visible.map((item) => String(item.id)));
    const profileItems = db.items.filter((item) => item.profileId === req.profile.id);
    const connectedMembers = expandGalleryGroupSelection(profileItems, ids);
    if (connectedMembers.some((item) => !visibleIds.has(String(item.id)))) {
      return json(res, 401, { error: 'Unlock the gallery before regrouping these generations' });
    }
    const items = body.includeGroups === true
      ? expandGalleryGroupSelection(visible, ids)
      : requested;
    const generationGroupId = uid();
    items.forEach((item) => {
      item.generationGroupId = generationGroupId;
      delete item.generationGroupName;
    });
    saveDb();
    return json(res, 200, { generationGroupId, count: items.length, items });
  }

  if (route === '/api/items/ungroup' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 100);
    if (!ids.length) return json(res, 400, { error: 'Choose a grouped generation' });
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean);
    if (requested.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const groupIds = new Set(requested.map((item) => item.generationGroupId).filter(Boolean));
    if (!groupIds.size) return json(res, 409, { error: 'The selected generations are not grouped' });
    const visibleIds = new Set(visible.map((item) => String(item.id)));
    const fullMembers = db.items.filter((item) => item.profileId === req.profile.id && groupIds.has(item.generationGroupId));
    if (fullMembers.some((item) => !visibleIds.has(String(item.id)))) {
      return json(res, 401, { error: 'Unlock the gallery before ungrouping this group' });
    }
    let changed = 0;
    for (const item of db.items) {
      if (item.profileId === req.profile.id && groupIds.has(item.generationGroupId)) {
        delete item.generationGroupId;
        delete item.generationGroupName;
        changed += 1;
      }
    }
    saveDb();
    return json(res, 200, { ok: true, groups: groupIds.size, items: changed });
  }

  if (route === '/api/items/move' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(String))].slice(0, 250);
    if (!ids.length) return json(res, 400, { error: 'Choose at least one generation to move' });
    const unlocked = isPrivateUnlocked(req);
    const targetFolder = body.folder || null;
    const allowed = canMoveToFolder(db, targetFolder, unlocked);
    if (!allowed.ok) {
      return json(res, allowed.reason === 'missing' ? 404 : 401, {
        error: allowed.reason === 'missing' ? 'Folder not found' : 'Unlock the gallery first',
      });
    }
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const byId = new Map(visible.map((item) => [item.id, item]));
    const requested = ids.map((id) => byId.get(id)).filter(Boolean);
    if (requested.length !== ids.length) return json(res, 404, { error: 'One or more selected generations are unavailable' });
    const generationGroups = new Set(requested.map((item) => item.generationGroupId).filter(Boolean));
    const angleGroups = new Set(requested.map((item) => item.angleGroupId).filter(Boolean));
    const selectedIds = new Set(ids);
    const items = db.items.filter((item) => item.profileId === req.profile.id && (
      selectedIds.has(item.id)
      || (body.includeGroups === true && item.generationGroupId && generationGroups.has(item.generationGroupId))
      || (body.includeGroups === true && item.angleGroupId && angleGroups.has(item.angleGroupId))
    ));
    const lockedFolders = new Set(db.folders
      .filter((folder) => folder.profileId === req.profile.id && folder.locked)
      .map((folder) => folder.id));
    if (!unlocked && items.some((item) => item.folder !== targetFolder && lockedFolders.has(item.folder))) {
      return json(res, 401, { error: 'Unlock the gallery before moving a group out of a locked folder' });
    }
    items.forEach((item) => { item.folder = targetFolder; });
    saveDb();
    return json(res, 200, { ok: true, moved: items.length, items: items.map((item) => item.id) });
  }

  const ownPreferences = () => db.userPreferences.find((entry) => entry.profileId === req.profile.id) || null;
  if (route === '/api/preferences' && req.method === 'GET') {
    const prefs = ownPreferences();
    return json(res, 200, {
      defaults: normalizeGenerationDefaults(prefs && prefs.defaults),
      assetPicker: normalizeAssetPickerPreferences(prefs && prefs.assetPicker),
      contextOverrides: normalizeContextOverrides(prefs && prefs.contextOverrides),
    });
  }
  if (route === '/api/preferences' && req.method === 'POST') {
    const body = await readJsonBody(req);
    let prefs = ownPreferences();
    if (!prefs) {
      prefs = { profileId: req.profile.id };
      db.userPreferences.push(prefs);
    }
    if (body.defaults) prefs.defaults = normalizeGenerationDefaults(body.defaults);
    if (Object.prototype.hasOwnProperty.call(body, 'assetPicker')) {
      prefs.assetPicker = normalizeAssetPickerPreferences(body.assetPicker);
    }
    if (body.contextOverrides) prefs.contextOverrides = normalizeContextOverrides(body.contextOverrides);
    saveDb();
    return json(res, 200, {
      defaults: normalizeGenerationDefaults(prefs.defaults),
      assetPicker: normalizeAssetPickerPreferences(prefs.assetPicker),
      contextOverrides: normalizeContextOverrides(prefs.contextOverrides),
    });
  }

  if (route === '/api/context') {
    const unlocked = isPrivateUnlocked(req);
    const view = galleryView(db, unlocked);
    const learned = buildLoraContext(view.items.filter((it) => it.profileId === req.profile.id));
    const prefs = ownPreferences();
    return json(res, 200, { loras: mergeContextOverrides(learned, prefs && prefs.contextOverrides) });
  }

  const ownPresets = () => db.loraPresets.filter((pr) => pr.profileId === req.profile.id);
  if (route === '/api/lorapresets' && req.method === 'GET') {
    return json(res, 200, { presets: ownPresets() });
  }
  if (route === '/api/lorapresets' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'Preset name required' });
    const loras = (Array.isArray(body.loras) ? body.loras : [])
      .filter((l) => l && l.name)
      .map((l) => ({
        name: String(l.name),
        strength: Number(l.strength) || 1,
        triggerPhrase: String(l.triggerPhrase || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      }));
    if (!loras.length) return json(res, 400, { error: 'No LoRAs to save' });
    const requestedThumbnail = String(body.thumbnailLora || '');
    const thumbnailLora = loras.some((l) => l.name === requestedThumbnail) ? requestedThumbnail : loras[0].name;
    const existing = ownPresets().find((pr) => pr.name.toLowerCase() === name.toLowerCase());
    if (existing) { existing.loras = loras; existing.thumbnailLora = thumbnailLora; }
    else db.loraPresets.push({ id: uid(), name, loras, thumbnailLora, profileId: req.profile.id });
    saveDb();
    return json(res, 200, { presets: ownPresets() });
  }
  const lpDel = route.match(/^\/api\/lorapresets\/([\w]+)$/);
  if (lpDel && req.method === 'DELETE') {
    db.loraPresets = db.loraPresets.filter((pr) => pr.id !== lpDel[1] || pr.profileId !== req.profile.id);
    saveDb();
    return json(res, 200, { presets: ownPresets() });
  }

  /* Face ID library: named reference faces with a local copy so they
     survive ComfyUI input-folder cleanups. */
  // LoRA thumbnails (global — they describe the model file itself)
  if (route === '/api/lorathumb' && req.method === 'POST') {
    const name = decodeURIComponent(String(req.headers['x-lora-name'] || '')).trim();
    if (!name) return json(res, 400, { error: 'x-lora-name header required' });
    const buf = await readBody(req, 5 * 1024 * 1024);
    if (!buf.length) return json(res, 400, { error: 'No image received' });
    if (db.loraThumbs[name]) fsp.unlink(path.join(LORATHUMBS, db.loraThumbs[name])).catch(() => { /* noop */ });
    const file = `${crypto.createHash('sha1').update(name).digest('hex').slice(0, 16)}_${Date.now()}.jpg`;
    await fsp.writeFile(path.join(LORATHUMBS, file), buf);
    db.loraThumbs[name] = file;
    saveDb();
    return json(res, 200, { loraThumbs: db.loraThumbs });
  }

  const ownFaces = () => db.faces.filter((f) => f.profileId === req.profile.id);
  if (route === '/api/faces' && req.method === 'GET') {
    return json(res, 200, { faces: ownFaces() });
  }
  if (route === '/api/faces' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40) || 'Face';
    const imageName = String(body.imageName || '').trim();
    if (!imageName) return json(res, 400, { error: 'imageName required (upload the face first)' });
    // Pull the uploaded bytes back from ComfyUI's input dir for the local copy
    const parts = imageName.split('/');
    const fn = parts.pop();
    const sub = parts.join('/');
    const r = await comfyFetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=input`);
    const buf = Buffer.from(await r.arrayBuffer());
    const id = uid();
    const file = `${id}.png`;
    await fsp.writeFile(path.join(FACES, file), buf);
    db.faces.unshift({ id, name, file, imageName, createdAt: Date.now(), profileId: req.profile.id });
    saveDb();
    return json(res, 200, { faces: ownFaces() });
  }
  const faceOne = route.match(/^\/api\/faces\/([\w]+)$/);
  if (faceOne && req.method === 'POST') {
    const body = await readJsonBody(req);
    const face = db.faces.find((f) => f.id === faceOne[1] && f.profileId === req.profile.id);
    if (!face) return json(res, 404, { error: 'Face not found' });
    const name = String(body.name || '').trim().slice(0, 40);
    if (name) face.name = name;
    saveDb();
    return json(res, 200, { faces: ownFaces() });
  }
  if (faceOne && req.method === 'DELETE') {
    const face = db.faces.find((f) => f.id === faceOne[1] && f.profileId === req.profile.id);
    if (face) {
      try { await fsp.unlink(path.join(FACES, face.file)); } catch { /* noop */ }
      db.faces = db.faces.filter((f) => f.id !== face.id);
      saveDb();
    }
    return json(res, 200, { faces: ownFaces() });
  }

  if (route === '/api/folders' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return json(res, 400, { error: 'Folder name required' });
    if (db.folders.some((f) => f.profileId === req.profile.id && f.name.toLowerCase() === name.toLowerCase())) {
      return json(res, 400, { error: 'Folder exists' });
    }
    const folder = { id: uid(), name, locked: false, profileId: req.profile.id };
    db.folders.push(folder);
    saveDb();
    return json(res, 200, folder);
  }

  const folderPrivate = route.match(/^\/api\/folders\/([\w]+)\/private$/);
  if (folderPrivate && req.method === 'POST') {
    if (!isPrivateUnlocked(req)) return json(res, 401, { error: 'Unlock the gallery first' });
    const owned = db.folders.find((f) => f.id === folderPrivate[1] && f.profileId === req.profile.id);
    if (!owned) return json(res, 404, { error: 'Folder not found' });
    const body = await readJsonBody(req);
    const folder = setFolderLocked(db, folderPrivate[1], !!body.locked);
    if (!folder) return json(res, 404, { error: 'Folder not found' });
    saveDb();
    return json(res, 200, folder);
  }

  // Merge: move every item from one folder into another, then remove it.
  // Merging a LOCKED source exposes hidden items -> requires unlock first.
  const folderMerge = route.match(/^\/api\/folders\/([\w]+)\/merge$/);
  if (folderMerge && req.method === 'POST') {
    const body = await readJsonBody(req);
    const src = db.folders.find((f) => f.id === folderMerge[1] && f.profileId === req.profile.id);
    if (!src) return json(res, 404, { error: 'Folder not found' });
    const intoId = body.into ? String(body.into) : null;
    const dst = intoId ? db.folders.find((f) => f.id === intoId && f.profileId === req.profile.id) : null;
    if (intoId && !dst) return json(res, 404, { error: 'Destination folder not found' });
    if (intoId === src.id) return json(res, 400, { error: 'Cannot merge a folder into itself' });
    if (src.locked && !isPrivateUnlocked(req)) {
      return json(res, 401, { error: 'Unlock the gallery first — merging a locked folder reveals its items' });
    }
    let moved = 0;
    for (const it of db.items) {
      if (it.profileId === req.profile.id && it.folder === src.id) {
        it.folder = dst ? dst.id : null;
        moved++;
      }
    }
    db.folders = db.folders.filter((f) => f.id !== src.id);
    saveDb();
    return json(res, 200, { ok: true, moved, into: dst ? dst.name : null });
  }

  const folderDel = route.match(/^\/api\/folders\/([\w]+)$/);
  if (folderDel && req.method === 'DELETE') {
    const folder = db.folders.find((f) => f.id === folderDel[1] && f.profileId === req.profile.id);
    if (!folder) return json(res, 404, { error: 'Folder not found' });
    if (folder.locked && !isPrivateUnlocked(req)) {
      return json(res, 401, { error: 'Unlock the gallery first' });
    }
    db.folders = db.folders.filter((f) => f.id !== folderDel[1]);
    for (const it of db.items) if (it.folder === folderDel[1]) it.folder = null;
    saveDb();
    return json(res, 200, { ok: true });
  }

  const vidRoute = route.match(/^\/api\/item\/([\w]+)\/video\/([\w]+)$/);
  if (vidRoute && req.method === 'POST') {
    const item = db.items.find((it) => it.id === vidRoute[1] && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    const video = (item.videos || []).find((entry) => entry.id === vidRoute[2]);
    if (!video) return json(res, 404, { error: 'Video not found' });
    const body = await readJsonBody(req);
    video.liked = body.liked === true;
    saveDb();
    return json(res, 200, item);
  }
  if (vidRoute && req.method === 'DELETE') {
    return serializeMediaDeletion(async () => {
      const item = db.items.find((it) => it.id === vidRoute[1] && it.profileId === req.profile.id);
      if (!item) return json(res, 404, { error: 'Not found' });
      const video = (item.videos || []).find((entry) => entry.id === vidRoute[2]);
      if (!video) return json(res, 404, { error: 'Video not found' });
      const retainedVideos = (item.videos || []).filter((entry) => entry.id !== video.id);
      const retainedItem = Object.assign({}, item, { videos: retainedVideos });
      const remainingItems = db.items.map((entry) => entry.id === item.id ? retainedItem : entry);
      const refs = unreferencedAssetRefs([{ videos: [video] }], remainingItems);
      const trashRoot = path.join(
        TRASH_ROOT, 'profiles', profileOutputFolder(req.profile), 'items', `${Date.now()}_${item.id}_${video.id}`
      );
      try {
        await moveAssetRefsToTrash(refs, { imageRoot: IMAGES, videoRoot: VIDEOS, trashRoot });
      } catch (error) {
        console.error('[trash] video delete failed:', error.message);
        return json(res, 500, { error: 'Could not move this video to trash. Nothing was deleted.' });
      }
      item.videos = retainedVideos;
      saveDb();
      return json(res, 200, item);
    });
  }

  const itemRoute = route.match(/^\/api\/item\/([\w]+)(?:\/(move))?$/);
  const itemGroupRoute = route.match(/^\/api\/item\/([\w]+)\/group$/);
  const likeRoute = route.match(/^\/api\/item\/([\w]+)\/like$/);
  if (itemGroupRoute && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !Object.prototype.hasOwnProperty.call(body, 'name') || typeof body.name !== 'string') {
      return json(res, 400, { error: 'Group name is required' });
    }
    if (!['generation', 'angle'].includes(body.groupType)
      || typeof body.groupId !== 'string'
      || typeof body.expectedName !== 'string'
      || !Array.isArray(body.memberIds)
      || body.memberIds.length < 2
      || body.memberIds.length > 250
      || body.memberIds.some((id) => typeof id !== 'string' || !id)) {
      return json(res, 400, { error: 'Valid group identity is required' });
    }
    const unlocked = isPrivateUnlocked(req);
    const visible = galleryView(db, unlocked).items.filter((item) => item.profileId === req.profile.id);
    const anchor = visible.find((item) => item.id === itemGroupRoute[1]);
    if (!anchor) return json(res, 404, { error: 'Generation group not found' });
    const result = updateGalleryGroupName(db.items, {
      anchor,
      profileId: req.profile.id,
      groupType: body.groupType,
      groupId: body.groupId,
      expectedName: body.expectedName,
      memberIds: body.memberIds,
      name: body.name,
      visibleIds: new Set(visible.map((item) => String(item.id))),
    });
    if (!result.ok) {
      if (result.reason === 'locked') return json(res, 401, { error: 'Unlock the gallery before renaming this group' });
      return json(res, 409, { error: result.reason === 'stale'
        ? 'This gallery group changed before its name could be saved'
        : 'This generation is no longer part of a group' });
    }
    saveDb();
    return json(res, 200, result);
  }
  if (likeRoute && req.method === 'POST') {
    const item = db.items.find((entry) => entry.id === likeRoute[1] && entry.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    const body = await readJsonBody(req);
    item.liked = body.liked === true;
    saveDb();
    return json(res, 200, item);
  }
  if (itemRoute) {
    const item = db.items.find((it) => it.id === itemRoute[1] && it.profileId === req.profile.id);
    if (!item) return json(res, 404, { error: 'Not found' });
    if (!itemRoute[2] && req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!Object.prototype.hasOwnProperty.call(body, 'name')) {
        return json(res, 400, { error: 'Generation name is required' });
      }
      const name = normalizeGenerationName(body.name);
      if (name) item.name = name;
      else delete item.name;
      saveDb();
      return json(res, 200, item);
    }
    if (itemRoute[2] === 'move' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const targetFolder = body.folder || null;
      const allowed = canMoveToFolder(db, targetFolder, isPrivateUnlocked(req));
      if (!allowed.ok) {
        return json(res, allowed.reason === 'missing' ? 404 : 401, {
          error: allowed.reason === 'missing' ? 'Folder not found' : 'Unlock the gallery first',
        });
      }
      item.folder = targetFolder;
      saveDb();
      return json(res, 200, item);
    }
    if (req.method === 'DELETE') {
      return serializeMediaDeletion(async () => {
        const current = db.items.find((entry) => entry.id === itemRoute[1] && entry.profileId === req.profile.id);
        if (!current) return json(res, 404, { error: 'Not found' });
        const remainingItems = db.items.filter((entry) => entry.id !== current.id);
        const refs = unreferencedAssetRefs([current], remainingItems);
        const trashRoot = path.join(
          TRASH_ROOT, 'profiles', profileOutputFolder(req.profile), 'items', `${Date.now()}_${current.id}`
        );
        let moved;
        try {
          moved = await moveAssetRefsToTrash(refs, { imageRoot: IMAGES, videoRoot: VIDEOS, trashRoot });
        } catch (error) {
          console.error('[trash] item delete failed:', error.message);
          return json(res, 500, { error: 'Could not move this generation to trash. Nothing was deleted.' });
        }
        db.items = remainingItems;
        saveDb();
        return json(res, 200, { ok: true, movedToTrash: moved.length });
      });
    }
    return json(res, 200, item);
  }

  json(res, 404, { error: 'Unknown API route' });
}

function jobLabel(job) {
  if (!job) return 'Other ComfyUI job';
  if (job.kind === 'loraHunt') {
    const count = job.huntPlan && job.huntPlan.variants ? job.huntPlan.variants.length : 0;
    return `LoRA Strength Hunt${count ? ` (${count})` : ''}: ${(job.params.prompt || '').slice(0, 55)}`;
  }
  if (job.kind === 'gen') {
    const sequence = job.params.editSequence;
    const prefix = sequence
      ? `Sequential edit ${sequence.index + 1}/${sequence.total}: `
      : (job.params.mode === 'edit' ? 'Edit: ' : 'Create: ');
    return prefix + (job.params.prompt || '').slice(0, 70);
  }
  if (job.kind === 'upscale') return job.upscaleInfo && job.upscaleInfo.engine === 'ultimate' ? 'Upscale (Ultimate SD)' : 'Upscale (SeedVR2)';
  if (job.kind === 'video' && job.videoInfo && job.videoInfo.processed === 'upscale') {
    return `Video upscale (${job.videoInfo.upscaleEngine === 'seedvr2' ? 'SeedVR2' : 'RTX'})`;
  }
  if (job.kind === 'video' && job.videoInfo && job.videoInfo.processed === 'interpolate') return 'Frame interpolation (RIFE)';
  if (job.kind === 'video' && job.videoInfo && job.videoInfo.processed === 'extend') return 'Video extension (LTX 2.3)';
  if (job.kind === 'video' && job.videoChunkSequence) {
    const label = job.videoChunkSequence.type === 'wan-animate2'
      ? 'Wan Animate 2 clip'
      : (job.videoChunkSequence.type === 'long-context' ? 'H3 Long context clip' : 'H3 Turbo chunk');
    return `${label} ${job.videoChunkSequence.index + 1}/${job.videoChunkSequence.segments.length}: `
      + ((job.videoInfo && job.videoInfo.motionPrompt) || '').slice(0, 58);
  }
  if (job.kind === 'video') return 'Video: ' + ((job.videoInfo && job.videoInfo.motionPrompt) || '').slice(0, 70);
  if (job.kind === 'enhance') return 'Prompt enhance';
  if (job.kind === 'motionPrompt') return 'Motion prompt from first frame';
  if (job.kind === 'smartMask') return 'SAM3 smart selection';
  return job.kind;
}

function clampInt(v, min, max, dflt) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}
function clampNum(v, min, max, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

function normalizePromptPresets(value, prompt) {
  const sourcePrompt = String(prompt || '');
  return (Array.isArray(value) ? value : []).slice(0, 16)
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const promptText = String(entry.promptText || '').trim().slice(0, 8000);
      if (!promptText || !sourcePrompt.includes(promptText)) return null;
      const thumbnail = String(entry.thumbnail || '').trim().slice(0, 1000);
      const safeThumbnail = thumbnail.startsWith('/assets/camera-presets/')
        || thumbnail.startsWith('/api/addons/')
        ? thumbnail
        : '';
      return {
        category: String(entry.category || '').trim().slice(0, 120),
        categoryLabel: String(entry.categoryLabel || '').trim().slice(0, 160),
        accent: String(entry.accent || 'violet').trim().slice(0, 40),
        packId: String(entry.packId || '').trim().slice(0, 160),
        presetId: String(entry.presetId || '').trim().slice(0, 160),
        label: String(entry.label || 'Visual preset').trim().slice(0, 240),
        promptText,
        thumbnail: safeThumbnail,
      };
    })
    .filter((entry) => entry && entry.category);
}

const MCP_ASPECT_DIMENSIONS = Object.freeze({
  square: [1024, 1024],
  portrait: [832, 1216],
  landscape: [1216, 832],
  vertical: [768, 1344],
  wide: [1344, 768],
});

function mcpArguments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function mcpPrompt(value) {
  const prompt = String(value || '').trim().slice(0, 8000);
  if (!prompt) {
    const error = new Error('A non-empty prompt is required.');
    error.code = 'prompt_required';
    throw error;
  }
  return prompt;
}

function mcpAspect(value, fallback) {
  const key = String(value || fallback || 'square').toLowerCase();
  return MCP_ASPECT_DIMENSIONS[key] ? key : fallback;
}

async function mcpOwnerApi(profile, route, body) {
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: Object.assign({
      Cookie: `${PROFILE_COOKIE}=${encodeURIComponent(signProfileId(profile.id, AUTH_SECRET))}`,
      Accept: 'application/json',
      Connection: 'close',
    }, body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text || '{}'); } catch { payload = { error: text || `HTTP ${response.status}` }; }
  if (!response.ok) {
    const error = new Error(String(payload.error || `Mix Studio returned HTTP ${response.status}`));
    error.code = String(payload.code || `http_${response.status}`);
    error.details = payload;
    throw error;
  }
  return payload;
}

function mcpRecentGeneration(item) {
  const videos = (item.videos || []).slice(-3).map((video) => ({
    id: video.id,
    createdAt: video.createdAt,
    engine: video.info?.engine || '',
    durationSeconds: Number(video.info?.frames) > 0 && Number(video.info?.fps) > 0
      ? Number(video.info.frames) / Number(video.info.fps)
      : undefined,
    prompt: String(video.info?.refinedMotionPrompt || video.info?.motionPrompt || '').slice(0, 1200),
  }));
  return {
    id: item.id,
    mode: item.mode,
    createdAt: item.createdAt,
    prompt: String(item.refinedPrompt || item.prompt || '').slice(0, 1200),
    width: item.width,
    height: item.height,
    videoCount: (item.videos || []).length,
    videos,
  };
}

async function callSparkMcpTool(name, rawArguments, profile) {
  const args = mcpArguments(rawArguments);
  if (name === 'mix_studio_status') {
    const queue = await mcpOwnerApi(profile, '/api/queue');
    return {
      ok: queue.ok === true,
      running: queue.running || [],
      pending: queue.pending || [],
      finalizing: queue.finalizing || [],
      recentActivity: (queue.history || []).slice(0, 8).map((entry) => ({
        ts: entry.ts, kind: entry.kind, itemId: entry.itemId, label: entry.label,
      })),
      error: queue.error || undefined,
    };
  }
  if (name === 'mix_studio_recent_generations') {
    const limit = clampInt(args.limit, 1, 20, 8);
    const items = db.items
      .filter((item) => item.profileId === profile.id)
      .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0))
      .slice(0, limit)
      .map(mcpRecentGeneration);
    return { count: items.length, items };
  }
  if (name === 'mix_studio_generate_image') {
    const prompt = mcpPrompt(args.prompt);
    const aspect = mcpAspect(args.aspect_ratio, 'square');
    const [width, height] = MCP_ASPECT_DIMENSIONS[aspect];
    const seed = Number(args.seed);
    return mcpOwnerApi(profile, '/api/generate', {
      mode: 't2i', prompt, width, height,
      batch: clampInt(args.batch, 1, 4, 1),
      enhance: args.enhance_prompt === true,
      seed: Number.isSafeInteger(seed) && seed >= 0 ? seed : undefined,
      steps: 8, cfg: 1, krea2Turbo: true, loras: [], regions: [], negativePrompt: '',
    });
  }
  if (name === 'mix_studio_generate_video') {
    const prompt = mcpPrompt(args.prompt);
    const engine = args.engine === 'ltx' ? 'ltx' : 'h3';
    const aspect = mcpAspect(args.aspect_ratio, 'landscape');
    const [width, height] = MCP_ASPECT_DIMENSIONS[aspect];
    const seed = Number(args.seed);
    const turbo = engine === 'h3' && args.turbo === true;
    return mcpOwnerApi(profile, '/api/animate', {
      engine, prompt, width, height,
      seconds: clampNum(args.seconds, 1, engine === 'h3' ? 10 : 20, 5),
      enhance: args.enhance_prompt === true,
      seed: Number.isSafeInteger(seed) && seed >= 0 ? seed : undefined,
      h3Mode: engine === 'h3' ? 'frames' : undefined,
      h3AspectRatio: engine === 'h3' ? width / height : undefined,
      h3ResolutionSize: engine === 'h3' ? 768 : undefined,
      h3Turbo: turbo,
      h3TurboStrength: turbo ? 1 : undefined,
      steps: engine === 'h3' ? (turbo ? h3TurboDefaultSteps(settings, 'frames') : 20) : undefined,
      sageAttention: false,
      fourK: false,
    });
  }
  const error = new Error(`Unknown Mix Studio tool: ${name}`);
  error.code = 'unknown_tool';
  throw error;
}

function sparkTokenMatches(candidate) {
  const expected = String(sparkAccess.token || '');
  const supplied = String(candidate || '');
  if (!sparkAccess.enabled || !expected || supplied.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  } catch { return false; }
}

async function handleSparkMcp(req, res, url) {
  let candidate = '';
  try {
    candidate = decodeURIComponent(url.pathname.slice('/mcp/'.length));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('not found');
  }
  if (candidate.includes('/') || !sparkTokenMatches(candidate)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end('not found');
  }
  const origin = String(req.headers.origin || '');
  if (origin && origin !== 'https://gemini.google.com') {
    return json(res, 403, { error: 'Origin not allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (origin === 'https://gemini.google.com') {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, MCP-Protocol-Version, MCP-Session-Id, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'This MCP endpoint accepts JSON-RPC over POST.' });
  }
  const protocolVersion = String(req.headers['mcp-protocol-version'] || '');
  if (protocolVersion && !SUPPORTED_PROTOCOL_VERSIONS.includes(protocolVersion)) {
    return json(res, 400, { error: `Unsupported MCP protocol version: ${protocolVersion}` });
  }
  const profile = db.profiles.find((entry) => entry.id === sparkAccess.profileId);
  if (!profile || profile.id !== db.profiles[0]?.id) {
    return json(res, 403, { error: 'The configured owner profile is unavailable.' });
  }
  let payload;
  try {
    const body = await readBody(req, 1024 * 1024);
    payload = JSON.parse(body.toString('utf8') || 'null');
  } catch (error) {
    return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  const response = await handleMcpPayload(payload, {
    version: readAppRelease(ROOT).version,
    tools: mcpToolDefinitions(),
    callTool: (name, args) => callSparkMcpTool(name, args, profile),
  });
  if (response === null) {
    res.writeHead(202, { 'Cache-Control': 'no-store' });
    return res.end();
  }
  return json(res, 200, response);
}

/* ------------------------------------------------------------------ */
/* Server                                                              */
/* ------------------------------------------------------------------ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/mcp/')) return await handleSparkMcp(req, res, url);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/images/')) {
      const profile = currentProfile(req);
      if (!profile) return json(res, 401, { error: 'Sign in to view generated media', code: 'auth' });
      const media = safeMediaPath(IMAGES, url.pathname.slice(8));
      if (!media || !canAccessProfileMedia(req, profile, 'image', media.name)) {
        res.writeHead(404); return res.end('not found');
      }
      return serveFile(res, media.file, req.headers.range);
    }
    if (url.pathname.startsWith('/video-previews/')) {
      const profile = currentProfile(req);
      if (!profile) return json(res, 401, { error: 'Sign in to view generated media', code: 'auth' });
      const media = safeMediaPath(VIDEOS, url.pathname.slice('/video-previews/'.length));
      if (!media || !canAccessProfileMedia(req, profile, 'video', media.name)) {
        res.writeHead(404); return res.end('not found');
      }
      try {
        const preview = await cachedVideoPreview(media, {
          size: url.searchParams.get('size'),
          fps: url.searchParams.get('fps'),
        });
        return serveFile(res, preview, req.headers.range);
      } catch (error) {
        const status = error?.code === 'ENOENT' ? 404 : error?.code === 'ffmpeg_unavailable' ? 503 : 422;
        return json(res, status, { error: String(error?.message || 'Video preview unavailable'), code: error?.code || 'video_preview_failed' });
      }
    }
    if (url.pathname.startsWith('/videos/')) {
      const profile = currentProfile(req);
      if (!profile) return json(res, 401, { error: 'Sign in to view generated media', code: 'auth' });
      const media = safeMediaPath(VIDEOS, url.pathname.slice(8));
      if (!media || !canAccessProfileMedia(req, profile, 'video', media.name)) {
        res.writeHead(404); return res.end('not found');
      }
      return serveFile(res, media.file, req.headers.range);
    }
    if (url.pathname.startsWith('/faces/')) {
      const profile = currentProfile(req);
      if (!profile) return json(res, 401, { error: 'Sign in to view profile media', code: 'auth' });
      const media = safeMediaPath(FACES, url.pathname.slice(7));
      if (!media || !canAccessProfileMedia(req, profile, 'face', media.name)) {
        res.writeHead(404); return res.end('not found');
      }
      return serveFile(res, media.file, req.headers.range);
    }
    if (url.pathname.startsWith('/avatars/')) {
      const media = safeMediaPath(AVATARS, url.pathname.slice(9));
      if (!media) { res.writeHead(404); return res.end('not found'); }
      return serveFile(res, media.file, req.headers.range);
    }
    if (url.pathname.startsWith('/lorathumbs/')) {
      const media = safeMediaPath(LORATHUMBS, url.pathname.slice(12));
      if (!media) { res.writeHead(404); return res.end('not found'); }
      return serveFile(res, media.file, req.headers.range);
    }
    let p = url.pathname === '/' ? '/index.html' : url.pathname;
    const publicFile = safeMediaPath(PUBLIC, p.replace(/^\//, ''));
    if (!publicFile) { res.writeHead(404); return res.end('not found'); }
    if (isCriticalPublicAsset(publicFile.name)) {
      return await serveCriticalPublicAsset(res, publicFile.file, publicFile.name);
    }
    return serveFile(res, publicFile.file);
  } catch (e) {
    const cancelled = e && e.code === 'job_cancelled';
    const setupRequired = e && e.code === 'comfy_krea2_update_required';
    const loggedPath = url.pathname.startsWith('/mcp/') ? '/mcp/[redacted]' : url.pathname;
    if (!cancelled) console.error('[error]', req.method, loggedPath, e.message);
    if (!res.headersSent) {
      json(res, cancelled || setupRequired ? 409 : 500, {
        error: String(e.message || e),
        code: cancelled ? 'job_cancelled' : (setupRequired ? e.code : undefined),
      });
    }
  }
});

let restartScheduled = false;
function launchDetachedReplacement() {
  const helper = [
    "const { spawn } = require('child_process');",
    'const [exe, script, cwd] = process.argv.slice(1);',
    "setTimeout(() => { const child = spawn(exe, [script], { cwd, detached: true, stdio: 'ignore', windowsHide: true }); child.unref(); }, 1200);",
  ].join(' ');
  const child = spawn(process.execPath, ['-e', helper, process.execPath, __filename, ROOT], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

function scheduleServerRestartWhenIdle() {
  if (restartScheduled || appUpdateRestartWaitTimer) return;
  const check = async () => {
    appUpdateRestartWaitTimer = null;
    try {
      await assertDesktopIsIdle();
      scheduleServerRestart();
    } catch (error) {
      const retryMs = error?.code === 'desktop_busy' ? 2000 : 5000;
      if (error?.code !== 'desktop_busy') {
        console.error('[update] could not verify the desktop queue before restart:', error.message);
      }
      appUpdateRestartWaitTimer = setTimeout(check, retryMs);
      appUpdateRestartWaitTimer.unref();
    }
  };
  appUpdateRestartWaitTimer = setTimeout(check, 1000);
  appUpdateRestartWaitTimer.unref();
}

function scheduleServerRestart() {
  if (restartScheduled) return;
  if (appUpdateRestartWaitTimer) {
    clearTimeout(appUpdateRestartWaitTimer);
    appUpdateRestartWaitTimer = null;
  }
  restartScheduled = true;
  broadcast('appRestarting', {});
  setTimeout(() => {
    const restartMode = process.env.MIXBOX_RESTART_MODE || process.env.KREASTUDIO_RESTART_MODE;
    if (!['batch', 'launcher'].includes(restartMode)) launchDetachedReplacement();
    for (const client of sseClients.keys()) {
      try { client.end(); } catch { /* noop */ }
    }
    server.close(() => process.exit(75));
    setTimeout(() => process.exit(75), 1000).unref();
  }, 500).unref();
}

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  * Mix Studio running');
  console.log(`    Local:   http://localhost:${PORT}`);
  for (const entry of mobileAccessAddresses(os.networkInterfaces())) {
    const label = entry.tailscale ? 'Tailscale' : 'Phone';
    const note = entry.tailscale ? 'private phone access' : entry.name;
    console.log(`    ${(label + ':').padEnd(11)}http://${entry.address}:${PORT}   (${note})`);
  }
  console.log(`    Profile PIN: ${db.profiles[0]?.pinHash ? 'enabled' : 'not set (optional)'}`);
  console.log(`    ComfyUI: ${settings.comfyUrl}`);
  if (typeof WebSocket === 'undefined') {
    console.log('    Note: Node < 22 detected - live progress disabled (polling fallback).');
  }
  console.log('');
});
