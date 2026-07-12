(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KreaProgressEta = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MIN_SAMPLE_MS = 250;
  const MAX_REMAINING_MS = 6 * 60 * 60 * 1000;

  function formatEtaRemaining(ms) {
    let seconds = Math.max(1, Math.ceil(Number(ms) / 1000) || 0);
    if (seconds < 90) {
      seconds = Math.max(5, Math.ceil(seconds / 5) * 5);
      return `~${seconds}s left`;
    }
    if (seconds < 10 * 60) {
      seconds = Math.ceil(seconds / 15) * 15;
      const minutes = Math.floor(seconds / 60);
      const remainder = seconds % 60;
      return `~${minutes}m${remainder ? ` ${remainder}s` : ''} left`;
    }
    if (seconds < 60 * 60) return `~${Math.ceil(seconds / 60)}m left`;
    const roundedMinutes = Math.ceil(seconds / 600) * 10;
    const hours = Math.floor(roundedMinutes / 60);
    const minutes = roundedMinutes % 60;
    return `~${hours}h${minutes ? ` ${minutes}m` : ''} left`;
  }

  function createProgressEtaTracker() {
    const jobs = new Map();

    function update({ jobId, value, max, nodeId, now = Date.now() }) {
      const currentValue = Number(value);
      const total = Number(max);
      const timestamp = Number(now);
      if (!jobId || !Number.isFinite(currentValue) || !Number.isFinite(total) || total <= 0
          || currentValue < 0 || !Number.isFinite(timestamp)) return null;
      if (currentValue >= total) return null;

      const key = nodeId == null ? '' : String(nodeId);
      let sample = jobs.get(jobId);
      if (!sample || sample.nodeId !== key || currentValue <= sample.lastValue) {
        sample = {
          nodeId: key,
          lastAt: timestamp,
          lastValue: currentValue,
          rate: null,
          remainingMs: null,
        };
        jobs.set(jobId, sample);
        return null;
      }

      const elapsedMs = timestamp - sample.lastAt;
      const completed = currentValue - sample.lastValue;
      sample.lastAt = timestamp;
      sample.lastValue = currentValue;
      if (elapsedMs < MIN_SAMPLE_MS || completed <= 0) return sample.remainingMs;

      const instantRate = completed / elapsedMs;
      sample.rate = sample.rate == null
        ? instantRate
        : (sample.rate * 0.65) + (instantRate * 0.35);
      const rawRemaining = (total - currentValue) / sample.rate;
      const smoothed = sample.remainingMs == null
        ? rawRemaining
        : (sample.remainingMs * 0.55) + (rawRemaining * 0.45);
      sample.remainingMs = Math.max(1000, Math.min(MAX_REMAINING_MS, smoothed));
      return sample.remainingMs;
    }

    function clear(jobId) {
      jobs.delete(jobId);
    }

    function move(oldId, newId) {
      const sample = jobs.get(oldId);
      if (!sample) return;
      jobs.delete(oldId);
      jobs.set(newId, sample);
    }

    function reset() {
      jobs.clear();
    }

    return { update, clear, move, reset };
  }

  return {
    createProgressEtaTracker,
    formatEtaRemaining,
  };
});
