'use strict';

const SCAIL_FPS = 16;
const SCAIL_MAX_SECONDS = 60;
const SCAIL_CHUNK_FRAMES = 81;
const SCAIL_OVERLAP_FRAMES = 5;
const SCAIL_ADVANCE_FRAMES = SCAIL_CHUNK_FRAMES - SCAIL_OVERLAP_FRAMES;

function scailMode(value) {
  return value === 'direct' ? 'direct' : 'chunked';
}

function scailDurationSeconds(requestedSeconds, driveDurSeconds) {
  let seconds = Number(requestedSeconds);
  if (!Number.isFinite(seconds)) seconds = 5;
  seconds = Math.max(1, seconds);
  const driveDur = Number(driveDurSeconds);
  if (Number.isFinite(driveDur) && driveDur > 0) seconds = Math.min(seconds, driveDur);
  return Math.max(1, Math.min(SCAIL_MAX_SECONDS, seconds));
}

function scailFramesForSeconds(seconds) {
  const raw = Math.floor(Math.max(1, Number(seconds) || 1) * SCAIL_FPS) + 1;
  return Math.max(1, Math.round((raw - 1) / 4) * 4 + 1);
}

function scailSegments(totalFrames) {
  const target = Math.max(1, Math.round(Number(totalFrames) || 1));
  const segments = [];
  let produced = 0;
  while (produced < target) {
    const index = segments.length;
    const startFrame = index === 0 ? 0 : Math.max(0, produced - SCAIL_OVERLAP_FRAMES);
    const remainingFromStart = target - startFrame;
    const length = Math.min(SCAIL_CHUNK_FRAMES, remainingFromStart);
    const keepStart = index === 0 ? 0 : Math.min(SCAIL_OVERLAP_FRAMES, length - 1);
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
  SCAIL_FPS,
  SCAIL_MAX_SECONDS,
  SCAIL_CHUNK_FRAMES,
  SCAIL_OVERLAP_FRAMES,
  SCAIL_ADVANCE_FRAMES,
  scailMode,
  scailDurationSeconds,
  scailFramesForSeconds,
  scailSegments,
  scailSamTrackArgs,
  scailMaskArgs,
  videoProcessInfo,
};
