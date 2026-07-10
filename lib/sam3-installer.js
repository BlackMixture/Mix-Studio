'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const SAM3_REPO_URL = 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git';
const SAM3_FOLDER = 'ComfyUI-SAM3';

function readJson(file, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function uniquePaths(values) {
  const seen = new Set();
  return values.filter(Boolean).map((value) => path.resolve(String(value))).filter((value) => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function desktopBasePath(env, fsImpl = fs) {
  const appData = String(env.APPDATA || '').trim();
  if (!appData) return '';
  const config = readJson(path.join(appData, 'ComfyUI', 'config.json'), fsImpl);
  return String(config.basePath || config.base_path || '').trim();
}

function looksLikeComfyBase(dir, existsSync) {
  return existsSync(path.join(dir, 'custom_nodes'))
    || existsSync(path.join(dir, 'models'))
    || existsSync(path.join(dir, '.venv'))
    || existsSync(path.join(dir, 'main.py'));
}

function findComfyBase(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const home = options.home || os.homedir();
  const comfy = runtime.comfy || {};
  const candidates = uniquePaths([
    env.COMFYUI_PATH,
    comfy.path,
    desktopBasePath(env, fsImpl),
    comfy.modelsPath ? path.dirname(comfy.modelsPath) : '',
    path.join(home, 'Documents', 'ComfyUI'),
    path.join(home, 'ComfyUI'),
  ]);
  for (const candidate of candidates) {
    for (const dir of [candidate, path.join(candidate, 'ComfyUI')]) {
      if (existsSync(dir) && looksLikeComfyBase(dir, existsSync)) return dir;
    }
  }
  return '';
}

function findComfyPython(basePath, options = {}) {
  if (!basePath) return '';
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const parent = path.dirname(basePath);
  const candidates = uniquePaths([
    env.COMFYUI_PYTHON,
    path.join(basePath, '.venv', 'Scripts', 'python.exe'),
    path.join(basePath, 'venv', 'Scripts', 'python.exe'),
    path.join(parent, 'python_embeded', 'python.exe'),
    path.join(basePath, 'python_embeded', 'python.exe'),
    path.join(basePath, '.venv', 'bin', 'python'),
    path.join(basePath, 'venv', 'bin', 'python'),
  ]);
  return candidates.find((candidate) => existsSync(candidate)) || '';
}

function findUv(basePath, pythonPath, existsSync = fs.existsSync) {
  const pythonDir = pythonPath ? path.dirname(pythonPath) : '';
  return uniquePaths([
    pythonDir ? path.join(pythonDir, 'uv.exe') : '',
    pythonDir ? path.join(pythonDir, 'uv') : '',
    basePath ? path.join(basePath, 'uv.exe') : '',
    basePath ? path.join(path.dirname(basePath), 'uv.exe') : '',
  ]).find((candidate) => existsSync(candidate)) || '';
}

function sam3InstallStatus(runtime, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const basePath = findComfyBase(runtime, options);
  const pythonPath = findComfyPython(basePath, options);
  const customNodesPath = basePath ? path.join(basePath, 'custom_nodes') : '';
  const nodePath = customNodesPath ? path.join(customNodesPath, SAM3_FOLDER) : '';
  return {
    basePath,
    pythonPath,
    customNodesPath,
    nodePath,
    downloaded: !!nodePath && existsSync(nodePath),
    canInstall: !!basePath && !!pythonPath,
    reason: !basePath
      ? 'Set the existing ComfyUI folder in install.json or run install.bat again.'
      : (!pythonPath ? 'Mix Studio could not find the Python environment used by this ComfyUI installation.' : ''),
  };
}

function execCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      timeout: options.timeout || 30 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: Object.assign({}, process.env, options.env || {}),
    }, (error, stdout, stderr) => {
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      if (!error) return resolve(output);
      const wrapped = new Error((output || error.message || 'Dependency command failed').slice(-2400));
      wrapped.code = error.killed ? 'dependency_timeout' : 'dependency_install_failed';
      reject(wrapped);
    });
  });
}

function isOfficialSam3Remote(value) {
  const normalized = String(value || '').trim().toLowerCase()
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/\.git\/?$/, '')
    .replace(/\/$/, '');
  return normalized === 'https://github.com/pozzettiandrea/comfyui-sam3';
}

async function installSam3(runtime, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const existsSync = options.existsSync || fsImpl.existsSync.bind(fsImpl);
  const run = options.run || execCommand;
  const status = sam3InstallStatus(runtime, Object.assign({}, options, { existsSync, fsImpl }));
  if (!status.canInstall) {
    const error = new Error(status.reason || 'SAM3 cannot be installed automatically');
    error.code = 'sam3_path_missing';
    throw error;
  }
  fsImpl.mkdirSync(status.customNodesPath, { recursive: true });
  const gitDir = path.join(status.nodePath, '.git');
  if (existsSync(status.nodePath) && !existsSync(gitDir)) {
    const error = new Error(`${status.nodePath} already exists but is not a Git checkout. Move it aside and try again.`);
    error.code = 'sam3_folder_conflict';
    throw error;
  }
  if (existsSync(gitDir)) {
    const origin = await run('git', ['-C', status.nodePath, 'remote', 'get-url', 'origin'], { cwd: status.nodePath });
    if (!isOfficialSam3Remote(origin)) {
      const error = new Error('The existing ComfyUI-SAM3 folder does not point to the official repository. Move it aside and try again.');
      error.code = 'sam3_remote_mismatch';
      throw error;
    }
    await run('git', ['-C', status.nodePath, 'pull', '--ff-only'], { cwd: status.nodePath });
  } else {
    await run('git', ['clone', '--depth', '1', SAM3_REPO_URL, status.nodePath], { cwd: status.customNodesPath });
  }

  const requirements = path.join(status.nodePath, 'requirements.txt');
  if (existsSync(requirements)) {
    const uv = findUv(status.basePath, status.pythonPath, existsSync);
    if (uv) {
      await run(uv, ['pip', 'install', '--python', status.pythonPath, '--upgrade-strategy', 'only-if-needed', '-r', requirements], { cwd: status.nodePath });
    } else {
      // SAM3 runs through comfy-env/Pixi. Do not force-upgrade ComfyUI's
      // shared environment: that can break Video Helper Suite or SeedVR2.
      await run(status.pythonPath, ['-m', 'pip', 'install', '--upgrade-strategy', 'only-if-needed', '-r', requirements], { cwd: status.nodePath });
    }
  }
  const installScript = path.join(status.nodePath, 'install.py');
  if (existsSync(installScript)) {
    await run(status.pythonPath, [installScript], { cwd: status.nodePath });
  }
  return Object.assign({}, status, { downloaded: true, restartRequired: true });
}

module.exports = {
  SAM3_FOLDER,
  SAM3_REPO_URL,
  desktopBasePath,
  findComfyBase,
  findComfyPython,
  isOfficialSam3Remote,
  installSam3,
  sam3InstallStatus,
};
