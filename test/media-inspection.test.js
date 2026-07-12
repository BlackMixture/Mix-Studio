'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs').promises;
const os = require('node:os');
const path = require('node:path');
const { detectAudioStream, detectAudioStreamFile, mp4HasAudio, webmHasAudio } = require('../lib/media-inspection');

function mp4Handler(type) {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]), Buffer.from('hdlr'),
    Buffer.alloc(8), Buffer.from(type), Buffer.alloc(4),
  ]);
}

test('detects an MP4 audio handler without mistaking a video-only track for audio', () => {
  const videoOnly = Buffer.concat([Buffer.from('....ftypisom....'), mp4Handler('vide')]);
  const withAudio = Buffer.concat([videoOnly, mp4Handler('soun')]);
  assert.equal(mp4HasAudio(videoOnly), false);
  assert.equal(detectAudioStream(videoOnly, 'silent.mp4'), false);
  assert.equal(mp4HasAudio(withAudio), true);
  assert.equal(detectAudioStream(withAudio, 'sound.mp4'), true);
});

test('detects common WebM audio tracks and treats unknown containers conservatively', () => {
  const webmAudio = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('A_OPUS')]);
  assert.equal(webmHasAudio(webmAudio), true);
  assert.equal(detectAudioStream(webmAudio, 'sound.webm'), true);
  assert.equal(detectAudioStream(Buffer.from('not a media container'), 'clip.bin'), null);
});

test('standalone audio uploads are always marked as containing audio', () => {
  assert.equal(detectAudioStream(Buffer.from('RIFF'), 'track.wav'), true);
  assert.equal(detectAudioStream(Buffer.from('ID3'), 'track.mp3'), true);
});

test('large media files can be inspected for audio without buffering the whole file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mix-audio-scan-'));
  const file = path.join(directory, 'clip.mp4');
  await fs.writeFile(file, Buffer.concat([Buffer.alloc(128 * 1024), mp4Handler('soun')]));
  assert.equal(await detectAudioStreamFile(file, 'clip.mp4'), true);
  await fs.rm(directory, { recursive: true, force: true });
});
