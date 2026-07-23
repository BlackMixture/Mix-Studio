'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  DEFAULT_FEATURES,
  EDIT_FEATURES,
  VIDEO_FEATURES,
  normalizeFeatures,
  enabledEngines,
} = require('../lib/features');

test('existing installs retain every optional feature when feature settings are absent', () => {
  assert.deepEqual(normalizeFeatures(), DEFAULT_FEATURES);
  assert.deepEqual(enabledEngines({}, EDIT_FEATURES), Object.keys(EDIT_FEATURES));
  assert.deepEqual(enabledEngines({}, VIDEO_FEATURES), Object.keys(VIDEO_FEATURES));
});

test('feature choices disable only their selected engine families', () => {
  const features = normalizeFeatures({ 'video.eros': false, 'video.ltxEdit': false, 'edit.klein9': false });
  assert.equal(features['video.eros'], false);
  assert.equal(features['video.ltxEdit'], false);
  assert.equal(features['edit.klein9'], false);
  assert.ok(!enabledEngines(features, VIDEO_FEATURES).includes('eros'));
  assert.ok(!enabledEngines(features, EDIT_FEATURES).includes('klein9'));
});

test('installer manifest exposes optional edit and video components', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'installer', 'feature-manifest.json'), 'utf8'));
  const ids = manifest.features.map((feature) => feature.id);
  const optionalIds = manifest.features.filter((feature) => feature.required !== true).map((feature) => feature.id).sort();
  assert.equal(manifest.target, 'windows-nvidia');
  assert.deepEqual(optionalIds, Object.keys(DEFAULT_FEATURES).sort());
  assert.ok(ids.includes('core.image'));
  assert.ok(ids.includes('edit.qwen'));
  assert.ok(ids.includes('video.ltxEdit'));
  assert.ok(ids.includes('video.eros'));
  assert.ok(ids.includes('video.rife'));
  assert.ok(ids.includes('video.scail'));
  const core = manifest.features.find((feature) => feature.id === 'core.image');
  assert.equal(core.models.includes('krea2-raw'), false);
  assert.equal(core.models.includes('krea2-turbo-lora'), false);
});
