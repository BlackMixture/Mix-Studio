'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Face ID freezes an uploaded voice into the audio latent (identity-locked lipsync)', () => {
  // The shared frozen-audio chain: LoadAudio → LTXVAudioVAEEncode →
  // SolidMask(0.0) → SetLatentNoiseMask. A 0.0 noise mask means the audio
  // latent is kept, so the joint AV denoise conforms the lips to it.
  assert.match(server, /function audioLatentNodes\(graph, audioName\)/);
  assert.match(server, /class_type: 'LoadAudio', inputs: \{ audio: audioName \}/);
  assert.match(server, /class_type: 'LTXVAudioVAEEncode'/);
  assert.match(server, /class_type: 'SolidMask', inputs: \{ value: 0/);
  assert.match(server, /class_type: 'SetLatentNoiseMask', inputs: \{ samples: \['audio_enc', 0\], mask: \['amask', 0\] \}/);

  // buildAnimateFaceId consumes it: custom audio when provided, otherwise an
  // empty audio latent lets the model invent a voice from the prompt.
  const faceId = server.slice(server.indexOf('async function buildAnimateFaceId'), server.indexOf('buildAnimateEros'));
  assert.match(faceId, /if \(opts\.audioName\) \{\s*audioLatent = audioLatentNodes\(graph, opts\.audioName\);/);
  assert.match(faceId, /'LTXVEmptyLatentAudio'/);
  assert.match(faceId, /class_type: 'LTXVConcatAVLatent',\s*inputs: \{ video_latent: \['latent1', 0\], audio_latent: audioLatent \}/);
  assert.match(faceId, /'LTXIdentityOverlapConditioning'/);
  assert.match(faceId, /class_type: 'LTXVSeparateAVLatent'/);
  assert.match(faceId, /class_type: 'LTXVAudioVAEDecode'/);

  // The route forwards audio for the LTX engine (Face ID rides engine 'ltx').
  assert.match(server, /const isLtxLike = engine === 'ltx' \|\| engine === 'eros'/);
  assert.match(server, /const audioName = isLtxLike && body\.audioName/);
});

test('the video UI presents Face ID audio as lipsync and keeps the chip available', () => {
  assert.match(app, /Voice locked · lipsync/);
  assert.match(app, /Lips will follow this recording/);
  assert.match(app, /Face ID · lipsync to your voice/);
  assert.match(app, /audioName: vidAudioName/);
  assert.match(app, /chip\.id === 'vidAudioChip'.*renderVidFace\(\)/);
});

test('the image-tools slider fill tracks the thumb across reference, depth, and style ranges', () => {
  assert.match(app, /const fillMin = depthMode \? 5 : 0;/);
  assert.match(app, /const fillMax = depthMode \|\| styleMode \? 200 : 100;/);
  assert.match(app, /const fillPct = \(\(influence - fillMin\) \/ \(fillMax - fillMin\)\) \* 100;/);
  assert.match(app, /setProperty\('--influence', fillPct \+ '%'\)/);
});
