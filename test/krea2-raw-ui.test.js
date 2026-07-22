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
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'installer', 'feature-manifest.json'), 'utf8'));

test('Create Image exposes a Turbo switch that defaults on', () => {
  assert.match(html, /id="kreaTurboToggle"[^>]*role="switch"[^>]*aria-checked="true"/);
  assert.match(html, /id="kreaModelSummary">Krea 2 · fast</);
  assert.ok(html.indexOf('id="resPanel"') < html.indexOf('id="kreaTurboToggle"'));
  assert.match(css, /\.krea-model-switch\[aria-checked="true"\]/);
  assert.match(app, /krea2Turbo: true/);
  assert.match(app, /button\.setAttribute\('aria-checked', String\(state\.krea2Turbo\)\)/);
  assert.match(app, /`Krea 2 · fast · \$\{steps\} steps`/);
  assert.doesNotMatch(app, /\$\('#stepsInput'\)\.value = 8;/);
  assert.match(server, /p\.steps = clampInt\(p\.steps, 1, 100, p\.mode === 't2i' && p\.krea2Turbo \? 8 : 12\)/);
});

test('Raw mode manages the Turbo LoRA without overwriting user sampling values', () => {
  assert.match(app, /DEFAULT_KREA2_TURBO_LORA = 'krea2_turbo_lora_rank_64_bf16\.safetensors'/);
  assert.match(app, /name, strength: 0\.6, on: true/);
  assert.match(app, /managed = 'krea2-raw-turbo'/);
  assert.doesNotMatch(app, /turboLora\.on \? 12 : 52/);
  assert.doesNotMatch(app, /turboLora\.on \? 1 : 3\.5/);
  assert.match(app, /function detachKrea2RawTurboLora\(\)/);
  assert.match(app, /managedLoraChanged\(l\)/);
  assert.match(app, /const steps = Number\(\$\('#stepsInput'\)\.value\)/);
  assert.match(app, /krea2Turbo: !krea2Raw/);
  assert.match(app, /krea2RawTurboLora: krea2Raw \? state\.krea2RawTurboLora : undefined/);
});

test('server selects Raw weights and records the model mode for reuse', () => {
  assert.match(server, /krea2RawUnet: 'krea2_raw_fp8_scaled\.safetensors'/);
  assert.match(server, /krea2TurboLora: 'krea2_turbo_lora_rank_64_bf16\.safetensors'/);
  assert.match(server, /params\.krea2Turbo === false \? settings\.krea2RawUnet : settings\.unet/);
  assert.match(server, /p\.krea2Turbo = p\.mode === 'edit' \? true : p\.krea2Turbo !== false/);
  assert.match(server, /krea2Turbo: job\.params\.mode === 't2i'/);
  assert.match(server, /krea2RawTurboLora: job\.params\.mode === 't2i'/);
});

test('Raw model and Turbo LoRA are configurable but remain an explicit optional install', () => {
  assert.match(html, /id="setKrea2RawUnet"/);
  assert.match(html, /id="setKrea2TurboLora"/);
  assert.match(app, /setKrea2RawUnet/);
  assert.match(app, /setKrea2TurboLora/);
  const core = manifest.features.find((feature) => feature.id === 'core.image');
  assert.equal(core.models.includes('krea2-raw'), false);
  assert.equal(core.models.includes('krea2-turbo-lora'), false);
  assert.match(app, /state\.krea2Turbo === false\) components\.add\('krea2raw'\)/);
  assert.match(app, /Krea 2 Raw is optional and will be offered when you generate/);
  assert.match(server, /if \(krea2\.raw && !krea2\.raw\.ok\) ids\.add\('krea2raw'\)/);
});
