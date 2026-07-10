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

module.exports = { isTailscaleAddress, mobileAccessAddresses };
