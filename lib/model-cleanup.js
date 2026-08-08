'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { activeH3ModelSettingKeys } = require('./h3-model-variants');

function normalizedRelative(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
}

function sourceFilename(asset) {
  try {
    return decodeURIComponent(new URL(asset[2]).pathname.split('/').pop() || '');
  } catch {
    return '';
  }
}

function cleanupId(folder, filename) {
  return crypto.createHash('sha256').update(`${normalizedRelative(folder)}\0${normalizedRelative(filename)}`).digest('hex').slice(0, 24);
}

function activeManagedPaths(settings = {}, modelAssets = {}) {
  const activeH3Keys = activeH3ModelSettingKeys(settings);
  const allH3VariantKeys = new Set([
    'h3Unet', 'h3Bf16Unet', 'h3RefUnet', 'h3Bf16RefUnet', 'h3DynTimeRefUnet', 'h3DynTimeRefHqUnet',
  ]);
  const active = new Set();
  for (const assets of Object.values(modelAssets)) {
    for (const asset of assets || []) {
      const [settingKey, folder] = asset;
      if (allH3VariantKeys.has(settingKey) && !activeH3Keys.has(settingKey)) continue;
      const filename = String(settings[settingKey] || asset[3] || sourceFilename(asset)).trim();
      if (filename) active.add(normalizedRelative(`${folder}/${filename}`).toLowerCase());
    }
  }
  return active;
}

async function managedModelCleanupCandidates(modelsPath, settings = {}, modelAssets = {}) {
  const root = path.resolve(String(modelsPath || ''));
  if (!modelsPath || !fs.existsSync(root)) return [];
  const active = activeManagedPaths(settings, modelAssets);
  const seen = new Set();
  const candidates = [];
  for (const assets of Object.values(modelAssets)) {
    for (const asset of assets || []) {
      const [settingKey, folder] = asset;
      const filename = String(asset[3] || sourceFilename(asset)).trim();
      const relative = normalizedRelative(`${folder}/${filename}`);
      if (!filename || relative.split('/').includes('..') || active.has(relative.toLowerCase()) || seen.has(relative.toLowerCase())) continue;
      seen.add(relative.toLowerCase());
      const file = path.resolve(root, ...relative.split('/'));
      if (!file.startsWith(`${root}${path.sep}`)) continue;
      try {
        const stat = await fsp.lstat(file);
        if (!stat.isFile() || stat.isSymbolicLink()) continue;
        candidates.push({
          id: cleanupId(folder, filename),
          settingKey,
          filename,
          folder: normalizedRelative(folder),
          bytes: stat.size,
          modifiedAt: stat.mtimeMs,
          file,
        });
      } catch { /* Missing files are not cleanup candidates. */ }
    }
  }
  return candidates.sort((left, right) => right.bytes - left.bytes || left.filename.localeCompare(right.filename));
}

async function deleteManagedModelCandidate(modelsPath, settings, modelAssets, id, confirmName) {
  const candidates = await managedModelCleanupCandidates(modelsPath, settings, modelAssets);
  const candidate = candidates.find((entry) => entry.id === String(id || ''));
  if (!candidate) {
    const error = new Error('That model is active, missing, or no longer eligible for cleanup. Refresh the list and try again.');
    error.code = 'model_cleanup_stale';
    throw error;
  }
  if (String(confirmName || '') !== candidate.filename) {
    const error = new Error('Type the complete model filename to confirm permanent deletion.');
    error.code = 'model_cleanup_confirmation_required';
    throw error;
  }
  await fsp.unlink(candidate.file);
  return candidate;
}

module.exports = {
  activeManagedPaths,
  cleanupId,
  deleteManagedModelCandidate,
  managedModelCleanupCandidates,
  normalizedRelative,
  sourceFilename,
};
