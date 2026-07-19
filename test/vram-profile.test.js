'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  applyLowVramImageLimits,
  lowVramDimensions,
  normalizeVramProfile,
  recommendedVramProfile,
  resolveVramProfile,
} = require('../lib/vram-profile');

const root = path.join(__dirname, '..');

test('VRAM profile recommends the guarded route through 12 GB', () => {
  assert.equal(recommendedVramProfile({ vramGb: 4 }), 'low');
  assert.equal(recommendedVramProfile({ vramGb: 8 }), 'low');
  assert.equal(recommendedVramProfile({ gpu: { vramGb: 12 } }), 'low');
  assert.equal(recommendedVramProfile({ vramGb: 16 }), 'standard');
  assert.equal(recommendedVramProfile({}), 'standard');
  assert.equal(normalizeVramProfile('unexpected'), 'auto');
  assert.equal(resolveVramProfile('auto', { vramGb: 8 }), 'low');
  assert.equal(resolveVramProfile('standard', { vramGb: 8 }), 'standard');
});

test('low VRAM image recommendations retain normal Krea resolution and bound larger requests', () => {
  assert.deepEqual(lowVramDimensions(1024, 1024), { width: 1024, height: 1024, adjusted: false });
  const bounded = lowVramDimensions(2048, 1024);
  assert.ok(bounded.width * bounded.height <= 1024 * 1024);
  assert.equal(bounded.width % 64, 0);
  assert.equal(bounded.height % 64, 0);
  const result = applyLowVramImageLimits({ width: 2048, height: 1024, batch: 4 });
  assert.equal(result.params.batch, 1);
  assert.equal(result.adjustments.length, 2);
});

test('setup and advanced settings expose the low VRAM route', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(html, /id="setupVramProfile"/);
  assert.match(html, /id="setVramProfile"/);
  assert.match(server, /applyLowVramImageLimits/);
  assert.match(server, /low_vram_confirmation/);
  assert.match(server, /lowVramChoice === 'safe'/);
  assert.match(server, /route === '\/api\/setup\/vram-profile'/);
  assert.match(app, /Use requested settings/);
  assert.match(app, /lowVramChoice/);
});
