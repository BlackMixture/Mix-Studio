'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  approvalUrl,
  enableTailscaleHttps,
  inspectServeConfig,
  isTailscaleAddress,
  mobileAccessAddresses,
  mobileAccessSummary,
  tailscaleDnsName,
  tailscaleHttpsStatus,
} = require('../lib/mobile-access');

test('recognizes Tailscale adapters and carrier-grade private addresses', () => {
  assert.equal(isTailscaleAddress('Tailscale', '100.80.2.3'), true);
  assert.equal(isTailscaleAddress('Ethernet', '100.64.0.8'), true);
  assert.equal(isTailscaleAddress('Wi-Fi', '192.168.1.20'), false);
});

test('prints private Tailscale phone access before local network addresses', () => {
  const addresses = mobileAccessAddresses({
    'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.1.20' }],
    Tailscale: [{ family: 'IPv4', internal: false, address: '100.90.8.7' }],
    Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
  });
  assert.deepEqual(addresses, [
    { name: 'Tailscale', address: '100.90.8.7', tailscale: true },
    { name: 'Wi-Fi', address: '192.168.1.20', tailscale: false },
  ]);
});

test('builds copyable same-Wi-Fi and Tailscale URLs for onboarding', () => {
  const summary = mobileAccessSummary({
    WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.22' }],
    Tailscale: [{ family: 'IPv4', internal: false, address: '100.91.2.3' }],
  }, 3300);
  assert.equal(summary.tailscaleDetected, true);
  assert.equal(summary.tailscaleUrl, 'http://100.91.2.3:3300');
  assert.equal(summary.localUrl, 'http://192.168.1.22:3300');
  assert.match(summary.downloadUrl, /^https:\/\/tailscale\.com\//);
});

test('reads the private DNS name used by an installable Tailscale HTTPS origin', () => {
  assert.equal(tailscaleDnsName({ Self: { DNSName: 'mix-pc.example-tailnet.ts.net.' } }), 'mix-pc.example-tailnet.ts.net');
  assert.equal(tailscaleDnsName({ Self: { DNSName: 'not a host' } }), '');
});

test('detects an existing Mix Studio Serve proxy without replacing other apps', () => {
  assert.deepEqual(inspectServeConfig({
    Web: {
      'mix-pc.example-tailnet.ts.net:443': {
        Handlers: { '/': { Proxy: 'http://127.0.0.1:3300' } },
      },
    },
  }, 3300), { configured: true, conflict: false, empty: false });

  const conflict = inspectServeConfig({
    Web: {
      'mix-pc.example-tailnet.ts.net:443': {
        Handlers: { '/': { Proxy: 'http://127.0.0.1:8080' } },
      },
    },
  }, 3300);
  assert.equal(conflict.configured, false);
  assert.equal(conflict.conflict, true);

  const fileServerConflict = inspectServeConfig({
    Web: {
      'mix-pc.example-tailnet.ts.net:443': {
        Handlers: { '/': { Path: 'C:\\another-app' } },
      },
    },
  }, 3300);
  assert.equal(fileServerConflict.configured, false);
  assert.equal(fileServerConflict.conflict, true);
});

test('only accepts Tailscale approval links', () => {
  assert.equal(
    approvalUrl('Open https://login.tailscale.com/admin/feature/abc to continue'),
    'https://login.tailscale.com/admin/feature/abc',
  );
  assert.equal(approvalUrl('Open https://example.com/not-safe'), '');
});

test('enables a private HTTPS proxy only after checking the existing Serve config', async () => {
  const calls = [];
  const options = {
    platform: 'win32',
    env: {},
    existsSync: () => false,
    execFileFn: (_command, args, _execOptions, callback) => {
      calls.push(args);
      if (args[0] === 'status') {
        callback(null, JSON.stringify({ Self: { DNSName: 'mix-pc.example-tailnet.ts.net.' } }), '');
      } else if (args[1] === 'status') {
        callback(null, JSON.stringify({}), '');
      } else {
        callback(null, 'Available within your tailnet', '');
      }
    },
  };
  const result = await enableTailscaleHttps(3300, options);
  assert.equal(result.secureUrl, 'https://mix-pc.example-tailnet.ts.net');
  assert.deepEqual(calls, [
    ['status', '--json'],
    ['serve', 'status', '--json'],
    ['serve', '--bg', '--yes', 'http://127.0.0.1:3300'],
  ]);
});

test('reports an existing Mix Studio HTTPS proxy as the preferred secure origin', async () => {
  const result = await tailscaleHttpsStatus(3300, {
    platform: 'win32',
    env: {},
    existsSync: () => false,
    execFileFn: (_command, args, _execOptions, callback) => {
      if (args[0] === 'status') {
        callback(null, JSON.stringify({ Self: { DNSName: 'mix-pc.example-tailnet.ts.net.' } }), '');
      } else {
        callback(null, JSON.stringify({
          Web: {
            'mix-pc.example-tailnet.ts.net:443': {
              Handlers: { '/': { Proxy: 'http://127.0.0.1:3300' } },
            },
          },
        }), '');
      }
    },
  });
  assert.equal(result.configured, true);
  assert.equal(result.secureUrl, 'https://mix-pc.example-tailnet.ts.net');
});
