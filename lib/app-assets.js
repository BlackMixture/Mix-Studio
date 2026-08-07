'use strict';

const fs = require('fs');
const path = require('path');

const CRITICAL_PUBLIC_ASSETS = Object.freeze({
  'index.html': 4096,
  'style.css': 4096,
  'app.js': 4096,
  'h3-prompt-guide.js': 4096,
});

function criticalPublicAssetMinimumSize(name) {
  return CRITICAL_PUBLIC_ASSETS[String(name || '')] || 0;
}

function isCriticalPublicAsset(name) {
  return criticalPublicAssetMinimumSize(name) > 0;
}

function isUsableCriticalPublicAsset(name, value) {
  const minimum = criticalPublicAssetMinimumSize(name);
  if (!minimum) return false;
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value || '');
  if (bytes.length < minimum) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192)).toString('utf8');
  if (name === 'index.html') return /<!doctype html/i.test(sample) && /<link[^>]+style\.css/i.test(sample);
  if (name === 'style.css') return /:root\s*\{|body\s*\{|\.topbar\s*\{/.test(sample);
  if (name === 'app.js') return /['"]use strict['"]/.test(sample);
  if (name === 'h3-prompt-guide.js') return /['"]use strict['"]/.test(sample) && /H3PromptGuide/.test(sample);
  return false;
}

function inspectCriticalPublicAssets(root, options = {}) {
  const fsModule = options.fs || fs;
  const publicRoot = path.join(root, 'public');
  const missing = [];
  const sizes = {};
  for (const name of Object.keys(CRITICAL_PUBLIC_ASSETS)) {
    const file = path.join(publicRoot, name);
    try {
      const data = fsModule.readFileSync(file);
      sizes[name] = data.length;
      if (!isUsableCriticalPublicAsset(name, data)) missing.push(`public/${name}`);
    } catch {
      sizes[name] = 0;
      missing.push(`public/${name}`);
    }
  }
  return { ok: missing.length === 0, missing, sizes };
}

function loadCriticalPublicAssetCache(root, options = {}) {
  const fsModule = options.fs || fs;
  const cache = new Map();
  for (const name of Object.keys(CRITICAL_PUBLIC_ASSETS)) {
    try {
      const data = fsModule.readFileSync(path.join(root, 'public', name));
      if (isUsableCriticalPublicAsset(name, data)) cache.set(name, Buffer.from(data));
    } catch { /* A Git fallback can recover a missing tracked asset later. */ }
  }
  return cache;
}

module.exports = {
  CRITICAL_PUBLIC_ASSETS,
  criticalPublicAssetMinimumSize,
  inspectCriticalPublicAssets,
  isCriticalPublicAsset,
  isUsableCriticalPublicAsset,
  loadCriticalPublicAssetCache,
};
