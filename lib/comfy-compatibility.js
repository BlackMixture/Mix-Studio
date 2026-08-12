'use strict';

const fs = require('fs');
const path = require('path');

const KREA2_MIN_VERSION = '0.26.0';
const NATIVE_INT8_MIN_VERSION = '0.27.0';
const MINIMAX_H3_MIN_VERSION = '0.30.0';
const LTX25_SUPPORT_PR_URL = 'https://github.com/Comfy-Org/ComfyUI/pull/15499';
const MINIMAX_H3_NATIVE_NODES = Object.freeze([
  'MiniMaxH3ImageToVideo',
  'MiniMaxH3ReferenceToVideo',
  'VAEDecodeAudio',
]);
const LTX25_NATIVE_NODES = Object.freeze([
  'LTXVDualCFGGuider',
  'LTXVAddGuide',
  'LTXVCropGuides',
  'LTXVScheduler',
  'LTXVSpatioTemporalGuidance',
  'LTXVModalityGuidance',
]);

function normalizeVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}` : '';
}

function compareVersions(left, right) {
  const a = normalizeVersion(left).split('.').map(Number);
  const b = normalizeVersion(right).split('.').map(Number);
  if (a.length !== 3 || b.length !== 3) return null;
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

function versionFromSystemStats(stats = {}) {
  return normalizeVersion(
    stats?.system?.comfyui_version
    || stats?.system?.comfy_version
    || stats?.comfyui_version
    || stats?.version
  );
}

function versionFromInstall(basePath, fsImpl = fs, pathImpl = path) {
  if (!basePath) return '';
  const candidates = [
    pathImpl.join(basePath, 'comfyui_version.py'),
    pathImpl.join(basePath, 'ComfyUI', 'comfyui_version.py'),
  ];
  for (const file of candidates) {
    try {
      const source = fsImpl.readFileSync(file, 'utf8');
      const match = source.match(/__version__\s*=\s*["']([^"']+)["']/);
      const version = normalizeVersion(match && match[1]);
      if (version) return version;
    } catch { /* try the next known layout */ }
  }
  return '';
}

function nativeInt8Compatibility(stats, basePath, options = {}) {
  const version = versionFromSystemStats(stats)
    || versionFromInstall(basePath, options.fsImpl, options.pathImpl);
  const comparison = version ? compareVersions(version, NATIVE_INT8_MIN_VERSION) : null;
  return {
    version,
    minimumVersion: NATIVE_INT8_MIN_VERSION,
    supported: comparison === null ? null : comparison >= 0,
  };
}

function nativeInt8CompatibilityError(compatibility = {}) {
  const minimum = compatibility.minimumVersion || NATIVE_INT8_MIN_VERSION;
  if (compatibility.version) {
    return `Krea 2 INT8 ConvRot needs ComfyUI ${minimum} or newer. This installation reports ${compatibility.version}. Update ComfyUI and reconnect it, or select the Krea 2 FP8 variant.`;
  }
  return `Mix Studio could not verify native INT8 ConvRot support. Start or update ComfyUI ${minimum} or newer and check again, or select the Krea 2 FP8 variant.`;
}

function objectInfoComboChoices(info, className, field) {
  const spec = info?.[className]?.input?.required?.[field]
    || info?.[className]?.input?.optional?.[field];
  if (!Array.isArray(spec)) return [];
  if (Array.isArray(spec[0])) return spec[0];
  return spec[0] === 'COMBO' && Array.isArray(spec[1]?.options) ? spec[1].options : [];
}

function krea2ClipCompatibility(info, version = '') {
  const choices = objectInfoComboChoices(info, 'CLIPLoader', 'type');
  return {
    version: normalizeVersion(version),
    minimumVersion: KREA2_MIN_VERSION,
    clipType: 'krea2',
    supported: choices.length ? choices.includes('krea2') : null,
  };
}

function krea2ClipCompatibilityError(compatibility = {}) {
  const minimum = compatibility.minimumVersion || KREA2_MIN_VERSION;
  const version = normalizeVersion(compatibility.version);
  return version
    ? `Krea 2 needs ComfyUI ${minimum} or newer. This installation reports ${version} and its CLIP loader does not support Krea 2. Update ComfyUI, restart it, then run Check again in Generation setup.`
    : `The connected ComfyUI core does not support Krea 2 yet. Update ComfyUI to ${minimum} or newer, restart it, then run Check again in Generation setup.`;
}

function minimaxH3Compatibility(info, version = '') {
  const normalizedVersion = normalizeVersion(version);
  const missingNodes = info && typeof info === 'object'
    ? MINIMAX_H3_NATIVE_NODES.filter((className) => !info[className])
    : [];
  const clipTypes = info && typeof info === 'object'
    ? objectInfoComboChoices(info, 'CLIPLoader', 'type')
    : [];
  const missingClipType = clipTypes.length > 0 && !clipTypes.includes('minimax');
  let supported = null;
  if (info && typeof info === 'object') {
    supported = missingNodes.length === 0 && !missingClipType;
  } else if (normalizedVersion) {
    const comparison = compareVersions(normalizedVersion, MINIMAX_H3_MIN_VERSION);
    supported = comparison === null ? null : comparison >= 0;
  }
  return {
    version: normalizedVersion,
    minimumVersion: MINIMAX_H3_MIN_VERSION,
    supported,
    missingNodes,
    missingClipType,
    nativeAudioSampling: minimaxH3NativeAudioSampling(info),
  };
}

function minimaxH3NativeAudioSampling(info) {
  // ComfyUI's native AV schedule fix kept the same API class ID but renamed
  // the node when ModelSamplingAV landed. The older node already exposed a
  // shift_audio input, so its schema alone cannot distinguish the two cores.
  return String(info?.MiniMaxH3SigmaShift?.display_name || '').trim() === 'ModelSamplingMiniMaxH3';
}

function minimaxH3CompatibilityError(compatibility = {}) {
  const minimum = compatibility.minimumVersion || MINIMAX_H3_MIN_VERSION;
  const version = normalizeVersion(compatibility.version);
  if (version) {
    return `MiniMax H3 needs ComfyUI ${minimum} or newer with its native H3 nodes. This installation reports ${version}. Update ComfyUI, restart it, then run Check again in Generation setup.`;
  }
  return `Mix Studio could not verify MiniMax H3 support. Start or update ComfyUI ${minimum} or newer, restart it, then run Check again in Generation setup.`;
}

function ltx25Compatibility(info, version = '') {
  const normalizedVersion = normalizeVersion(version);
  const missingNodes = info && typeof info === 'object'
    ? LTX25_NATIVE_NODES.filter((className) => !info[className])
    : [];
  const clipTypes = info && typeof info === 'object'
    ? objectInfoComboChoices(info, 'CLIPLoader', 'type')
    : [];
  const missingClipType = clipTypes.length > 0 && !clipTypes.includes('ltxv');
  // LTX 2.5 landed after ComfyUI 0.31.0. Never infer support from a version
  // number: a build is ready only when it exposes the native graph contract.
  const supported = info && typeof info === 'object'
    ? missingNodes.length === 0 && !missingClipType
    : null;
  return {
    version: normalizedVersion,
    supportPrUrl: LTX25_SUPPORT_PR_URL,
    supported,
    missingNodes,
    missingClipType,
  };
}

function ltx25CompatibilityError(compatibility = {}) {
  const version = normalizeVersion(compatibility.version);
  return `This${version ? ` ComfyUI ${version}` : ' ComfyUI build'} does not expose the current native LTX 2.5 nodes. Update ComfyUI to the latest stable build, restart it, then run Check again in Generation Setup.`;
}

async function detectNativeInt8Compatibility(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const comfyUrl = String(options.comfyUrl || '').trim().replace(/\/+$/, '');
  let stats = null;
  if (comfyUrl && typeof fetchImpl === 'function') {
    try {
      const timeoutMs = Math.max(250, Number(options.timeoutMs) || 4000);
      const response = await fetchImpl(`${comfyUrl}/system_stats`, {
        signal: options.signal || AbortSignal.timeout(timeoutMs),
      });
      if (response && response.ok !== false) stats = await response.json();
    } catch { /* fall back to the source-install version file */ }
  }
  return nativeInt8Compatibility(stats, options.basePath, options);
}

async function detectMiniMaxH3Compatibility(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const comfyUrl = String(options.comfyUrl || '').trim().replace(/\/+$/, '');
  let stats = null;
  let info = null;
  if (comfyUrl && typeof fetchImpl === 'function') {
    const timeoutMs = Math.max(250, Number(options.timeoutMs) || 4000);
    try {
      const response = await fetchImpl(`${comfyUrl}/system_stats`, {
        signal: options.signal || AbortSignal.timeout(timeoutMs),
      });
      if (response && response.ok !== false) stats = await response.json();
    } catch { /* use the source-install version below */ }
    try {
      const response = await fetchImpl(`${comfyUrl}/object_info`, {
        signal: options.signal || AbortSignal.timeout(timeoutMs),
      });
      if (response && response.ok !== false) info = await response.json();
    } catch { /* an offline source install can still be checked by version */ }
  }
  const version = versionFromSystemStats(stats)
    || versionFromInstall(options.basePath, options.fsImpl, options.pathImpl);
  return minimaxH3Compatibility(info, version);
}

module.exports = {
  KREA2_MIN_VERSION,
  LTX25_NATIVE_NODES,
  LTX25_SUPPORT_PR_URL,
  MINIMAX_H3_MIN_VERSION,
  MINIMAX_H3_NATIVE_NODES,
  NATIVE_INT8_MIN_VERSION,
  compareVersions,
  detectMiniMaxH3Compatibility,
  detectNativeInt8Compatibility,
  krea2ClipCompatibility,
  krea2ClipCompatibilityError,
  ltx25Compatibility,
  ltx25CompatibilityError,
  minimaxH3Compatibility,
  minimaxH3CompatibilityError,
  minimaxH3NativeAudioSampling,
  nativeInt8Compatibility,
  nativeInt8CompatibilityError,
  normalizeVersion,
  objectInfoComboChoices,
  versionFromInstall,
  versionFromSystemStats,
};
