'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
}

test('intentional queue cancellation uses a neutral terminal event', () => {
  const lifecycle = between(server, 'function cancelJob(', 'function failJob(');
  const route = between(server, "if (route === '/api/queue/cancel'", "if (route === '/api/queue/reset'");

  assert.match(lifecycle, /broadcast\('jobCancelled'/);
  assert.doesNotMatch(lifecycle, /pushHistory\(|broadcast\('jobError'/);
  assert.match(route, /job\.profileId !== req\.profile\.id/);
  assert.match(route, /job\.cancelRequested = true/);
  assert.match(route, /cancelJob\(pid, job\.cancelMessage\)/);
  assert.doesNotMatch(route, /failJob\(/);
});

test('unexpected ComfyUI interruptions remain real errors', () => {
  const ws = between(server, 'function handleWsMessage(', 'function nodeLabel(');

  assert.match(ws, /msg\.type === 'execution_error'[\s\S]*failJob\(/);
  assert.match(ws, /msg\.type === 'execution_interrupted'[\s\S]*job\.cancelRequested[\s\S]*cancelJob\([\s\S]*else failJob\(pid, 'Interrupted'\)/);
});

test('hard reset clears tracked jobs without manufacturing errors', () => {
  const route = between(server, "if (route === '/api/queue/reset'", "if (route === '/api/private/status'");

  assert.match(route, /job\.cancelRequested = true/);
  assert.match(route, /cancelJob\(pid, 'Stopped by hard reset'\)/);
  assert.match(route, /broadcast\('queueReset'/);
  assert.doesNotMatch(route, /failJob\(/);
});

test('cancelled jobs clear browser state without opening the error sheet', () => {
  const cancelled = between(app, "es.addEventListener('jobCancelled'", "es.addEventListener('queueReset'");
  const failed = between(app, "es.addEventListener('jobError'", "es.addEventListener('jobCancelled'");

  assert.match(cancelled, /delete state\.queueProgress\[d\.jobId\]/);
  assert.match(cancelled, /state\.activeJobs\.delete\(d\.jobId\)/);
  assert.match(cancelled, /state\.upscaling\.delete\(d\.itemId\)/);
  assert.match(cancelled, /state\.animating\.delete\(d\.itemId\)/);
  assert.doesNotMatch(cancelled, /showErrorDetail/);
  assert.match(failed, /showErrorDetail\(d\.message/);
  assert.match(failed, /d\.profileId !== state\.profile\.id/);
});

test('queue controls and preprocessing cancellation stay profile-safe and neutral', () => {
  assert.match(app, /x\.hidden = !!j\.finalizing \|\| j\.owned !== true/);
  assert.match(app, /error\.code = data\.code \|\| ''/);
  assert.match(app, /function isJobCancellation\(error\)/);
  assert.match(server, /error\.code = 'job_cancelled'/);
  assert.match(server, /cancelled \? 409 : 500/);
});
