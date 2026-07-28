'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

function isTailscaleAddress(name, address) {
  if (/tailscale/i.test(String(name || ''))) return true;
  const parts = String(address || '').split('.').map(Number);
  return parts.length === 4 && parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127;
}

function mobileAccessAddresses(interfaces) {
  const entries = [];
  for (const [name, addresses] of Object.entries(interfaces || {})) {
    for (const value of addresses || []) {
      if (value.family !== 'IPv4' || value.internal) continue;
      entries.push({ name, address: value.address, tailscale: isTailscaleAddress(name, value.address) });
    }
  }
  return entries.sort((left, right) => Number(right.tailscale) - Number(left.tailscale));
}

function mobileAccessSummary(interfaces, port = 3300) {
  const checkedPort = Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) <= 65535
    ? Number(port)
    : 3300;
  const addresses = mobileAccessAddresses(interfaces).map((entry) => Object.assign({}, entry, {
    url: `http://${entry.address}:${checkedPort}`,
  }));
  const tailscale = addresses.find((entry) => entry.tailscale) || null;
  const local = addresses.find((entry) => !entry.tailscale) || null;
  return {
    tailscaleDetected: !!tailscale,
    tailscaleUrl: tailscale ? tailscale.url : '',
    localUrl: local ? local.url : '',
    addresses,
    downloadUrl: 'https://tailscale.com/download',
    installGuideUrl: 'https://tailscale.com/docs/install',
  };
}

function tailscaleExecutables(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const candidates = [];
  if (platform === 'win32') {
    for (const root of [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]) {
      if (!root) continue;
      candidates.push(path.join(root, 'Tailscale', 'tailscale.exe'));
    }
    candidates.push('tailscale.exe');
  } else {
    candidates.push('/Applications/Tailscale.app/Contents/MacOS/Tailscale');
    candidates.push('/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', 'tailscale');
  }
  return [...new Set(candidates)];
}

