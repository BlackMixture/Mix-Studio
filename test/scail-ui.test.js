'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('SCAIL advanced controls expose stable chunks, chunk size, and overlap', () => {
  assert.match(indexHtml, /id="vidScailAdvancedRow"/);
  assert.match(indexHtml, /id="vidScailStable"/);
  assert.match(indexHtml, /data-scail-chunk-frames="81"/);
  assert.match(indexHtml, /data-scail-overlap="13"/);
});

test('SCAIL mode selector exposes Infinity as the preferred long-video path', () => {
  assert.match(indexHtml, /data-scail-mode="infinity"/);
  assert.match(appJs, /state\.vidScailMode = 'infinity'/);
  assert.match(serverJs, /WanSCAILInfinity/);
});

test('SCAIL requests include stable chunk settings and saved videos remember them', () => {
  assert.match(appJs, /scailStableTracking/);
  assert.match(appJs, /scailChunkFrames/);
  assert.match(appJs, /scailChunkOverlap/);
  assert.match(serverJs, /normalizeScailChunkOptions/);
  assert.match(serverJs, /scailStableTracking/);
});

test('SCAIL Infinity uses and reports the Pusa LoRA dependency', () => {
  assert.match(indexHtml, /id="setScailPusaLora"/);
  assert.match(appJs, /scailPusaLora/);
  assert.match(serverJs, /scailPusaLora/);
  assert.match(serverJs, /SCAIL-2 Infinity needs/);
});

test('SCAIL stable chunks track the driving clip once and slice per chunk', () => {
  assert.match(serverJs, /drive_full/);
  assert.match(serverJs, /track_drive_full/);
  assert.match(serverJs, /masks_full/);
  assert.match(serverJs, /GetImageRangeFromBatch/);
});
