'use strict';

const crypto = require('node:crypto');
const {
  approvalUrl,
  runTailscale,
  tailscaleDnsName,
} = require('./mobile-access');

const SPARK_FUNNEL_PORT = 8443;

function sparkAccessToken(value) {
  const token = String(value || '').trim();
  return /^[A-Za-z0-9_-]{32,96}$/.test(token) ? token : '';
}

function newSparkAccessToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function sparkMcpPath(token) {
  const safe = sparkAccessToken(token);
  return safe ? `/mcp/${safe}` : '';
}

function sparkMcpUrl(dnsName, token, port = SPARK_FUNNEL_PORT) {
  const host = String(dnsName || '').trim().replace(/\.$/, '').toLowerCase();
  const endpoint = sparkMcpPath(token);
  if (!host || !endpoint) return '';
  return `https://${host}:${Number(port)}${endpoint}`;
}

function normalizeSparkAccess(value) {
  const source = value && typeof value === 'object' ? value : {};
  const token = sparkAccessToken(source.token);
  return {
    enabled: source.enabled === true && !!token,
    token,
    profileId: String(source.profileId || ''),
    createdAt: Number(source.createdAt) || 0,
  };
}

function collectConfig(value) {
  if (!value || typeof value !== 'object') return [];
  const entries = [];
  const visit = (node, route = []) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      entries.push({ route: [...route, key], key, value: child });
      visit(child, [...route, key]);
    }
  };
  visit(value);
  return entries;
}

function parseOptionalConfig(value) {
  const text = String(value || '').trim();
  if (!text || /^(?:null|no serve config(?:ured)?)$/i.test(text)) return {};
  return JSON.parse(text);
}

function inspectSparkFunnelConfig(value, options = {}) {
  const config = typeof value === 'string' ? (() => {
    try { return JSON.parse(value); } catch { return null; }
  })() : value;
  const dnsName = String(options.dnsName || '').replace(/\.$/, '').toLowerCase();
  const token = sparkAccessToken(options.token);
  const appPort = Number(options.appPort) || 3300;
  const funnelPort = Number(options.funnelPort) || SPARK_FUNNEL_PORT;
  const endpoint = sparkMcpPath(token);
  const hostPort = dnsName ? `${dnsName}:${funnelPort}` : '';
  const expectedProxy = `http://127.0.0.1:${appPort}${endpoint}`;
  if (!config || !hostPort || !endpoint) {
    return { configured: false, conflict: false, endpoint, expectedProxy, hostPort };
  }
  const handlers = config?.Web?.[hostPort]?.Handlers || {};
  const exact = handlers[endpoint];
  const exactProxy = String(exact?.Proxy || '');
  const funnelEnabled = config?.AllowFunnel?.[hostPort] === true;
  const configured = exactProxy === expectedProxy && funnelEnabled;
  const hasHandlers = Object.keys(handlers).length > 0;
  const pathConflict = !!exact && exactProxy !== expectedProxy;
  const privatePortConflict = hasHandlers && !funnelEnabled;
  return {
    configured,
    conflict: !configured && (pathConflict || privatePortConflict),
    endpoint,
    expectedProxy,
    hostPort,
    funnelEnabled,
    handlers: collectConfig(handlers),
  };
}

async function sparkFunnelStatus(token, appPort = 3300, options = {}) {
  const run = options.runTailscaleFn || runTailscale;
  try {
    const statusResult = await run(['status', '--json'], options);
    const status = JSON.parse(statusResult.output || '{}');
    const dnsName = tailscaleDnsName(status);
    if (!dnsName) return { available: true, configured: false, url: '', reason: 'Tailscale MagicDNS is not ready.' };
    let config = {};
    try {
      const serve = await run(['serve', 'status', '--json'], options);
      config = parseOptionalConfig(serve.output);
    } catch (error) {
      if (!/no serve config|not configured/i.test(String(error?.output || error?.message || ''))) throw error;
    }
    const inspected = inspectSparkFunnelConfig(config, { dnsName, token, appPort });
    return {
      available: true,
      configured: inspected.configured,
      conflict: inspected.conflict,
      dnsName,
      url: inspected.configured ? sparkMcpUrl(dnsName, token) : '',
      reason: inspected.conflict
        ? `Tailscale port ${SPARK_FUNNEL_PORT} already has a private or conflicting route. Mix Studio did not replace it.`
        : '',
    };
  } catch (error) {
    return {
      available: false,
      configured: false,
      conflict: false,
      url: '',
      reason: String(error?.output || error?.message || 'Tailscale is unavailable.'),
    };
  }
}

