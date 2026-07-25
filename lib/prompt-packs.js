'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const PROMPT_PACK_FORMAT = 'mix-studio.prompt-preset-pack';
const PROMPT_PACK_FORMAT_VERSION = 1;
const MAX_PROMPT_PACK_BYTES = 32 * 1024 * 1024;
const MAX_PROMPT_PACK_ASSET_BYTES = 24 * 1024 * 1024;
const MAX_PROMPT_PACK_THUMBNAIL_BYTES = 1024 * 1024;
const MAX_PROMPT_PACK_PRESETS = 100;
const MAX_PROMPT_PACK_CATEGORIES = 12;
const PROMPT_PACK_ACCENTS = new Set(['cyan', 'blue', 'violet', 'rose', 'amber', 'green']);
const PROMPT_PACK_MIME_EXTENSIONS = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const PACK_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const CATEGORY_ID_RE = /^[a-z](?:[a-z0-9-]{0,30}[a-z0-9])?$/;
const PRESET_ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function packError(message, code = 'invalid_prompt_pack') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(value, label, max, required = true) {
  const normalized = String(value || '').trim();
  if (required && !normalized) throw packError(`${label} is required`);
  if (normalized.length > max) throw packError(`${label} must be ${max} characters or fewer`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)) {
    throw packError(`${label} contains unsupported control characters`);
  }
  return normalized;
}

function safeId(value, label, pattern) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!pattern.test(normalized)) {
    throw packError(`${label} must use lowercase letters, numbers, and single hyphens`);
  }
  return normalized;
}

function semverParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(String(value || ''));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function comparePackVersions(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  if (!a || !b) return String(left || '').localeCompare(String(right || ''));
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function pngDimensions(buffer) {
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), kind: 'png' };
}

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) return null;
    if (startOfFrame.has(marker) && length >= 7) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3), kind: 'jpeg' };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
      kind: 'webp',
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
      kind: 'webp',
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b1 = buffer[21];
    const b2 = buffer[22];
    const b3 = buffer[23];
    const b4 = buffer[24];
    return {
      width: 1 + (b1 | ((b2 & 0x3f) << 8)),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
      kind: 'webp',
    };
  }
  return null;
}

function thumbnailDimensions(buffer, mime) {
  if (mime === 'image/png') return pngDimensions(buffer);
  if (mime === 'image/jpeg') return jpegDimensions(buffer);
  if (mime === 'image/webp') return webpDimensions(buffer);
  return null;
}

function decodeThumbnail(thumbnail, label) {
  if (!thumbnail || typeof thumbnail !== 'object' || Array.isArray(thumbnail)) {
    throw packError(`${label} needs an embedded thumbnail`);
  }
  const mime = String(thumbnail.mime || '').toLowerCase();
  const extension = PROMPT_PACK_MIME_EXTENSIONS[mime];
  if (!extension) throw packError(`${label} thumbnail must be JPEG, PNG, or WebP`);
  const encoded = String(thumbnail.data || '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw packError(`${label} thumbnail is not valid base64 data`);
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_PROMPT_PACK_THUMBNAIL_BYTES) {
    throw packError(`${label} thumbnail must be between 1 byte and 1 MB`);
  }
  const dimensions = thumbnailDimensions(buffer, mime);
  if (!dimensions) throw packError(`${label} thumbnail bytes do not match ${mime}`);
  if (dimensions.width < 256 || dimensions.height < 256 || dimensions.width > 2048 || dimensions.height > 2048) {
    throw packError(`${label} thumbnail dimensions must be between 256 and 2048 pixels`);
  }
  return { buffer, mime, extension, width: dimensions.width, height: dimensions.height };
}

function inspectPromptPackBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer || '');
  if (!buffer.length) throw packError('Prompt pack is empty');
  if (buffer.length > MAX_PROMPT_PACK_BYTES) throw packError('Prompt pack exceeds the 32 MB limit', 'prompt_pack_too_large');
  let source;
  try { source = JSON.parse(buffer.toString('utf8')); }
  catch { throw packError('Prompt pack is not valid JSON'); }
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw packError('Prompt pack root must be an object');
  if (source.format !== PROMPT_PACK_FORMAT) throw packError(`Prompt pack format must be "${PROMPT_PACK_FORMAT}"`);
  if (Number(source.formatVersion) !== PROMPT_PACK_FORMAT_VERSION) {
    throw packError(`Prompt pack format version ${source.formatVersion || 'unknown'} is not supported`, 'unsupported_prompt_pack_version');
  }
  if (source.type !== 'prompt-presets') throw packError('Only prompt-presets add-ons are supported');

  const id = safeId(source.id, 'Pack ID', PACK_ID_RE);
  const name = text(source.name, 'Pack name', 80);
  const version = text(source.version, 'Pack version', 40);
  if (!SEMVER_RE.test(version)) throw packError('Pack version must use semantic versioning such as 1.0.0');
  const author = text(source.author, 'Pack author', 80);
  const description = text(source.description, 'Pack description', 280, false);
  const categories = Array.isArray(source.categories) ? source.categories : [];
  if (!categories.length || categories.length > MAX_PROMPT_PACK_CATEGORIES) {
    throw packError(`Prompt pack needs between 1 and ${MAX_PROMPT_PACK_CATEGORIES} categories`);
  }

  const assets = [];
  const seenCategories = new Set();
  const seenPresetKeys = new Set();
  let presetCount = 0;
  let assetBytes = 0;
  const normalizedCategories = categories.map((category, categoryIndex) => {
    if (!category || typeof category !== 'object' || Array.isArray(category)) {
      throw packError(`Category ${categoryIndex + 1} is invalid`);
    }
    const categoryId = safeId(category.id, `Category ${categoryIndex + 1} ID`, CATEGORY_ID_RE);
    if (seenCategories.has(categoryId)) throw packError(`Category "${categoryId}" is duplicated`);
    seenCategories.add(categoryId);
    const categoryLabel = text(category.label, `Category "${categoryId}" label`, 50);
    const categoryDescription = text(category.description, `Category "${categoryId}" description`, 180, false);
    const accent = String(category.accent || 'violet').toLowerCase();
    if (!PROMPT_PACK_ACCENTS.has(accent)) throw packError(`Category "${categoryId}" uses an unsupported accent`);
    if (category.selectionMode && category.selectionMode !== 'single') {
      throw packError(`Category "${categoryId}" must use single selection`);
    }
    const presets = Array.isArray(category.presets) ? category.presets : [];
    if (!presets.length) throw packError(`Category "${categoryId}" needs at least one preset`);
    const normalizedPresets = presets.map((preset, presetIndex) => {
      presetCount += 1;
      if (presetCount > MAX_PROMPT_PACK_PRESETS) {
        throw packError(`Prompt pack exceeds the ${MAX_PROMPT_PACK_PRESETS}-preset limit`);
      }
      if (!preset || typeof preset !== 'object' || Array.isArray(preset)) {
        throw packError(`Preset ${presetIndex + 1} in "${categoryId}" is invalid`);
      }
      const presetId = safeId(preset.id, `Preset ${presetIndex + 1} ID`, PRESET_ID_RE);
      const presetKey = `${categoryId}:${presetId}`;
      if (seenPresetKeys.has(presetKey)) throw packError(`Preset "${presetKey}" is duplicated`);
      seenPresetKeys.add(presetKey);
      const presetLabel = text(preset.label, `Preset "${presetKey}" label`, 70);
      const note = text(preset.note, `Preset "${presetKey}" note`, 100, false);
      const promptText = text(preset.promptText, `Preset "${presetKey}" prompt text`, 2000);
      const thumbnail = decodeThumbnail(preset.thumbnail, `Preset "${presetKey}"`);
      assetBytes += thumbnail.buffer.length;
      if (assetBytes > MAX_PROMPT_PACK_ASSET_BYTES) throw packError('Prompt pack thumbnails exceed the 24 MB decoded limit');
      const thumbnailFile = `${categoryId}-${presetId}${thumbnail.extension}`;
      assets.push({
        categoryId,
        presetId,
        file: thumbnailFile,
        buffer: thumbnail.buffer,
        mime: thumbnail.mime,
        width: thumbnail.width,
        height: thumbnail.height,
      });
      return {
        id: presetId,
        label: presetLabel,
        note,
        promptText,
        thumbnailFile,
      };
    });
    return {
      id: categoryId,
      label: categoryLabel,
      description: categoryDescription,
      accent,
      selectionMode: 'single',
      presets: normalizedPresets,
    };
  });

  const fingerprint = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    manifest: {
      format: PROMPT_PACK_FORMAT,
      formatVersion: PROMPT_PACK_FORMAT_VERSION,
      type: 'prompt-presets',
      id,
      name,
      version,
      author,
      description,
      fingerprint,
      enabled: true,
      categories: normalizedCategories,
    },
    assets,
    bytes: buffer.length,
    assetBytes,
    presetCount,
  };
}

function installedPromptPackPath(root, id) {
  const safe = safeId(id, 'Pack ID', PACK_ID_RE);
  return path.join(path.resolve(root), safe);
}

