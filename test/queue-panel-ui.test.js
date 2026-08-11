'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('Queue opens as a centered dialog instead of a bottom sheet', () => {
  assert.match(html, /class="sheet centered-dialog-sheet queue-dialog-sheet" id="queueSheet"/);
  assert.match(css, /\.sheet\.queue-dialog-sheet\s*>\s*\.sheet-panel\s*\{[\s\S]{0,240}width: min\(640px, 100%\)/);
  assert.match(css, /max-height: min\(78dvh, 720px\)/);
});

test('Queue Jobs and Downloads use the branded animated segmented selector', () => {
  assert.match(html, /class="queue-tabs-indicator"/);
  assert.match(html, /class="queue-tab-label">Jobs/);
  assert.match(html, /class="queue-tab-count" id="queueDownloadsCount"/);
  assert.match(css, /\.queue-tabs-indicator\s*\{[\s\S]{0,500}var\(--gemini\) border-box/);
  assert.match(css, /transform: translateX\(calc\(var\(--queue-tab-index\) \* 100%\)\)/);
  assert.match(app, /\$\('#queueTabs'\)\.style\.setProperty\('--queue-tab-index', jobsActive \? '0' : '1'\)/);
});
