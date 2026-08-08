'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

test('H3 Preferences exposes deliberate Standard, BF16, and DynTime choices', () => {
  assert.match(html, /id="setH3FrameModelVariant"[\s\S]*value="bf16"/);
  assert.match(html, /id="setH3ReferenceModelVariant"[\s\S]*value="dyntime"[\s\S]*value="dyntime-hq"/);
  assert.match(html, /id="h3ModelCompatibility"/);
  assert.match(app, /h3TurboCompatibility|Turbo is disabled for DynTime|Unavailable with DynTime/);
  assert.match(app, /components: \[component\]/);
});

test('Queue tabs appear only with active downloads and cleanup uses typed filenames', () => {
  assert.match(html, /id="queueTabs"[^>]*hidden/);
  assert.match(html, /data-queue-view="jobs"/);
  assert.match(html, /data-queue-view="downloads"/);
  assert.match(app, /const hasDownloads = downloads\.length > 0/);
  assert.match(app, /#queueTabs'\)\.hidden = !hasDownloads/);
  assert.match(app, /expected: candidate\.filename/);
  assert.match(app, /\/api\/models\/cleanup/);
});
