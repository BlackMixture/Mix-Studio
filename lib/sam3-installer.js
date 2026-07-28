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

// Per-user application data roots for every OS the Desktop app ships on:
// %APPDATA% on Windows, ~/Library/Application Support on macOS, and
// $XDG_CONFIG_HOME (default ~/.config) on Linux.
function appDataRoots(env, pathApi = path, platform = process.platform, home = '') {
  // Deliberately no os.homedir() fallback: an injected empty env must resolve
  // to no roots so tests never read the developer's real application data.
  const userHome = String(home || env.HOME || env.USERPROFILE || '').trim();
  const roots = [];
  if (platform === 'win32' || env.APPDATA) roots.push(String(env.APPDATA || '').trim());
  if (platform === 'darwin' && userHome) roots.push(pathApi.join(userHome, 'Library', 'Application Support'));
  if (platform !== 'win32' && platform !== 'darwin') {
    roots.push(String(env.XDG_CONFIG_HOME || '').trim() || (userHome ? pathApi.join(userHome, '.config') : ''));
  }
  return roots.filter(Boolean);
}

function desktopBasePath(env, fsImpl = fs, pathApi = path) {
  for (const root of appDataRoots(env, pathApi)) {
    const config = readJson(pathApi.join(root, 'ComfyUI', 'config.json'), fsImpl);
    const basePath = String(config.basePath || config.base_path || '').trim();
    if (basePath) return basePath;
  }
  return '';
}

/*
 * The second-generation Desktop app (comfyui-desktop-2) has no
 * installations.json; its settings.json names an installDir whose immediate
 * subfolders are installs shaped <installDir>/<name>/ComfyUI/main.py. They are
 * surfaced as synthetic records so every desktop-aware consumer treats them
 * like classic Comfy Desktop installations.
 */
function comfyDesktop2Installations(env, fsImpl = fs, pathApi = path) {
  for (const root of appDataRoots(env, pathApi)) {
    const settings = readJson(pathApi.join(root, 'comfyui-desktop-2', 'settings.json'), fsImpl);
    const installDir = String(settings.installDir || '').trim();
    if (!installDir) continue;
    // The first shared-models directory is the one the Desktop app marks as
    // its download target; adopt it only while it is actually reachable so a
    // dismounted NAS never silently redirects installs.
    const modelsDir = (Array.isArray(settings.modelsDirs) ? settings.modelsDirs : [])
      .map((value) => String(value || '').trim())
      .find((value) => {
        if (!value) return false;
        try { return fsImpl.statSync(value).isDirectory(); } catch { return false; }
      }) || '';
    let names = [];
    try { names = fsImpl.readdirSync(installDir); } catch { continue; }
    return names.map((name) => {
      const installPath = pathApi.join(installDir, String(name));
      try {
        if (!fsImpl.statSync(pathApi.join(installPath, 'ComfyUI', 'main.py')).isFile()) return null;
      } catch { return null; }
      return {
        id: `comfyui-desktop-2:${name}`,
        name: String(name),
        installPath,
        modelsDir,
        status: 'installed',
        sourceId: 'comfyui-desktop-2',
      };
    }).filter(Boolean);
  }
  return [];
}

// The shared-models directory of the Desktop installation that owns basePath,
// if the Desktop app declares one ('' otherwise).
function desktopSharedModelsDir(basePath, env, fsImpl = fs, pathApi = path) {
  if (!String(basePath || '').trim()) return '';
  for (const record of comfyDesktopInstallations(env, fsImpl, pathApi)) {
    if (!desktopRecordIsInstalled(record)) continue;
    const installPath = String(record.installPath || '').trim();
    const sourcePath = installPath ? pathApi.join(installPath, 'ComfyUI') : '';
    const dataPath = String(record.adoptedBaseDir || '').trim() || sourcePath;
    if (!sameResolvedPath(basePath, sourcePath, pathApi) && !sameResolvedPath(basePath, dataPath, pathApi)) continue;
    const modelsDir = String(record.modelsDir || '').trim();
    if (modelsDir) return modelsDir;
  }
  return '';
}

