'use strict';

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

module.exports = { isTailscaleAddress, mobileAccessAddresses, mobileAccessSummary };
