'use strict';

const crypto = require('crypto');

const PROFILE_COOKIE = 'ks_profile';

function hashPin(pin, salt) {
  const s = salt || crypto.randomBytes(8).toString('hex');
  const hash = crypto.createHash('sha256').update(`${s}:${String(pin)}`).digest('hex');
  return { salt: s, hash };
}

function verifyPin(profile, pin) {
  if (!profile || !profile.pinHash) return true; // open profile
  if (!pin) return false;
  const { hash } = hashPin(pin, profile.pinSalt);
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(profile.pinHash));
  } catch {
    return false;
  }
}

function signProfileId(id, secret) {
  const sig = crypto.createHmac('sha256', secret).update(String(id)).digest('hex').slice(0, 24);
  return `${id}.${sig}`;
}

function parseProfileToken(token, secret) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const good = crypto.createHmac('sha256', secret).update(parts[0]).digest('hex').slice(0, 24);
  try {
    if (crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(good))) return parts[0];
  } catch { /* length mismatch */ }
  return null;
}

function publicProfile(profile, db) {
  return {
    id: profile.id,
    name: profile.name,
    hasPin: !!profile.pinHash,
    avatar: profile.avatar || null,
    createdAt: profile.createdAt,
    itemCount: ((db && db.items) || []).filter((it) => it.profileId === profile.id).length,
  };
}

/** A single profile without a PIN is intentionally an open local workspace. */
function defaultOpenProfile(db) {
  const profiles = Array.isArray(db && db.profiles) ? db.profiles : [];
  return profiles.length === 1 && !profiles[0].pinHash ? profiles[0] : null;
}

/** True when the db holds pre-profiles content that nobody owns yet. */
function hasOrphans(db) {
  for (const list of [db.items, db.folders, db.history, db.loraPresets, db.faces]) {
    for (const entry of list || []) {
      if (entry && !entry.profileId) return true;
    }
  }
  return false;
}

/** One-time adoption: everything unowned belongs to the first profile. */
function adoptOrphans(db, profileId) {
  let changed = 0;
  for (const list of [db.items, db.folders, db.history, db.loraPresets, db.faces]) {
    for (const entry of list || []) {
      if (entry && !entry.profileId) { entry.profileId = profileId; changed++; }
    }
  }
  return changed;
}

module.exports = {
  PROFILE_COOKIE,
  hashPin,
  verifyPin,
  signProfileId,
  parseProfileToken,
  publicProfile,
  defaultOpenProfile,
  hasOrphans,
  adoptOrphans,
};
