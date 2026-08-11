'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const dependencies = fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8');

test('Krea 2 Edit exposes v1.2 reference fidelity only in relevant advanced contexts', () => {
  assert.match(html, /id="krea2RefBoostField"[^>]*hidden/);
  assert.match(html, /id="krea2RefBoost"[^>]*min="0"[^>]*max="12"[^>]*step="0\.25"[^>]*value="4"/);
  assert.match(html, /id="krea2RefBoostTone">Balanced/);
  assert.match(html, /id="krea2RefBoostScale"[\s\S]*Creative[\s\S]*Faithful/);
  assert.match(app, /krea2RefBoost: 4/);
  assert.match(app, /function krea2RefBoostTone\(value\)/);
  assert.match(app, /function syncKrea2RefBoostUi\(value\)/);
  assert.match(app, /--reference-progress/);
  assert.match(app, /function renderKrea2RefBoost\(\)/);
  assert.match(app, /state\.editEngine === 'krea2ref' \|\| \(state\.editEngine === 'krea2' && state\.editOutpaint\)/);
  assert.match(app, /krea2RefBoost: mode === 'edit'/);
  assert.match(server, /p\.krea2RefBoost = p\.mode === 'edit' \? clampNum\(p\.krea2RefBoost, 0, 20, 4\)/);
  assert.match(css, /\.reference-fidelity-field \{[\s\S]*border: 1px solid rgba\(var\(--mode-rgb\),\.24\)/);
  assert.match(css, /\.reference-fidelity-slider::before \{[\s\S]*var\(--reference-progress\)/);
  assert.match(css, /\.reference-fidelity-slider input\[type="range"\]::-webkit-slider-thumb/);
});

test('Identity Edit and Remix are separate engines with their intended input limits', () => {
  assert.match(html, /data-engine="krea2ref"[^>]*data-task-label="Identity Editing"/);
  assert.match(html, /data-engine="krea2remix"[^>]*data-task-label="Reference Remix"/);
  assert.match(app, /if \(state\.editEngine === 'krea2ref'\) return 2/);
  assert.match(app, /role\.textContent = idx === 0 \? 'Source \/ scene' : 'Subject'/);
  assert.match(server, /if \(p\.editEngine === 'krea2ref'\) return buildEditKrea2Identity\(p, refNames\)/);
  assert.match(server, /if \(p\.editEngine === 'krea2remix'\) return buildEditKrea2Remix\(p, refNames\)/);
  assert.match(server, /const rebalanceInputs = \{[\s\S]*refocus_strength: 0\.8,[\s\S]*guidance_strength: 0\.5,[\s\S]*enable_split: true,[\s\S]*steering: 1,[\s\S]*layer_multiplier: 1,[\s\S]*enable_step: true,/);
  assert.match(server, /Conditioning-Rebalance renamed these controls[\s\S]*filterInputs\(\) retains only the fields supported/);
});

test('Krea 2 Edit applies a configurable sampling preset without warning on its automatic LoRA', () => {
  assert.match(html, /id="defaultKrea2EditSteps"[^>]*value="10"/);
  assert.match(html, /id="defaultKrea2EditCfg"[^>]*value="1"/);
  assert.match(app, /function krea2IdentityEditSamplingPreset\(\)/);
  assert.match(app, /function applyKrea2IdentityEditSamplingPreset\(\)/);
  assert.match(app, /applyKrea2IdentityEditSamplingPreset\(\);[\s\S]{0,120}renderLoras\(\)/);
  assert.match(app, /\['krea2', 'krea2ref', 'krea2remix'\]\.includes\(state\.editEngine\)/);
  assert.match(app, /curLoras\(\)\.filter\(\(lora\) => lora && lora\.on && lora\.name && !lora\.managed\)/);
  assert.match(app, /return selected\.filter\(\(lora\) => !allowed\.has\(loraCategory\(lora\.name\)\)\)/);
  assert.match(server, /p\.steps = clampInt\(p\.steps, 8, 12, 10\); p\.cfg = clampNum\(p\.cfg, 1, 5, 1\)/);
});

test('dependency setup uses the latest full-rank Identity Edit v1.2 model and node revision', () => {
  assert.match(dependencies, /krea2_identity_edit_v1_2\.safetensors/);
  assert.match(dependencies, /7e68e90983b25e64dd02ac5d0c10593ea72a4cde/);
  assert.match(dependencies, /krea2ref: \{ label: 'Krea 2 Edit', nodes: \['krea2Edit'\], models: \['image', 'krea2Outpaint'\] \}/);
  assert.match(dependencies, /krea2remix: \{ label: 'Krea 2 Remix', nodes: \['rebalance'\], models: \['image'\] \}/);
});
