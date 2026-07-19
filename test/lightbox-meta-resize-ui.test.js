'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('focused generation info has a visible, accessible top resize handle', () => {
  assert.match(html, /id="lbMetaPanel"[\s\S]*id="lbMetaHandle"[^>]*role="separator"/);
  assert.match(html, /id="lbMetaHandle"[^>]*aria-controls="lbMeta"[^>]*aria-orientation="horizontal"/);
  assert.match(html, /aria-keyshortcuts="ArrowUp ArrowDown Home End Enter Space"/);
  assert.ok(html.indexOf('id="lbMetaHandle"') < html.indexOf('id="lbMeta"'));
  assert.match(css, /\.lightbox-meta-panel \{[\s\S]*grid-template-rows: 36px minmax\(0, 1fr\);/);
  assert.match(css, /\.lightbox-meta-handle \{[\s\S]*cursor: ns-resize;[\s\S]*touch-action: none;/);
  assert.match(css, /\.lightbox-meta-panel\.is-collapsed \.lightbox-meta \{ visibility: hidden; \}/);
  assert.match(css, /#lightbox \.lightbox-meta-panel \{[\s\S]*grid-row: 4;/);
});

test('generation info drag, click, and keyboard controls resize without navigating the gallery', () => {
  assert.match(app, /const LIGHTBOX_META_COLLAPSED = 36;/);
  assert.match(app, /const LIGHTBOX_META_DEFAULT = 144;/);
  assert.match(app, /const delta = active\.startY - event\.clientY;[\s\S]*active\.pendingHeight = active\.startHeight \+ delta;/);
  assert.match(app, /handle\.addEventListener\('pointerup', finishLightboxMetaResize\)/);
  assert.match(app, /height < LIGHTBOX_META_COLLAPSED \+ 38[\s\S]*height = LIGHTBOX_META_COLLAPSED/);
  assert.match(app, /handle\.addEventListener\('click',[\s\S]*lightboxMetaLayout\.lastExpanded[\s\S]*LIGHTBOX_META_COLLAPSED/);
  assert.match(app, /event\.key === 'ArrowUp'[\s\S]*lightboxMetaLayout\.lastExpanded[\s\S]*event\.key === 'ArrowDown'[\s\S]*LIGHTBOX_META_COLLAPSED[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\);/);
  assert.match(app, /handle\.setAttribute\('aria-valuetext', collapsed \? 'Generation info, hidden'/);
});

test('generation info height persists and remains bounded after viewport changes', () => {
  assert.match(app, /profileStorageKey\('ks-lightbox-meta-layout'\)/);
  assert.match(app, /localStorage\.setItem\(lightboxMetaStorageKey\(\), JSON\.stringify/);
  assert.match(app, /function restoreLightboxMetaLayout\(\)[\s\S]*localStorage\.getItem\(lightboxMetaStorageKey\(\)/);
  assert.match(app, /Math\.min\(420, Math\.round\(window\.innerHeight \* 0\.44\)/);
  assert.match(app, /window\.addEventListener\('resize', \(\) => applyLightboxMetaHeight\(\)\)/);
  assert.match(app, /restoreLightboxMetaLayout\(\);[\s\S]*wireLightboxMetaResizer\(\);/);
});
