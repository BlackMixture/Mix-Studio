'use strict';

const MODEL_FILE_RE = /\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i;

function normalizeModelPath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase();
}

function modelBasename(value) {
  const normalized = normalizeModelPath(value);
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function modelChoice(value) {
  return typeof value === 'string' && MODEL_FILE_RE.test(value.trim());
}

function registeredModelNames(info) {
  const names = new Set();
  for (const cls of Object.values(info || {})) {
    const inputs = cls && typeof cls === 'object' ? cls.input || {} : {};
    for (const group of [inputs.required, inputs.optional]) {
      for (const spec of Object.values(group || {})) {
        if (!Array.isArray(spec)) continue;
        const choices = Array.isArray(spec[0])
          ? spec[0]
          : (spec[0] === 'COMBO' && Array.isArray(spec[1]?.options) ? spec[1].options : []);
        for (const choice of choices) if (modelChoice(choice)) names.add(choice.trim());
      }
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right));
}

/** Resolve a configured bare filename to the exact path ComfyUI registered.
 * Basename fallback is only safe when it has one match; duplicate filenames
 * in separate model roots remain a user choice. */
function resolveRegisteredModelName(value, availableNames) {
  const expected = normalizeModelPath(value);
  if (!expected || !availableNames) return '';
  const choices = [...availableNames].filter(modelChoice);
  const exact = choices.find((choice) => normalizeModelPath(choice) === expected);
  if (exact) return exact;
  const basename = modelBasename(expected);
  const matches = choices.filter((choice) => modelBasename(choice) === basename);
  return matches.length === 1 ? matches[0] : '';
}

function isGgufModel(name) {
  return /\.gguf$/i.test(String(name || '').trim());
}

function diffusionModelLoader(name) {
  const unetName = String(name || '').trim();
  if (isGgufModel(unetName)) {
    return { class_type: 'UnetLoaderGGUF', inputs: { unet_name: unetName } };
  }
  return { class_type: 'UNETLoader', inputs: { unet_name: unetName, weight_dtype: 'default' } };
}

function diffusionModelInput(name) {
  return isGgufModel(name)
    ? { className: 'UnetLoaderGGUF', field: 'unet_name' }
    : { className: 'UNETLoader', field: 'unet_name' };
}

module.exports = {
  MODEL_FILE_RE,
  diffusionModelInput,
  diffusionModelLoader,
  isGgufModel,
  modelBasename,
  modelChoice,
  normalizeModelPath,
  registeredModelNames,
  resolveRegisteredModelName,
};
