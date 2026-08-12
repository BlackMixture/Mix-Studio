'use strict';

const H3_TURBO_LORAS = Object.freeze({
  framesRecommended: 'minimax_h3_turbo_v4_step600_ema.safetensors',
  referenceRecommended: 'minimax_h3_fl2v_lightx2v_turbo_4step_v0.1_comfy_resized_avg_rank_21_bf16.safetensors',
  legacyFrames: 'minimax_h3_turbo_4step_ema_ckpt850.safetensors',
  lightx8: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors',
  lightx4_768p: 'minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors',
});

const H3_TURBO_PRESETS = Object.freeze({
  recommended: Object.freeze({
    id: 'recommended',
    label: 'Recommended',
    framesLora: H3_TURBO_LORAS.framesRecommended,
    referenceLora: H3_TURBO_LORAS.referenceRecommended,
    framesSteps: 6,
    referenceSteps: 6,
  }),
  lightx8: Object.freeze({
    id: 'lightx8',
    label: 'LightX2V v1.0',
    framesLora: H3_TURBO_LORAS.lightx8,
    referenceLora: H3_TURBO_LORAS.lightx8,
    framesSteps: 8,
    referenceSteps: 8,
  }),
  lightx4_768p: Object.freeze({
    id: 'lightx4_768p',
    label: 'LightX2V v1.0 768p',
    framesLora: H3_TURBO_LORAS.lightx4_768p,
    referenceLora: H3_TURBO_LORAS.lightx4_768p,
    framesSteps: 4,
    referenceSteps: 4,
  }),
  legacy: Object.freeze({
    id: 'legacy',
    label: 'Legacy Frames',
    framesLora: H3_TURBO_LORAS.legacyFrames,
    referenceLora: H3_TURBO_LORAS.referenceRecommended,
    framesSteps: 4,
    referenceSteps: 6,
  }),
});

function turboBasename(value) {
  return String(value || '').trim().replace(/\\/g, '/').split('/').pop().toLowerCase();
}

function configuredH3TurboLora(settings = {}, mode = 'frames') {
  const key = mode === 'reference' ? 'h3RefTurboLora' : 'h3TurboLora';
  const fallback = mode === 'reference'
    ? H3_TURBO_LORAS.referenceRecommended
    : H3_TURBO_LORAS.framesRecommended;
  return String(settings[key] || '').trim() || fallback;
}

function h3TurboPreset(settings = {}) {
  const frames = turboBasename(configuredH3TurboLora(settings, 'frames'));
  const reference = turboBasename(configuredH3TurboLora(settings, 'reference'));
  return Object.values(H3_TURBO_PRESETS).find((preset) => (
    turboBasename(preset.framesLora) === frames
      && turboBasename(preset.referenceLora) === reference
  )) || Object.freeze({
    id: 'custom',
    label: 'Custom',
    framesLora: configuredH3TurboLora(settings, 'frames'),
    referenceLora: configuredH3TurboLora(settings, 'reference'),
    framesSteps: h3TurboDefaultSteps(settings, 'frames'),
    referenceSteps: h3TurboDefaultSteps(settings, 'reference'),
  });
}

function h3TurboDefaultSteps(settings = {}, mode = 'frames') {
  const lora = turboBasename(configuredH3TurboLora(settings, mode));
  if (lora === turboBasename(H3_TURBO_LORAS.lightx8)) return 8;
  if (lora === turboBasename(H3_TURBO_LORAS.lightx4_768p)) return 4;
  if (mode !== 'reference' && lora === turboBasename(H3_TURBO_LORAS.legacyFrames)) return 4;
  return 6;
}

function h3TurboUsesStandardLoader(settings = {}, mode = 'frames') {
  if (mode === 'reference') return true;
  const lora = turboBasename(configuredH3TurboLora(settings, mode));
  return [H3_TURBO_LORAS.lightx8, H3_TURBO_LORAS.lightx4_768p]
    .some((filename) => lora === turboBasename(filename));
}

function h3TurboReferenceIsExperimental(settings = {}) {
  const lora = turboBasename(configuredH3TurboLora(settings, 'reference'));
  return [H3_TURBO_LORAS.lightx8, H3_TURBO_LORAS.lightx4_768p]
    .some((filename) => lora === turboBasename(filename));
}

function h3TurboSigmaShifts(settings = {}, mode = 'frames') {
  const lora = turboBasename(configuredH3TurboLora(settings, mode));
  return lora === turboBasename(H3_TURBO_LORAS.lightx4_768p)
    ? Object.freeze({ video: 6, audio: 3 })
    : Object.freeze({ video: 12, audio: 3 });
}

function h3TurboFixedCanvas(settings = {}, mode = 'frames') {
  const lora = turboBasename(configuredH3TurboLora(settings, mode));
  return lora === turboBasename(H3_TURBO_LORAS.lightx4_768p)
    ? Object.freeze({ width: 1344, height: 768, aspectRatio: 16 / 9, resolutionSize: 1.75 })
    : null;
}

module.exports = {
  H3_TURBO_LORAS,
  H3_TURBO_PRESETS,
  configuredH3TurboLora,
  h3TurboDefaultSteps,
  h3TurboFixedCanvas,
  h3TurboPreset,
  h3TurboReferenceIsExperimental,
  h3TurboSigmaShifts,
  h3TurboUsesStandardLoader,
  turboBasename,
};
