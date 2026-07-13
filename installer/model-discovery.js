#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MODEL_FILE_RE = /\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i;
const MODEL_PATH_KEYS = new Set([
  'checkpoints', 'configs', 'vae', 'loras', 'upscale_models', 'embeddings',
  'hypernetworks', 'controlnet', 'clip', 'clip_vision', 'style_models',
  'diffusion_models', 'unet', 'text_encoders', 'latent_upscale_models',
  'depthanything3', 'seedvr2',
]);
const STANDARD_MODEL_DIRS = new Set([...MODEL_PATH_KEYS, 'models']);

function argument(argv, name) {
  const inline = argv.find((value) => String(value).startsWith(`${name}=`));
  if (inline) return String(inline).slice(name.length + 1);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || '' : '';
}

function modelChoice(value) {
  return typeof value === 'string' && MODEL_FILE_RE.test(value.trim());
}

function collectRegisteredModelNames(info) {
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

function stripYamlScalar(value) {
  let text = String(value || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  } else {
    text = text.replace(/\s+#.*$/, '').trim();
  }
  return text;
}

function expandPathValue(value, env = process.env) {
  return String(value || '')
    .replace(/%([^%]+)%/g, (_match, name) => env[name] || env[name.toUpperCase()] || _match)
    .replace(/^~(?=[\\/]|$)/, env.USERPROFILE || env.HOME || '~');
}

function resolveConfiguredPath(value, basePath, configDir, pathApi = path, env = process.env) {
  const expanded = expandPathValue(stripYamlScalar(value), env);
  if (!expanded || expanded === '|' || expanded === '>') return '';
  if (pathApi.isAbsolute(expanded)) return pathApi.normalize(expanded);
  return pathApi.resolve(basePath || configDir, expanded);
}

function inferredStandardRoot(modelPath, pathApi = path) {
  const normalized = pathApi.normalize(modelPath);
  const parsed = pathApi.parse(normalized);
  const relative = normalized.slice(parsed.root.length);
  const parts = relative.split(/[\\/]+/).filter(Boolean);
  const lower = parts.map((part) => part.toLowerCase());
  const modelsIndex = lower.lastIndexOf('models');
  if (modelsIndex >= 0) return pathApi.join(parsed.root, ...parts.slice(0, modelsIndex + 1));
  if (STANDARD_MODEL_DIRS.has(String(pathApi.basename(normalized)).toLowerCase())) return pathApi.dirname(normalized);
  return '';
}

function commonDirectory(values, pathApi = path) {
  if (values.length < 2) return '';
  const normalized = values.map((value) => pathApi.resolve(value));
  const roots = normalized.map((value) => pathApi.parse(value).root);
  if (!roots.every((root) => root.toLowerCase() === roots[0].toLowerCase())) return '';
  const parts = normalized.map((value) => value.slice(roots[0].length).split(/[\\/]+/).filter(Boolean));
  const common = [];
  for (let index = 0; index < Math.min(...parts.map((entry) => entry.length)); index += 1) {
    if (!parts.every((entry) => entry[index].toLowerCase() === parts[0][index].toLowerCase())) break;
    common.push(parts[0][index]);
  }
  return common.length ? pathApi.join(roots[0], ...common) : '';
}

function parseExtraModelPaths(text, options = {}) {
  const pathApi = options.pathApi || path;
  const configDir = options.configDir || process.cwd();
  const env = options.env || process.env;
  const sections = new Map();
  let section = '';
  let block = null;

  function currentSection() {
    if (!sections.has(section)) sections.set(section, { basePath: '', entries: [] });
    return sections.get(section);
  }

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const trimmed = rawLine.trim();
    if (block && indent > block.indent) {
      const value = stripYamlScalar(trimmed.replace(/^[-]\s*/, ''));
      if (value) currentSection().entries.push({ key: block.key, value });
      continue;
    }
    block = null;
    const match = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    const lowerKey = key.toLowerCase();
    const value = stripYamlScalar(match[2]);
    if (indent === 0 && !value) {
      section = key;
      currentSection();
      continue;
    }
    if (lowerKey === 'base_path') {
      currentSection().basePath = resolveConfiguredPath(value, '', configDir, pathApi, env);
    } else if (MODEL_PATH_KEYS.has(lowerKey)) {
      if (value === '|' || value === '>') block = { indent, key: lowerKey };
      else if (value) currentSection().entries.push({ key: lowerKey, value });
    }
  }

  const roots = new Set();
  const configuredPaths = [];
  for (const value of sections.values()) {
    const resolved = value.entries
      .map((entry) => resolveConfiguredPath(entry.value, value.basePath, configDir, pathApi, env))
      .filter(Boolean);
    configuredPaths.push(...resolved);
    for (const modelPath of resolved) {
      const root = inferredStandardRoot(modelPath, pathApi);
      if (root) roots.add(root);
    }
    const common = commonDirectory(resolved, pathApi);
    if (common) roots.add(common);
  }
  return { roots: [...roots], configuredPaths: [...new Set(configuredPaths)] };
}

function candidateConfigFiles(comfyPath, env = process.env, pathApi = path) {
  const candidates = [];
  const add = (base) => {
    if (!base) return;
    candidates.push(pathApi.join(base, 'extra_model_paths.yaml'));
    candidates.push(pathApi.join(base, 'extra_model_paths.yml'));
  };
  add(comfyPath);
  if (comfyPath) add(pathApi.join(comfyPath, 'ComfyUI'));
  if (env.APPDATA) add(pathApi.join(env.APPDATA, 'ComfyUI'));
  return [...new Set(candidates)];
}

async function registeredModelsFromComfy(comfyUrl, options = {}) {
  if (!comfyUrl) return { names: [], error: 'ComfyUI URL is empty.' };
  const fetchFn = options.fetchFn || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 5000);
  try {
    const response = await fetchFn(`${String(comfyUrl).replace(/\/$/, '')}/object_info`, { signal: controller.signal });
    if (!response.ok) return { names: [], error: `ComfyUI returned HTTP ${response.status}.` };
    return { names: collectRegisteredModelNames(await response.json()), error: '' };
  } catch (error) {
    return { names: [], error: error?.name === 'AbortError' ? 'ComfyUI model scan timed out.' : String(error.message || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function discoverModels(options = {}) {
  const fsApi = options.fsApi || fs;
  const pathApi = options.pathApi || path;
  const env = options.env || process.env;
  const comfyPath = String(options.comfyPath || '').trim();
  const manualModelsPath = String(options.modelsPath || '').trim();
  const roots = new Set();
  const configFiles = [];
  if (comfyPath) {
    const standardRoot = pathApi.join(comfyPath, 'models');
    if (fsApi.existsSync(standardRoot)) roots.add(pathApi.normalize(standardRoot));
  }
  for (const file of candidateConfigFiles(comfyPath, env, pathApi)) {
    if (!fsApi.existsSync(file)) continue;
    try {
      const parsed = parseExtraModelPaths(fsApi.readFileSync(file, 'utf8'), { configDir: pathApi.dirname(file), pathApi, env });
      configFiles.push(file);
      for (const root of parsed.roots) if (fsApi.existsSync(root)) roots.add(pathApi.normalize(root));
    } catch { /* An invalid optional config must not block setup. */ }
  }
  const registry = await registeredModelsFromComfy(options.comfyUrl, options);
  const discoveredRoots = [...roots];
  return {
    schemaVersion: 1,
    detectedAt: new Date().toISOString(),
    registeredModelNames: registry.names,
    registeredModelCount: registry.names.length,
    modelRoots: discoveredRoots,
    configFiles,
    preferredModelsPath: manualModelsPath || discoveredRoots[0] || (comfyPath ? pathApi.join(comfyPath, 'models') : ''),
    registryError: registry.error,
  };
}

async function main() {
  const result = await discoverModels({
    comfyUrl: argument(process.argv, '--comfy-url'),
    comfyPath: argument(process.argv, '--comfy-path'),
    modelsPath: argument(process.argv, '--models-path'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  MODEL_PATH_KEYS,
  candidateConfigFiles,
  collectRegisteredModelNames,
  commonDirectory,
  discoverModels,
  inferredStandardRoot,
  modelChoice,
  parseExtraModelPaths,
  registeredModelsFromComfy,
  resolveConfiguredPath,
};
