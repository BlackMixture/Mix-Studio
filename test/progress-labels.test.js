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

test('MiniMax H3 progress names its model, conditioning, and audio stages', () => {
  const h3Job = {
    kind: 'video',
    videoInfo: { engine: 'h3' },
    graph: {
      model: { class_type: 'UNETLoader' },
      condition: { class_type: 'MiniMaxH3ReferenceToVideo' },
      audio: { class_type: 'VAEDecodeAudio' },
    },
  };
  assert.equal(nodeLabelForJob(h3Job, 'model'), 'Loading MiniMax H3...');
  assert.equal(nodeLabelForJob(h3Job, 'condition'), 'Preparing H3 references...');
  assert.equal(nodeLabelForJob(h3Job, 'audio'), 'Decoding audio...');
});

test('sequential H3 Turbo chunks retain one overall progress range across prompt IDs', () => {
  const h3Job = {
    kind: 'video',
    graph: { sample: { class_type: 'SamplerCustomAdvanced' } },
    videoChunkSequence: {
      index: 1,
      segments: [{ index: 0 }, { index: 1 }, { index: 2 }],
    },
  };
  assert.equal(nodeLabelForJob(h3Job, 'sample'), 'H3 Turbo chunk 2 of 3');
  assert.deepEqual(progressDetailsForJob(h3Job, 'sample', 3, 6), {
    isSampling: true,
    nodeId: 'sample',
    phaseIndex: 2,
    phaseCount: 3,
    phaseLabel: 'H3 Turbo chunk',
    localPercent: 50,
    overallPercent: 48,
  });
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

test('Strength Hunt reports one overall percentage across comparison samplers', () => {
  const hunt = job('loraHunt', 'KSampler');
  hunt.graph.second = { class_type: 'KSampler', inputs: {} };
  hunt.huntPlan = { variants: [{ label: 'Film 0.2' }, { label: 'Film 0.4' }] };
  assert.equal(nodeLabelForJob(hunt, 'sampler'), 'Strength comparison 1 of 2');
  const progress = progressDetailsForJob(hunt, 'second', 5, 10);
  assert.equal(progress.phaseIndex, 2);
  assert.equal(progress.phaseCount, 2);
  assert.equal(progress.phaseLabel, 'Film 0.4');
  assert.equal(progress.overallPercent, 72);
});
