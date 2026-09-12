'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { startStatus, desktopRecordForBase, pythonLaunchArgs, pythonLaunchEnvironment, pidsListeningOn, processInfoForPid, isExpectedComfyProcess } = require('./comfy-restart');
const { isLoopbackUrl } = require('./comfy-discovery');

// Desktop stores arguments as text. Parse only plain quoted words; never use a shell.
function splitLaunchArgs(value) {
  const tokens = [];
  let word = '', quote = '', present = false;
  for (const char of String(value || '')) {
    if (quote) {
      if (char === quote) quote = '';
      else word += char;
      present = true;
    } else if (char === '"' || char === "'") { quote = char; present = true; }
    else if (/\s/.test(char)) { if (present) tokens.push(word); word = ''; present = false; }
    else { word += char; present = true; }
  }
  if (quote) throw new Error('The saved Desktop launch arguments have an unclosed quote.');
  if (present) tokens.push(word);
  return tokens;
}

function managedLaunchPlan(runtime, options = {}) {
  const url = String(runtime.comfy?.url || '');
  const unavailable = (reason) => ({ supported: false, reason });
  if (!isLoopbackUrl(url) || new URL(url).protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    return unavailable('Managed startup requires a local HTTP ComfyUI address.');
  }
  const status = (options.startStatus || startStatus)(runtime, options);
  if (!status.mainPy || !status.pythonPath || !['python', 'desktop'].includes(status.kind)) {
    return unavailable('This Preview supports detected Python installations and registered Desktop instances. Portable scripts and services still use Start ComfyUI.');
  }
  const platform = options.platform || process.platform;
  const pathApi = options.pathApi || path;
  let args = pythonLaunchArgs(status, platform);
  if (status.kind === 'desktop') {
    const record = (options.desktopRecordForBase || desktopRecordForBase)(status.basePath, options);
    if (!record) return unavailable('The Desktop installation does not expose a direct Python launch configuration.');
    try {
      const saved = splitLaunchArgs(record.launchArgs);
      if (saved.includes('--')) return unavailable('Desktop launch arguments containing -- are not supported by managed startup.');
      // These affect the endpoint, working directories or process behavior. Keep
      // the known Desktop base and the address selected in Mix Studio explicit.
      const remaining = [];
      for (let i = 0; i < saved.length; i++) {
        const flag = saved[i].split('=')[0];
        if (['--listen', '--port', '--base-directory'].includes(flag)) {
          if (!saved[i].includes('=') && saved[i + 1] && !saved[i + 1].startsWith('--')) i++;
        } else if (!['--auto-launch', '--disable-auto-launch'].includes(flag)) remaining.push(saved[i]);
      }
      if (record.useSharedInput || record.useSharedOutput) {
        return unavailable('This Desktop instance uses shared input/output folders. Use Desktop to start it until managed startup supports those shared-folder settings.');
      }
      args = ['-s', status.mainPy, ...remaining, '--port', String(status.port)];
      const base = record.adoptedBaseDir || status.basePath;
      if (base) {
        args.push('--base-directory', base);
        if (!remaining.some((arg) => arg.split('=')[0] === '--user-directory')) args.push('--user-directory', pathApi.join(base, 'user'));
        if (!remaining.some((arg) => arg.split('=')[0] === '--database-url')) args.push('--database-url', 'sqlite:///' + pathApi.join(base, 'user', 'comfyui.db'));
      }
      if (record.inputDir) args.push('--input-directory', String(record.inputDir));
      if (record.outputDir) args.push('--output-directory', String(record.outputDir));
      // Desktop generates model roots outside launchArgs. Reuse its own file
      // rather than guessing where shared models live or copying model files.
      const env = options.env || process.env;
      const appData = platform === 'win32' ? env.APPDATA
        : (env.XDG_CONFIG_HOME || pathApi.join(options.home || os.homedir(), '.config'));
      const instanceId = String(record.id || '');
      const modelConfig = appData && /^[A-Za-z0-9_-]+$/.test(instanceId)
        ? pathApi.join(appData, 'Comfy Desktop', 'instance-model-paths', instanceId + '.yaml') : '';
      if (modelConfig && (options.existsSync || fs.existsSync)(modelConfig)) args.push('--extra-model-paths-config', modelConfig);
      else if (record.useSharedModels) return unavailable('Desktop shared model paths are missing. Open this instance in Desktop once before enabling managed startup.');
    } catch (error) { return unavailable(error.message); }
  }
  args.push('--listen', '127.0.0.1', '--disable-auto-launch');
  return { supported: true, reason: '', url: url.replace(/\/$/, ''), port: status.port,
    executable: status.pythonPath, mainPy: status.mainPy, basePath: status.basePath, args, cwd: pathApi.dirname(status.mainPy),
    env: pythonLaunchEnvironment(platform, options.env || process.env) };
}

