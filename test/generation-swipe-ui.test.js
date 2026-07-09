'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('generation progress card supports horizontal swipe dismissal', () => {
  assert.match(css, /\.live-preview \{[\s\S]*touch-action: pan-y;[\s\S]*transition: transform 180ms/);
  assert.match(css, /\.live-preview\.swiping \{ transition: none; \}/);
  assert.match(app, /function dismissLivePreview\(direction = 1\)/);
  assert.match(app, /\$\('#livePreview'\)\.addEventListener\('pointermove'/);
  assert.match(app, /Math\.abs\(dx\) >= 72 \|\| Math\.abs\(swipe\.velocityX\) >= 0\.55/);
});

test('swiping only hides progress and a new generation restores it', () => {
  assert.match(app, /preview\.classList\.remove\('show'\)/);
  assert.doesNotMatch(app.match(/function dismissLivePreview[\s\S]*?\n\}/)?.[0] || '', /interrupt|cancel|activeJobs\.delete/);
  assert.match(app, /function setGenerating\(on, statusText\) \{[\s\S]*if \(on\) \{\s*resetLivePreviewMotion\(\)/);
});

test('a simulated generation texture replaces blank previews and yields to real images', () => {
  assert.match(css, /\.live-preview img:not\(\[src\]\) \{\s*animation: livePreviewSim/);
  assert.match(css, /@keyframes livePreviewSim/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(app, /livePreviewImg'\)\.addEventListener\('error',[^\n]*removeAttribute\('src'\)/);
});

test('sampler previews are scoped to their active ComfyUI prompt when metadata is available', () => {
  assert.match(app, /!d\.jobId \|\| state\.activeJobs\.has\(d\.jobId\)/);
  assert.match(server, /supports_preview_metadata: true/);
});
