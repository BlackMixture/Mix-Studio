'use strict';

const ACTIVE_GPU_UTILIZATION = 15;
const STALL_GPU_UTILIZATION = 5;
const STALL_MIN_JOB_AGE_MS = 5 * 60 * 1000;
const STALL_LOW_GPU_MS = 90 * 1000;

function parseNumber(value) {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseNvidiaSmiCsv(text) {
  const line = String(text || '').trim().split(/\r?\n/).find(Boolean);
  if (!line) return null;
  const parts = line.split(',').map((p) => p.trim());
  if (parts.length < 3) return null;
  const utilization = parseNumber(parts[0]);
  const memoryUsedMb = parseNumber(parts[1]);
  const memoryTotalMb = parseNumber(parts[2]);
  const powerDrawW = parseNumber(parts[3]);
  if (utilization === null || memoryUsedMb === null || memoryTotalMb === null) return null;
  return { utilization, memoryUsedMb, memoryTotalMb, powerDrawW };
}

function assessQueueHealth(opts = {}) {
  const runningCount = Math.max(0, Number(opts.runningCount) || 0);
  const pendingCount = Math.max(0, Number(opts.pendingCount) || 0);
  const longestRunningMs = Math.max(0, Number(opts.longestRunningMs) || 0);
  const now = Number(opts.now) || Date.now();
  const gpu = opts.gpu || null;
  let lowGpuSince = opts.lowGpuSince || null;

  let state = 'idle';
  let message = pendingCount ? `${pendingCount} queued` : 'Queue is idle';
  let possiblyStalled = false;

  if (runningCount > 0) {
    if (!gpu) {
      state = 'unknown';
      message = 'Running, GPU stats unavailable';
      lowGpuSince = null;
    } else if (gpu.utilization >= ACTIVE_GPU_UTILIZATION) {
      state = 'active';
      message = `GPU active at ${Math.round(gpu.utilization)}%`;
      lowGpuSince = null;
    } else if (longestRunningMs >= STALL_MIN_JOB_AGE_MS && gpu.utilization <= STALL_GPU_UTILIZATION) {
      lowGpuSince = lowGpuSince || now;
      possiblyStalled = now - lowGpuSince >= STALL_LOW_GPU_MS;
      state = possiblyStalled ? 'stalled' : 'watching';
      message = possiblyStalled
        ? 'Possibly stalled: low GPU usage for a while'
        : 'Watching: GPU usage is low';
    } else {
      state = 'starting';
      message = 'Running, waiting for GPU activity';
      lowGpuSince = null;
    }
  } else {
    lowGpuSince = null;
  }

  return { state, message, possiblyStalled, lowGpuSince };
}

function formatDurationMs(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms) / 1000) || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

module.exports = {
  ACTIVE_GPU_UTILIZATION,
  STALL_GPU_UTILIZATION,
  STALL_MIN_JOB_AGE_MS,
  STALL_LOW_GPU_MS,
  parseNvidiaSmiCsv,
  assessQueueHealth,
  formatDurationMs,
};
