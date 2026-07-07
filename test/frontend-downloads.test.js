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
