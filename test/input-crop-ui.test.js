'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('image inputs share one non-destructive crop and restore console', () => {
  assert.match(html, /id="imageCropSheet"/);
  assert.match(html, /id="imageCropStage"/);
  assert.match(html, /id="imageCropRestore"[^>]*hidden/);
  assert.match(html, /id="imageCropApply"/);
  assert.match(html, /data-crop-aspect="1:1"/);
  assert.match(html, /data-crop-aspect="16:9"/);
  assert.match(app, /function openInputImageCrop\(asset, onApply/);
  assert.match(app, /cropOriginal: crop\.original/);
  assert.match(app, /function originalImageAsset\(asset\)/);
  assert.match(app, /serialized\.cropOriginal/);
  assert.match(app, /restored\.cropOriginal/);
  assert.match(css, /\.image-crop-stage \{/);
  assert.match(css, /touch-action: none/);
});

test('crop controls cover Create, Edit, Region, and video image inputs', () => {
  ['createImageGuideCrop', 'vidAttachCrop', 'vidEndCrop', 'vidFaceCrop', 'regionRefCrop', 'animEndCrop']
    .forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));
  assert.match(app, /crop\.className = 'input-crop-action'/);
  assert.match(app, /openInputImageCrop\(ref,/);
  assert.match(app, /openInputImageCrop\(state\.createRef,/);
  assert.match(app, /openInputImageCrop\(state\.vidRef,/);
  assert.match(app, /openInputImageCrop\(state\.vidFace,/);
  assert.match(app, /openInputImageCrop\(asset, \(next\) => setRegionReference\(next\)/);
});
