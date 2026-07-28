'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const fsp = fs.promises;
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const thumbnail = fs.readFileSync(path.join(root, 'public', 'assets', 'camera-presets', 'cinematic-arri.jpg'));

function testPackBuffer(version = '1.0.0') {
  return Buffer.from(JSON.stringify({
    format: 'mix-studio.prompt-preset-pack',
    formatVersion: 1,
    type: 'prompt-presets',
    id: 'api-style-pack',
    name: 'API Style Pack',
    version,
    author: 'Mix Studio',
    description: 'End-to-end fixture',
    categories: [{
      id: 'style',
      label: 'Style',
      accent: 'violet',
      presets: [{
        id: 'cinematic',
        label: 'Cinematic',
        note: 'Film texture',
        promptText: 'cinematic film texture',
        thumbnail: { mime: 'image/jpeg', data: thumbnail.toString('base64') },
      }],
    }],
  }));
}

async function availablePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => socket.listen(0, '127.0.0.1', resolve).once('error', reject));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function startIsolatedServer(dataDirectory, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      MIXBOX_DATA_DIR: dataDirectory,
      MIXBOX_COMFY_URL: 'http://127.0.0.1:9',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start:\n${output}`)), 10_000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Mix Studio running')) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with ${code}:\n${output}`));
    });
  });
  await ready;
  return child;
}

async function jsonRequest(base, route, options = {}) {
  const response = await fetch(`${base}${route}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

test('owner can review, install, upgrade, serve, disable, and permanently delete a prompt pack', async (t) => {
  const dataDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'mixstudio-addon-api-'));
  let port;
  try {
    port = await availablePort();
  } catch (error) {
    await fsp.rm(dataDirectory, { recursive: true, force: true });
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip('This sandbox does not permit loopback test servers');
      return;
    }
    throw error;
  }
  const child = await startIsolatedServer(dataDirectory, port);
  t.after(async () => {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    await fsp.rm(dataDirectory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${port}`;

  const initial = await jsonRequest(base, '/api/addons');
  assert.equal(initial.response.status, 200);
  assert.equal(initial.body.canManage, true);
  assert.deepEqual(initial.body.packs, []);

  const inspected = await jsonRequest(base, '/api/addons/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'api-style-pack.mixpack' },
    body: testPackBuffer(),
  });
  assert.equal(inspected.response.status, 200);
  assert.equal(inspected.body.pack.id, 'api-style-pack');
  assert.ok(inspected.body.inspectionId);

  const discardedReview = await jsonRequest(base, '/api/addons/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'discarded-style-pack.mixpack' },
    body: testPackBuffer(),
  });
  assert.equal(discardedReview.response.status, 200);
  const discarded = await jsonRequest(base, `/api/addons/inspect/${discardedReview.body.inspectionId}`, {
    method: 'DELETE',
  });
  assert.equal(discarded.response.status, 200);
  assert.equal(discarded.body.discarded, true);

  const installed = await jsonRequest(base, '/api/addons/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionId: inspected.body.inspectionId }),
  });
  assert.equal(installed.response.status, 200);
  assert.equal(installed.body.operation, 'installed');
  assert.match(installed.body.pack.categories[0].presets[0].thumbnail, /\/api\/addons\/api-style-pack\/assets\//);

  const upgradeReview = await jsonRequest(base, '/api/addons/inspect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': 'api-style-pack-1.1.0.mixpack' },
    body: testPackBuffer('1.1.0'),
  });
  assert.equal(upgradeReview.response.status, 200);
  assert.equal(upgradeReview.body.versionChange, 'upgrade');
  const upgraded = await jsonRequest(base, '/api/addons/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionId: upgradeReview.body.inspectionId }),
  });
  assert.equal(upgraded.response.status, 200);
  assert.equal(upgraded.body.operation, 'updated');
  assert.equal(upgraded.body.previousVersion, '1.0.0');
  assert.equal(upgraded.body.pack.version, '1.1.0');

  const assetResponse = await fetch(`${base}${installed.body.pack.categories[0].presets[0].thumbnail}`);
  assert.equal(assetResponse.status, 200);
  assert.equal(assetResponse.headers.get('content-type'), 'image/jpeg');
  assert.ok((await assetResponse.arrayBuffer()).byteLength > 20_000);

  const disabled = await jsonRequest(base, '/api/addons/api-style-pack/enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.body.pack.enabled, false);

  const removed = await jsonRequest(base, '/api/addons/api-style-pack', { method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.deleted, true);
  assert.equal(removed.body.recoverable, false);
  await assert.rejects(fsp.access(path.join(dataDirectory, 'addons', 'prompt-packs', 'api-style-pack')));
  await assert.rejects(fsp.access(path.join(dataDirectory, 'trash', 'addons', 'prompt-packs')));
});
