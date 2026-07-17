'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  uploadedAssetKind,
  containsExactString,
  uploadedAssetUsage,
  publicUploadedAsset,
} = require('../lib/uploaded-assets');

test('uploadedAssetKind recognizes reusable image, video, and audio files', () => {
  assert.equal(uploadedAssetKind('portrait.PNG'), 'image');
  assert.equal(uploadedAssetKind('camera.MOV'), 'video');
  assert.equal(uploadedAssetKind('voice.m4a'), 'audio');
  assert.equal(uploadedAssetKind('capture', 'video/webm; codecs=vp9'), 'video');
  assert.equal(uploadedAssetKind('notes.bin'), 'file');
});

test('containsExactString only matches complete stored asset names', () => {
  const value = { refs: [{ name: 'ks_input.png' }], label: 'ks_input.png thumbnail' };
  assert.equal(containsExactString(value, 'ks_input.png'), true);
  assert.equal(containsExactString(value, 'ks_input'), false);
  value.self = value;
  assert.equal(containsExactString(value, 'missing'), false);
});

test('uploadedAssetUsage scopes references to the owning profile', () => {
  const asset = { name: 'ks_voice.wav', profileId: 'owner' };
  const usage = uploadedAssetUsage(asset, {
    items: [
      { profileId: 'owner', info: { audioName: 'ks_voice.wav' } },
      { profileId: 'guest', info: { audioName: 'ks_voice.wav' } },
    ],
    jobs: [{ profileId: 'owner', params: { audioName: 'ks_voice.wav' } }],
  });
  assert.deepEqual(usage, { savedGenerations: 1, activeJobs: 1, inUse: true });
});

test('publicUploadedAsset excludes ownership and deletion metadata', () => {
  assert.deepEqual(publicUploadedAsset({
    id: 'a1', profileId: 'owner', name: 'ks_image.png', label: 'Image.png', kind: 'image',
    size: 120, hasAudio: false, createdAt: 10, deletedAt: 20,
  }), {
    id: 'a1', name: 'ks_image.png', label: 'Image.png', kind: 'image', size: 120,
    hasAudio: false, createdAt: 10,
  });
});
