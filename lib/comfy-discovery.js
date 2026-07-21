'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { comfyDesktopInstallations } = require('./sam3-installer');

const DEFAULT_COMFY_PORTS = Object.freeze([8188, 8000]);

function validPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 0;
}

function portFromLaunchArgs(value, fallback = 0) {
  const args = Array.isArray(value) ? value.map(String) : String(value || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  for (let index = 0; index < args.length; index += 1) {
    const token = String(args[index]).replace(/^"|"$/g, '');
    const inline = token.match(/^--port=(\d+)$/i);
    if (inline) return validPort(inline[1]);
    if (/^--port$/i.test(token)) return validPort(String(args[index + 1] || '').replace(/^"|"$/g, ''));
  }
  return validPort(fallback);
}

function normalizedComfyUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (['0.0.0.0', '::', '[::]'].includes(url.hostname)) url.hostname = '127.0.0.1';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function loopbackComfyUrl(port) {
  const checked = validPort(port);
  return checked ? `http://127.0.0.1:${checked}` : '';
}

function isLoopbackUrl(value) {
  try {
    const hostname = new URL(String(value || '')).hostname.toLowerCase();
    return ['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0', '::', '[::]'].includes(hostname);
  } catch {
    return false;
  }
}

function desktopPortLocks(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  const appData = String(env.APPDATA || '').trim();
  if (!appData) return [];
  const directory = pathApi.join(appData, 'Comfy Desktop', 'port-locks');
  let names = [];
  try { names = fsImpl.readdirSync(directory); } catch { return []; }
  return names.map((name) => {
    const matched = String(name).match(/^port-(\d+)\.json$/i);
    if (!matched) return null;
    let record = {};
    try { record = JSON.parse(fsImpl.readFileSync(pathApi.join(directory, name), 'utf8')); } catch { return null; }
    const port = validPort(matched[1]);
    if (!port || !record || typeof record !== 'object') return null;
    return {
      port,
      pid: Number(record.pid) || 0,
      installationName: String(record.installationName || ''),
      timestamp: String(record.timestamp || ''),
      source: 'desktop-lock',
    };
  }).filter(Boolean).sort((left, right) => right.timestamp.localeCompare(left.timestamp));
}

function desktopLaunchArgPorts(options = {}) {
  const env = options.env || process.env;
  const fsImpl = options.fsImpl || fs;
  const pathApi = options.pathApi || path;
  return comfyDesktopInstallations(env, fsImpl, pathApi).map((record) => {
    const fallback = record.adopted ? 8000 : 8188;
    const port = portFromLaunchArgs(record.launchArgs, fallback);
    if (!port) return null;
    return {
      port,
      installationName: String(record.name || record.id || ''),
      source: 'desktop-record',
    };
  }).filter(Boolean);
}

function execFileText(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      windowsHide: true,
      timeout: options.timeout || 5000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout) => {
      if (error) return reject(error);
      resolve(String(stdout || ''));
    });
  });
}

async function runningComfyPorts(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return [];
  const env = options.env || process.env;
  const run = options.runProcessQuery || execFileText;
  const systemRoot = String(env.SystemRoot || 'C:\\Windows');
  const powershell = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = "@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '(?i)(ComfyUI[\\\\/]main\\.py|[\\\\/]main\\.py)' } | Select-Object -ExpandProperty CommandLine) | ConvertTo-Json -Compress";
  try {
    const output = await run(powershell, ['-NoProfile', '-Command', script], { timeout: 5000 });
    if (!String(output).trim()) return [];
    const parsed = JSON.parse(output);
    const lines = Array.isArray(parsed) ? parsed : [parsed];
    return [...new Set(lines.map((line) => portFromLaunchArgs(line, 8188)).filter(Boolean))];
  } catch {
    return [];
  }
}

function isComfySystemStats(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && value.system && typeof value.system === 'object'
    && Array.isArray(value.devices));
}

async function probeComfyUrl(value, options = {}) {
  const baseUrl = normalizedComfyUrl(value);
  if (!baseUrl) return false;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs) || 1000;
  try {
    const response = await fetchImpl(`${baseUrl}/system_stats`, {
      signal: options.signal || AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return false;
    return isComfySystemStats(await response.json());
  } catch {
    return false;
  }
}

async function comfyConnectionCandidates(configuredUrl, options = {}) {
  const entries = [];
  const add = (url, source, details = {}) => {
    const normalized = normalizedComfyUrl(url);
    if (!normalized || entries.some((entry) => entry.url.toLowerCase() === normalized.toLowerCase())) return;
    entries.push(Object.assign({ url: normalized, source }, details));
  };
  const configured = normalizedComfyUrl(configuredUrl);
  if (configured) add(configured, 'saved');
  for (const lock of desktopPortLocks(options)) add(loopbackComfyUrl(lock.port), lock.source, lock);
  if (!options.skipProcessQuery) {
    for (const port of await runningComfyPorts(options)) add(loopbackComfyUrl(port), 'process', { port });
  }
  for (const record of desktopLaunchArgPorts(options)) add(loopbackComfyUrl(record.port), record.source, record);
  for (const port of options.defaultPorts || DEFAULT_COMFY_PORTS) add(loopbackComfyUrl(port), 'default', { port });
  return entries;
}

async function discoverComfyEndpoints(configuredUrl, options = {}) {
  const candidates = await comfyConnectionCandidates(configuredUrl, options);
  const results = await Promise.all(candidates.map(async (candidate) => ({
    ...candidate,
    available: await probeComfyUrl(candidate.url, options),
  })));
  const matches = results.filter((entry) => entry.available).map(({ available, ...entry }) => entry);
  const saved = matches.find((entry) => entry.source === 'saved');
  const configuredIsRemote = !!normalizedComfyUrl(configuredUrl) && !isLoopbackUrl(configuredUrl);
  let selected = saved || null;
  if (!selected && !configuredIsRemote && matches.length === 1) selected = matches[0];
  if (!selected && !configuredIsRemote) {
    const locks = matches.filter((entry) => entry.source === 'desktop-lock');
    if (locks.length === 1) selected = locks[0];
  }
  return {
    url: selected ? selected.url : '',
    matches,
    ambiguous: !selected && matches.length > 0,
    configuredIsRemote,
    checked: candidates.length,
  };
}

module.exports = {
  DEFAULT_COMFY_PORTS,
  comfyConnectionCandidates,
  desktopLaunchArgPorts,
  desktopPortLocks,
  discoverComfyEndpoints,
  isComfySystemStats,
  isLoopbackUrl,
  loopbackComfyUrl,
  normalizedComfyUrl,
  portFromLaunchArgs,
  probeComfyUrl,
  runningComfyPorts,
  validPort,
};
