'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Klein outpaint injects its managed LoRA into the normal adjustable stack', () => {
  assert.match(app, /kleinOutpaintConsistencyLoras: \{\}/);
  assert.match(app, /function syncKleinOutpaintConsistencyLora\(\)/);
  assert.match(app, /managed = 'klein-outpaint-consistency'/);
  assert.match(app, /function syncEditAutomaticLora\(\)/);
  assert.match(app, /managed = 'edit-workflow-auto'/);
  assert.match(app, /'krea2-outpaint': 'krea2_identity_edit_v1_1_r128\.safetensors'/);
  assert.match(app, /'qwen-lightning': 'Qwen-Image-Edit-2511-Lightning-4steps-V1\.0-bf16\.safetensors'/);
  assert.match(app, /stack\.splice\(0, stack\.length, managed, \.\.\.others\)/);
  assert.match(app, /syncKleinOutpaintConsistencyLora\(\);\s*syncEditAutomaticLora\(\);\s*const arr = curLoras\(\)/);
  assert.match(app, /Turn off automatic LoRA/);
  assert.match(app, /managedLoraChanged\(l\)/);
  assert.match(app, /lc-auto-badge/);
  assert.match(css, /\.lora-card \.lc-auto-badge/);
  assert.doesNotMatch(app, /setLorasExpanded\(true\)[\s\S]{0,120}klein-outpaint-consistency/);
});

test('server honors the managed consistency LoRA on-off state', () => {
  assert.match(server, /const consistencyOverride = \(Array\.isArray\(p\.loras\)/);
  assert.match(server, /const consistencyEnabled = !consistencyOverride \|\| consistencyOverride\.on !== false/);
  assert.match(server, /if \(consistencyEnabled && consistencyLora/);
});
