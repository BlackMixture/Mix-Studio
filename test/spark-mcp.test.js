'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  handleMcpPayload,
  mcpToolDefinitions,
} = require('../lib/spark-mcp');
const {
  disableSparkFunnel,
  enableSparkFunnel,
  inspectSparkFunnelConfig,
  newSparkAccessToken,
  normalizeSparkAccess,
  sparkMcpPath,
  sparkMcpUrl,
} = require('../lib/spark-access');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const cssSource = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Spark access uses a high-entropy URL-safe MCP capability path', () => {
  const token = newSparkAccessToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(sparkMcpPath(token), `/mcp/${token}`);
  assert.equal(
    sparkMcpUrl('mix-pc.example-tailnet.ts.net.', token),
    `https://mix-pc.example-tailnet.ts.net:8443/mcp/${token}`,
  );
  assert.deepEqual(normalizeSparkAccess({ enabled: true, token: 'short', profileId: 'owner' }), {
    enabled: false, token: '', profileId: 'owner', createdAt: 0,
  });
});

test('MCP initialization and tool discovery are Streamable HTTP compatible', async () => {
  const initialized = await handleMcpPayload({
    jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2026-07-28' },
  }, { version: '1.2.3' });
  assert.equal(initialized.result.protocolVersion, '2026-07-28');
  assert.equal(initialized.result.serverInfo.name, 'mix-studio');
  assert.equal(initialized.result.serverInfo.version, '1.2.3');
  assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } });

  const listed = await handleMcpPayload({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const names = listed.result.tools.map((tool) => tool.name);
  assert.deepEqual(names, [
    'mix_studio_status',
    'mix_studio_recent_generations',
    'mix_studio_generate_image',
    'mix_studio_generate_video',
  ]);
  assert.equal(mcpToolDefinitions().filter((tool) => tool.annotations.destructiveHint).length, 0);
});

test('MCP tool calls return structured results and contained errors', async () => {
  const ok = await handleMcpPayload({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'mix_studio_status', arguments: {} },
  }, { callTool: async () => ({ ok: true, running: 0 }) });
  assert.deepEqual(ok.result.structuredContent, { ok: true, running: 0 });
  assert.equal(ok.result.isError, false);

  const failed = await handleMcpPayload({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'unknown', arguments: {} },
  }, { callTool: async () => { const error = new Error('Unknown tool'); error.code = 'unknown_tool'; throw error; } });
  assert.equal(failed.result.isError, true);
  assert.equal(failed.result.structuredContent.code, 'unknown_tool');
  assert.equal(await handleMcpPayload({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
});

test('Spark Funnel is isolated on 8443 and never promotes an existing private route', async () => {
  const token = 'a'.repeat(43);
  const dnsName = 'mix-pc.example-tailnet.ts.net';
  const endpoint = `/mcp/${token}`;
  const expectedProxy = `http://127.0.0.1:3300${endpoint}`;
  const configured = inspectSparkFunnelConfig({
    Web: {
      [`${dnsName}:8443`]: { Handlers: { [endpoint]: { Proxy: expectedProxy } } },
    },
    AllowFunnel: { [`${dnsName}:8443`]: true },
  }, { dnsName, token, appPort: 3300 });
  assert.equal(configured.configured, true);
  assert.equal(configured.conflict, false);

  const privateConflict = inspectSparkFunnelConfig({
    Web: {
      [`${dnsName}:8443`]: { Handlers: { '/private': { Proxy: 'http://127.0.0.1:9000' } } },
    },
  }, { dnsName, token, appPort: 3300 });
  assert.equal(privateConflict.configured, false);
  assert.equal(privateConflict.conflict, true);
});

test('enabling and disabling Spark Funnel uses only the secret MCP mount', async () => {
  const calls = [];
  const token = 'b'.repeat(43);
  const runTailscaleFn = async (args) => {
    calls.push(args);
    if (args[0] === 'status') {
      return { output: JSON.stringify({ Self: { DNSName: 'mix-pc.example-tailnet.ts.net.' } }) };
    }
    if (args[0] === 'serve') return { output: '{}' };
    return { output: 'ok' };
  };
  const enabled = await enableSparkFunnel(token, 3300, { runTailscaleFn });
  assert.equal(enabled.url, `https://mix-pc.example-tailnet.ts.net:8443/mcp/${token}`);
  assert.deepEqual(calls[2], [
    'funnel', '--bg', '--yes', '--https=8443', `--set-path=/mcp/${token}`,
    `http://127.0.0.1:3300/mcp/${token}`,
  ]);
  await disableSparkFunnel(token, { runTailscaleFn });
  assert.deepEqual(calls[3], [
    'funnel', '--https=8443', `--set-path=/mcp/${token}`, 'off',
  ]);
});

test('enabling Spark accepts an empty Serve status from a fresh Tailscale install', async () => {
  const calls = [];
  const token = 'c'.repeat(43);
  const enabled = await enableSparkFunnel(token, 3300, {
    runTailscaleFn: async (args) => {
      calls.push(args);
      if (args[0] === 'status') {
        return { output: JSON.stringify({ Self: { DNSName: 'fresh-pc.example-tailnet.ts.net.' } }) };
      }
      if (args[0] === 'serve') return { output: '' };
      return { output: 'ok' };
    },
  });
  assert.equal(enabled.configured, true);
  assert.equal(calls.at(-1)[0], 'funnel');
});

test('Spark MCP is owner-scoped and validates its capability path and protocol version', () => {
  assert.match(serverSource, /url\.pathname\.startsWith\('\/mcp\/'\)[\s\S]{0,80}handleSparkMcp/);
  assert.match(serverSource, /crypto\.timingSafeEqual\(Buffer\.from\(supplied\), Buffer\.from\(expected\)\)/);
  assert.match(serverSource, /profile\.id !== db\.profiles\[0\]\?\.id/);
  assert.match(serverSource, /req\.headers\['mcp-protocol-version'\]/);
  assert.match(serverSource, /origin !== 'https:\/\/gemini\.google\.com'/);
  assert.match(serverSource, /readBody\(req, 1024 \* 1024\)/);
  assert.match(serverSource, /url\.pathname\.startsWith\('\/mcp\/'\) \? '\/mcp\/\[redacted\]'/);
});

test('Preferences exposes owner-managed Spark connection controls with responsive styling', () => {
  assert.match(htmlSource, /id="sparkAccessCard"[\s\S]*id="sparkAccessEnable"[\s\S]*id="sparkAccessDisable"/);
  assert.match(htmlSource, /Destructive and administrative controls are not exposed/);
  assert.match(htmlSource, /Tailscale Funnel on HTTPS port 8443[\s\S]*secret MCP path/);
  assert.match(appSource, /api\('\/api\/spark-access\/enable', \{ method: 'POST' \}\)/);
  assert.match(appSource, /api\('\/api\/spark-access\/disable', \{ method: 'POST' \}\)/);
  assert.match(appSource, /copyTextToClipboard\(url\); toast\('Gemini Spark MCP URL copied'\)/);
  assert.match(cssSource, /\.spark-access-card\s*\{[^}]*display:\s*grid/);
  assert.match(cssSource, /@media \(max-width:\s*680px\)[\s\S]*\.spark-access-url\s*\{[^}]*grid-template-columns:\s*1fr/);
});
