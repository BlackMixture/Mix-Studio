'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('LoRA cards preserve their hold-and-vertical-slide strength gesture', () => {
  assert.match(css, /\.lora-card \{[\s\S]*?touch-action: none;/);
  assert.match(app, /hold \(300ms\) \+ slide up\/down adjusts[\s\S]*const dy = startY - e\.clientY/);
  assert.match(app, /Math\.abs\(e\.clientY - startY\) > 12/);
  assert.match(html, /hold and slide up or down to adjust strength/);
});

test('regional canvas retains vertical page scrolling while region boxes stay direct-manipulation', () => {
  assert.match(css, /\.region-stage \{[\s\S]*?touch-action: pan-y;/);
  assert.match(css, /\.region-box \{[\s\S]*?touch-action: none;/);
});