function normalizeInstalledManifest(source, expectedId = '') {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw packError('Installed pack manifest is invalid');
  if (source.format !== PROMPT_PACK_FORMAT
      || Number(source.formatVersion) !== PROMPT_PACK_FORMAT_VERSION
      || source.type !== 'prompt-presets') {
    throw packError('Installed pack format is not supported');
  }
  const id = safeId(source.id, 'Pack ID', PACK_ID_RE);
  if (expectedId && id !== expectedId) throw packError('Installed pack directory does not match its manifest');
  const sourceCategories = Array.isArray(source.categories) ? source.categories : [];
  if (!sourceCategories.length || sourceCategories.length > MAX_PROMPT_PACK_CATEGORIES) {
    throw packError('Installed pack category count is invalid');
  }
  const seenCategories = new Set();
  const seenPresetKeys = new Set();
  let presetCount = 0;
  const categories = sourceCategories.map((category) => {
    const categoryId = safeId(category.id, 'Category ID', CATEGORY_ID_RE);
    if (seenCategories.has(categoryId)) throw packError(`Installed category "${categoryId}" is duplicated`);
    seenCategories.add(categoryId);
    const presets = (Array.isArray(category.presets) ? category.presets : []).map((preset) => {
      presetCount += 1;
      if (presetCount > MAX_PROMPT_PACK_PRESETS) throw packError('Installed pack has too many presets');
      const presetId = safeId(preset.id, 'Preset ID', PRESET_ID_RE);
      const presetKey = `${categoryId}:${presetId}`;
      if (seenPresetKeys.has(presetKey)) throw packError(`Installed preset "${presetKey}" is duplicated`);
      seenPresetKeys.add(presetKey);
      const thumbnailFile = path.basename(String(preset.thumbnailFile || ''));
      if (!new RegExp(`^[a-z][a-z0-9-]*-${presetId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(?:jpg|png|webp)$`).test(thumbnailFile)) {
        throw packError(`Installed thumbnail for "${presetId}" is invalid`);
      }
      return {
        id: presetId,
        label: text(preset.label, 'Preset label', 70),
        note: text(preset.note, 'Preset note', 100, false),
        promptText: text(preset.promptText, 'Preset prompt text', 2000),
        thumbnailFile,
      };
    });
    if (!presets.length) throw packError(`Installed category "${categoryId}" has no presets`);
    return {
      id: categoryId,
      label: text(category.label, 'Category label', 50),
      description: text(category.description, 'Category description', 180, false),
      accent: PROMPT_PACK_ACCENTS.has(category.accent) ? category.accent : 'violet',
      selectionMode: 'single',
      presets,
    };
  });
  return {
    format: PROMPT_PACK_FORMAT,
    formatVersion: PROMPT_PACK_FORMAT_VERSION,
    type: 'prompt-presets',
    id,
    name: text(source.name, 'Pack name', 80),
    version: text(source.version, 'Pack version', 40),
    author: text(source.author, 'Pack author', 80),
    description: text(source.description, 'Pack description', 280, false),
    fingerprint: String(source.fingerprint || ''),
    enabled: source.enabled !== false,
    installedAt: Number(source.installedAt) || 0,
    updatedAt: Number(source.updatedAt) || 0,
    categories,
  };
}

async function readInstalledPromptPack(root, id) {
  const directory = installedPromptPackPath(root, id);
  try {
    const source = JSON.parse(await fsp.readFile(path.join(directory, 'manifest.json'), 'utf8'));
    return normalizeInstalledManifest(source, id);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error && error.code === 'invalid_prompt_pack') throw error;
    throw packError(`Could not read installed prompt pack "${id}"`, 'prompt_pack_read_failed');
  }
}

async function listInstalledPromptPacks(root) {
  let entries = [];
  try { entries = await fsp.readdir(root, { withFileTypes: true }); }
  catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }
  const packs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !PACK_ID_RE.test(entry.name)) continue;
    try {
      const pack = await readInstalledPromptPack(root, entry.name);
      if (pack) packs.push(pack);
    } catch {
      // One broken user pack must not hide the remaining installed packs.
    }
  }
  return packs.sort((a, b) => a.name.localeCompare(b.name));
}

async function writeJsonAtomic(file, value) {
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  try { await fsp.rename(temporary, file); }
  catch (error) {
    await fsp.unlink(temporary).catch(() => {});
    throw error;
  }
}

