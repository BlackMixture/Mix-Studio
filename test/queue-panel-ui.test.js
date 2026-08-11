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

test('Queue Jobs and Downloads use a subtle animated segmented selector', () => {
  assert.match(html, /class="queue-tabs-indicator"/);
  assert.match(html, /class="queue-tab-label">Jobs/);
  assert.match(html, /class="queue-tab-count" id="queueDownloadsCount"/);
  const indicator = css.match(/\.queue-tabs-indicator\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(indicator, /border: 1px solid rgba\(157,173,208,\.28\)/);
  assert.doesNotMatch(indicator, /var\(--gemini\)/);
  assert.match(css, /transform: translateX\(calc\(var\(--queue-tab-index\) \* 100%\)\)/);
  assert.match(app, /\$\('#queueTabs'\)\.style\.setProperty\('--queue-tab-index', jobsActive \? '0' : '1'\)/);
});

test('Queue controls stay fixed while only jobs or downloads own the scrollbar', () => {
  const panel = css.match(/\.sheet\.queue-dialog-sheet\s*>\s*\.sheet-panel\s*\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(panel, /overflow: hidden/);
  assert.match(panel, /rgba\(8,10,15,\.91\)/);
  assert.match(css, /#queueJobsPanel:not\(\[hidden\]\),[\s\S]{0,180}display: flex/);
  assert.match(css, /#queueList,[\s\S]{0,180}overflow-y: auto/);
  assert.match(css, /scrollbar-gutter: stable/);
  assert.match(app, /gesture\.row\.closest\('#queueList'\)/);
  assert.match(css, /#queueList\.queue-drag-scroll-lock/);
});
