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

test('Create Image consolidates reference, depth, style, and image-to-prompt in one disclosure', () => {
  const prompt = html.indexOf('id="promptComposer"');
  const toggle = html.indexOf('id="createImageGuideToggle"');
  const camera = html.indexOf('id="cameraPromptBtn"');
  const guide = html.indexOf('id="createImageGuide"');
  const videoInputs = html.indexOf('id="vidAttachRow"');
  assert.ok(prompt > -1 && prompt < camera && camera < toggle && toggle < guide && guide < videoInputs);
  assert.match(html, /id="createImageGuideToggle"[^>]*aria-expanded="false"[^>]*aria-controls="createImageGuide"/);
  assert.match(html, /id="createImageGuideAdd"/);
  assert.match(html, /id="createImageGuideFilled"/);
  assert.match(html, /id="createImageGuideImg"/);
  assert.match(html, /id="createImageGuideRemove"/);
  assert.match(html, /id="createImageGuideModes"[\s\S]*data-guide-mode="image"[\s\S]*data-guide-mode="depth"[\s\S]*data-guide-mode="style"/);
  assert.doesNotMatch(html, /data-guide-mode="prompt"/);
  assert.match(html, /id="createImageToPrompt"[^>]*hidden/);
  assert.doesNotMatch(html, /id="imagePromptBtn"/);
  assert.match(html, /id="createImageGuideModeLabel"[^>]*hidden>Use this image as/);
  assert.match(html, /id="createImageGuideControls" hidden/);
  assert.doesNotMatch(html, /Higher stays closer to the source|tap to replace/i);
  assert.match(html, /id="createImageInfluence"[^>]*min="0"[^>]*max="100"[^>]*step="5"/);
  assert.match(css, /\.create-image-guide-empty/);
  assert.match(css, /\.create-image-guide\.expanded \{ grid-template-rows: 1fr; \}/);
  assert.match(css, /\.create-image-influence-range::-webkit-slider-runnable-track/);
});

test('Create Image uploads, persists, and submits the guide with inverse denoise', () => {
  assert.match(app, /createRef: null/);
  assert.match(app, /createInfluence: 55/);
  assert.match(app, /createGuideMode: 'image'/);
  assert.match(app, /createGuideActive: false/);
  assert.match(app, /createGuideActive: state\.createGuideActive/);
  assert.match(app, /createDepthStrength: 100/);
  assert.match(app, /createStyleStrength: 100/);
  assert.match(app, /function createDenoiseFromInfluence\(influence = state\.createInfluence\)/);
  assert.match(app, /1 - normalized \* 0\.95/);
  assert.match(app, /function pickCreateImageGuide\(\)/);
  assert.match(app, /const createImageGuide = mode === 't2i' && state\.createMode === 'image' && state\.createGuideActive/);
  assert.match(app, /createPromptFromImageName\(state\.createRef\);[\s\S]{0,120}state\.createGuideActive = false/);
  assert.match(app, /imageName: createImageGuideName/);
  assert.match(app, /createImageGuide && state\.createGuideMode === 'image' \? createDenoiseFromInfluence\(\) : 1/);
  assert.match(app, /imageGuideMode: createImageGuide \? state\.createGuideMode : undefined/);
  assert.match(app, /depthStrength: createImageGuide && state\.createGuideMode === 'depth'/);
  assert.match(app, /styleStrength: createImageGuide && state\.createGuideMode === 'style'/);
  assert.match(app, /createRef: state\.createRef \?/);
  assert.match(app, /function restoreCreateImageGuide\(item\)/);
});

test('Resolution can match an uploaded image guide and reports the derived dimensions', () => {
  assert.match(app, /createMatchSource: false/);
  assert.match(app, /createMatchNative: false/);
  assert.match(app, /function generationSafeCreateDimensions\(ref = state\.createRef, megapixels = state\.mp\)/);
  assert.match(app, /Math\.max\(0\.5, Math\.min\(2, Number\(megapixels\) \|\| 1\)\) \* 1e6/);
  assert.match(app, /if \(maxSide > 2048\)/);
  assert.match(app, /function nativeCreateOutputDimensions\(ref = state\.createRef\)/);
  assert.match(app, /function matchedCreateOutputDimensions\(ref = state\.createRef, native = state\.createMatchNative\)/);
  assert.match(app, /function applyCreateMatchedDimensions\(options = \{\}\)/);
  assert.match(app, /function prepareCreateImageGuideAsset\(asset\)/);
  assert.match(app, /safeName: response\.name, safeW: safe\.w, safeH: safe\.h/);
  assert.match(app, /source\.className = 'aspect-chip create-match-aspect'/);
  assert.match(app, /function derivedAspectLabel\(width, height\)/);
  assert.match(app, /function createSizeLabel\(megapixels = state\.mp\)/);
  assert.match(app, /state\.createMatchNative \? 'Native image' : `Match image \$\{createSizeLabel\(\)\}`/);
  assert.match(app, /Native image/);
  assert.match(html, /aria-label="Depth: follow three-dimensional layout"/);
  assert.match(html, /aria-label="Style: follow look and texture"/);
  assert.match(app, /state\.createGuideMode === 'image' \|\| state\.createGuideMode === 'depth'/);
  assert.match(app, /state\.createMatchSource = false;\s*state\.createMatchNative = false;\s*state\.customDims = false;/);
  assert.match(app, /const keepImageMatch = state\.createMatchSource && !!state\.createRef/);
  assert.match(app, /if \(keepImageMatch\) \{\s*applyCreateMatchedDimensions\(\)/);
  assert.match(app, /generationSafeCreateDimensions\(asset, 1\.75\)/);
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
  assert.match(server, /p\.imageGuideMode = p\.imageName && \['depth', 'style'\]\.includes\(p\.imageGuideMode\)/);
  assert.match(server, /buildKrea2DepthControl/);
  assert.match(server, /DownloadAndLoadDepthAnythingV3Model/);
  assert.match(server, /DepthAnything_V3/);
});

test('Create Image style reference uses the low-leakage custom node route', () => {
  assert.match(app, /createStyleStrength: 100/);
  assert.match(html, /data-guide-mode="style"[^>]*aria-label="Style: follow look and texture"/);
  assert.match(app, /components\.add\('krea2style'\)/);
  assert.match(server, /buildKrea2StyleReference/);
  assert.match(server, /const styleGuide = p\.imageGuideMode === 'style'/);
  assert.match(server, /sampler_name: styleGuide \? 'euler_ancestral' : 'euler'/);
  assert.match(server, /scheduler: styleGuide \? 'simple' : 'beta'/);
  assert.match(server, /p\.styleStrength = p\.imageGuideMode === 'style'/);
});

test('Krea 2 depth guides use an empty latent and the dedicated control nodes', () => {
  assert.match(server, /buildKrea2DepthControl/);
  assert.match(server, /const depthGuide = p\.imageGuideMode === 'depth'/);
  assert.match(server, /imageName: depthGuide \|\| styleGuide \? '' : p\.imageName/);
  assert.match(server, /model = depth\.model/);
  assert.match(server, /p\.imageGuideMode = p\.imageName && \['depth', 'style'\]\.includes\(p\.imageGuideMode\)/);
  assert.match(server, /p\.denoise = p\.imageGuideMode === 'depth' \|\| p\.imageGuideMode === 'style'[\s\S]*?\? 1/);
});
