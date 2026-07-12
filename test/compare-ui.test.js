'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('upscale comparison supports synchronized zoom, pan, reveal, and image dimensions', () => {
  for (const id of ['cmpBMask', 'cmpRevealMode', 'cmpMoveMode', 'cmpZoomOut', 'cmpZoomIn', 'cmpActual', 'cmpFit', 'cmpZoomValue', 'cmpDimensions']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /const compareState = \{/);
  assert.match(app, /function setCompareZoom\(value, clientX, clientY\)/);
  assert.match(app, /function actualSizeCompare\(\)/);
  assert.match(app, /gesture\?\.kind === 'pinch'/);
  assert.match(app, /stage\.addEventListener\('wheel'/);
  assert.match(app, /stage\.addEventListener\('dblclick'/);
  assert.match(app, /stage\.addEventListener\('keydown'/);
  assert.match(app, /#cmpBMask/);
  assert.match(css, /\.compare-upscaled-mask \{[\s\S]*clip-path: inset\(0 0 0 50%\)/);
  assert.match(css, /\.compare-stage\.mode-pan \{ cursor: grab; \}/);
  assert.match(css, /\.compare-console \{[\s\S]*background: #000/);
  assert.match(html, /id="cmpDivider"><span[^>]*><svg[\s\S]*M5 12h14/);
  assert.match(css, /\.compare-divider \{[\s\S]*width: 1px/);
});
