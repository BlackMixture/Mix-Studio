'use strict';

const crypto = require('crypto');

const PROFILE_COOKIE = 'ks_profile';
const SCRYPT_PREFIX = 'scrypt$';

function legacyPinHash(pin, salt) {
  return crypto.createHash('sha256').update(`${salt}:${String(pin)}`).digest('hex');
}

function hashPin(pin, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(pin), s, 32, {
    N: 1 << 14,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  const hash = `${SCRYPT_PREFIX}${derived.toString('base64url')}`;
  return { salt: s, hash };
}

function verifyPin(profile, pin) {
  if (!profile || !profile.pinHash) return true; // open profile
  if (!pin) return false;
  const stored = String(profile.pinHash || '');
  const hash = stored.startsWith(SCRYPT_PREFIX)
    ? hashPin(pin, profile.pinSalt).hash
    : legacyPinHash(pin, profile.pinSalt);
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

function isLoopbackAddress(value) {
  const address = String(value || '').trim().toLowerCase().split('%')[0];
  if (!address) return false;
  if (address === '::1' || address === 'localhost') return true;
  const ipv4 = address.startsWith('::ffff:') ? address.slice(7) : address;
  return /^127(?:\.\d{1,3}){3}$/.test(ipv4);
}

function createLoginThrottle(options = {}) {
  const maxAttempts = Math.max(2, Number(options.maxAttempts) || 5);
  const windowMs = Math.max(1000, Number(options.windowMs) || 5 * 60 * 1000);
  const blockMs = Math.max(1000, Number(options.blockMs) || 10 * 60 * 1000);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const attempts = new Map();

  function current(key) {
    const id = String(key || 'unknown');
    const time = now();
    let entry = attempts.get(id);
    if (entry && entry.blockedUntil > time) return { id, entry, time };
    if (!entry || time - entry.windowStartedAt >= windowMs) {
      entry = { count: 0, windowStartedAt: time, blockedUntil: 0 };
      attempts.set(id, entry);
    }
    return { id, entry, time };
  }

  return {
    check(key) {
      const { entry, time } = current(key);
      return entry.blockedUntil > time
        ? { allowed: false, retryAfterMs: entry.blockedUntil - time }
        : { allowed: true, retryAfterMs: 0 };
    },
    fail(key) {
      const { entry, time } = current(key);
      entry.count += 1;
      if (entry.count >= maxAttempts) entry.blockedUntil = time + blockMs;
      return entry.blockedUntil > time
        ? { allowed: false, retryAfterMs: entry.blockedUntil - time }
        : { allowed: true, retryAfterMs: 0 };
    },
    success(key) {
      attempts.delete(String(key || 'unknown'));
    },
  };
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
  for (const list of [db.items, db.folders, db.history, db.loraPresets, db.faces, db.uploadedAssets]) {
    for (const entry of list || []) {
      if (entry && !entry.profileId) return true;
    }
  }
  return false;
}

/** One-time adoption: everything unowned belongs to the first profile. */
function adoptOrphans(db, profileId) {
  let changed = 0;
  for (const list of [db.items, db.folders, db.history, db.loraPresets, db.faces, db.uploadedAssets]) {
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
  isLoopbackAddress,
  createLoginThrottle,
  signProfileId,
  parseProfileToken,
  publicProfile,
  defaultOpenProfile,
  hasOrphans,
  adoptOrphans,
};
