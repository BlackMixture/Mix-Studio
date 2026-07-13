'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPin,
  verifyPin,
  signProfileId,
  parseProfileToken,
  publicProfile,
  defaultOpenProfile,
  adoptOrphans,
  hasOrphans,
} = require('../lib/profiles');

test('pin hashing verifies correct pin and rejects wrong pin', () => {
  const { salt, hash } = hashPin('4321');
  const profile = { pinSalt: salt, pinHash: hash };
  assert.equal(verifyPin(profile, '4321'), true);
  assert.equal(verifyPin(profile, '0000'), false);
  assert.equal(verifyPin(profile, ''), false);
  assert.equal(verifyPin({ pinHash: null }, ''), true); // open profile
});

test('profile tokens round-trip and reject tampering', () => {
  const token = signProfileId('abc123', 'secret');
  assert.equal(parseProfileToken(token, 'secret'), 'abc123');
  assert.equal(parseProfileToken(token, 'other-secret'), null);
  assert.equal(parseProfileToken('abc123.deadbeef', 'secret'), null);
  assert.equal(parseProfileToken('', 'secret'), null);
});

test('publicProfile counts items and hides pin material', () => {
  const db = { items: [{ profileId: 'p1' }, { profileId: 'p1' }, { profileId: 'p2' }] };
  const pub = publicProfile({ id: 'p1', name: 'Example', pinHash: 'x', pinSalt: 'y', createdAt: 1 }, db);
  assert.deepEqual(pub, { id: 'p1', name: 'Example', hasPin: true, avatar: null, createdAt: 1, itemCount: 2 });
  assert.equal('pinHash' in pub, false);
});

test('a single profile without a PIN is the default open workspace', () => {
  const owner = { id: 'owner', name: 'Owner', pinHash: null };
  assert.equal(defaultOpenProfile({ profiles: [owner] }), owner);
  assert.equal(defaultOpenProfile({ profiles: [{ ...owner, pinHash: 'hash' }] }), null);
  assert.equal(defaultOpenProfile({ profiles: [owner, { id: 'other', pinHash: null }] }), null);
  assert.equal(defaultOpenProfile({ profiles: [] }), null);
});

test('hasOrphans is false on a fresh db, true when legacy content is unowned', () => {
  assert.equal(hasOrphans({}), false);
  assert.equal(hasOrphans({ items: [], folders: [], history: [], loraPresets: [], faces: [] }), false);
  assert.equal(hasOrphans({ items: [{ id: 'a', profileId: 'p1' }] }), false);
  assert.equal(hasOrphans({ items: [{ id: 'a' }] }), true);
  assert.equal(hasOrphans({ history: [{ ts: 1 }] }), true);
});

test('adoptOrphans assigns unowned content to the given profile', () => {
  const db = {
    items: [{ id: 'a' }, { id: 'b', profileId: 'p2' }],
    folders: [{ id: 'f' }],
    history: [{ ts: 1 }],
    loraPresets: [],
    faces: [{ id: 'x' }],
  };
  const changed = adoptOrphans(db, 'p1');
  assert.equal(changed, 4);
  assert.equal(db.items[0].profileId, 'p1');
  assert.equal(db.items[1].profileId, 'p2');
  assert.equal(db.folders[0].profileId, 'p1');
  assert.equal(db.faces[0].profileId, 'p1');
});
