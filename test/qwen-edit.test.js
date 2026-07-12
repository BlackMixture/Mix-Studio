'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQwenEditQuality, qwenEditPreset } = require('../lib/qwen-edit');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Qwen Edit quality presets normalize to quality by default', () => {
  assert.equal(normalizeQwenEditQuality('fast'), 'fast');
  assert.equal(normalizeQwenEditQuality('quality'), 'quality');
  assert.equal(normalizeQwenEditQuality('unexpected'), 'quality');
  assert.deepEqual(qwenEditPreset('fast'), { id: 'fast', steps: 4, cfg: 1, lightning: true });
  assert.deepEqual(qwenEditPreset('quality'), { id: 'quality', steps: 20, cfg: 4, lightning: false });
});

test('Qwen Edit exposes and persists a contextual sampling selector', () => {
  assert.match(html, /id="qwenQualityControl"/);
  assert.match(html, /data-qwen-quality="fast"/);
  assert.match(html, /data-qwen-quality="quality"/);
  assert.match(app, /qwenQuality: 'quality'/);
  assert.match(app, /function renderQwenQuality\(\)/);
  assert.match(app, /qwenQuality: mode === 'edit' && state\.editEngine === 'qwen'/);
  assert.match(app, /state\.qwenQuality = f\.qwenQuality === 'fast' \? 'fast' : 'quality'/);
});

test('Qwen Edit server applies the selected preset and only loads Lightning in fast mode', () => {
  assert.match(server, /const preset = qwenEditPreset\(p\.qwenQuality\)/);
  assert.match(server, /if \(preset\.lightning && \(!lightningOverride \|\| lightningOverride\.on !== false\)\) \{/);
  assert.match(server, /steps: preset\.steps, cfg: preset\.cfg/);
  assert.match(server, /p\.qwenQuality = normalizeQwenEditQuality\(p\.qwenQuality\)/);
});
