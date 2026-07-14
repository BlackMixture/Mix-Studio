'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  LTX_MAX_SECONDS,
  LTX_CAMERA_FPS,
  LTX_CAMERA_MAX_SECONDS,
  ltxCameraDurationSeconds,
  ltxDurationSeconds,
  ltxFramesForSeconds,
  SCAIL_FPS,
  SCAIL_FPS_CHOICES,
  scailDurationSeconds,
  scailFramesForSeconds,
  scailInfinityMaskArgs,
  scailInfinitySamTrackArgs,
  scailMode,
  normalizeScailFps,
  normalizeScailChunkOptions,
  scailMaskArgs,
  scailSamTrackArgs,
  scailSegments,
  videoProcessInfo,
} = require('../lib/video-workflows');

test('LTX 2.3 accepts up to 20 seconds and preserves 8n+1 frame counts', () => {
  assert.equal(LTX_MAX_SECONDS, 20);
  assert.equal(ltxDurationSeconds(25), 20);
  assert.equal(ltxDurationSeconds(0), 1);
  assert.equal(ltxFramesForSeconds(20, 24), 481);
  assert.equal(ltxFramesForSeconds(20, 25), 497);
  assert.equal((ltxFramesForSeconds(20, 25) - 1) % 8, 0);
  assert.equal(ltxFramesForSeconds(20, 25, 15), 377);
});

test('LTX Cameraman guidance stays inside its 24 fps five-second training window', () => {
  assert.equal(LTX_CAMERA_FPS, 24);
  assert.equal(LTX_CAMERA_MAX_SECONDS, 5);
  assert.equal(ltxCameraDurationSeconds(10), 5);
  assert.equal(ltxCameraDurationSeconds(5, 10, 4), 5);
  assert.equal(ltxCameraDurationSeconds(5, 6, 3), 3);
  assert.equal(ltxFramesForSeconds(ltxCameraDurationSeconds(5), LTX_CAMERA_FPS, LTX_CAMERA_MAX_SECONDS), 121);
});

test('scailDurationSeconds clamps to trim length and 60 second app cap', () => {
  assert.equal(scailDurationSeconds(90, 120), 60);
  assert.equal(scailDurationSeconds(30, 12.4), 12.4);
  assert.equal(scailDurationSeconds(0, 8), 1);
});

test('SCAIL frame-rate choices default to 16 and preserve 4n+1 frame counts at 16 or 24 fps', () => {
  assert.equal(SCAIL_FPS, 16);
  assert.deepEqual(SCAIL_FPS_CHOICES, [16, 24]);
  assert.equal(normalizeScailFps(16), 16);
  assert.equal(normalizeScailFps(24), 24);
  assert.equal(normalizeScailFps(30), 16);
  assert.equal(scailFramesForSeconds(5), 81);
  assert.equal(scailFramesForSeconds(12), 193);
  assert.equal((scailFramesForSeconds(12) - 1) % 4, 0);
  assert.equal(scailFramesForSeconds(5, 24), 121);
  assert.equal(scailFramesForSeconds(12, 24), 289);
  assert.equal((scailFramesForSeconds(12, 24) - 1) % 4, 0);
});

test('scailMode defaults to infinity and accepts legacy modes', () => {
  assert.equal(scailMode(), 'infinity');
  assert.equal(scailMode('infinity'), 'infinity');
  assert.equal(scailMode('chunked'), 'chunked');
  assert.equal(scailMode('direct'), 'direct');
  assert.equal(scailMode('weird'), 'infinity');
});

test('scailSegments plans 81-frame chunks with 5-frame overlap', () => {
  assert.deepEqual(scailSegments(193), [
    { index: 0, startFrame: 0, length: 81, keepStart: 0, keepLength: 81 },
    { index: 1, startFrame: 76, length: 81, keepStart: 5, keepLength: 76 },
    { index: 2, startFrame: 152, length: 41, keepStart: 5, keepLength: 36 },
  ]);
});

test('scailSegments supports larger overlaps for stable chunk boundaries', () => {
  assert.deepEqual(scailSegments(193, { chunkFrames: 81, overlapFrames: 13 }), [
    { index: 0, startFrame: 0, length: 81, keepStart: 0, keepLength: 81 },
    { index: 1, startFrame: 68, length: 81, keepStart: 13, keepLength: 68 },
    { index: 2, startFrame: 136, length: 57, keepStart: 13, keepLength: 44 },
  ]);
});

test('normalizeScailChunkOptions defaults chunked SCAIL to stable 81-frame chunks with 13-frame overlap', () => {
  assert.deepEqual(normalizeScailChunkOptions({ mode: 'chunked' }), {
    stableTracking: true,
    chunkFrames: 81,
    overlapFrames: 13,
  });
  assert.deepEqual(normalizeScailChunkOptions({
    mode: 'chunked',
    stableTracking: false,
    chunkFrames: 61,
    overlapFrames: 17,
  }), {
    stableTracking: false,
    chunkFrames: 61,
    overlapFrames: 17,
  });
  assert.deepEqual(normalizeScailChunkOptions({
    mode: 'infinity',
    stableTracking: true,
    chunkFrames: 41,
    overlapFrames: 9,
  }), {
    stableTracking: false,
    chunkFrames: 41,
    overlapFrames: 9,
  });
});

test('SCAIL tracking defaults keep masks stable across chunks', () => {
  assert.deepEqual(scailSamTrackArgs(), [0.5, 4, 1]);
  assert.deepEqual(scailMaskArgs(), ['', 'left_to_right', false]);
});

test('SCAIL Infinity uses the provided workflow tracking and mask defaults', () => {
  assert.deepEqual(scailInfinitySamTrackArgs(), [0.5, 0, 1]);
  assert.deepEqual(scailInfinityMaskArgs(), ['', 'area', false]);
});

test('videoProcessInfo updates metadata for after-the-fact interpolation and upscale', () => {
  const base = { engine: 'scail', frames: 81, fps: 16, width: 512, height: 896, motionPrompt: 'spin' };

  assert.deepEqual(videoProcessInfo(base, { kind: 'interpolate', multiplier: 2, parentVideoId: 'v1' }), {
    engine: 'scail',
    frames: 162,
    fps: 32,
    width: 512,
    height: 896,
    motionPrompt: 'spin',
    smooth: 2,
    processed: 'interpolate',
    parentVideoId: 'v1',
  });

  assert.deepEqual(videoProcessInfo(base, { kind: 'upscale', scale: 2, parentVideoId: 'v1' }), {
    engine: 'scail',
    frames: 81,
    fps: 16,
    width: 1024,
    height: 1792,
    motionPrompt: 'spin',
    fourK: true,
    processed: 'upscale',
    parentVideoId: 'v1',
  });
});
