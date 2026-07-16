'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  buildStrengthHuntPlan,
  buildStrengthHuntSheet,
  decodePng,
  encodeRgbaPng,
  mergeStrengthHuntGraphs,
  strengthHuntSheetLayout,
} = require('../lib/strength-hunt');

function lora(name, options = {}) {
  return Object.assign({ name, strength: 0.7, on: true }, options);
}

function solidPng(width, height, rgba) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4] = rgba[0];
    pixels[index * 4 + 1] = rgba[1];
    pixels[index * 4 + 2] = rgba[2];
    pixels[index * 4 + 3] = rgba[3];
  }
  return encodeRgbaPng(width, height, pixels);
}

test('single-LoRA Strength Hunt stops at the LoRA current strength', () => {
  const plan = buildStrengthHuntPlan([
    lora('Looks/Film.safetensors', { strengthHunt: true }),
    lora('Looks/Fixed.safetensors', { strength: 0.55 }),
  ], { id: 'hunt-one' });
  assert.equal(plan.variants.length, 5);
  assert.deepEqual(plan.variants.map((variant) => variant.strengths[0]), [0, 0.2, 0.4, 0.6, 0.7]);
  assert.equal(plan.variants[0].loras[0].strength, 0);
  assert.equal(plan.variants[0].loras[0].on, false);
  assert.equal(plan.variants[4].loras[0].strength, 0.7);
  assert.equal(plan.variants[4].label, 'Film 0.7');
  assert.equal(plan.variants[3].loras[1].strength, 0.55);
  assert.equal(plan.axes[0].maxStrength, 0.7);
});

test('two-LoRA Strength Hunt gives each matrix axis its own current maximum', () => {
  const plan = buildStrengthHuntPlan([
    lora('A.safetensors', { strength: 0.6, strengthHunt: true }),
    lora('B.safetensors', { strength: 1, strengthHunt: true }),
  ], { id: 'hunt-two' });
  assert.equal(plan.columns, 4);
  assert.equal(plan.rows, 6);
  assert.equal(plan.variants.length, 24);
  assert.deepEqual(plan.variants[0].strengths, [0, 0]);
  assert.equal(plan.variants[0].loras[0].on, false);
  assert.equal(plan.variants[0].loras[1].on, false);
  assert.deepEqual(plan.variants[3].strengths, [0.6, 0]);
  assert.deepEqual(plan.variants[20].strengths, [0, 1]);
  assert.deepEqual(plan.variants[23].strengths, [0.6, 1]);
});

test('Strength Hunt still reaches the global 2.0 safety ceiling', () => {
  const plan = buildStrengthHuntPlan([
    lora('A.safetensors', { strength: 2, strengthHunt: true }),
    lora('B.safetensors', { strength: 2, strengthHunt: true }),
  ]);
  assert.equal(plan.columns, 11);
  assert.equal(plan.rows, 11);
  assert.equal(plan.variants.length, 121);
  assert.deepEqual(plan.variants[120].strengths, [2, 2]);
});

test('Strength Hunt graph merge shares identical nodes and keeps every save output', () => {
  const graph = (strength) => ({
    loader: { class_type: 'UNETLoader', inputs: { unet_name: 'model.safetensors' } },
    lora: { class_type: 'LoraLoader', inputs: { model: ['loader', 0], lora_name: 'look.safetensors', strength_model: strength } },
    sampler: { class_type: 'KSampler', inputs: { model: ['lora', 0], seed: 42 } },
    save: { class_type: 'SaveImage', inputs: { images: ['sampler', 0], filename_prefix: 'gen' } },
  });
  const merged = mergeStrengthHuntGraphs([graph(0.2), graph(0.4)]);
  const nodes = Object.values(merged);
  assert.equal(nodes.filter((node) => node.class_type === 'UNETLoader').length, 1);
  assert.equal(nodes.filter((node) => node.class_type === 'LoraLoader').length, 2);
  assert.deepEqual(nodes.filter((node) => node.class_type === 'SaveImage').map((node) => node.inputs.filename_prefix), [
    'KreaStudio/strength_hunt_000',
    'KreaStudio/strength_hunt_001',
  ]);
  for (const node of nodes) {
    for (const value of Object.values(node.inputs || {})) {
      if (Array.isArray(value) && value.length === 2) assert.ok(merged[value[0]], `missing rewritten link ${value[0]}`);
    }
  }
});

