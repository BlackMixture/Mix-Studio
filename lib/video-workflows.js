'use strict';

const LTX_MAX_SECONDS = 20;
const LTX_CAMERA_FPS = 24;
const LTX_CAMERA_MAX_SECONDS = 5;
const SCAIL_FPS = 16;
const SCAIL_FPS_CHOICES = [16, 24];
const SCAIL_MAX_SECONDS = 60;
const SCAIL_CHUNK_FRAMES = 81;
const SCAIL_OVERLAP_FRAMES = 5;
const SCAIL_STABLE_OVERLAP_FRAMES = 13;
const SCAIL_ADVANCE_FRAMES = SCAIL_CHUNK_FRAMES - SCAIL_OVERLAP_FRAMES;
const SCAIL_CHUNK_FRAME_CHOICES = [41, 61, 81];
const SCAIL_OVERLAP_FRAME_CHOICES = [5, 9, 13, 17];

function ltxDurationSeconds(requestedSeconds, maxSeconds = LTX_MAX_SECONDS) {
  const maximum = Math.max(1, Number(maxSeconds) || LTX_MAX_SECONDS);
  const requested = Number(requestedSeconds);
  return Math.max(1, Math.min(maximum, Number.isFinite(requested) ? requested : 5));
}

function ltxFramesForSeconds(seconds, fps = 25, maxSeconds = LTX_MAX_SECONDS) {
  const safeFps = Math.max(1, Math.round(Number(fps) || 25));
  const raw = Math.round(ltxDurationSeconds(seconds, maxSeconds) * safeFps);
  return Math.max(25, Math.round((raw - 1) / 8) * 8 + 1);
}

function ltxCameraDurationSeconds(requestedSeconds, sourceDurationSeconds = 0, startSeconds = 0) {
  let seconds = ltxDurationSeconds(requestedSeconds, LTX_CAMERA_MAX_SECONDS);
  const sourceDuration = Number(sourceDurationSeconds);
  const start = Math.max(0, Number(startSeconds) || 0);
  if (Number.isFinite(sourceDuration) && sourceDuration > 0) {
    const available = Math.max(0, sourceDuration - start);
    if (available > 0) seconds = Math.min(seconds, available);
  }
  return Math.max(1, Math.min(LTX_CAMERA_MAX_SECONDS, seconds));
}

function scailMode(value) {
  if (value === 'direct' || value === 'chunked' || value === 'infinity') return value;
  return 'infinity';
}

function choice(value, allowed, fallback) {
  const n = Math.round(Number(value));
  return allowed.includes(n) ? n : fallback;
}

function normalizeScailChunkOptions(opts = {}) {
  const mode = scailMode(opts.mode);
  return {
    stableTracking: mode === 'chunked' && opts.stableTracking !== false,
    chunkFrames: choice(opts.chunkFrames, SCAIL_CHUNK_FRAME_CHOICES, SCAIL_CHUNK_FRAMES),
    overlapFrames: choice(opts.overlapFrames, SCAIL_OVERLAP_FRAME_CHOICES, SCAIL_STABLE_OVERLAP_FRAMES),
  };
}

function scailDurationSeconds(requestedSeconds, driveDurSeconds) {
  let seconds = Number(requestedSeconds);
  if (!Number.isFinite(seconds)) seconds = 5;
  seconds = Math.max(1, seconds);
  const driveDur = Number(driveDurSeconds);
  if (Number.isFinite(driveDur) && driveDur > 0) seconds = Math.min(seconds, driveDur);
  return Math.max(1, Math.min(SCAIL_MAX_SECONDS, seconds));
}

function normalizeScailFps(value) {
  const fps = Math.round(Number(value));
  return SCAIL_FPS_CHOICES.includes(fps) ? fps : SCAIL_FPS;
}

function scailFramesForSeconds(seconds, fps = SCAIL_FPS) {
  const raw = Math.floor(Math.max(1, Number(seconds) || 1) * normalizeScailFps(fps)) + 1;
  return Math.max(1, Math.round((raw - 1) / 4) * 4 + 1);
}

function scailSegments(totalFrames, opts = {}) {
  const target = Math.max(1, Math.round(Number(totalFrames) || 1));
  const chunkFrames = choice(opts.chunkFrames, SCAIL_CHUNK_FRAME_CHOICES, SCAIL_CHUNK_FRAMES);
  const overlapFrames = Math.min(
    choice(opts.overlapFrames, SCAIL_OVERLAP_FRAME_CHOICES, SCAIL_OVERLAP_FRAMES),
    chunkFrames - 1
  );
  const segments = [];
  let produced = 0;
  while (produced < target) {
    const index = segments.length;
    const startFrame = index === 0 ? 0 : Math.max(0, produced - overlapFrames);
    const remainingFromStart = target - startFrame;
    const length = Math.min(chunkFrames, remainingFromStart);
    const keepStart = index === 0 ? 0 : Math.min(overlapFrames, length - 1);
    const keepLength = Math.max(1, length - keepStart);
    segments.push({ index, startFrame, length, keepStart, keepLength });
    produced += keepLength;
    if (index > 200) throw new Error('SCAIL segment planning exceeded safety limit');
  }
  return segments;
}

function scailSamTrackArgs() {
  return [0.5, 4, 1];
}

function scailMaskArgs() {
  return ['', 'left_to_right', false];
}

function scailInfinitySamTrackArgs() {
  return [0.5, 0, 1];
}

function scailInfinityMaskArgs() {
  return ['', 'area', false];
}

function videoProcessInfo(baseInfo = {}, opts = {}) {
  const info = Object.assign({}, baseInfo, {
    processed: opts.kind,
    parentVideoId: opts.parentVideoId,
  });
  if (opts.kind === 'interpolate') {
    const multiplier = Math.max(2, Math.round(Number(opts.multiplier) || 2));
    info.frames = Math.round((Number(baseInfo.frames) || 0) * multiplier) || baseInfo.frames;
    info.fps = Math.round((Number(baseInfo.fps) || 16) * multiplier);
    info.smooth = multiplier;
  } else if (opts.kind === 'upscale') {
    const scale = Math.max(1, Number(opts.scale) || 2);
    if (baseInfo.width) info.width = Math.round(Number(baseInfo.width) * scale);
    if (baseInfo.height) info.height = Math.round(Number(baseInfo.height) * scale);
    info.fourK = true;
  }
  return info;
}

module.exports = {
  LTX_MAX_SECONDS,
  LTX_CAMERA_FPS,
  LTX_CAMERA_MAX_SECONDS,
  ltxDurationSeconds,
  ltxFramesForSeconds,
  ltxCameraDurationSeconds,
  SCAIL_FPS,
  SCAIL_FPS_CHOICES,
  SCAIL_MAX_SECONDS,
  SCAIL_CHUNK_FRAMES,
  SCAIL_OVERLAP_FRAMES,
  SCAIL_STABLE_OVERLAP_FRAMES,
  SCAIL_ADVANCE_FRAMES,
  SCAIL_CHUNK_FRAME_CHOICES,
  SCAIL_OVERLAP_FRAME_CHOICES,
  scailMode,
  normalizeScailChunkOptions,
  scailDurationSeconds,
  normalizeScailFps,
  scailFramesForSeconds,
  scailSegments,
  scailSamTrackArgs,
  scailMaskArgs,
  scailInfinitySamTrackArgs,
  scailInfinityMaskArgs,
  videoProcessInfo,
};
