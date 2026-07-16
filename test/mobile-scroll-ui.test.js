'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('LoRA cards use a shorter desktop hold while preserving touch-safe strength gestures', () => {
  const loraCardCss = css.match(/\.lora-card \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(loraCardCss, /touch-action: none;/);
  assert.match(css, /\.lora-card\.add \{[\s\S]*?touch-action: pan-y;/);
  assert.match(app, /function loraStrengthHoldDelay\(pointerType\)[\s\S]{0,180}pointerType === 'mouse' \? 140 : 300/);
  const regionLoraGesture = app.match(/function renderRegionLoraCard\(region\) \{[\s\S]*?\n\}/)?.[0] || '';
  const stackLoraGesture = app.match(/function wireLoraCard\(card, l, idx, arr\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(regionLoraGesture, /loraStrengthHoldDelay\(event\.pointerType\)/);
  assert.match(stackLoraGesture, /loraStrengthHoldDelay\(e\.pointerType\)/);
  assert.match(stackLoraGesture, /const dy = startY - e\.clientY/);
  assert.match(app, /const distance = Math\.abs\(e\.clientY - startY\)[\s\S]*?distance > 8[\s\S]*?window\.scrollBy\(0, lastY - e\.clientY\)/);
  assert.match(stackLoraGesture, /holdTimer = setTimeout\(\(\) => \{[\s\S]*?\}, loraStrengthHoldDelay\(e\.pointerType\)\)/);
  assert.match(html, /hold and slide up or down to adjust strength/);
  assert.match(app, /\['pointerdown', 'pointerup', 'pointercancel'\][\s\S]*menuBtn\.addEventListener\(type, \(event\) => event\.stopPropagation\(\)\)/);
  assert.match(app, /if \(e\.target\.closest\('\.lc-menu'\)\) return/);
  assert.match(css, /\.lora-card \.lc-menu \{[\s\S]*width: 34px;[\s\S]*height: 34px;[\s\S]*touch-action: manipulation;/);
});

test('regional canvas retains vertical page scrolling while region boxes stay direct-manipulation', () => {
  assert.match(css, /\.region-stage \{[\s\S]*?touch-action: pan-y;/);
  assert.match(css, /\.region-box \{[\s\S]*?touch-action: none;/);
});
