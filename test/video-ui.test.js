'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Video frame and media inputs use visual source cards', () => {
  assert.match(html, /class="video-input-grid"/);
  for (const id of ['vidAttachBtn', 'vidDriveBtn', 'vidFaceChip', 'vidEndChip', 'vidAudioChip']) {
    assert.match(html, new RegExp(`class="media-input-card" id="${id}"`));
  }
  assert.match(css, /\.media-input-card \{[\s\S]*min-height: 132px/);
  assert.match(css, /\.video-input-grid \.media-input-filled/);
});

test('Video inputs keep start and end frames together, followed by Face ID and audio', () => {
  const start = html.indexOf('id="vidAttachBtn"');
  const end = html.indexOf('id="vidEndChip"');
  const face = html.indexOf('id="vidFaceChip"');
  const audio = html.indexOf('id="vidAudioChip"');
  assert.ok(start > -1 && start < end && end < face && face < audio);
});

test('Video model selection sits above the prompt and collapses after choosing', () => {
  const modelAt = html.indexOf('id="vidModelPanel"');
  const promptAt = html.indexOf('id="promptPanel"');
  assert.ok(modelAt > -1 && modelAt < promptAt);
  assert.match(html, /id="vidModelHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidModelBody"/);
  assert.match(html, /id="vidModelBody" aria-hidden="true" inert/);
  assert.match(html, /id="vidEngineSelected">LTX 2\.3</);
  assert.match(html, /id="engineInfoBtn"[^>]*aria-label="Compare model capabilities"/);
  assert.doesNotMatch(html, />Compare model capabilities<\/button>/);
  assert.match(css, /\.video-model-body[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-model-panel\.expanded \.video-model-body[\s\S]*grid-template-rows: 1fr/);
  assert.match(css, /\.info-btn\.video-model-info \{[\s\S]*width: 34px/);
  assert.match(app, /function setVideoModelExpanded\(open\)/);
  assert.match(app, /setTimeout\(\(\) => setVideoModelExpanded\(false\), 120\)/);
});

test('Secondary video controls remain behind an animated accessible disclosure', () => {
  assert.match(html, /id="vidOptsHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidOptsBody"/);
  assert.match(html, /id="vidOptsBody" aria-hidden="true" inert/);
  assert.match(css, /\.video-options-body \{[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-options-panel\.expanded \.video-options-body \{[\s\S]*grid-template-rows: 1fr/);
  assert.match(app, /function setVideoOptionsExpanded\(open\)/);
});

test('Duration uses a discoverable clock-style scrubber with a larger tap-to-open wheel', () => {
  assert.match(html, /id="vidTimingHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidTimingBody"/);
  assert.match(html, /id="vidTimingBody" aria-hidden="true" inert/);
  assert.match(html, /id="vidDurScrub"[^>]*role="spinbutton"/);
  assert.match(html, /id="vidDurPrev"/);
  assert.match(html, /id="vidDurNext"/);
  assert.match(html, /id="durationPickerSheet"/);
  assert.match(html, /id="durationWheel"[^>]*role="listbox"/);
  assert.match(html, /id="durationPickerDone"/);
  assert.match(html, /id="vidFreeScrub"[^>]*role="spinbutton"/);
  assert.doesNotMatch(html, /id="vid(?:Dur|Free)" type="range"/);
  assert.match(css, /\.video-number-scrubber \{[\s\S]*touch-action: none/);
  assert.match(css, /\.duration-compact-wheel \{/);
  assert.match(css, /\.duration-wheel \{[\s\S]*scroll-snap-type: y mandatory/);
  assert.match(app, /function wireVideoScrubber\(buttonId, inputId, onTap\)/);
  assert.match(app, /function openDurationPicker\(\)/);
  assert.match(app, /wireVideoScrubber\('vidDurScrub', 'vidDur', openDurationPicker\)/);
  assert.match(app, /drag\.y - event\.clientY/);
  assert.match(app, /event\.key === 'ArrowUp'/);
});

test('LTX settings identify their native pipeline and optional RIFE playback', () => {
  assert.match(html, /id="vidLtxGeneration"[^>]*>Two-stage · base \+ refine</);
  assert.match(html, /id="vidLtxPlayback"[^>]*>25 fps · native</);
  assert.match(app, /const ltxFamily = engine === 'ltx' \|\| ltxEdit/);
  assert.match(app, /faceMode \? 'Single-stage · Face ID' : 'Two-stage · base \+ refine'/);
  assert.match(app, /function renderVideoFpsChoices\(\)/);
  assert.match(app, /const baseFps = ltx \? \(state\.vidFace \? 24 : 25\) : 16/);
  assert.match(app, /\$\('#vidFpsRow'\)\.hidden = !\(ltxFamily \|\| wanOrScail\)/);
  assert.match(app, /\$\{baseFps \* multiplier\} fps · RIFE/);
});

test('LTX requests can pass through the same RIFE interpolation stage as Wan and SCAIL', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /const smooth = \(engine === 'ltx' \|\| isLtxEdit \|\| engine === 'wan' \|\| engine === 'scail'\)/);
  assert.match(server, /frameSource = await rifeSmooth\(graph, frameSource, opts\.smooth\);/);
  assert.match(server, /fps: opts\.fps \* \(opts\.smooth > 1 \? opts\.smooth : 1\)/);
});

test('LTX Edit uses a source-video workflow and forces literal edit prompts', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /data-engine="ltx-edit"[^>]*>LTX Edit/);
  assert.match(html, /id="setLtxEditLora"/);
  assert.match(app, /'Describe the edit…'/);
  assert.match(app, /'Source video'/);
  assert.match(app, /enhance: ltxEdit \? false : state\.enhance/);
  assert.match(server, /ltxEditLora: 'edit_anything_v1\.1_r256\.safetensors'/);
  assert.match(server, /class_type: 'LTXVAddGuide'/);
  assert.match(server, /guideVideoName: isLtxEdit \? driveVideoName : null/);
  assert.match(server, /const enhance = isLtxEdit \? false : body\.enhance !== false/);
});

test('Video prompt tools stay hidden and structured audio labels survive state changes', () => {
  assert.match(css, /\.prompt-tools\[hidden\]/);
  assert.match(css, /#vidDriveTools\[hidden\]/);
  assert.match(html, /data-audio-title/);
  assert.match(app, /function setAudioChipVisual\(chip, active\)/);
});

test('SCAIL accepts a driving video without a typed motion prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(app, /const promptOptional = state\.view === 'video' && state\.vidEngine === 'scail';/);
  assert.match(app, /'Optional motion direction…'/);
  assert.match(server, /if \(!suppliedMotionPrompt && engine !== 'scail'\)/);
  assert.match(server, /const motionPrompt = suppliedMotionPrompt \|\| 'preserve the movement from the driving video';/);
});

test('A start-frame action can ask the vision model for a fitting motion prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(html, /id="vidMotionPromptBtn"[^>]*aria-label="Create a motion prompt from this image"/);
  assert.match(app, /#vidMotionPromptBtn'\)\.addEventListener\('click'/);
  assert.match(app, /api\('\/api\/motionprompt'/);
  assert.match(app, /state\.prompts\.video = res\.prompt/);
  assert.match(server, /body\.imageName/);
  assert.match(server, /suggestMotionPrompt\(comfyName/);
});

test('Swapping start and end frames keeps the end-frame input card hidden while its preview is attached', () => {
  assert.match(app, /#vidEndChip'\)\.hidden = faceMode \|\| ltxEdit \|\| !!state\.vidEnd/);
  assert.match(app, /state\.vidRef = state\.vidEnd;[\s\S]*state\.vidEnd = a;[\s\S]*endFrameRefresh\.vidEnd\(\)/);
});

test('Gallery Animate routes an image into the full Video tab as either a start or end frame', () => {
  assert.match(html, /id="animateRouteSheet"/);
  assert.match(html, /id="animateRouteStart"/);
  assert.match(html, /id="animateRouteEnd"/);
  assert.match(app, /function openAnimateRouteSheet\(item\)/);
  assert.match(app, /function sendToVideoTab\(item, role = 'start'\)/);
  assert.match(app, /if \(role === 'end'\) state\.vidEnd = frame/);
  assert.match(app, /else state\.vidRef = frame/);
  assert.match(app, /openAnimateRouteSheet\(it\)/);
});

test('Multiple edit references support hold-and-drag reordering', () => {
  assert.match(app, /function wireRefReorder\(slot, index, maxSlots\)/);
  assert.match(app, /setTimeout\(\(\) => \{/);
  assert.match(app, /\[state\.refs\[drag\.from\], state\.refs\[drag\.target\]\]/);
  assert.match(css, /\.ref-slot\.ref-drop-target/);
});
