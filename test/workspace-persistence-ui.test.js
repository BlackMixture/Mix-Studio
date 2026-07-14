'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('current workspace autosave retains active mode, LoRAs, prompts, and durable media inputs', () => {
  assert.match(app, /workspaceVersion: 2/);
  assert.match(app, /activeView: \['create', 'edit', 'video'\]\.includes\(state\.view\)/);
  for (const field of ['refs', 'vidRef', 'vidEnd', 'vidDrive', 'vidFace', 'vidAudio']) {
    assert.match(app, new RegExp(`${field}:`));
  }
  assert.match(app, /serializeWorkspaceAsset/);
  assert.match(app, /restoreWorkspaceAsset/);
  assert.match(app, /vidScailFps: state\.vidScailFps/);
  assert.match(app, /state\.vidScailFps = \[16, 24\]\.includes\(Number\(f\.vidScailFps\)\)/);
  assert.match(app, /'vidScailMode', 'vidScailFps', 'vidScailStableTracking'/);
  assert.match(app, /window\.addEventListener\('pagehide', saveForm\)/);
  assert.match(app, /setView\(state\.view/);
  assert.match(app, /loadForm\(\);\r?\nsyncGallerySortControl\(\);\r?\nsetPromptDraft\(state\.prompts\[state\.view\] \|\| ''\);/);
});

test('gallery sorting persists in current and named workspace snapshots', () => {
  assert.match(app, /gallerySort: \['new', 'active', 'old', 'az'\]\.includes\(state\.sortMode\) \? state\.sortMode : 'new'/);
  assert.match(app, /state\.sortMode = \['new', 'active', 'old', 'az'\]\.includes\(f\.gallerySort\) \? f\.gallerySort : 'new'/);
  assert.match(app, /function syncGallerySortControl\(\)/);
  assert.match(app, /loadForm\(\);\r?\nsyncGallerySortControl\(\);/);
  assert.match(app, /state\.sortMode = b\.dataset\.sort;\r?\n  syncGallerySortControl\(\);\r?\n  saveForm\(\);/);
});

test('named workspaces can be saved, loaded, replaced, and deleted per profile', () => {
  assert.match(html, /id="workspacesBtn"/);
  assert.match(html, /id="workspacesSheet"/);
  assert.match(html, /id="workspaceSaveCurrent"/);
  assert.match(html, /id="workspaceReset"/);
  assert.match(app, /function workspaceLibraryKey\(\)/);
  assert.match(app, /profileStorageKey\('ks-workspaces'\)/);
  assert.match(app, /function renderSavedWorkspaces\(\)/);
  assert.match(app, /const key = formKey\(\);[\s\S]*localStorage\.setItem\(key, JSON\.stringify\(entry\.snapshot\)\);[\s\S]*reloadWithoutWorkspaceAutosave\(\)/);
  assert.match(css, /\.saved-workspace/);
  assert.match(css, /\.sheet-panel\.workspaces-panel \{[^}]*background: #000/);
});

test('reset clears only the current autosave and keeps named workspaces', () => {
  assert.match(app, /Reset current workspace\?/);
  assert.match(app, /const key = formKey\(\);\r?\n  if \(key\) localStorage\.removeItem\(key\);[\s\S]*reloadWithoutWorkspaceAutosave\(\)/);
  assert.doesNotMatch(app, /removeItem\(workspaceLibraryKey\(\)\)/);
  assert.match(css, /#appDialogSheet \{ z-index: 220; \}/);
  assert.match(app, /if \(!inputOptions && !choices\.length\) \$\('#appDialogConfirm'\)\.focus\(\)/);
});

test('workspace storage stays bound to the profile that loaded the page', () => {
  const declaration = app.match(/const workspaceSessionProfileId = localStorage\.getItem\('ks-profile-id'\) \|\| '';/)?.[0];
  const helpers = app.match(/function profileStorageKey\(prefix, profileId = workspaceSessionProfileId\) \{[\s\S]*?\r?\n\}\r?\n\r?\nfunction formKey\(\) \{[\s\S]*?\r?\n\}/)?.[0];
  assert.ok(declaration);
  assert.ok(helpers);

  const values = new Map([['ks-profile-id', 'owner']]);
  const localStorage = { getItem: (key) => values.get(key) || null };
  const storage = Function('localStorage', `${declaration}\n${helpers}\nreturn { formKey, profileStorageKey };`)(localStorage);
  assert.equal(storage.formKey(), 'ks-form-owner');
  assert.equal(storage.profileStorageKey('ks-workspaces'), 'ks-workspaces-owner');

  values.set('ks-profile-id', 'new-profile');
  assert.equal(storage.formKey(), 'ks-form-owner');
  assert.equal(storage.profileStorageKey('ks-workspaces'), 'ks-workspaces-owner');
});

test('new profiles start blank instead of loading a global or outgoing workspace', () => {
  const loadStart = app.indexOf('function loadForm()');
  const loadEnd = app.indexOf('function workspaceLibraryKey()', loadStart);
  const loadFormSource = app.slice(loadStart, loadEnd);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  assert.match(loadFormSource, /const key = formKey\(\);\r?\n  if \(!key\) return;/);
  assert.match(loadFormSource, /localStorage\.getItem\(key\) \|\| 'null'/);
  assert.doesNotMatch(loadFormSource, /localStorage\.getItem\('ks-form'\)/);
  assert.match(app, /localStorage\.removeItem\(profileStorageKey\('ks-form', r\.profile\.id\)\)/);
  assert.match(app, /localStorage\.removeItem\(profileStorageKey\('ks-workspaces', r\.profile\.id\)\)/);
  assert.match(app, /prompts: \{ create: '', edit: '', video: '' \}/);
  assert.match(app, /loras: \[\]/);
  assert.match(app, /videoLoras: \[\]/);
  assert.match(app, /editLoras: \[\]/);
  assert.match(app, /refs: \[null, null, null\]/);
  assert.match(app, /regions: \[\]/);
});

test('intentional reloads cannot recreate or overwrite workspace storage on pagehide', () => {
  assert.match(app, /function saveForm\(\) \{\r?\n  const key = formKey\(\);\r?\n  if \(suppressWorkspaceAutosave \|\| !key\) return;/);
  assert.match(app, /function reloadWithoutWorkspaceAutosave\(\) \{\r?\n  suppressWorkspaceAutosave = true;\r?\n  location\.reload\(\);\r?\n\}/);
  assert.match(app, /window\.addEventListener\('pagehide', saveForm\)/);
  assert.match(app, /window\.addEventListener\('storage',[\s\S]*event\.key !== 'ks-profile-id'[\s\S]*reloadWithoutWorkspaceAutosave\(\)/);
});

test('interactive controls use the shared SVG language instead of emoji icons', () => {
  assert.doesNotMatch(app + html, /[\u{1F300}-\u{1FAFF}]|✨/u);
  assert.match(app, /motionButtonMarkup = \(result\) => `\$\{actionIconMarkup\(result \? 'video' : 'motion'\)\}/);
  assert.match(app, /actionIconMarkup\('delete'\)/);
  assert.match(html, /id="seedDice"[\s\S]*?<svg/);
});
