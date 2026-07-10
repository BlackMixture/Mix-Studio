'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('focused gallery swipe directly moves current and neighboring media', () => {
  assert.match(html, /id="lbSwipePreview"/);
  assert.match(app, /function preloadLightboxNeighbors\(item\)/);
  assert.match(app, /function renderLightboxSwipe\(rawDx\)/);
  assert.match(app, /preview\.style\.transform = `translate3d\(\$\{side \+ dx\}px/);
  assert.match(app, /currentSwipe\.current\.animate/);
  assert.match(app, /Math\.abs\(rawDx\) >= wrap\.clientWidth \* 0\.2/);
  assert.match(app, /Math\.abs\(velocity\) >= 0\.48/);
  assert.match(app, /finishLightboxSwipe\(commit\)/);
  assert.match(app, /pendingNavigationItem = currentSwipe\.neighbor/);
  assert.match(app, /if \(pending\) openLightbox\(pending\.id\)/);
  assert.match(css, /\.lightbox-swipe-preview \{[\s\S]*will-change|#lbImg,[\s\S]*will-change: transform, opacity/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.lightbox-swipe-preview/);
});
