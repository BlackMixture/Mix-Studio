'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Qwen Edit exposes a visual multi-angle picker without surfacing control prompts', () => {
  assert.match(html, /id="qwenAnglesBtn"[^>]*aria-label="Camera angles"/);
  assert.match(html, /id="qwenAnglesSheet"/);
  assert.match(html, /id="qwenAngleGrid"/);
  assert.match(html, /id="qwenElevationRow"/);
  assert.match(html, /id="qwenDistanceRow"/);
  assert.doesNotMatch(html, /Each selected view becomes its own Qwen Edit export/);
  assert.match(app, /function selectedQwenAngleViews\(\)/);
  assert.match(app, /#qwenAngleTool'\)\.hidden = !\(state\.view === 'edit' && state\.editEngine === 'qwen'\)/);
  assert.match(css, /\.qwen-angle-grid/);
  assert.match(css, /\.qwen-angle-card\.active/);
  assert.match(app, /const framingIcon = \(id\) =>/);
  assert.match(css, /\.qwen-framing-icon/);
});

test('Each selected Qwen angle queues its own edit request', () => {
  assert.match(app, /const qwenAngleExports = state\.view === 'edit' && state\.editEngine === 'qwen'/);
  assert.match(app, /qwenAngle: angle/);
  assert.match(app, /for \(const request of requests\)/);
  assert.match(app, /camera-angle exports queued/);
  assert.match(app, /const angleGroupId = qwenAngleExports\.length > 1 \? createAngleGroupId\(\) : null/);
  assert.match(app, /angleGroupId,/);
});

test('Multi-angle exports appear as one gallery set with an angle icon', () => {
  assert.match(app, /function galleryEntries\(items\)/);
  assert.match(app, /function angleGroupItems\(item\)/);
  assert.match(app, /angle-group-badge/);
  assert.match(app, /Angle \$\{angleIndex \+ 1\} of \$\{angleItems\.length\}/);
  assert.match(css, /\.card \.badge\.angle-group-badge/);
  assert.match(server, /angleGroupId: job\.params\.angleGroupId/);
  assert.match(server, /p\.angleGroupId = p\.qwenAngle/);
});

test('Qwen angle jobs use the installed multi-angle LoRA and the documented control-token format server-side', () => {
  assert.match(server, /qwenEditAnglesLora: 'qwen_image_edit_2511_multiple-angles-lora\.safetensors'/);
  assert.match(server, /function qwenAnglePrompt\(angle\)/);
  assert.match(server, /return `<sks> \$\{QWEN_ANGLE_AZIMUTHS\[angle\.view\]\} \$\{angle\.elevation\} shot \$\{angle\.distance\}`/);
  assert.match(server, /graph\.angle_lora/);
  assert.match(server, /strength_model: 0\.9/);
  assert.match(server, /prompt: p\.qwenAnglePrompt \|\| p\.prompt/);
});