function execText(command, args, options = {}) {
  const execFileFn = options.execFileFn || execFile;
  return new Promise((resolve, reject) => {
    execFileFn(command, args, {
      windowsHide: true,
      timeout: options.timeout || 5000,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = `${stdout || ''}${stderr ? `\n${stderr}` : ''}`.trim();
      if (error) {
        error.output = output;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

async function runTailscale(args, options = {}) {
  const exists = options.existsSync || fs.existsSync;
  let lastError = null;
  for (const executable of tailscaleExecutables(options)) {
    if (path.isAbsolute(executable) && !exists(executable)) continue;
    try {
      const output = await execText(executable, args, options);
      return { executable, output };
    } catch (error) {
      lastError = error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const error = lastError || new Error('Tailscale is not installed or its command-line tool could not be found.');
  error.code = 'tailscale_unavailable';
  throw error;
}

function parseJson(value) {
  try { return JSON.parse(String(value || '')); } catch { return null; }
}

function normalizeDnsName(value) {
  const name = String(value || '').trim().replace(/\.$/, '').toLowerCase();
  return /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(name) ? name : '';
}

function tailscaleDnsName(status) {
  return normalizeDnsName(
    status?.Self?.DNSName
    || status?.Self?.HostName
    || status?.CurrentTailnet?.MagicDNSSuffix
    || '',
  );
}

function collectServeStrings(value, route = [], entries = []) {
  if (typeof value === 'string') {
    entries.push({ route, value });
    return entries;
  }
  if (!value || typeof value !== 'object') return entries;
  for (const [key, child] of Object.entries(value)) {
    entries.push({ route: [...route, key], value: key });
    collectServeStrings(child, [...route, key], entries);
  }
  return entries;
}

function inspectServeConfig(value, port = 3300) {
  const parsed = typeof value === 'string' ? parseJson(value) : value;
  if (!parsed || typeof parsed !== 'object') {
    return { configured: false, conflict: false, empty: true };
  }
  const entries = collectServeStrings(parsed);
  const targetPattern = new RegExp(`(?:127\\.0\\.0\\.1|localhost):${Number(port)}(?:/|$)`, 'i');
  const proxies = entries.filter((entry) => /(?:https?:\/\/)?(?:127\.0\.0\.1|localhost):\d+/i.test(entry.value));
  const hasConfig = Object.keys(parsed).length > 0;
  const configured = proxies.some((entry) => targetPattern.test(entry.value));
  return {
    configured,
    conflict: !configured && hasConfig,
    empty: !hasConfig,
  };
}

function approvalUrl(value) {
  const match = String(value || '').match(/https:\/\/(?:login|login\.tailscale|tailscale)\.[^\s<>"']+/i);
  if (!match) return '';
  try {
    const url = new URL(match[0]);
    return url.protocol === 'https:' && /(^|\.)tailscale\.com$/i.test(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

async function tailscaleHttpsStatus(port = 3300, options = {}) {
  try {
    const statusResult = await runTailscale(['status', '--json'], options);
    const status = parseJson(statusResult.output);
    const dnsName = tailscaleDnsName(status);
    if (!dnsName) {
      return { available: true, configured: false, secureUrl: '', reason: 'Tailscale MagicDNS is not ready.' };
    }
    let serve = { configured: false, conflict: false, empty: true };
    try {
      const serveResult = await runTailscale(['serve', 'status', '--json'], Object.assign({}, options, {
        executable: statusResult.executable,
      }));
      serve = inspectServeConfig(serveResult.output, port);
    } catch (error) {
      if (!/no serve config|not configured/i.test(String(error?.output || error?.message || ''))) throw error;
    }
    return {
      available: true,
      configured: serve.configured,
      conflict: serve.conflict && !serve.configured,
      dnsName,
      secureUrl: serve.configured ? `https://${dnsName}` : '',
      reason: serve.conflict && !serve.configured ? 'Tailscale Serve is already forwarding another local app.' : '',
    };
  } catch (error) {
    return {
      available: false,
      configured: false,
      secureUrl: '',
      reason: String(error?.output || error?.message || 'Tailscale is unavailable.'),
    };
  }
}

async function enableTailscaleHttps(port = 3300, options = {}) {
  const statusResult = await runTailscale(['status', '--json'], options);
  const dnsName = tailscaleDnsName(parseJson(statusResult.output));
  if (!dnsName) {
    const error = new Error('Tailscale is connected, but its private DNS name is not ready.');
    error.code = 'tailscale_dns_unavailable';
    throw error;
  }
  let existing = { configured: false, conflict: false, empty: true };
  try {
    const serveResult = await runTailscale(['serve', 'status', '--json'], options);
    existing = inspectServeConfig(serveResult.output, port);
  } catch (error) {
    if (!/no serve config|not configured/i.test(String(error?.output || error?.message || ''))) throw error;
  }
  if (existing.configured) return { secureUrl: `https://${dnsName}`, configured: true, alreadyConfigured: true };
  if (existing.conflict) {
    const error = new Error('Tailscale Serve already forwards another local app. Mix Studio did not replace it.');
    error.code = 'tailscale_serve_conflict';
    throw error;
  }
  try {
    await runTailscale(['serve', '--bg', '--yes', `http://127.0.0.1:${Number(port)}`], options);
  } catch (error) {
    const url = approvalUrl(`${error?.output || ''}\n${error?.message || ''}`);
    if (url) {
      error.code = 'tailscale_https_approval_required';
      error.approvalUrl = url;
      error.message = 'Approve HTTPS for this Tailscale network, then try again.';
    }
    throw error;
  }
  return { secureUrl: `https://${dnsName}`, configured: true, alreadyConfigured: false };
}

module.exports = {
  approvalUrl,
  enableTailscaleHttps,
  inspectServeConfig,
  isTailscaleAddress,
  mobileAccessAddresses,
  mobileAccessSummary,
  normalizeDnsName,
  tailscaleDnsName,
  tailscaleExecutables,
  tailscaleHttpsStatus,
};
