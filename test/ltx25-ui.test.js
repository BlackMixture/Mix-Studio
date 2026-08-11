'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('LTX 2.5 is a separate curated video choice and leaves LTX 2.3 as default', () => {
  assert.match(html, /class="chip active" data-engine="ltx"[^>]*data-model-label="LTX 2\.3"/);
  assert.match(html, /data-engine="ltx25" data-feature-engine="video\.ltx25"[^>]*data-model-label="LTX 2\.5"/);
  assert.match(html, /LTX 2\.5 <span class="model-status-badge">Preview<\/span>/);
  assert.match(app, /videoEngineDefault: 'ltx'/);
  assert.match(app, /videoEngineOrder: \['ltx', 'ltx25', 'h3'/);
  assert.match(app, /ltx25: 'LTX 2\.5'/);
});

test('LTX 2.5 preferences expose every official model file independently', () => {
  for (const id of [
    'setLtx25Unet', 'setLtx25TextEncoder', 'setLtx25PromptEnhancer',
    'setLtx25VideoVae', 'setLtx25AudioVae', 'setLtx25Upscaler',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
    assert.match(app, new RegExp(`['#]${id}`));
  }
  assert.match(server, /ltx25Unet: 'ltx-2\.5-22b-distilled-transformer-comfy-int8-convrot\.safetensors'/);
  assert.match(server, /ltx25PromptEnhancer: 'gemma4_e2b_it_bf16\.safetensors'/);
});

test('animate requests gate and dispatch the native LTX 2.5 workflow', () => {
  assert.match(server, /\['ltx25', 'h3', 'wan', 'wan-animate2'/);
  assert.match(server, /if \(engine === 'ltx25'\)[\s\S]*ltx25Compatibility\(info, coreCompatibility\.version\)/);
  assert.match(server, /code: 'comfy_ltx25_update_required'/);
  assert.match(server, /code: 'ltx25_unavailable'/);
  assert.match(server, /engine === 'ltx25' \? await buildLtx25Graph/);
  assert.match(server, /ltx25FramesForSeconds\(seconds\)/);
  assert.match(server, /fps = LTX25_FPS/);
});

test('generation setup opens directly on the LTX 2.5 requirements', () => {
  assert.match(app, /const byEngine = \{ ltx: 'video', ltx25: 'ltx25'/);
  assert.match(app, /function setupLtx25CoreBlocked\(components\)/);
  assert.match(app, /Native ComfyUI support for LTX 2\.5 is still pending/);
  assert.match(app, /github\.com\/Comfy-Org\/ComfyUI\/pull\/15499/);
  assert.match(app, /components: \['h3'[\s\S]*'ltx25', 'video'/);
});
