'use strict';

const H3_FRAME_VARIANTS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    label: 'Standard · pruned INT8',
    settingKey: 'h3Unet',
    filename: 'minimax_h3_fl2va_pruned_int8_convrot.safetensors',
    bytes: 20_970_379_616,
    turbo: true,
  }),
  bf16: Object.freeze({
    id: 'bf16',
    label: 'Full BF16 · 66.3 GB',
    settingKey: 'h3Bf16Unet',
    filename: 'minimax_h3_fl2va_bf16.safetensors',
    bytes: 66_280_487_368,
    turbo: true,
  }),
});

const H3_REFERENCE_VARIANTS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    label: 'Standard · pruned INT8',
    settingKey: 'h3RefUnet',
    filename: 'minimax_h3_ref2va_pruned_int8_convrot.safetensors',
    bytes: 20_970_379_616,
    turbo: true,
    requiresPatch: false,
  }),
  bf16: Object.freeze({
    id: 'bf16',
    label: 'Full BF16 · 66.3 GB',
    settingKey: 'h3Bf16RefUnet',
    filename: 'minimax_h3_ref2va_bf16.safetensors',
    bytes: 66_280_487_368,
    turbo: true,
    requiresPatch: false,
  }),
  dyntime: Object.freeze({
    id: 'dyntime',
    label: 'DynTime sQKV · experimental',
    settingKey: 'h3DynTimeRefUnet',
    filename: 'MiniMax-H3_Ref2VA-DT-sQKV-INT8-ConvRot.safetensors',
    bytes: 22_547_376_168,
    turbo: false,
    requiresPatch: true,
  }),
  'dyntime-hq': Object.freeze({
    id: 'dyntime-hq',
    label: 'DynTime sQKV HQ · experimental',
    settingKey: 'h3DynTimeRefHqUnet',
    filename: 'MiniMax-H3_Ref2VA-DT-sQKV-INT8-ConvRot-HQ.safetensors',
    bytes: 30_057_950_776,
    turbo: false,
    requiresPatch: true,
  }),
});

function normalizeH3FrameVariant(value) {
  const id = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(H3_FRAME_VARIANTS, id) ? id : 'standard';
}

function normalizeH3ReferenceVariant(value) {
  const id = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(H3_REFERENCE_VARIANTS, id) ? id : 'standard';
}

function h3FrameVariant(settings = {}) {
  return H3_FRAME_VARIANTS[normalizeH3FrameVariant(settings.h3FrameModelVariant)];
}

function h3ReferenceVariant(settings = {}) {
  return H3_REFERENCE_VARIANTS[normalizeH3ReferenceVariant(settings.h3ReferenceModelVariant)];
}

function configuredVariantName(settings, variant) {
  return String(settings?.[variant.settingKey] || variant.filename).trim() || variant.filename;
}

function h3EffectiveModelName(settings = {}, mode = 'frames') {
  const variant = mode === 'reference' ? h3ReferenceVariant(settings) : h3FrameVariant(settings);
  return configuredVariantName(settings, variant);
}

function h3TurboCompatibility(settings = {}, mode = 'frames') {
  const variant = mode === 'reference' ? h3ReferenceVariant(settings) : h3FrameVariant(settings);
  return variant.turbo
    ? { supported: true, variant: variant.id, reason: '' }
    : {
      supported: false,
      variant: variant.id,
      reason: 'DynTime uses physically separate Q/K/V projections, while the current H3 Turbo adapters target the standard fused QKV layout. Disable Turbo or choose Standard / Full BF16.',
    };
}

function h3VariantSettingDefaults() {
  return {
    h3FrameModelVariant: 'standard',
    h3ReferenceModelVariant: 'standard',
    h3Bf16Unet: H3_FRAME_VARIANTS.bf16.filename,
    h3Bf16RefUnet: H3_REFERENCE_VARIANTS.bf16.filename,
    h3DynTimeRefUnet: H3_REFERENCE_VARIANTS.dyntime.filename,
    h3DynTimeRefHqUnet: H3_REFERENCE_VARIANTS['dyntime-hq'].filename,
  };
}

function activeH3ModelSettingKeys(settings = {}) {
  return new Set([
    h3FrameVariant(settings).settingKey,
    h3ReferenceVariant(settings).settingKey,
    'h3Clip',
    'h3VideoVae',
    'h3AudioVae',
    'h3TurboLora',
    'h3RefTurboLora',
  ]);
}

module.exports = {
  H3_FRAME_VARIANTS,
  H3_REFERENCE_VARIANTS,
  activeH3ModelSettingKeys,
  configuredVariantName,
  h3EffectiveModelName,
  h3FrameVariant,
  h3ReferenceVariant,
  h3TurboCompatibility,
  h3VariantSettingDefaults,
  normalizeH3FrameVariant,
  normalizeH3ReferenceVariant,
};
