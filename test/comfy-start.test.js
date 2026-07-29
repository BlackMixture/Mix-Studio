'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  isExpectedComfyProcess,
  restartComfy,
  restartStatus,
  startComfy,
  startStatus,
} = require('../lib/comfy-restart');

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

test('restart refuses remote servers and Comfy Desktop managed installations', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-restart-policy-'));
  const base = path.join(temp, 'ComfyUI');
  const python = path.join(base, '.venv', 'Scripts', 'python.exe');
  const script = path.join(temp, 'run_nvidia_gpu.bat');
  const appData = path.join(temp, 'app-data');
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(script, '');
  try {
    const common = { platform: 'win32', env: {}, home: path.join(temp, 'missing'), fsImpl: fs };
    const remote = restartStatus({ comfy: { path: base, url: 'http://192.168.1.20:8188' } }, common);
    assert.equal(remote.canRestart, false);
    assert.match(remote.reason, /another computer/i);

    fs.mkdirSync(path.join(appData, 'Comfy Desktop'), { recursive: true });
    fs.writeFileSync(path.join(appData, 'Comfy Desktop', 'installations.json'), JSON.stringify([{
      id: 'managed', status: 'installed', sourceId: 'comfyorg', installPath: temp,
    }]));
    const desktop = restartStatus({ comfy: { path: base, url: 'http://127.0.0.1:8188' } }, {
      ...common, env: { APPDATA: appData },
    });
    assert.equal(desktop.kind, 'desktop');
    assert.equal(desktop.canRestart, false);
    assert.match(desktop.reason, /Comfy Desktop/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('restart never kills a port listener that is not the configured ComfyUI process', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-restart-owner-'));
  const base = path.join(temp, 'ComfyUI');
  const python = path.join(temp, 'python_embeded', 'python.exe');
  const script = path.join(temp, 'run_nvidia_gpu.bat');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(script, '');
  const calls = [];
  const unrelated = { ProcessId: 44, ExecutablePath: 'C:\\Program Files\\nodejs\\node.exe', CommandLine: 'node server.js' };
  const options = {
    platform: 'win32', env: {}, home: path.join(temp, 'missing'), fsImpl: fs,
    run: async (command, args) => {
      calls.push([command, args]);
      if (command === 'netstat') return '  TCP    0.0.0.0:8188    0.0.0.0:0    LISTENING    44';
      return '';
    },
    processInfo: async () => unrelated,
    spawn() { throw new Error('must not launch after an ownership mismatch'); },
  };
  try {
    await assert.rejects(
      restartComfy({ comfy: { path: base, url: 'http://127.0.0.1:8188' } }, () => {}, options),
      (error) => error.code === 'comfy_restart_listener_mismatch' && /Nothing was stopped/.test(error.message),
    );
    assert.equal(calls.some(([command]) => command === 'taskkill'), false);
    assert.equal(isExpectedComfyProcess(unrelated, { basePath: base, mainPy: path.join(base, 'main.py'), pythonPath: python }), false);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('restart kills only a verified ComfyUI listener before relaunching portable ComfyUI', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-restart-verified-'));
  const base = path.join(temp, 'ComfyUI');
  const python = path.join(temp, 'python_embeded', 'python.exe');
  const script = path.join(temp, 'run_nvidia_gpu.bat');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(script, '');
  const calls = [];
  let launched = null;
  try {
    await restartComfy({ comfy: { path: base, url: 'http://localhost:8188' } }, () => {}, {
      platform: 'win32', env: {}, home: path.join(temp, 'missing'), fsImpl: fs,
      run: async (command, args) => {
        calls.push([command, args]);
        if (command === 'netstat') return '  TCP    127.0.0.1:8188    0.0.0.0:0    LISTENING    55';
        return '';
      },
      processInfo: async () => ({ ProcessId: 55, ExecutablePath: python, CommandLine: `"${python}" "${path.join(base, 'main.py')}" --port 8188` }),
      spawn(status) { launched = status; },
    });
    assert.deepEqual(calls.find(([command]) => command === 'taskkill'), ['taskkill', ['/PID', '55', '/T', '/F']]);
    assert.equal(launched.kind, 'portable');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Linux source installs can start and restart ComfyUI without Windows tooling', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-linux-restart-'));
  const base = path.join(temp, 'ComfyUI');
  const python = path.join(base, '.venv', 'bin', 'python');
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  const options = { platform: 'linux', env: {}, home: path.join(temp, 'missing'), fsImpl: fs };
  try {
    const runtime = { comfy: { path: base, url: 'http://127.0.0.1:8188' } };
    const start = startStatus(runtime, options);
    assert.equal(start.kind, 'python');
    assert.equal(start.canStart, true);
    assert.equal(start.pythonPath, python);
    const restart = restartStatus(runtime, options);
    assert.equal(restart.canRestart, true);
    assert.equal(restart.kind, 'python');
    const killed = [];
    let launched = null;
    let lookups = 0;
    await restartComfy(runtime, () => {}, Object.assign({}, options, {
      run: async (command, args) => {
        if (command === 'lsof') {
          lookups += 1;
          return lookups === 1 ? '77\n' : '';
        }
        if (command === 'ps') return `77 1 ${python} ${path.join(base, 'main.py')} --port 8188`;
        return '';
      },
      kill: (pid, signal) => killed.push([pid, signal]),
      pause: async () => {},
      spawn(status) { launched = status; },
    }));
    assert.deepEqual(killed, [[77, 'SIGTERM']]);
    assert.equal(launched.kind, 'python');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('comfyui-desktop-2 installs are detected from settings.json and stay app-managed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-desktop2-'));
  const appData = path.join(temp, 'app-data');
  const installDir = path.join(temp, 'ComfyUI-Installs');
  const base = path.join(installDir, 'ComfyUI', 'ComfyUI');
  const python = path.join(base, '.venv', 'bin', 'python');
  fs.mkdirSync(path.join(appData, 'comfyui-desktop-2'), { recursive: true });
  fs.mkdirSync(path.join(base, 'models'), { recursive: true });
  fs.mkdirSync(path.dirname(python), { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(python, '');
  fs.writeFileSync(path.join(appData, 'comfyui-desktop-2', 'settings.json'), JSON.stringify({ installDir }));
  const options = { platform: 'linux', env: { APPDATA: appData }, home: path.join(temp, 'missing'), fsImpl: fs };
  try {
    const runtime = { comfy: { path: base, url: 'http://127.0.0.1:8188' } };
    const start = startStatus(runtime, options);
    assert.equal(start.kind, 'desktop');
    assert.equal(start.installationName, 'ComfyUI');
    assert.equal(start.requiresUserAction, true);
    assert.equal(start.canStart, false);
    assert.match(start.reason, /ComfyUI Desktop app/);
    const restart = restartStatus(runtime, options);
    assert.equal(restart.canRestart, false);
    assert.match(restart.reason, /Comfy Desktop/i);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Linux Desktop apps are found through their XDG desktop entry launch command', () => {
  const { findComfyDesktopApp } = require('../lib/comfy-restart');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-xdg-'));
  const apps = path.join(temp, '.local', 'share', 'applications');
  const wrapper = path.join(temp, 'comfyui-amd.sh');
  fs.mkdirSync(apps, { recursive: true });
  fs.writeFileSync(wrapper, '#!/bin/sh\n');
  fs.writeFileSync(path.join(apps, 'comfy.desktop'), [
    '[Desktop Entry]',
    'Type=Application',
    'Name=Comfy Desktop',
    `Exec=${wrapper} --no-sandbox %U`,
    'StartupWMClass=comfyui-desktop-2',
  ].join('\n'));
  try {
    const found = findComfyDesktopApp({ platform: 'linux', env: {}, home: temp, fsImpl: fs });
    assert.equal(found, `${wrapper} --no-sandbox`);
    assert.equal(findComfyDesktopApp({ platform: 'linux', env: {}, home: path.join(temp, 'none'), fsImpl: fs }), '');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Desktop shared-models directories become the preferred download target', () => {
  const { comfyDesktop2Installations, desktopSharedModelsDir } = require('../lib/sam3-installer');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-comfy-shared-models-'));
  const appData = path.join(temp, 'app-data');
  const installDir = path.join(temp, 'installs');
  const base = path.join(installDir, 'ComfyUI', 'ComfyUI');
  const nasModels = path.join(temp, 'nas-models');
  fs.mkdirSync(path.join(appData, 'comfyui-desktop-2'), { recursive: true });
  fs.mkdirSync(base, { recursive: true });
  fs.mkdirSync(nasModels, { recursive: true });
  fs.writeFileSync(path.join(base, 'main.py'), '');
  fs.writeFileSync(path.join(appData, 'comfyui-desktop-2', 'settings.json'), JSON.stringify({
    installDir,
    modelsDirs: [path.join(temp, 'missing-nas'), nasModels],
  }));
  const env = { APPDATA: appData };
  try {
    const records = comfyDesktop2Installations(env, fs);
    assert.equal(records.length, 1);
    assert.equal(records[0].modelsDir, nasModels, 'unreachable dirs are skipped, reachable one adopted');
    assert.equal(desktopSharedModelsDir(base, env, fs), nasModels);
    assert.equal(desktopSharedModelsDir(path.join(temp, 'elsewhere'), env, fs), '');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
