'use strict';

const fs = require('fs');
const path = require('path');

function normalizeExportDirectory(value) {
  const directory = String(value || '').trim();
  if (!directory) return '';
  if (directory.includes('\0')) throw new Error('The save folder contains an invalid character');
  if (directory.length > 1024) throw new Error('The save folder path is too long');
  if (!path.isAbsolute(directory) && !path.win32.isAbsolute(directory)) {
    throw new Error('Enter a full folder path, such as D:\\Mix Studio Exports');
  }
  return path.normalize(directory);
}

function safeExportName(value, fallback = 'mix-studio-export') {
  const parsed = path.parse(path.basename(String(value || '')));
  const stem = (parsed.name || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120) || fallback;
  const extension = parsed.ext.replace(/[^.a-z0-9]/gi, '').slice(0, 12);
  return `${stem}${extension}`;
}

async function validateExportDirectory(directory, options = {}) {
  const fsp = options.fsp || fs.promises;
  const normalized = normalizeExportDirectory(directory);
  if (!normalized) return '';
  await fsp.mkdir(normalized, { recursive: true });
  const probe = path.join(normalized, `.mix-studio-write-test-${process.pid}-${Date.now()}`);
  try {
    await fsp.writeFile(probe, 'ok', { flag: 'wx' });
  } catch (error) {
    throw new Error(`Mix Studio cannot write to that folder: ${error.message}`);
  } finally {
    await fsp.unlink(probe).catch(() => {});
  }
  return normalized;
}

async function uniqueExportPath(directory, filename, options = {}) {
  const fsp = options.fsp || fs.promises;
  const safeName = safeExportName(filename);
  const parsed = path.parse(safeName);
  let candidate = path.join(directory, safeName);
  let suffix = 2;
  while (true) {
    try {
      await fsp.access(candidate);
      candidate = path.join(directory, `${parsed.name} (${suffix++})${parsed.ext}`);
    } catch {
      return candidate;
    }
  }
}

async function copyToExportDirectory(source, directory, filename, options = {}) {
  const fsp = options.fsp || fs.promises;
  const target = await uniqueExportPath(directory, filename, { fsp });
  await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  return target;
}

module.exports = {
  normalizeExportDirectory,
  safeExportName,
  validateExportDirectory,
  uniqueExportPath,
  copyToExportDirectory,
};