function normalizeLifecycleConfig(value = {}) {
  return { enabled: value.enabled === true,
    idleMinutes: [0, 5, 10, 30, 60].includes(value.idleMinutes) ? value.idleMinutes : 10 };
}

function createComfyLifecycle(options) {
  const platform = options.platform || process.platform;
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const listeners = options.listeners || pidsListeningOn;
  const request = options.request || (async (url, route, body) => {
    const response = await fetch(url + route, { signal: AbortSignal.timeout(5000),
      ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`ComfyUI ${route} returned ${response.status}`);
    return route === '/free' ? null : response.json();
  });
  let child = null, target = null, phase = 'idle', error = '', lastActivity = now(), released = false;
  let tail = Promise.resolve(), reservations = 0;
  const serial = (fn) => { const next = tail.then(fn); tail = next.catch(() => {}); return next; };
  const alive = () => child && child.exitCode === null && child.signalCode === null;
  const config = () => normalizeLifecycleConfig(options.config());
  const active = () => options.available() && config().enabled;
  const busy = () => reservations > 0 || options.busy();
  const touch = () => { lastActivity = now(); released = false; };
  async function ownsListener() {
    if (!alive() || !target) return false;
    const ids = await listeners(target.port);
    if (ids.length !== 1) return false;
    if (ids[0] === child.pid) return true;
    // Windows .venv/python.exe is a redirector. Accept only its immediate
    // Python child with the exact ComfyUI main path, never another port owner.
    if (platform !== 'win32') return false;
    const launcher = child;
    const info = await (options.processInfo || processInfoForPid)(ids[0]);
    return child === launcher && alive() && Number(info?.ParentProcessId) === launcher.pid
      && isExpectedComfyProcess(info, { ...target, pythonPath: target.executable }, { platform });
  }
  async function idle() {
    if (busy()) return false;
    const queue = await request(target.url, '/queue');
    // A failed or malformed queue response is never permission to stop/free.
    if (!Array.isArray(queue?.queue_running) || !Array.isArray(queue?.queue_pending)) throw new Error('Could not verify the ComfyUI queue.');
    return !queue.queue_running.length && !queue.queue_pending.length && !busy();
  }
  function status() {
    const plan = options.plan();
    return { available: options.available(), ...config(), active: active(), supported: plan.supported,
      reason: plan.reason, phase, owned: !!alive(), released, error,
      busy: busy(), canStop: !!alive() && !busy(), lastActivity };
  }
  async function ensure() {
    return serial(async () => {
      if (!active()) return status();
      const plan = options.plan();
      if (!plan.supported) throw new Error(plan.reason);
      touch();
      if (alive()) {
        if (phase === 'stopping') throw new Error('ComfyUI is stopping. Wait before starting another generation.');
        if (!(await ownsListener())) throw new Error('The managed process no longer owns the configured ComfyUI port.');
        await request(target.url, '/system_stats');
        phase = 'running'; error = '';
        return status();
      }
      // Never start on an occupied port, including an unresponsive service.
      if ((await listeners(plan.port)).length) {
        await request(plan.url, '/system_stats');
        phase = 'shared'; error = ''; return status();
      }
      if (!active()) return status();
      if ((options.launchBusy || options.busy)()) throw new Error('Wait for the current generation or desktop operation to finish.');
      phase = 'starting'; error = ''; target = plan;
      try {
        const launched = (options.spawn || spawn)(plan.executable, plan.args, {
          cwd: plan.cwd, shell: false, detached: true, windowsHide: true,
          stdio: 'ignore', env: { ...process.env, ...plan.env },
        });
        child = launched;
        launched.on('error', (err) => { if (child === launched) { error = err.message; phase = 'error'; child = null; } });
        launched.on('exit', (code) => {
          if (child === launched) {
            if (phase === 'starting') error = `ComfyUI exited during startup (code ${code}). Check its Python environment and launch arguments.`;
            child = null; phase = error ? 'error' : 'stopped';
          }
        });
        launched.unref();
        const deadline = now() + (options.startTimeoutMs || 180000);
        while (alive() && now() < deadline) {
          if (await ownsListener()) {
            try { await request(plan.url, '/system_stats'); phase = 'running'; touch(); return status(); }
            catch { /* Python may bind before all routes are ready. */ }
          }
          await sleep(500);
        }
        throw new Error(error || 'ComfyUI did not become ready within three minutes. Check its Python environment and launch configuration.');
      } catch (err) {
        // Do not kill an unverified process after a partial startup. Keep the
        // child handle so a later readiness check can establish ownership.
        phase = 'error'; error = err.message; throw err;
      }
    });
  }
  async function releaseModels(force = false) {
    return serial(async () => {
      if (!active() || !alive()) return false;
      if (busy()) { touch(); return false; }
      if (!(await ownsListener())) return false;
      if (!(await idle())) { touch(); return false; }
      if (released || (!force && (!config().idleMinutes || now() - lastActivity < config().idleMinutes * 60000))) return false;
      if (!(await ownsListener()) || busy() || !active()) return false;
      await request(target.url, '/free', { unload_models: true, free_memory: true });
      released = true; phase = 'idle'; error = ''; return true;
    });
  }
  async function stop() {
    return serial(async () => {
      if (!(await ownsListener())) throw new Error('Only a ComfyUI process started and verified by this Mix Studio session can be stopped.');
      if (!(await idle())) throw new Error('ComfyUI is busy. Wait for all queued work to finish.');
      if (!(await ownsListener()) || busy()) throw new Error('ComfyUI ownership or queue state changed. Refresh and retry.');
      phase = 'stopping'; error = '';
      try {
        if (platform === 'win32') {
          // The verified launcher must stay alive until invocation. /T also
          // terminates its venv redirector child; killing only the launcher
          // would orphan the Python server. No port-based process selection.
          if (!alive()) throw new Error('The managed launcher already exited.');
          const run = options.execFile || execFile;
          await new Promise((resolve, reject) => run('taskkill', ['/PID', String(child.pid), '/T', '/F'],
            { windowsHide: true, timeout: 10000 }, (err) => err ? reject(err) : resolve()));
        } else if (!child.kill('SIGTERM')) throw new Error('ComfyUI could not be stopped.');
      } catch (err) { phase = 'error'; error = err.message; throw err; }
      return status();
    });
  }
  function reserve() {
    reservations++; touch(); let done = false;
    return () => { if (!done) { done = true; reservations--; touch(); } };
  }
  return { status, ensure, releaseModels, stop, reserve, touch, synchronize: serial,
    tick: () => releaseModels().catch((err) => { error = err.message; return false; }) };
}

module.exports = { splitLaunchArgs, managedLaunchPlan, normalizeLifecycleConfig, createComfyLifecycle };
