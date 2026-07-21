'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('setup includes an optional, replayable phone access guide', () => {
  for (const id of [
    'phoneAccessCard', 'phoneAccessToggle', 'phoneAccessGuide', 'phoneAccessStatus',
    'phoneAccessUrl', 'phoneAccessCopy', 'phoneAccessShare', 'tailscaleInstallDesktop',
    'tailscaleInstallPhone', 'phoneAccessOpen',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /href="https:\/\/tailscale\.com\/download"[^>]*target="_blank"/);
  assert.match(html, /Tailscale Funnel/);
  assert.match(app, /function renderPhoneAccess\(\)/);
  assert.match(app, /copyTextToClipboard\(url\)/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /openInitialSetup\(\{\s*step:\s*['"]finish['"][\s\S]{0,100}phoneGuide:\s*true/);
});

test('phone access status comes from the authenticated setup payload', () => {
  assert.match(server, /mobileAccessSummary\(os\.networkInterfaces\(\),\s*PORT\)/);
  assert.match(server, /mobileAccess,/);
  assert.match(app, /setupViewStatus\?\.mobileAccess/);
  assert.match(app, /access\.tailscaleUrl\s*\|\|\s*access\.localUrl/);
});

test('the animated phone guide fits phones and honors reduced motion', () => {
  assert.match(css, /\.phone-access-guide\s*\{[^}]*grid-template-columns:/s);
  assert.match(css, /@keyframes phoneSignal/);
  assert.match(css, /@media \(max-width:\s*680px\)[\s\S]*\.phone-access-guide\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.phone-access-signal i\s*\{\s*animation:\s*none/);
});

