'use strict';

const EDIT_FEATURES = {
  klein4: 'edit.klein4',
  klein9: 'edit.klein9',
  qwen: 'edit.qwen',
  krea2: 'edit.krea2',
  krea2ref: 'edit.krea2ref',
};

const VIDEO_FEATURES = {
  ltx: 'video.ltx',
  'ltx-edit': 'video.ltxEdit',
  eros: 'video.eros',
  wan: 'video.wan',
  scail: 'video.scail',
};

const DEFAULT_FEATURES = Object.freeze({
  'edit.klein4': true,
  'edit.klein9': true,
  'edit.qwen': true,
  'edit.krea2': true,
  'edit.krea2ref': true,
  'video.ltx': true,
  'video.ltxEdit': true,
  'video.eros': true,
  'video.wan': true,
  'video.scail': true,
});

function normalizeFeatures(value) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(Object.keys(DEFAULT_FEATURES).map((key) => [
    key,
    typeof source[key] === 'boolean' ? source[key] : DEFAULT_FEATURES[key],
  ]));
}

function featureEnabled(features, key) {
  return normalizeFeatures(features)[key] !== false;
}

function enabledEngines(features, map) {
  const normalized = normalizeFeatures(features);
  return Object.keys(map).filter((engine) => normalized[map[engine]] !== false);
}

module.exports = {
  EDIT_FEATURES,
  VIDEO_FEATURES,
  DEFAULT_FEATURES,
  normalizeFeatures,
  featureEnabled,
  enabledEngines,
};
