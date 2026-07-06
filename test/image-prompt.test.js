'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  IMAGE_RECREATION_INSTRUCTION,
} = require('../lib/image-prompt');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('image recreation instruction asks for faithful text-to-image detail', () => {
  assert.match(IMAGE_RECREATION_INSTRUCTION, /text-to-image/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /faithful/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /composition/i);
  assert.match(IMAGE_RECREATION_INSTRUCTION, /single paragraph/i);
});

test('server exposes an image-to-prompt endpoint', () => {
  assert.match(serverJs, /\/api\/imageprompt/);
  assert.match(serverJs, /suggestImagePrompt/);
});