test('Strength Hunt creates a readable PNG documentation image', () => {
  const red = solidPng(8, 6, [255, 0, 0, 255]);
  const blue = solidPng(8, 6, [0, 80, 255, 255]);
  const sheet = buildStrengthHuntSheet([
    { buffer: red, label: 'Film 0.2', strengths: [0.2], row: 0, column: 0 },
    { buffer: blue, label: 'Film 0.4', strengths: [0.4], row: 0, column: 1 },
  ], { columns: 2, rows: 1, axes: [{ label: 'Film' }], prompt: 'Portrait', seed: 42, cfg: 1, steps: 8, model: 'Krea 2' });
  const decoded = decodePng(sheet.buffer);
  assert.equal(decoded.width, sheet.width);
  assert.equal(decoded.height, sheet.height);
  assert.ok(sheet.width > 1000);
  assert.ok(sheet.height > 300);
});

test('Strength Hunt matrix documentation uses a bounded high-resolution layout', () => {
  const layout = strengthHuntSheetLayout(11, 11, 1);
  assert.ok(layout.tileWidth >= 300);
  assert.ok(layout.width >= 3500);
  assert.ok(layout.height >= 3900);
  assert.ok(layout.width <= 4096);
  assert.ok(layout.height <= 4096);
});

test('single-LoRA Strength Hunt can render an exact square documentation grid', () => {
  const colors = [
    [255, 0, 0, 255], [0, 255, 0, 255], [0, 80, 255, 255],
    [255, 200, 0, 255], [180, 0, 255, 255],
  ];
  const square = buildStrengthHuntSheet(colors.map((color, index) => ({
    buffer: solidPng(8, 6, color),
    label: `Film ${(index * 0.2).toFixed(1)}`,
    strengths: [index * 0.2],
  })), {
    columns: 3,
    rows: 2,
    squareCanvas: true,
    desiredTileWidth: 128,
    axes: [{ label: 'Film' }],
    prompt: 'Portrait',
    seed: 42,
    cfg: 1,
    steps: 8,
    model: 'Krea 2',
  });
  const decoded = decodePng(square.buffer);
  assert.equal(square.width, square.height);
  assert.equal(decoded.width, square.width);
  assert.equal(decoded.height, square.height);
  assert.ok(square.width > 400);
});

test('Strength Hunt is exposed as an intentional single-job UI and server workflow', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(app, /Strength Hunt: On/);
  assert.match(app, /Generate \$\{strengthHuntCount\}-image Strength Hunt/);
  assert.match(app, /strengthHuntConfirmed: strengthHuntCount/);
  assert.match(app, /values: strengthHuntValues\(lora\.strength\)/);
  assert.match(app, /current \$\{maxima\[0\]\} strength/);
  assert.match(app, /classList\.add\('strength-hunt-chip'\)/);
  assert.match(server, /async function queueStrengthHuntJob/);
  assert.match(server, /const huntCount = requestedHuntPlan \? requestedHuntPlan\.variants\.length : 0/);
  assert.match(server, /kind: 'loraHunt'/);
  assert.match(server, /generationGroupId: plan\.id/);
  assert.match(server, /buildStrengthHuntSheet/);
  assert.match(server, /squareCanvas: true/);
  assert.match(server, /layouts\.square/);
  assert.match(app, /label: 'Save row'/);
  assert.match(app, /label: 'Save square'/);
  assert.match(app, /downloadStrengthHuntLayout/);
});
