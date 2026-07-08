'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeGenerationDefaults, normalizeContextOverrides, mergeContextOverrides } = require('../lib/user-preferences');

test('generation defaults are safe and preserve legacy behavior', () => {
  const defaults = normalizeGenerationDefaults();
  assert.equal(defaults.create.steps, 12);
  assert.equal(defaults.edit.denoise, 0.4);
  assert.equal(defaults.video.duration, 5);
  assert.equal(defaults.seed.mode, 'random');
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
