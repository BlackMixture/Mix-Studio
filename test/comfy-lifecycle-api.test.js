'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { signProfileId, hashPin } = require('../lib/profiles');

test('managed backend API requires sign-in and owner configuration, and Stable cannot opt in', async (t) => {
  const socket = net.createServer();
  try { await new Promise((resolve, reject) => socket.once('error', reject).listen(0, '127.0.0.1', resolve)); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Loopback servers are unavailable'); return; } throw error; }
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-lifecycle-api-'));
  const secret = 'disposable-lifecycle-test-secret';
  const pin = hashPin('1234');
  fs.writeFileSync(path.join(directory, 'auth_secret.txt'), secret);
  fs.writeFileSync(path.join(directory, 'db.json'), JSON.stringify({
    profiles: ['owner', 'guest'].map((id) => ({ id, name: id, pinHash: pin.hash, pinSalt: pin.salt })),
    items: [], folders: [], history: [],
  }));
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), MIXBOX_DATA_DIR: directory, MIXBOX_RELEASE_CHANNEL: 'stable', MIXBOX_COMFY_URL: 'http://127.0.0.1:9' },
    stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(async () => {
    if (child.exitCode === null) { const ended = new Promise((resolve) => child.once('exit', resolve)); child.kill('SIGTERM'); await ended; }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 15000);
    const data = (chunk) => { output += chunk; if (output.includes('Mix Studio running')) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', data); child.stderr.on('data', data);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
  });
  const request = async (route, profile, body) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(profile ? { Cookie: `ks_profile=${encodeURIComponent(signProfileId(profile, secret))}` } : {}), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('/api/comfy/lifecycle')).status, 401);
  assert.equal((await request('/api/comfy/lifecycle/ensure', null, {})).status, 401);
  assert.equal((await request('/api/comfy/lifecycle', 'guest', { action: 'configure', enabled: false, idleMinutes: 10 })).status, 403);
  const initial = await request('/api/comfy/lifecycle', 'owner');
  assert.equal(initial.status, 200); assert.equal(initial.body.available, false); assert.equal(initial.body.enabled, false);
  assert.equal((await request('/api/comfy/lifecycle', 'owner', { action: 'configure', enabled: true, idleMinutes: 10 })).status, 409);
  assert.equal((await request('/api/comfy/lifecycle', 'owner', { action: 'configure', enabled: false, idleMinutes: -1 })).status, 400);
  assert.equal((await request('/api/comfy/lifecycle', 'owner', { action: 'configure', enabled: false, idleMinutes: 30 })).status, 200);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'comfy-lifecycle.json'))), { enabled: false, idleMinutes: 30 });
  const ensure = await request('/api/comfy/lifecycle/ensure', 'guest', {});
  assert.equal(ensure.status, 200); assert.equal(ensure.body.owned, false);
  assert.equal((await request('/api/comfy/lifecycle', 'owner', { action: 'stop' })).status, 409);
});
