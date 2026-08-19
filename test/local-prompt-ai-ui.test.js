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

test('Preferences exposes the installed-model picker when Local ComfyUI is selected', () => {
  assert.match(html, /id="localPromptAiSettings"[\s\S]*id="setLocalPromptAiClip"[\s\S]*id="setLocalPromptAiClipType"/);
  assert.match(html, /id="smartPlannerModelOverride"[^>]*role="switch"[\s\S]*id="setSmartPlannerClip"[\s\S]*id="setSmartPlannerClipType"/);
  assert.match(html, /Dedicated Smart planner model/);
  assert.match(html, /Generation models remain unchanged/);
  assert.match(html, /id="refreshLocalPromptAiModels"[\s\S]*id="localPromptAiStatus"/);
  assert.match(app, /api\(`\/api\/prompt\/local-models\$\{force \? '\?refresh=1' : ''\}`\)/);
  assert.match(app, /api\('\/api\/prompt\/provider\/test', \{ method: 'POST' \}\)/);
  assert.match(app, /localPromptAiClip: \$\('#setLocalPromptAiClip'\)\.value/);
  assert.match(app, /localPromptAiClipType: \$\('#setLocalPromptAiClipType'\)\.value/);
  assert.match(app, /smartPlannerModelOverride: \$\('#smartPlannerModelOverride'\)\.getAttribute\('aria-checked'\) === 'true'/);
  assert.match(app, /smartPlannerClip: \$\('#setSmartPlannerClip'\)\.value/);
});

test('local prompt model settings drive only prompt TextGenerate loaders', () => {
  assert.match(server, /function localPromptAiLoaderInputs\(override = null\)/);
  assert.ok((server.match(/inputs: localPromptAiLoaderInputs\(\)/g) || []).length >= 3);
  assert.match(server, /queueTextEnhancement[\s\S]*localPromptAiLoaderInputs\(options\.clipConfig\)/);
  assert.match(server, /function baseLoaders\([\s\S]{0,300}clip_name: settings\.clip/);
  assert.match(videoWorkflows, /clip_name: settings\.h3Clip, type: 'minimax'/);
  assert.match(server, /route === '\/api\/prompt\/local-models'/);
  assert.match(server, /route === '\/api\/prompt\/local-model\/test'/);
});

test('Smart can select the installed local ComfyUI prompt model without Ollama', () => {
  assert.match(html, /id="setExternalLlmLocalProvider"[\s\S]*value="local">ComfyUI/);
  assert.match(app, /\['local', 'openai', 'gemini', 'ollama'\]\.includes\(settings\.externalLlmProvider\)/);
  assert.match(server, /function requestSmartPlan\([\s\S]*Building Smart plan with the local model/);
  assert.match(server, /imageNames: references\.map\(\(reference\) => reference\.name\)/);
  assert.match(server, /provider\.provider === 'local'[\s\S]*queueTextEnhancement\(/);
  assert.match(server, /configuredSmartPlannerLlm\(\)/);
  assert.match(server, /clipConfig: \{ model: provider\.model, type: provider\.type \}/);
});

test('the dedicated Smart model toggle leaves general prompt enhancement routing unchanged', () => {
  assert.match(app, /smartPlannerModelOverride[\s\S]*syncSmartPlannerModelControls\(\)[\s\S]*scheduleSettingsAutosave\('server', 0\)/);
  assert.match(server, /smartPlannerModelOverride: false[\s\S]*smartPlannerClip: ''[\s\S]*smartPlannerClipType: 'krea2'/);
  assert.match(server, /const provider = configuredSmartPlannerLlm\(\)/);
  assert.match(server, /executeSmartPlanRequest\(request, provider, prompt, references\)/);
  assert.match(server, /function enhancePrompt\([\s\S]*runConfiguredPromptAi/);
});

test('Prompt AI uses one Local or External switch with contextual provider dropdowns', () => {
  assert.match(html, /id="promptAiModeSwitch"[^>]*role="switch"[^>]*aria-checked="false"/);
  assert.match(html, /data-prompt-ai-mode-panel="local"[\s\S]*id="setExternalLlmLocalProvider"/);
  assert.match(html, /data-prompt-ai-mode-panel="external"[^>]*hidden[\s\S]*id="setExternalLlmExternalProvider"/);
  assert.match(app, /function setPromptAiProvider\(provider\)/);
  assert.match(app, /promptAiModeSwitch[\s\S]{0,500}setExternalLlmLocalProvider[\s\S]{0,200}setExternalLlmExternalProvider/);
});
