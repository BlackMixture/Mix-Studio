'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const modatoryLogo = fs.readFileSync(path.join(root, 'public', 'modatory-logo.svg'), 'utf8');

function appFunction(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  const end = app.indexOf(`\nfunction ${nextName}(`, start);
  assert.ok(start >= 0 && end > start, `${name} should be a standalone app helper`);
  return vm.runInNewContext(`(${app.slice(start, end)})`);
}

test('the logo mark opens a labeled mobile app drawer', () => {
  assert.match(html, /class="side-menu-trigger"[^>]+id="appMenuBtn"[^>]+aria-label="Open Mix Studio menu"[^>]+aria-controls="appDrawer"/);
  assert.match(html, /<button class="side-menu-trigger"[^>]*>[\s\S]*class="side-menu-icon"[\s\S]*class="brand-wordmark"[\s\S]*<\/button>/);
  assert.match(html, /id="appDrawer"[^>]+aria-hidden="true"/);
  assert.match(html, /id="appUpdateBtn"/);
  assert.match(app, /function openAppDrawer\(\)/);
  assert.match(css, /\.app-drawer-shell\.show \.app-drawer/);
  assert.match(css, /body\.app-drawer-open \.topbar/);
  assert.match(css, /\.side-menu-trigger:hover \.side-menu-mark-logo/);
  assert.match(css, /\.side-menu-trigger:hover \.side-menu-mark-menu/);
  assert.match(css, /\.chip-row\.prompt-tools \{ margin-top: 6px; margin-bottom: -6px; \}/);
});

