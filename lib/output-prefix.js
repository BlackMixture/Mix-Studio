'use strict';

function safeSegment(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return normalized || fallback;
}

function profileOutputFolder(profile) {
  const name = safeSegment(profile && profile.name, 'Profile');
  const id = safeSegment(profile && profile.id, 'local').slice(0, 8);
  return `${name}_${id}`;
}

function applyProfileOutputPrefix(graph, profile) {
  if (!graph || !profile) return graph;
  const folder = `MixStudio/${profileOutputFolder(profile)}`;
  for (const node of Object.values(graph)) {
    if (!node || !['SaveImage', 'SaveVideo'].includes(node.class_type) || !node.inputs) continue;
    const parts = String(node.inputs.filename_prefix || 'output').split(/[\\/]+/).filter(Boolean);
    const leaf = safeSegment(parts[parts.length - 1], node.class_type === 'SaveVideo' ? 'video' : 'image');
    node.inputs.filename_prefix = `${folder}/${leaf}`;
  }
  return graph;
}

module.exports = { applyProfileOutputPrefix, profileOutputFolder, safeSegment };
