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

/*
 * Linux has no fixed install path for the Desktop AppImage, but launchers
 * register XDG desktop entries. The entry whose StartupWMClass names the
 * Desktop app (comfyui-desktop-2) carries the user's real launch command,
 * including any wrapper script with GPU workarounds.
 */
function findComfyDesktopEntryCommand(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  const home = String(options.home || env.HOME || '').trim();
  const dirs = [
    String(env.XDG_DATA_HOME || '').trim() ? pathApi.join(String(env.XDG_DATA_HOME).trim(), 'applications') : '',
    home ? pathApi.join(home, '.local', 'share', 'applications') : '',
    '/usr/share/applications',
    home ? pathApi.join(home, 'Desktop') : '',
  ].filter(Boolean);
  for (const dir of dirs) {
    let names = [];
    try { names = fsImpl.readdirSync(dir); } catch { continue; }
    for (const name of names.filter((entry) => /\.desktop$/i.test(entry))) {
      let text = '';
      try { text = fsImpl.readFileSync(pathApi.join(dir, name), 'utf8'); } catch { continue; }
      if (!/^StartupWMClass=comfyui-desktop/im.test(text) && !/^Name=Comfy(?:UI)? Desktop\s*$/im.test(text)) continue;
      const exec = text.match(/^Exec=(.+)$/im);
      if (!exec) continue;
      const command = exec[1].replace(/%[a-zA-Z]/g, '').trim();
      if (command) return command;
    }
  }
  return '';
}

