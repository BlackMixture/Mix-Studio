#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { installComponents } = require('../lib/dependency-installer');

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

const FEATURE_COMPONENTS = Object.freeze({
  'core.image': ['image', 'krea2depth'],
  'edit.klein4': ['klein4'],
  'edit.klein9': ['klein9', 'smartmask'],
  'edit.qwen': ['qwen', 'smartmask'],
  'edit.krea2': ['regional', 'smartmask'],
  'edit.krea2ref': ['krea2ref'],
  'video.ltx': ['video', 'faceid'],
  'video.ltxEdit': ['videoedit'],
  'video.eros': ['eros'],
  'video.wan': ['wan'],
  'video.scail': ['scail', 'scailinfinity'],
});

function selectedComponents(manifest, selection) {
  const components = new Set();
  for (const feature of manifest.features || []) {
    const enabled = feature.required === true || selection[feature.id] === true;
    if (!enabled) continue;
    for (const component of FEATURE_COMPONENTS[feature.id] || []) components.add(component);
  }
  return [...components];
}

async function main() {
  const install = readJson(path.join(root, 'install.json'));
  const settings = readJson(path.join(root, 'data', 'settings.json'));
  const manifest = readJson(path.join(__dirname, 'feature-manifest.json'));
  const selection = readJson(argument('--features'));
  const components = selectedComponents(manifest, selection);
  if (!components.length) throw new Error('No model or custom-node groups were selected.');

  const comfy = install.comfy || {};
  const runtime = {
    dataDir: path.join(root, 'data'),
    comfy: {
      path: String(comfy.path || ''),
      modelsPath: String(comfy.modelsPath || ''),
      url: String(comfy.url || settings.comfyUrl || 'http://127.0.0.1:8188'),
    },
  };

  process.stdout.write(`Installing ${components.length} selected dependency groups. Existing files will be reused.\n`);
  await installComponents({
    runtime,
    settings,
    components,
    report(phase, message, detail = {}) {
      const progress = Number.isFinite(detail.completed) && Number.isFinite(detail.total) && detail.total > 0
        ? ` (${detail.completed}/${detail.total})`
        : '';
      process.stdout.write(`[${phase}]${progress} ${message}\n`);
    },
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message || error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { FEATURE_COMPONENTS, selectedComponents };
