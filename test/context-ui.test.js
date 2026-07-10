'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('prompt panel exposes contextual LoRA phrase suggestions', () => {
  assert.match(indexHtml, /id="contextPromptTools"/);
  assert.match(appJs, /renderPromptSuggestions/);
  assert.match(appJs, /appendPromptSuggestion/);
});

test('LoRA picker applies learned strength defaults from context endpoint', () => {
  assert.match(serverJs, /\/api\/context/);
  assert.match(appJs, /refreshLoraContext/);
  assert.match(appJs, /applyContextLoraDefault/);
});

test('LoRAs can persist trigger phrases and add them to the prompt on activation', () => {
  assert.match(indexHtml, /id="loraTriggerCards"/);
  assert.match(appJs, /normalizeLoraTriggerPhrase/);
  assert.match(appJs, /loraTriggers: state\.loraTriggers/);
  assert.match(appJs, /state\.loraTriggers\[l\.name\] = l\.triggerPhrase/);
  assert.match(appJs, /ensureLoraTriggerInPrompt/);
  assert.match(appJs, /if \(!wasOn && l\.on\) ensureLoraTriggerInPrompt\(l\)/);
  assert.match(appJs, /triggerPhrase: loraTriggerPhrase\(l\)/);
  assert.match(appJs, /lora-trigger-card/);
  assert.match(serverJs, /triggerPhrase: String\(l\.triggerPhrase \|\| ''\)/);
});

test('generation image and video inputs offer device upload or previous gallery generations', () => {
  assert.match(indexHtml, /id="assetPickerSheet"/);
  assert.match(indexHtml, /id="assetPickerUpload"/);
  assert.match(indexHtml, /id="assetPickerPrevious"/);
  assert.match(appJs, /function openAssetPicker/);
  assert.match(appJs, /function previousGenerationAssets/);
  assert.match(appJs, /function usePreviousGeneration/);
  assert.match(appJs, /function pickRef\(idx\) \{[\s\S]*pickUpload\('image\/\*'/);
  assert.match(appJs, /function pickVidRef\(\) \{[\s\S]*pickUpload\('image\/\*'/);
  assert.match(appJs, /pickUpload\('video\/\*'/);
});
