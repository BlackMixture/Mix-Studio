'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('create prompt tools expose a regional bounding-box editor', () => {
  assert.match(indexHtml, /id="regionsPromptBtn"/);
  assert.match(indexHtml, /id="regionSheet"/);
  assert.match(indexHtml, /id="regionStage"/);
  assert.match(indexHtml, /id="regionLoraSelect"/);
  assert.match(indexHtml, /id="regionRefInput"/);
  assert.match(appJs, /function openRegionEditor/);
  assert.match(appJs, /function renderRegionEditor/);
  assert.match(appJs, /function uploadRegionReference/);
});

test('generate requests include enabled regions for create and Krea2 edit', () => {
  assert.match(appJs, /regionsEnabled/);
  assert.match(appJs, /activeRegionsForRequest/);
  assert.match(appJs, /regions:\s*activeRegionsForRequest\(\)/);
  assert.match(appJs, /maskImageName/);
});

test('edit tab exposes Krea2 inpaint and mask painting controls', () => {
  assert.match(indexHtml, /data-engine="krea2"/);
  assert.match(indexHtml, /id="kreaMaskTools"/);
  assert.match(indexHtml, /id="kreaMaskCanvas"/);
  assert.match(appJs, /function openKreaMaskPainter/);
  assert.match(appJs, /function drawKreaMask/);
  assert.match(appJs, /editEngineLabel\(engine\)[\s\S]*Krea2/);
});

test('regional editor and mask painter use dark full-screen sheet styling', () => {
  assert.match(styleCss, /\.region-sheet/);
  assert.match(styleCss, /\.region-stage/);
  assert.match(styleCss, /\.region-box/);
  assert.match(styleCss, /\.krea-mask-canvas/);
});
