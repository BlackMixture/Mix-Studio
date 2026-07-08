'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Advanced Settings exposes profile defaults and contextual suggestions', () => {
  assert.match(html, /data-settings-tab="defaults"/);
  assert.match(html, /data-settings-tab="suggestions"/);
  assert.match(html, /id="defaultSeedMode"/);
  assert.match(html, /id="defaultCreateCfg"/);
  assert.match(html, /id="defaultEditDenoise"/);
  assert.match(html, /id="defaultVideoMotion"/);
  assert.match(html, /id="contextPreferenceList"/);
});

test('profile preferences save separately from machine model settings', () => {
  assert.match(server, /route === '\/api\/preferences'/);
  assert.match(server, /db\.userPreferences/);
  assert.match(server, /mergeContextOverrides\(learned/);
  assert.match(app, /async function loadUserPreferences\(\)/);
  assert.match(app, /async function saveUserPreferences\(\)/);
  assert.match(app, /await saveUserPreferences\(\)/);
});

test('saved defaults are applied to image, edit, and video controls', () => {
  assert.match(app, /function applyGenerationDefaults\(\)/);
  assert.match(app, /#stepsInput'\)\.value = image\.steps/);
  assert.match(app, /#seedInput'\)\.value = d\.seed\.mode === 'fixed'/);
  assert.match(app, /#vidDur'\)\.value = d\.video\.duration/);
  assert.match(app, /#vidFree'\)\.value = d\.video\.motionFreedom/);
});
