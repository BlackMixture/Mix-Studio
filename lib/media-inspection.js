'use strict';

const fs = require('fs');

const AUDIO_EXTENSIONS = new Set([
  '.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.opus', '.wav', '.wma',
]);
const MP4_EXTENSIONS = new Set(['.3g2', '.3gp', '.m4v', '.mov', '.mp4']);
const WEBM_EXTENSIONS = new Set(['.mkv', '.webm']);

function extensionOf(filename) {
  const match = String(filename || '').toLowerCase().match(/(\.[a-z0-9]+)$/);
  return match ? match[1] : '';
}

function mp4HasAudio(buffer) {
  const marker = Buffer.from('hdlr');
  let offset = 0;
  while (offset < buffer.length) {
    const index = buffer.indexOf(marker, offset);
    if (index < 0) return false;
    // ISO BMFF HandlerReferenceBox: type + version/flags + pre_defined,
    // followed by the four-byte handler type (`soun` for an audio track).
    if (index + 16 <= buffer.length && buffer.toString('ascii', index + 12, index + 16) === 'soun') return true;
    offset = index + marker.length;
  }
  return false;
}

function webmHasAudio(buffer) {
  // Common Matroska/WebM audio codec identifiers plus TrackType=2.
  const codecIds = ['A_AAC', 'A_AC3', 'A_EAC3', 'A_FLAC', 'A_MPEG', 'A_OPUS', 'A_PCM', 'A_VORBIS'];
  if (codecIds.some((codec) => buffer.indexOf(Buffer.from(codec)) >= 0)) return true;
  return buffer.indexOf(Buffer.from([0x83, 0x81, 0x02])) >= 0;
}

function detectAudioStream(buffer, filename = '') {
  if (!Buffer.isBuffer(buffer)) return null;
  const extension = extensionOf(filename);
  if (AUDIO_EXTENSIONS.has(extension)) return true;
  if (MP4_EXTENSIONS.has(extension) || buffer.indexOf(Buffer.from('ftyp'), 0) >= 0) return mp4HasAudio(buffer);
  if (WEBM_EXTENSIONS.has(extension) || (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3)) {
    return webmHasAudio(buffer);
  }
  return null;
}

async function detectAudioStreamFile(file, filename = '') {
  const extension = extensionOf(filename);
  if (AUDIO_EXTENSIONS.has(extension)) return true;
  const mp4 = MP4_EXTENSIONS.has(extension);
  const webm = WEBM_EXTENSIONS.has(extension);
  if (!mp4 && !webm) return null;
  let carry = Buffer.alloc(0);
  for await (const chunk of fs.createReadStream(file)) {
    const sample = carry.length ? Buffer.concat([carry, chunk]) : chunk;
    if (mp4 ? mp4HasAudio(sample) : webmHasAudio(sample)) return true;
    carry = sample.subarray(Math.max(0, sample.length - 64));
  }
  return false;
}

module.exports = { detectAudioStream, detectAudioStreamFile, mp4HasAudio, webmHasAudio };
