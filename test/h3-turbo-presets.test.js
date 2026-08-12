'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  H3_TURBO_LORAS,
  h3TurboDefaultSteps,
  h3TurboFixedCanvas,
  h3TurboPreset,
  h3TurboReferenceIsExperimental,
  h3TurboSigmaShifts,
  h3TurboUsesStandardLoader,
} = require('../lib/h3-turbo-presets');

test('MiniMax H3 Turbo presets keep the recommended adapter pair as the default', () => {
  const preset = h3TurboPreset({});
  assert.equal(preset.id, 'recommended');
  assert.equal(preset.framesLora, H3_TURBO_LORAS.framesRecommended);
  assert.equal(preset.referenceLora, H3_TURBO_LORAS.referenceRecommended);
  assert.equal(h3TurboDefaultSteps({}, 'frames'), 6);
  assert.equal(h3TurboDefaultSteps({}, 'reference'), 6);
  assert.equal(h3TurboUsesStandardLoader({}, 'frames'), false);
  assert.equal(h3TurboUsesStandardLoader({}, 'reference'), true);
});

test('LightX2V v1.0 is an eight-step standard-loader adapter with experimental Ref2V', () => {
  const settings = {
    h3TurboLora: H3_TURBO_LORAS.lightx8,
    h3RefTurboLora: `MiniMax-H3\\${H3_TURBO_LORAS.lightx8}`,
  };
  assert.equal(h3TurboPreset(settings).id, 'lightx8');
  assert.equal(h3TurboDefaultSteps(settings, 'frames'), 8);
  assert.equal(h3TurboDefaultSteps(settings, 'reference'), 8);
  assert.equal(h3TurboUsesStandardLoader(settings, 'frames'), true);
  assert.equal(h3TurboUsesStandardLoader(settings, 'reference'), true);
  assert.equal(h3TurboReferenceIsExperimental(settings), true);
});

test('LightX2V v1.0 four-step 768p applies its fixed canvas and 6/3 schedule', () => {
  const settings = {
    h3TurboLora: H3_TURBO_LORAS.lightx4_768p,
    h3RefTurboLora: `MiniMax-H3\\${H3_TURBO_LORAS.lightx4_768p}`,
  };
  assert.equal(h3TurboPreset(settings).id, 'lightx4_768p');
  assert.equal(h3TurboDefaultSteps(settings, 'frames'), 4);
  assert.equal(h3TurboDefaultSteps(settings, 'reference'), 4);
  assert.equal(h3TurboUsesStandardLoader(settings, 'frames'), true);
  assert.equal(h3TurboUsesStandardLoader(settings, 'reference'), true);
  assert.equal(h3TurboReferenceIsExperimental(settings), true);
  assert.deepEqual(h3TurboSigmaShifts(settings, 'frames'), { video: 6, audio: 3 });
  assert.deepEqual(h3TurboFixedCanvas(settings, 'frames'), {
    width: 1344, height: 768, aspectRatio: 16 / 9, resolutionSize: 1.75,
  });
  assert.deepEqual(h3TurboFixedCanvas(settings, 'reference'), {
    width: 1344, height: 768, aspectRatio: 16 / 9, resolutionSize: 1.75,
  });
});

test('legacy and custom adapter choices retain safe defaults', () => {
  const legacy = {
    h3TurboLora: H3_TURBO_LORAS.legacyFrames,
    h3RefTurboLora: H3_TURBO_LORAS.referenceRecommended,
  };
  assert.equal(h3TurboPreset(legacy).id, 'legacy');
  assert.equal(h3TurboDefaultSteps(legacy, 'frames'), 4);
  assert.equal(h3TurboDefaultSteps(legacy, 'reference'), 6);
  assert.equal(h3TurboPreset({ h3TurboLora: 'custom.safetensors' }).id, 'custom');
  assert.equal(h3TurboFixedCanvas(legacy, 'frames'), null);
  assert.deepEqual(h3TurboSigmaShifts(legacy, 'frames'), { video: 12, audio: 3 });
});
