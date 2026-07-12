'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { Readable } = require('stream');

const MAX_INPUT_BYTES = 2 * 1024 * 1024 * 1024;

function inputAssetPath(directory, name) {
  const extension = path.extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
  const key = crypto.createHash('sha256').update(String(name || '')).digest('hex');
  return path.join(directory, key + extension);
}

async function receiveInputFile(readable, destination, limit = MAX_INPUT_BYTES) {
  const handle = await fsp.open(destination, 'wx');
  let size = 0;
  try {
    for await (const chunk of readable) {
      size += chunk.length;
      if (size > limit) {
        const error = new Error(`Input exceeds the ${Math.round(limit / 1024 / 1024)} MB upload limit`);
        error.code = 'INPUT_TOO_LARGE';
        throw error;
      }
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        offset += bytesWritten;
      }
    }
    await handle.close();
    return size;
  } catch (error) {
    await handle.close().catch(() => {});
    await fsp.unlink(destination).catch(() => {});
    throw error;
  }
}

async function multipartFileUpload(file, filename) {
  const stat = await fsp.stat(file);
  const boundary = '----mixstudio' + crypto.randomBytes(8).toString('hex');
  const safeFilename = String(filename || 'input.bin').replace(/["\r\n]/g, '_');
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${safeFilename}"\r\n` +
    'Content-Type: application/octet-stream\r\n\r\n',
  );
  const tail = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--${boundary}--\r\n`);
  const body = Readable.from((async function* streamMultipartFile() {
    yield head;
    for await (const chunk of fs.createReadStream(file)) yield chunk;
    yield tail;
  }()));
  return {
    body,
    boundary,
    contentLength: head.length + stat.size + tail.length,
  };
}

module.exports = { MAX_INPUT_BYTES, inputAssetPath, receiveInputFile, multipartFileUpload };
