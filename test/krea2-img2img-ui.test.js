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

test('Create Image exposes its optional image guide as an animated prompt-tool disclosure', () => {
  const prompt = html.indexOf('id="promptComposer"');
  const toggle = html.indexOf('id="createImageGuideToggle"');
  const guide = html.indexOf('id="createImageGuide"');
  const videoInputs = html.indexOf('id="vidAttachRow"');
  assert.ok(prompt > -1 && prompt < toggle && toggle < guide && guide < videoInputs);
  assert.match(html, /id="createImageGuideToggle"[^>]*aria-expanded="false"[^>]*aria-controls="createImageGuide"/);
  assert.match(html, /id="createImageGuideAdd"/);
  assert.match(html, /id="createImageGuideFilled"/);
  assert.match(html, /id="createImageGuideImg"/);
  assert.match(html, /id="createImageGuideRemove"/);
  assert.match(html, /id="createImageGuideModes"[\s\S]*data-guide-mode="image"[\s\S]*data-guide-mode="depth"/);
  assert.match(html, /id="createImageInfluence"[^>]*min="0"[^>]*max="100"[^>]*step="5"/);
  assert.match(css, /\.create-image-guide-empty/);
  assert.match(css, /\.create-image-guide\.expanded \{ grid-template-rows: 1fr; \}/);
  assert.match(css, /\.create-image-influence-range::-webkit-slider-runnable-track/);
});

test('Create Image uploads, persists, and submits the guide with inverse denoise', () => {
  assert.match(app, /createRef: null/);
  assert.match(app, /createInfluence: 55/);
  assert.match(app, /createGuideMode: 'image'/);
  assert.match(app, /createDepthStrength: 100/);
  assert.match(app, /function createDenoiseFromInfluence\(influence = state\.createInfluence\)/);
  assert.match(app, /1 - normalized \* 0\.95/);
  assert.match(app, /function pickCreateImageGuide\(\)/);
  assert.match(app, /imageName: createImageGuide \? createImageGuide\.name : undefined/);
  assert.match(app, /createImageGuide && state\.createGuideMode !== 'depth' \? createDenoiseFromInfluence\(\) : 1/);
  assert.match(app, /imageGuideMode: createImageGuide \? state\.createGuideMode : undefined/);
  assert.match(app, /depthStrength: createImageGuide && state\.createGuideMode === 'depth'/);
  assert.match(app, /createRef: state\.createRef \?/);
  assert.match(app, /function restoreCreateImageGuide\(item\)/);
});

test('Resolution can match an uploaded image guide and reports the derived dimensions', () => {
  assert.match(app, /createMatchSource: false/);
  assert.match(app, /function matchedCreateOutputDimensions\(ref = state\.createRef\)/);
  assert.match(app, /function applyCreateMatchedDimensions\(\)/);
  assert.match(app, /source\.className = 'aspect-chip create-match-aspect'/);
  assert.match(app, /Match image · \$\{state\.width\} × \$\{state\.height\}/);
  assert.match(app, /state\.createMatchSource = false;\s*state\.customDims = false;/);
});

test('Krea 2 generation routes image guides through the encoded latent builder', () => {
  assert.match(server, /buildKrea2LatentInput/);
  assert.match(server, /const latentInput = buildKrea2LatentInput\(Object\.assign\(\{\}, p,/);
  assert.match(server, /latent_image: latentInput\.latent/);
  assert.match(server, /denoise: latentInput\.denoise/);
  assert.match(server, /p\.imageName = p\.mode === 'edit' \? '' : String\(p\.imageName \|\| ''\)\.trim\(\)/);
  assert.match(server, /p\.imageName \? \[p\.imageName\] : \[\]/);
});

test('Create Image can switch its reference to DA3 depth structure guidance', () => {
  assert.match(html, /id="createImageGuideModes"[\s\S]*data-guide-mode="image"[\s\S]*data-guide-mode="depth"/);
  assert.match(app, /createGuideMode: 'image'/);
  assert.match(app, /createDepthStrength: 100/);
  assert.match(app, /imageGuideMode: createImageGuide \? state\.createGuideMode : undefined/);
  assert.match(app, /depthStrength: createImageGuide && state\.createGuideMode === 'depth'/);
  assert.match(server, /p\.imageGuideMode = p\.imageName && p\.imageGuideMode === 'depth'/);
  assert.match(server, /buildKrea2DepthControl/);
  assert.match(server, /DownloadAndLoadDepthAnythingV3Model/);
  assert.match(server, /DepthAnything_V3/);
});

test('Krea 2 depth guides use an empty latent and the dedicated control nodes', () => {
  assert.match(server, /buildKrea2DepthControl/);
  assert.match(server, /const depthGuide = p\.imageGuideMode === 'depth'/);
  assert.match(server, /imageName: depthGuide \? '' : p\.imageName/);
  assert.match(server, /model = depth\.model/);
  assert.match(server, /p\.imageGuideMode = p\.imageName && p\.imageGuideMode === 'depth' \? 'depth' : 'image'/);
  assert.match(server, /p\.denoise = p\.imageGuideMode === 'depth'[\s\S]*?\? 1/);
});