function comfyDesktopInstallations(env, fsImpl = fs, pathApi = path) {
  let records = [];
  for (const root of appDataRoots(env, pathApi)) {
    const found = readJsonValue(pathApi.join(root, 'Comfy Desktop', 'installations.json'), [], fsImpl);
    if (Array.isArray(found) && found.length) { records = found; break; }
  }
  return records
    .filter((record) => record && typeof record === 'object' && record.sourceId !== 'cloud')
    .sort((left, right) => String(right.lastLaunchedAt || right.createdAt || '')
      .localeCompare(String(left.lastLaunchedAt || left.createdAt || '')))
    .concat(comfyDesktop2Installations(env, fsImpl, pathApi));
}

function desktopRecordIsInstalled(record) {
  const status = String(record?.status || '').trim().toLowerCase();
  return !status || status === 'installed';
}

function desktopInstallationCandidates(env, fsImpl = fs, pathApi = path) {
  return comfyDesktopInstallations(env, fsImpl, pathApi).flatMap((record) => {
    const adoptedBase = String(record.adoptedBaseDir || '').trim();
    const installPath = String(record.installPath || '').trim();
    const bases = uniquePaths([
      adoptedBase,
      installPath ? pathApi.join(installPath, 'ComfyUI') : '',
    ], pathApi);
    return bases.map((basePath) => ({
      basePath,
      pythonPath: String(record.adoptedPythonPath || '').trim(),
      installed: desktopRecordIsInstalled(record),
      record,
    }));
  });
}

function looksLikeComfyBase(dir, existsSync, pathApi = path) {
  return existsSync(pathApi.join(dir, 'custom_nodes'))
    || existsSync(pathApi.join(dir, 'models'))
    || existsSync(pathApi.join(dir, '.venv'))
    || existsSync(pathApi.join(dir, 'main.py'));
}

function hasComfyCore(dir, existsSync, pathApi = path) {
  return !!dir && existsSync(pathApi.join(dir, 'main.py'));
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
      const matchingRecords = registered.filter((entry) => pathApi.resolve(entry.basePath) === pathApi.resolve(dir));
      if (matchingRecords.length && !matchingRecords.some((entry) => entry.installed)) continue;
      const registeredPython = matchingRecords.find((entry) => entry.installed)?.pythonPath;
      const pythonPath = registeredPython && existsSync(registeredPython)
        ? registeredPython
        : findComfyPython(dir, Object.assign({}, options, { pathApi }));
      if (existsSync(dir) && hasComfyCore(dir, existsSync, pathApi) && pythonPath) return dir;
    }
  }
  return '';
}

