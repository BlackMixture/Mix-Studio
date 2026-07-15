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

function openingTagById(source, id) {
  const match = source.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`));
  assert.ok(match, `expected #${id} to be mounted`);
  return match[0];
}

test('Director mode is a conditional LTX workspace and not a navigation destination', () => {
  assert.match(html, /id="directorModeBtn"[^>]*hidden/);
  assert.match(html, /id="directorWorkspace"[^>]*hidden/);
  assert.match(openingTagById(html, 'directorBack'), /aria-label="Back to Video"/);
  assert.match(html, /id="directorBack"[^>]*>[\s\S]{0,80}>Back</);
  assert.doesNotMatch(html, /data-(?:primary-mode|create-mode)="director"/);
  assert.match(app, /directorModeBtn'\)\.hidden = !\(isVideo && state\.vidEngine === 'ltx'\)/);
  assert.match(app, /function openDirectorMode\(project\)/);
  assert.match(app, /function closeDirectorMode\(\)/);
});

test('Director timeline exposes accessible drag and exact-value editing at 24 fps', () => {
  assert.match(app, /const DIRECTOR_FPS = 24/);
  assert.match(app, /const DIRECTOR_MAX_FRAMES = 24000/);
  assert.match(app, /const DIRECTOR_MAX_WINDOW = 480/);
  for (const id of ['directorMainTrack', 'directorAudioTrack', 'directorMotionTrack', 'directorSegmentStart', 'directorSegmentLength', 'directorRangeStart', 'directorRangeLength']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /function startDirectorDrag\(event\)/);
  assert.match(app, /\['ArrowLeft', 'ArrowRight'\]/);
  assert.match(app, /event\.shiftKey \? DIRECTOR_FPS : 1/);
  assert.match(css, /\.director-segment-handle[\s\S]*touch-action: none/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.director-segment-handle \{ width: 18px/);
});

test('Director defaults to a focused Story timeline with progressive disclosure', () => {
  assert.match(html, /<label[^>]*for="directorGlobalPrompt"[^>]*>\s*Overall direction\s*<\/label>/);
  assert.doesNotMatch(html, />\s*Global prompt\s*</);
  assert.doesNotMatch(html, />\s*Main\s*</);
  assert.doesNotMatch(html, />\s*IC guide\s*</);
  assert.doesNotMatch(html, />\s*Marked generation\s*</);

  const addActions = html.match(/<button\b[^>]*id="directorAddBtn"[^>]*>[\s\S]*?<\/button>/g) || [];
  assert.equal(addActions.length, 1, 'Director should expose one primary Add action');
  assert.match(addActions[0], />\s*(?:\+\s*)?Add\s*</);
  assert.match(openingTagById(html, 'directorStoryTrackRow'), /data-director-track="main"/);
  assert.doesNotMatch(openingTagById(html, 'directorStoryTrackRow'), /\bhidden\b/);
  assert.match(html, /id="directorStoryTrackRow"[\s\S]{0,420}class="director-track-name">Story\b[\s\S]{0,420}id="directorAddBtn"/);

  for (const [id, label] of [['directorAudioTrackRow', 'Audio'], ['directorMotionTrackRow', 'Motion guide']]) {
    assert.match(openingTagById(html, id), /\bhidden\b/, `${label} should be hidden until it contains media`);
    assert.match(html, new RegExp(`id="${id}"[\\s\\S]{0,240}class="director-track-name">${label}\\b`));
  }
  assert.match(app, /directorAudioTrackRow'\)\.hidden\s*=\s*(?:!project\.audioSegments\.length|project\.audioSegments\.length === 0)/);
  assert.match(app, /directorMotionTrackRow'\)\.hidden\s*=\s*(?:!project\.motionSegments\.length|project\.motionSegments\.length === 0)/);
  assert.match(app, /directorStoryTrackRow'\)\.classList\.toggle\('is-empty', project\.segments\.length === 0\)/);
  assert.match(css, /\.director-track\.is-empty \.director-timeline-add/);
  assert.match(html, /id="directorValidationInline"[^>]*role="alert"/);
});

test('Director groups project, add, timeline, and output controls into focused sheets', () => {
  for (const id of ['directorProjectMenuSheet', 'directorAddSheet', 'directorSettingsSheet']) {
    assert.match(openingTagById(html, id), /class="[^"]*\bsheet\b/);
  }
  for (const [button, sheet] of [
    ['directorProjectMenuBtn', 'directorProjectMenuSheet'],
    ['directorAddBtn', 'directorAddSheet'],
    ['directorSettingsBtn', 'directorSettingsSheet'],
  ]) {
    assert.match(openingTagById(html, button), new RegExp(`aria-controls="${sheet}"`));
  }

  for (const label of ['Timed direction', 'Keyframe', 'Audio', 'Motion guide image', 'Motion guide video']) {
    assert.match(html, new RegExp(`>\\s*(?:\\+\\s*)?${label}\\s*<`));
  }
  for (const label of ['Import', 'Export', 'New', 'About']) assert.match(html, new RegExp(`>\\s*${label}(?: project| Director)?\\s*<`));

  assert.match(html, /id="directorTimelineSettingsBtn"[^>]*aria-controls="directorTimelineSettings"/);
  assert.match(html, /id="directorTimelineSettings"/);
  for (const id of ['directorPlay', 'directorPlayhead', 'directorZoom', 'directorSnap']) assert.match(html, new RegExp(`id="${id}"`));
  assert.ok(html.indexOf('class="director-transport"') > html.indexOf('id="directorTimelineSettings"'), 'transport belongs inside Timeline settings');
});

test('Director uses friendly seconds while retaining exact frame controls under Advanced', () => {
  for (const id of ['directorSegmentStartSeconds', 'directorSegmentDurationSeconds']) {
    const input = openingTagById(html, id);
    assert.match(input, /type="number"/);
    assert.match(input, /step="0\.01"/);
  }
  assert.match(html, /id="directorInspectorAdvancedBtn"[^>]*aria-controls="directorInspectorAdvanced"/);
  assert.match(openingTagById(html, 'directorInspectorAdvanced'), /\bhidden\b/);
  for (const id of ['directorSegmentStart', 'directorSegmentLength', 'directorTrimStart', 'directorAttentionStrength', 'directorEndFrame']) {
    assert.match(html, new RegExp(`id="${id}"`), `Advanced editing should retain #${id}`);
  }

  assert.match(app, /function directorSecondsToFrames\([^)]*\)[\s\S]{0,260}Math\.round\([\s\S]{0,100}\* DIRECTOR_FPS\)/);
  assert.match(app, /function directorFramesToSeconds\([^)]*\)[\s\S]{0,220}DIRECTOR_FPS[\s\S]{0,120}toFixed\(2\)/);
  assert.match(app, /directorSegmentStartSeconds/);
  assert.match(app, /directorSegmentDurationSeconds/);
});

test('Director auto-fit, partial ranges, contextual inspector, and drag gating are explicit behaviors', () => {
  assert.match(app, /function directorUsesPartialRange\(project/);
  assert.match(app, /const partialRange = directorUsesPartialRange\(project\)/);
  assert.match(app, /range\.hidden = !partialRange/);
  assert.match(app, /directorRangeTools'\)\.hidden = !partialRange/);
  assert.match(app, /function directorAutoFitTimeline\(project/);
  assert.match(app, /function directorAutoFitTimeline\(project[\s\S]{0,220}DIRECTOR_MAX_WINDOW/);
  assert.match(app, /directorPixelsPerSecond = directorAutoFitTimeline\(project\)/);
  assert.match(html, /id="directorRangeTools"[^>]*hidden/);
  assert.match(html, /id="directorAutoFit"/);

  assert.match(openingTagById(html, 'directorInspector'), /\bhidden\b/);
  assert.match(openingTagById(html, 'directorEmptyInspector'), /\bhidden\b/);
  assert.match(app, /function directorOpenInspector\(/);
  assert.match(css, /@media \(min-width: 900px\)[\s\S]*#directorInspector|@media \(min-width: 900px\)[\s\S]*\.director-inspector/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#directorInspector|@media \(max-width: 720px\)[\s\S]*\.director-inspector/);

  assert.match(app, /directorDragMoved/);
  assert.match(app, /directorSuppressClickUntil/);
  assert.match(app, /(?:Math\.hypot\([^)]*\)|Math\.abs\([^)]*\))\s*(?:>|<=)\s*6|DIRECTOR_DRAG_THRESHOLD\s*=\s*6/);
  assert.match(app, /directorTimelineCanvas'\)\.addEventListener\('click'[\s\S]{0,240}directorSuppressClickUntil[\s\S]{0,100}return/);
});

test('Director has a compact full-sequence or selected-range generation footer', () => {
  assert.match(html, /<footer[^>]*class="[^"]*director-summary[^"]*"/);
  assert.match(html, /id="directorSummaryLabel"/);
  assert.match(html, /id="directorGenerate"[^>]*>\s*Generate Video\s*<\/button>/);
  assert.match(app, /directorSummaryLabel/);
  assert.match(app, /(?:Full sequence|Selected range)/);
  assert.match(app, /button\.textContent = project\.extensionSource \? 'Generate Extension' : 'Generate Video'/);
  assert.match(css, /\.director-summary\s*\{[^}]*position:\s*sticky;[^}]*bottom:/);
});

test('Director projects autosave, import, export, preflight media, and restore from gallery metadata', () => {
  assert.match(app, /profileStorageKey\('ks-director'\)/);
  assert.match(app, /directorProject: directorSerializableProject\(\)/);
  assert.match(app, /directorNormalizeClientProject\(JSON\.parse\(await file\.text\(\)\)\)/);
  assert.match(app, /new Blob\(\[.*JSON\.stringify\(directorSerializableProject\(\)/s);
  assert.match(app, /api\('\/api\/director\/assets'/);
  assert.match(app, /directorMissingAssets\.has\(assetName\)/);
  assert.match(app, /info\.workflow === 'director' && info\.directorProject/);
  assert.match(app, /if \(info\?\.workflow === 'director'\) return 'LTX 2\.3 Director'/);
  assert.match(server, /route === '\/api\/director\/assets'/);
  assert.match(server, /route === '\/api\/director\/generate'/);
  assert.match(server, /workflow: 'director',/);
  assert.match(server, /const directorProject = Object\.assign/);
});

test('Director generation remains a separate dependency and uses literal prompts', () => {
  assert.match(app, /if \(state\.directorOpen\) components\.add\('ltxdirector'\)/);
  assert.match(app, /api\('\/api\/director\/generate'/);
  assert.match(server, /ltxdirector: \['LTXDirector', 'LTXDirectorGuide', 'LTXDirectorCropGuides'\]/);
  assert.match(server, /enhance: false/);
  assert.match(html, /WhatDreamsCost \(GPL-3\.0\)/);
  assert.match(html, /LTX-2\.3-22b-IC-LoRA-Ingredients/);
});