test('the installed web interface uses the Mix Studio name and Modatory logo', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  assert.match(html, /apple-mobile-web-app-title" content="Mix Studio"/);
  assert.match(html, /<title>Mix Studio<\/title>/);
  assert.match(html, /class="brand-wordmark"><img src="\.\/mix-studio-wordmark-white-on-black\.svg" alt="Mix Studio"/);
  assert.match(html, /id="appDrawerTitle"><span class="drawer-wordmark-crop"><img src="\.\/mix-studio-wordmark-white-on-black\.svg" alt="Mix Studio"/);
  assert.match(css, /\.drawer-wordmark-crop \{[^}]*width: 154px/);
  assert.equal(manifest.name, 'Mix Studio');
  assert.equal(manifest.short_name, 'Mix Studio');
  assert.match(html, /<img class="side-menu-mark side-menu-mark-logo" src="\/modatory-logo\.svg"/);
  const wordmark = fs.readFileSync(path.join(root, 'public', 'mix-studio-wordmark-white-on-black.svg'), 'utf8');
  assert.match(wordmark, /<svg[^>]+viewBox="0 0 1310\.81 203\.85"/);
  assert.match(wordmark, /<g fill="#ffffff">/);
  assert.match(wordmark, /<path/g);
  assert.doesNotMatch(wordmark, /<text\b/);
  assert.match(css, /\.brand-wordmark img,[\s\S]*object-fit: contain;[\s\S]*object-position: left center;/);
  assert.match(modatoryLogo, /viewBox="0 0 734\.42 753\.63"/);
  assert.match(modatoryLogo, /#fdc302/);
  assert.match(modatoryLogo, /#026cfc/);
  assert.match(modatoryLogo, /#fb2026/);
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
  assert.match(app, /const presentedView = focusedResult \? 'gallery' : state\.view/);
  assert.match(app, /\$\('#drawerCreateBtn'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#drawerCreateBtn'\)\.addEventListener\('click',[\s\S]{0,260}if \(\$\('#lightbox'\)\.classList\.contains\('show'\)\) \{[\s\S]{0,80}closeLightbox\(\)/);
  assert.match(app, /\$\$\('\[data-drawer-create-mode\]'\)/);
  assert.match(app, /\$\$\('\[data-drawer-view\]'\)/);
  assert.match(app, /\$\$\('\[data-drawer-view\]'\)[\s\S]{0,180}if \(\$\('#lightbox'\)\.classList\.contains\('show'\)\) closeLightbox\(\)/);
  assert.match(css, /\.app-drawer-nav-item\.active/);
});

test('app drawer hides native scrollbars and uses edge fades as scroll affordances', () => {
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  assert.doesNotMatch(drawer, /<h3>Navigate<\/h3>/);
  assert.match(drawer, /class="app-drawer-scroll-region"[\s\S]*app-drawer-scroll-fade-top[\s\S]*app-drawer-scroll-fade-bottom/);
  assert.match(css, /\.app-drawer-body \{[\s\S]*scrollbar-width: none/);
  assert.match(css, /\.app-drawer-body::-webkit-scrollbar \{ display: none/);
  assert.match(css, /\.app-drawer-scroll-fade-bottom \{[\s\S]*linear-gradient\(to top, #000/);
  assert.match(app, /function syncAppDrawerScrollFades\(\)/);
  assert.match(app, /classList\.toggle\('can-scroll-up', body\.scrollTop > 2\)/);
  assert.match(app, /classList\.toggle\('can-scroll-down', remaining > 2\)/);
  assert.match(app, /app-drawer-body'\)\.addEventListener\('scroll', syncAppDrawerScrollFades/);
});

test('drawer Create subnavigation expands and collapses with accessible motion', () => {
  assert.match(app, /modes\.classList\.toggle\('is-collapsed', !expanded\)/);
  assert.match(app, /modes\.setAttribute\('aria-hidden', String\(!expanded\)\)/);
  assert.match(app, /modes\.inert = !expanded/);
  assert.match(css, /\.app-drawer-create-modes \{[\s\S]*max-height: 164px;[\s\S]*transition: max-height 220ms/);
  assert.match(css, /\.app-drawer-create-modes\.is-collapsed \{[\s\S]*max-height: 0;[\s\S]*opacity: 0;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.app-drawer-create-modes/);
});

test('drawer Create subnavigation matches the primary navigation scale', () => {
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  assert.match(drawer, /data-drawer-create-mode="image"[\s\S]*class="app-drawer-create-icon"[^>]*>[\s\S]*<svg/);
  assert.match(css, /\.app-drawer-create-item \{[\s\S]*min-height: 48px;[\s\S]*grid-template-columns: 32px minmax\(0, 1fr\);[\s\S]*font-size: 14px;[\s\S]*font-weight: 800;/);
  assert.match(css, /\.app-drawer-create-icon \{[\s\S]*width: 32px;[\s\S]*height: 32px;/);
  assert.match(css, /\.app-drawer-create-icon svg \{ width: 17px; height: 17px; \}/);
});

test('drawer selections use black borders against the drawer canvas', () => {
  assert.match(css, /\.app-drawer-nav-item\.active \{[^}]*border-color: #000;/);
  assert.match(css, /\.app-drawer-create-item\.active \{[^}]*border-color: #000;/);
});

test('the update flow pulls safely and waits for a conditional restart', () => {
  assert.match(server, /route === '\/api\/update'/);
  assert.match(server, /updateFromGit\(ROOT\)/);
  assert.match(server, /jobs\.size/);
  assert.match(app, /waitForAppRestart/);
  assert.match(app, /api\('\/api\/update'/);
});

test('semantic app versions are visible in the drawer and System settings', () => {
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<\/section>/)?.[1] || '';
  assert.match(drawer, /id="appVersionLabel"/);
  assert.match(systemPane, /Installed version[\s\S]*id="settingsAppVersion"[\s\S]*main · Owner · idle queue/);

  const releaseRenderer = app.slice(app.indexOf('function renderAppRelease('), app.indexOf('\nfunction renderAppUpdateAccess('));
  assert.match(releaseRenderer, /formatAppVersion\(state\.appRelease\.version, state\.appRelease\.revision\)/);
  assert.match(releaseRenderer, /\$\('#appVersionLabel'\)/);
  assert.match(releaseRenderer, /\$\('#settingsAppVersion'\)/);
  assert.match(app, /lastMeta = await api\('\/api\/meta'[\s\S]{0,220}renderAppRelease\(lastMeta\.app \|\| \{\}\)/);
  assert.match(css, /\.app-drawer-action #appVersionLabel \{[\s\S]*display: inline-flex;[\s\S]*border-radius: 999px;/);
});

test('app version formatting distinguishes SemVer, legacy revisions, and development builds', () => {
  const formatAppVersion = appFunction('formatAppVersion', 'renderAppRelease');
  assert.equal(formatAppVersion('1.0.0'), 'v1.0.0');
  assert.equal(formatAppVersion('2.3.4-beta.1+win'), 'v2.3.4-beta.1+win');
  assert.equal(formatAppVersion('', 'abcdef0123456789'), 'build abcdef0');
  assert.equal(formatAppVersion('9945455'), 'build 9945455');
  assert.equal(formatAppVersion('not-a-version'), 'Development build');
  assert.equal(formatAppVersion(), 'Development build');
});

test('update status copy uses the formatted release instead of exposing a raw version field', () => {
  const handler = app.slice(app.indexOf("$('#appUpdateBtn').addEventListener"), app.indexOf("$('#appRestartBtn').addEventListener"));
  assert.match(handler, /const versionLabel = renderAppRelease\(result\)/);
  assert.match(handler, /Mix Studio \$\{versionLabel\} is up to date/);
  assert.match(handler, /Updated to \$\{versionLabel\}/);
  assert.doesNotMatch(handler, /\$\{result\.version\}/);
});

test('dirty update errors identify tracked files and retain the generic fallback', () => {
  const formatAppUpdateError = appFunction('formatAppUpdateError', 'formatAppVersion');
  assert.equal(
    formatAppUpdateError({
      code: 'update_dirty',
      message: 'generic dirty message',
      details: {
        dirtyFiles: [
          { status: ' M', path: 'public/app.js' },
          { status: 'D ', path: 'server.js' },
          { status: 'UU', path: 'lib/profiles.js' },
          { status: 'A ', path: 'public/new.js' },
        ],
        dirtyFileCount: 6,
      },
    }),
    'Update blocked by tracked local changes: public/app.js (modified), server.js (deleted), lib/profiles.js (conflict), public/new.js (added), +2 more. Commit or restore them, then try again.'
  );
  assert.equal(formatAppUpdateError({ code: 'update_dirty', message: 'generic dirty message', details: {} }), 'generic dirty message');
  assert.equal(formatAppUpdateError({ code: 'update_failed', message: 'network failed' }), 'network failed');

  const handler = app.slice(app.indexOf("$('#appUpdateBtn').addEventListener"), app.indexOf("$('#appRestartBtn').addEventListener"));
  assert.match(handler, /setAppUpdateStatus\(formatAppUpdateError\(error\), 'bad'\)/);
});
