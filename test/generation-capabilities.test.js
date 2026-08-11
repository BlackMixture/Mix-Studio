'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  configuredVideoEngineCapability,
  dependencyComponentBlock,
  ltxRefinePreflight,
  videoEngineCapabilities,
} = require('../lib/generation-capabilities');

const apple = { gpuVendor: 'apple', gpuBackend: 'mps', vramGb: 64 };
const nvidia = { gpuVendor: 'nvidia', gpuBackend: 'cuda', vramGb: 24 };
const amd = { gpuVendor: 'amd', gpuBackend: 'rocm', vramGb: 24 };

test('Apple Metal exposes BF16 LTX and disables curated FP8 video families', () => {
  const capabilities = videoEngineCapabilities(apple);
  assert.equal(capabilities.ltx.supported, true);
  assert.equal(capabilities.ltx.requiresBf16, true);
  assert.equal(capabilities['ltx-edit'].supported, true);
  assert.equal(capabilities.ltx25.supported, false);
  assert.match(capabilities.ltx25.reason, /INT8 ConvRot|Apple Metal/);
  assert.equal(capabilities.h3.supported, false);
  for (const engine of ['eros', 'wan', 'wan-animate2', 'scail']) {
    assert.equal(capabilities[engine].supported, false);
    assert.match(capabilities[engine].reason, /FP8|Apple Metal/);
  }
  assert.match(dependencyComponentBlock('scailinfinity', apple), /Apple Metal/);
  assert.equal(dependencyComponentBlock('wan', nvidia), '');
  assert.equal(dependencyComponentBlock('wananimate2', nvidia), '');
  assert.match(dependencyComponentBlock('wananimate2', apple), /INT8 ConvRot|Apple Metal/);
  assert.match(dependencyComponentBlock('wananimate2', amd), /INT8 ConvRot|AMD ROCm/);
  assert.match(dependencyComponentBlock('h3r2v', apple), /NVFP4|Apple Metal/);
  assert.match(dependencyComponentBlock('h3turbo', apple), /NVFP4|Apple Metal/);
  assert.match(dependencyComponentBlock('h3', amd), /AMD ROCm/);
  assert.match(dependencyComponentBlock('ltx25', amd), /INT8 ConvRot|AMD ROCm/);
  assert.equal(videoEngineCapabilities(nvidia).ltx25.supported, true);
  assert.equal(videoEngineCapabilities(nvidia).h3.supported, true);
});

test('Apple LTX generation rejects FP8 configuration and accepts BF16', () => {
  assert.equal(configuredVideoEngineCapability('ltx', apple, {
    ltxCkpt: 'ltx-2.3-22b-dev-fp8.safetensors',
  }).supported, false);
  assert.equal(configuredVideoEngineCapability('ltx', apple, {
    ltxCkpt: 'ltx-2.3-22b-dev.safetensors',
  }).supported, true);
});

test('LTX refine preflight catches the reported large Apple request before queueing', () => {
  const unsafe = ltxRefinePreflight({ width: 1600, height: 896, frames: 273, fps: 25, profile: apple });
  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.maxSeconds < 11);
  assert.match(unsafe.error, /too large/);

  assert.equal(ltxRefinePreflight({ width: 1280, height: 1280, frames: 201, fps: 25, profile: apple }).ok, true);
  assert.equal(ltxRefinePreflight({ width: 1600, height: 896, frames: 273, fps: 25, profile: nvidia }).ok, true);
});

test('video UI consumes server capability gating', () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /state\.videoCapabilities = lastMeta\.capabilities\?\.video \|\| \{\}/);
  assert.match(app, /function supportedVideoEngines\(\)/);
  assert.match(app, /button\.disabled = capability\.supported === false/);
  assert.match(app, /if \(capability\.supported === false\) \{[\s\S]{0,180}toast\(capability\.reason/);
  assert.match(server, /function adoptDeviceCompatibleModelSettings/);
  assert.match(server, /settings\.ltxCkpt = 'ltx-2\.3-22b-dev\.safetensors'/);
});
