'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  comfyResetRequests,
} = require('../lib/comfy-reset');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

test('hard reset sequence interrupts, clears queue, and frees ComfyUI memory', () => {
  const requests = comfyResetRequests();
  assert.deepEqual(requests.map((req) => [req.name, req.path, req.init.method]), [
    ['interrupt', '/interrupt', 'POST'],
    ['clearQueue', '/queue', 'POST'],
    ['freeMemory', '/free', 'POST'],
  ]);
  assert.deepEqual(JSON.parse(requests[1].init.body), { clear: true });
  assert.deepEqual(JSON.parse(requests[2].init.body), { unload_models: true, free_memory: true });
});

test('server exposes a queue hard reset endpoint', () => {
  assert.match(serverJs, /\/api\/queue\/reset/);
  assert.match(serverJs, /comfyResetRequests/);
});

test('queue sheet exposes a hard reset button', () => {
  assert.match(indexHtml, /id="queueResetBtn"/);
  assert.match(appJs, /\/api\/queue\/reset/);
  assert.match(appJs, /Hard reset/);
});
