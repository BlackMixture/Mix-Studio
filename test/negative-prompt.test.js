'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MAX_NEGATIVE_PROMPT_LENGTH,
  combineNegativePrompts,
  normalizeNegativePrompt,
} = require('../lib/negative-prompt');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const regional = fs.readFileSync(path.join(root, 'lib', 'regional-workflows.js'), 'utf8');
const outpaint = fs.readFileSync(path.join(root, 'lib', 'edit-outpaint-workflows.js'), 'utf8');

test('negative prompts normalize safely and extend model defaults', () => {
  assert.equal(normalizeNegativePrompt('  blur, text  '), 'blur, text');
  assert.equal(normalizeNegativePrompt('x'.repeat(MAX_NEGATIVE_PROMPT_LENGTH + 20)).length, MAX_NEGATIVE_PROMPT_LENGTH);
  assert.equal(combineNegativePrompts('low quality', 'watermark'), 'low quality, watermark');
  assert.equal(combineNegativePrompts('base', 'x'.repeat(MAX_NEGATIVE_PROMPT_LENGTH)).length, MAX_NEGATIVE_PROMPT_LENGTH);
  assert.equal(combineNegativePrompts('', 'watermark'), 'watermark');
  assert.equal(combineNegativePrompts('low quality', ''), 'low quality');
});

test('Advanced only exposes the negative prompt control for supported workflows', () => {
  assert.match(html, /id="advBody"[\s\S]*id="negativePromptField"[\s\S]*id="negativePromptInput"[^>]*maxlength="4000"[^>]*aria-describedby="negativePromptHint"/);
  assert.match(css, /\.negative-prompt-field label \{[^}]*display: flex/);
  assert.match(app, /function negativePromptAvailability\(view = state\.view\)/);
  assert.match(app, /state\.vidEngine === 'wan' && \$\('#vidQuality'\)\?\.classList\.contains\('active'\)/);
  assert.match(app, /state\.vidEngine === 'wan'[\s\S]{0,180}Wan Fast uses CFG 1/);
  assert.match(app, /state\.vidEngine === 'eros'[\s\S]{0,180}10Eros uses zero-negative conditioning/);
  assert.match(app, /state\.editEngine === 'qwen' && state\.qwenQuality !== 'fast'/);
  assert.match(app, /field\.hidden = !availability\.supported/);
  assert.match(app, /input\.disabled = !availability\.supported/);
});

test('negative prompt text persists per mode, submits, and restores from gallery settings', () => {
  assert.match(app, /negativePrompt: String\(value\.negativePrompt \?\? ''\)\.slice\(0, 4000\)/);
  assert.match(app, /negativePrompt: \$\('#negativePromptInput'\)\.value/);
  assert.match(app, /negativePrompt: negativePromptForGeneration\(\)/);
  assert.match(app, /String\(it\.negativePrompt \|\| ''\)/);
  assert.match(app, /negativePrompt: info\.negativePrompt \|\| ''/);
  assert.match(app, /copyableMeta\('Negative prompt', (?:info|it)\.negativePrompt\)/);
});

test('generation graphs apply only supported negative conditioning', () => {
  assert.match(server, /p\.negativePrompt = normalizeNegativePrompt\(p\.negativePrompt\)/);
  assert.match(server, /p\.editEngine !== 'qwen' \|\| p\.qwenQuality !== 'quality'\) p\.negativePrompt = ''/);
  assert.match(server, /engine === 'wan' && body\.fast === false[\s\S]{0,100}normalizeNegativePrompt\(body\.negativePrompt\)/);
  assert.match(server, /graph\.neg = p\.negativePrompt[\s\S]{0,180}class_type: 'CLIPTextEncode'/);
  assert.match(server, /prompt: p\.negativePrompt \|\| ''/);
  for (const name of ['LTX_NEGATIVE', 'WAN_NEGATIVE', 'SCAIL_NEGATIVE']) {
    assert.match(server, new RegExp(`combineNegativePrompts\\(${name}, opts\\.negativePrompt\\)`));
  }
  assert.match(regional, /graph\.neg = p\.negativePrompt[\s\S]{0,180}class_type: 'CLIPTextEncode'/);
  assert.match(outpaint, /prompt: params\.negativePrompt \|\| ''/);
});
