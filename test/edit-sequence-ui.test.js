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

test('Edit exposes a minimalist sequential-mode icon with state-aware tooltips', () => {
  assert.match(html, /id="editSequenceBtn"[^>]*aria-pressed="false"[^>]*hidden/);
  assert.match(html, /id="editSequenceCount"/);
  assert.match(css, /\.edit-sequence-btn/);
  assert.match(app, /Sequential edits on —/);
  assert.match(app, /Sequential edits off — run the prompt as one edit/);
});

test('Sequential mode is available only for the four supported edit engines', () => {
  assert.match(app, /new Set\(\['klein4', 'klein9', 'qwen', 'krea2ref'\]\)/);
  assert.match(app, /const engineSupported = SEQUENTIAL_EDIT_ENGINES\.has\(state\.editEngine\)/);
  assert.match(app, /const supported = inEdit && engineSupported && !editOutpaintActive\(\)/);
  assert.match(app, /if \(inEdit && \(!engineSupported \|\| editOutpaintActive\(\)\)\) state\.editSequential = false/);
  assert.match(server, /Sequential edits are available with Klein 4B, Klein 9B, Qwen Edit, and Krea 2 Edit only/);
});

test('Sentence prompts queue one edit at a time using the previous output as the next source', () => {
  assert.match(app, /function sequentialEditPrompts\(value = promptForGeneration\(\)\)/);
  assert.match(app, /editSequence: sequenceSteps\.length \? \{ prompts: sequenceSteps \}/);
  assert.match(server, /async function queueNextSequentialEdit\(job, sourceItem\)/);
  assert.match(server, /const refNames = \[sourceName, \.\.\.\(job\.refImageNames \|\| \[\]\)\.slice\(1\)\]/);
  assert.match(server, /editSequence: Object\.assign\(\{\}, sequence, \{ index: nextIndex \}\)/);
  assert.match(server, /broadcast\('sequenceStep'/);
  assert.match(app, /es\.addEventListener\('sequenceStep'/);
});

test('Sequential edits force one branch and apply finish upscaling only to the final step', () => {
  assert.match(app, /batch: sequenceSteps\.length \? 1/);
  assert.match(server, /p\.batch = 1/);
  assert.match(server, /const sequenceFinal = !editSequence \|\| editSequence\.index >= editSequence\.prompts\.length - 1/);
  assert.match(server, /if \(job\.params\.postUpscale && sequenceFinal\)/);
});
