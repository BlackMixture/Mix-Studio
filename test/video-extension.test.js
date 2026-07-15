'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  VIDEO_EXTENSION_MAX_SECONDS,
  VIDEO_EXTENSION_MAX_SOURCE_SECONDS,
  VIDEO_EXTENSION_MAX_4K_SOURCE_SECONDS,
  extensionPlaybackPlan,
  extensionDimensions,
  normalizeVideoExtensionPlan,
  normalizeDirectorExtensionPlan,
  videoExtensionInfo,
} = require('../lib/video-extension');

test('extension playback preserves supported 16, 24, and 25 fps source rates', () => {
  assert.deepEqual(extensionPlaybackPlan(16), {
    baseFps: 16,
    smooth: 1,
    outputFps: 16,
    resampled: false,
  });
  assert.deepEqual(extensionPlaybackPlan(24), {
    baseFps: 24,
    smooth: 1,
    outputFps: 24,
    resampled: false,
  });
  assert.deepEqual(extensionPlaybackPlan(25), {
    baseFps: 25,
    smooth: 1,
    outputFps: 25,
    resampled: false,
  });
});

test('extension playback retains app-generated 2x and 3x rates through RIFE', () => {
  assert.deepEqual(extensionPlaybackPlan(50), {
    baseFps: 25,
    smooth: 2,
    outputFps: 50,
    resampled: false,
  });
  assert.deepEqual(extensionPlaybackPlan(75), {
    baseFps: 25,
    smooth: 3,
    outputFps: 75,
    resampled: false,
  });
});

test('unusual high frame rates are safely resampled instead of becoming LTX sampling rates', () => {
  assert.deepEqual(extensionPlaybackPlan(59.94), {
    baseFps: 25,
    smooth: 1,
    outputFps: 25,
    resampled: true,
  });
  assert.deepEqual(extensionPlaybackPlan(120), {
    baseFps: 25,
    smooth: 1,
    outputFps: 25,
    resampled: true,
  });
});

test('extension plans remove the repeated seam frame from LTX 8n+1 generations', () => {
  const expected = [
    { fps: 16, continuationFrames: 81, appendedFrames: 80, totalFrames: 240, normalizedSeconds: 5 },
    { fps: 24, continuationFrames: 121, appendedFrames: 120, totalFrames: 360, normalizedSeconds: 5 },
    { fps: 25, continuationFrames: 129, appendedFrames: 128, totalFrames: 378, normalizedSeconds: 5.12 },
  ];

  for (const item of expected) {
    const plan = normalizeVideoExtensionPlan({
      info: { fps: item.fps, frames: item.fps * 10, width: 1280, height: 704 },
      seconds: 5,
    });
    assert.equal((plan.continuationFrames - 1) % 8, 0);
    assert.equal(plan.continuationFrames, item.continuationFrames);
    assert.equal(plan.appendedFrames, item.appendedFrames);
    assert.equal(plan.totalFrames, item.totalFrames);
    assert.equal(plan.normalizedSeconds, item.normalizedSeconds);
  }
});

test('seam removal preserves the exact post-interpolation frame count', () => {
  const twice = normalizeVideoExtensionPlan({
    info: { fps: 50, frames: 500, width: 1280, height: 704 },
    seconds: 5,
  });
  assert.equal(twice.continuationFrames, 129);
  assert.equal(twice.appendedFrames, (129 - 1) * 2);
  assert.equal(twice.totalFrames, 500 + 256);

  const thrice = normalizeVideoExtensionPlan({
    info: { fps: 75, frames: 750, width: 1280, height: 704 },
    seconds: 5,
  });
  assert.equal(thrice.continuationFrames, 129);
  assert.equal(thrice.appendedFrames, (129 - 1) * 3);
  assert.equal(thrice.totalFrames, 750 + 384);
});

test('Director extension plans correct legacy RIFE counts and retain exact repeat-extension counts', () => {
  const legacy = normalizeDirectorExtensionPlan({
    info: { fps: 50, frames: 258, smooth: 2, width: 1280, height: 704 },
    rangeFrames: 120,
    smooth: 2,
  });
  assert.equal(legacy.sourceSeconds, 257 / 50);
  assert.equal(legacy.outputFps, 48);
  assert.equal(legacy.continuationFrames, 121);
  assert.equal(legacy.appendedFrames, 240);
  assert.equal(legacy.totalFrames, Math.round((257 / 50) * 48) + 240);

  const exact = normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 241, smooth: 2, exactFrameCount: true, width: 1280, height: 704 },
    rangeFrames: 120,
    smooth: 1,
  });
  assert.equal(exact.sourceFrames, 241);
  assert.equal(exact.totalFrames, 361);
});

