'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { COMPONENTS, NODE_PACKS } = require('../lib/dependency-installer');

test('H3 Long context installs the reviewed v0.2.0 Motion Context node without additional models', () => {
  assert.deepEqual(COMPONENTS.h3context, {
    label: 'MiniMax H3 Long Context (Experimental)',
    optional: true,
    nodes: ['h3MotionContext'],
    models: [],
  });
  assert.deepEqual(NODE_PACKS.h3MotionContext, {
    label: 'MiniMax H3 Motion Context',
    folder: 'ComfyUI-H3-Motion-Context',
    repo: 'https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context.git',
    ref: 'c140ae99b8c38f782ebd8564c267b42aacade6a4',
    enforceRevision: true,
  });
});
