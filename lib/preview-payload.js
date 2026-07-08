'use strict';

function imageMime(image, format) {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return 'image/jpeg';
  if (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (image.length >= 12 && image.subarray(0, 4).toString('ascii') === 'RIFF' && image.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return format === 2 ? 'image/png' : 'image/jpeg';
}

function decodePreviewPayload(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 9) return null;
  const eventType = buffer.readUInt32BE(0);
  if (eventType !== 1) return null;
  const format = buffer.readUInt32BE(4);
  const image = buffer.subarray(8);
  if (!image.length) return null;
  return { mime: imageMime(image, format), image };
}

module.exports = { decodePreviewPayload };
