'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Settings presents a styled SAM3 dependency installer instead of an undefined health label', () => {
  assert.match(html, /id="sam3DependencyCard"/);
  assert.match(html, /id="sam3DependencyInstall"/);
  assert.match(app, /smartmask: 'Smart Mask \(SAM3\) nodes'/);
  assert.match(app, /api\('\/api\/dependencies\/sam3\/install'/);
  assert.match(app, /Restart ComfyUI/);
});

test('SAM3 dependency installation is owner-only and never runs during generation', () => {
  assert.match(server, /route === '\/api\/dependencies\/sam3\/install'/);
  assert.match(server, /Only the owner profile can install desktop dependencies/);
  assert.match(server, /Wait for the MixBox Studio queue to finish before installing dependencies/);
  assert.match(server, /installSam3\(RUNTIME\)/);
});
