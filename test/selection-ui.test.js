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

test('gallery dates and search results can be selected as visible groups', () => {
  assert.match(html, /id="gallerySearchSelectAll"[^>]*>Select all/);
  assert.match(app, /divider\.dataset\.itemIds = dateIds\.join\(','\)/);
  assert.match(app, /divider\.addEventListener\('click', \(\) => toggleBulkSelection\(dateIds\)\)/);
  assert.match(app, /gallerySearchSelectAll.*toggleBulkSelection\(visibleItems\(\)\.map/s);
  assert.match(app, /function syncSelectionVisuals\(\)/);
});

test('selected gallery cards shrink and restore with a smooth transition', () => {
  assert.match(css, /\.card \{[\s\S]*transition: transform 280ms cubic-bezier/);
  assert.match(css, /\.card\.selected \{[\s\S]*transform: scale\(0\.89\)/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.card/);
});

test('hold-and-drag selection auto-scrolls near the visible gallery edges', () => {
  assert.match(app, /function gallerySelectionScrollSpeed\(clientY\)/);
  assert.match(app, /function runGallerySelectionAutoScroll\(\)/);
  assert.match(app, /window\.scrollBy\(0, speed\)/);
  assert.match(app, /beginGallerySelectionDrag\(card, pointerId, lastXY\[0\], lastXY\[1\]\)/);
  assert.match(css, /body\.gallery-select-dragging \{/);
});

test('selection bar exposes save, group, composite, move, delete, and swipe-up insights', () => {
  for (const id of ['selSave', 'selGroup', 'selComposite', 'selMove', 'selDelete', 'selInsightsHandle']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="selectionConsoleDetails"/);
  assert.match(html, /id="selDock"/);
  assert.match(app, /function openSelectionInsights\(\)/);
  assert.match(app, /function dockSelectionConsole\(\)/);
  assert.match(app, /selectBarSwipe\.height > target \* 0\.46/);
  assert.match(css, /\.select-bar\.is-expanded \{ --selection-detail-height:/);
  assert.match(css, /\.select-actions \{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.select-actions \.action-btn \{[\s\S]*border-radius: 999px/);
  assert.match(app, /\/api\/items\/selection-stats/);
  assert.match(app, /\/api\/items\/group/);
  assert.match(app, /\/api\/items\/download\?ids=/);
  assert.match(app, /mix-studio-selection\.zip/);
  assert.match(server, /route === '\/api\/items\/selection-stats'/);
  assert.match(server, /route === '\/api\/items\/group'/);
  assert.match(server, /route === '\/api\/items\/download'/);
});

test('selected images can create a grid contact sheet', () => {
  assert.match(app, /type: 'selection', ids/);
  assert.match(server, /async function buildImageContactSheet\(imageNames\)/);
  assert.match(server, /\['down', true, 8, 'black'\]/);
  assert.match(server, /type === 'selection'/);
  assert.match(server, /sourceItemIds:/);
});

test('arbitrary generation groups collapse into one gallery entry and remain browsable', () => {
  assert.match(app, /item\.angleGroupId \|\| item\.generationGroupId/);
  assert.match(app, /function generationGroupItems\(item\)/);
  assert.match(app, /Generation \$\{generationIndex \+ 1\} of \$\{generationItems\.length\}/);
  assert.match(server, /item\.generationGroupId = generationGroupId/);
});
