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
  assert.match(appJs, /menuTitle: 'Use image'/);
  assert.match(appJs, /ariaLabel: 'Use image'/);
  assert.match(appJs, /label: 'Animate', detail: 'Video tab', icon: 'video'/);
  assert.match(appJs, /label: 'Edit', detail: 'Image editor', icon: 'edit'/);
  assert.match(appJs, /label: 'Reuse', detail: 'Generation settings', icon: 'reuse'/);
  assert.match(appJs, /menuTitle: 'Use video'/);
});

test('upscale selections use one restrained accent outline instead of the global rainbow state', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
  assert.match(css, /#upscaleSheet \.chip\.active \{[\s\S]*border-color: rgba\(125,164,255,\.82\)/);
  assert.doesNotMatch(css.match(/#upscaleSheet \.chip\.active \{[\s\S]*?\n\}/)?.[0] || '', /var\(--gemini\)/);
});

test('upscale sheet exposes target and multiplier modes', () => {
  assert.match(appJs, /upModeChips/);
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
