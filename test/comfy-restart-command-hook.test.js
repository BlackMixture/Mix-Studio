'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  restartStatus,
  restartComfy,
  startStatus,
  startComfy,
} = require('../lib/comfy-restart');

// On non-Windows hosts there is no Comfy Desktop app or run_nvidia_gpu.bat, so the
// UI Restart/Start actions delegate to an operator-supplied command
// (MIXBOX_COMFY_RESTART_CMD / MIXBOX_COMFY_START_CMD), e.g. a systemd --user unit.

test('restartStatus enables a command hook when MIXBOX_COMFY_RESTART_CMD is set', () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188' } };
  const env = { MIXBOX_COMFY_RESTART_CMD: 'systemctl --user restart comfyui.service' };
  const status = restartStatus(runtime, { platform: 'linux', env });
  assert.equal(status.canRestart, true);
  assert.equal(status.kind, 'command');
  assert.equal(status.command, 'systemctl --user restart comfyui.service');
  assert.equal(status.port, 8188);
});

test('restartComfy runs the command via `sh -c` and never invokes taskkill', async () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188' } };
  const env = { MIXBOX_COMFY_RESTART_CMD: 'systemctl --user restart comfyui.service' };
  const calls = [];
  const run = (command, args) => { calls.push([command, args]); return Promise.resolve(''); };
  await restartComfy(runtime, () => {}, { platform: 'linux', env, run });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/bin/sh');
  assert.deepEqual(calls[0][1], ['-c', 'systemctl --user restart comfyui.service']);
  assert.ok(!calls.some(([command]) => /taskkill/i.test(command)));
});

test('startStatus enables a command hook when MIXBOX_COMFY_START_CMD is set', () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188' } };
  const env = { MIXBOX_COMFY_START_CMD: 'systemctl --user start comfyui.service' };
  const status = startStatus(runtime, { platform: 'linux', env });
  assert.equal(status.canStart, true);
  assert.equal(status.kind, 'command');
  assert.equal(status.command, 'systemctl --user start comfyui.service');
});

test('startComfy runs the start command via `sh -c`', async () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188' } };
  const env = { MIXBOX_COMFY_START_CMD: 'systemctl --user start comfyui.service' };
  const calls = [];
  const run = (command, args) => { calls.push([command, args]); return Promise.resolve(''); };
  await startComfy(runtime, () => {}, { platform: 'linux', env, run });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/bin/sh');
  assert.deepEqual(calls[0][1], ['-c', 'systemctl --user start comfyui.service']);
});

test('without the hook env, non-Windows restart stays unavailable (unchanged behavior)', () => {
  const runtime = { comfy: { url: 'http://127.0.0.1:8188' } };
  const status = restartStatus(runtime, { platform: 'linux', env: {} });
  assert.equal(status.canRestart, false);
});
