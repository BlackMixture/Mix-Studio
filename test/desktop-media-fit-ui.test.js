'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

test('desktop center stage and focused viewer contain media without cropping', () => {
  assert.match(html, /id="desktopStageImg"[\s\S]*id="desktopStageVideo"/);
  assert.match(css, /\.desktop-stage-media > img,[\s\S]*\.desktop-stage-media > video \{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*object-fit: contain !important;[\s\S]*object-position: center center/);
  assert.match(css, /\.desktop-stage-media > img\[hidden\],[\s\S]*\.desktop-stage-empty\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.lightbox-img-wrap img,[\s\S]*\.lightbox-img-wrap video \{[\s\S]*object-fit: contain;[\s\S]*object-position: center center;[\s\S]*max-width: calc\(100% - 24px\)/);
});
