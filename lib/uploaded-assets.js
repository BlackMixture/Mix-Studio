'use strict';

const path = require('path');

const IMAGE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.avif', '.heic', '.heif',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.mpeg', '.mpg',
]);
const AUDIO_EXTENSIONS = new Set([
  '.wav', '.mp3', '.m4a', '.flac', '.ogg', '.oga', '.aac', '.opus', '.aiff', '.aif',
]);

function uploadedAssetKind(filename, contentType = '') {
  const extension = path.extname(String(filename || '')).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  const type = String(contentType || '').toLowerCase().split(';', 1)[0].trim();
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

function containsExactString(value, expected, seen = new Set()) {
  if (value === expected) return true;
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((entry) => containsExactString(entry, expected, seen));
  return Object.values(value).some((entry) => containsExactString(entry, expected, seen));
}

function uploadedAssetUsage(asset, { items = [], jobs = [] } = {}) {
  const name = String(asset && asset.name || '');
  const profileId = asset && asset.profileId;
  if (!name) return { savedGenerations: 0, activeJobs: 0, inUse: false };
  const savedGenerations = items.filter((item) => (
    (!profileId || item.profileId === profileId) && containsExactString(item, name)
  )).length;
  const activeJobs = jobs.filter((job) => (
    (!profileId || job.profileId === profileId) && containsExactString(job, name)
  )).length;
  return {
    savedGenerations,
    activeJobs,
    inUse: savedGenerations > 0 || activeJobs > 0,
  };
}

function publicUploadedAsset(asset) {
  return {
    id: asset.id,
    name: asset.name,
    label: asset.label,
    kind: asset.kind,
    size: Number(asset.size) || 0,
    hasAudio: asset.hasAudio === true,
    createdAt: Number(asset.createdAt) || 0,
  };
}

module.exports = {
  uploadedAssetKind,
  containsExactString,
  uploadedAssetUsage,
  publicUploadedAsset,
};
