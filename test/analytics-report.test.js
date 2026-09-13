'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeAnalytics } = require('../lib/analytics-report');
const row = (uuid, event, id, day, model = 'LTX 2.5') => ({ uuid, event, timestamp: `${day}T12:00:00Z`, distinct_id: id, properties: { model_name: model, prompt: 'private-content' } });

test('aggregate report counts page identities, accepted requests, UTC dates and duplicate event IDs separately', () => {
  const start = row('a', 'App_Launched', 'one', '2026-09-11');
  const report = summarizeAnalytics([start, start, row('b', 'Generation_Started', 'one', '2026-09-11'), row('c', 'App_Launched', 'two', '2026-09-12'), row('d', 'Generation_Started', 'two', '2026-09-12')], { from: '2026-09-11', to: '2026-09-13' });
  assert.deepEqual(report.totals, { appLaunches: 2, acceptedGenerationRequests: 2, observedPageIdentities: 2, activeBrowsers: 0, visits: 0, engagedBrowsers: 0, engagedVisits: 0, returningBrowsersWithinWindow: 0, repeatVisitsWithinWindow: 0 });
  assert.equal(report.quality.duplicateEventsSkipped, 1);
  assert.equal(report.daily.length, 2);
  assert.equal(report.models[0].model, 'LTX 2.5');
  assert.doesNotMatch(JSON.stringify(report), /private-content|distinct_id|"one"|"two"/);
  assert.match(report.identityScope, /not people/);
});

test('report uses an exclusive end boundary and flags incomplete or historical data without exposing it', () => {
  const unknown = row('a', 'Generation_Started', '', '2026-09-11', 'private-model'); unknown.properties = JSON.stringify(unknown.properties);
  const report = summarizeAnalytics([unknown, row('b', 'App_Launched', 'one', '2026-09-12'), { event: 'App_Launched', timestamp: 'bad' }, row('c', 'Unapproved_Event', 'two', '2026-09-11')], { to: '2026-09-12' });
  assert.equal(report.totals.acceptedGenerationRequests, 1);
  assert.equal(report.totals.appLaunches, 0);
  assert.equal(report.quality.missingIdentityEvents, 1);
  assert.equal(report.quality.invalidTimestampsSkipped, 1);
  assert.equal(report.quality.unknownModelEvents, 1);
  assert.equal(report.models[0].model, 'Unknown / legacy');
  assert.doesNotMatch(JSON.stringify(report), /private-model|private-content/);
  assert.throws(() => summarizeAnalytics([], { from: 'bad' }), /ISO/);
  assert.throws(() => summarizeAnalytics([], { from: '2026-09-12', to: '2026-09-11' }), /earlier/);
});

test('v2 separates browsers, repeat visits, engagement and legacy identities', () => {
  const measured = (id, event, browser, visit) => ({
    ...row(id, event, browser, '2026-09-12'),
    properties: {measurement_version: 2, identity_scope: 'browser', visit_id: visit, model_name: 'LTX 2.5'}
  });
  const report = summarizeAnalytics([
    measured('1','App_Launched','browser-a','visit-1'),
    measured('2','App_Launched','browser-a','visit-2'),
    measured('3','App_Launched','browser-b','visit-3'),
    measured('4','Generation_Started','browser-a','visit-2'),
    measured('5','Generation_Started','browser-a','visit-2'),
    row('legacy','App_Launched','old-page','2026-09-12'),
  ]);
  assert.equal(report.totals.activeBrowsers, 2);
  assert.equal(report.totals.visits, 3);
  assert.equal(report.totals.returningBrowsersWithinWindow, 1);
  assert.equal(report.totals.repeatVisitsWithinWindow, 1);
  assert.equal(report.totals.engagedBrowsers, 1);
  assert.equal(report.totals.engagedVisits, 1);
  assert.equal(report.totals.acceptedGenerationRequests, 2);
  assert.equal(report.totals.observedPageIdentities, 1);
  assert.equal(report.daily[0].activeBrowsers, 2);
});
