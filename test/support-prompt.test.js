'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  MAX_IMPRESSIONS,
  MIN_ACTIVE_MS,
  MIN_GENERATIONS,
  SNOOZE_MS,
  normalizeSupportState,
  supportStateEligible,
} = require('../public/support-prompt');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'public', 'support-prompt.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('support prompt waits for meaningful app use and respects snooze and completion', () => {
  const now = 2_000_000_000_000;
  const ready = {
    activeMs: MIN_ACTIVE_MS,
    generations: MIN_GENERATIONS,
    snoozeUntil: 0,
    impressions: 0,
    completed: false,
  };
  assert.equal(supportStateEligible({ ...ready, activeMs: MIN_ACTIVE_MS - 1 }, now), false);
  assert.equal(supportStateEligible({ ...ready, generations: MIN_GENERATIONS - 1 }, now), false);
  assert.equal(supportStateEligible({ ...ready, snoozeUntil: now + SNOOZE_MS }, now), false);
  assert.equal(supportStateEligible({ ...ready, impressions: MAX_IMPRESSIONS }, now), false);
  assert.equal(supportStateEligible({ ...ready, completed: true }, now), false);
  assert.equal(supportStateEligible(ready, now), true);
});

test('support prompt storage state rejects malformed and negative counters', () => {
  assert.deepEqual(normalizeSupportState({
    activeMs: -20,
    generations: '7.9',
    snoozeUntil: 'bad',
    impressions: 2.8,
    completed: 'true',
  }), {
    activeMs: 0,
    generations: 7,
    snoozeUntil: 0,
    impressions: 2,
    completed: false,
  });
});

test('support prompt is wired to successful generation requests and app startup', () => {
  assert.match(html, /<script src="\/support-prompt\.js"><\/script>[\s\S]*<script src="\/app\.js"><\/script>/);
  assert.match(app, /SupportPrompt\.recordGenerationRequest\(path\)/);
  assert.match(app, /SupportPrompt\.init\(\)/);
  assert.match(source, /GENERATION_ROUTES\s*=\s*new Set/);
  assert.match(source, /\.sheet\.show, #appDrawer\.show, #lightbox\.show/);
  assert.match(source, /doc\.getElementById\('telemetryNotice'\)/);
});

test('support prompt offers GitHub, Patreon, and a quiet snooze action', () => {
  assert.match(source, /Are you enjoying Mix Studio\?/);
  assert.match(source, /keep Mix Studio free and open source/);
  assert.match(source, /https:\/\/github\.com\/BlackMixture\/Mix-Studio/);
  assert.match(source, /https:\/\/www\.patreon\.com\/BlackMixture/);
  assert.match(source, />Star on GitHub<\/a>/);
  assert.match(source, />Support on Patreon<\/a>/);
  assert.match(source, />Maybe later<\/button>/);
  assert.match(css, /\.support-prompt\s*\{[\s\S]*?pointer-events:\s*auto/);
});
