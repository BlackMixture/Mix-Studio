'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  beforeSend,
  createAnalytics,
  generationModel,
  postHogConfig,
  safeEvent,
} = require('../public/analytics');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const analyticsSource = fs.readFileSync(path.join(root, 'public', 'analytics.js'), 'utf8');

test('PostHog configuration is memory-only and disables automatic collection', () => {
  const config = postHogConfig('https://eu.i.posthog.com');
  assert.equal(config.persistence, 'memory');
  assert.equal(config.autocapture, false);
  assert.equal(config.capture_pageview, false);
  assert.equal(config.capture_pageleave, false);
  assert.equal(config.capture_dead_clicks, false);
  assert.equal(config.disable_session_recording, true);
  assert.equal(config.advanced_disable_flags, true);
  assert.equal(config.person_profiles, 'never');
});

test('only the two approved anonymous events can be queued', () => {
  assert.deepEqual(safeEvent('App_Launched', { prompt: 'secret' }), { event: 'App_Launched', properties: {} });
  assert.deepEqual(safeEvent('Generation_Started', { model_name: 'LTX 2.3', prompt: 'secret' }), {
    event: 'Generation_Started',
    properties: { model_name: 'LTX 2.3' },
  });
  assert.equal(safeEvent('$pageview', {}), null);
  assert.equal(safeEvent('Generation_Started', { prompt: 'missing model' }), null);
});

test('beforeSend strips SDK URL, device, browser, and user properties', () => {
  const event = beforeSend({
    event: 'Generation_Started',
    properties: {
      token: 'phc_key',
      distinct_id: 'ephemeral-id',
      model_name: 'Flux Klein 9B',
      '$current_url': 'http://192.168.1.5:3300/',
      '$browser': 'Chrome',
      '$device_id': 'device-id',
      email: 'person@example.com',
    },
  });
  assert.deepEqual(event.properties, {
    token: 'phc_key',
    distinct_id: 'ephemeral-id',
    '$process_person_profile': false,
    '$geoip_disable': true,
    model_name: 'Flux Klein 9B',
  });
});

test('generation requests map to stable public model labels without inspecting prompts', () => {
  assert.equal(generationModel('/api/generate', { mode: 't2i', krea2Turbo: false, prompt: 'private' }), 'Krea 2 Raw');
  assert.equal(generationModel('/api/generate', { mode: 'edit', editEngine: 'qwen' }), 'Qwen Edit');
  assert.equal(generationModel('/api/animate', { engine: 'scail' }), 'SCAIL 2');
  assert.equal(generationModel('/api/upscale', { engine: 'ultimate' }), 'Ultimate SD');
  assert.equal(generationModel('/api/director/generate', {}), 'LTX 2.3 Director');
  assert.equal(generationModel('/api/prompt/revise', { engine: 'qwen' }), '');
});

test('an existing opt-out never schedules or initializes the PostHog SDK', async () => {
  const values = new Map([['ks-anonymous-analytics-opt-out', '1']]);
  let idleCalls = 0;
  const analytics = createAnalytics({
    document: { getElementById: () => null },
    localStorage: {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ enabled: true, key: 'phc_key', host: 'https://us.i.posthog.com' }),
    }),
    requestIdleCallback: () => { idleCalls += 1; return 1; },
  });
  assert.equal(await analytics.init(), false);
  assert.equal(idleCalls, 0);
});

