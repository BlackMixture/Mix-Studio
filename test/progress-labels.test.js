'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { nodeLabelForJob } = require('../lib/progress-labels');

function job(kind, classType) {
  return { kind, graph: { sampler: { class_type: classType } } };
}

test('shared sampler nodes describe image and edit jobs as sampling', () => {
  for (const classType of ['KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'SamplerCustomAdvanced']) {
    assert.equal(nodeLabelForJob(job('gen', classType), 'sampler'), 'Sampling...');
  }
});

test('shared sampler nodes describe video jobs as video generation', () => {
  for (const classType of ['KSampler', 'KSamplerAdvanced', 'SamplerCustom', 'SamplerCustomAdvanced']) {
    assert.equal(nodeLabelForJob(job('video', classType), 'sampler'), 'Generating video...');
  }
});

test('progress labels retain specialized node descriptions and safe fallback', () => {
  assert.equal(nodeLabelForJob(job('gen', 'Krea2RegionalMultiLoRAV3'), 'sampler'), 'Applying region guidance...');
  assert.equal(nodeLabelForJob(job('video', 'CreateVideo'), 'sampler'), 'Encoding video...');
  assert.equal(nodeLabelForJob(job('gen', 'UnknownNode'), 'sampler'), 'Working...');
  assert.equal(nodeLabelForJob(null, 'sampler'), 'Working...');
});
