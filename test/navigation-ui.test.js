'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('navigation has primary modes and nested Create modes', () => {
  assert.match(html, /id="primaryTabs"[\s\S]*data-primary-mode="create">Create[\s\S]*data-primary-mode="edit">Edit[\s\S]*data-primary-mode="gallery">Library/);
  assert.match(html, /id="createTabs"[\s\S]*data-create-mode="image">Image[\s\S]*data-create-mode="region">Region[\s\S]*data-create-mode="video">Video/);
  assert.match(app, /function setCreateMode\(mode, openEditor\)/);
  assert.match(app, /const createActive = state\.view === 'create' \|\| state\.view === 'video'/);
});

test('regional prompts only submit from the Region create mode', () => {
  assert.match(app, /if \(state\.createMode !== 'region'\) return \[\]/);
  assert.match(app, /setCreateMode\('region', true\)/);
});

test('modes drive color tokens and prompt input lighting', () => {
  for (const mode of ['image', 'region', 'video', 'edit', 'library']) {
    assert.match(css, new RegExp(`body\\[data-ui-mode="${mode}"\\]`));
  }
  assert.match(css, /linear-gradient\(135deg, rgba\(var\(--mode-rgb\), 0\.1\), transparent 54%\)/);
  assert.match(app, /document\.body\.dataset\.uiMode/);
});
