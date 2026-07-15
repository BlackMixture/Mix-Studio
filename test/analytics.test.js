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
  assert.equal(config.person_profiles, 'identified_only');
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

test('the first-run analytics notice and persistent Settings control are present', () => {
  assert.match(html, /id="analyticsToggle"[^>]*role="switch"[^>]*hidden/);
  assert.match(html, /<script src="\/analytics\.js"><\/script>/);
  assert.match(css, /\.telemetry-toast\s*\{/);
  assert.match(analyticsSource, /Quick heads up, this app is completely FREE and OPEN SOURCE!/);
  assert.match(analyticsSource, /Zero screen recording, ever/);
  assert.match(analyticsSource, /anything you create stays completely PRIVATE/);
  assert.match(analyticsSource, /type="checkbox"> Disable/);
  assert.match(analyticsSource, />Thanks<\/button>/);
  assert.match(analyticsSource, /Disable anonymous analytics\?/);
});
