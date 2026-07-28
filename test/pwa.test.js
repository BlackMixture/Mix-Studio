'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  assert.deepEqual([...buffer.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

test('web app manifest provides installable and maskable Mix Studio icons', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.prefer_related_applications, false);
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable'));
});

test('PWA icon files have the declared square dimensions', () => {
  assert.deepEqual(pngDimensions(path.join(publicDir, 'app-icon-192.png')), { width: 192, height: 192 });
  assert.deepEqual(pngDimensions(path.join(publicDir, 'app-icon-512.png')), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(path.join(publicDir, 'app-icon-maskable-512.png')), { width: 512, height: 512 });
  assert.deepEqual(pngDimensions(path.join(publicDir, 'apple-touch-icon.png')), { width: 180, height: 180 });
});

test('the page registers the service worker and exposes the browser install action', () => {
  const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  const pwa = fs.readFileSync(path.join(publicDir, 'pwa.js'), 'utf8');
  const worker = fs.readFileSync(path.join(publicDir, 'service-worker.js'), 'utf8');
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /id="installAppBtn"/);
  assert.match(html, /src="\/pwa\.js"/);
  assert.match(pwa, /navigator\.serviceWorker\.register\('\/service-worker\.js', \{ scope: '\/' \}\)/);
  assert.match(pwa, /beforeinstallprompt/);
  assert.match(worker, /self\.addEventListener\('fetch'/);
});
