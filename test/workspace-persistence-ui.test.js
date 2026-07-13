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
  assert.match(app, /ks-workspaces-/);
  assert.match(app, /function renderSavedWorkspaces\(\)/);
  assert.match(app, /localStorage\.setItem\(formKey\(\), JSON\.stringify\(entry\.snapshot\)\)/);
  assert.match(css, /\.saved-workspace/);
  assert.match(css, /\.sheet-panel\.workspaces-panel \{[^}]*background: #000/);
});

test('reset clears only the current autosave and keeps named workspaces', () => {
  assert.match(app, /Reset current workspace\?/);
  assert.match(app, /localStorage\.removeItem\(formKey\(\)\)/);
  assert.doesNotMatch(app, /removeItem\(workspaceLibraryKey\(\)\)/);
  assert.match(css, /#appDialogSheet \{ z-index: 220; \}/);
  assert.match(app, /if \(!inputOptions && !choices\.length\) \$\('#appDialogConfirm'\)\.focus\(\)/);
});

test('interactive controls use the shared SVG language instead of emoji icons', () => {
  assert.doesNotMatch(app + html, /[\u{1F300}-\u{1FAFF}]|✨/u);
  assert.match(app, /motionButtonMarkup = \(result\) => `\$\{actionIconMarkup\(result \? 'video' : 'motion'\)\}/);
  assert.match(app, /actionIconMarkup\('delete'\)/);
  assert.match(html, /id="seedDice"[\s\S]*?<svg/);
});
