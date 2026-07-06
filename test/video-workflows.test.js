'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  scailDurationSeconds,
  scailFramesForSeconds,
  scailMode,
  scailMaskArgs,
  scailSamTrackArgs,
  scailSegments,
  videoProcessInfo,
} = require('../lib/video-workflows');

test('scailDurationSeconds clamps to trim length and 60 second app cap', () => {
  assert.equal(scailDurationSeconds(90, 120), 60);
  assert.equal(scailDurationSeconds(30, 12.4), 12.4);
  assert.equal(scailDurationSeconds(0, 8), 1);
});

test('scailFramesForSeconds preserves Wan 4n+1 frame counts at 16 fps', () => {
  assert.equal(scailFramesForSeconds(5), 81);
  assert.equal(scailFramesForSeconds(12), 193);
  assert.equal((scailFramesForSeconds(12) - 1) % 4, 0);
});

test('scailMode defaults to chunked and accepts direct', () => {
  assert.equal(scailMode(), 'chunked');
  assert.equal(scailMode('direct'), 'direct');
  assert.equal(scailMode('weird'), 'chunked');
});

test('scailSegments plans 81-frame chunks with 5-frame overlap', () => {
  assert.deepEqual(scailSegments(193), [
    { index: 0, startFrame: 0, length: 81, keepStart: 0, keepLength: 81 },
    { index: 1, startFrame: 76, length: 81, keepStart: 5, keepLength: 76 },
    { index: 2, startFrame: 152, length: 41, keepStart: 5, keepLength: 36 },
  ]);
});

test('SCAIL tracking defaults keep masks stable across chunks', () => {
  assert.deepEqual(scailSamTrackArgs(), [0.5, 4, 1]);
  assert.deepEqual(scailMaskArgs(), ['', 'left_to_right', false]);
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
