'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('LoRA grids preserve vertical page scrolling on mobile', () => {
  assert.match(css, /\.lora-card \{[\s\S]*?touch-action: pan-y;/);
  assert.match(app, /horizontal drag adjusts strength[\s\S]*const dx = e\.clientX - startX/);
  assert.match(app, /Math\.abs\(dy\) > 12/);
  assert.match(html, /hold and slide sideways to adjust strength/);
});

test('LoRA cards engage strength adjustment on an immediate horizontal drag', () => {
  assert.match(app, /const beginAdjusting = \(\) => \{/);
  assert.match(app, /Math\.abs\(dx\) > 8 && Math\.abs\(dx\) > Math\.abs\(dy\)/);
  assert.match(app, /l\.strength = Math\.max\(0, Math\.min\(2, Math\.round\(\(startStrength \+ dx \/ 75\)/);
});

test('Empty regional grid space permits vertical page scrolling', () => {
  assert.match(css, /\.region-stage \{[\s\S]*?touch-action: pan-y;/);
  assert.match(css, /\.region-box \{[\s\S]*?touch-action: none;/);
});
