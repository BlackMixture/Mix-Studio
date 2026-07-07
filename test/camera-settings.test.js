'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CAMERA_PRESETS,
  LENS_PRESETS,
  CAMERA_COMBOS,
  DEFAULT_CAMERA_SETTINGS,
  applyCameraCombo,
  cameraPromptPhrase,
  applyCameraPrompt,
} = require('../public/camera-settings');

test('camera settings expose practical camera and lens choices', () => {
  assert.ok(CAMERA_PRESETS.some((camera) => camera.id === 'iphone'));
  assert.ok(CAMERA_PRESETS.some((camera) => camera.id === 'canon80d'));
  assert.ok(CAMERA_PRESETS.some((camera) => camera.id === 'redkomodo'));
  assert.ok(CAMERA_PRESETS.some((camera) => camera.id === 'arri35'));
  assert.ok(LENS_PRESETS.some((lens) => lens.id === 'spherical-prime'));
});

test('camera settings include recommended combos for common aesthetics', () => {
  assert.ok(CAMERA_COMBOS.some((combo) => combo.id === 'cinematic-arri'));
  assert.ok(CAMERA_COMBOS.some((combo) => combo.id === 'dslr-portrait'));
  assert.ok(CAMERA_COMBOS.some((combo) => combo.id === 'iphone-natural'));

  assert.deepEqual(
    applyCameraCombo('dslr-portrait', DEFAULT_CAMERA_SETTINGS),
    {
      camera: 'canon80d',
      lens: 'photo-zoom',
      focalLength: '85',
      aperture: '2.8',
      shutter: '1/250',
      iso: '200',
    }
  );
});

test('cameraPromptPhrase builds a natural image prompt fragment', () => {
  assert.equal(
    cameraPromptPhrase({
      camera: 'arri35',
      lens: 'spherical-prime',
      focalLength: '35',
      aperture: '4',
      shutter: '1/125',
      iso: '400',
    }),
    'shot on ARRI Alexa 35, premium spherical prime lens, 35mm, f/4, 1/125s shutter, ISO 400'
  );
});

test('applyCameraPrompt appends once and replaces previous camera settings', () => {
  const first = applyCameraPrompt('cinematic portrait', DEFAULT_CAMERA_SETTINGS);
  assert.match(first, /cinematic portrait, shot on/);

  const second = applyCameraPrompt(first, {
    camera: 'canon80d',
    lens: 'photo-zoom',
    focalLength: '50',
    aperture: '2.8',
    shutter: '1/250',
    iso: '200',
  });

  assert.equal(
    second,
    'cinematic portrait, shot on Canon EOS 80D DSLR, Canon EF photo zoom lens, 50mm, f/2.8, 1/250s shutter, ISO 200'
  );
});