test('Director extension plans require reliable metadata, useful duration, and smaller 4K sources', () => {
  assert.equal(VIDEO_EXTENSION_MAX_4K_SOURCE_SECONDS, 10);
  assert.throws(() => normalizeDirectorExtensionPlan({
    info: { fps: 24, width: 1280, height: 704 }, rangeFrames: 120,
  }), /predates reliable playback metadata/);
  assert.throws(() => normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 120, width: 1280, height: 704 }, rangeFrames: 23,
  }), /at least 1 second/);
  const nominalTenSeconds = normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 241, width: 2048, height: 1152, fourK: true }, rangeFrames: 120,
  });
  assert.equal(nominalTenSeconds.sourceOriginalFrames, 241);
  assert.throws(() => normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 242, width: 2048, height: 1152, fourK: true }, rangeFrames: 120,
  }), /up to 10 seconds at 4K/);

  const nominalTwentySeconds = normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 481, width: 1280, height: 704, exactFrameCount: true }, rangeFrames: 120,
  });
  assert.equal(nominalTwentySeconds.sourceOriginalFrames, 481);
  assert.throws(() => normalizeDirectorExtensionPlan({
    info: { fps: 24, frames: 482, width: 1280, height: 704, exactFrameCount: true }, rangeFrames: 120,
  }), /up to 20 seconds/);
});

test('extension length and source length remain inside their safety caps', () => {
  assert.equal(VIDEO_EXTENSION_MAX_SECONDS, 20);
  assert.equal(VIDEO_EXTENSION_MAX_SOURCE_SECONDS, 20);

  const cappedExtension = normalizeVideoExtensionPlan({
    info: { fps: 24, frames: 480, width: 1280, height: 704 },
    seconds: 999,
  });
  assert.equal(cappedExtension.requestedSeconds, 20);
  assert.equal(cappedExtension.sourceSeconds, 20);

  assert.throws(
    () => normalizeVideoExtensionPlan({
      info: { fps: 24, frames: 481, width: 1280, height: 704 },
      seconds: 5,
    }),
    /source clips up to 20 seconds/,
  );
  assert.throws(
    () => normalizeVideoExtensionPlan({
      info: { fps: 24, width: 1280, height: 704 },
      sourceSeconds: 20.01,
      seconds: 5,
    }),
    /source clips up to 20 seconds/,
  );
});

test('extension dimensions normalize to model-safe multiples and preserve eligible 4K lineage', () => {
  assert.deepEqual(extensionDimensions(1281, 721, false), {
    W: 1280,
    H: 704,
    outputWidth: 1280,
    outputHeight: 720,
    fourK: false,
  });
  assert.deepEqual(extensionDimensions(2048, 1152, true), {
    W: 1024,
    H: 576,
    outputWidth: 2048,
    outputHeight: 1152,
    fourK: true,
  });
  assert.deepEqual(extensionDimensions(2048, 1152, false), {
    W: 1024,
    H: 576,
    outputWidth: 2048,
    outputHeight: 1152,
    fourK: true,
  });
  assert.deepEqual(extensionDimensions(384, 384, true), {
    W: 384,
    H: 384,
    outputWidth: 384,
    outputHeight: 384,
    fourK: false,
  });
});

test('videoExtensionInfo records the new output and its source-video lineage', () => {
  const baseInfo = {
    engine: 'wan',
    seed: 123,
    fps: 25,
    frames: 250,
    width: 1280,
    height: 704,
    motionPrompt: 'Old prompt',
  };
  const plan = normalizeVideoExtensionPlan({ info: baseInfo, seconds: 5 });
  const info = videoExtensionInfo(baseInfo, plan, {
    parentVideoId: 'video-parent',
    prompt: '  Continue into sunrise  ',
    sourceHasAudio: true,
  });

  assert.deepEqual(baseInfo, {
    engine: 'wan',
    seed: 123,
    fps: 25,
    frames: 250,
    width: 1280,
    height: 704,
    motionPrompt: 'Old prompt',
  });
  assert.equal(info.engine, 'ltx');
  assert.equal(info.workflow, 'extend');
  assert.equal(info.processed, 'extend');
  assert.equal(info.parentVideoId, 'video-parent');
  assert.equal(info.motionPrompt, 'Continue into sunrise');
  assert.equal(info.sourceSeconds, 10);
  assert.equal(info.extensionSeconds, 5.12);
  assert.equal(info.seconds, 5.12);
  assert.equal(info.frames, 378);
  assert.equal(info.fps, 25);
  assert.equal(info.width, 1280);
  assert.equal(info.height, 704);
  assert.equal(info.continuedAudio, true);
  assert.equal(info.preservedAudio, true);
  assert.equal(info.resampledPlayback, undefined);
  assert.equal(info.seed, 123);
});
