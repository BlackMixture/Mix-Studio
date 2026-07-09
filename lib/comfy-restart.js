'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { findComfyBase, findComfyPython } = require('./sam3-installer');

function comfyPort(urlValue) {
  try {
    const url = new URL(String(urlValue || 'http://127.0.0.1:8188'));
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  } catch {
    return 8188;
  }
}

function restartStatus(runtime, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const platform = options.platform || process.platform;
  const basePath = findComfyBase(runtime, options);
  const pythonPath = findComfyPython(basePath, options);
  const runScript = basePath ? [
    path.join(basePath, 'run_nvidia_gpu.bat'),
    path.join(basePath, 'run.bat'),
  ].find((candidate) => existsSync(candidate)) : '';
  const mainPy = basePath ? path.join(basePath, 'main.py') : '';
  const canRestart = platform === 'win32' && !!basePath && (!!runScript || (!!pythonPath && existsSync(mainPy)));
  return {
    canRestart,
    basePath,
    pythonPath,
    runScript,
    mainPy: existsSync(mainPy) ? mainPy : '',
    port: comfyPort(runtime.comfy && runtime.comfy.url),
    reason: platform !== 'win32'
      ? 'ComfyUI restart is available from the Windows desktop that runs generation.'
      : (!basePath ? 'Set the ComfyUI folder in install.bat before restarting from MixBox Studio.'
        : 'MixBox Studio could not find run_nvidia_gpu.bat or main.py in the configured ComfyUI folder.'),
  };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: options.timeout || 30_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve([stdout, stderr].filter(Boolean).join('\n'));
    });
  });
}

async function pidsListeningOn(port, options = {}) {
  const runCommand = options.run || run;
  const out = await runCommand('netstat', ['-ano', '-p', 'tcp']);
  const matches = new Set();
  const expression = new RegExp(`\\s(?:0\\.0\\.0\\.0|127\\.0\\.0\\.1|\\[::\\]|[^\\s:]+):${port}\\s+`, 'i');
  for (const line of String(out).split(/\r?\n/)) {
    if (!expression.test(line) || !/LISTENING/i.test(line)) continue;
    const pid = Number(line.trim().split(/\s+/).at(-1));
    if (Number.isInteger(pid) && pid > 0) matches.add(pid);
  }
  return [...matches];
}

async function restartComfy(runtime, report = () => {}, options = {}) {
  const status = restartStatus(runtime, options);
  if (!status.canRestart) {
    const error = new Error(status.reason || 'ComfyUI cannot be restarted automatically from this installation.');
    error.code = 'comfy_restart_unavailable';
    throw error;
  }
  const runCommand = options.run || run;
  report('stopping', 'Stopping the ComfyUI process…');
  const pids = await pidsListeningOn(status.port, { run: runCommand }).catch(() => []);
  for (const pid of pids) await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
  report('starting', 'Starting ComfyUI…');
  if (options.spawn) {
    options.spawn(status);
  } else if (status.runScript) {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', status.runScript], { cwd: status.basePath, detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
  } else {
    const child = spawn(status.pythonPath, [status.mainPy, '--port', String(status.port)], { cwd: status.basePath, detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
  }
  report('reconnecting', 'Waiting for ComfyUI to come back online…');
  return status;
}

module.exports = {
  comfyPort,
  pidsListeningOn,
  restartComfy,
  restartStatus,
};
