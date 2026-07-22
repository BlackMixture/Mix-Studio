'use strict';

/*
 * Minimal first-launch bootstrap.
 *
 * This intentionally does not install ComfyUI, models, or custom nodes. Its
 * only job is to preserve an existing portable configuration (including data
 * left by an uninstall), record any obvious ComfyUI Desktop location, and get
 * the web app running. Generation dependencies are configured from the app.
 */

const fs = require('fs');
const path = require('path');

function readJson(file, fsImpl = fs) {
  try {
    const value = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function existingObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function desktopComfyPath(env = process.env, fsImpl = fs, pathImpl = path) {
  const appData = String(env.APPDATA || '').trim();
  if (!appData) return '';
  const registryFile = pathImpl.join(appData, 'Comfy Desktop', 'installations.json');
  try {
    const records = JSON.parse(fsImpl.readFileSync(registryFile, 'utf8'));
    if (Array.isArray(records)) {
      const sorted = records
        .filter((record) => {
          if (!record || typeof record !== 'object' || record.sourceId === 'cloud') return false;
          const status = String(record.status || '').trim().toLowerCase();
          return !status || status === 'installed';
        })
        .sort((left, right) => String(right.lastLaunchedAt || right.createdAt || '')
          .localeCompare(String(left.lastLaunchedAt || left.createdAt || '')));
      for (const record of sorted) {
        const installPath = String(record.installPath || '').trim();
        const adoptedBase = String(record.adoptedBaseDir || '').trim();
        const base = adoptedBase || (installPath ? pathImpl.join(installPath, 'ComfyUI') : '');
        const python = String(record.adoptedPythonPath || '').trim()
          || (base ? pathImpl.join(base, '.venv', 'Scripts', 'python.exe') : '');
        const main = base ? pathImpl.join(base, 'main.py') : '';
        if (base && python && fsImpl.existsSync(main) && fsImpl.existsSync(python)) return base;
      }
    }
  } catch { /* current Comfy Desktop has not registered an installation */ }
  const config = readJson(pathImpl.join(appData, 'ComfyUI', 'config.json'), fsImpl);
  const base = String(config.basePath || config.base_path || '').trim();
  if (!base || !fsImpl.existsSync(base)) return '';
  const pythonCandidates = [
    pathImpl.join(base, '.venv', 'Scripts', 'python.exe'),
    pathImpl.join(base, 'venv', 'Scripts', 'python.exe'),
    pathImpl.join(pathImpl.dirname(base), 'python_embeded', 'python.exe'),
    pathImpl.join(base, 'python_embeded', 'python.exe'),
  ];
  return fsImpl.existsSync(pathImpl.join(base, 'main.py'))
    && pythonCandidates.some((candidate) => fsImpl.existsSync(candidate)) ? base : '';
}

function portableBootstrapConfig(root, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const pathImpl = options.pathImpl || path;
  const env = options.env || process.env;
  const now = options.now || new Date().toISOString();
  const localInstallFile = pathImpl.join(root, 'install.json');
  const localData = pathImpl.join(root, 'data');
  const localConfig = readJson(localInstallFile, fsImpl);
  const localAppData = String(env.LOCALAPPDATA || '').trim();
  const preservedCandidates = localAppData ? [
    pathImpl.join(localAppData, 'Mix Studio User Data'),
    pathImpl.join(localAppData, 'Mix Studio'),
  ].map((preservedRoot) => {
    const installFile = pathImpl.join(preservedRoot, 'install.json');
    const config = readJson(installFile, fsImpl);
    const configuredData = String(config.dataDir || '').trim();
    const configuredDataPath = configuredData
      ? (pathImpl.isAbsolute(configuredData) ? configuredData : pathImpl.join(preservedRoot, configuredData))
      : '';
    return {
      root: preservedRoot,
      installFile,
      data: pathImpl.join(preservedRoot, 'data'),
      config,
      configuredDataPath,
    };
  }) : [];
  const preserved = preservedCandidates.find((candidate) => (
    Object.keys(candidate.config).length
      && candidate.configuredDataPath
      && fsImpl.existsSync(candidate.configuredDataPath)
  )) || preservedCandidates.find((candidate) => (
    fsImpl.existsSync(candidate.data) && Object.keys(candidate.config).length
  )) || preservedCandidates.find((candidate) => fsImpl.existsSync(candidate.data))
    || preservedCandidates.find((candidate) => Object.keys(candidate.config).length)
    || { root: '', installFile: '', data: '', config: {}, configuredDataPath: '' };
  const preservedInstallFile = preserved.installFile;
  const preservedData = preserved.data;
  const preservedConfig = preserved.config;
  const hasLocalConfig = Object.keys(localConfig).length > 0;
  const source = hasLocalConfig ? localConfig : preservedConfig;
  const sourceComfy = existingObject(source.comfy);
  const detectedComfy = desktopComfyPath(env, fsImpl, pathImpl);
  const comfyPath = String(sourceComfy.path || detectedComfy || '').trim();
  const modelsPath = String(sourceComfy.modelsPath || (comfyPath ? pathImpl.join(comfyPath, 'models') : '')).trim();
  const configuredDataDir = String(source.dataDir || '').trim();
  let dataDir = configuredDataDir || 'data';
  if (!hasLocalConfig && configuredDataDir && !pathImpl.isAbsolute(configuredDataDir)
      && preserved.configuredDataPath && fsImpl.existsSync(preserved.configuredDataPath)) {
    dataDir = preserved.configuredDataPath;
  } else if (!hasLocalConfig && configuredDataDir && pathImpl.isAbsolute(configuredDataDir)
      && !fsImpl.existsSync(configuredDataDir)
      && preservedData && fsImpl.existsSync(preservedData)) {
    // An older checkout may have preserved an absolute path before that drive
    // or folder disappeared. Prefer the known current preservation folder over
    // reconnecting the new install to a dead location.
    dataDir = preservedData;
  } else if (!hasLocalConfig && preservedData && fsImpl.existsSync(preservedData)
      && (!configuredDataDir || !pathImpl.isAbsolute(configuredDataDir))) {
    dataDir = preservedData;
  } else if (!configuredDataDir && !fsImpl.existsSync(localData)
      && preservedData && fsImpl.existsSync(preservedData)) {
    dataDir = preservedData;
  }
  const sourceUpdate = existingObject(source.update);
  const gitPath = String(env.MIX_STUDIO_GIT || sourceUpdate.gitPath || '').trim();
  const update = Object.assign({}, sourceUpdate, {
    provider: 'git',
    channel: String(sourceUpdate.channel || 'main'),
  });
  if (gitPath) update.gitPath = gitPath;

  return Object.assign({}, source, {
    schemaVersion: 1,
    appId: 'mix-studio',
    installMode: 'portable',
    dataDir,
    createdAt: source.createdAt || now,
    updatedAt: now,
    update,
    comfy: Object.assign({}, sourceComfy, {
      mode: comfyPath ? String(sourceComfy.mode || 'external') : 'unconfigured',
      path: comfyPath,
      modelsPath,
      url: String(sourceComfy.url || 'http://127.0.0.1:8188'),
    }),
    setup: Object.assign({}, existingObject(source.setup), {
      experience: 'in-app',
    }),
  });
}

function writeJsonAtomic(file, value, fsImpl = fs) {
  const temp = `${file}.tmp`;
  fsImpl.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fsImpl.renameSync(temp, file);
}

function run(root = path.resolve(__dirname, '..')) {
  const config = portableBootstrapConfig(root);
  writeJsonAtomic(path.join(root, 'install.json'), config);
  const dataLabel = path.isAbsolute(config.dataDir) ? config.dataDir : path.resolve(root, config.dataDir);
  process.stdout.write(`Mix Studio is ready to launch.\nData: ${dataLabel}\n`);
  if (config.comfy.path) process.stdout.write(`Detected ComfyUI: ${config.comfy.path}\n`);
  else process.stdout.write('ComfyUI setup will continue inside Mix Studio when it is needed.\n');
  return config;
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    process.stderr.write(`Could not prepare Mix Studio: ${error.message || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  desktopComfyPath,
  portableBootstrapConfig,
  readJson,
  run,
  writeJsonAtomic,
};
