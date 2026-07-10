'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const { Writable } = require('node:stream');
const { streamStoredZip } = require('../lib/zip-stream');

test('streamStoredZip writes stored entries and a central directory without buffering the archive', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mixstudio-zip-'));
  const first = path.join(dir, 'first.txt');
  const second = path.join(dir, 'second.txt');
  await fsp.writeFile(first, 'first file');
  await fsp.writeFile(second, 'second file');
  const chunks = [];
  const output = new Writable({ write(chunk, _encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); } });
  await streamStoredZip(output, [
    { name: 'first.txt', path: first },
    { name: 'second.txt', path: second },
  ]);
  const zip = Buffer.concat(chunks);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from('first file')));
  assert.ok(zip.includes(Buffer.from('second file')));
  assert.ok(zip.includes(Buffer.from([0x50, 0x4b, 0x01, 0x02])));
  assert.equal(zip.readUInt32LE(zip.length - 22), 0x06054b50);
  await fsp.rm(dir, { recursive: true, force: true });
});
