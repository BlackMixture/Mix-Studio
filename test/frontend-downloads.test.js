'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('lightbox routes original and upscaled image downloads through one save menu', () => {
  assert.match(appJs, /openActionMenu/);
  assert.match(appJs, /Save original/);
  assert.match(appJs, /Save upscaled/);
  assert.match(appJs, /downloadItem\(it, 'upscaled'\)/);
  assert.match(appJs, /downloadItem\(it, 'original'\)/);
  assert.doesNotMatch(appJs, /mk\([^)]*Save upscaled[^)]*downloadItem\(it, 'upscaled'\)/);
});

test('lightbox groups after-the-fact video processing actions in one menu', () => {
  assert.match(appJs, /Process video/);
  assert.match(appJs, /Upscale video/);
  assert.match(appJs, /Increase FPS/);
  assert.match(appJs, /\/api\/video\/upscale/);
  assert.match(appJs, /\/api\/video\/interpolate/);
});

test('gallery Use menus are icon-led and show concise image destinations', () => {
  assert.match(appJs, /function actionIconMarkup\(icon\)/);
  assert.match(appJs, /menu-trigger/);
  assert.match(appJs, /<span>\$\{escapeHtml\(label\)\}<\/span>/);
  assert.match(appJs, /menuTitle: 'Use image'/);
  assert.match(appJs, /ariaLabel: 'Use image'/);
  assert.match(appJs, /label: 'First frame', detail: 'Start a video here', icon: 'first-frame'/);
  assert.match(appJs, /label: 'Last frame', detail: 'End a video here', icon: 'last-frame'/);
  assert.match(appJs, /label: 'Edit', detail: 'Image editor', icon: 'edit'/);
  assert.match(appJs, /label: 'Reuse', detail: 'Generation settings', icon: 'reuse'/);
  assert.match(appJs, /menuTitle: 'Use video'/);
});

test('upscale selections use a restrained neutral state instead of colored outlines', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  const activeState = css.match(/#upscaleSheet \.chip\.active,[\s\S]*?\.edit-upscale-row \.chip\.active \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(activeState, /border-color: rgba\(255,255,255,\.2\)/);
  assert.match(activeState, /box-shadow: none/);
  assert.doesNotMatch(activeState, /var\(--gemini\)|125,164,255/);
});

test('upscale sheet exposes target and multiplier modes', () => {
  assert.match(appJs, /upModeChips/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8'), /#upResChips\[hidden\],[\s\S]*#upScaleChips\[hidden\] \{ display: none; \}/);
  assert.match(appJs, /scaleFactor/);
});

test('create tab exposes image-to-prompt wiring', () => {
  assert.match(indexHtml, /id="imagePromptBtn"/);
  assert.match(appJs, /\/api\/imageprompt/);
});

test('lightbox image metadata shows generation duration when recorded', () => {
  assert.match(appJs, /Generated in:/);
  assert.match(appJs, /formatDuration\(it\.durationMs\)/);
});

test('gallery cards and focused videos show recorded generation duration', () => {
  assert.match(appJs, /function galleryItemDurationMs\(item\)/);
  assert.match(appJs, /latest\.info && latest\.info\.durationMs/);
  assert.match(appJs, /addGalleryDuration\(v, cardDuration\)/);
  assert.match(appJs, /info\.durationMs\) meta\.push\(`<b>Generated in:<\/b>/);
});
