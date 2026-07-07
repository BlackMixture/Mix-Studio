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

test('the K mark opens a labeled mobile app drawer', () => {
  assert.match(html, /class="side-menu-trigger"[^>]+id="appMenuBtn"[^>]+aria-controls="appDrawer"/);
  assert.match(html, /id="appDrawer"[^>]+aria-hidden="true"/);
  assert.match(html, /id="appUpdateBtn"/);
  assert.match(app, /function openAppDrawer\(\)/);
  assert.match(css, /\.app-drawer-shell\.show \.app-drawer/);
  assert.match(css, /body\.app-drawer-open \.topbar/);
  assert.match(css, /\.chip-row\.prompt-tools \{ margin-top: 6px; margin-bottom: -6px; \}/);
});

test('the update flow pulls safely and waits for a conditional restart', () => {
  assert.match(server, /route === '\/api\/update'/);
  assert.match(server, /updateFromGit\(ROOT\)/);
  assert.match(server, /jobs\.size/);
  assert.match(app, /waitForAppRestart/);
  assert.match(app, /api\('\/api\/update'/);
});
