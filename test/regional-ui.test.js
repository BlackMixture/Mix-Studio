'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('create prompt tools expose an inline regional bounding-box editor', () => {
  assert.match(indexHtml, /id="regionsPromptBtn"/);
  assert.match(indexHtml, /id="regionWorkspace"/);
  assert.doesNotMatch(indexHtml, /id="regionSheet"/);
  assert.match(indexHtml, /id="regionStage"/);
  assert.match(indexHtml, /id="regionLoraSlot"/);
  assert.match(indexHtml, /id="regionRefInput"/);
  assert.match(indexHtml, /id="regionGlobalPromptSlot"/);
  assert.match(indexHtml, /id="regionSettings" aria-hidden="true" inert/);
  assert.doesNotMatch(indexHtml, /region-stage-hint/);
  assert.doesNotMatch(indexHtml, /id="regionDoneBtn"/);
  assert.match(appJs, /function openRegionEditor/);
  assert.match(appJs, /function renderRegionEditor/);
  assert.match(appJs, /function uploadRegionReference/);
  assert.doesNotMatch(indexHtml, /id="regionEnabledChip"/);
  assert.doesNotMatch(indexHtml, /id="regionWorkspaceSummary"/);
  assert.doesNotMatch(indexHtml, /Regional prompting[\s\S]*Frame each subject/);
});

test('region canvas follows resolution aspect changes without rebuilding its boxes', () => {
  const stageCss = styleCss.match(/\.region-stage \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(appJs, /function syncRegionStageAspect\(\)/);
  assert.match(appJs, /function renderDims\(\)[\s\S]*?syncRegionStageAspect\(\);\s*\}/);
  assert.match(appJs, /function renderRegionEditor\(\)[\s\S]*?syncRegionStageAspect\(\);/);
  assert.match(appJs, /stage\.style\.aspectRatio = `\$\{arW\} \/ \$\{arH\}`/);
  assert.doesNotMatch(stageCss, /max-height/);
});

test('Region mode moves the shared prompt below the stage as the global prompt', () => {
  assert.match(indexHtml, /id="promptPanel"/);
  assert.match(indexHtml, /id="promptLabel"/);
  assert.match(appJs, /promptSlot\.appendChild\(promptPanel\)/);
  assert.match(appJs, /textContent = isRegion \? 'Global prompt' : \(scailInputFirst \? 'Creative direction · optional' : 'Prompt'\)/);
});

test('selecting a region expands auto-saved settings and holding cycles overlaps', () => {
  assert.match(appJs, /function syncRegionSettings\(focusPrompt\)/);
  assert.match(appJs, /function selectRegionUnderneath\(clientX, clientY, currentRegion\)/);
  assert.match(appJs, /setTimeout\(\(\) => \{[\s\S]*selectRegionUnderneath[\s\S]*\}, 520\)/);
  assert.match(appJs, /regionSettingsOpen = true/);
  assert.match(styleCss, /\.region-settings\.show \{[\s\S]*grid-template-rows: 1fr/);
});

test('selected-region inspector appears before the canvas with visual asset inputs', () => {
  const settingsAt = indexHtml.indexOf('id="regionSettings"');
  const stageAt = indexHtml.indexOf('id="regionStage"');
  assert.ok(settingsAt > -1 && settingsAt < stageAt);
  assert.match(indexHtml, /class="lora-grid region-lora-slot" id="regionLoraSlot"/);
  assert.match(indexHtml, /id="regionRefBtn"[\s\S]*class="region-ref-preview" id="regionRefPreview" hidden/);
  assert.match(indexHtml, /id="regionRefPreviewImg"/);
  assert.match(indexHtml, /id="regionRefClear"[^>]*aria-label="Remove region reference image"/);
  assert.match(styleCss, /\.region-ref-preview \{/);
  assert.match(appJs, /\$\('#regionStrengthField'\)\.hidden = !hasLora/);
});

test('region LoRA uses the shared card language and selected region color', () => {
  assert.match(appJs, /function renderRegionLoraCard\(region\)/);
  assert.match(appJs, /className = 'lora-card on region-lora-card'/);
  assert.match(appJs, /style\.setProperty\('--region-card-color', color\)/);
  assert.match(appJs, /Region LoRA options/);
  assert.match(appJs, /const dy = startY - event\.clientY/);
  assert.match(appJs, /card\.setPointerCapture\(pointerId\)/);
  assert.match(styleCss, /\.region-lora-card \{[\s\S]*border-color: var\(--region-card-color\)/);
});

test('Region mode automatically submits its configured regions', () => {
  assert.doesNotMatch(appJs, /regionsEnabled/);
  assert.match(appJs, /activeRegionsForRequest/);
  assert.match(appJs, /regions:\s*activeRegionsForRequest\(\)/);
  assert.match(appJs, /enabled: true/);
  assert.match(appJs, /maskImageName/);
});

test('regional LoRA strength is constrained to the usable zero-to-two range', () => {
  assert.match(indexHtml, /id="regionStrengthInput"[^>]*min="0"[^>]*max="2"/);
  assert.match(appJs, /function normalizeRegionStrength\(value\)/);
  assert.match(appJs, /Math\.max\(0, Math\.min\(2, strength\)\)/);
  assert.match(appJs, /strength: normalizeRegionStrength\(region\.strength\)/);
});

test('edit tab exposes Krea2 inpaint and mask painting controls', () => {
  assert.match(indexHtml, /data-engine="krea2"/);
  assert.match(indexHtml, /id="kreaMaskTools"/);
  assert.match(indexHtml, /id="kreaMaskCanvas"/);
  assert.match(appJs, /function openKreaMaskPainter/);
  assert.match(appJs, /function drawKreaMask/);
  assert.match(appJs, /editEngineLabel\(engine\)[\s\S]*Krea2/);
});

test('regional editor is inline while the mask painter retains sheet styling', () => {
  assert.match(styleCss, /\.region-workspace/);
  assert.match(styleCss, /\.region-stage/);
  assert.match(styleCss, /\.region-box/);
  assert.match(styleCss, /\.krea-mask-canvas/);
});

test('each region box shows its ordinal in the compact canvas badge', () => {
  assert.match(appJs, /class="region-box-number"[^>]*>\$\{index \+ 1\}/);
  assert.match(styleCss, /\.region-box-number \{[\s\S]*?background: #05070b;[\s\S]*?color: #f8faff;/);
});
