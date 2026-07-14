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
  assert.match(css, /\.app-dialog-panel,[\s\S]*\.private-access-panel,[\s\S]*\.folder-actions-panel \{ background: #000; \}/);
  assert.match(css, /\.app-dialog-actions \.sheet-cta,[\s\S]*background: linear-gradient\(#000, #000\)/);
});

test('long generation errors use a contained, copyable dialog', () => {
  assert.match(html, /id="errorDetailSheet"[\s\S]*id="errorDetailMessage"[\s\S]*id="errorDetailCopy"/);
  assert.match(app, /function showErrorDetail\(message, title = 'Generation error'\)/);
  assert.match(app, /copyTextToClipboard\(errorDetailText\)/);
  assert.match(app, /showErrorDetail\(d\.message, d\.kind === 'upscale' \|\| d\.operation === 'upscale' \? 'Upscale error' : 'Generation error'\)/);
  assert.match(css, /\.sheet-panel\.error-detail-panel\s*\{[^}]*max-height: min\(78dvh, 720px\);[^}]*overflow: hidden;[^}]*background: #000;/);
  assert.match(css, /\.error-detail-message \{[\s\S]*overflow: auto;[\s\S]*white-space: pre-wrap;[\s\S]*overflow-wrap: anywhere;/);
  assert.match(css, /#errorDetailSheet \.error-detail-actions \.sheet-cta\s*\{[^}]*linear-gradient\(#000, #000\)/);
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
  assert.match(html, /id="gallerySortTrigger"[\s\S]*id="sortSeg"[^>]*role="listbox"/);
  assert.match(css, /\.gallery-sort-menu \{[\s\S]*transform-origin: top right/);
  assert.match(app, /function closeGallerySort\(\)/);
  assert.match(app, /gallerySortLabel'\)\.textContent/);
  assert.match(html, /id="folderPickerTrigger"[\s\S]*id="folderAddBtn"[\s\S]*id="privacyBtn"/);
  assert.match(app, /function closeFolderPicker\(\)/);
  assert.match(app, /f\.locked \? '<svg/);
  assert.doesNotMatch(css, /content: "Locked /);
});
