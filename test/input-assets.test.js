'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { Readable } = require('stream');
const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const {
  MAX_INPUT_BYTES,
  inputAssetPath,
  receiveInputFile,
  multipartFileUpload,
} = require('../lib/input-assets');

test('durable input paths are stable, flat, and preserve a safe extension', () => {
  const directory = path.join(os.tmpdir(), 'mix-inputs');
  const first = inputAssetPath(directory, 'folder/clip.mp4');
  assert.equal(first, inputAssetPath(directory, 'folder/clip.mp4'));
  assert.equal(path.dirname(first), directory);
  assert.equal(path.extname(first), '.mp4');
  assert.equal(MAX_INPUT_BYTES, 2 * 1024 * 1024 * 1024);
});

test('input uploads stream to disk and remove partial files over the limit', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-input-'));
  const stored = path.join(directory, 'stored.bin');
  await receiveInputFile(Readable.from([Buffer.from('abc'), Buffer.from('def')]), stored, 8);
  assert.equal(await fsp.readFile(stored, 'utf8'), 'abcdef');
  const partial = path.join(directory, 'partial.bin');
  await assert.rejects(receiveInputFile(Readable.from([Buffer.alloc(9)]), partial, 8), /upload limit/);
  await assert.rejects(fsp.access(partial));
  await fsp.rm(directory, { recursive: true, force: true });
});

test('ComfyUI multipart bodies stream the stored file with an exact length', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-multipart-'));
  const stored = path.join(directory, 'clip.bin');
  await fsp.writeFile(stored, 'video-bytes');
  const upload = await multipartFileUpload(stored, 'clip.mp4');
  const chunks = [];
  for await (const chunk of upload.body) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  assert.equal(body.length, upload.contentLength);
  assert.match(body.toString(), /filename="clip\.mp4"/);
  assert.ok(body.includes(Buffer.from('video-bytes')));
  await fsp.rm(directory, { recursive: true, force: true });
});

test('uploaded inputs are stored locally, streamed to ComfyUI, and served with range support', () => {
  assert.match(serverSource, /const INPUTS = path\.join\(DATA, 'inputs'\)/);
  assert.match(serverSource, /await receiveInputFile\(req, temporary, MAX_INPUT_BYTES\)/);
  assert.match(serverSource, /uploadFileToComfy\(temporary, name\)/);
  assert.match(serverSource, /const durable = inputAssetPath\(INPUTS, comfyName\)/);
  assert.match(serverSource, /return serveFile\(res, local, req\.headers\.range\)/);
  assert.match(serverSource, /older inputs fall back to ComfyUI/);
});
