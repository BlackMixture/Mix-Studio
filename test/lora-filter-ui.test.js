'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('LoRA compatibility filtering is opt-in and uses a funnel control', () => {
  assert.match(appJs, /showAllLoras:\s*true/);
  assert.match(appJs, /const filtering = !state\.showAllLoras/);
  assert.match(appJs, /setAttribute\('aria-pressed', String\(filtering\)\)/);
  assert.match(indexHtml, /id="loraAllBtn"[^>]*aria-label="Filter to compatible LoRAs"/);
  assert.match(indexHtml, /M4 5h16l-6\.2 7\.2v5\.2l-3\.6 1\.8v-7L4 5Z/);
});
