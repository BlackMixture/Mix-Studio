'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  desktopPortLocks,
  discoverComfyEndpoints,
  isComfySystemStats,
  normalizedComfyUrl,
  portFromLaunchArgs,
  probeComfyUrl,
} = require('../lib/comfy-discovery');

function comfyResponse(ok = true) {
  return {
    ok,
    async json() { return { system: { os: 'nt' }, devices: [] }; },
  };
}

test('Comfy launch arguments accept both official port forms and reject invalid ports', () => {
  assert.equal(portFromLaunchArgs('--enable-manager --port 9000'), 9000);
  assert.equal(portFromLaunchArgs(['--listen', '127.0.0.1', '--port=8189']), 8189);
  assert.equal(portFromLaunchArgs('--port "8010"'), 8010);
  assert.equal(portFromLaunchArgs('--port 70000'), 0);
  assert.equal(portFromLaunchArgs('--enable-manager', 8188), 8188);
  assert.equal(normalizedComfyUrl('http://0.0.0.0:8188/path?q=1'), 'http://127.0.0.1:8188');
});

test('Desktop live port locks are parsed in newest-first order and malformed files are ignored', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-locks-'));
  const directory = path.join(temp, 'Comfy Desktop', 'port-locks');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'port-8189.json'), JSON.stringify({ pid: 9, installationName: 'New', timestamp: '2026-07-21T12:00:00Z' }));
  fs.writeFileSync(path.join(directory, 'port-8188.json'), JSON.stringify({ pid: 8, installationName: 'Old', timestamp: '2026-07-20T12:00:00Z' }));
  fs.writeFileSync(path.join(directory, 'port-nope.json'), '{');
  try {
    const locks = desktopPortLocks({ env: { APPDATA: temp }, fsImpl: fs });
    assert.deepEqual(locks.map((entry) => entry.port), [8189, 8188]);
    assert.equal(locks[0].installationName, 'New');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Comfy probes require the documented system_stats shape', async () => {
  assert.equal(isComfySystemStats({ system: {}, devices: [] }), true);
  assert.equal(isComfySystemStats({ ok: true }), false);
  assert.equal(await probeComfyUrl('http://127.0.0.1:8188', { fetchImpl: async () => comfyResponse() }), true);
  assert.equal(await probeComfyUrl('http://127.0.0.1:8188', { fetchImpl: async () => ({ ok: true, async json() { return { hello: 'world' }; } }) }), false);
});

test('discovery keeps a healthy saved URL and rejects unrelated services', async () => {
  const calls = [];
  const result = await discoverComfyEndpoints('http://127.0.0.1:9010', {
    platform: 'linux', env: {}, defaultPorts: [8188],
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.startsWith('http://127.0.0.1:9010/')) return comfyResponse();
      return { ok: true, async json() { return { service: 'not-comfy' }; } };
    },
  });
  assert.equal(result.url, 'http://127.0.0.1:9010');
  assert.equal(result.matches.length, 1);
  assert.ok(calls.some((url) => url.includes(':8188/system_stats')));
});

test('a failed remote URL is never silently replaced by a local ComfyUI', async () => {
  const result = await discoverComfyEndpoints('https://generation.example.test:9443', {
    platform: 'linux', env: {}, defaultPorts: [8188],
    fetchImpl: async (url) => url.startsWith('http://127.0.0.1:8188/')
      ? comfyResponse()
      : { ok: false, async json() { return {}; } },
  });
  assert.equal(result.url, '');
  assert.equal(result.ambiguous, true);
  assert.equal(result.matches[0].url, 'http://127.0.0.1:8188');
});

