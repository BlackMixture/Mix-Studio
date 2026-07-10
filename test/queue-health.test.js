'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  assessQueueHealth,
  formatDurationMs,
  parseNvidiaSmiCsv,
} = require('../lib/queue-health');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('parses nvidia-smi utilization and memory csv', () => {
  assert.deepEqual(parseNvidiaSmiCsv('100, 52824, 97887, 599.94'), {
    utilization: 100,
    memoryUsedMb: 52824,
    memoryTotalMb: 97887,
    powerDrawW: 599.94,
  });
});

test('assesses running jobs as active when GPU is busy', () => {
  const health = assessQueueHealth({
    runningCount: 1,
    pendingCount: 0,
    longestRunningMs: 8 * 60 * 1000,
    gpu: { utilization: 85, memoryUsedMb: 50000, memoryTotalMb: 98000, powerDrawW: 520 },
    now: 1000000,
    lowGpuSince: 900000,
  });
  assert.equal(health.state, 'active');
  assert.equal(health.possiblyStalled, false);
  assert.equal(health.lowGpuSince, null);
});

test('marks an older running job as possibly stalled after sustained low GPU', () => {
  const health = assessQueueHealth({
    runningCount: 1,
    pendingCount: 0,
    longestRunningMs: 12 * 60 * 1000,
    gpu: { utilization: 2, memoryUsedMb: 42000, memoryTotalMb: 98000, powerDrawW: 70 },
    now: 300000,
    lowGpuSince: 180000,
  });
  assert.equal(health.state, 'stalled');
  assert.equal(health.possiblyStalled, true);
});

test('formats generation durations compactly', () => {
  assert.equal(formatDurationMs(4200), '4s');
  assert.equal(formatDurationMs(125000), '2m 5s');
  assert.equal(formatDurationMs(3725000), '1h 2m');
});

test('server queue includes health and job timing fields', () => {
  assert.match(serverJs, /readGpuStats/);
  assert.match(serverJs, /assessQueueHealth/);
  assert.match(serverJs, /durationMs/);
  assert.match(serverJs, /startedAt/);
});

test('queue sheet renders health and durations', () => {
  assert.match(indexHtml, /id="queueHealth"/);
  assert.match(appJs, /renderQueueHealth/);
  assert.match(appJs, /formatDuration/);
  assert.match(appJs, /durationMs/);
});

test('queue sheet supports clearing history, gallery navigation, and drag reordering', () => {
  assert.match(indexHtml, /id="queueClearHistoryBtn"/);
  assert.match(indexHtml, /id="queueReorderHint"/);
  assert.match(serverJs, /\/api\/queue\/history\/clear/);
  assert.match(serverJs, /\/api\/queue\/reorder/);
  assert.match(serverJs, /reorderable/);
  assert.match(appJs, /openFromQueue\(j\.itemId, j\.videoId\)/);
  assert.match(appJs, /function attachQueueDrag\(row, job\)/);
  assert.match(appJs, /queue-drag-ghost/);
  assert.match(appJs, /\/api\/queue\/history\/clear/);
  assert.match(appJs, /\/api\/queue\/reorder/);
});
