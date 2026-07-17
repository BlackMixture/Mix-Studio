'use strict';

const MAX_ANNOUNCEMENTS = 30;
const MAX_TITLE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 800;
const MAX_VERSION_LENGTH = 40;

function cleanSingleLine(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function cleanMessage(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH);
}

function normalizeAnnouncementInput(value = {}) {
  const title = cleanSingleLine(value.title, MAX_TITLE_LENGTH);
  const message = cleanMessage(value.message);
  const version = cleanSingleLine(value.version, MAX_VERSION_LENGTH);
  if (!title) throw new Error('Add a short update title');
  if (!message) throw new Error('Add a message for this update');
  return { title, message, version };
}

function normalizeStoredAnnouncement(value) {
  if (!value || typeof value !== 'object') return null;
  try {
    const content = normalizeAnnouncementInput(value);
    const id = cleanSingleLine(value.id, 64);
    const createdAt = Number(value.createdAt);
    if (!id || !Number.isFinite(createdAt) || createdAt <= 0) return null;
    return {
      id,
      ...content,
      createdAt,
      createdBy: cleanSingleLine(value.createdBy, 64),
    };
  } catch {
    return null;
  }
}

function normalizeAnnouncementList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .map(normalizeStoredAnnouncement)
    .filter((entry) => {
      if (!entry || seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_ANNOUNCEMENTS);
}

module.exports = {
  MAX_ANNOUNCEMENTS,
  MAX_TITLE_LENGTH,
  MAX_MESSAGE_LENGTH,
  MAX_VERSION_LENGTH,
  normalizeAnnouncementInput,
  normalizeAnnouncementList,
  normalizeStoredAnnouncement,
};
