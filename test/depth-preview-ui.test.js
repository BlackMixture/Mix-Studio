'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDepthMapNodes, buildDepthPreviewGraph } = require('../lib/krea2-workflows');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('depth preview graph renders just the DA3 map for a guide image', () => {
  const graph = buildDepthPreviewGraph({
    imageName: 'guide.png', depthModel: 'da3_large.safetensors', width: 768, height: 1024,
  });
  assert.equal(graph.depth_map.class_type, 'DepthAnything_V3');
  assert.equal(graph.depth_map.inputs.normalization_mode, 'V2-Style');
  assert.equal(graph.depth_source_scale.inputs.width, 768);
  assert.equal(graph.depth_source_scale.inputs.height, 1024);
  assert.deepEqual(graph.save.inputs.images, ['depth_map', 0]);
});

test('depth map nodes analyze at native size when no dimensions are given', () => {
  const depth = buildDepthMapNodes({ imageName: 'guide.png' });
  assert.equal(depth.nodes.depth_source_scale, undefined);
  assert.deepEqual(depth.nodes.depth_map.inputs.images, ['depth_source', 0]);
  assert.deepEqual(depth.image, ['depth_map', 0]);
  assert.deepEqual(depth.source, ['depth_source', 0]);
});

test('the Create image guide exposes a depth preview toggle', () => {
  assert.match(html, /id="createDepthPreviewBtn"/);
  assert.match(css, /\.create-depth-preview-btn/);
  assert.match(app, /createDepthPreview: null/);
  assert.match(app, /function clearCreateDepthPreview/);
  assert.match(app, /\/api\/depth-preview/);
  assert.match(app, /Rendering depth map…/);
  assert.match(server, /route === '\/api\/depth-preview'/);
  assert.match(server, /buildDepthPreviewGraph/);
  assert.match(server, /async function waitForComfyImage/);
});

test('depth-guided generations can save a source/depth/result composite', () => {
  assert.match(server, /async function buildDepthComposite/);
  assert.match(server, /await buildDepthComposite\(comfyNames, \{ width: root\.width, height: root\.height \}\)/);
  assert.match(server, /Source \+ depth \+ generation/);
  assert.match(app, /saveImageComposite\(it, 'depth-map'\)/);
  assert.match(app, /'before-after', 'reference-generation', 'depth-map'/);
  assert.match(app, /_depth_composite/);
});
