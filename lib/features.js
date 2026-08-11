'use strict';

const EDIT_FEATURES = {
  klein4: 'edit.klein4',
  klein9: 'edit.klein9',
  qwen: 'edit.qwen',
  krea2: 'edit.krea2',
  krea2ref: 'edit.krea2ref',
  krea2remix: 'edit.krea2remix',
};

const VIDEO_FEATURES = {
  ltx: 'video.ltx',
  ltx25: 'video.ltx25',
  h3: 'video.h3',
  'ltx-edit': 'video.ltxEdit',
  eros: 'video.eros',
  wan: 'video.wan',
  'wan-animate2': 'video.wanAnimate2',
  scail: 'video.scail',
};

const DEFAULT_FEATURES = Object.freeze({
  'edit.klein4': true,
  'edit.klein9': true,
  'edit.qwen': true,
  'edit.krea2': true,
  'edit.krea2ref': true,
  'edit.krea2remix': true,
  'video.ltx': true,
  'video.ltx25': true,
  'video.h3': true,
  'video.h3R2V': false,
  'video.ltxEdit': true,
  'video.eros': true,
  'video.rife': true,
  'video.wan': true,
  'video.wanAnimate2': true,
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
