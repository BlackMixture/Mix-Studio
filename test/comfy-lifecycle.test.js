'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { splitLaunchArgs, managedLaunchPlan, normalizeLifecycleConfig, createComfyLifecycle } = require('../lib/comfy-lifecycle');

function fixture(overrides = {}) {
  let time = 0;
  const state = { enabled: true, available: true, busy: false, listener: [], queue: { queue_running: [], queue_pending: [] },
    child: null, spawns: [], calls: [], kills: [], idleMinutes: 10 };
  const options = {
    platform: 'linux',
    execFile: () => { throw new Error('A unit fixture must never execute an OS command'); },
    processInfo: async () => null,
    config: () => state,
    available: () => state.available,
    busy: () => state.busy,
    plan: () => ({ supported: true, reason: '', executable: '/python', args: ['/ComfyUI/main.py'], cwd: '/ComfyUI', url: 'http://127.0.0.1:8188', port: 8188 }),
    now: () => time,
    sleep: async (ms) => { time += ms; },
    listeners: async () => state.listener,
    request: async (url, route, body) => { state.calls.push({ url, route, body }); return route === '/queue' ? state.queue : {}; },
    spawn: (...args) => {
      state.spawns.push(args);
      const child = new EventEmitter();
      Object.assign(child, { pid: 42, exitCode: null, signalCode: null, unref() {}, kill(signal) { state.kills.push(signal); return true; } });
      state.child = child; state.listener = [42]; return child;
    },
    ...overrides,
  };
  return { state, controller: createComfyLifecycle(options), advance: (ms) => { time += ms; } };
}

test('managed settings require explicit opt-in and bounded idle values', () => {
  assert.deepEqual(normalizeLifecycleConfig(), { enabled: false, idleMinutes: 10 });
  assert.deepEqual(normalizeLifecycleConfig({ enabled: 'true', idleMinutes: -1 }), { enabled: false, idleMinutes: 10 });
  assert.equal(normalizeLifecycleConfig({ enabled: true, idleMinutes: 0 }).idleMinutes, 0);
});

test('launch arguments preserve quoted Windows paths without shell expansion', () => {
  assert.deepEqual(splitLaunchArgs('--base-directory "C:\\My Models\\ComfyUI" --enable-manager'), ['--base-directory', 'C:\\My Models\\ComfyUI', '--enable-manager']);
  assert.deepEqual(splitLaunchArgs('--name "$(echo test)"'), ['--name', '$(echo test)']);
  assert.throws(() => splitLaunchArgs('"unterminated'), /unclosed quote/);
});

test('managed plan refuses remote, TLS, IPv6 and arbitrary portable/service launchers', () => {
  for (const url of ['http://192.168.1.5:8188', 'https://127.0.0.1:8188', 'http://[::1]:8188', 'not a URL']) {
    assert.equal(managedLaunchPlan({ comfy: { url } }).supported, false);
  }
  for (const kind of ['portable', 'service']) {
    assert.equal(managedLaunchPlan({ comfy: { url: 'http://127.0.0.1:8188' } }, {
      startStatus: () => ({ kind, mainPy: '/main.py', pythonPath: '/python' }),
    }).supported, false);
  }
});

test('registered Desktop plan preserves adopted data and custom flags, forcing the chosen local endpoint', () => {
  const plan = managedLaunchPlan({ comfy: { url: 'http://127.0.0.1:8161' } }, {
    platform: 'win32', pathApi: path.win32,
    startStatus: () => ({ kind: 'desktop', basePath: 'C:\\Source', mainPy: 'C:\\Source\\main.py', pythonPath: 'C:\\Data\\.venv\\Scripts\\python.exe', port: 8161 }),
    desktopRecordForBase: () => ({ adoptedBaseDir: 'C:\\User Data', launchArgs: '--port 8188 --listen 0.0.0.0 --enable-manager --auto-launch --extra-model-paths-config "C:\\Model Paths.yaml"' }),
  });
  assert.equal(plan.supported, true);
  assert.equal(plan.cwd, 'C:\\Source');
  assert.deepEqual(plan.args, ['C:\\Source\\main.py', '--enable-manager', '--extra-model-paths-config', 'C:\\Model Paths.yaml', '--port', '8161', '--base-directory', 'C:\\User Data', '--listen', '127.0.0.1', '--disable-auto-launch']);
});

