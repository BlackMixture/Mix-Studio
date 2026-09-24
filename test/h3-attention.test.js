'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  H3_ATTENTION_BACKENDS,
  h3AttentionOptions,
  normalizeH3AttentionBackend,
} = require('../lib/h3-attention');

test('H3 attention backend normalization supports SLA without changing legacy behavior', () => {
  assert.deepEqual(H3_ATTENTION_BACKENDS, ['standard', 'sageattention', 'sla', 'kitchen']);
  assert.equal(normalizeH3AttentionBackend('sla'), 'sla');
  assert.equal(normalizeH3AttentionBackend('sage'), 'sageattention');
  assert.equal(normalizeH3AttentionBackend('', false), 'standard');
  assert.equal(normalizeH3AttentionBackend('', true), 'sageattention');
  assert.deepEqual(h3AttentionOptions('sla'), {
    attentionBackend: 'sla', sageAttention: false, slaAttention: true,
  });
});

test('Kitchen requires the advertised native backend and never stacks attention patches', async () => {
  const { kitchenAttentionCapability } = require('../lib/h3-attention');
  const { buildMiniMaxH3Graph } = require('../lib/video-workflows');
  assert.equal(kitchenAttentionCapability({}).ready, false);
  assert.equal(kitchenAttentionCapability({ ModelAttentionBackend: { input: { required: { attention: ['COMBO', { options: ['pytorch attention'] }] } } } }).ready, false);
  assert.equal(kitchenAttentionCapability({ ModelAttentionBackend: { input: { required: { attention: ['COMBO', { options: ['comfy kitchen attention'] }] } } } }).ready, true);
  const graph = await buildMiniMaxH3Graph({ attentionBackend: 'kitchen', sageAttention: true }, {});
  assert.deepEqual(graph.guider.inputs.model, ['kitchen_attention', 0]);
  assert.equal(graph.kitchen_attention.inputs.attention, 'comfy kitchen attention');
  assert.equal(graph.sage_attention, undefined);
  assert.equal(graph.sla_attention, undefined);
});
