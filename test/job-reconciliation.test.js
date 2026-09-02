'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildJobReconciliation } = require('../public/job-reconciliation');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function local(overrides = {}) {
  return Object.assign({
    activeJobIds: [],
    activeJobSequences: new Map(),
    compositeJobIds: [],
    animatingItemIds: [],
    upscalingItemIds: [],
  }, overrides);
}

test('an authoritative empty queue clears stale generation UI state', () => {
  const plan = buildJobReconciliation({ ok: true, running: [], pending: [], finalizing: [] }, local({
    activeJobIds: ['image-job'],
    compositeJobIds: ['composite-job'],
    animatingItemIds: ['video-item'],
    upscalingItemIds: ['upscale-item'],
  }));
  assert.equal(plan.authoritative, true);
  assert.deepEqual(plan.staleJobIds, ['image-job']);
  assert.deepEqual(plan.staleCompositeJobIds, ['composite-job']);
  assert.deepEqual(plan.staleAnimatingItemIds, ['video-item']);
  assert.deepEqual(plan.staleUpscalingItemIds, ['upscale-item']);
});

test('an unavailable ComfyUI snapshot never clears local jobs', () => {
  const plan = buildJobReconciliation({ ok: false, running: [], pending: [] }, local({
    activeJobIds: ['still-unknown'],
    animatingItemIds: ['video-item'],
  }));
  assert.equal(plan.authoritative, false);
  assert.deepEqual(plan.adoptedJobs, []);
  assert.deepEqual(plan.staleJobIds, []);
  assert.deepEqual(plan.staleAnimatingItemIds, []);
});

test('only jobs absent from running, pending, and finalizing are stale', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [{ jobId: 'running', owned: true }],
    pending: [{ jobId: 'pending', owned: true }],
    finalizing: [{ jobId: 'saving', owned: true }],
  }, local({ activeJobIds: ['running', 'pending', 'saving', 'finished'] }));
  assert.deepEqual(plan.staleJobIds, ['finished']);
});

test('a missed sequential step migrates the old prompt id to its live replacement', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [],
    pending: [{ jobId: 'step-2', owned: true, sequenceId: 'sequence-a' }],
    finalizing: [],
  }, local({
    activeJobIds: ['step-1'],
    activeJobSequences: new Map([['step-1', 'sequence-a']]),
  }));
  assert.deepEqual(plan.migrations, [{ oldJobId: 'step-1', newJobId: 'step-2', sequenceId: 'sequence-a' }]);
  assert.deepEqual(plan.staleJobIds, []);
  assert.deepEqual(plan.adoptedJobs, []);
});

test('owned primary generations are adopted after browser state is lost', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [{ jobId: 'video-job', kind: 'video', owned: true, recoverableGeneration: true }],
    pending: [{ jobId: 'image-job', kind: 'gen', owned: true, recoverableGeneration: true, sequenceId: 'sequence-b' }],
    finalizing: [{ jobId: 'saving-job', kind: 'video', owned: true, recoverableGeneration: true, finalizing: true }],
  }, local());
  assert.deepEqual(plan.adoptedJobs, [
    { jobId: 'video-job', sequenceId: '', kind: 'video', phase: 'running' },
    { jobId: 'image-job', sequenceId: 'sequence-b', kind: 'gen', phase: 'pending' },
    { jobId: 'saving-job', sequenceId: '', kind: 'video', phase: 'finalizing' },
  ]);
});

test('utility, Smart, and other-profile queue rows never take over the generation card', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [
      { jobId: 'upscale', kind: 'upscale', owned: true, recoverableGeneration: false },
      { jobId: 'smart-step', kind: 'video', owned: true, recoverableGeneration: false },
      { jobId: 'other-profile', kind: 'video', owned: false, recoverableGeneration: true },
    ],
    pending: [],
    finalizing: [],
  }, local());
  assert.deepEqual(plan.adoptedJobs, []);
});

test('queue snapshots expose and apply the recoverable-generation contract', () => {
  assert.match(server, /function recoverableGenerationJob\(job\)/);
  assert.match(server, /recoverableGeneration: owned && recoverableGenerationJob\(job\)/);
  assert.match(app, /for \(const adoption of plan\.adoptedJobs \|\| \[\]\)/);
  assert.match(app, /setGenerating\(true, status\)/);
});

test('other-profile rows are never adopted as sequential replacements', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [{ jobId: 'not-mine', owned: false, sequenceId: 'sequence-a' }],
    pending: [],
  }, local({
    activeJobIds: ['step-1'],
    activeJobSequences: { 'step-1': 'sequence-a' },
  }));
  assert.deepEqual(plan.migrations, []);
  assert.deepEqual(plan.staleJobIds, ['step-1']);
});

test('external jobs preserve gallery overlays when ownership is unknown', () => {
  const plan = buildJobReconciliation({
    ok: true,
    running: [{ jobId: 'external', kind: 'external', owned: false }],
    pending: [],
  }, local({ animatingItemIds: ['video-item'], upscalingItemIds: ['upscale-item'] }));
  assert.deepEqual(plan.staleAnimatingItemIds, []);
  assert.deepEqual(plan.staleUpscalingItemIds, []);
});
