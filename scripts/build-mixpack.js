#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { inspectPromptPackBuffer } = require('../lib/prompt-packs');

const MIME_BY_EXTENSION = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
});

function usage() {
  console.error('Usage: node scripts/build-mixpack.js <pack.source.json> [--out <file.mixpack>] [--check] [--force]');
  process.exitCode = 1;
}

function parseArguments(argv) {
  const options = { source: '', output: '', check: false, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--check') options.check = true;
    else if (value === '--force') options.force = true;
    else if (value === '--out') options.output = argv[++index] || '';
    else if (!options.source) options.source = value;
    else throw new Error(`Unexpected argument: ${value}`);
  }
  return options;
}

function safeAssetPath(root, relative, label) {
  const normalized = String(relative || '').trim();
  if (!normalized) throw new Error(`${label} is missing thumbnailFile`);
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} thumbnailFile must stay inside the pack directory`);
  }
  return target;
}

function embeddedPack(source, sourceFile) {
  const root = path.dirname(sourceFile);
  const pack = {
    format: source.format,
    formatVersion: source.formatVersion,
    type: source.type,
    id: source.id,
    name: source.name,
    version: source.version,
    author: source.author,
    description: source.description,
    credits: source.credits,
    sourceUrl: source.sourceUrl,
    contexts: source.contexts,
    categories: (source.categories || []).map((category) => ({
      id: category.id,
      label: category.label,
      description: category.description,
      accent: category.accent,
      selectionMode: category.selectionMode,
      presets: (category.presets || []).map((preset) => {
        const label = `Preset "${category.id}:${preset.id}"`;
        const assetFile = safeAssetPath(root, preset.thumbnailFile, label);
        const extension = path.extname(assetFile).toLowerCase();
        const mime = MIME_BY_EXTENSION[extension];
        if (!mime) throw new Error(`${label} thumbnail must be JPEG, PNG, WebP, or MP4`);
        const data = fs.readFileSync(assetFile);
        return {
          id: preset.id,
          label: preset.label,
          note: preset.note,
          promptText: preset.promptText,
          thumbnail: { mime, data: data.toString('base64') },
        };
      }),
    })),
  };
  return Buffer.from(`${JSON.stringify(pack, null, 2)}\n`);
}

function main() {
  let options;
  try { options = parseArguments(process.argv.slice(2)); }
  catch (error) { console.error(error.message); usage(); return; }
  if (!options.source) { usage(); return; }
  const sourceFile = path.resolve(options.source);
  let source;
  try { source = JSON.parse(fs.readFileSync(sourceFile, 'utf8')); }
  catch (error) { console.error(`Could not read ${sourceFile}: ${error.message}`); process.exitCode = 1; return; }
  try {
    const buffer = embeddedPack(source, sourceFile);
    const inspected = inspectPromptPackBuffer(buffer);
    const summary = `${inspected.manifest.name} ${inspected.manifest.version} · ${inspected.presetCount} presets · ${(inspected.assetBytes / (1024 * 1024)).toFixed(1)} MB media`;
    if (options.check) {
      console.log(`Valid: ${summary}`);
      return;
    }
    const output = path.resolve(options.output || path.join(
      path.dirname(sourceFile),
      `${inspected.manifest.id}-${inspected.manifest.version}.mixpack`,
    ));
    fs.writeFileSync(output, buffer, { flag: options.force ? 'w' : 'wx' });
    console.log(`Built ${output}`);
    console.log(summary);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

main();
