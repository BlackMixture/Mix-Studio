'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const geometry = require('../public/mask-boxes.js');

test('mask boxes normalize reverse drags and retain a usable minimum size', () => {
  assert.deepEqual(geometry.rectFromPoints({ x: 0.8, y: 0.7 }, { x: 0.2, y: 0.1 }), {
    x: 0.2,
    y: 0.1,
    w: 0.6000000000000001,
    h: 0.6,
  });
  const box = geometry.normalizeBox({ id: 'tiny', x: 0.99, y: 0.99, w: 0, h: -1 });
  assert.equal(box.id, 'tiny');
  assert.equal(box.w, geometry.MIN_SIZE);
  assert.equal(box.h, geometry.MIN_SIZE);
  assert.ok(box.x + box.w <= 1);
  assert.ok(box.y + box.h <= 1);
});

test('mask boxes move and resize within the image bounds', () => {
  const source = { id: 'a', x: 0.2, y: 0.25, w: 0.3, h: 0.4 };
  assert.deepEqual(geometry.moveBox(source, 2, -2), {
    ...source,
    x: 0.7,
    y: 0,
  });
  assert.deepEqual(geometry.resizeBox(source, 'nw', -0.4, -0.5), {
    ...source,
    x: 0,
    y: 0,
    w: 0.5,
    h: 0.65,
  });
  const minimum = geometry.resizeBox(source, 'se', -2, -2);
  assert.ok(Math.abs(minimum.w - geometry.MIN_SIZE) < 1e-9);
  assert.ok(Math.abs(minimum.h - geometry.MIN_SIZE) < 1e-9);
});

test('mask box navigation wraps and every box contributes to the raster union', () => {
  const boxes = [
    { id: 'first', x: 0.1, y: 0.2, w: 0.25, h: 0.3 },
    { id: 'second', x: 0.5, y: 0.4, w: 0.4, h: 0.2 },
  ];
  assert.equal(geometry.cycleBoxId(boxes, 'first', -1), 'second');
  assert.equal(geometry.cycleBoxId(boxes, 'second', 1), 'first');
  assert.deepEqual(geometry.pixelRects(boxes, 1000, 500), [
    { x: 100, y: 100, w: 250, h: 150 },
    { x: 500, y: 200, w: 400, h: 100 },
  ]);
});
