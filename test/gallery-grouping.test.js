'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { expandGalleryGroupSelection } = require('../lib/gallery-grouping');

test('selected generation groups expand alongside standalone items', () => {
  const items = [
    { id: 'a', generationGroupId: 'group-1' },
    { id: 'b', generationGroupId: 'group-1' },
    { id: 'c', generationGroupId: 'group-2' },
    { id: 'd', generationGroupId: 'group-2' },
    { id: 'e' },
  ];

  assert.deepEqual(
    expandGalleryGroupSelection(items, ['a', 'c', 'e']).map((item) => item.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

test('overlapping manual and camera groups expand transitively', () => {
  const items = [
    { id: 'a', generationGroupId: 'manual', angleGroupId: 'angles-1' },
    { id: 'b', angleGroupId: 'angles-1' },
    { id: 'c', generationGroupId: 'manual', angleGroupId: 'angles-2' },
    { id: 'd', angleGroupId: 'angles-2' },
    { id: 'e' },
  ];

  assert.deepEqual(
    expandGalleryGroupSelection(items, ['a', 'e']).map((item) => item.id),
    ['a', 'b', 'c', 'd', 'e'],
  );
});

test('selection expansion is stable for missing and duplicate ids', () => {
  const items = [{ id: 1 }, { id: 2, generationGroupId: 'group' }, { id: 3, generationGroupId: 'group' }];
  assert.deepEqual(expandGalleryGroupSelection(items, ['2', '2', 'missing']).map((item) => item.id), [2, 3]);
  assert.deepEqual(expandGalleryGroupSelection(items, []), []);
});
