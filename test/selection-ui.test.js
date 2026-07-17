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

test('selection bar exposes save, group, ungroup, composite, move, delete, and swipe-up insights', () => {
  for (const id of ['selSave', 'selGroup', 'selUngroup', 'selComposite', 'selMove', 'selDelete', 'selInsightsHandle']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="selectionConsoleDetails"/);
  assert.match(html, /id="selectionConsoleMoreActions"/);
  assert.match(html, /id="selDock"/);
  assert.match(app, /function openSelectionInsights\(\)/);
  assert.match(app, /function dockSelectionConsole\(\)/);
  assert.match(app, /function scheduleSelectionInsightsRefresh\(delay = 120\)/);
  assert.match(app, /function populateSelectionExpandedActions\(\)/);
  assert.match(app, /filter\(\(button\) => button && !button\.hidden\)/);
  assert.match(app, /buttons\.slice\(visible\)\.forEach\(\(button\) => more\.appendChild\(button\)\)/);
  assert.match(app, /function restoreSelectionActions\(\)/);
  assert.match(app, /function setSelectionUiActive\(active\)/);
  assert.match(app, /document\.body\.classList\.toggle\('gallery-selection-active', isActive\)/);
  assert.match(app, /const active = state\.selectMode && state\.selected\.size > 0;[\s\S]{0,100}setSelectionUiActive\(active\);[\s\S]{0,60}if \(!active\) return;/);
  assert.match(app, /classList\.contains\('is-expanded'\)\) scheduleSelectionInsightsRefresh\(\)/);
  assert.match(app, /generationTimingComplete === false \? '~' : ''/);
  assert.match(app, /selectBarSwipe\.height > target \* 0\.46/);
  assert.match(css, /\.select-bar\.is-expanded \{[^}]*background: #000/);
  assert.match(css, /body\.gallery-selection-active \.generate-dock \{[\s\S]*opacity: 0;[\s\S]*pointer-events: none;[\s\S]*transform: translateY\(24px\)/);
  assert.match(css, /\.select-bar\.is-expanded \{[^}]*--selection-detail-height: min\(360px, 50dvh\)/);
  assert.match(css, /\.select-bar \{[\s\S]*background: #000/);
  assert.match(css, /\.select-bar\.is-expanded \.selection-console-details \{[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior: contain/);
  assert.match(app, /return Math\.min\(360, window\.innerHeight \* 0\.5\)/);
  assert.match(css, /\.select-bar\.is-expanded \.select-actions \{ overflow: hidden/);
  assert.match(css, /\.selection-console-more-actions \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.select-actions \{[\s\S]*overflow-x: auto/);
  assert.match(css, /\.select-actions \.action-btn,[\s\S]*\.selection-console-more-actions \.action-btn \{[\s\S]*min-height: 50px;[\s\S]*border-radius: 999px/);
  assert.match(css, /\.selection-insights-grid section \{[\s\S]*background: transparent/);
  assert.match(app, /\/api\/items\/selection-stats/);
  assert.match(app, /\/api\/items\/group/);
  assert.match(app, /\/api\/items\/ungroup/);
  assert.match(app, /\/api\/items\/move/);
  assert.match(app, /function expandedGallerySelection/);
  assert.match(html, /id="moveSheetTitle"/);
  assert.match(app, /Move \$\{includedItems\.length\} generations/);
  assert.match(app, /\/api\/items\/download\?ids=/);
  assert.match(app, /mix-studio-selection\.zip/);
  assert.match(server, /route === '\/api\/items\/selection-stats'/);
  assert.match(server, /route === '\/api\/items\/group'/);
  assert.match(server, /route === '\/api\/items\/ungroup'/);
  assert.match(server, /route === '\/api\/items\/move'/);
  assert.match(server, /route === '\/api\/items\/download'/);
});

test('ungroup appears only for a user-created group with multiple live items and sits beside delete', () => {
  assert.match(app, /function selectedUngroupableGenerationGroupIds\(\)/);
  assert.match(app, /\(groupSizes\.get\(groupId\) \|\| 0\) > 1/);
  assert.match(app, /selUngroup'\)\.hidden = selectedUngroupableGenerationGroupIds\(\)\.size === 0/);
  assert.match(html, /id="selMove"[\s\S]*id="selUngroup"[\s\S]*id="selDelete"/);
  assert.match(app, /\['selSave', 'selGroup', 'selComposite', 'selMove', 'selUngroup', 'selDelete'\]/);
  assert.match(css, /\.select-actions \.action-btn\[hidden\],[\s\S]*\.selection-console-more-actions \.action-btn\[hidden\] \{ display: none; \}/);
});

test('selected images can create a grid contact sheet', () => {
  assert.match(app, /type: 'selection', ids/);
  assert.match(server, /async function buildImageContactSheet\(imageNames\)/);
  assert.match(server, /\['down', true, 8, 'black'\]/);
  assert.match(server, /type === 'selection'/);
  assert.match(server, /sourceItemIds:/);
});

test('arbitrary generation groups collapse into one gallery entry and remain browsable', () => {
  assert.match(app, /item\.generationGroupId \|\| item\.angleGroupId/);
  assert.match(app, /function generationGroupItems\(item\)/);
  assert.match(app, /Generation \$\{generationIndex \+ 1\} of \$\{generationItems\.length\}/);
  assert.match(server, /item\.generationGroupId = generationGroupId/);
  assert.match(server, /delete item\.generationGroupId/);
});

test('grouping selected cards merges every member of groups and mixed standalone items', () => {
  assert.match(app, /JSON\.stringify\(\{ ids, includeGroups: true \}\)/);
  assert.match(app, /Grouped \$\{result\.count \|\| ids\.length\} generations/);
  assert.match(server, /expandGalleryGroupSelection\(visible, ids\)/);
  assert.match(server, /count: items\.length/);
});

test('deleting a selected group expands every member and requires explicit confirmation', () => {
  assert.match(app, /const ids = expandedGallerySelection\(\)\.map\(\(item\) => item\.id\)/);
  assert.match(app, /includesWholeGroups = ids\.length > selectedCount/);
  assert.match(app, /title: deletingOneGroup[\s\S]*'Move this entire group to trash\?'/);
  assert.match(app, /All \$\{ids\.length\} generations in this group will be moved to Mix Studio trash/);
  assert.match(app, /confirmLabel: 'Move to trash'/);
  assert.match(app, /await Promise\.all\(ids\.map\(\(id\) => api\('\/api\/item\/' \+ id, \{ method: 'DELETE' \}\)\)\)/);
});

test('expanded selection actions remain clickable after overflow layout', () => {
  assert.match(app, /event\.target\.closest\('\.select-actions, \.selection-console-more-actions, #selCancel, #selDock'\)/);
  assert.match(app, /buttons\.slice\(visible\)\.forEach\(\(button\) => more\.appendChild\(button\)\)/);
  assert.match(html, /id="selectionConsoleMoreActions"[\s\S]*id="selUngroup"[\s\S]*id="selDelete"/);
});
