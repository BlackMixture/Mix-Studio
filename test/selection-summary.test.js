'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { selectionAssetRefs, selectionSummary } = require('../lib/selection-summary');

test('selectionAssetRefs collects unique local image and video assets', () => {
  const items = [{
    file: 'one.png', upscaled: 'one-up.png', sourceFile: 'source.png',
    composites: [{ file: 'sheet.png' }, { file: 'sheet.png' }],
    videos: [{ file: 'clip.mp4' }],
  }];
  assert.deepEqual(selectionAssetRefs(items), [
    { kind: 'image', file: 'one.png' },
    { kind: 'image', file: 'one-up.png' },
    { kind: 'image', file: 'source.png' },
    { kind: 'image', file: 'sheet.png' },
    { kind: 'video', file: 'clip.mp4' },
  ]);
});

test('selectionSummary totals duration, media counts, bytes, and date range', () => {
  const items = [{
    file: 'one.png', createdAt: 1000, durationMs: 4000, upscaleDurationMs: 1000,
    composites: [{ file: 'sheet.png', createdAt: 1500, durationMs: 500 }],
    videos: [{ file: 'clip.mp4', createdAt: 2000, info: { durationMs: 7000 } }],
  }, { file: 'two.png', createdAt: 500 }];
  assert.deepEqual(selectionSummary(items, 4096), {
    items: 2,
    images: 3,
    videos: 1,
    files: 4,
    bytes: 4096,
    generationMs: 12500,
    earliest: 500,
    latest: 2000,
  });
});