test('macOS source launch retains the supported Python and MPS settings', () => {
  const plan = managedLaunchPlan({ comfy: { url: 'http://127.0.0.1:8188' } }, {
    platform: 'darwin', startStatus: () => ({ kind: 'python', mainPy: '/ComfyUI/main.py', pythonPath: '/ComfyUI/.venv/bin/python', port: 8188 }),
  });
  assert.equal(plan.env.PYTORCH_ENABLE_MPS_FALLBACK, '1');
  assert.ok(plan.args.includes('--fp32-vae'));
});

test('disabled and Stable modes never launch or query the backend', async () => {
  for (const field of ['enabled', 'available']) {
    const { state, controller } = fixture(); state[field] = false;
    await controller.ensure(); await controller.tick();
    assert.equal(state.spawns.length, 0); assert.equal(state.calls.length, 0);
  }
});

test('concurrent generation startup launches only one directly owned child', async () => {
  const { state, controller } = fixture();
  await Promise.all([controller.ensure(), controller.ensure(), controller.ensure()]);
  assert.equal(state.spawns.length, 1); assert.equal(controller.status().owned, true);
  assert.equal(state.spawns[0][2].shell, false);
  state.busy = true;
  await controller.ensure(); // Adding work to our already-running backend is allowed.
  assert.equal(state.spawns.length, 1);
});

test('pre-existing backends are shared; neither unload nor stop touches them', async () => {
  const { state, controller, advance } = fixture(); state.listener = [81];
  await controller.ensure(); advance(3600000); await controller.tick();
  await assert.rejects(controller.stop(), /Only a ComfyUI process/);
  assert.equal(controller.status().phase, 'shared'); assert.equal(state.spawns.length, 0);
  assert.deepEqual(state.calls.map((x) => x.route), ['/system_stats']);
});

test('occupied but unresponsive port is never replaced', async () => {
  const { state, controller } = fixture({ request: async () => { throw new Error('unresponsive'); } });
  state.listener = [81];
  await assert.rejects(controller.ensure(), /unresponsive/); assert.equal(state.spawns.length, 0);
});

test('idle unload uses only /free and runs once until another generation', async () => {
  const { state, controller, advance } = fixture();
  await controller.ensure(); advance(599999); assert.equal(await controller.tick(), false);
  advance(1); assert.equal(await controller.tick(), true); await controller.tick();
  const frees = state.calls.filter((x) => x.route === '/free');
  assert.equal(frees.length, 1); assert.deepEqual(frees[0].body, { unload_models: true, free_memory: true });
  await controller.ensure(); advance(600000); assert.equal(await controller.tick(), true);
  assert.equal(state.kills.length, 0);
});

test('queued work, local preflights, and malformed queues all prevent cleanup', async () => {
  const { state, controller, advance } = fixture(); await controller.ensure();
  for (const queue of [{ queue_running: [[1]], queue_pending: [] }, { queue_running: [], queue_pending: [[2]] }, {}]) {
    state.queue = queue; advance(600000); assert.equal(await controller.tick(), false);
    await assert.rejects(controller.stop(), /busy|verify/);
  }
  state.queue = { queue_running: [], queue_pending: [] }; state.busy = true;
  advance(600000); assert.equal(await controller.tick(), false);
  await assert.rejects(controller.stop(), /busy/);
  assert.equal(state.calls.filter((x) => x.route === '/free').length, 0); assert.equal(state.kills.length, 0);
});

test('in-flight request reservations block cleanup until work preparation completes', async () => {
  const { state, controller, advance } = fixture(); await controller.ensure();
  const done = controller.reserve(); advance(600000); await controller.tick();
  await assert.rejects(controller.stop(), /busy/);
  done(); done(); advance(600000); assert.equal(await controller.tick(), true);
  assert.equal(controller.status().busy, false);
  assert.equal(state.kills.length, 0);
});

