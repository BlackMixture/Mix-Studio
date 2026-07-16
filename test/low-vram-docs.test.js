'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('GitHub-facing pages describe the bounded 8 GB Krea route', () => {
  const readme = read('README.md');
  const download = read('docs/download/index.html');
  const portable = read('docs/portable-install.md');

  assert.match(readme, /curated Krea 2 image route is intended to run with \*\*8 GB of VRAM\*\*/);
  assert.match(readme, /ComfyUI 0\.27\.0 or newer/);
  assert.match(readme, /never silently changes a request/);
  assert.match(readme, /Krea 2 INT8 ConvRot is not GGUF/);
  assert.doesNotMatch(readme, /scale well for users with 16 GB to 24 GB of VRAM/);

  assert.match(download, /Krea 2 requires 8 GB minimum and recommends 16 GB/);
  assert.match(download, /--minimum:33\.333%/);
  assert.match(download, /<b>8 GB<\/b>/);
  assert.match(download, /Can I use an 8 GB GPU\?/);

  assert.match(portable, /## Low-VRAM setup/);
  assert.match(portable, /standard diffusion loader/);
  assert.match(portable, /third-party GGUF weights must be downloaded and selected manually/);
});

test('the installer manifest keeps Krea hardware guidance aligned with the public pages', () => {
  const manifest = JSON.parse(read('installer/feature-manifest.json'));
  const core = manifest.features.find((feature) => feature.id === 'core.image');
  const kreaEdit = manifest.features.find((feature) => feature.id === 'edit.krea2');
  assert.equal(core.hardware.minimumVramGb, 8);
  assert.equal(core.hardware.recommendedVramGb, 16);
  assert.match(core.variant, /native INT8 ConvRot/);
  assert.match(kreaEdit.variant, /FP8 or native INT8 ConvRot/);
});

test('setup gates Krea INT8 installation and generation on the compatible ComfyUI core', () => {
  const server = read('server.js');
  const app = read('public/app.js');
  const html = read('public/index.html');
  assert.match(server, /nativeInt8Compatibility/);
  assert.match(server, /code: 'comfy_int8_update_required'/);
  assert.ok((server.match(/compatibility\.supported !== true/g) || []).length >= 3);
  assert.match(server, /effectiveKrea2Variant\(requestedKrea2Variant, settings\)/);
  assert.match(server, /engine === 'ultimate' && settings\.krea2ModelVariant === 'int8-convrot'/);
  assert.match(server, /setupStatusPayload\(url\.searchParams\.has\('refresh'\)\)/);
  assert.match(app, /setupNativeInt8Blocked/);
  assert.match(app, /or select FP8/);
  assert.match(html, /id="setupKrea2Variant"/);
  assert.match(app, /modelVariants: \{ krea2: \$\('#setKrea2ModelVariant'\)\.value \}/);
});

test('setup preserves an explicit Krea precision instead of replacing it with hardware guidance', () => {
  const app = read('public/app.js');
  const start = app.indexOf('function setupSelectedKrea2Variant(');
  const end = app.indexOf('\nfunction setupNeedsNativeInt8(', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    setupKrea2VariantOverride: '',
    setupViewStatus: {
      modelVariants: { krea2: 'fp8' },
      modelRecommendations: { krea2: 'int8-convrot' },
    },
  };
  const selectedVariant = vm.runInNewContext(`(${app.slice(start, end)})`, context);
  assert.equal(selectedVariant(), 'fp8');
  context.setupKrea2VariantOverride = 'int8-convrot';
  assert.equal(selectedVariant(), 'int8-convrot');
});
