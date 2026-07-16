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

test('settings auto-apply without a persistent footer action', () => {
  const settings = html.slice(html.indexOf('<!-- settings sheet -->'), html.indexOf('<!-- multi-select action bar -->'));
  assert.doesNotMatch(settings, /id="settingsSave"/);
  assert.doesNotMatch(settings, /class="settings-footer"/);
  assert.match(settings, /id="settingsSaveStatus"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(app, /function scheduleSettingsAutosave\(kind, delay = 480\)/);
  assert.match(app, /function flushSettingsAutosave\(\)/);
  assert.match(app, /settingsAutosaveKindForControl\(event\.target\)/);
  assert.match(app, /setSettingsSaveStatus\('Saving…', 'saving'\)/);
  assert.match(app, /setSettingsSaveStatus\('Saved', 'saved'\)/);
  assert.doesNotMatch(app, /\$\('#settingsSave'\)/);
});

test('custom settings controls explicitly join the appropriate autosave route', () => {
  assert.match(app, /scheduleSettingsAutosave\(id === 'setSmartFilenames' \? 'server' : 'media', 0\)/);
  assert.match(app, /setSvAttnValue\(option\.dataset\.attention\)[\s\S]{0,180}scheduleSettingsAutosave\('server', 0\)/);
  assert.match(app, /#defaultSeedMode button[\s\S]{0,300}scheduleSettingsAutosave\('preferences', 0\)/);
  assert.match(app, /defaultStrength: Number\(strengthInput\.value\)[\s\S]{0,100}scheduleSettingsAutosave\('preferences'\)/);
  assert.match(app, /suggestion: phraseInput\.value[\s\S]{0,100}scheduleSettingsAutosave\('preferences'\)/);
});

test('a pending app restart appears contextually beside the close button', () => {
  const title = html.match(/<h3 class="sheet-title" id="settingsTitle">([\s\S]*?)<\/h3>/)?.[1] || '';
  assert.match(title, /id="settingsSaveStatus"[\s\S]*id="settingsRestartApply"[^>]+hidden[\s\S]*class="settings-close"[^>]+data-close/);
  assert.match(css, /\.settings-title-actions \{[^}]*gap: 7px/);
  assert.match(css, /\.settings-panel > \.sheet-title \.settings-restart-apply \{[\s\S]*min-height: 31px[\s\S]*white-space: nowrap/);
  assert.match(app, /button\.hidden = !settingsAppRestartRequired \|\| !state\.profileIsOwner/);
  assert.match(app, /\$\('#settingsRestartApply'\)\.addEventListener\('click'/);
  assert.match(app, /api\('\/api\/app\/restart', \{ method: 'POST' \}\)/);
  assert.match(app, /await waitForAppRestart\(\)/);
});

test('only a changed ComfyUI URL currently requests a Mix Studio restart', () => {
  assert.match(server, /const APP_RESTART_SETTINGS_AT_BOOT = Object\.freeze\(\{ comfyUrl: settings\.comfyUrl \}\)/);
  assert.match(server, /function settingsRequireAppRestart\(\) \{\s*return settings\.comfyUrl !== APP_RESTART_SETTINGS_AT_BOOT\.comfyUrl;\s*\}/);
  assert.match(server, /function settingsResponse\(\) \{\s*return Object\.assign\(\{\}, settings, \{ appRestartRequired: settingsRequireAppRestart\(\) \}\);\s*\}/);
  const getRoute = server.slice(server.indexOf("route === '/api/settings' && req.method === 'GET'"), server.indexOf("route === '/api/setup/status'"));
  const postRoute = server.slice(server.indexOf("route === '/api/settings' && req.method === 'POST'"), server.indexOf("route === '/api/meta'"));
  assert.match(getRoute, /settingsResponse\(\)/);
  assert.match(postRoute, /settingsResponse\(\)/);
});
