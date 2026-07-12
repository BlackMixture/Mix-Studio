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

test('image and video generations use stable Lottie simulations before yielding to real outputs', () => {
  assert.match(app, /function startLivePreviewSimulation\(kind = state\.view === 'video' \? 'video' : 'image'\)/);
  assert.match(app, /const path = '\/progress-image\.json'/);
  assert.doesNotMatch(app, /progress-video\.json/);
  assert.match(app, /function outlinedProgressAnimationData\(data, outline\)/);
  assert.match(app, /const face = \[0, 0, 0, 1\]/);
  assert.match(app, /function imageProgressAnimationData\(data\)/);
  assert.match(app, /function videoProgressAnimationData\(data\)/);
  assert.match(app, /value\.ty === 'st' \? outline : face/);
  assert.match(app, /kind === 'video' \? videoProgressAnimationData\(data\) : imageProgressAnimationData\(data\)/);
  assert.match(css, /live-preview-lottie\[data-kind="video"\] svg[\s\S]*rgba\(234,67,53,\.24\)/);
  assert.match(app, /loop: !reduced/);
  assert.match(app, /function showLivePreviewImage\(source\)/);
  assert.match(app, /startLivePreviewSimulation\(state\.view === 'video' \? 'video' : 'image'\)/);
  assert.doesNotMatch(app, /\$\('#livePreviewImg'\)\.src = d\.dataUrl/);
  assert.match(css, /\.live-preview-lottie\[data-kind="image"\]/);
  assert.match(css, /\.live-preview-lottie\[data-kind="video"\]/);
});

test('sampler previews are scoped to their active ComfyUI prompt when metadata is available', () => {
  assert.match(app, /!d\.jobId \|\| state\.activeJobs\.has\(d\.jobId\)/);
  assert.match(server, /supports_preview_metadata: true/);
});

test('a completed edit opened from progress can directly replace the Edit source', () => {
  assert.match(app, /lightboxContinueEditId = completedItem\.mode === 'edit' \? completedItem\.id : null/);
  assert.match(app, /const canContinueCompletedEdit = lightboxContinueEditId === it\.id/);
  assert.match(app, /<span>Continue editing<\/span>/);
  assert.match(app, /async function continueEditingResult\(item\)[\s\S]*clearKreaMask\(true\);[\s\S]*state\.refs\[0\] = nextReference/);
  assert.match(app, /Edit result is now the source image/);
  assert.match(css, /\.action-btn\.continue-edit-action \{[\s\S]*border-color: rgba\(151,124,255,0\.72\)/);
});
