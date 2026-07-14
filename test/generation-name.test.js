'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_GENERATION_NAME,
  normalizeGenerationName,
  generationFileStem,
  smartGenerationName,
  smartAssetFilename,
} = require('../lib/generation-name');

test('generation names are trimmed, flattened, and length limited', () => {
  assert.equal(normalizeGenerationName('  City\nPortrait\u0000  '), 'City Portrait');
  assert.equal(normalizeGenerationName('x'.repeat(120)).length, MAX_GENERATION_NAME);
  assert.equal(normalizeGenerationName(null), '');
});

test('generation file stems prefer the saved name and remove an existing extension', () => {
  assert.equal(generationFileStem({ name: 'Final portrait.png', prompt: 'ignored' }), 'Final_portrait');
  assert.equal(generationFileStem({ prompt: 'A studio portrait' }), 'A_studio_portrait');
  assert.equal(generationFileStem({}, 'generation-4'), 'generation_4');
});

test('smart generation names remove prompt boilerplate and stop on whole words', () => {
  assert.equal(
    smartGenerationName("Create an image of the knight raising his sword and there's a huge explosion in the background"),
    "Knight raising his sword and there's a huge explosion"
  );
  assert.equal(smartGenerationName('', 'Untitled video'), 'Untitled video');
});

test('smart asset filenames stay readable, unique, and filesystem safe', () => {
  assert.equal(
    smartAssetFilename('A neon-lit city / at night', 'A1B2C3D4FFEEDD', '.PNG'),
    'neon-lit-city-at-night-a1b2c3d4.png'
  );
  assert.equal(smartAssetFilename('Portrait', 'abc123', '../bad'), 'portrait-abc123.png');
});
