'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('advanced settings are split into four accessible side tabs', () => {
  assert.match(html, /class="settings-tabs"[^>]+role="tablist"[^>]+aria-orientation="vertical"/);
  for (const name of ['General', 'Image', 'Video', 'System']) {
    assert.match(html, new RegExp(`id="settingsTab${name}"[^>]+role="tab"[^>]+aria-controls="settingsPane${name}"`));
    assert.match(html, new RegExp(`id="settingsPane${name}"[^>]+role="tabpanel"[^>]+aria-labelledby="settingsTab${name}"`));
  }
  assert.match(html, /id="settingsPaneGeneral"[^>]+data-settings-pane="general">/);
  assert.match(html, /id="settingsPaneImage"[^>]+data-settings-pane="image" hidden>/);
  assert.match(html, /id="settingsPaneVideo"[^>]+data-settings-pane="video" hidden>/);
  assert.match(html, /id="settingsPaneSystem"[^>]+data-settings-pane="system" hidden>/);
});

test('model settings retain one field each and follow logical pipeline groups', () => {
  const ids = [
    'setComfy', 'galleryPasswordInput', 'setUnet', 'setKrea2RawUnet', 'setKrea2TurboLora', 'setKrea2DepthLora', 'setDepthAnythingV3Model', 'setClip', 'setVae',
    'setKlein4Unet', 'setKlein9Unet', 'setQeUnet', 'setDit', 'setSvVae',
    'setLtxCkpt', 'setWanHigh', 'setErosCkpt', 'setScailUnet', 'setSvAttn', 'setSysPrompt',
  ];
  for (const id of ids) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should appear once`);
  }
  assert.match(html, /data-settings-pane="image"[\s\S]*Krea 2[\s\S]*Flux 2 Klein Edit[\s\S]*Qwen Image Edit[\s\S]*SeedVR2 Upscale/);
  assert.match(html, /data-settings-pane="video"[\s\S]*LTX 2\.3[\s\S]*Wan 2\.2[\s\S]*10Eros DMD[\s\S]*SCAIL 2 Motion Transfer/);
});

test('settings tabs switch panes, support keyboard navigation, and keep content scrollable', () => {
  assert.match(app, /function setSettingsTab\(name, focus = false\)/);
  assert.match(app, /tab\.setAttribute\('aria-selected', String\(active\)\)/);
  assert.match(app, /pane\.hidden = !active/);
  assert.match(app, /\['ArrowUp', 'ArrowDown', 'Home', 'End'\]/);
  assert.match(css, /\.settings-shell \{[\s\S]*grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(css, /\.settings-content \{[\s\S]*overflow-y: auto/);
  assert.match(css, /\.settings-panel \{[\s\S]*overflow: hidden[\s\S]*display: flex/);
});

test('each active settings tab uses a unique full-tile color without a side stripe', () => {
  assert.match(css, /button\[data-settings-tab="general"\] \{ --settings-tab-rgb: 66, 133, 244; \}/);
  assert.match(css, /button\[data-settings-tab="image"\] \{ --settings-tab-rgb: 52, 168, 83; \}/);
  assert.match(css, /button\[data-settings-tab="video"\] \{ --settings-tab-rgb: 234, 67, 53; \}/);
  assert.match(css, /button\[data-settings-tab="system"\] \{ --settings-tab-rgb: 169, 102, 255; \}/);
  const activeRule = css.match(/\.settings-tabs button\.active \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(activeRule, /linear-gradient\(145deg, rgba\(var\(--settings-tab-rgb\), 0\.22\)/);
  assert.doesNotMatch(activeRule, /inset 2px 0/);
});

test('SeedVR2 attention uses an app-styled accessible picker instead of native select UI', () => {
  assert.doesNotMatch(html, /<select id="setSvAttn"/);
  assert.match(html, /id="setSvAttn" type="hidden" value="sdpa"/);
  assert.match(html, /id="svAttnTrigger"[^>]+aria-haspopup="listbox"[^>]+aria-expanded="false"/);
  assert.match(html, /id="svAttnList" role="listbox"[^>]+aria-hidden="true" inert/);
  assert.equal((html.match(/role="option"/g) || []).length, 5);
  assert.match(css, /\.settings-choice-list \{[\s\S]*max-height: 0/);
  assert.match(css, /\.settings-choice\.open \.settings-choice-list \{[\s\S]*max-height: 350px/);
  assert.match(app, /function setSvAttnValue\(value\)/);
  assert.match(app, /function setSvAttnPickerOpen\(open, focusOption = false\)/);
  assert.match(app, /setSvAttnValue\(s\.seedvr2Attention \|\| 'sdpa'\)/);
  assert.match(app, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
});
