'use strict';

const { ltxDurationSeconds, ltxFramesForSeconds } = require('./video-workflows');

const VIDEO_EXTENSION_MAX_SECONDS = 20;
const VIDEO_EXTENSION_MAX_SOURCE_SECONDS = 20;
const VIDEO_EXTENSION_MAX_4K_SOURCE_SECONDS = 10;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function nearestMultiple(value, multiple, minimum = multiple) {
  return Math.max(minimum, Math.round(value / multiple) * multiple);
}

/**
 * Pick an LTX sampling rate and optional RIFE multiplier that reproduces the
 * source playback rate. App-generated videos normally resolve to 16, 24, or
 * 25 fps, optionally interpolated 2x/3x. Unusual high-rate sources are
 * normalized to 25 fps instead of asking LTX to sample at an unsafe rate.
 */
function extensionPlaybackPlan(sourceFps) {
  const requested = clamp(finiteNumber(sourceFps, 25), 1, 120);
  if (requested <= 30) {
    const baseFps = Math.max(1, Math.round(requested));
    return { baseFps, smooth: 1, outputFps: baseFps, resampled: Math.abs(baseFps - requested) > 0.01 };
  }
  for (const smooth of [3, 2]) {
    const candidate = requested / smooth;
    const rounded = Math.round(candidate);
    if (rounded >= 16 && rounded <= 30 && Math.abs(candidate - rounded) < 0.01) {
      return { baseFps: rounded, smooth, outputFps: rounded * smooth, resampled: false };
    }
  }
  return { baseFps: 25, smooth: 1, outputFps: 25, resampled: true };
}

function extensionDimensions(width, height, fourK) {
  const sourceWidth = clamp(Math.round(finiteNumber(width, 1280)), 64, 8192);
  const sourceHeight = clamp(Math.round(finiteNumber(height, 720)), 64, 8192);
  const upscale = fourK === true && sourceWidth >= 512 && sourceHeight >= 512;
  const scale = upscale ? 2 : 1;
  const W = nearestMultiple(sourceWidth / scale, 64, 256);
  const H = nearestMultiple(sourceHeight / scale, 64, 256);
  return { W, H, outputWidth: W * scale, outputHeight: H * scale, fourK: upscale };
}

function normalizeVideoExtensionPlan(input = {}) {
  const info = input.info && typeof input.info === 'object' ? input.info : {};
  const playback = extensionPlaybackPlan(info.fps);
  const requestedSourceSeconds = finiteNumber(
    input.sourceSeconds,
    finiteNumber(info.frames, 0) > 0 ? finiteNumber(info.frames, 0) / finiteNumber(info.fps, playback.outputFps) : 5,
  );
  const sourceSeconds = clamp(requestedSourceSeconds, 0.25, VIDEO_EXTENSION_MAX_SOURCE_SECONDS);
  if (requestedSourceSeconds > VIDEO_EXTENSION_MAX_SOURCE_SECONDS + 0.001) {
    throw new Error(`Video extension currently supports source clips up to ${VIDEO_EXTENSION_MAX_SOURCE_SECONDS} seconds`);
  }
  const requestedSeconds = ltxDurationSeconds(input.seconds, VIDEO_EXTENSION_MAX_SECONDS);
  const continuationFrames = ltxFramesForSeconds(requestedSeconds, playback.baseFps, VIDEO_EXTENSION_MAX_SECONDS);
  const appendedBaseFrames = Math.max(1, continuationFrames - 1);
  const appendedFrames = appendedBaseFrames * playback.smooth;
  const normalizedSeconds = appendedBaseFrames / playback.baseFps;
  const sourceFrames = Math.max(1, Math.round(sourceSeconds * playback.outputFps));
  const dimensions = extensionDimensions(
    input.width || info.width,
    input.height || info.height,
    info.fourK === true,
  );
  return Object.assign({}, playback, dimensions, {
    requestedSeconds,
    normalizedSeconds,
    sourceSeconds,
    sourceFrames,
    continuationFrames,
    appendedFrames,
    totalFrames: sourceFrames + appendedFrames,
    continueAudio: input.continueAudio !== false,
  });
}

