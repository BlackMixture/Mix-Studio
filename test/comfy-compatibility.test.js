'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  KREA2_MIN_VERSION,
  LTX25_SUPPORT_PR_URL,
  MINIMAX_H3_MIN_VERSION,
  NATIVE_INT8_MIN_VERSION,
  compareVersions,
  detectMiniMaxH3Compatibility,
  detectNativeInt8Compatibility,
  krea2ClipCompatibility,
  krea2ClipCompatibilityError,
  ltx25Compatibility,
  ltx25CompatibilityError,
  minimaxH3Compatibility,
  minimaxH3CompatibilityError,
  minimaxH3NativeAudioSampling,
  nativeInt8Compatibility,
  nativeInt8CompatibilityError,
  normalizeVersion,
  objectInfoComboChoices,
  versionFromInstall,
  versionFromSystemStats,
} = require('../lib/comfy-compatibility');

test('Krea 2 support is read from the connected CLIPLoader schema', () => {
  assert.equal(KREA2_MIN_VERSION, '0.26.0');
  const legacy = { CLIPLoader: { input: { required: { type: [['stable_diffusion', 'qwen_image']] } } } };
  const current = { CLIPLoader: { input: { required: { type: [['stable_diffusion', 'krea2']] } } } };
  const dynamic = { CLIPLoader: { input: { required: { type: ['COMBO', { options: ['krea2'] }] } } } };
  assert.deepEqual(objectInfoComboChoices(legacy, 'CLIPLoader', 'type'), ['stable_diffusion', 'qwen_image']);
  assert.equal(krea2ClipCompatibility(legacy, '0.25.1').supported, false);
  assert.equal(krea2ClipCompatibility(current, '0.26.0').supported, true);
  assert.equal(krea2ClipCompatibility(dynamic, '0.27.0').supported, true);
  assert.match(krea2ClipCompatibilityError(krea2ClipCompatibility(legacy, '0.25.1')), /Update ComfyUI/);
});

test('ComfyUI versions are normalized and compared for native INT8 support', () => {
  assert.equal(NATIVE_INT8_MIN_VERSION, '0.27.0');
  assert.equal(normalizeVersion('v0.27.0+desktop'), '0.27.0');
  assert.equal(normalizeVersion('0.27'), '');
  assert.equal(compareVersions('0.26.9', '0.27.0'), -1);
  assert.equal(compareVersions('0.27.0', '0.27.0'), 0);
  assert.equal(compareVersions('0.28.0', '0.27.0'), 1);
  assert.equal(compareVersions('unknown', '0.27.0'), null);
});

test('system stats expose the connected ComfyUI core version', () => {
  assert.equal(versionFromSystemStats({ system: { comfyui_version: '0.28.0' } }), '0.28.0');
  assert.equal(nativeInt8Compatibility({ system: { comfyui_version: '0.26.0' } }).supported, false);
  assert.equal(nativeInt8Compatibility({ system: { comfyui_version: '0.27.0' } }).supported, true);
  assert.equal(nativeInt8Compatibility({}).supported, null);
});

test('an offline source install can report its ComfyUI version from disk', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-studio-comfy-version-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'comfyui_version.py'), '__version__ = "0.27.1"\n');
  assert.equal(versionFromInstall(root), '0.27.1');
  assert.deepEqual(nativeInt8Compatibility(null, root), {
    version: '0.27.1',
    minimumVersion: '0.27.0',
    supported: true,
  });
});

test('the standalone installer can verify a connected ComfyUI before falling back to disk', async () => {
  const calls = [];
  const compatibility = await detectNativeInt8Compatibility({
    comfyUrl: 'http://127.0.0.1:8188/',
    fetchImpl: async (url) => {
      calls.push(url);
      return { ok: true, json: async () => ({ system: { comfyui_version: '0.27.2' } }) };
    },
  });
  assert.deepEqual(calls, ['http://127.0.0.1:8188/system_stats']);
  assert.equal(compatibility.supported, true);
  assert.equal(compatibility.version, '0.27.2');
});

