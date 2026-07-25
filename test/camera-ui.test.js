'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const cameraAssetsDir = path.join(__dirname, '..', 'public', 'assets', 'camera-presets');

test('prompt tools expose the camera settings picker', () => {
  assert.match(indexHtml, /id="cameraPromptBtn"/);
  const promptBox = indexHtml.slice(indexHtml.indexOf('<div class="prompt-box">'), indexHtml.indexOf('<div class="prompt-intent-hint"'));
  const createTools = indexHtml.slice(indexHtml.indexOf('id="createPromptTools"'), indexHtml.indexOf('id="videoPromptTools"'));
  assert.match(promptBox, /class="prompt-camera-btn"[^>]*id="cameraPromptBtn"[^>]*aria-label="Camera framing settings"/);
  assert.match(promptBox, /M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4/);
  assert.doesNotMatch(createTools, /id="cameraPromptBtn"/);
  assert.match(styleCss, /\.prompt-camera-btn\s*\{[^}]*position:\s*absolute[^}]*right:\s*56px/s);
  assert.match(appJs, /cameraPromptBtn'\)\.hidden = state\.view !== 'create'/);
  assert.match(indexHtml, /id="cameraSheet"/);
  assert.match(indexHtml, /id="promptPresetCategories"/);
  assert.match(appJs, /promptPresetCatalog/);
  assert.match(appJs, /section\.dataset\.presetCategory = category\.id/);
  assert.match(appJs, /querySelector\('\.camera-preset-grid'\)/);
  assert.match(appJs, /renderCameraPicker/);
  assert.match(appJs, /promptPresetSelections/);
  assert.match(appJs, /cameraPresetPromptPhrase/);
  assert.match(appJs, /applyPromptPresetSelection/);
});

test('camera sheet uses visual presets instead of individual camera controls', () => {
  assert.doesNotMatch(indexHtml, /Category 01/);
  assert.doesNotMatch(indexHtml, /data-camera-wheel=/);
  assert.doesNotMatch(indexHtml, /id="cameraWheelBoard"/);
  assert.match(appJs, /class="camera-preset-grid"/);
  assert.match(appJs, /className = 'camera-preset-card'/);
  assert.match(appJs, /setAttribute\('role', 'checkbox'\)/);
  assert.match(appJs, /setAttribute\('aria-checked'/);
});

test('sheets lock background scrolling while dialogs are open', () => {
  assert.match(appJs, /syncSheetScrollLock/);
  assert.match(appJs, /MutationObserver/);
  assert.match(styleCss, /body\.sheet-open/);
  assert.match(styleCss, /position:\s*fixed/);
});

test('camera cards expose clear selected and missing-image states', () => {
  assert.match(styleCss, /\.camera-preset-card\.active/);
  assert.match(styleCss, /\.camera-preset-card\.active \.camera-preset-check/);
  assert.match(styleCss, /\.camera-preset-card\.image-missing img/);
});

test('the applied camera phrase is color coded without changing its plain prompt value', () => {
  assert.match(appJs, /function makePromptPresetToken/);
  assert.match(appJs, /token\.className = 'prompt-preset-token'/);
  assert.match(appJs, /token\.contentEditable = 'false'/);
  assert.match(appJs, /dataset\.promptValue/);
  assert.match(appJs, /el\.classList\.contains\('prompt-preset-token'\)/);
  assert.match(styleCss, /\.prompt-preset-token\s*{/);
  assert.match(appJs, /dataset\.presetAccent/);
  assert.match(styleCss, /\.prompt-preset-token\[data-preset-accent="violet"\]/);
});

test('camera cards apply immediately and toggle off without a dedicated action row', () => {
  assert.doesNotMatch(indexHtml, /id="cameraPresetClear"/);
  assert.doesNotMatch(indexHtml, /id="cameraApply"/);
  assert.doesNotMatch(indexHtml, /class="preset-picker-actions"/);
  assert.match(appJs, /applyPromptPresetSelection\(category\.id, active \? null : preset\)/);
  assert.match(appJs, /state\.promptPresetSelections = Object\.assign/);
  assert.match(appJs, /CameraSettings\.applyCameraPresetPrompt\(value, null\)/);
  assert.doesNotMatch(appJs, /cameraApply'\)\.addEventListener/);
});

test('camera dialog uses dark surfaces consistent with the app chrome', () => {
  assert.match(styleCss, /\.camera-panel\s*{[^}]*#030407/s);
  assert.match(styleCss, /\.camera-preset-card\s*{[^}]*background:\s*#07090e/s);
  assert.match(styleCss, /\.preset-picker-head\s*{[^}]*border-bottom:/s);
});

test('camera preset grid adapts from three desktop columns to two mobile columns', () => {
  assert.match(styleCss, /\.camera-preset-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.camera-preset-grid\s*{[^}]*repeat\(2,/);
});

test('every camera preset thumbnail is packaged with the app', () => {
  const cameraSettings = require('../public/camera-settings');
  for (const combo of cameraSettings.CAMERA_COMBOS) {
    const file = path.join(__dirname, '..', 'public', combo.thumbnail);
    assert.ok(fs.existsSync(file), `${combo.id} thumbnail should exist`);
    assert.ok(fs.statSync(file).size > 20_000, `${combo.id} thumbnail should not be an empty placeholder`);
  }
  assert.ok(fs.existsSync(path.join(cameraAssetsDir, 'manifest.json')));
});

test('camera shared script loads before the app script', () => {
  const cameraScript = indexHtml.indexOf('/camera-settings.js');
  const appScript = indexHtml.indexOf('/app.js');
  assert.ok(cameraScript > -1);
  assert.ok(appScript > -1);
  assert.ok(cameraScript < appScript);
});
