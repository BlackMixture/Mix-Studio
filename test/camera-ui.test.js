'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('prompt tools expose the camera settings picker', () => {
  assert.match(indexHtml, /id="cameraPromptBtn"/);
  assert.match(indexHtml, /id="cameraSheet"/);
  assert.match(indexHtml, /id="cameraComboGrid"/);
  assert.match(indexHtml, /id="cameraWheelBoard"/);
  assert.match(indexHtml, /id="cameraApply"/);
  assert.match(appJs, /renderCameraPicker/);
  assert.match(appJs, /renderCameraCombos/);
  assert.match(appJs, /renderCameraWheel/);
  assert.match(appJs, /applyCameraCombo/);
  assert.match(appJs, /applyCameraPrompt/);
});

test('camera sheet uses compact wheel controls instead of stacked setting grids', () => {
  assert.doesNotMatch(indexHtml, /id="cameraCameraGrid"/);
  assert.doesNotMatch(indexHtml, /id="cameraLensGrid"/);
  assert.doesNotMatch(indexHtml, /id="cameraFocalRow"/);
  assert.doesNotMatch(indexHtml, /id="cameraSettingGrid"/);
  assert.match(indexHtml, /data-camera-wheel="camera"/);
  assert.match(indexHtml, /data-camera-wheel="lens"/);
  assert.match(indexHtml, /data-camera-wheel="focalLength"/);
  assert.match(indexHtml, /data-camera-wheel="aperture"/);
  assert.match(indexHtml, /data-camera-wheel="shutter"/);
  assert.match(indexHtml, /data-camera-wheel="iso"/);
});

test('sheets lock background scrolling while dialogs are open', () => {
  assert.match(appJs, /syncSheetScrollLock/);
  assert.match(appJs, /MutationObserver/);
  assert.match(styleCss, /body\.sheet-open/);
  assert.match(styleCss, /position:\s*fixed/);
});

test('camera wheels highlight the selected item instead of mismatched overlay boxes', () => {
  assert.doesNotMatch(styleCss, /\.camera-wheel::after/);
  assert.match(styleCss, /\.camera-wheel-item\.active/);
  assert.match(styleCss, /\.camera-wheel-item\.active\s*{[^}]*background:/s);
});

test('camera wheels support scroll-to-select, not tap-only selection', () => {
  assert.match(appJs, /selectCameraWheelFromScroll/);
  assert.match(appJs, /commitCameraWheelScroll/);
  assert.match(appJs, /clearCameraWheelScrollTimers/);
  assert.match(appJs, /cameraWheelSyncing/);
  assert.match(appJs, /addEventListener\('scroll'/);
  assert.match(appJs, /if \(cameraWheelSyncing\) return/);
});

test('camera dialog uses dark surfaces consistent with the app chrome', () => {
  assert.match(styleCss, /\.camera-panel\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-preview\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-wheel\s*{[^}]*background:\s*#000/s);
  assert.doesNotMatch(styleCss, /\.camera-wheel\s*{[^}]*rgba\(255,\s*255,\s*255,\s*0\.07\)/s);
});

test('camera dialog uses a black canvas with colored section dots', () => {
  assert.match(styleCss, /\.camera-panel\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-preview\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-combo\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-wheel\s*{[^}]*background:\s*#000/s);
  assert.match(styleCss, /\.camera-wheel-label::before\s*{[^}]*background:\s*var\(--section-dot\)/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="camera"\]\s*{[^}]*--section-dot:/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="lens"\]\s*{[^}]*--section-dot:/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="focalLength"\]\s*{[^}]*--section-dot:/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="aperture"\]\s*{[^}]*--section-dot:/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="shutter"\]\s*{[^}]*--section-dot:/s);
  assert.match(styleCss, /\.camera-wheel\[data-camera-wheel="iso"\]\s*{[^}]*--section-dot:/s);
});

test('camera shared script loads before the app script', () => {
  const cameraScript = indexHtml.indexOf('/camera-settings.js');
  const appScript = indexHtml.indexOf('/app.js');
  assert.ok(cameraScript > -1);
  assert.ok(appScript > -1);
  assert.ok(cameraScript < appScript);
});
