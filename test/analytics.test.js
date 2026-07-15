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

test('the first-run analytics notice uses a clear primary action and a quiet opt-out', () => {
  assert.match(analyticsSource, /Anonymous analytics are on/);
  assert.match(analyticsSource, /No prompts, media, screen recording, or generation content/);
  assert.match(analyticsSource, /Change this anytime in Advanced Settings/);
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

test('anonymous analytics remain controllable from the persistent Advanced Settings switch', () => {
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
  const health = general.indexOf('id="healthList"');
  const analytics = general.indexOf('id="analyticsToggle"');

  assert.ok(health >= 0 && analytics > health, 'analytics should follow the health report at the end of General settings');
  assert.equal(general.lastIndexOf('<button'), general.lastIndexOf('<button', analytics),
    'analytics should be the final interactive control in General settings');

  const compactRule = css.match(/(?:#settingsPaneGeneral\s+|\.settings-pane\s+(?:>\s*)?)?\.analytics-toggle\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(compactRule, /min-height:/, 'analytics should have its own compact height instead of inheriting the large generic row');
  assert.match(compactRule, /padding:/, 'analytics should have its own compact spacing');
  assert.match(css, /\.analytics-toggle\s+\.settings-media-toggle-copy\s+(?:strong|small)\s*\{/,
    'analytics copy sizing should be scoped without shrinking every Settings toggle');
});
