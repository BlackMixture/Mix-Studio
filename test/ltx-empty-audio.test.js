'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('every LTX empty-audio route supplies the current required input names', () => {
  assert.match(server, /async function ltxEmptyAudioNode\(frames, frameRate\)/);
  assert.match(server, /frames_number: frames,[\s\S]{0,80}frame_rate: frameRate,[\s\S]{0,80}batch_size: 1/);
  const calls = server.match(/ltxEmptyAudioNode\(opts\.frames, opts\.fps\)/g) || [];
  assert.equal(calls.length, 3);
  const rawBuilders = server.match(/nodeFromOrdered\(\s*'LTXVEmptyLatentAudio'/g) || [];
  assert.equal(rawBuilders.length, 1);
});
