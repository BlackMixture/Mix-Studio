'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  galleryGroupIdentity,
  updateGalleryGroupName,
} = require('../lib/gallery-group-names');

test('manual generation groups take naming precedence over underlying camera groups', () => {
  const items = [
    { id: 'a', profileId: 'p1', generationGroupId: 'manual', angleGroupId: 'angles', angleGroupName: 'Turnaround' },
    { id: 'b', profileId: 'p1', generationGroupId: 'manual' },
    { id: 'c', profileId: 'p1', angleGroupId: 'angles', angleGroupName: 'Turnaround' },
  ];
  const group = galleryGroupIdentity(items, items[0]);
  assert.equal(group.type, 'generation');
  assert.equal(group.id, 'manual');
  assert.deepEqual(group.members.map((item) => item.id), ['a', 'b']);
});

test('group names normalize and update only same-profile members', () => {
  const items = [
    { id: 'a', profileId: 'p1', generationGroupId: 'shared' },
    { id: 'b', profileId: 'p1', generationGroupId: 'shared' },
    { id: 'c', profileId: 'p2', generationGroupId: 'shared' },
  ];
  const result = updateGalleryGroupName(items, {
    anchor: items[0],
    profileId: 'p1',
    groupType: 'generation',
    groupId: 'shared',
    expectedName: '',
    memberIds: ['a', 'b'],
    name: '  Neon\nStudies\u0000  ',
    visibleIds: new Set(['a', 'b']),
  });
  assert.deepEqual(result, {
    ok: true,
    groupType: 'generation',
    groupId: 'shared',
    name: 'Neon Studies',
    count: 2,
  });
  assert.equal(items[0].generationGroupName, 'Neon Studies');
  assert.equal(items[1].generationGroupName, 'Neon Studies');
  assert.equal(items[2].generationGroupName, undefined);
});

test('blank names clear the active name field without erasing an underlying angle name', () => {
  const items = [
    { id: 'a', profileId: 'p1', generationGroupId: 'manual', generationGroupName: 'Mixed set', angleGroupId: 'angles', angleGroupName: 'Turnaround' },
    { id: 'b', profileId: 'p1', generationGroupId: 'manual', generationGroupName: 'Mixed set' },
  ];
  const result = updateGalleryGroupName(items, {
    anchor: items[0],
    profileId: 'p1',
    groupType: 'generation',
    groupId: 'manual',
    expectedName: 'Mixed set',
    memberIds: ['a', 'b'],
    name: '   ',
  });
  assert.equal(result.name, '');
  assert.equal(items[0].generationGroupName, undefined);
  assert.equal(items[1].generationGroupName, undefined);
  assert.equal(items[0].angleGroupName, 'Turnaround');
});

test('stale, hidden, foreign, and singleton group updates do not mutate data', () => {
  const items = [
    { id: 'a', profileId: 'p1', angleGroupId: 'angles' },
    { id: 'b', profileId: 'p1', angleGroupId: 'angles' },
    { id: 'solo', profileId: 'p1', generationGroupId: 'solo-group' },
  ];
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[0], profileId: 'p2', groupType: 'angle', groupId: 'angles', expectedName: '', memberIds: ['a', 'b'], name: 'Nope',
  }).reason, 'missing');
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[0], profileId: 'p1', groupType: 'generation', groupId: 'angles', expectedName: '', memberIds: ['a', 'b'], name: 'Nope',
  }).reason, 'stale');
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[0], profileId: 'p1', groupType: 'angle', groupId: 'angles', expectedName: '', memberIds: ['a', 'b'], name: 'Nope', visibleIds: new Set(['a']),
  }).reason, 'locked');
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[2], profileId: 'p1', groupType: 'generation', groupId: 'solo-group', expectedName: '', memberIds: ['solo'], name: 'Nope',
  }).reason, 'not_grouped');
  assert.equal(items.some((item) => item.angleGroupName || item.generationGroupName), false);
});

test('stale names and memberships cannot overwrite a newer group state', () => {
  const items = [
    { id: 'a', profileId: 'p1', generationGroupId: 'group', generationGroupName: 'Current' },
    { id: 'b', profileId: 'p1', generationGroupId: 'group', generationGroupName: 'Current' },
  ];
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[0], profileId: 'p1', groupType: 'generation', groupId: 'group',
    expectedName: 'Older', memberIds: ['a', 'b'], name: 'Overwrite',
  }).reason, 'stale');
  assert.equal(updateGalleryGroupName(items, {
    anchor: items[0], profileId: 'p1', groupType: 'generation', groupId: 'group',
    expectedName: 'Current', memberIds: ['a'], name: 'Overwrite',
  }).reason, 'stale');
  assert.equal(items[0].generationGroupName, 'Current');
  assert.equal(items[1].generationGroupName, 'Current');
});
