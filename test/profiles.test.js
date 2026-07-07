'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPin,
  verifyPin,
  signProfileId,
  parseProfileToken,
  publicProfile,
  adoptOrphans,
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
  const pub = publicProfile({ id: 'p1', name: 'Nathan', pinHash: 'x', pinSalt: 'y', createdAt: 1 }, db);
  assert.deepEqual(pub, { id: 'p1', name: 'Nathan', hasPin: true, avatar: null, createdAt: 1, itemCount: 2 });
  assert.equal('pinHash' in pub, false);
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
