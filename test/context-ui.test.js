'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
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
  assert.match(appJs, /normalizeLoraTriggerPhrase/);
  assert.match(appJs, /state\.videoLoras,[\s\S]*state\.editLoras,[\s\S]*Object\.values\(state\.editLorasByEngine/);
  assert.match(appJs, /loraTriggers: state\.loraTriggers/);
  assert.match(appJs, /state\.loraTriggers\[l\.name\] = l\.triggerPhrase/);
  assert.match(appJs, /ensureLoraTriggerInPrompt/);
  assert.match(appJs, /function promoteLoraTriggerInPrompt/);
  assert.match(appJs, /function demoteLoraTriggerInPrompt/);
  assert.match(appJs, /const value = draft\.slice\(0, match\.index\) \+ token/);
  assert.match(appJs, /function appendPromptSuggestion\(phrase, loraName\)/);
  assert.match(appJs, /promoteLoraTriggerInPrompt\(lora\)/);
  assert.match(appJs, /if \(!wasOn && l\.on\) ensureLoraTriggerInPrompt\(l\)/);
  assert.match(appJs, /else if \(wasOn && !l\.on\) demoteLoraTriggerInPrompt\(l\)/);
  assert.match(appJs, /triggerPhrase: loraTriggerPhrase\(l\)/);
  assert.match(appJs, /makePromptLoraTriggerToken/);
  assert.match(appJs, /prompt-lora-token/);
  assert.match(appJs, /token\.textContent = phrase \|\| prettyLora\(name\)/);
  assert.match(appJs, /--lora-trigger-color', loraTriggerColor\(name\)/);
  assert.match(appJs, /--lora-color', loraTriggerColor\(l\.name\)/);
  assert.match(appJs, /function syncPromptLoraTokenColors/);
  assert.match(appJs, /syncPromptLoraTokenColors\(\)/);
  assert.match(appJs, /REGION_COLORS\[\(index < 0 \? 0 : index\) % REGION_COLORS\.length\]/);
  assert.doesNotMatch(appJs, /remove\.dataset\.removePromptLora/);
  assert.match(appJs, /expandPromptLoraTriggers/);
  assert.match(appJs, /@lora-trigger\[\$\{encodeURIComponent/);
  assert.match(appJs, /@lora-trigger\\\[[^\n]+@lora-trigger-/);
  assert.match(appJs, /const current = expandPromptLoraTriggers\(promptDraft\(\)\)\.toLowerCase\(\)/);
  assert.match(serverJs, /triggerPhrase: String\(l\.triggerPhrase \|\| ''\)/);
});

test('generation image and video inputs offer device upload or previous gallery generations', () => {
  assert.match(indexHtml, /id="assetPickerSheet"/);
  assert.match(indexHtml, /id="assetPickerUpload"/);
  assert.match(indexHtml, /id="assetPickerPrevious"/);
  assert.match(appJs, /function openAssetPicker/);
  assert.match(appJs, /function previousGenerationAssets/);
  assert.doesNotMatch(appJs, /return assets\.sort\([\s\S]{0,240}\.slice\(0, 80\)/);
  assert.match(indexHtml, /id="assetPickerSearch"/);
  assert.match(indexHtml, /id="assetPickerPreview"/);
  assert.match(indexHtml, /id="assetPickerPreviewUse"/);
  assert.match(indexHtml, /id="assetPickerFolderTrigger"/);
  assert.match(indexHtml, /id="assetPickerLikes"/);
  assert.match(indexHtml, /id="assetPickerSortTrigger"/);
  assert.match(indexHtml, /id="assetPickerPreviewNeighbor"/);
  assert.match(indexHtml, /id="assetPickerPreviewPrevious"/);
  assert.match(indexHtml, /id="assetPickerPreviewNext"/);
  assert.match(indexHtml, /id="assetPickerBrowseBack"[^>]*>[\s\S]*?Sources<\/button>[\s\S]*?<span>Your gallery<\/span>/);
  assert.match(appJs, /function assetMatchesQuery\(asset, query\)/);
  assert.match(appJs, /function assetPickerVisibleAssets\(\)/);
  assert.match(appJs, /assetPickerState\.folder !== 'all'/);
  assert.match(appJs, /assetPickerState\.likes && !asset\.liked/);
  assert.match(appJs, /function openAssetPickerPreview\(asset\)/);
  assert.match(appJs, /function animateAssetPickerEntrance\(panel, trigger\)/);
  assert.match(appJs, /animateAssetPickerEntrance\(panel, assetPickerReturnFocus\)/);
  assert.match(appJs, /button\.addEventListener\('click', \(\) => openAssetPickerPreview\(asset\)\)/);
  assert.match(appJs, /assetPickerState\?\.preview\) usePreviousGeneration\(assetPickerState\.preview\)/);
  assert.match(appJs, /function usePreviousGeneration/);
  assert.match(appJs, /function finishSwipe\(commit\)/);
  assert.match(appJs, /animateAssetPickerNavigation = \(direction\)/);
  assert.match(appJs, /function pickRef\(idx\) \{[\s\S]*pickUpload\('image\/\*'/);
  assert.match(appJs, /function pickVidRef\(\) \{[\s\S]*pickUpload\('image\/\*'/);
  assert.match(appJs, /pickUpload\('video\/\*'/);
  assert.match(appJs, /MAX_INPUT_UPLOAD_BYTES = 2 \* 1024 \* 1024 \* 1024/);
  assert.match(appJs, /function uploadInputAsset\(blob, filename\)/);
  assert.match(appJs, /request\.upload\.addEventListener\('progress'/);
  assert.match(appJs, /detail\.textContent = 'Available after refresh'/);
  assert.match(appJs, /const res = await uploadInputAsset\(file, file\.name \|\| 'file\.bin'\)/);
});

test('mobile source preview keeps its primary action in the visible panel', () => {
  assert.match(styleCss, /@media \(max-width: 600px\)[\s\S]*?\.asset-picker-panel\.previewing \{[\s\S]*?height: min\(88dvh, 620px\);[\s\S]*?overflow: hidden;/);
  assert.match(styleCss, /\.asset-picker-panel\.previewing \.asset-picker-preview \{[\s\S]*?grid-template-rows: auto minmax\(0, 1fr\) auto auto;/);
  assert.match(styleCss, /\.asset-picker-panel\.previewing \.asset-picker-preview-media \{[\s\S]*?min-height: 0;[\s\S]*?height: auto;/);
});

test('source picker uses a shared-element morph from the pressed trigger', () => {
  assert.match(styleCss, /#assetPickerSheet \.asset-picker-panel \{[\s\S]*?background: #000;[\s\S]*?animation: none;/);
  assert.match(appJs, /morph\.innerHTML = trigger\.innerHTML/);
  assert.match(appJs, /trigger\.classList\.add\('asset-picker-trigger-morphing'\)/);
  assert.match(appJs, /left: px\(triggerRect\.left - pop\)[\s\S]*?width: px\(triggerRect\.width \+ pop \* 2\)/);
  assert.match(appJs, /duration: 300, easing: 'linear'/);
  assert.match(appJs, /recentPointerTrigger \|\| focused/);
  assert.match(styleCss, /\.asset-picker-morph \{[\s\S]*?position: fixed;[\s\S]*?will-change: left, top, width, height, border-radius, opacity, box-shadow;/);
  assert.match(styleCss, /@keyframes assetPickerPanelResolve \{[\s\S]*?0%, 56% \{ opacity: 0; transform: scale\(\.985\); \}/);
  assert.doesNotMatch(styleCss, /@keyframes assetPickerIn/);
});

test('mobile create prompt contains long generated text instead of expanding indefinitely', () => {
  assert.match(styleCss, /@media \(max-width: 760px\)[\s\S]*?#view-create \.prompt-composer \{[\s\S]*?max-height: clamp\(150px, 24dvh, 180px\);[\s\S]*?overflow-y: auto;[\s\S]*?resize: none;/);
});
