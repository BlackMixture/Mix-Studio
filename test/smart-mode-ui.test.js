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

test('Smart mode is a dedicated disabled-by-default child experiment', () => {
  assert.match(html, /id="experimentalFeaturesToggle"[\s\S]*id="smartModeExperimentalRow" hidden[\s\S]*id="smartModeToggle"/);
  assert.match(app, /experimentalFeatures: false,[\s\S]{0,80}smartMode: false/);
  assert.match(app, /function smartModeEnabled\(\)[\s\S]{0,120}experimentalFeaturesEnabled\(\)[\s\S]{0,120}smartMode === true/);
  assert.match(app, /if \(!enabled\) state\.mediaPreferences\.smartMode = false/);
});

test('Smart replaces only the middle Region navigation entry when enabled', () => {
  assert.match(html, /id="drawerMiddleCreate"[^>]*data-drawer-create-mode="region"/);
  assert.match(html, /id="createMiddleTab"[^>]*data-create-mode="region"/);
  assert.match(app, /tab\.dataset\.createMode = enabled \? 'smart' : 'region'/);
  assert.match(app, /drawer\.dataset\.drawerCreateMode = enabled \? 'smart' : 'region'/);
  assert.match(app, /setCreateMode\(enabled \? 'smart' : 'region'\)/);
});

test('Smart workspace provides typed, voice, plan, review, queue, retry, and cancel controls', () => {
  for (const id of ['smartWorkspace', 'smartBriefInput', 'smartVoiceBtn', 'smartVoiceFile', 'smartPlanBtn', 'smartBoard', 'smartRecent']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)/);
  assert.match(app, /if \(!window\.isSecureContext\)[\s\S]*Chrome requires HTTPS[\s\S]*openSmartVoiceFileFallback/);
  assert.match(app, /smartVoiceFile[\s\S]*transcribeSmartAudio\(file\)/);
  assert.match(app, /api\('\/api\/smart\/transcribe'/);
  assert.match(app, /api\('\/api\/smart\/plan'/);
  assert.match(app, /api\('\/api\/smart\/runs'/);
  assert.match(app, /\['failed', 'attention'\]/);
  assert.match(app, /\['running', 'queueing'\]\.includes\(run\.status\) \? \['cancel', 'Cancel remaining'\]/);
});

test('Smart exposes planner configuration and reusable image references', () => {
  for (const id of ['smartConfigureAi', 'smartAddReference', 'smartReferenceList']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Smart Planner Provider/);
  assert.match(html, /Choose Ollama to keep planning local/);
  assert.match(html, /Used for OpenAI planning and Smart voice transcription/);
  assert.match(app, /openAssetPicker\('image\/\*', addSmartReferences, 'Add Smart references'/);
  assert.match(app, /references: smartReferencePayload\(\)/);
  assert.match(app, /setSettingsTab\('suggestions'\)[\s\S]*prompting-external/);
  assert.match(server, /images = await Promise\.all\(references\.map[\s\S]*externalLlmStructuredRequest\([\s\S]*images,/);
  assert.match(server, /compileSmartSteps\(plan, \{\}, references\)/);
});

test('Smart mode spans the inputs and stage columns while keeping Library mounted', () => {
  assert.match(css, /body\[data-ui-mode="smart"\] #view-create \{[\s\S]*grid-column: 1 \/ 3/);
  assert.match(css, /body\[data-ui-mode="smart"\] #desktopStage,[\s\S]*#genDock \{ display: none !important; \}/);
  assert.doesNotMatch(css, /body\[data-ui-mode="smart"\][^{]*#view-gallery[^}]*display: none/);
});

test('server persists profile-scoped runs and advances them from generation completion events', () => {
  assert.match(server, /if \(!Array\.isArray\(db\.smartRuns\)\) db\.smartRuns = \[\]/);
  assert.match(server, /route === '\/api\/smart\/plan'/);
  assert.match(server, /route === '\/api\/smart\/runs'/);
  assert.match(server, /function completeSmartJob\(job, items\)/);
  assert.match(server, /completeSmartJob\(job, created\)/);
  assert.match(server, /completeSmartJob\(job, \[item\]\)/);
  assert.match(server, /broadcast\('smartRunUpdated'/);
  assert.match(app, /addEventListener\('smartRunUpdated'/);
});
