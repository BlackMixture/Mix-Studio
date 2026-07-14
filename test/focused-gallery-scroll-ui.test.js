'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('focused gallery metadata exposes only available vertical scroll directions', () => {
  assert.match(app, /function syncLightboxScrollFades\(\)/);
  assert.match(app, /meta\.scrollHeight - meta\.clientHeight - meta\.scrollTop/);
  assert.match(app, /classList\.toggle\('can-scroll-up', meta\.scrollTop > 2\)/);
  assert.match(app, /classList\.toggle\('can-scroll-down', metaRemaining > 2\)/);
  assert.match(app, /lbMeta'\)\.addEventListener\('scroll', syncLightboxScrollFades, \{ passive: true \}\)/);
  assert.match(app, /metaScroller\.scrollTop = 0/);
  assert.match(css, /\.lightbox-meta\.can-scroll-down \{[\s\S]*linear-gradient\(to bottom/);
  assert.match(css, /\.lightbox-meta\.can-scroll-up \{[\s\S]*linear-gradient\(to bottom/);
  assert.match(css, /\.lightbox-meta\.can-scroll-up\.can-scroll-down \{/);
  assert.match(css, /\.lightbox-meta::\-webkit-scrollbar \{ display: none/);
});

test('focused gallery actions expose only available horizontal scroll directions', () => {
  assert.match(app, /actions\.scrollWidth - actions\.clientWidth - actionLeft/);
  assert.match(app, /classList\.toggle\('can-scroll-left', actionLeft > 2\)/);
  assert.match(app, /classList\.toggle\('can-scroll-right', actionRemaining > 2\)/);
  assert.match(app, /lbActions'\)\.addEventListener\('scroll', syncLightboxScrollFades, \{ passive: true \}\)/);
  assert.match(app, /actions\.scrollLeft = 0/);
  assert.match(app, /requestAnimationFrame\(syncLightboxScrollFades\)/);
  assert.match(css, /\.action-row\.can-scroll-right \{[\s\S]*linear-gradient\(to right/);
  assert.match(css, /\.action-row\.can-scroll-left \{[\s\S]*linear-gradient\(to right/);
  assert.match(css, /\.action-row\.can-scroll-left\.can-scroll-right \{/);
  assert.match(css, /-webkit-mask-image:/);
  assert.match(css, /mask-image:/);
});
