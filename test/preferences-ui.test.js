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

test('Advanced Settings exposes profile defaults and contextual suggestions', () => {
  assert.match(html, /data-settings-tab="defaults"/);
  assert.match(html, /data-settings-tab="suggestions"/);
  assert.match(html, /id="defaultSeedMode"/);
  assert.match(html, /id="defaultCreateCfg"/);
  assert.match(html, /id="defaultEditDenoise"/);
  assert.match(html, /id="defaultVideoMotion"/);
  assert.match(html, /id="contextPreferenceList"/);
});

test('contextual suggestion cards stay within the mobile settings pane', () => {
  assert.match(css, /\.settings-content \{[\s\S]*?overflow-x: hidden;/);
  assert.match(css, /\.context-preference-card \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.context-preference-card input \{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/);
  assert.match(css, /\.context-preference-title strong \{[\s\S]*?text-overflow: ellipsis;/);
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
  assert.match(app, /function defaultGenerationTuning\(mode\)/);
  assert.match(app, /function restoreGenerationTuning\(mode/);
  assert.match(app, /#stepsInput'\)\.value = tuning\.steps/);
  assert.match(app, /#seedInput'\)\.value = tuning\.seed/);
  assert.match(app, /#vidDur'\)\.value = d\.video\.duration/);
  assert.match(app, /#vidFree'\)\.value = d\.video\.motionFreedom/);
});

test('image sampling values persist by mode and expose quick default controls', () => {
  assert.match(html, /id="advDefaultsBtn"/);
  assert.match(html, /Double-tap any value to reset it/);
  assert.match(app, /generationTuning: \{ create: null, edit: null, video: null \}/);
  assert.match(app, /generationTuning: state\.generationTuning/);
  assert.match(app, /function captureGenerationTuning/);
  assert.match(app, /function resetGenerationControl/);
  assert.match(app, /control\.addEventListener\('dblclick'/);
  assert.match(app, /setSettingsTab\('defaults'\)/);
  assert.match(app, /turboPanel\.after\(control\)/);
});