test('the first-run analytics notice uses a clear primary action and a quiet opt-out', () => {
  assert.match(analyticsSource, /Usage analytics are on/);
  assert.match(analyticsSource, /No prompts, media, screen recording, or generation content/);
  assert.match(analyticsSource, /Change this anytime in Preferences/);
  assert.match(analyticsSource, /setAttribute\('role', 'region'\)/);
  assert.match(analyticsSource, /setAttribute\('aria-live', 'polite'\)/);
  assert.match(analyticsSource, /setAttribute\('aria-labelledby', 'telemetryNoticeTitle'\)/);
  assert.match(analyticsSource, /setAttribute\('aria-describedby', 'telemetryNoticeCopy'\)/);

  const markup = analyticsSource.match(/notice\.innerHTML\s*=\s*(['"])(.*?)\1;/s)?.[2] || '';
  const thanks = markup.match(/<button[^>]*class="telemetry-toast-thanks"[^>]*>Thanks, continue<\/button>/)?.[0] || '';
  const disable = markup.match(/<button[^>]*class="telemetry-toast-disable"[^>]*>Disable<\/button>/)?.[0] || '';
  assert.match(thanks, /type="button"/);
  assert.match(disable, /type="button"/);
  assert.doesNotMatch(markup, /type="checkbox"/);
  assert.ok(
    markup.indexOf('telemetry-toast-thanks') < markup.indexOf('telemetry-toast-disable'),
    'the prominent continue action should precede the secondary opt-out',
  );
  assert.match(analyticsSource, /telemetry-toast-disable['"]\)\.addEventListener\('click',[\s\S]{0,180}requestSetEnabled\(false\)/);
  assert.match(analyticsSource, /Disable anonymous analytics\?/);
  assert.match(analyticsSource, /typeof win\.askConfirm === 'function'[\s\S]{0,260}confirmLabel: 'Disable'[\s\S]{0,120}cancelLabel: 'Keep enabled'/,
    'the secondary opt-out should use the app-styled confirmation when it is available');
});

test('the analytics notice is black and its visual hierarchy does not rely on fixed pixel sizes', () => {
  const noticeRule = css.match(/\.telemetry-toast\s*\{([^}]*)\}/)?.[1] || '';
  const actionsRule = css.match(/\.telemetry-toast-actions\s*\{([^}]*)\}/)?.[1] || '';
  const thanksRule = css.match(/\.telemetry-toast-thanks\s*\{([^}]*)\}/)?.[1] || '';
  const disableRule = css.match(/\.telemetry-toast-disable\s*\{([^}]*)\}/)?.[1] || '';

  const background = noticeRule.match(/background(?:-color)?:\s*([^;]+)/i)?.[1] || '';
  assert.match(background, /(?:#(?:[01][0-9a-f]){3}\b|#[01]{3}\b|rgba?\(\s*(?:[0-2]?\d|3[01])\s*,\s*(?:[0-2]?\d|3[01])\s*,\s*(?:[0-2]?\d|3[01])\b)/i);
  const primaryGetsFlexibleSpace = /(?:flex:\s*(?:1|[1-9]\d*)\b|width:\s*100%|grid-column:)/.test(thanksRule)
    || /grid-template-columns:[^;]*(?:minmax\(\s*0\s*,\s*1fr\s*\)|1fr)[^;]*auto/.test(actionsRule)
    || (/display:\s*grid/.test(actionsRule) && /justify-self:\s*(?:start|center|end)/.test(disableRule));
  assert.ok(primaryGetsFlexibleSpace, 'the continue action should receive the flexible share of the action row');
  assert.match(disableRule, /background:\s*(?:transparent|none|rgba?\([^;]*,\s*0\s*\))/i);
  assert.match(disableRule, /border:\s*(?:0|none)\b/i);
});

test('anonymous analytics remain controllable from the persistent Preferences switch', () => {
  assert.match(html, /id="analyticsToggle"[^>]*role="switch"[^>]*aria-labelledby="analyticsToggleLabel"[^>]*aria-describedby="analyticsToggleStatus"[^>]*hidden/);
  assert.match(html, /id="analyticsToggle"[^>]*aria-labelledby="analyticsToggleLabel"[^>]*aria-describedby="analyticsToggleStatus"/);
  assert.match(html, /<script src="\/analytics\.js"><\/script>/);
  assert.match(analyticsSource, /toggle\.hidden\s*=\s*!config/);
  assert.match(analyticsSource, /toggle\.setAttribute\('aria-checked', String\(enabled\)\)/);
  assert.match(analyticsSource, /toggle\.addEventListener\('click', \(\) => requestSetEnabled\(optedOut\(\)\)\)/);
  assert.match(analyticsSource, /storage\.setItem\(OPT_OUT_KEY, '1'\)/);
  assert.match(analyticsSource, /storage\.removeItem\(OPT_OUT_KEY\)/);
});

test('the analytics switch is the compact final control in General settings', () => {
  const generalStart = html.indexOf('id="settingsPaneGeneral"');
  const generalEnd = html.indexOf('id="settingsPaneImage"', generalStart);
  const general = html.slice(generalStart, generalEnd);
  const experimental = general.indexOf('id="experimentalFeaturesToggle"');
  const analytics = general.indexOf('id="analyticsToggle"');

  assert.ok(experimental >= 0 && analytics > experimental, 'analytics should follow the experience controls at the end of General settings');
  assert.equal(general.lastIndexOf('<button'), general.lastIndexOf('<button', analytics),
    'analytics should be the final interactive control in General settings');

  const compactRule = css.match(/(?:#settingsPaneGeneral\s+|\.settings-pane\s+(?:>\s*)?)?\.analytics-toggle\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(compactRule, /min-height:/, 'analytics should have its own compact height instead of inheriting the large generic row');
  assert.match(compactRule, /padding:/, 'analytics should have its own compact spacing');
  assert.match(css, /\.analytics-toggle\s+\.settings-media-toggle-copy\s+(?:strong|small)\s*\{/,
    'analytics copy sizing should be scoped without shrinking every Settings toggle');
});

test('LTX 2.5 is counted distinctly and unknown or prototype engine names are not mislabeled', () => {
  assert.equal(generationModel('/api/animate', { engine: 'ltx25' }), 'LTX 2.5');
  for (const engine of ['future-model', '__proto__', 'constructor', 'toString']) {
    assert.equal(generationModel('/api/animate', { engine }), '');
    assert.equal(generationModel('/api/upscale', { engine }), '');
    assert.equal(generationModel('/api/generate', { mode: 'edit', editEngine: engine }), '');
  }
  assert.equal(generationModel('/api/animate', {}), 'LTX 2.3');
});

test('event allowlist rejects arbitrary model text and top-level enrichment', () => {
  assert.equal(safeEvent('Generation_Started', { model_name: 'my secret prompt' }), null);
  const event = beforeSend({ event: 'App_Launched', properties: { distinct_id: 'ephemeral' },
    timestamp: '2026-09-12T00:00:00Z', prompt: 'private', '$set': { email: 'secret' }, ip: '127.0.0.1' });
  assert.deepEqual(Object.keys(event).sort(), ['event', 'properties', 'timestamp']);
  assert.equal(beforeSend({ event: 'App_Launched', properties: {}, timestamp: 'private' }).timestamp, undefined);
});

function analyticsFixture(values = new Map([['ks-anonymous-analytics-notice', 'seen-v2']])) {
  const events = []; let idle; const listeners = {};
  const win = {
    crypto: require('node:crypto').webcrypto,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    document: { getElementById: () => null },
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) },
    fetch: async () => ({ ok: true, json: async () => ({ enabled: true, key: 'public-key', host: 'https://us.i.posthog.com' }) }),
    requestIdleCallback: (fn) => { idle = fn; return 1; }, cancelIdleCallback: () => { idle = null; },
    posthog: { __SV: 1, init(configKey, config) { this.config = config; }, set_config(config) { this.config = config; }, capture: (event, properties) => events.push({ event, properties }), opt_out_capturing() {}, opt_in_capturing() {} },
  };
  return { win, events, values, listeners, start: () => idle?.(), analytics: createAnalytics(win) };
}

test('only successful POST submission hooks count, with no prompt or filename properties', async () => {
  const f = analyticsFixture(); await f.analytics.init(); f.start();
  assert.equal(f.analytics.trackGenerationRequest('/api/animate', {}), false);
  assert.equal(f.analytics.trackGenerationRequest('/api/animate', { method: 'GET' }), false);
  assert.equal(f.analytics.trackGenerationRequest('/api/animate', { method: 'POST', body: 'invalid JSON' }), false);
  assert.equal(f.analytics.trackGenerationRequest('/api/animate', { method: 'POST', body: JSON.stringify({ engine: 'ltx25', prompt: 'private', image: 'private.png' }) }), true);
  assert.deepEqual(f.events.map(e => e.event), ['App_Launched', 'Generation_Started']);
  assert.equal(f.events[1].properties.model_name, 'LTX 2.5');
  assert.equal(f.events[1].properties.prompt, undefined);
  const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  const api = app.slice(app.indexOf('async function api('), app.indexOf('\n}', app.indexOf('async function api(')) + 2);
  assert.ok(api.indexOf('throw error') < api.indexOf('Analytics.trackGenerationRequest'));
});

test('queued events respect opt-out and analytics failures do not break generation', async () => {
  const f = analyticsFixture();
  f.analytics.trackGenerationRequest('/api/animate', { method: 'POST', body: '{"engine":"ltx25"}' });
  await f.analytics.init(); f.analytics.setEnabled(false); f.start(); assert.deepEqual(f.events, []);
  f.analytics.setEnabled(true); f.start();
  assert.deepEqual(f.events.map(e => e.event), ['App_Launched']);
  f.win.posthog.capture = () => { throw new Error('SDK failure'); };
  assert.doesNotThrow(() => f.analytics.trackGenerationRequest('/api/animate', { method: 'POST', body: '{"engine":"ltx25"}' }));
  assert.equal(f.values.has('analytics-browser-id'), false);
});

test('reloads share a random browser identity but have distinct visits; opt-out rotates identity', async () => {
  const a = analyticsFixture(); await a.analytics.init(); a.start();
  const b = analyticsFixture(a.values); await b.analytics.init(); b.start();
  const first = a.events[0].properties, second = b.events[0].properties;
  assert.equal(first.distinct_id, second.distinct_id);
  assert.notEqual(first.visit_id, second.visit_id);
  const filtered = a.win.posthog.config.before_send(a.events[0]);
  assert.equal(filtered.properties.measurement_version, 2);
  assert.equal(filtered.properties.identity_scope, 'browser');
  a.analytics.setEnabled(false);
  assert.equal(b.win.posthog.config.before_send(b.events[0]), null);
  a.analytics.setEnabled(true);
  const last = a.events.at(-1).properties;
  assert.notEqual(first.distinct_id, last.distinct_id);
  assert.notEqual(first.visit_id, last.visit_id);
  assert.equal(a.win.posthog.config.before_send(a.events[0]), null);
});

test('unavailable storage or cryptographic randomness fails closed without breaking requests', async () => {
  const f = analyticsFixture();
  f.win.crypto = undefined;
  await f.analytics.init(); f.start();
  assert.equal(f.events.length, 0);
  const g = analyticsFixture();
  g.win.localStorage.getItem = () => { throw new Error('blocked'); };
  assert.equal(await g.analytics.init(), false);
  assert.doesNotThrow(() => g.analytics.trackGenerationRequest('/api/animate', {method:'POST'}));
});

test('another tab follows opt-out and resumes with a fresh visit after opt-in', async () => {
  const a = analyticsFixture(); await a.analytics.init(); a.start();
  const b = analyticsFixture(a.values); await b.analytics.init(); b.start();
  const oldEvent = b.events[0];
  a.analytics.setEnabled(false);
  b.listeners.storage({key: 'ks-anonymous-analytics-opt-out'});
  assert.equal(b.analytics.isOptedOut(), true);
  assert.equal(b.win.posthog.config.before_send(oldEvent), null);
  a.analytics.setEnabled(true);
  b.listeners.storage({key: 'ks-anonymous-analytics-opt-out'});
  assert.equal(b.analytics.isOptedOut(), false);
  assert.equal(b.events.length, 2);
  assert.equal(b.events[1].properties.distinct_id, a.events[1].properties.distinct_id);
  assert.notEqual(b.events[1].properties.visit_id, a.events[1].properties.visit_id);
  assert.equal(b.win.posthog.config.before_send(oldEvent), null);
});

test('valid transport UUIDs survive filtering for ingestion deduplication', () => {
  const uuid = '01a09846-7836-7425-9e49-31a0f877ee0e';
  assert.equal(beforeSend({event:'App_Launched',uuid}).uuid, uuid);
  assert.equal(beforeSend({event:'App_Launched',uuid:'private arbitrary text'}).uuid, undefined);
});
