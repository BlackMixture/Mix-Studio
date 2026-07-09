'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEditSequence,
  normalizeSequentialPrompts,
  supportsSequentialEdit,
} = require('../lib/edit-sequence');

test('sequential edits are limited to Klein, Qwen Edit, and Krea 2 Edit', () => {
  for (const engine of ['klein4', 'klein9', 'qwen', 'krea2ref']) assert.equal(supportsSequentialEdit(engine), true);
  for (const engine of ['krea2', 't2i', 'wan', '']) assert.equal(supportsSequentialEdit(engine), false);
});

test('normalizes an ordered edit sequence and preserves its current step', () => {
  const sequence = normalizeEditSequence({
    id: 'seq-example',
    prompts: [' Make HD. ', 'Remove text.', '', 'Add contrast.'],
    index: 1,
  }, 'qwen');
  assert.deepEqual(sequence, {
    id: 'seq-example',
    prompts: ['Make HD.', 'Remove text.', 'Add contrast.'],
    index: 1,
    total: 3,
  });
});

test('rejects single-step, unsupported, and oversized edit sequences safely', () => {
  assert.equal(normalizeEditSequence({ prompts: ['Only one.'] }, 'klein4'), null);
  assert.equal(normalizeEditSequence({ prompts: ['One.', 'Two.'] }, 'krea2'), null);
  const prompts = normalizeSequentialPrompts(Array.from({ length: 20 }, (_, index) => `Step ${index + 1}.`));
  assert.equal(prompts.length, 12);
});
