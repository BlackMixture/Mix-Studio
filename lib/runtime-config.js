'use strict';

const fs = require('fs');
const path = require('path');

const INSTALL_SCHEMA_VERSION = 1;

function readJsonFile(file, readFileSync = fs.readFileSync) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function resolvedPath(value, base) {
  const text = String(value || '').trim();
  if (!text) return '';
  return path.resolve(base, text);
}

function resolveRuntimeConfig(root, options = {}) {
  const env = options.env || process.env;
  const existsSync = options.existsSync || fs.existsSync;
  const readFileSync = options.readFileSync || fs.readFileSync;
  const appRoot = path.resolve(root);
  const explicitConfig = String(env.MIXBOX_INSTALL_CONFIG || '').trim();
  const bundledConfig = path.join(appRoot, 'install.json');
  const configFile = explicitConfig
    ? path.resolve(explicitConfig)
    : (existsSync(bundledConfig) ? bundledConfig : '');
  const config = configFile ? readJsonFile(configFile, readFileSync) : {};
  const configBase = configFile ? path.dirname(configFile) : appRoot;
  const installMode = String(env.MIXBOX_INSTALL_MODE || config.installMode || (configFile ? 'portable' : 'source'));
  const hasGitCheckout = existsSync(path.join(appRoot, '.git'));
  const update = config.update && typeof config.update === 'object' ? config.update : {};
  const comfy = config.comfy && typeof config.comfy === 'object' ? config.comfy : {};

  const dataDir = resolvedPath(
    env.MIXBOX_DATA_DIR || config.dataDir || path.join(appRoot, 'data'),
    configBase
  );
  const updatesDir = resolvedPath(
    env.MIXBOX_UPDATES_DIR || config.updatesDir || path.join(dataDir, 'updates'),
    configBase
  );
  const comfyPath = resolvedPath(env.COMFYUI_PATH || comfy.path, configBase);
  const modelsPath = resolvedPath(
    env.COMFYUI_MODELS_DIR || env.COMFYUI_MODEL_ROOT || comfy.modelsPath,
    configBase
  );

  return {
    schemaVersion: INSTALL_SCHEMA_VERSION,
    configFile: configFile || null,
    installMode: installMode === 'portable' ? 'portable' : 'source',
    appRoot,
    dataDir,
    updatesDir,
    update: {
      provider: hasGitCheckout ? 'git' : 'unavailable',
      channel: String(env.MIXBOX_UPDATE_CHANNEL || update.channel || 'main'),
    },
    comfy: {
      mode: String(env.MIXBOX_COMFY_MODE || comfy.mode || (comfyPath ? 'external' : 'configured')),
      path: comfyPath,
      modelsPath,
      url: String(env.MIXBOX_COMFY_URL || comfy.url || ''),
    },
  };
}

function publicRuntimeConfig(runtime) {
  return {
    schemaVersion: runtime.schemaVersion,
    installMode: runtime.installMode,
    dataDir: runtime.dataDir,
    updatesDir: runtime.updatesDir,
    update: Object.assign({}, runtime.update),
    comfy: Object.assign({}, runtime.comfy),
  };
}

module.exports = {
  INSTALL_SCHEMA_VERSION,
  readJsonFile,
  resolveRuntimeConfig,
  publicRuntimeConfig,
};
