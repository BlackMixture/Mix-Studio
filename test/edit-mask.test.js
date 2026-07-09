'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  supportsEditMask,
  appendEditMaskNodes,
  appendEditMaskComposite,
  buildSam3MaskGraph,
  localizedEditPrompt,
  maskExpand,
  maskInfluence,
  maskInfluenceDenoise,
  normalizeMaskPoints,
} = require('../lib/edit-mask');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('localized edit masks are available for both Klein editors, Qwen Edit, and Krea2', () => {
  assert.equal(supportsEditMask('klein4'), true);
  assert.equal(supportsEditMask('klein9'), true);
  assert.equal(supportsEditMask('qwen'), true);
  assert.equal(supportsEditMask('krea2'), true);
  assert.equal(supportsEditMask('krea2ref'), false);
});

test('edit masks constrain latent noise and composite unchanged pixels from the source', () => {
  const graph = {};
  const masked = appendEditMaskNodes(graph, {
    prefix: 'area',
    maskImageName: 'mask.png',
    samples: ['source_latent', 0],
  });
  const output = appendEditMaskComposite(graph, {
    key: 'area_composite',
    original: ['source', 0],
    generated: ['decode', 0],
    mask: masked.mask,
  });

  assert.equal(graph.area_load.class_type, 'LoadImage');
  assert.equal(graph.area_channel.class_type, 'ImageToMask');
  assert.equal(graph.area_grow.class_type, 'GrowMask');
  assert.equal(graph.area_grow.inputs.expand, 14);
  assert.equal(graph.area_latent.class_type, 'SetLatentNoiseMask');
  assert.deepEqual(graph.area_latent.inputs.samples, ['source_latent', 0]);
  assert.equal(graph.area_composite.class_type, 'ImageCompositeMasked');
  assert.deepEqual(graph.area_composite.inputs.destination, ['source', 0]);
  assert.deepEqual(output, ['area_composite', 0]);
});

test('localized edits reserve a modest transition collar and tell the model to integrate it', () => {
  assert.equal(maskExpand(), 14);
  assert.equal(maskExpand(1), 6);
  assert.equal(maskExpand(99), 32);
  assert.match(localizedEditPrompt('replace the jacket'), /Localized edit only/);
  assert.match(localizedEditPrompt('replace the jacket'), /lighting direction/);
});

test('localized edit influence and expansion stay in a safe, useful range', () => {
  assert.equal(maskInfluence(), 78);
  assert.equal(maskInfluence(1), 25);
  assert.equal(maskInfluence(999), 100);
  assert.equal(maskInfluenceDenoise(78), 0.78);
  assert.equal(maskInfluenceDenoise(1), 0.25);
});

test('Klein editors and Qwen route masked source latents through localized composites', () => {
  assert.match(serverJs, /prefix: 'qwen_mask'[\s\S]*samples: \['latent', 0\]/);
  assert.match(serverJs, /latent_image: editMask \? editMask\.latent : \['latent', 0\]/);
  assert.match(serverJs, /prefix: 'klein_mask'[\s\S]*samples: \['enc1', 0\]/);
  assert.match(serverJs, /expand: p\.maskExpand/);
  assert.match(serverJs, /maskInfluenceDenoise\(p\.maskInfluence\)/);
  assert.match(serverJs, /key: 'klein_mask_composite'/);
  assert.match(serverJs, /Edit areas are available with Klein 4B, Klein 9B, Qwen Edit, and Krea2 only/);
});

test('SAM3 smart masks support text grounding and corrective point prompts', () => {
  const textGraph = buildSam3MaskGraph({ imageName: 'source.png', prompt: 'the jacket' });
  assert.equal(textGraph.sam3_model.class_type, 'LoadSAM3Model');
  assert.equal(textGraph.sam3_ground.class_type, 'SAM3Grounding');
  assert.equal(textGraph.mask_image.class_type, 'MaskToImage');
  assert.equal(textGraph.save_mask.class_type, 'SaveImage');

  const pointGraph = buildSam3MaskGraph({
    imageName: 'source.png',
    points: [
      { x: 0.25, y: 0.4, foreground: true },
      { x: 0.4, y: 0.5, foreground: true },
      { x: 0.9, y: 0.1, foreground: false },
    ],
  });
  assert.equal(pointGraph.sam3_positive_combine.class_type, 'SAM3CombinePoints');
  assert.equal(pointGraph.sam3_negative_1.class_type, 'SAM3CreatePoint');
  assert.equal(pointGraph.sam3_negative_combine.class_type, 'SAM3CombinePoints');
  assert.equal(pointGraph.sam3_segment.class_type, 'SAM3Segmentation');
  assert.deepEqual(pointGraph.sam3_segment.inputs.positive_points, ['sam3_positive_combine', 0]);
  assert.deepEqual(pointGraph.sam3_segment.inputs.negative_points, ['sam3_negative_combine', 0]);
  assert.deepEqual(normalizeMaskPoints([{ x: 2, y: -1 }]), [{ x: 1, y: 0, foreground: true }]);
  assert.match(serverJs, /route === '\/api\/edit-mask\/sam3'/);
  assert.match(serverJs, /kind: 'smartMask'/);
});

test('SAM3 completion keeps the job alive until its mask output is verified', () => {
  const labels = fs.readFileSync(path.join(__dirname, '..', 'lib', 'progress-labels.js'), 'utf8');
  assert.match(serverJs, /if \(job\.kind === 'smartMask'\) \{[\s\S]*?if \(job\.completing\) return;/);
  assert.match(serverJs, /SAM3 finished without a mask image/);
  assert.match(serverJs, /SAM3 selection timed out after 8 minutes/);
  assert.match(serverJs, /kind: 'smartMask', text: 'Queued Smart Select/);
  assert.match(labels, /LoadSAM3Model: 'Loading SAM3/);
  assert.match(labels, /SAM3Segmentation: 'Tracing selected object/);
});
