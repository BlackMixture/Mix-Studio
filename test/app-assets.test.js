'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  inspectCriticalPublicAssets,
  isCriticalPublicAsset,
  isUsableCriticalPublicAsset,
  loadCriticalPublicAssetCache,
} = require('../lib/app-assets');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function validAsset(name) {
  const starts = {
    'index.html': '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head>',
    'style.css': ':root { --ink: #fff; }\nbody { background: #000; }\n.topbar { display: flex; }',
    'app.js': "'use strict';\nconst ready = true;",
    'h3-prompt-guide.js': "'use strict';\nconst H3PromptGuide = {};",
  };
  return Buffer.from(`${starts[name]}\n${'x'.repeat(5000)}`);
}

function assetRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-studio-assets-'));
  fs.mkdirSync(path.join(root, 'public'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('critical app assets require usable HTML, CSS, and JavaScript', (t) => {
  const root = assetRoot(t);
  for (const name of ['index.html', 'style.css', 'app.js', 'h3-prompt-guide.js']) {
    fs.writeFileSync(path.join(root, 'public', name), validAsset(name));
  }
  assert.equal(inspectCriticalPublicAssets(root).ok, true);
  assert.equal(isCriticalPublicAsset('style.css'), true);
  assert.equal(isCriticalPublicAsset('h3-prompt-guide.js'), true);
  assert.equal(isCriticalPublicAsset('icon.svg'), false);

  fs.writeFileSync(path.join(root, 'public', 'style.css'), 'body{}');
  const report = inspectCriticalPublicAssets(root);
  assert.equal(report.ok, false);
  assert.deepEqual(report.missing, ['public/style.css']);
  assert.equal(isUsableCriticalPublicAsset('style.css', 'body{}'), false);
});

test('startup cache retains only complete critical assets for live recovery', (t) => {
  const root = assetRoot(t);
  fs.writeFileSync(path.join(root, 'public', 'index.html'), validAsset('index.html'));
  fs.writeFileSync(path.join(root, 'public', 'style.css'), validAsset('style.css'));
  fs.writeFileSync(path.join(root, 'public', 'h3-prompt-guide.js'), validAsset('h3-prompt-guide.js'));
  fs.writeFileSync(path.join(root, 'public', 'app.js'), 'truncated');
  const cache = loadCriticalPublicAssetCache(root);
  assert.deepEqual([...cache.keys()], ['index.html', 'style.css', 'h3-prompt-guide.js']);
  assert.equal(cache.get('style.css').equals(validAsset('style.css')), true);
});

test('the static server recovers critical assets from startup memory or Git HEAD', () => {
  assert.match(server, /CRITICAL_PUBLIC_STARTUP_CACHE\s*=\s*loadCriticalPublicAssetCache\(ROOT\)/);
  assert.match(server, /gitCommand\(ROOT, \['show', `HEAD:public\/\$\{name\}`\]/);
  assert.match(server, /X-Mix-Studio-Asset-Recovery/);
  assert.match(server, /serveCriticalPublicAsset\(res, publicFile\.file, publicFile\.name\)/);
  assert.match(server, /update_assets_missing/);
  assert.match(server, /Mix Studio cannot restart because critical app files are missing/);
  assert.match(server, /code: 'app_assets_missing'/);
});