async function enableSparkFunnel(token, appPort = 3300, options = {}) {
  const safeToken = sparkAccessToken(token);
  if (!safeToken) {
    const error = new Error('A valid Gemini Spark access token is required.');
    error.code = 'spark_token_invalid';
    throw error;
  }
  const run = options.runTailscaleFn || runTailscale;
  const statusResult = await run(['status', '--json'], options);
  const dnsName = tailscaleDnsName(JSON.parse(statusResult.output || '{}'));
  if (!dnsName) {
    const error = new Error('Tailscale is connected, but its public DNS name is not ready.');
    error.code = 'tailscale_dns_unavailable';
    throw error;
  }
  let config = {};
  try {
    const serve = await run(['serve', 'status', '--json'], options);
    config = parseOptionalConfig(serve.output);
  } catch (error) {
    if (!/no serve config|not configured/i.test(String(error?.output || error?.message || ''))) throw error;
  }
  const inspected = inspectSparkFunnelConfig(config, { dnsName, token: safeToken, appPort });
  if (inspected.configured) {
    return { configured: true, alreadyConfigured: true, url: sparkMcpUrl(dnsName, safeToken), dnsName };
  }
  if (inspected.conflict) {
    const error = new Error(`Tailscale port ${SPARK_FUNNEL_PORT} already has a private or conflicting route. Mix Studio did not replace it.`);
    error.code = 'tailscale_funnel_conflict';
    throw error;
  }
  const endpoint = sparkMcpPath(safeToken);
  const target = `http://127.0.0.1:${Number(appPort) || 3300}${endpoint}`;
  try {
    await run([
      'funnel', '--bg', '--yes', `--https=${SPARK_FUNNEL_PORT}`,
      `--set-path=${endpoint}`, target,
    ], options);
  } catch (error) {
    const url = approvalUrl(`${error?.output || ''}\n${error?.message || ''}`);
    if (url) {
      error.code = 'tailscale_funnel_approval_required';
      error.approvalUrl = url;
      error.message = 'Approve Tailscale Funnel for this network, then try again.';
    }
    throw error;
  }
  return { configured: true, alreadyConfigured: false, url: sparkMcpUrl(dnsName, safeToken), dnsName };
}

async function disableSparkFunnel(token, options = {}) {
  const safeToken = sparkAccessToken(token);
  if (!safeToken) return { configured: false, alreadyDisabled: true };
  const run = options.runTailscaleFn || runTailscale;
  const endpoint = sparkMcpPath(safeToken);
  try {
    await run([
      'funnel', `--https=${SPARK_FUNNEL_PORT}`, `--set-path=${endpoint}`, 'off',
    ], options);
  } catch (error) {
    if (/handler does not exist|not configured|no serve config/i.test(String(error?.output || error?.message || ''))) {
      return { configured: false, alreadyDisabled: true };
    }
    throw error;
  }
  return { configured: false, alreadyDisabled: false };
}

module.exports = {
  SPARK_FUNNEL_PORT,
  disableSparkFunnel,
  enableSparkFunnel,
  inspectSparkFunnelConfig,
  newSparkAccessToken,
  normalizeSparkAccess,
  sparkAccessToken,
  sparkFunnelStatus,
  sparkMcpPath,
  sparkMcpUrl,
};
