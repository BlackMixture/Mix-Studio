'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('source picker exposes uploaded assets for image, video, and audio inputs', () => {
  assert.match(html, /Browse Library/);
  assert.match(html, /Generations and uploaded assets/);
  assert.match(app, /function uploadedAssetPickerAssets\(accept\)/);
  assert.match(app, /normalized\.startsWith\('audio'\)/);
  assert.match(app, /directorOpenMediaPicker\('audio'\)/);
  assert.match(app, /pickUpload\('audio\/\*'/);
});

test('Library has a virtual Uploaded assets collection with deletion controls', () => {
  assert.match(html, /id="uploadedAssetsLibrary"/);
  assert.match(html, /id="uploadedAssetsGrid"/);
  assert.match(app, /id: 'uploaded-assets', name: 'Uploaded assets'/);
  assert.match(app, /api\/uploaded-assets\/\$\{encodeURIComponent\(asset\.id\)\}/);
  assert.match(css, /\.uploaded-asset-delete/);
});

test('cataloged upload and safe deletion APIs are wired server-side', () => {
  assert.match(server, /req\.headers\['x-asset-catalog'\] === '1'/);
  assert.match(server, /uploadedAssetUsage\(asset, \{ items: db\.items, jobs: \[\.\.\.jobs\.values\(\)\] \}\)/);
  assert.match(server, /path\.join\(TRASH_ROOT, 'uploaded-assets', asset\.profileId\)/);
  assert.match(server, /asset\.deletedAt = Date\.now\(\)/);
});