test('compatibility errors always offer the supported FP8 alternative', () => {
  assert.match(nativeInt8CompatibilityError({ version: '0.26.9', minimumVersion: '0.27.0' }), /select the Krea 2 FP8 variant/);
  assert.match(nativeInt8CompatibilityError({ version: '', minimumVersion: '0.27.0' }), /could not verify native INT8/);
});

test('MiniMax H3 requires ComfyUI 0.30 native nodes and the minimax CLIP type', () => {
  assert.equal(MINIMAX_H3_MIN_VERSION, '0.30.0');
  const supported = {
    MiniMaxH3ImageToVideo: {},
    MiniMaxH3ReferenceToVideo: {},
    VAEDecodeAudio: {},
    CLIPLoader: { input: { required: { type: [['stable_diffusion', 'minimax']] } } },
  };
  assert.equal(minimaxH3Compatibility(supported, '0.30.0').supported, true);
  const missing = minimaxH3Compatibility({ CLIPLoader: { input: { required: { type: [['stable_diffusion']] } } } }, '0.30.0');
  assert.equal(missing.supported, false);
  assert.deepEqual(missing.missingNodes, ['MiniMaxH3ImageToVideo', 'MiniMaxH3ReferenceToVideo', 'VAEDecodeAudio']);
  assert.equal(missing.missingClipType, true);
  assert.equal(minimaxH3Compatibility(null, '0.29.9').supported, false);
  assert.equal(minimaxH3Compatibility(null, '0.30.0').supported, true);
  assert.match(minimaxH3CompatibilityError(missing), /MiniMax H3 needs ComfyUI 0\.30\.0/);
});

test('MiniMax H3 detects the native AV audio schedule by its renamed core node', () => {
  const legacy = { MiniMaxH3SigmaShift: { display_name: 'MiniMax H3 Sigma Shift' } };
  const native = { MiniMaxH3SigmaShift: { display_name: 'ModelSamplingMiniMaxH3' } };

  assert.equal(minimaxH3NativeAudioSampling(legacy), false);
  assert.equal(minimaxH3NativeAudioSampling(native), true);
  assert.equal(minimaxH3Compatibility(native).nativeAudioSampling, true);
});

test('LTX 2.5 requires the native AV graph contract instead of trusting a version number', () => {
  assert.match(LTX25_SUPPORT_PR_URL, /ComfyUI\/pull\/15499/);
  const supported = {
    LTXVDualCFGGuider: {},
    LTXVAddGuide: {},
    LTXVCropGuides: {},
    CLIPLoader: { input: { required: { type: [['stable_diffusion', 'ltxv']] } } },
  };
  assert.equal(ltx25Compatibility(supported, '0.31.0').supported, true);
  const missing = ltx25Compatibility({
    LTXVAddGuide: {},
    LTXVCropGuides: {},
    CLIPLoader: { input: { required: { type: [['stable_diffusion']] } } },
  }, '0.30.0');
  assert.equal(missing.supported, false);
  assert.deepEqual(missing.missingNodes, ['LTXVDualCFGGuider']);
  assert.equal(missing.missingClipType, true);
  assert.equal(ltx25Compatibility(null, '0.31.0').supported, null);
  assert.match(ltx25CompatibilityError(missing), /official ComfyUI support PR is still pending/);
  assert.match(ltx25Compatibility(null, '0.31.0').supportPrUrl, /ComfyUI\/pull\/15499/);
});

test('the standalone H3 compatibility check reads system stats and object info', async () => {
  const calls = [];
  const result = await detectMiniMaxH3Compatibility({
    comfyUrl: 'http://127.0.0.1:8188/',
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith('/system_stats')) return { ok: true, json: async () => ({ system: { comfyui_version: '0.30.1' } }) };
      return { ok: true, json: async () => ({
        MiniMaxH3ImageToVideo: {}, MiniMaxH3ReferenceToVideo: {}, VAEDecodeAudio: {},
        CLIPLoader: { input: { required: { type: [['minimax']] } } },
      }) };
    },
  });
  assert.deepEqual(calls, ['http://127.0.0.1:8188/system_stats', 'http://127.0.0.1:8188/object_info']);
  assert.equal(result.supported, true);
});
