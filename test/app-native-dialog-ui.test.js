'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('text entry and confirmations use a shared in-app dialog', () => {
  assert.match(html, /id="appDialogSheet"[\s\S]*id="appDialogForm"[\s\S]*id="appDialogInput"/);
  assert.match(app, /function openAppDialog\(options = \{\}\)/);
  assert.match(app, /function askText\(options = \{\}\)/);
  assert.match(app, /async function askConfirm\(options = \{\}\)/);
  assert.doesNotMatch(app, /window\.prompt|window\.confirm/);
  assert.match(css, /\.app-dialog-panel,[\s\S]*\.lora-preset-save-panel/);
});

test('LoRA presets can choose and retain a stack thumbnail', () => {
  assert.match(html, /id="loraPresetSaveSheet"[\s\S]*id="loraPresetThumbChoices"/);
  assert.match(app, /presetSaveThumbnail = presetSaveLoras\[0\]\.name/);
  assert.match(app, /thumbnailLora: presetSaveThumbnail/);
  assert.match(app, /pr\.thumbnailLora \|\| pr\.loras\[0\]\?\.name/);
  assert.match(server, /existing\.thumbnailLora = thumbnailLora/);
  assert.match(server, /name, loras, thumbnailLora, profileId/);
});

test('Library filters animate and folders use a compact icon-led picker', () => {
  assert.match(html, /id="mediaFilter"[\s\S]*media-filter-indicator/);
  assert.match(css, /\.media-filter \.media-filter-indicator[\s\S]*transition: transform 260ms/);
  assert.match(app, /--filter-index/);
  assert.match(html, /id="sortSeg"[\s\S]*sort-filter-indicator/);
  assert.match(css, /\.sort-filter \.sort-filter-indicator[\s\S]*transition: transform 260ms/);
  assert.match(app, /--sort-index/);
  assert.match(html, /id="folderPickerTrigger"[\s\S]*id="folderAddBtn"[\s\S]*id="privacyBtn"/);
  assert.match(app, /function closeFolderPicker\(\)/);
  assert.match(app, /f\.locked \? '<svg/);
  assert.doesNotMatch(css, /content: "Locked /);
});
