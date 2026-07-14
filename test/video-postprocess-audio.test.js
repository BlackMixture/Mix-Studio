'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('video post-processing only requests an audio output when the source contains audio', () => {
  assert.match(server, /const hasAudio = detectAudioStream\(buf, entry\.file\) === true/);
  assert.match(server, /buildExistingVideoUpscale\(comfyName, \{ fps, frames, scale, hasAudio \}\)/);
  assert.match(server, /buildExistingVideoInterpolate\(comfyName, \{ fps, frames, smooth: multiplier, hasAudio \}\)/);
  const conditionalAudioLinks = server.match(/if \(opts\.hasAudio\) videoInputs\.audio = \['src', 2\];/g) || [];
  assert.equal(conditionalAudioLinks.length, 2);
  assert.match(server, /if \(hasAudio\) videoInfo\.preservedAudio = true;\s*else delete videoInfo\.preservedAudio;/);
});

test('side-by-side comparisons keep the generated result audio in sync', () => {
  const start = server.indexOf('// Side-by-side comparison:');
  const end = server.indexOf('// Fast DA3 pass', start);
  const compositeRoute = server.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(compositeRoute, /const hasAudio = detectAudioStream\(buf, entry\.file\) === true/);
  assert.match(compositeRoute, /if \(hasAudio\) videoInputs\.audio = \['result', 2\]/);
  assert.match(compositeRoute, /preservedAudio: hasAudio \|\| undefined/);
  assert.doesNotMatch(compositeRoute, /videoInputs\.audio = \['drive', 2\]/);
});
