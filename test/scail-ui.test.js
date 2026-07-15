'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('SCAIL advanced controls expose stable chunks, chunk size, and overlap', () => {
  assert.match(indexHtml, /id="vidScailAdvancedRow"/);
  assert.match(indexHtml, /id="vidScailStable"/);
  assert.match(indexHtml, /data-scail-chunk-frames="81"/);
  assert.match(indexHtml, /data-scail-overlap="13"/);
});

test('SCAIL exposes an experimental 24 fps generation rate in Advanced settings', () => {
  assert.match(indexHtml, /id="vidScailFpsField"[\s\S]*data-scail-fps="16"[\s\S]*data-scail-fps="24"/);
  assert.match(indexHtml, /24 fps · experimental/);
  assert.match(appJs, /state\.vidScailFps = 16/);
  assert.match(appJs, /vidScailFps: state\.vidScailFps/);
  assert.match(appJs, /scailFps: state\.vidEngine === 'scail' \? state\.vidScailFps : undefined/);
  assert.match(appJs, /state\.vidScailFps = engine === 'scail' && Number\(info\.scailFps\) === 24 \? 24 : 16/);
});

test('SCAIL hides Camera Motion without removing it from the other video engines', () => {
  assert.match(indexHtml, /id="videoPromptTools"[^>]*>[\s\S]*id="videoCameraMotionBtn"/);
  assert.match(
    appJs,
    /\$\('#videoPromptTools'\)\.hidden = !isVideo \|\| state\.vidEngine === 'scail'/
  );
  assert.match(appJs, /function cameraMotionAvailableForEngine\(engine = state\.vidEngine\) \{\s*return engine !== 'scail';\s*\}/);
  assert.match(appJs, /function openCameraMotionPicker\(\) \{\s*if \(!CameraMotion \|\| !cameraMotionAvailableForEngine\(\)\) return;/);
});

test('SCAIL generation requests do not submit saved Camera Motion selections', () => {
  assert.match(
    appJs,
    /function cameraMotionsForEngine\(engine = state\.vidEngine\) \{\s*if \(!CameraMotion \|\| !cameraMotionAvailableForEngine\(engine\)\) return \[\];\s*return CameraMotion\.normalizeCameraMotions\(state\.videoCameraMotions\);\s*\}/
  );
  assert.match(appJs, /cameraMotions: cameraMotionsForEngine\(\)/);
  assert.match(appJs, /function cameraMotionPromptForEngine\(prompt, engine = state\.vidEngine\)[\s\S]{0,300}CameraMotion\.stripCameraMotionPhrase\(source, state\.videoCameraMotionPhrase\)/);
  assert.match(appJs, /const prompt = state\.view === 'video' \? cameraMotionPromptForEngine\(rawPrompt\) : rawPrompt/);
});

test('the animate endpoint defensively ignores Camera Motion from legacy SCAIL clients', () => {
  assert.match(serverJs, /const requestedCameraMotions = normalizeCameraMotions\(body\.cameraMotions\)/);
  assert.match(serverJs, /const blockedCameraMotionPhrase = engine === 'scail' \? cameraMotionPhrase\(requestedCameraMotions\) : ''/);
  assert.match(serverJs, /const cameraMotions = engine === 'scail' \? \[\] : requestedCameraMotions/);
  assert.match(serverJs, /engine === 'scail'\s*\? stripCameraMotionPhrase\(String\(body\.prompt \|\| ''\)\.trim\(\), blockedCameraMotionPhrase\)/);
});

test('reusing a legacy SCAIL result clears Camera Motion selections and their generated prompt clause', () => {
  assert.match(appJs, /const reusedCameraMotions = CameraMotion \? CameraMotion\.normalizeCameraMotions\(info\.cameraMotions\) : \[\]/);
  assert.match(appJs, /const reusedCameraMotionPhrase = CameraMotion \? CameraMotion\.cameraMotionPhrase\(reusedCameraMotions\) : ''/);
  assert.match(appJs, /state\.videoCameraMotions = engine === 'scail' \? \[\] : reusedCameraMotions/);
  assert.match(appJs, /state\.videoCameraMotionPhrase = engine === 'scail' \? '' : reusedCameraMotionPhrase/);
  assert.match(appJs, /state\.prompts\.video = engine === 'scail' && CameraMotion\s*\? CameraMotion\.stripCameraMotionPhrase\(info\.motionPrompt \|\| '', reusedCameraMotionPhrase\)/);
});

test('SCAIL applies the selected rate to source sampling, generation frames, output, trim, and metadata', () => {
  const buildStart = serverJs.indexOf('async function buildAnimateScail');
  const buildEnd = serverJs.indexOf('/** Optional RIFE interpolation', buildStart);
  const buildSource = serverJs.slice(buildStart, buildEnd);
  assert.ok(buildStart >= 0 && buildEnd > buildStart);
  assert.match(serverJs, /const selectedScailFps = normalizeScailFps\(body\.scailFps\)/);
  assert.match(serverJs, /frames = scailFramesForSeconds\(seconds, fps\)/);
  assert.match(buildSource, /force_rate: opts\.fps/g);
  assert.doesNotMatch(buildSource, /force_rate: 16/);
  assert.match(buildSource, /fps: opts\.fps \* \(opts\.smooth > 1 \? opts\.smooth : 1\)/g);
  assert.match(serverJs, /driveStart \* \(engine === 'scail' \? fps : 16\)/);
  assert.match(serverJs, /scailFps: engine === 'scail' \? opts\.fps : undefined/);
});

test('SCAIL mode selector exposes Infinity as the preferred long-video path', () => {
  assert.match(indexHtml, /id="vidScailModeRow"[^>]*role="group"[^>]*aria-label="SCAIL generation mode"/);
  assert.match(indexHtml, /data-scail-mode="infinity"[\s\S]*data-scail-mode="chunked"[\s\S]*data-scail-mode="direct"/);
  assert.match(appJs, /state\.vidScailMode = 'infinity'/);
  assert.match(appJs, /\$\('#vidScailModeRow'\)\.hidden = !\(isVideo && state\.vidEngine === 'scail'\)/);
  assert.match(appJs, /const scailMode = state\.vidEngine === 'scail'/);
  assert.match(serverJs, /WanSCAILInfinity/);
});

test('SCAIL requests include stable chunk settings and saved videos remember them', () => {
  assert.match(appJs, /scailStableTracking/);
  assert.match(appJs, /scailChunkFrames/);
  assert.match(appJs, /scailChunkOverlap/);
  assert.match(serverJs, /normalizeScailChunkOptions/);
  assert.match(serverJs, /scailStableTracking/);
});

test('SCAIL only extracts driving audio when the uploaded video contains an audio track', () => {
  assert.match(appJs, /driveHasAudio: state\.vidEngine === 'scail'/);
  assert.match(serverJs, /driveAudio: engine === 'scail' && body\.driveHasAudio === true/);
  assert.match(serverJs, /drivenAudio: engine === 'scail' \? opts\.driveAudio === true/);
  assert.match(serverJs, /detectAudioStreamFile\(temporary, orig\)/);
  assert.match(serverJs, /hasAudio: hasAudio === true/);
});

test('SCAIL Infinity uses and reports the Pusa LoRA dependency', () => {
  assert.match(indexHtml, /id="setScailPusaLora"/);
  assert.match(appJs, /scailPusaLora/);
  assert.match(serverJs, /scailPusaLora/);
  assert.match(serverJs, /SCAIL-2 Infinity needs/);
});

test('SCAIL stable chunks track the driving clip once and slice per chunk', () => {
  assert.match(serverJs, /drive_full/);
  assert.match(serverJs, /track_drive_full/);
  assert.match(serverJs, /masks_full/);
  assert.match(serverJs, /GetImageRangeFromBatch/);
});
