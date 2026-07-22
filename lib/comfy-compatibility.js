'use strict';

const fs = require('fs');
const path = require('path');

const KREA2_MIN_VERSION = '0.26.0';
const NATIVE_INT8_MIN_VERSION = '0.27.0';

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

module.exports = {
  KREA2_MIN_VERSION,
  NATIVE_INT8_MIN_VERSION,
  compareVersions,
  detectNativeInt8Compatibility,
  krea2ClipCompatibility,
  krea2ClipCompatibilityError,
  nativeInt8Compatibility,
  nativeInt8CompatibilityError,
  normalizeVersion,
  objectInfoComboChoices,
  versionFromInstall,
  versionFromSystemStats,
};
