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

test('Video model selection sits above the prompt and collapses after choosing', () => {
  const modelAt = html.indexOf('id="vidModelPanel"');
  const promptAt = html.indexOf('id="promptPanel"');
  assert.ok(modelAt > -1 && modelAt < promptAt);
  assert.match(html, /id="vidModelHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidModelBody"/);
  assert.match(html, /id="vidModelBody" aria-hidden="true" inert/);
  assert.match(html, /id="vidEngineSelected">LTX 2\.3</);
  assert.match(css, /\.video-model-body[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-model-panel\.expanded \.video-model-body[\s\S]*grid-template-rows: 1fr/);
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

test('Duration and motion use collapsible vertical scrubbers instead of range sliders', () => {
  assert.match(html, /id="vidTimingHeader"[^>]*aria-expanded="false"[^>]*aria-controls="vidTimingBody"/);
  assert.match(html, /id="vidTimingBody" aria-hidden="true" inert/);
  assert.match(html, /id="vidDurScrub"[^>]*role="spinbutton"/);
  assert.match(html, /id="vidFreeScrub"[^>]*role="spinbutton"/);
  assert.doesNotMatch(html, /id="vid(?:Dur|Free)" type="range"/);
  assert.match(css, /\.video-number-scrubber \{[\s\S]*touch-action: none/);
  assert.match(app, /function wireVideoScrubber\(buttonId, inputId\)/);
  assert.match(app, /drag\.y - event\.clientY/);
  assert.match(app, /event\.key === 'ArrowUp'/);
});

test('LTX settings identify its fixed generation and playback pipelines', () => {
  assert.match(html, /id="vidLtxGeneration"[^>]*>Two-stage · base \+ refine</);
  assert.match(html, /id="vidLtxPlayback"[^>]*>25 fps · native</);
  assert.match(app, /vidLtxGenerationRow'\)\.hidden = engine !== 'ltx'/);
  assert.match(app, /faceMode \? 'Single-stage · Face ID' : 'Two-stage · base \+ refine'/);
  assert.match(app, /faceMode \? '24 fps · native' : '25 fps · native'/);
});

test('Video prompt tools stay hidden and structured audio labels survive state changes', () => {
  assert.match(css, /\.prompt-tools\[hidden\]/);
  assert.match(css, /#vidDriveTools\[hidden\]/);
  assert.match(html, /data-audio-title/);
  assert.match(app, /function setAudioChipVisual\(chip, active\)/);
});
