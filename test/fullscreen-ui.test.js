'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));

test('the app drawer exposes a stateful fullscreen control', () => {
  assert.match(html, /id="fullscreenBtn"[^>]*aria-pressed="false"/);
  assert.match(html, /Full screen[\s\S]*Hide browser controls/);
  assert.match(css, /#fullscreenBtn\[aria-pressed="true"\]/);
  assert.match(app, /function syncFullscreenControl\(\)/);
});

test('fullscreen supports standard and WebKit browser APIs', () => {
  assert.match(app, /document\.fullscreenElement \|\| document\.webkitFullscreenElement/);
  assert.match(app, /target\.requestFullscreen \|\| target\.webkitRequestFullscreen/);
  assert.match(app, /document\.exitFullscreen \|\| document\.webkitExitFullscreen/);
  assert.match(app, /fullscreenchange/);
  assert.match(app, /webkitfullscreenchange/);
});

test('installed mobile mode is recognized as already fullscreen', () => {
  assert.equal(manifest.display, 'standalone');
  assert.match(app, /window\.matchMedia\('\(display-mode: standalone\)'\)/);
  assert.match(app, /Add Mix Studio to your Home Screen instead/);
});
