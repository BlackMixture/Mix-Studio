'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodePreviewPayload } = require('../lib/preview-payload');

function frame(eventType, format, image) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(eventType, 0);
  header.writeUInt32BE(format, 4);
  return Buffer.concat([header, image]);
}

test('decodes ComfyUI JPEG and PNG preview frames after the eight-byte header', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  assert.deepEqual(decodePreviewPayload(frame(1, 1, jpeg)), { mime: 'image/jpeg', image: jpeg });
  assert.deepEqual(decodePreviewPayload(frame(1, 2, png)), { mime: 'image/png', image: png });
});

test('detects encoded image type even when the format hint is wrong', () => {
  const webp = Buffer.from('RIFFxxxxWEBPpayload', 'ascii');
  assert.equal(decodePreviewPayload(frame(1, 1, webp)).mime, 'image/webp');
});

test('ignores non-preview and malformed websocket payloads', () => {
  assert.equal(decodePreviewPayload(frame(2, 1, Buffer.from('raw'))), null);
  assert.equal(decodePreviewPayload(Buffer.alloc(8)), null);
  assert.equal(decodePreviewPayload(null), null);
});
