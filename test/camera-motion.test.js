'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const {
  CAMERA_MOTIONS,
  applyCameraMotionPrompt,
  cameraMotionPhrase,
  normalizeCameraMotions,
} = require('../public/camera-motion');

test('camera motion catalog includes core and captured guides with real assets', () => {
  assert.ok(CAMERA_MOTIONS.length >= 24);
  assert.ok(CAMERA_MOTIONS.some((motion) => motion.id === 'pan-left' && motion.collection === 'Core moves'));
  assert.ok(CAMERA_MOTIONS.some((motion) => motion.id === 'handheld-orbit-cw' && motion.collection === 'Handheld & FPV'));
  assert.ok(CAMERA_MOTIONS.some((motion) => motion.id === 'fpv-zoom-track-right'));
  for (const motion of CAMERA_MOTIONS) {
    const asset = path.join(root, 'public', 'camera-motions', motion.asset);
    assert.equal(fs.existsSync(asset), true, `${motion.id} has a preview/reference asset`);
    const header = fs.readFileSync(asset).subarray(4, 8).toString('ascii');
    assert.equal(header, 'ftyp', `${motion.asset} is an MP4`);
  }
});

test('camera selections preserve order, reject duplicates, and cap at three', () => {
  assert.deepEqual(
    normalizeCameraMotions(['truck-left', 'truck-left', 'zoom-in', 'bad-id', 'tilt-up', 'roll-cw']),
    ['truck-left', 'zoom-in', 'tilt-up']
  );
  assert.equal(
    cameraMotionPhrase(['truck-left', 'zoom-in', 'tilt-up']),
    'Camera motion: begin with a lateral truck to the left, continue with an optical zoom in, and finish with an upward tilt.'
  );
});

test('applying a new camera sequence replaces the previous generated phrase', () => {
  const first = applyCameraMotionPrompt('A person crosses the street', '', ['pan-left']);
  assert.match(first.prompt, /Camera motion: pan smoothly to the left\.$/);
  const second = applyCameraMotionPrompt(first.prompt, first.phrase, ['dolly-in', 'orbit-does-not-exist', 'roll-cw']);
  assert.doesNotMatch(second.prompt, /pan smoothly/);
  assert.match(second.prompt, /begin with a forward dolly toward the subject, then use a clockwise roll/);
});

test('video UI exposes an ordered, animated camera motion picker', () => {
  assert.match(html, /id="videoCameraMotionBtn"/);
  assert.match(html, /id="videoCameraMotionSheet"/);
  assert.match(html, /id="cameraMotionSequence"/);
  assert.match(html, /id="cameraMotionGrid"/);
  assert.match(html, /id="cameraMotionApply"[^>]*>Apply to prompt/);
  assert.ok(html.indexOf('/camera-motion.js') < html.indexOf('/app.js'));
  assert.match(app, /cameraMotions: CameraMotion \? CameraMotion\.normalizeCameraMotions/);
  assert.match(app, /components\.add\('ltxcamera'\)/);
  assert.match(app, /camera-motion-grid-heading/);
  assert.match(css, /\.camera-motion-card-media[\s\S]*aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.camera-motion-grid-heading/);
});

test('standard LTX jobs can load Cameraman v2 and sequence video guides', () => {
  assert.match(server, /ltxCameramanLora: 'LTX2\.3-22B_IC-LoRA-Cameraman_v2_14000\.safetensors'/);
  assert.match(server, /nodeFromOrdered\(\s*'LTXICLoRALoaderModelOnly'/);
  assert.match(server, /'LTXAddVideoICLoRAGuide'/);
  assert.match(server, /'LTXVImgToVideoConditionOnly'/);
  assert.match(server, /uploadCameraMotionGuides\(cameraMotions\)/);
  assert.match(server, /cameraReferenceGuided: cameraMotionGuideNames\.length > 0/);
  assert.match(server, /cameraMotionDims\(srcW, srcH\)/);
});
