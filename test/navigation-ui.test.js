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
  assert.match(html, /id="createTabs"[\s\S]*data-create-mode="image">[\s\S]*<span>Image<\/span>[\s\S]*data-create-mode="region">[\s\S]*<span>Region<\/span>[\s\S]*data-create-mode="video">[\s\S]*<span>Video<\/span>/);
  assert.match(app, /function setCreateMode\(mode, openEditor\)/);
  assert.match(app, /const createActive = state\.view === 'create' \|\| state\.view === 'video'/);
});

test('regional prompts only submit from the Region create mode', () => {
  assert.match(app, /if \(state\.createMode !== 'region'\) return \[\]/);
  assert.match(app, /setCreateMode\('region', true\)/);
});

test('nested Create modes use icons instead of color dots', () => {
  assert.match(html, /data-create-mode="image">[\s\S]*<svg/);
  assert.match(html, /data-create-mode="region">[\s\S]*<svg/);
  assert.match(html, /data-create-mode="video">[\s\S]*<svg/);
  assert.match(css, /\.create-tabs \.tab::before \{ display: none; \}/);
});

test('modes drive color tokens and prompt input lighting', () => {
  for (const mode of ['image', 'region', 'video', 'edit', 'library']) {
    assert.match(css, new RegExp(`body\\[data-ui-mode="${mode}"\\]`));
  }
  assert.match(css, /linear-gradient\(135deg, rgba\(var\(--mode-rgb\), 0\.075\), transparent 54%\)/);
  assert.match(app, /document\.body\.dataset\.uiMode/);
});

test('primary navigation uses the neutral Modatory glow treatment', () => {
  assert.match(css, /\.primary-tabs \.tab::before \{ display: none; \}/);
  assert.match(css, /\.primary-tabs \.tab-pill \{[\s\S]*background: rgba\(255,255,255,0\.06\)/);
  assert.match(css, /\.primary-tabs \.tab-pill::after/);
});

test('only the Resolution section keeps an outer panel surface', () => {
  assert.match(css, /--page-bg: #000/);
  assert.match(css, /\.panel \{[\s\S]*border: 0;/);
  assert.match(css, /#view-create > \.panel:not\(\.res-panel\) \{[\s\S]*background: transparent;[\s\S]*box-shadow: none;/);
  assert.match(css, /\.prompt-box textarea \{[\s\S]*border: 1px solid var\(--line\)/);
});

test('Resolution expands with an accessible motion transition', () => {
  assert.match(html, /id="resBody" aria-hidden="true" inert>[\s\S]*class="res-body-inner"/);
  assert.match(css, /\.res-body \{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition:/);
  assert.match(css, /\.res-panel\.expanded \.res-body \{[\s\S]*grid-template-rows: 1fr;/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(app, /body\.inert = !expand/);
  assert.match(app, /body\.setAttribute\('aria-hidden', String\(!expand\)\)/);
});

test('Advanced uses the same animated accessible disclosure pattern', () => {
  assert.doesNotMatch(html, /<details class="adv">/);
  assert.match(html, /id="advHeader"[^>]*aria-expanded="false"[^>]*aria-controls="advBody"/);
  assert.match(html, /id="advBody" aria-hidden="true" inert/);
  assert.match(css, /\.adv-body \{[\s\S]*grid-template-rows: 0fr;[\s\S]*transition:/);
  assert.match(css, /\.adv\.expanded \.adv-body \{[\s\S]*grid-template-rows: 1fr;/);
  assert.match(app, /function setAdvancedExpanded\(open\)/);
});
