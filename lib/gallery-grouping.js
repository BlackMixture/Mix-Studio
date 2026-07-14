'use strict';

function expandGalleryGroupSelection(items, ids) {
  const candidates = Array.isArray(items) ? items.filter(Boolean) : [];
  const includedIds = new Set((Array.isArray(ids) ? ids : []).map(String));
  if (!includedIds.size) return [];

  // Manual groups can contain automatic camera-angle groups, and older data
  // may contain overlapping groups from regrouping. Walk the connected groups
  // until every member represented by the selection is included.
  let changed = true;
  while (changed) {
    changed = false;
    const generationGroupIds = new Set();
    const angleGroupIds = new Set();

    for (const item of candidates) {
      if (!includedIds.has(String(item.id))) continue;
      if (item.generationGroupId) generationGroupIds.add(item.generationGroupId);
      if (item.angleGroupId) angleGroupIds.add(item.angleGroupId);
    }

    for (const item of candidates) {
      if (includedIds.has(String(item.id))) continue;
      if ((item.generationGroupId && generationGroupIds.has(item.generationGroupId))
        || (item.angleGroupId && angleGroupIds.has(item.angleGroupId))) {
        includedIds.add(String(item.id));
        changed = true;
      }
    }
  }

  return candidates.filter((item) => includedIds.has(String(item.id)));
}

module.exports = { expandGalleryGroupSelection };
