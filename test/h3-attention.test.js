'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  H3_ATTENTION_BACKENDS,
  h3AttentionOptions,
  normalizeH3AttentionBackend,
} = require('../lib/h3-attention');

test('H3 attention backend normalization supports SLA without changing legacy behavior', () => {
  assert.deepEqual(H3_ATTENTION_BACKENDS, ['standard', 'sageattention', 'sla']);
  assert.equal(normalizeH3AttentionBackend('sla'), 'sla');
  assert.equal(normalizeH3AttentionBackend('sage'), 'sageattention');
  assert.equal(normalizeH3AttentionBackend('', false), 'standard');
  assert.equal(normalizeH3AttentionBackend('', true), 'sageattention');
  assert.deepEqual(h3AttentionOptions('sla'), {
    attentionBackend: 'sla', sageAttention: false, slaAttention: true,
  });
});