function sameResolvedPath(left, right, pathApi = path) {
  if (!left || !right) return false;
  const a = pathApi.resolve(String(left));
  const b = pathApi.resolve(String(right));
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/*
 * Comfy Desktop can keep its source checkout below AppData while using an
 * adopted base directory for models, custom_nodes, and the Python environment.
 * findComfyBase intentionally finds the runnable source checkout (main.py);
 * installers must instead write into the adopted data base when one exists.
 */
function findComfyDataBase(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  const sourceBase = findComfyBase(runtime, options);
  const configuredBase = String(runtime?.comfy?.path || '').trim();
  const referencePaths = [configuredBase, sourceBase].filter(Boolean);

  for (const record of comfyDesktopInstallations(env, fsImpl, pathApi)) {
    if (!desktopRecordIsInstalled(record)) continue;
    const installPath = String(record.installPath || '').trim();
    const sourcePath = installPath ? pathApi.join(installPath, 'ComfyUI') : '';
    const dataPath = String(record.adoptedBaseDir || '').trim() || sourcePath;
    if (!dataPath || !referencePaths.some((candidate) => (
      sameResolvedPath(candidate, dataPath, pathApi)
      || sameResolvedPath(candidate, sourcePath, pathApi)
    ))) continue;

    const pythonPath = String(record.adoptedPythonPath || '').trim()
      || findComfyPython(dataPath, options);
    const sourceReady = hasComfyCore(sourcePath, existsSync, pathApi)
      || hasComfyCore(dataPath, existsSync, pathApi);
    if (sourceReady && existsSync(dataPath) && looksLikeComfyBase(dataPath, existsSync, pathApi)
      && pythonPath && existsSync(pythonPath)) {
      return pathApi.resolve(dataPath);
    }
  }

  return sourceBase;
}

function findPartialComfyBase(runtime = {}, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const fsImpl = options.fsImpl || fs;
  const home = options.home || os.homedir();
  const pathApi = options.pathApi || path;
  const comfy = runtime.comfy || {};
  const registered = desktopInstallationCandidates(env, fsImpl, pathApi);
  const registeredPartial = registered.find((entry) => !entry.installed && (
    existsSync(entry.basePath)
    || (entry.record?.installPath && existsSync(String(entry.record.installPath)))
  ));
  if (registeredPartial) return registeredPartial.basePath;
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
      const matchingRecords = registered.filter((entry) => pathApi.resolve(entry.basePath) === pathApi.resolve(dir));
      const installedRecord = matchingRecords.find((entry) => entry.installed);
      const registeredPython = installedRecord?.pythonPath;
      const pythonPath = registeredPython && existsSync(registeredPython)
        ? registeredPython
        : findComfyPython(dir, Object.assign({}, options, { pathApi }));
      if ((matchingRecords.length && !installedRecord) || !hasComfyCore(dir, existsSync, pathApi) || !pythonPath) return dir;
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
    .find((entry) => entry.installed && pathApi.resolve(entry.basePath) === pathApi.resolve(basePath))?.pythonPath;
  const candidates = uniquePaths([
    env.COMFYUI_PYTHON,
    registeredPython,
    pathApi.join(basePath, '.venv', 'Scripts', 'python.exe'),
    pathApi.join(basePath, 'venv', 'Scripts', 'python.exe'),
    pathApi.join(parent, 'python_embeded', 'python.exe'),
    pathApi.join(basePath, 'python_embeded', 'python.exe'),
    pathApi.join(basePath, '.venv', 'bin', 'python'),
    pathApi.join(basePath, 'venv', 'bin', 'python'),
    pathApi.join(basePath, '.venv', 'bin', 'python3'),
    pathApi.join(basePath, 'venv', 'bin', 'python3'),
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
  const sourcePath = findComfyBase(runtime, options);
  const basePath = findComfyDataBase(runtime, options);
  const partialPath = basePath ? '' : findPartialComfyBase(runtime, options);
  const pythonPath = findComfyPython(basePath, options);
  const customNodesPath = basePath ? path.join(basePath, 'custom_nodes') : '';
  const nodePath = customNodesPath ? path.join(customNodesPath, SAM3_FOLDER) : '';
  return {
    basePath,
    sourcePath,
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
  const gitExecutable = String(options.gitExecutable || runtime?.update?.gitExecutable || process.env.MIX_STUDIO_GIT || 'git').trim() || 'git';
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
    const origin = await run(gitExecutable, ['-C', status.nodePath, 'remote', 'get-url', 'origin'], { cwd: status.nodePath });
    if (!isOfficialSam3Remote(origin)) {
      const error = new Error('The existing ComfyUI-SAM3 folder does not point to the official repository. Move it aside and try again.');
      error.code = 'sam3_remote_mismatch';
      throw error;
    }
    await run(gitExecutable, ['-C', status.nodePath, 'pull', '--ff-only'], { cwd: status.nodePath });
  } else {
    await run(gitExecutable, ['clone', '--depth', '1', SAM3_REPO_URL, status.nodePath], { cwd: status.customNodesPath });
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
  appDataRoots,
  desktopBasePath,
  comfyDesktop2Installations,
  comfyDesktopInstallations,
  desktopSharedModelsDir,
  desktopInstallationCandidates,
  desktopRecordIsInstalled,
  findComfyBase,
  findComfyDataBase,
  findPartialComfyBase,
  findComfyPython,
  hasComfyCore,
  isOfficialSam3Remote,
  installSam3,
  sam3InstallStatus,
};
