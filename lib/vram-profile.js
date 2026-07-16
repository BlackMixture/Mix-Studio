'use strict';

const VRAM_PROFILES = Object.freeze(['auto', 'low', 'standard']);
const LOW_VRAM_MAX_PIXELS = 1024 * 1024;

function normalizeVramProfile(value) {
  return VRAM_PROFILES.includes(value) ? value : 'auto';
}

function recommendedVramProfile(hardware = {}) {
  const gpu = hardware.gpu && typeof hardware.gpu === 'object' ? hardware.gpu : {};
  const vramGb = Number(hardware.vramGb ?? gpu.vramGb ?? 0);
  return vramGb > 0 && vramGb <= 12 ? 'low' : 'standard';
}

function resolveVramProfile(value, hardware = {}) {
  const configured = normalizeVramProfile(value);
  return configured === 'auto' ? recommendedVramProfile(hardware) : configured;
}

function lowVramDimensions(width, height, maxPixels = LOW_VRAM_MAX_PIXELS) {
  const originalWidth = Math.max(64, Math.round(Number(width) || 1024));
  const originalHeight = Math.max(64, Math.round(Number(height) || 1024));
  if (originalWidth * originalHeight <= maxPixels) {
    return { width: originalWidth, height: originalHeight, adjusted: false };
  }
  const scale = Math.sqrt(maxPixels / (originalWidth * originalHeight));
  const widthStep = Math.max(64, Math.floor((originalWidth * scale) / 64) * 64);
  const heightStep = Math.max(64, Math.floor((originalHeight * scale) / 64) * 64);
  return { width: widthStep, height: heightStep, adjusted: true };
}

function applyLowVramImageLimits(params = {}) {
  const dimensions = lowVramDimensions(params.width, params.height);
  const requestedBatch = Math.max(1, Math.round(Number(params.batch) || 1));
  const adjustments = [];
  if (dimensions.adjusted) adjustments.push(`Resolution reduced to ${dimensions.width} × ${dimensions.height}`);
  if (requestedBatch > 1) adjustments.push('Batch reduced to 1');
  return {
    params: Object.assign({}, params, {
      width: dimensions.width,
      height: dimensions.height,
      batch: 1,
    }),
    adjustments,
  };
}

module.exports = {
  LOW_VRAM_MAX_PIXELS,
  VRAM_PROFILES,
  applyLowVramImageLimits,
  lowVramDimensions,
  normalizeVramProfile,
  recommendedVramProfile,
  resolveVramProfile,
};
