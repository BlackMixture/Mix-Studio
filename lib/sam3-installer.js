'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const SAM3_REPO_URL = 'https://github.com/PozzettiAndrea/ComfyUI-SAM3.git';
const SAM3_FOLDER = 'ComfyUI-SAM3';

function readJsonValue(file, fallback, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' ? value : fallback;
  } catch {
    return fallback;
  }
}

function readJson(file, fsImpl = fs) {
  const value = readJsonValue(file, {}, fsImpl);
  return value && !Array.isArray(value) ? value : {};
}

function uniquePaths(values, pathApi = path) {
  const seen = new Set();
  return values.filter(Boolean).map((value) => pathApi.resolve(String(value))).filter((value) => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function desktopBasePath(env, fsImpl = fs, pathApi = path) {
  const appData = String(env.APPDATA || '').trim();
  if (!appData) return '';
  const config = readJson(pathApi.join(appData, 'ComfyUI', 'config.json'), fsImpl);
  return String(config.basePath || config.base_path || '').trim();
}

function comfyDesktopInstallations(env, fsImpl = fs, pathApi = path) {
  const appData = String(env.APPDATA || '').trim();
  if (!appData) return [];
  const file = pathApi.join(appData, 'Comfy Desktop', 'installations.json');
  const records = readJsonValue(file, [], fsImpl);
  if (!Array.isArray(records)) return [];
  return records
    .filter((record) => record && typeof record === 'object' && record.sourceId !== 'cloud')
    .sort((left, right) => String(right.lastLaunchedAt || right.createdAt || '')
      .localeCompare(String(left.lastLaunchedAt || left.createdAt || '')));
}

function desktopInstallationCandidates(env, fsImpl = fs, pathApi = path) {
  return comfyDesktopInstallations(env, fsImpl, pathApi).map((record) => {
    const adoptedBase = String(record.adoptedBaseDir || '').trim();
    const installPath = String(record.installPath || '').trim();
    return {
      basePath: adoptedBase || (installPath ? pathApi.join(installPath, 'ComfyUI') : ''),
      pythonPath: String(record.adoptedPythonPath || '').trim(),
    };
  }).filter((candidate) => candidate.basePath);
}

function looksLikeComfyBase(dir, existsSync, pathApi = path) {
  return existsSync(pathApi.join(dir, 'custom_nodes'))
    || existsSync(pathApi.join(dir, 'models'))
    || existsSync(pathApi.join(dir, '.venv'))
    || existsSync(pathApi.join(dir, 'main.py'));
}

function findComfyBase(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const home = options.home || os.homedir();
  const pathApi = options.pathApi || path;
  const comfy = runtime.comfy || {};
  const registered = desktopInstallationCandidates(env, fsImpl, pathApi);
  const candidates = uniquePaths([
    env.COMFYUI_PATH,
    comfy.path,
    ...registered.map((candidate) => candidate.basePath),
    desktopBasePath(env, fsImpl, pathApi),
    comfy.modelsPath ? pathApi.dirname(comfy.modelsPath) : '',
    pathApi.join(home, 'Documents', 'ComfyUI'),
    pathApi.join(home, 'ComfyUI'),
  ], pathApi);
  for (const candidate of candidates) {
    for (const dir of uniquePaths([candidate, pathApi.join(candidate, 'ComfyUI')], pathApi)) {
      const registeredPython = registered.find((entry) => pathApi.resolve(entry.basePath) === pathApi.resolve(dir))?.pythonPath;
      const pythonPath = registeredPython && existsSync(registeredPython)
        ? registeredPython
        : findComfyPython(dir, Object.assign({}, options, { pathApi }));
      if (existsSync(dir) && looksLikeComfyBase(dir, existsSync, pathApi) && pythonPath) return dir;
    }
  }
  return '';
}

function findPartialComfyBase(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const home = options.home || os.homedir();
  const pathApi = options.pathApi || path;
  const comfy = runtime.comfy || {};
  const registered = desktopInstallationCandidates(env, fsImpl, pathApi);
  const candidates = uniquePaths([
    env.COMFYUI_PATH,
    comfy.path,
    ...registered.map((candidate) => candidate.basePath),
    desktopBasePath(env, fsImpl, pathApi),
    comfy.modelsPath ? pathApi.dirname(comfy.modelsPath) : '',
    pathApi.join(home, 'Documents', 'ComfyUI'),
    pathApi.join(home, 'ComfyUI'),
  ], pathApi);
  for (const candidate of candidates) {
    for (const dir of uniquePaths([candidate, pathApi.join(candidate, 'ComfyUI')], pathApi)) {
      if (!existsSync(dir) || !looksLikeComfyBase(dir, existsSync, pathApi)) continue;
      const registeredPython = registered.find((entry) => pathApi.resolve(entry.basePath) === pathApi.resolve(dir))?.pythonPath;
      const pythonPath = registeredPython && existsSync(registeredPython)
        ? registeredPython
        : findComfyPython(dir, Object.assign({}, options, { pathApi }));
      if (!pythonPath) return dir;
    }
  }
  return '';
}

function findComfyPython(basePath, options = {}) {
  if (!basePath) return '';
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  const parent = pathApi.dirname(basePath);
  const registeredPython = desktopInstallationCandidates(env, fsImpl, pathApi)
    .find((entry) => pathApi.resolve(entry.basePath) === pathApi.resolve(basePath))?.pythonPath;
  const candidates = uniquePaths([
    env.COMFYUI_PYTHON,
    registeredPython,
    pathApi.join(basePath, '.venv', 'Scripts', 'python.exe'),
    pathApi.join(basePath, 'venv', 'Scripts', 'python.exe'),
    pathApi.join(parent, 'python_embeded', 'python.exe'),
    pathApi.join(basePath, 'python_embeded', 'python.exe'),
    pathApi.join(basePath, '.venv', 'bin', 'python'),
    pathApi.join(basePath, 'venv', 'bin', 'python'),
  ], pathApi);
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
  const partialPath = basePath ? '' : findPartialComfyBase(runtime, options);
  const pythonPath = findComfyPython(basePath, options);
  const customNodesPath = basePath ? path.join(basePath, 'custom_nodes') : '';
  const nodePath = customNodesPath ? path.join(customNodesPath, SAM3_FOLDER) : '';
  return {
    basePath,
    partialPath,
    pythonPath,
    customNodesPath,
    nodePath,
    downloaded: !!nodePath && existsSync(nodePath),
    canInstall: !!basePath && !!pythonPath,
    reason: !basePath
      ? (partialPath
        ? 'An incomplete ComfyUI installation was found. Open Comfy Desktop and finish creating its Python environment.'
        : 'Open Generation setup in Mix Studio to connect or install ComfyUI.')
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
  comfyDesktopInstallations,
  desktopInstallationCandidates,
  findComfyBase,
  findPartialComfyBase,
  findComfyPython,
  isOfficialSam3Remote,
  installSam3,
  sam3InstallStatus,
};