function findComfyDesktopApp(options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const pathApi = options.pathApi || path;
  const platform = options.platform || process.platform;
  const home = String(options.home || env.HOME || '').trim();
  const candidates = platform === 'darwin' ? [
    env.COMFY_DESKTOP_EXE,
    '/Applications/ComfyUI.app',
    home ? pathApi.join(home, 'Applications', 'ComfyUI.app') : '',
  ] : platform === 'win32' ? [
    env.COMFY_DESKTOP_EXE,
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.ProgramFiles ? pathApi.join(env.ProgramFiles, 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env['ProgramFiles(x86)'] ? pathApi.join(env['ProgramFiles(x86)'], 'Comfy Desktop', 'Comfy Desktop.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', 'ComfyUI', 'ComfyUI.exe') : '',
    env.LOCALAPPDATA ? pathApi.join(env.LOCALAPPDATA, 'Programs', '@comfyorgcomfyui-electron', 'ComfyUI.exe') : '',
  ] : [
    env.COMFY_DESKTOP_EXE,
    '/usr/bin/comfyui-desktop',
    '/usr/local/bin/comfyui-desktop',
    '/opt/ComfyUI/comfyui-desktop',
    home ? pathApi.join(home, '.local', 'bin', 'comfyui-desktop') : '',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate)) || '';
  if (found || platform === 'win32' || platform === 'darwin') return found;
  const entryCommand = findComfyDesktopEntryCommand(options);
  if (!entryCommand) return '';
  const executable = (entryCommand.match(/^"([^"]+)"|^(\S+)/) || []).slice(1).find(Boolean) || '';
  return executable && existsSync(executable) ? entryCommand : '';
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
  // Desktop installations must be opened through their app so the managed
  // environment and port stay consistent; without a launchable app binary the
  // user has to open it themselves.
  const desktopUnlaunchable = kind === 'desktop' && platform !== 'win32' && !desktopApp;
  const canStart = !!kind && !desktopUnlaunchable;
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
    reason: desktopUnlaunchable
      ? 'Open the ComfyUI Desktop app to start this installation, then Mix Studio will connect to it.'
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
  const platform = options.platform || process.platform;
  if (options.spawn) {
    options.spawn(status);
  } else if (status.kind === 'desktop') {
    let child;
    if (status.desktopApp && platform === 'darwin') {
      child = spawn('open', [status.desktopApp], { detached: true, stdio: 'ignore' });
    } else if (status.desktopApp && platform !== 'win32') {
      // The launch command can come from an XDG desktop entry and carry
      // arguments, so it runs through the shell rather than as a bare path.
      child = spawn('/bin/sh', ['-c', status.desktopApp], { detached: true, stdio: 'ignore' });
    } else if (status.desktopApp) {
      child = spawn(status.desktopApp, [], { cwd: path.dirname(status.desktopApp), detached: true, windowsHide: true, stdio: 'ignore' });
    } else {
      child = spawn(path.join(String((options.env || process.env).SystemRoot || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), [
        '-NoProfile', '-Command',
        "$app = Get-StartApps | Where-Object { $_.Name -match '^Comfy (Desktop|UI)$' } | Select-Object -First 1; if (-not $app) { exit 2 }; Start-Process ('shell:AppsFolder\\' + $app.AppID)",
      ], { detached: true, windowsHide: true, stdio: 'ignore' });
    }
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
  const canRestart = localUrl && !desktopRecord && !!basePath
    && (!!runScript || (!!pythonPath && existsSync(mainPy)));
  return {
    canRestart,
    kind: desktopRecord ? 'desktop' : (runScript ? 'portable' : (mainPy && pythonPath ? 'python' : '')),
    basePath,
    pythonPath,
    runScript,
    mainPy: existsSync(mainPy) ? mainPy : '',
    port: comfyPort(runtime.comfy && runtime.comfy.url),
    reason: !localUrl
      ? 'Mix Studio will not restart a ComfyUI server configured on another computer.'
      : (desktopRecord
        ? 'Restart this installation from the Comfy Desktop app so its managed environment and port remain consistent.'
        : (!basePath ? 'Set the ComfyUI folder in Mix Studio setup before restarting from Mix Studio.'
          : (platform === 'win32'
            ? 'Mix Studio could not find run_nvidia_gpu.bat or main.py in the configured ComfyUI folder.'
            : 'Mix Studio could not find a runnable main.py and Python environment in the configured ComfyUI folder.'))),
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
  const platform = options.platform || process.platform;
  const matches = new Set();
  if (platform !== 'win32') {
    // lsof works on Linux and macOS; ss covers Linux hosts without lsof.
    try {
      const out = await runCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']);
      for (const line of String(out).split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isInteger(pid) && pid > 0) matches.add(pid);
      }
      return [...matches];
    } catch { /* fall through to ss */ }
    const out = await runCommand('ss', ['-ltnp']);
    const expression = new RegExp(`[\\s:\\]]${port}\\s`);
    for (const line of String(out).split(/\r?\n/)) {
      if (!expression.test(line)) continue;
      for (const matched of line.matchAll(/pid=(\d+)/g)) {
        const pid = Number(matched[1]);
        if (Number.isInteger(pid) && pid > 0) matches.add(pid);
      }
    }
    return [...matches];
  }
  const out = await runCommand('netstat', ['-ano', '-p', 'tcp']);
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
  const platform = options.platform || process.platform;
  if (platform !== 'win32') {
    const output = await runCommand('ps', ['-p', String(Number(pid)), '-o', 'pid=,ppid=,args=']);
    const line = String(output || '').trim().split(/\r?\n/)[0] || '';
    const matched = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!matched) return null;
    let executablePath = '';
    try { executablePath = fs.readlinkSync(`/proc/${Number(pid)}/exe`); } catch { /* macOS has no /proc */ }
    return {
      ProcessId: Number(matched[1]),
      ParentProcessId: Number(matched[2]),
      CommandLine: matched[3],
      ExecutablePath: executablePath,
    };
  }
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
  const platform = options.platform || process.platform;
  report('stopping', 'Stopping the ComfyUI process…');
  let pids;
  try {
    pids = await pidsListeningOn(status.port, { run: runCommand, platform });
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
  if (platform === 'win32') {
    for (const pid of verified) await runCommand('taskkill', ['/PID', String(pid), '/T', '/F']);
  } else {
    const kill = options.kill || process.kill;
    for (const pid of verified) { try { kill(pid, 'SIGTERM'); } catch { /* already exited */ } }
    // Give ComfyUI a graceful-shutdown window so the port is free before the
    // replacement starts; escalate only if a process ignores SIGTERM.
    const pause = options.pause || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const deadline = Date.now() + 8000;
    let remaining = verified;
    while (remaining.length && Date.now() < deadline) {
      await pause(500);
      remaining = await pidsListeningOn(status.port, { run: runCommand, platform }).catch(() => []);
    }
    for (const pid of remaining) { try { kill(pid, 'SIGKILL'); } catch { /* already exited */ } }
  }
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
  findComfyDesktopEntryCommand,
  findPortableRunScript,
  isExpectedComfyProcess,
  pidsListeningOn,
  processInfoForPid,
  restartComfy,
  restartStatus,
  startComfy,
  startStatus,
};
