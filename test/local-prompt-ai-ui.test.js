'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const videoWorkflows = fs.readFileSync(path.join(root, 'lib', 'video-workflows.js'), 'utf8');

test('Preferences exposes an isolated installed-model picker for local prompt AI', () => {
  assert.match(html, /id="localPromptAiSettings"[\s\S]*id="setLocalPromptAiClip"[\s\S]*id="setLocalPromptAiClipType"/);
  assert.match(html, /Generation models remain unchanged/);
  assert.match(html, /id="refreshLocalPromptAiModels"[\s\S]*id="testLocalPromptAiModel"[\s\S]*id="localPromptAiStatus"/);
  assert.match(app, /api\(`\/api\/prompt\/local-models\$\{force \? '\?refresh=1' : ''\}`\)/);
  assert.match(app, /api\('\/api\/prompt\/local-model\/test', \{ method: 'POST' \}\)/);
  assert.match(app, /localPromptAiClip: \$\('#setLocalPromptAiClip'\)\.value/);
  assert.match(app, /localPromptAiClipType: \$\('#setLocalPromptAiClipType'\)\.value/);
});

test('local prompt model settings drive only prompt TextGenerate loaders', () => {
  assert.match(server, /function localPromptAiLoaderInputs\(\)/);
  assert.ok((server.match(/inputs: localPromptAiLoaderInputs\(\)/g) || []).length >= 4);
  assert.match(server, /function baseLoaders\([\s\S]{0,300}clip_name: settings\.clip/);
  assert.match(videoWorkflows, /clip_name: settings\.h3Clip, type: 'minimax'/);
  assert.match(server, /route === '\/api\/prompt\/local-models'/);
  assert.match(server, /route === '\/api\/prompt\/local-model\/test'/);
});
