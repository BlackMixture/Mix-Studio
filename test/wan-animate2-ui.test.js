'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const dependencies = fs.readFileSync(path.join(root, 'lib', 'dependency-installer.js'), 'utf8');
const progress = require('../lib/progress-labels');

test('Wan Animate 2 presents an input-first character animation workflow', () => {
  assert.match(html, /data-engine="wan-animate2"[^>]*data-task-label="Character Animation"[^>]*data-model-label="Wan Animate 2"/);
  assert.doesNotMatch(html, /id="vidWanAnimate2InputNote"/);
  assert.doesNotMatch(html, /Match the framing/);
  assert.doesNotMatch(app, /vidWanAnimate2InputNote/);
  assert.match(app, /'Character image'/);
  assert.match(app, /'Performance video'/);
  assert.match(app, /'Scene direction · optional'/);
  assert.match(app, /formatVideoDuration\(duration\)[^\n]*source timing \+ audio/);
  assert.match(app, /videoDurationMax\(engine\)[\s\S]*engine === 'wan-animate2'[\s\S]*state\.vidDrive\?\.dur/);
  assert.match(app, /state\.vidEngine === 'wan-animate2' && f\.dur > 0[\s\S]*Math\.round\(f\.dur \* 10\) \/ 10/);
  assert.doesNotMatch(app, /vidDurationField'\)\.hidden = isVideo && state\.vidEngine === 'wan-animate2'/);
  assert.match(fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8'),
    /\.wan-animate2-prompt \.prompt-camera-btn\s*\{[^}]*right:\s*10px/);
});

test('Wan Animate 2 validates both media inputs and sends model-specific controls', () => {
  assert.match(app, /Wan Animate 2 needs a performance video for motion and expression/);
  assert.match(app, /wanAnimate2IdentityStrength: state\.vidEngine === 'wan-animate2'/);
  assert.match(app, /wanAnimate2MotionStrength: state\.vidEngine === 'wan-animate2'/);
  assert.match(app, /driveVideoName: \(\['scail', 'wan-animate2'\]\.includes\(state\.vidEngine\)/);
  assert.match(server, /buildWanAnimate2Graph\(comfyName, opts, settings/);
  assert.match(server, /resolveDurableUploadedVideo\(INPUTS, driveVideoName\)/);
  assert.match(server, /probeVideoFile\(durablePerformance\.file, videoExtensionFfmpeg\)/);
  assert.match(server, /wanAnimate2ContinuationPlan\([\s\S]*sourceFrames: performanceProbe\.frames[\s\S]*sourceFps: performanceProbe\.fps/);
  assert.match(server, /frames = wanAnimate2Plan\.outputFrames/);
  assert.match(server, /fps = wanAnimate2Plan\.fps/);
  assert.match(server, /prepareWanAnimate2Performance\(\{/);
  assert.match(server, /type: 'wan-animate2'/);
  assert.match(server, /await joinWanAnimate2Chunks\(\{/);
  assert.match(server, /continuationImageName = await uploadToComfy/);
  assert.match(server, /needsVideoReconciliation/);
});

test('Wan Animate 2 setup installs the official native workflow models', () => {
  assert.match(app, /'wan-animate2': 'wananimate2'/);
  assert.match(dependencies, /Comfy-Org\/Wan-Animate-2/);
  assert.match(dependencies, /wan_animate_2_int8_convrot\.safetensors/);
  assert.match(dependencies, /lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16\.safetensors/);
  assert.match(dependencies, /wananimate2: \{ label: 'Wan Animate 2 Character Animation', nodes: \[\], models: \['wanAnimate2'\] \}/);
  assert.match(html, /id="setWanAnimate2Unet"/);
  assert.match(html, /id="setWanAnimate2Lora"/);
  assert.match(server, /function wanAnimate2CoreCompatibility/);
  assert.match(app, /setupWanAnimate2CoreBlocked/);
  assert.match(app, /components: \['h3'[^\n]*'wananimate2'/);
});

test('Wan Animate 2 reuse and documentation retain its performance inputs', () => {
  assert.match(app, /\['scail', 'wan-animate2'\]\.includes\(engine\) && info\.driveVideoName/);
  assert.match(app, /\? 'Character Image'/);
  assert.match(app, /\? 'Performance Video'/);
  assert.match(app, /Source timing \+ audio/);
});

test('Wan Animate 2 progress uses character-animation labels', () => {
  const job = {
    kind: 'video',
    videoInfo: { engine: 'wan-animate2' },
    graph: {
      model: { class_type: 'UNETLoader' },
      conditioning: { class_type: 'WanAnimate2ToVideo' },
      parts: { class_type: 'GetVideoComponents' },
    },
  };
  assert.equal(progress.nodeLabelForJob(job, 'model'), 'Loading Wan Animate 2...');
  assert.equal(progress.nodeLabelForJob(job, 'conditioning'), 'Preparing character animation...');
  assert.equal(progress.nodeLabelForJob(job, 'parts'), 'Reading source timing and audio...');
});