function normalizeDirectorExtensionPlan(input = {}) {
  const info = input.info && typeof input.info === 'object' ? input.info : {};
  const sourceFps = finiteNumber(info.fps, 0);
  const recordedSourceFrames = finiteNumber(info.frames, 0);
  if (!(sourceFps > 0) || !(recordedSourceFrames > 0)) {
    throw new Error('This video predates reliable playback metadata and cannot be extended');
  }
  const legacySmooth = [2, 3].includes(Number(info.smooth)) ? Number(info.smooth) : 1;
  const sourceFrameCount = info.exactFrameCount === true
    ? recordedSourceFrames
    : Math.max(1, recordedSourceFrames - (legacySmooth - 1));
  const sourceSeconds = sourceFrameCount / sourceFps;
  const smooth = [1, 2, 3].includes(Number(input.smooth)) ? Number(input.smooth) : 1;
  const baseFps = 24;
  const outputFps = baseFps * smooth;
  const rawRangeFrames = Math.round(finiteNumber(input.rangeFrames, 120));
  if (rawRangeFrames < baseFps) throw new Error('A video extension must add at least 1 second');
  const requestedFrames = clamp(rawRangeFrames, baseFps, baseFps * VIDEO_EXTENSION_MAX_SECONDS);
  const continuationFrames = Math.ceil((requestedFrames - 1) / 8) * 8 + 1;
  const appendedFrames = Math.max(1, continuationFrames - 1) * smooth;
  const normalizedSeconds = (continuationFrames - 1) / baseFps;
  const sourceFrames = Math.max(1, Math.round(sourceSeconds * outputFps));
  const dimensions = extensionDimensions(input.width || info.width, input.height || info.height, info.fourK === true);
  const sourceLimit = dimensions.fourK ? VIDEO_EXTENSION_MAX_4K_SOURCE_SECONDS : VIDEO_EXTENSION_MAX_SOURCE_SECONDS;
  if (sourceSeconds > sourceLimit + 0.001) {
    throw new Error(`Video extension currently supports source clips up to ${sourceLimit} seconds${dimensions.fourK ? ' at 4K' : ''}`);
  }
  return Object.assign({}, dimensions, {
    baseFps,
    smooth,
    outputFps,
    resampled: Math.abs(sourceFps - outputFps) > 0.01,
    requestedSeconds: requestedFrames / baseFps,
    normalizedSeconds,
    sourceSeconds,
    sourceFrames,
    continuationFrames,
    appendedFrames,
    totalFrames: sourceFrames + appendedFrames,
    continueAudio: input.continueAudio !== false,
  });
}

function videoExtensionInfo(baseInfo = {}, plan, options = {}) {
  return Object.assign({}, baseInfo, {
    engine: 'ltx',
    workflow: 'extend',
    processed: 'extend',
    parentVideoId: options.parentVideoId,
    motionPrompt: String(options.prompt || baseInfo.motionPrompt || '').trim(),
    seconds: plan.normalizedSeconds,
    extensionSeconds: plan.normalizedSeconds,
    sourceSeconds: plan.sourceSeconds,
    frames: plan.totalFrames,
    fps: plan.outputFps,
    smooth: plan.smooth > 1 ? plan.smooth : undefined,
    fourK: plan.fourK || undefined,
    width: plan.outputWidth,
    height: plan.outputHeight,
    continuedAudio: plan.continueAudio || undefined,
    preservedAudio: options.sourceHasAudio || undefined,
    resampledPlayback: plan.resampled || undefined,
    exactFrameCount: true,
  });
}

module.exports = {
  VIDEO_EXTENSION_MAX_SECONDS,
  VIDEO_EXTENSION_MAX_SOURCE_SECONDS,
  VIDEO_EXTENSION_MAX_4K_SOURCE_SECONDS,
  extensionPlaybackPlan,
  extensionDimensions,
  normalizeVideoExtensionPlan,
  normalizeDirectorExtensionPlan,
  videoExtensionInfo,
};