test('port replacement or child exit revokes cleanup permission', async () => {
  for (const replace of [true, false]) {
    const { state, controller, advance } = fixture(); await controller.ensure();
    if (replace) state.listener = [99]; else { state.child.exitCode = 0; state.child.emit('exit', 0); }
    advance(600000); await controller.tick(); await assert.rejects(controller.stop(), /Only a ComfyUI process/);
    assert.equal(state.kills.length, 0); assert.equal(state.calls.filter((x) => x.route === '/free').length, 0);
  }
});

test('stop sends a signal only to the retained verified child and blocks new work while stopping', async () => {
  const { state, controller } = fixture(); await controller.ensure();
  await controller.stop(); assert.deepEqual(state.kills, ['SIGTERM']);
  await assert.rejects(controller.ensure(), /stopping/);
  state.child.exitCode = 0; state.child.emit('exit', 0);
  assert.equal(controller.status().owned, false);
});

test('disabling management leaves the child alive and permits an explicit idle stop', async () => {
  const { state, controller, advance } = fixture(); await controller.ensure();
  state.enabled = false; advance(600000); await controller.tick(); assert.equal(state.kills.length, 0);
  await controller.stop(); assert.deepEqual(state.kills, ['SIGTERM']);
});

test('startup errors are handled without an unhandled child error or a port-based kill', async () => {
  const { state, controller } = fixture({ spawn: () => {
    const child = new EventEmitter();
    Object.assign(child, { exitCode: null, signalCode: null, unref() {} });
    queueMicrotask(() => child.emit('error', new Error('Python missing')));
    return child;
  } });
  await assert.rejects(controller.ensure(), /Python missing/); assert.equal(state.kills.length, 0);
});

test('queue lookup failures fail closed and surface diagnostics', async () => {
  const { state, controller, advance } = fixture({ request: async (url, route) => {
    if (route === '/queue') throw new Error('Queue unreachable'); return {};
  } });
  await controller.ensure(); advance(600000); assert.equal(await controller.tick(), false);
  assert.match(controller.status().error, /Queue unreachable/);
  await assert.rejects(controller.stop(), /Queue unreachable/); assert.equal(state.kills.length, 0);
});

test('a reservation arriving during the queue check prevents a stop', async () => {
  let releaseQueue, signalQueue;
  const queueEntered = new Promise((resolve) => { signalQueue = resolve; });
  const { state, controller } = fixture({ request: async (url, route) => {
    if (route === '/queue') { signalQueue(); await new Promise((resolve) => { releaseQueue = resolve; }); return { queue_running: [], queue_pending: [] }; }
    return {};
  } });
  await controller.ensure(); const stopping = controller.stop(); await queueEntered;
  const done = controller.reserve(); releaseQueue();
  await assert.rejects(stopping, /busy/); done(); assert.equal(state.kills.length, 0);
});

test('Windows venv listener must be the known launcher’s direct ComfyUI child', async () => {
  let parent = 42, command = 'python C:\\ComfyUI\\main.py';
  const calls = [];
  const { state, controller } = fixture({ platform: 'win32',
    plan: () => ({ supported: true, executable: 'C:\\ComfyUI\\.venv\\Scripts\\python.exe', mainPy: 'C:\\ComfyUI\\main.py',
      basePath: 'C:\\ComfyUI', args: [], url: 'http://127.0.0.1:8188', port: 8188 }),
    processInfo: async () => ({ ParentProcessId: parent, CommandLine: command }),
    execFile: (file, args, options, callback) => { calls.push({ file, args }); callback(null); },
  });
  await controller.ensure(); state.listener = [43];
  parent = 99; await assert.rejects(controller.stop(), /Only a ComfyUI process/);
  parent = 42; command = 'python unrelated.py'; await assert.rejects(controller.stop(), /Only a ComfyUI process/);
  command = 'python C:\\ComfyUI\\main.py'; await controller.stop();
  assert.deepEqual(calls, [{ file: 'taskkill', args: ['/PID', '42', '/T', '/F'] }]);
});
