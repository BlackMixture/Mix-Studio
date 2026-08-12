'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('H3 Preferences exposes deliberate Standard, BF16, and DynTime choices', () => {
  assert.match(html, /id="setH3FrameModelVariant"[\s\S]*value="bf16"/);
  assert.match(html, /id="setH3ReferenceModelVariant"[\s\S]*value="dyntime"[\s\S]*value="dyntime-hq"/);
  assert.match(html, /id="h3ModelCompatibility"/);
  assert.match(app, /h3TurboCompatibility|Turbo is disabled for DynTime|Unavailable with DynTime/);
  assert.match(app, /components: \[component\]/);
});

test('H3 Preferences exposes compact managed Turbo setups without adding generation controls', () => {
  assert.match(html, /id="setH3TurboSetup"[\s\S]*value="recommended"[\s\S]*value="lightx8"[\s\S]*value="lightx4_768p"[\s\S]*value="legacy"/);
  assert.match(html, /LightX2V v1\.0 · 8 steps · experimental Reference/);
  assert.match(html, /LightX2V v1\.0 · 4 steps · 768p · experimental Reference/);
  assert.match(app, /'setH3FrameModelVariant', 'setH3TurboSetup', 'setH3ReferenceModelVariant'/);
  assert.match(app, /\$\('#setH3TurboSetup'\)\.addEventListener\('change'/);
  assert.match(app, /\$\('#setH3TurboLora'\)\.value = setup\.frames/);
  assert.match(app, /\$\('#setH3RefTurboLora'\)\.value = setup\.reference/);
  assert.match(app, /setConfiguredH3FramesTurboLora\(lastMeta\.models\.h3Turbo\.lora\.name\)/);
  assert.match(app, /setConfiguredH3ReferenceTurboLora\(lastMeta\.models\.h3RefTurbo\.lora\.name\)/);
  assert.match(app, /function applyH3TurboCanvasProfile\(\)[\s\S]{0,500}state\.aspect = '16:9'[\s\S]{0,240}state\.mp = 1\.75/);
});

test('Queue tabs appear only with active downloads and cleanup uses typed filenames', () => {
  assert.match(html, /id="queueTabs"[^>]*hidden/);
  assert.match(html, /data-queue-view="jobs"/);
  assert.match(html, /data-queue-view="downloads"/);
  assert.match(app, /const hasDownloads = downloads\.length > 0/);
  assert.match(app, /#queueTabs'\)\.hidden = !hasDownloads/);
  assert.match(app, /expected: candidate\.filename/);
  assert.match(app, /\/api\/models\/cleanup/);
});
