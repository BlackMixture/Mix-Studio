'use strict';

const APPLE_UNSUPPORTED_ENGINES = Object.freeze({
  eros: '10Eros currently requires FP8 checkpoint and text-encoder operations that Apple Metal cannot execute.',
  wan: 'Wan 2.2 currently uses curated FP8 model and text-encoder files that Apple Metal cannot execute.',
  scail: 'SCAIL 2 currently uses a curated FP8 Wan model that Apple Metal cannot execute.',
});

const APPLE_UNSUPPORTED_COMPONENTS = Object.freeze({
  eros: APPLE_UNSUPPORTED_ENGINES.eros,
  wan: APPLE_UNSUPPORTED_ENGINES.wan,
  scail: APPLE_UNSUPPORTED_ENGINES.scail,
  scailinfinity: APPLE_UNSUPPORTED_ENGINES.scail,
});

const APPLE_LTX_REFINE_TOKEN_LIMIT = 45_000;
const GENERAL_LTX_REFINE_TOKEN_LIMIT = 200_000;

function appleGenerationProfile(profile = {}) {
  const vendor = String(profile.gpuVendor || profile.vendor || '').toLowerCase();
  const backend = String(profile.gpuBackend || profile.backend || '').toLowerCase();
  return vendor === 'apple' || backend === 'mps';
}

function fp8Model(value) {
  return /(?:^|[_.-])fp8(?:[_.-]|$)|float8|e4m3/i.test(String(value || ''));
}

function videoEngineCapabilities(profile = {}) {
  const apple = appleGenerationProfile(profile);
  const result = {};
  for (const engine of ['ltx', 'ltx-edit', 'eros', 'wan', 'scail']) {
    const reason = apple ? APPLE_UNSUPPORTED_ENGINES[engine] : '';
    result[engine] = {
      supported: !reason,
      reason,
      requiresBf16: apple && (engine === 'ltx' || engine === 'ltx-edit'),
    };
  }
  return result;
}

function configuredVideoEngineCapability(engine, profile = {}, settings = {}) {
  const base = videoEngineCapabilities(profile)[engine] || { supported: true, reason: '', requiresBf16: false };
  if (!base.supported) return base;
  if (base.requiresBf16 && fp8Model(settings.ltxCkpt)) {
    return {
      supported: false,
      requiresBf16: true,
      reason: 'LTX 2.3 on Apple Silicon needs the official BF16 checkpoint. Open Generation Setup and install the LTX workflow to select it.',
    };
  }
  return base;
}

function configuredVideoEngineCapabilities(profile = {}, settings = {}) {
  return Object.fromEntries(['ltx', 'ltx-edit', 'eros', 'wan', 'scail']
    .map((engine) => [engine, configuredVideoEngineCapability(engine, profile, settings)]));
}

function dependencyComponentBlock(componentId, profile = {}) {
  if (!appleGenerationProfile(profile)) return '';
  return APPLE_UNSUPPORTED_COMPONENTS[componentId] || '';
}

function ltxRefineTokenCount(width, height, frames) {
  const spatial = Math.ceil(Math.max(1, Number(width) || 1) / 32)
    * Math.ceil(Math.max(1, Number(height) || 1) / 32);
  const temporal = Math.ceil(Math.max(1, Number(frames) || 1) / 8);
  return spatial * temporal;
}

function ltxRefinePreflight({ width, height, frames, fps, profile = {} } = {}) {
  const spatial = Math.ceil(Math.max(1, Number(width) || 1) / 32)
    * Math.ceil(Math.max(1, Number(height) || 1) / 32);
  const tokens = ltxRefineTokenCount(width, height, frames);
  const limit = appleGenerationProfile(profile)
    ? APPLE_LTX_REFINE_TOKEN_LIMIT
    : GENERAL_LTX_REFINE_TOKEN_LIMIT;
  if (tokens <= limit) return { ok: true, tokens, limit };

  const temporalGroups = Math.max(1, Math.floor(limit / spatial));
  const maxFrames = Math.max(1, (temporalGroups - 1) * 8 + 1);
  const rate = Math.max(1, Number(fps) || 25);
  const maxSeconds = Math.max(1, Math.floor(((maxFrames - 1) / rate) * 10) / 10);
  return {
    ok: false,
    tokens,
    limit,
    maxFrames,
    maxSeconds,
    error: `This refined LTX request is too large for the connected generation device. Use ${maxSeconds} seconds or less at ${width} × ${height}, or lower the output size.`,
  };
}

module.exports = {
  APPLE_LTX_REFINE_TOKEN_LIMIT,
  APPLE_UNSUPPORTED_COMPONENTS,
  APPLE_UNSUPPORTED_ENGINES,
  GENERAL_LTX_REFINE_TOKEN_LIMIT,
  appleGenerationProfile,
  configuredVideoEngineCapability,
  configuredVideoEngineCapabilities,
  dependencyComponentBlock,
  fp8Model,
  ltxRefinePreflight,
  ltxRefineTokenCount,
  videoEngineCapabilities,
};
