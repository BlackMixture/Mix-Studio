'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isTailscaleAddress, mobileAccessAddresses } = require('../lib/mobile-access');

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
