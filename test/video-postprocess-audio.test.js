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
