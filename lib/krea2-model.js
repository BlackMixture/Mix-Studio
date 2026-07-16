'use strict';

const KREA2_VARIANTS = Object.freeze({
  fp8: Object.freeze({
    id: 'fp8',
    label: 'FP8 · standard loader',
    loader: 'standard',
    turbo: 'krea2_turbo_fp8_scaled.safetensors',
    raw: 'krea2_raw_fp8_scaled.safetensors',
  }),
  'int8-convrot': Object.freeze({
    id: 'int8-convrot',
    label: 'INT8 ConvRot · optimized 8-bit',
    loader: 'standard',
    turbo: 'krea2_turbo_int8_convrot.safetensors',
    raw: 'krea2_raw_int8_convrot.safetensors',
  }),
});

function variantFromFilename(value) {
  const name = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (name.includes('int8') && name.includes('convrot')) return 'int8-convrot';
  if (name.includes('fp8')) return 'fp8';
  return '';
}

function normalizeKrea2Variant(value, settings = {}) {
  // A manually selected model filename is authoritative. This keeps older
  // settings files usable even though they predate the explicit variant key.
  const inferred = variantFromFilename(settings.unet) || variantFromFilename(settings.krea2RawUnet);
  if (inferred) return inferred;
  return Object.prototype.hasOwnProperty.call(KREA2_VARIANTS, value) ? value : 'fp8';
}

function krea2VariantSettings(value) {
  const id = Object.prototype.hasOwnProperty.call(KREA2_VARIANTS, value) ? value : 'fp8';
  const variant = KREA2_VARIANTS[id];
  return {
    krea2ModelVariant: variant.id,
    unet: variant.turbo,
    krea2RawUnet: variant.raw,
  };
}

function recommendedKrea2Variant(hardware = {}) {
  const gpu = hardware.gpu && typeof hardware.gpu === 'object' ? hardware.gpu : {};
  const vram = Number(hardware.vramGb ?? gpu.vramGb ?? 0);
  // Offer the alternate 8-bit path on constrained machines. It is primarily
  // a compute optimization (especially on Ampere), not a smaller file than FP8.
  // Unknown hardware stays on the broadly compatible FP8 path.
  return vram > 0 && vram < 16 ? 'int8-convrot' : 'fp8';
}

function buildKrea2ModelLoader(settings = {}, modelName) {
  const unetName = String(modelName || settings.unet || '').trim();
  // Comfy-Org's current INT8 ConvRot files use ComfyUI's native comfy_quant
  // metadata, so both FP8 and INT8 variants belong on the standard loader.
  return { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } };
}

module.exports = {
  KREA2_VARIANTS,
  buildKrea2ModelLoader,
  krea2VariantSettings,
  normalizeKrea2Variant,
  recommendedKrea2Variant,
  variantFromFilename,
};
