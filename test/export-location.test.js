'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  normalizeExportDirectory,
  safeExportName,
  validateExportDirectory,
  copyToExportDirectory,
} = require('../lib/export-location');

test('export directories must be absolute and can be cleared', () => {
  assert.equal(normalizeExportDirectory(''), '');
  assert.throws(() => normalizeExportDirectory('Exports'), /full folder path/);
  assert.equal(normalizeExportDirectory('D:\\Exports'), path.normalize('D:\\Exports'));
});

test('export names remove unsafe filename characters', () => {
  assert.equal(safeExportName('portrait: final?.png'), 'portrait- final-.png');
  assert.equal(safeExportName('../../'), 'mix-studio-export');
});

test('validates a writable directory and preserves duplicate exports', async (t) => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mix-export-'));
  t.after(() => fs.promises.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'exports');
  assert.equal(await validateExportDirectory(directory), directory);
  const source = path.join(root, 'source.png');
  await fs.promises.writeFile(source, 'image');
  const first = await copyToExportDirectory(source, directory, 'result.png');
  const second = await copyToExportDirectory(source, directory, 'result.png');
  assert.equal(path.basename(first), 'result.png');
  assert.equal(path.basename(second), 'result (2).png');
});
