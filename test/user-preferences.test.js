'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGenerationDefaults, normalizeContextOverrides, mergeContextOverrides } = require('../lib/user-preferences');

test('generation defaults are safe and preserve legacy behavior', () => {
  const defaults = normalizeGenerationDefaults();
  assert.equal(defaults.create.steps, 12);
  assert.equal(defaults.edit.denoise, 0.4);
  assert.deepEqual(defaults.krea2Edit, { steps: 10, cfg: 1 });
  assert.equal(defaults.video.duration, 5);
  assert.equal(defaults.seed.mode, 'random');
  assert.deepEqual(defaults.visualPresets, { useVisualTreatment: false, showCards: true });
});

test('visual preset prompt and card preferences normalize independently', () => {
  assert.deepEqual(
    normalizeGenerationDefaults({ visualPresets: { useVisualTreatment: true, showCards: false } }).visualPresets,
    { useVisualTreatment: true, showCards: false },
  );
  assert.deepEqual(
    normalizeGenerationDefaults({ visualPresets: { useVisualTreatment: 'yes', showCards: 'no' } }).visualPresets,
    { useVisualTreatment: false, showCards: true },
  );
});

test('Krea 2 Edit presets stay within the supported sampling range', () => {
  assert.deepEqual(
    normalizeGenerationDefaults({ krea2Edit: { steps: 99, cfg: 20 } }).krea2Edit,
    { steps: 12, cfg: 5 }
  );
  assert.deepEqual(
    normalizeGenerationDefaults({ krea2Edit: { steps: 2, cfg: 0 } }).krea2Edit,
    { steps: 8, cfg: 1 }
  );
});

test('video duration defaults preserve supported tenth-second precision', () => {
  assert.equal(normalizeGenerationDefaults({ video: { duration: 12.44 } }).video.duration, 12.4);
  assert.equal(normalizeGenerationDefaults({ video: { duration: 12.46 } }).video.duration, 12.5);
});

test('context overrides adjust suggestions without changing observations', () => {
  const context = { 'Style.safetensors': { uses: 4, defaultStrength: 0.8, phrases: [{ text: 'film still', count: 3 }], suggestion: 'film still' } };
  const merged = mergeContextOverrides(context, { 'Style.safetensors': { defaultStrength: 1.1, suggestion: 'soft studio portrait' } });
  assert.equal(merged['Style.safetensors'].uses, 4);
  assert.equal(merged['Style.safetensors'].defaultStrength, 1.1);
  assert.equal(merged['Style.safetensors'].suggestion, 'soft studio portrait');
});

test('disabled contextual suggestions remain available to restore', () => {
  const overrides = normalizeContextOverrides({ x: { disabled: true, suggestion: 'saved phrase' } });
  const merged = mergeContextOverrides({ x: { suggestion: 'learned phrase' } }, overrides);
  assert.equal(merged.x.suggestion, null);
  assert.equal(merged.x.override.suggestion, 'saved phrase');
});
