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
  assert.match(app, /loadForm\(\);\nsetPromptDraft\(state\.prompts\[state\.view\] \|\| ''\);/);
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
});

test('reset clears only the current autosave and keeps named workspaces', () => {
  assert.match(app, /Reset current workspace\?/);
  assert.match(app, /localStorage\.removeItem\(formKey\(\)\)/);
  assert.doesNotMatch(app, /removeItem\(workspaceLibraryKey\(\)\)/);
});
