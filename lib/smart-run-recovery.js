'use strict';

const RECOVERABLE_RUN_STATUSES = new Set(['ready', 'running', 'queueing', 'attention']);
const INTERRUPTED_STEP_STATUSES = new Set(['running', 'queueing', 'attention']);

function smartRunHasWork(run) {
  return Array.isArray(run?.steps)
    && run.steps.some((step) => ['pending', 'running', 'queueing', 'attention'].includes(step?.status));
}

function markSmartRunsInterruptedForRecovery(runs, now = Date.now()) {
  const ids = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || !RECOVERABLE_RUN_STATUSES.has(run.status) || !smartRunHasWork(run)) continue;
    run.status = 'attention';
    run.error = 'Mix Studio restarted while this production was active. Reconnecting to ComfyUI and resuming automatically…';
    run.updatedAt = now;
    for (const step of run.steps) {
      if (INTERRUPTED_STEP_STATUSES.has(step?.status)) step.status = 'attention';
    }
    ids.push(run.id);
  }
  return ids;
}

function interruptedSmartJobIds(run) {
  return [...new Set((Array.isArray(run?.steps) ? run.steps : [])
    .filter((step) => INTERRUPTED_STEP_STATUSES.has(step?.status) && step.jobId)
    .map((step) => String(step.jobId))
    .filter(Boolean))];
}

function prepareSmartRunResume(run) {
  if (!run || run.status !== 'attention') return false;
  for (const step of Array.isArray(run.steps) ? run.steps : []) {
    if (!INTERRUPTED_STEP_STATUSES.has(step?.status)) continue;
    step.status = 'pending';
    step.jobId = null;
    step.progress = null;
    step.error = '';
  }
  run.status = 'running';
  run.error = '';
  return true;
}

module.exports = {
  interruptedSmartJobIds,
  markSmartRunsInterruptedForRecovery,
  prepareSmartRunResume,
  smartRunHasWork,
};
