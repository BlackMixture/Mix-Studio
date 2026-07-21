'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTailscaleAddress, mobileAccessAddresses, mobileAccessSummary } = require('../lib/mobile-access');

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