async function installPromptPack(root, trashRoot, inspected, options = {}) {
  if (!inspected || !inspected.manifest || !Array.isArray(inspected.assets)) throw packError('Inspected prompt pack is required');
  const now = Number(options.now) || Date.now();
  const target = installedPromptPackPath(root, inspected.manifest.id);
  const current = await readInstalledPromptPack(root, inspected.manifest.id);
  if (current && options.replace !== true) {
    const error = packError(`"${current.name}" is already installed`, 'prompt_pack_exists');
    error.current = current;
    throw error;
  }
  if (current && comparePackVersions(inspected.manifest.version, current.version) < 0 && options.allowDowngrade !== true) {
    const error = packError(`Version ${inspected.manifest.version} is older than installed version ${current.version}`, 'prompt_pack_downgrade');
    error.current = current;
    throw error;
  }
  await fsp.mkdir(root, { recursive: true });
  const temporary = path.join(root, `.install-${inspected.manifest.id}-${crypto.randomUUID()}`);
  await fsp.mkdir(temporary, { recursive: false });
  const manifest = Object.assign({}, inspected.manifest, {
    installedAt: current?.installedAt || now,
    updatedAt: now,
    enabled: current ? current.enabled : true,
  });
  try {
    for (const asset of inspected.assets) {
      await fsp.writeFile(path.join(temporary, asset.file), asset.buffer, { flag: 'wx' });
    }
    await fsp.writeFile(path.join(temporary, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    let backup = '';
    if (current) {
      await fsp.mkdir(trashRoot, { recursive: true });
      backup = path.join(
        trashRoot,
        `${now}_${current.id}_${current.version.replace(/[^0-9A-Za-z.-]+/g, '-')}_${crypto.randomUUID().slice(0, 8)}`,
      );
      await fsp.rename(target, backup);
    }
    try { await fsp.rename(temporary, target); }
    catch (error) {
      if (backup) await fsp.rename(backup, target).catch(() => {});
      throw error;
    }
    return normalizeInstalledManifest(manifest, manifest.id);
  } catch (error) {
    await fsp.rm(temporary, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function setPromptPackEnabled(root, id, enabled) {
  const pack = await readInstalledPromptPack(root, id);
  if (!pack) throw packError('Prompt pack is not installed', 'prompt_pack_not_found');
  pack.enabled = enabled === true;
  pack.updatedAt = Date.now();
  await writeJsonAtomic(path.join(installedPromptPackPath(root, id), 'manifest.json'), pack);
  return pack;
}

async function removePromptPack(root, trashRoot, id, now = Date.now()) {
  const pack = await readInstalledPromptPack(root, id);
  if (!pack) throw packError('Prompt pack is not installed', 'prompt_pack_not_found');
  await fsp.mkdir(trashRoot, { recursive: true });
  const target = path.join(
    trashRoot,
    `${Number(now) || Date.now()}_${pack.id}_${pack.version.replace(/[^0-9A-Za-z.-]+/g, '-')}_${crypto.randomUUID().slice(0, 8)}`,
  );
  await fsp.rename(installedPromptPackPath(root, id), target);
  return { pack, trashPath: target };
}

function publicPromptPack(pack, assetBase = '') {
  const cacheKey = encodeURIComponent(String(pack.fingerprint || pack.updatedAt || '1').slice(0, 16));
  return Object.assign({}, pack, {
    categories: pack.categories.map((category) => Object.assign({}, category, {
      presets: category.presets.map((preset) => Object.assign({}, preset, {
        thumbnail: `${assetBase}/${encodeURIComponent(pack.id)}/assets/${encodeURIComponent(preset.thumbnailFile)}?v=${cacheKey}`,
      })),
    })),
  });
}

function promptPackInspectionSummary(inspected, previewLimit = 4) {
  const previews = inspected.assets.slice(0, Math.max(0, previewLimit)).map((asset) => ({
    categoryId: asset.categoryId,
    presetId: asset.presetId,
    src: `data:${asset.mime};base64,${asset.buffer.toString('base64')}`,
  }));
  return {
    pack: inspected.manifest,
    bytes: inspected.bytes,
    assetBytes: inspected.assetBytes,
    presetCount: inspected.presetCount,
    previews,
  };
}

module.exports = {
  CATEGORY_ID_RE,
  MAX_PROMPT_PACK_BYTES,
  MAX_PROMPT_PACK_PRESETS,
  PACK_ID_RE,
  PRESET_ID_RE,
  PROMPT_PACK_ACCENTS,
  PROMPT_PACK_FORMAT,
  PROMPT_PACK_FORMAT_VERSION,
  comparePackVersions,
  inspectPromptPackBuffer,
  installPromptPack,
  installedPromptPackPath,
  listInstalledPromptPacks,
  normalizeInstalledManifest,
  promptPackInspectionSummary,
  publicPromptPack,
  readInstalledPromptPack,
  removePromptPack,
  setPromptPackEnabled,
  thumbnailDimensions,
};
