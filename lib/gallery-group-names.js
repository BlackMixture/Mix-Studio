'use strict';

const { normalizeGenerationName } = require('./generation-name');

const GROUP_TYPES = Object.freeze({
  generation: Object.freeze({
    idKey: 'generationGroupId',
    nameKey: 'generationGroupName',
  }),
  angle: Object.freeze({
    idKey: 'angleGroupId',
    nameKey: 'angleGroupName',
  }),
});

function galleryGroupIdentity(items, anchor) {
  if (!anchor) return null;
  const candidates = Array.isArray(items) ? items.filter(Boolean) : [];
  for (const [type, fields] of Object.entries(GROUP_TYPES)) {
    const id = anchor[fields.idKey];
    if (!id) continue;
    const members = candidates.filter((item) => item.profileId === anchor.profileId && item[fields.idKey] === id);
    if (members.length < 2) continue;
    const namedMember = members.find((item) => normalizeGenerationName(item[fields.nameKey]));
    return {
      type,
      id,
      idKey: fields.idKey,
      nameKey: fields.nameKey,
      name: namedMember ? normalizeGenerationName(namedMember[fields.nameKey]) : '',
      members,
    };
  }
  return null;
}

function updateGalleryGroupName(items, options = {}) {
  const anchor = options.anchor;
  if (!anchor || anchor.profileId !== options.profileId) return { ok: false, reason: 'missing' };
  const group = galleryGroupIdentity(items, anchor);
  if (!group) return { ok: false, reason: 'not_grouped' };
  if (options.groupType !== group.type || String(options.groupId || '') !== String(group.id)) {
    return { ok: false, reason: 'stale' };
  }
  if (options.visibleIds instanceof Set && group.members.some((item) => !options.visibleIds.has(String(item.id)))) {
    return { ok: false, reason: 'locked' };
  }

  const name = normalizeGenerationName(options.name);
  for (const item of group.members) {
    if (name) item[group.nameKey] = name;
    else delete item[group.nameKey];
  }
  return {
    ok: true,
    groupType: group.type,
    groupId: group.id,
    name,
    count: group.members.length,
  };
}

module.exports = {
  GROUP_TYPES,
  galleryGroupIdentity,
  updateGalleryGroupName,
};
