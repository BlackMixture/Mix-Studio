'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('GitHub-facing pages describe open low-VRAM tiers without promising every workflow will fit', () => {
  const readme = read('README.md');
  const download = read('docs/download/index.html');
  const portable = read('docs/portable-install.md');
  const server = read('server.js');

  assert.match(readme, /does not enforce a VRAM cutoff/);
  assert.match(readme, /lowest guided offload tier is \*\*4 GB of VRAM\*\* through the Flux 2 Klein 4B FP8 edit route/);
  assert.match(readme, /offloaded route rather than a claim that the complete pipeline remains resident in 4 GB/);
  assert.match(readme, /Krea 2 image route uses \*\*8 GB VRAM\*\* as its guided offload tier/);
  assert.match(readme, /Video workflows now use \*\*8 GB VRAM with at least 48 GB of system RAM\*\* as an experimental offload tier/);
  assert.match(readme, /not a promise that every duration and resolution will fit/);
  assert.match(readme, /warns before a below-tier install or generation and lets the user continue unchanged/);
  assert.match(readme, /ComfyUI 0\.27\.0 or newer/);
  assert.match(readme, /never silently changes a request/);
  assert.match(readme, /Krea 2 INT8 ConvRot is not GGUF/);
  assert.doesNotMatch(readme, /scale well for users with 16 GB to 24 GB of VRAM/);

  assert.match(download, /Klein 4B FP8 supports a 4 GB offloaded route/);
  assert.match(download, /--minimum:16\.667%/);
  assert.match(download, /--minimum:33\.333%/);
  assert.match(download, /--axis-position:16\.667%">4 GB/);
  assert.match(download, /--axis-position:33\.333%">8 GB/);
  assert.match(download, /Can I use a 4 GB GPU\?/);
  assert.match(download, /Can I generate video with 8 GB of VRAM\?/);
  assert.match(download, /Offload tier · Recommended/);

  assert.match(portable, /## Low-VRAM setup/);
  assert.match(portable, /no enforced VRAM cutoff/);
  assert.match(portable, /lowest guided tier is 4 GB of VRAM through Flux 2 Klein 4B FP8/);
  assert.match(portable, /LTX 2\.3, LTX Edit, 10Eros, Wan 2\.2 14B, and SCAIL 2 use 8 GB VRAM with at least 48 GB system RAM as an experimental offload tier/);
  assert.match(portable, /flux-2-klein-4b-fp8\.safetensors/);
  assert.match(portable, /standard diffusion loader/);
  assert.match(portable, /third-party GGUF weights must be downloaded and selected manually/);
  assert.match(server, /klein4Unet: 'flux-2-klein-4b-fp8\.safetensors'/);
});

test('the installer manifest keeps image and experimental video offload tiers aligned with the public pages', () => {
  const manifest = JSON.parse(read('installer/feature-manifest.json'));
  const core = manifest.features.find((feature) => feature.id === 'core.image');
  const klein4 = manifest.features.find((feature) => feature.id === 'edit.klein4');
  const kreaEdit = manifest.features.find((feature) => feature.id === 'edit.krea2');
  assert.equal(klein4.hardware.minimumVramGb, 4);
  assert.equal(klein4.hardware.minimumRamGb, 24);
  assert.match(klein4.variant, /Klein 4B FP8 with system-RAM offload/);
  assert.equal(core.hardware.minimumVramGb, 8);
  assert.equal(core.hardware.recommendedVramGb, 16);
  assert.match(core.variant, /native INT8 ConvRot/);
  assert.match(kreaEdit.variant, /FP8 or native INT8 ConvRot/);
  for (const id of ['video.ltx', 'video.ltxEdit', 'video.eros', 'video.wan', 'video.scail']) {
    const feature = manifest.features.find((entry) => entry.id === id);
    assert.equal(feature.hardware.minimumVramGb, 8, `${id} exposes the experimental 8 GB tier`);
    assert.equal(feature.hardware.recommendedVramGb, 24, `${id} retains the practical 24 GB recommendation`);
    assert.equal(feature.hardware.minimumRamGb, 48, `${id} requires substantial RAM for the offload tier`);
  }
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
