'use strict';

const fs = require('node:fs');
const fsp = fs.promises;
const { once } = require('node:events');

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}

function updateCrc32(crc, chunk) {
  let value = crc >>> 0;
  for (const byte of chunk) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((Math.floor(date.getSeconds() / 2)) & 31),
    date: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
  };
}

async function writeChunk(output, chunk) {
  if (!output.write(chunk)) await once(output, 'drain');
}

function localHeader(name, stamp) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6); // UTF-8 + data descriptor
  header.writeUInt16LE(0, 8); // stored, no compression
  header.writeUInt16LE(stamp.time, 10);
  header.writeUInt16LE(stamp.date, 12);
  header.writeUInt16LE(name.length, 26);
  return header;
}

function dataDescriptor(crc, size) {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(crc >>> 0, 4);
  descriptor.writeUInt32LE(size >>> 0, 8);
  descriptor.writeUInt32LE(size >>> 0, 12);
  return descriptor;
}

function centralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.stamp.time, 12);
  header.writeUInt16LE(entry.stamp.date, 14);
  header.writeUInt32LE(entry.crc >>> 0, 16);
  header.writeUInt32LE(entry.size >>> 0, 20);
  header.writeUInt32LE(entry.size >>> 0, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt32LE(entry.offset >>> 0, 42);
  return header;
}

async function streamStoredZip(output, entries = []) {
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(String(entry.name || 'image.png'), 'utf8');
    const stat = await fsp.stat(entry.path);
    if (stat.size > 0xffffffff || offset > 0xffffffff) throw new Error('ZIP64 is required for files larger than 4 GB');
    const stamp = dosDateTime(stat.mtime);
    const start = offset;
    const header = localHeader(name, stamp);
    await writeChunk(output, header);
    await writeChunk(output, name);
    offset += header.length + name.length;
    let crc = 0xffffffff;
    let size = 0;
    for await (const chunk of fs.createReadStream(entry.path)) {
      crc = updateCrc32(crc, chunk);
      size += chunk.length;
      await writeChunk(output, chunk);
      offset += chunk.length;
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = dataDescriptor(crc, size);
    await writeChunk(output, descriptor);
    offset += descriptor.length;
    central.push({ name, stamp, crc, size, offset: start });
  }
  const centralOffset = offset;
  for (const entry of central) {
    const header = centralHeader(entry);
    await writeChunk(output, header);
    await writeChunk(output, entry.name);
    offset += header.length + entry.name.length;
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(offset - centralOffset, 12);
  end.writeUInt32LE(centralOffset, 16);
  await new Promise((resolve, reject) => {
    output.once('finish', resolve);
    output.once('error', reject);
    output.end(end);
  });
}

module.exports = { dosDateTime, streamStoredZip, updateCrc32 };
