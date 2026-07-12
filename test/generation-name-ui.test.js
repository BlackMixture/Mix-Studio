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

test('focused gallery exposes an inline generation name instead of a dialog', () => {
  assert.match(html, /id="lbTitle"[^>]*type="text"[^>]*maxlength="80"/);
  assert.match(html, /aria-label="Generation name"/);
  assert.match(css, /\.generation-name-input:focus/);
  assert.match(app, /setGenerationNameInput\(it, selVideo \|\| selComposite \|\| null\)/);
  assert.doesNotMatch(app, /askText\([^)]*Rename generation/);
  assert.match(html, /id="desktopStageTitle">Ready to create</);
  assert.match(app, /item\.mode === 'edit' \? 'Latest edit' : 'Latest generation'/);
});

test('generation rename persists through a profile-scoped item endpoint', () => {
  assert.match(server, /req\.method === 'PATCH'/);
  assert.match(server, /normalizeGenerationName\(body\.name\)/);
  assert.match(app, /method: 'PATCH'/);
  assert.match(app, /\/api\/item\/.*encodeURIComponent/);
});

test('saved names participate in library search, sorting, and downloads', () => {
  assert.match(app, /it\.name,[\s\S]*it\.prompt/);
  assert.match(app, /a\.name \|\| a\.file \|\| a\.prompt/);
  assert.match(app, /generationDownloadStem\(it, 'kreastudio'\)/);
  assert.match(server, /generationFileStem\(item, `generation-\$\{index \+ 1\}`\)/);
});
