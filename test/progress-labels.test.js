'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  nodeLabelForJob,
  progressDetailsForJob,
  progressPhaseForJob,
} = require('../lib/progress-labels');

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

test('multi-stage video progress names each pass and reports one overall percentage', () => {
  const videoJob = {
    kind: 'video',
    graph: {
      samp1: { class_type: 'SamplerCustomAdvanced' },
      samp2: { class_type: 'SamplerCustomAdvanced' },
      decode: { class_type: 'VAEDecodeTiled' },
    },
  };

  assert.equal(nodeLabelForJob(videoJob, 'samp1'), 'Base pass · stage 1 of 2');
  assert.equal(nodeLabelForJob(videoJob, 'samp2'), 'Refinement pass · stage 2 of 2');
  assert.deepEqual(progressDetailsForJob(videoJob, 'samp1', 5, 10), {
    isSampling: true,
    nodeId: 'samp1',
    phaseIndex: 1,
    phaseCount: 2,
    phaseLabel: 'Base pass',
    localPercent: 50,
    overallPercent: 24,
  });
  assert.equal(progressDetailsForJob(videoJob, 'samp2', 10, 10).overallPercent, 96);
  assert.deepEqual(progressPhaseForJob(videoJob, 'decode'), {
    isSampling: false,
    phaseIndex: 0,
    phaseCount: 2,
    phaseLabel: '',
  });
});
