'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { startComfy, startStatus } = require('../lib/comfy-restart');

test('portable Start uses the vendor batch above ComfyUI and never invokes taskkill', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-portable-start-'));
  const base = path.join(temp, 'ComfyUI');
  const python = path.join(temp, 'python_embeded', 'python.exe');
  const script = path.join(temp, 'run_nvidia_gpu.bat');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(script, '');
  try {
    const runtime = { comfy: { path: base, url: 'http://127.0.0.1:8188' } };
    const options = { platform: 'win32', env: {}, home: path.join(temp, 'missing'), fsImpl: fs };
    const status = startStatus(runtime, options);
    assert.equal(status.kind, 'portable');
    assert.equal(status.runScript, script);
    let launched = null;
    await startComfy(runtime, () => {}, Object.assign({}, options, { spawn(value) { launched = value; } }));
    assert.equal(launched.runScript, script);
    assert.equal(launched.kind, 'portable');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Desktop-managed Comfy opens the official app instead of bypassing its Python launch plan', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-desktop-start-'));
  const appData = path.join(temp, 'app-data');
  const localAppData = path.join(temp, 'local-app-data');
  const install = path.join(temp, 'install');
  const base = path.join(install, 'ComfyUI');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const desktop = path.join(localAppData, 'Programs', 'Comfy Desktop', 'Comfy Desktop.exe');
  fs.mkdirSync(path.join(appData, 'Comfy Desktop'), { recursive: true });
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.mkdirSync(path.dirname(desktop), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(desktop, '');
  fs.writeFileSync(path.join(appData, 'Comfy Desktop', 'installations.json'), JSON.stringify([{
    id: 'main', name: 'My ComfyUI', status: 'installed', sourceId: 'comfyorg', installPath: install,
  }]));
  try {
    const runtime = { comfy: { path: base, url: 'http://127.0.0.1:8188' } };
    const options = { platform: 'win32', env: { APPDATA: appData, LOCALAPPDATA: localAppData }, home: path.join(temp, 'missing'), fsImpl: fs };
    const status = startStatus(runtime, options);
    assert.equal(status.kind, 'desktop');
    assert.equal(status.desktopApp, desktop);
    assert.equal(status.installationName, 'My ComfyUI');
    assert.equal(status.requiresUserAction, true);
    let launched = null;
    await startComfy(runtime, () => {}, Object.assign({}, options, { spawn(value) { launched = value; } }));
    assert.equal(launched.kind, 'desktop');
    assert.equal(launched.desktopApp, desktop);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('the Start API is owner-only, operation-safe, and separate from task-killing restart', () => {
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const startRoute = server.slice(server.indexOf("route === '/api/comfy/start'"), server.indexOf("route === '/api/comfy/restart'"));
  assert.match(startRoute, /Only the owner profile can start ComfyUI/);
  assert.match(startRoute, /assertDesktopIsIdle\(\)/);
  assert.match(startRoute, /startComfy\(RUNTIME/);
  assert.match(startRoute, /waitForStartedComfy/);
  assert.doesNotMatch(startRoute, /taskkill|pidsListeningOn|restartComfy/);
});

