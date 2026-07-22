'use strict';

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const {
  comfyDesktopInstallations,
  desktopRecordIsInstalled,
  findComfyBase,
  findComfyPython,
  findPartialComfyBase,
} = require('./sam3-installer');
const { isLoopbackUrl } = require('./comfy-discovery');

function comfyPort(urlValue) {
  try {
    const url = new URL(String(urlValue || 'http://127.0.0.1:8188'));
    return Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  } catch {
    return 8188;
  }
}

function samePath(left, right, pathApi = path) {
  if (!left || !right) return false;
  const a = pathApi.resolve(String(left));
  const b = pathApi.resolve(String(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function findComfyDesktopApp(options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const pathApi = options.pathApi || path;
  const candidates = [
    env.COMFY_DESKTOP_EXE,
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.ProgramFiles ? pathApi.join(env.ProgramFiles, 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env['ProgramFiles(x86)'] ? pathApi.join(env['ProgramFiles(x86)'], 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', 'ComfyUI', 'ComfyUI.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', '@comfyorgcomfyui-electron', 'ComfyUI.exe') : '',
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) || '';
}

function desktopRecordForBase(basePath, options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  return comfyDesktopInstallations(env, fsImpl, pathApi).find((record) => {
    if (!desktopRecordIsInstalled(record)) return false;
    const installPath = String(record.installPath || '').trim();
    const sourcePath = installPath ? pathApi.join(installPath, 'ComfyUI') : '';
    const dataPath = String(record.adoptedBaseDir || '').trim() || sourcePath;
    return samePath(basePath, sourcePath, pathApi) || samePath(basePath, dataPath, pathApi);
  }) || null;
}

function findPortableRunScript(basePath, options = {}) {
  if (!basePath) return '';
  const existsSync = options.existsSync || fs.existsSync;
  const pathApi = options.pathApi || path;
  const roots = [basePath, pathApi.dirname(basePath)];
  const scripts = [
    'run_nvidia_gpu.bat',
    'run_amd_gpu.bat',
    'run_intel_gpu.bat',
    'run_nvidia_gpu_fast_fp16_accumulation.bat',
    'run.bat',
  ];
  for (const root of roots) {
    for (const script of scripts) {
      const candidate = pathApi.join(root, script);
      if (existsSync(candidate)) return candidate;
    }
  }
  return '';
}

function startStatus(runtime, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const platform = options.platform || process.platform;
  const pathApi = options.pathApi || path;
  const detectedBase = findComfyBase(runtime, options);
  const partialBase = detectedBase ? '' : findPartialComfyBase(runtime, options);
  const configuredBase = String(runtime.comfy?.path || '').trim();
  const basePath = detectedBase || (configuredBase && existsSync(configuredBase) ? configuredBase : '');
  const desktopApp = findComfyDesktopApp(options);
  const desktopRecord = desktopRecordForBase(basePath || partialBase, options);
  const runScript = desktopRecord ? '' : findPortableRunScript(basePath, options);
  const sourceBase = desktopRecord && desktopRecord.installPath
    ? pathApi.join(String(desktopRecord.installPath), 'ComfyUI')
    : basePath;
  const mainCandidates = [
    sourceBase ? pathApi.join(sourceBase, 'main.py') : '',
    basePath ? pathApi.join(basePath, 'main.py') : '',
    basePath ? pathApi.join(basePath, 'ComfyUI', 'main.py') : '',
  ];
  const mainPy = mainCandidates.find((candidate) => candidate && existsSync(candidate)) || '';
  const pythonPath = findComfyPython(basePath || sourceBase, options);
  let kind = '';
  if (desktopRecord) kind = 'desktop';
  else if (runScript) kind = 'portable';
  else if (mainPy && pythonPath) kind = 'python';
  else if (desktopApp) kind = 'desktop';
  const canStart = platform === 'win32' && !!kind;
  const installationName = String(desktopRecord?.name || desktopRecord?.id || '').trim();
  return {
    canStart,
    kind,
    basePath,
    partialPath: partialBase,
    pythonPath,
    runScript,
    mainPy,
    desktopApp,
    installationName,
    requiresUserAction: kind === 'desktop',
    port: comfyPort(runtime.comfy && runtime.comfy.url),
    reason: platform !== 'win32'
      ? 'ComfyUI can be started from the Windows generation computer.'
      : (!kind
        ? 'Mix Studio could not find a Comfy Desktop app, portable launch script, or runnable ComfyUI source folder.'
        : ''),
  };
}

async function startComfy(runtime, report = () => {}, options = {}) {
  const status = startStatus(runtime, options);
  if (!status.canStart) {
    const error = new Error(status.reason || 'ComfyUI cannot be started automatically from this installation.');
    error.code = 'comfy_start_unavailable';
    throw error;
  }
  report('opening', status.kind === 'desktop'
    ? 'Opening Comfy Desktop. Mix Studio will connect after the installation starts…'
    : 'Starting ComfyUI. Mix Studio is looking for its local port…');
  if (options.spawn) {
    options.spawn(status);
  } else if (status.kind === 'desktop') {
    const child = status.desktopApp
      ? spawn(status.desktopApp, [], { cwd: path.dirname(status.desktopApp), detached: true, windowsHide: true, stdio: 'ignore' })
      : spawn(path.join(String((options.env || process.env).SystemRoot || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
        '-NoProfile', '-Command',
        "$app = Get-StartApps | Where-Object { $_.Name -match '^Comfy (Desktop|UI)$' } | Select-Object -First 1; if (-not $app) { exit 2 }; Start-Process ('shell:AppsFolder\\' + $app.AppID)",
      ], { detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
  } else if (status.runScript) {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', status.runScript], { cwd: path.dirname(status.runScript), detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
  } else {
    const child = spawn(status.pythonPath, [status.mainPy, '--port', String(status.port)], { cwd: path.dirname(status.mainPy), detached: true, windowsHide: true, stdio: 'ignore' });
    child.unref();
  }
  report('discovering', 'Waiting for ComfyUI to report its local address…');
  return status;
}

function restartStatus(runtime, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const platform = options.platform || process.platform;
  const detectedBase = findComfyBase(runtime, options);
  const configuredBase = String(runtime.comfy?.path || '').trim();
  const configuredRunnable = configuredBase && existsSync(configuredBase) && [
    path.join(configuredBase, 'run_nvidia_gpu.bat'),
    path.join(configuredBase, 'run.bat'),
    path.join(configuredBase, 'main.py'),
  ].some((candidate) => existsSync(candidate));
  const basePath = detectedBase || (configuredRunnable ? configuredBase : '');
  const configuredUrl = String(runtime.comfy?.url || '').trim();
  const localUrl = !configuredUrl || isLoopbackUrl(configuredUrl);
  const desktopRecord = desktopRecordForBase(basePath, options);
  const pythonPath = findComfyPython(basePath, options);
  const runScript = findPortableRunScript(basePath, options);
  const mainPy = basePath ? path.join(basePath, 'main.py') : '';
  const canRestart = platform === 'win32' && localUrl && !desktopRecord && !!basePath
    && (!!runScript || (!!pythonPath && existsSync(mainPy)));
  return {
    canRestart,
    kind: desktopRecord ? 'desktop' : (runScript ? 'portable' : (mainPy && pythonPath ? 'python' : '')),
    basePath,
    pythonPath,
    runScript,
    mainPy: existsSync(mainPy) ? mainPy : '',
    port: comfyPort(runtime.comfy && runtime.comfy.url),
    reason: platform !== 'win32'
      ? 'ComfyUI restart is available from the Windows desktop that runs generation.'
      : (!localUrl
        ? 'Mix Studio will not restart a ComfyUI server configured on another computer.'
        : (desktopRecord
          ? 'Restart this installation from Comfy Desktop so its managed environment and port remain consistent.'
          : (!basePath ? 'Set the ComfyUI folder in install_MixStudio.bat before restarting from Mix Studio.'
            : 'Mix Studio could not find run_nvidia_gpu.bat or main.py in the configured ComfyUI folder.'))),
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

async function processInfoForPid(pid, options = {}) {
  if (typeof options.processInfo === 'function') return options.processInfo(pid);
  const runCommand = options.run || run;
  const env = options.env || process.env;
  const systemRoot = String(env.SystemRoot || 'C:\\Windows');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = `Get-CimInstance Win32_Process -Filter "ProcessId = ${Number(pid)}" | Select-Object ProcessId,ExecutablePath,CommandLine,ParentProcessId | ConvertTo-Json -Compress`;
  const output = await runCommand(powershell, ['-NoProfile', '-Command', script]);
  if (!String(output || '').trim()) return null;
  const parsed = JSON.parse(String(output));
  return Array.isArray(parsed) ? (parsed[0] || null) : parsed;
}

function normalizedCommandValue(value) {
  return String(value || '').trim().replace(/\\/g, '/').toLowerCase();
}

function isExpectedComfyProcess(info, status, options = {}) {
  if (!info || typeof info !== 'object') return false;
  const pathApi = options.pathApi || path;
  const command = normalizedCommandValue(info.CommandLine || info.commandLine);
  const executable = normalizedCommandValue(info.ExecutablePath || info.executablePath);
  const mainPy = normalizedCommandValue(status.mainPy);
  const basePath = normalizedCommandValue(status.basePath);
  const pythonPath = normalizedCommandValue(status.pythonPath);
  const commandRunsMain = /(?:^|[\s"'])[^\s"']*main\.py(?:[\s"']|$)/i.test(command);
  if (!commandRunsMain) return false;
  const commandMatchesPath = (mainPy && command.includes(mainPy)) || (basePath && command.includes(basePath));
  let executableMatches = false;
  if (pythonPath && executable) {
    try { executableMatches = samePath(executable, pythonPath, pathApi); } catch { executableMatches = executable === pythonPath; }
  }
  return commandMatchesPath || executableMatches;
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
  let pids;
  try {
    pids = await pidsListeningOn(status.port, { run: runCommand });
  } catch (cause) {
    const error = new Error('Mix Studio could not verify which process owns the ComfyUI port. Nothing was stopped.');
    error.code = 'comfy_restart_listener_query_failed';
    error.cause = cause;
    throw error;
  }
  const verified = [];
  for (const pid of pids) {
    const info = await processInfoForPid(pid, Object.assign({}, options, { run: runCommand })).catch(() => null);
    if (!isExpectedComfyProcess(info, status, options)) {
      const error = new Error(`Port ${status.port} is owned by a process that Mix Studio cannot verify as this ComfyUI installation. Nothing was stopped.`);
      error.code = 'comfy_restart_listener_mismatch';
      throw error;
    }
    verified.push(pid);
  }
  for (const pid of verified) await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
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
  desktopRecordForBase,
  findComfyDesktopApp,
  findPortableRunScript,
  isExpectedComfyProcess,
  pidsListeningOn,
  processInfoForPid,
  restartComfy,
  restartStatus,
  startComfy,
  startStatus,
};
