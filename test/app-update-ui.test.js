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

test('the logo mark opens a labeled mobile app drawer', () => {
  assert.match(html, /class="side-menu-trigger"[^>]+id="appMenuBtn"[^>]+aria-label="Open MixBox Studio menu"[^>]+aria-controls="appDrawer"/);
  assert.match(html, /id="appDrawer"[^>]+aria-hidden="true"/);
  assert.match(html, /id="appUpdateBtn"/);
  assert.match(app, /function openAppDrawer\(\)/);
  assert.match(css, /\.app-drawer-shell\.show \.app-drawer/);
  assert.match(css, /body\.app-drawer-open \.topbar/);
  assert.match(css, /\.chip-row\.prompt-tools \{ margin-top: 6px; margin-bottom: -6px; \}/);
});

test('the installed web interface uses the MixBox Studio name and Modatory logo', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.match(html, /apple-mobile-web-app-title" content="MixBox Studio"/);
  assert.match(html, /<title>MixBox Studio<\/title>/);
  assert.match(html, /class="brand-name">MixBox Studio/);
  assert.match(html, /id="appDrawerTitle">MixBox Studio/);
  assert.equal(manifest.name, 'MixBox Studio');
  assert.equal(manifest.short_name, 'MixBox');
  // top-left mark is the Modatory logo (neon-green bars + dot)
  assert.match(html, /side-menu-mark-logo[\s\S]{0,400}#75ff19/);
});

test('advanced settings live in the app drawer instead of the top bar', () => {
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1] || '';
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  assert.doesNotMatch(topbar, /id="settingsBtn"/);
  assert.match(drawer, /id="settingsBtn"[\s\S]*Advanced Settings[\s\S]*Models &amp; connection/);
  assert.match(app, /\$\('#settingsBtn'\)\.addEventListener\('click', async \(\) => \{\s*closeAppDrawer\(\)/);
});

test('app drawer mirrors primary navigation and Create submodes', () => {
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  assert.match(drawer, /id="drawerCreateBtn"[^>]*aria-controls="drawerCreateModes"/);
  assert.match(drawer, /data-drawer-create-mode="image"[\s\S]*data-drawer-create-mode="region"[\s\S]*data-drawer-create-mode="video"/);
  assert.match(drawer, /data-drawer-view="edit"/);
  assert.match(drawer, /data-drawer-view="gallery"[\s\S]*Library/);
  assert.match(app, /function renderAppDrawerNavigation\(\)/);
  assert.match(app, /\$\('#drawerCreateBtn'\)\.addEventListener\('click'/);
  assert.match(app, /\$\$\('\[data-drawer-create-mode\]'\)/);
  assert.match(app, /\$\$\('\[data-drawer-view\]'\)/);
  assert.match(css, /\.app-drawer-nav-item\.active/);
});

test('drawer Create subnavigation expands and collapses with accessible motion', () => {
  assert.match(app, /modes\.classList\.toggle\('is-collapsed', !expanded\)/);
  assert.match(app, /modes\.setAttribute\('aria-hidden', String\(!expanded\)\)/);
  assert.match(app, /modes\.inert = !expanded/);
  assert.match(css, /\.app-drawer-create-modes \{[\s\S]*max-height: 120px;[\s\S]*transition: max-height 220ms/);
  assert.match(css, /\.app-drawer-create-modes\.is-collapsed \{[\s\S]*max-height: 0;[\s\S]*opacity: 0;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.app-drawer-create-modes/);
});

test('the update flow pulls safely and waits for a conditional restart', () => {
  assert.match(server, /route === '\/api\/update'/);
  assert.match(server, /updateFromGit\(ROOT\)/);
  assert.match(server, /jobs\.size/);
  assert.match(app, /waitForAppRestart/);
  assert.match(app, /api\('\/api\/update'/);
});
