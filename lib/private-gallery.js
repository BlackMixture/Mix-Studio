'use strict';

const DEFAULT_PRIVATE_PASSWORD = '1234';

function galleryPassword(settings) {
  const value = String((settings && settings.galleryPassword) || '').trim();
  return value || DEFAULT_PRIVATE_PASSWORD;
}

function lockedFolderIds(db) {
  return new Set((db.folders || []).filter((f) => f && f.locked).map((f) => f.id));
}

function publicFolder(folder) {
  return Object.assign({}, folder, { locked: !!folder.locked });
}

function galleryView(db, unlocked) {
  const locked = lockedFolderIds(db);
  // Locked folders stay LISTED (so items can be dropped into them without
  // unlocking); only their CONTENTS are hidden while locked.
  const folders = (db.folders || []).map(publicFolder);
  const items = (db.items || []).filter((it) => unlocked || !locked.has(it.folder));
  return { folders, items };
}

function setFolderLocked(db, folderId, locked) {
  const folder = (db.folders || []).find((f) => f.id === folderId);
  if (!folder) return null;
  folder.locked = !!locked;
  return publicFolder(folder);
}

function canMoveToFolder(db, folderId) {
  if (!folderId) return { ok: true };
  const folder = (db.folders || []).find((f) => f.id === folderId);
  if (!folder) return { ok: false, reason: 'missing' };
  // Moving INTO a locked folder is a drop-box: nothing is revealed, so no
  // unlock is required. Viewing or moving OUT still needs the PIN (hidden
  // items can't be selected while locked).
  return { ok: true };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

module.exports = {
  DEFAULT_PRIVATE_PASSWORD,
  galleryPassword,
  galleryView,
  setFolderLocked,
  canMoveToFolder,
  parseCookies,
};
