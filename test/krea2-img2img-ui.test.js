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

test('Create Image exposes an optional image guide directly below the prompt', () => {
  const prompt = html.indexOf('id="promptComposer"');
  const guide = html.indexOf('id="createImageGuide"');
  const videoInputs = html.indexOf('id="vidAttachRow"');
  assert.ok(prompt > -1 && prompt < guide && guide < videoInputs);
  assert.match(html, /id="createImageGuideAdd"/);
  assert.match(html, /id="createImageGuideFilled"/);
  assert.match(html, /id="createImageGuideImg"/);
  assert.match(html, /id="createImageGuideRemove"/);
  assert.match(html, /id="createImageInfluence"[^>]*min="0"[^>]*max="100"[^>]*step="5"/);
  assert.match(css, /\.create-image-guide-empty/);
  assert.match(css, /\.create-image-influence-range::-webkit-slider-runnable-track/);
});

test('Create Image uploads, persists, and submits the guide with inverse denoise', () => {
  assert.match(app, /createRef: null/);
  assert.match(app, /createInfluence: 55/);
  assert.match(app, /function createDenoiseFromInfluence\(influence = state\.createInfluence\)/);
  assert.match(app, /1 - normalized \* 0\.95/);
  assert.match(app, /function pickCreateImageGuide\(\)/);
  assert.match(app, /imageName: createImageGuide \? createImageGuide\.name : undefined/);
  assert.match(app, /createImageGuide \? createDenoiseFromInfluence\(\) : 1/);
  assert.match(app, /createRef: state\.createRef \?/);
  assert.match(app, /function restoreCreateImageGuide\(item\)/);
});

test('Krea 2 generation routes image guides through the encoded latent builder', () => {
  assert.match(server, /buildKrea2LatentInput/);
  assert.match(server, /const latentInput = buildKrea2LatentInput\(p\)/);
  assert.match(server, /latent_image: latentInput\.latent/);
  assert.match(server, /denoise: latentInput\.denoise/);
  assert.match(server, /p\.imageName = p\.mode === 'edit' \? '' : String\(p\.imageName \|\| ''\)\.trim\(\)/);
  assert.match(server, /p\.imageName \? \[p\.imageName\] : \[\]/);
});
