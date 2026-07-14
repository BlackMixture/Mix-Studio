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

test('Director mode is a conditional LTX workspace and not a navigation destination', () => {
  assert.match(html, /id="directorModeBtn"[^>]*hidden/);
  assert.match(html, /id="directorWorkspace"[^>]*hidden/);
  assert.match(html, /id="directorBack"[^>]*>← Back to Video/);
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
  assert.match(server, /directorProject: Object\.assign/);
});

test('Director generation remains a separate dependency and uses literal prompts', () => {
  assert.match(app, /if \(state\.directorOpen\) components\.add\('ltxdirector'\)/);
  assert.match(app, /api\('\/api\/director\/generate'/);
  assert.match(server, /ltxdirector: \['LTXDirector', 'LTXDirectorGuide', 'LTXDirectorCropGuides'\]/);
  assert.match(server, /enhance: false/);
  assert.match(html, /WhatDreamsCost \(GPL-3\.0\)/);
  assert.match(html, /LTX-2\.3-22b-IC-LoRA-Ingredients/);
});
