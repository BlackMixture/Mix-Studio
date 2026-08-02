'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('ComfyUI object metadata gets a shared long timeout and a distinct error', () => {
  assert.match(server, /const COMFY_OBJECT_INFO_TIMEOUT_MS = 60_000/);
  assert.match(server, /AbortSignal\.timeout\(COMFY_OBJECT_INFO_TIMEOUT_MS\)/);
  assert.match(server, /wrapped\.code = 'comfy_object_info_timeout'/);
  assert.doesNotMatch(server, /getObjectInfo\([^\n]*AbortSignal\.timeout\((?:4000|6000)\)/);
});
