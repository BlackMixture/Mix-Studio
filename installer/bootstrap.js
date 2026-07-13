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
  const config = readJson(pathImpl.join(appData, 'ComfyUI', 'config.json'), fsImpl);
  const base = String(config.basePath || config.base_path || '').trim();
  return base && fsImpl.existsSync(base) ? base : '';
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
  const preservedInstallFile = localAppData ? pathImpl.join(localAppData, 'Mix Studio', 'install.json') : '';
  const preservedData = localAppData ? pathImpl.join(localAppData, 'Mix Studio', 'data') : '';
  const preservedConfig = preservedInstallFile ? readJson(preservedInstallFile, fsImpl) : {};
  const source = Object.keys(localConfig).length ? localConfig : preservedConfig;
  const sourceComfy = existingObject(source.comfy);
  const detectedComfy = desktopComfyPath(env, fsImpl, pathImpl);
  const comfyPath = String(sourceComfy.path || detectedComfy || '').trim();
  const modelsPath = String(sourceComfy.modelsPath || (comfyPath ? pathImpl.join(comfyPath, 'models') : '')).trim();
  const dataDir = source.dataDir
    || ((!fsImpl.existsSync(localData) && preservedData && fsImpl.existsSync(preservedData)) ? preservedData : 'data');

  return Object.assign({}, source, {
    schemaVersion: 1,
    appId: 'mix-studio',
    installMode: 'portable',
    dataDir,
    createdAt: source.createdAt || now,
    updatedAt: now,
    update: Object.assign({}, existingObject(source.update), {
      provider: 'git',
      channel: String(existingObject(source.update).channel || 'main'),
    }),
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
