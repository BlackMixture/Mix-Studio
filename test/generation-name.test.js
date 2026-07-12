'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_GENERATION_NAME,
  normalizeGenerationName,
  generationFileStem,
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
