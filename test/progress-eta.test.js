'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createProgressEtaTracker,
  formatEtaRemaining,
} = require('../public/progress-eta');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('progress ETA learns a stable rate after two sampler updates', () => {
  const tracker = createProgressEtaTracker();
  assert.equal(tracker.update({ jobId: 'one', nodeId: 'sampler', value: 1, max: 10, now: 1000 }), null);
  const remaining = tracker.update({ jobId: 'one', nodeId: 'sampler', value: 2, max: 10, now: 3000 });
  assert.equal(remaining, 16000);
  assert.equal(formatEtaRemaining(remaining), '~20s left');
});

test('progress ETA resets when a new sampler stage starts or progress rewinds', () => {
  const tracker = createProgressEtaTracker();
  tracker.update({ jobId: 'one', nodeId: 'base', value: 1, max: 10, now: 1000 });
  assert.ok(tracker.update({ jobId: 'one', nodeId: 'base', value: 2, max: 10, now: 3000 }));
  assert.equal(tracker.update({ jobId: 'one', nodeId: 'refine', value: 1, max: 6, now: 4000 }), null);
  assert.equal(tracker.update({ jobId: 'one', nodeId: 'refine', value: 1, max: 6, now: 5000 }), null);
});

test('ETA formatting stays compact for longer generations', () => {
  assert.equal(formatEtaRemaining(125000), '~2m 15s left');
  assert.equal(formatEtaRemaining(25 * 60 * 1000), '~25m left');
  assert.equal(formatEtaRemaining(80 * 60 * 1000), '~1h 20m left');
  assert.equal(formatEtaRemaining(119 * 60 * 1000), '~2h left');
});

test('progress events expose sampler identity and render ETA beside percent', () => {
  assert.match(indexHtml, /progress-eta\.js[\s\S]*app\.js/);
  assert.match(serverJs, /nodeId: d\.node \?\? null/);
  assert.match(appJs, /progressEta\.update/);
  assert.match(appJs, /Estimated completion/);
  assert.match(appJs, /progressEta\.clear\(d\.jobId\)/);
  assert.match(serverJs, /progressDetailsForJob/);
  assert.match(appJs, /Stage \$\{d\.phaseIndex\} of \$\{d\.phaseCount\}/);
  assert.match(appJs, /d\.overallPercent/);
  assert.match(appJs, /% overall/);
  assert.match(appJs, /d\.isSampling === false/);
});
