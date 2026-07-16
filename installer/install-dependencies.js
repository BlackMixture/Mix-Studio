#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { installComponents } = require('../lib/dependency-installer');
const { FEATURE_COMPONENTS } = require('../lib/setup-guide');
const { normalizeKrea2Variant, recommendedKrea2Variant } = require('../lib/krea2-model');
const { recommendedVramProfile } = require('../lib/vram-profile');
const { discoverModels } = require('./model-discovery');

const root = path.resolve(__dirname, '..');

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function selectedComponents(manifest, selection) {
  const components = new Set();
  for (const feature of manifest.features || []) {
    const enabled = feature.required === true || selection[feature.id] === true;
    if (!enabled) continue;
    for (const component of FEATURE_COMPONENTS[feature.id] || []) components.add(component);
  }
  return [...components];
}

function combineDiscovery(saved, live) {
  const names = new Set([
    ...(Array.isArray(saved?.registeredModelNames) ? saved.registeredModelNames : []),
    ...(Array.isArray(live?.registeredModelNames) ? live.registeredModelNames : []),
  ]);
  const roots = new Set([
    ...(Array.isArray(saved?.modelRoots) ? saved.modelRoots : []),
    ...(Array.isArray(live?.modelRoots) ? live.modelRoots : []),
  ]);
  return {
    registeredModelNames: [...names],
    registeredModelCount: names.size,
    modelRoots: [...roots],
    preferredModelsPath: String(saved?.preferredModelsPath || live?.preferredModelsPath || ''),
  };
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

async function main() {
  const install = readJson(path.join(root, 'install.json'));
  const dataDir = path.resolve(root, String(install.dataDir || 'data'));
  const settingsFile = path.join(dataDir, 'settings.json');
  const settings = readJson(settingsFile);
  const manifest = readJson(path.join(__dirname, 'feature-manifest.json'));
  const selection = readJson(argument('--features'));
  const components = selectedComponents(manifest, selection);
  if (!components.length) throw new Error('No model or custom-node groups were selected.');

  const comfy = install.comfy || {};
  const savedDiscovery = readJson(argument('--discovery'));
  const liveDiscovery = await discoverModels({
    comfyUrl: String(comfy.url || settings.comfyUrl || 'http://127.0.0.1:8188'),
    comfyPath: String(comfy.path || ''),
    modelsPath: String(comfy.modelsPath || savedDiscovery.preferredModelsPath || ''),
  });
  const discovery = combineDiscovery(savedDiscovery, liveDiscovery);
  const runtime = {
    dataDir,
    comfy: {
      path: String(comfy.path || ''),
      modelsPath: String(comfy.modelsPath || discovery.preferredModelsPath || ''),
      url: String(comfy.url || settings.comfyUrl || 'http://127.0.0.1:8188'),
    },
  };

  process.stdout.write(`Installing ${components.length} selected dependency groups. Existing files will be reused.\n`);
  if (discovery.registeredModelCount) {
    process.stdout.write(`ComfyUI already reports ${discovery.registeredModelCount} model files; matching downloads will be skipped.\n`);
  }
  const configuredVariant = settings.krea2ModelVariant
    ? normalizeKrea2Variant(settings.krea2ModelVariant, settings)
    : recommendedKrea2Variant(install.hardware || {});
  const result = await installComponents({
    runtime,
    settings,
    components,
    options: {
      availableModelNames: discovery.registeredModelNames,
      availableModelRoots: discovery.modelRoots,
      modelVariants: { krea2: configuredVariant },
    },
    report(phase, message, detail = {}) {
      const progress = Number.isFinite(detail.completed) && Number.isFinite(detail.total) && detail.total > 0
        ? ` (${detail.completed}/${detail.total})`
        : '';
      process.stdout.write(`[${phase}]${progress} ${message}\n`);
    },
  });
  if (result.settingUpdates && Object.keys(result.settingUpdates).length) {
    Object.assign(settings, result.settingUpdates);
    process.stdout.write(`Configured Krea 2 ${result.modelVariants.krea2} models for this machine.\n`);
  }
  if (!settings.vramProfile) {
    settings.vramProfile = recommendedVramProfile(install.hardware || {});
  }
  writeJsonAtomic(settingsFile, settings);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { FEATURE_COMPONENTS, combineDiscovery, selectedComponents, writeJsonAtomic };
