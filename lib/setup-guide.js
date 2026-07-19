'use strict';

const fs = require('fs');
const path = require('path');

const QUICK_SETUP_COMPONENTS = Object.freeze([
  'image',
  'krea2depth',
  'krea2style',
  'regional',
  'krea2ref',
  'krea2outpaint',
  'smartmask',
  'upscale',
]);

const FEATURE_COMPONENTS = Object.freeze({
  'core.image': ['image', 'krea2depth', 'krea2style', 'upscale'],
  'edit.klein4': ['klein4', 'editoutpaint'],
  'edit.klein9': ['klein9', 'smartmask', 'editoutpaint'],
  'edit.qwen': ['qwen', 'smartmask', 'editoutpaint'],
  'edit.krea2': ['regional', 'smartmask', 'editoutpaint'],
  'edit.krea2ref': ['krea2ref', 'krea2outpaint'],
  'video.ltx': ['video', 'faceid'],
  'video.ltxEdit': ['videoedit'],
  'video.eros': ['eros'],
  'video.wan': ['wan'],
  'video.scail': ['scail', 'scailinfinity'],
});

const FIT_PRIORITY = Object.freeze({ unknown: 0, difficult: 1, limited: 2, recommended: 3 });

function readJson(file, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function normalizeSetupUrl(value) {
  const text = String(value || 'http://127.0.0.1:8188').trim().replace(/\/+$/, '');
  let parsed;
  try { parsed = new URL(text); } catch { throw new Error('Enter a full ComfyUI URL beginning with http:// or https://.'); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error('Enter a full ComfyUI URL beginning with http:// or https://.');
  }
  return text;
}

function normalizeOptionalDirectory(value, label, options = {}) {
  const pathImpl = options.pathImpl || path;
  const text = String(value || '').trim();
  if (!text) return '';
  if (!pathImpl.isAbsolute(text)) throw new Error(`${label} must be an absolute folder path.`);
  return pathImpl.resolve(text);
}

function bytesToGb(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes > 0 ? Math.round((bytes / (1024 ** 3)) * 10) / 10 : 0;
}

function setupHardwareProfile(info = {}) {
  const devices = Array.isArray(info?.gpu?.devices) ? info.gpu.devices : [];
  const device = devices.reduce((best, entry) => (
    Number(entry?.memoryBytes || 0) > Number(best?.memoryBytes || 0) ? entry : best
  ), null);
  return {
    gpuAvailable: !!info?.gpu?.available,
    gpuName: String(device?.name || ''),
    vramGb: bytesToGb(device?.memoryBytes),
    memoryGb: bytesToGb(info?.memory?.totalBytes),
    diskFreeGb: bytesToGb(info?.disk?.freeBytes),
  };
}

function featureHardwareFit(feature = {}, hardwareInfo = {}) {
  const rules = feature.hardware || {};
  const profile = setupHardwareProfile(hardwareInfo);
  const variant = String(feature.variant || 'Curated model variant');
  const minimumVram = Number(rules.minimumVramGb || 0);
  const recommendedVram = Number(rules.recommendedVramGb || minimumVram);
  if (!Object.keys(rules).length) {
    return { level: 'unknown', label: 'Check requirements', detail: `${variant}. Hardware guidance is unavailable.`, variant };
  }
  if (!profile.gpuAvailable) {
    return { level: 'difficult', label: 'NVIDIA GPU required', detail: `${variant}. No NVIDIA GPU was detected, so this workflow is likely to fail.`, variant };
  }
  if (!profile.vramGb) {
    return { level: 'unknown', label: 'VRAM unknown', detail: `${variant}. The guided offload tier starts at ${minimumVram} GB VRAM; ${recommendedVram} GB is recommended.`, variant };
  }
  const belowMinimum = profile.vramGb < minimumVram;
  if (belowMinimum) {
    return { level: 'difficult', label: 'Below guided tier', detail: `${variant}. ${minimumVram} GB guided VRAM tier; ${profile.vramGb} GB detected. Installation remains available, but stronger offloading, very long runs, or out-of-memory errors are likely.`, variant };
  }
  const belowRecommended = profile.vramGb < recommendedVram;
  if (belowRecommended) {
    return { level: 'limited', label: 'Can run with offload', detail: `${variant}. ${recommendedVram} GB VRAM is recommended. Expect slower generation and system-memory use.`, variant };
  }
  return { level: 'recommended', label: 'Recommended for this PC', detail: `${variant}. Meets the ${recommendedVram} GB VRAM recommendation.`, variant };
}

function componentHardwareGuidance(manifest = {}, hardwareInfo = {}) {
  const guidance = {};
  for (const feature of manifest.features || []) {
    const fit = featureHardwareFit(feature, hardwareInfo);
    for (const component of FEATURE_COMPONENTS[feature.id] || []) {
      if (!guidance[component] || FIT_PRIORITY[fit.level] > FIT_PRIORITY[guidance[component].level]) {
        guidance[component] = Object.assign({ featureId: feature.id }, fit);
      }
    }
  }
  return guidance;
}

function combinedHardwareFit(components, guidance = {}) {
  const fits = [...new Set(components || [])].map((id) => guidance[id]).filter(Boolean);
  if (!fits.length) return { level: 'unknown', label: 'Check requirements', detail: 'Hardware guidance is unavailable for this selection.' };
  return fits.reduce((worst, fit) => (
    FIT_PRIORITY[fit.level] < FIT_PRIORITY[worst.level] ? fit : worst
  ));
}

function portableSetupConfig(root, runtime, values = {}, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const pathImpl = options.pathImpl || path;
  const now = options.now || new Date().toISOString();
  const installFile = pathImpl.join(root, 'install.json');
  const current = readJson(installFile, fsImpl);
  const currentComfy = current.comfy && typeof current.comfy === 'object' ? current.comfy : {};
  const comfyPath = normalizeOptionalDirectory(values.path ?? runtime?.comfy?.path ?? currentComfy.path, 'ComfyUI folder', { pathImpl });
  const modelsPath = normalizeOptionalDirectory(
    values.modelsPath ?? runtime?.comfy?.modelsPath ?? currentComfy.modelsPath ?? (comfyPath ? pathImpl.join(comfyPath, 'models') : ''),
    'Models folder',
    { pathImpl },
  );
  if (comfyPath && values.requireExisting !== false && !fsImpl.existsSync(comfyPath)) {
    throw new Error(`ComfyUI folder was not found: ${comfyPath}`);
  }
  const url = normalizeSetupUrl(values.url ?? runtime?.comfy?.url ?? currentComfy.url);
  return Object.assign({}, current, {
    schemaVersion: 1,
    appId: 'mix-studio',
    installMode: 'portable',
    dataDir: current.dataDir || runtime?.dataDir || 'data',
    createdAt: current.createdAt || now,
    updatedAt: now,
    update: Object.assign({ provider: 'git', channel: 'main' }, current.update || {}),
    comfy: {
      mode: comfyPath ? 'external' : 'unconfigured',
      path: comfyPath,
      modelsPath,
      url,
    },
    setup: Object.assign({}, current.setup || {}, { experience: 'in-app' }),
  });
}

function writePortableSetupConfig(root, config, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const pathImpl = options.pathImpl || path;
  const file = pathImpl.join(root, 'install.json');
  const temporary = `${file}.tmp`;
  fsImpl.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  fsImpl.renameSync(temporary, file);
  return file;
}

module.exports = {
  FEATURE_COMPONENTS,
  QUICK_SETUP_COMPONENTS,
  combinedHardwareFit,
  componentHardwareGuidance,
  featureHardwareFit,
  normalizeOptionalDirectory,
  normalizeSetupUrl,
  portableSetupConfig,
  readJson,
  setupHardwareProfile,
  writePortableSetupConfig,
};
