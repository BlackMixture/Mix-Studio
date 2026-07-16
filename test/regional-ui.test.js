'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');

test('Region navigation exposes an inline regional bounding-box editor without a duplicate prompt shortcut', () => {
  assert.match(indexHtml, /data-create-mode="region"/);
  assert.doesNotMatch(indexHtml, /id="regionsPromptBtn"/);
  assert.doesNotMatch(appJs, /regionsPromptBtn/);
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
  assert.match(appJs, /function renderDims\(\)[\s\S]*?syncRegionStageAspect\(\);[\s\S]*?renderRegionResolutionPicker\(\);\s*\}/);
  assert.match(appJs, /function renderRegionEditor\(\)[\s\S]*?syncRegionStageAspect\(\);/);
  assert.match(appJs, /stage\.style\.aspectRatio = `\$\{arW\} \/ \$\{arH\}`/);
  assert.doesNotMatch(stageCss, /max-height/);
});

test('Region mode moves the shared global prompt above the canvas', () => {
  assert.match(indexHtml, /id="promptPanel"/);
  assert.match(indexHtml, /id="promptLabel"/);
  assert.match(appJs, /promptSlot\.appendChild\(promptPanel\)/);
  assert.match(appJs, /textContent = isRegion \? 'Global prompt' : \(scailInputFirst \? 'Creative direction · optional' : 'Prompt'\)/);
  assert.match(styleCss, /\.icon-chip\[hidden\] \{ display: none; \}/);
  assert.ok(indexHtml.indexOf('id="regionGlobalPromptSlot"') < indexHtml.indexOf('class="region-toolbar"'));
});

test('selecting a region expands auto-saved settings and repeated clicks cycle overlaps', () => {
  assert.match(appJs, /function syncRegionSettings\(focusPrompt\)/);
  assert.match(appJs, /function selectRegionUnderneath\(clientX, clientY, currentRegion\)/);
  assert.match(appJs, /state\.activeRegionId !== region\.id[\s\S]*?selectRegionUnderneath\(event\.clientX, event\.clientY, region\)/);
  assert.match(appJs, /event\.detail === 0 \|\| settingsClick \|\| !!event\.target\.closest\('\.region-box-resize'\)/);
  assert.match(appJs, /if \(event\.target\.closest\('\.region-box-settings'\)\) return;/);
  assert.match(appJs, /setTimeout\(\(\) => \{[\s\S]*selectRegionUnderneath[\s\S]*\}, 520\)/);
  assert.match(appJs, /regionClickBlockedUntil = Date\.now\(\) \+ 400;[\s\S]*selectRegionUnderneath\(drag\.startX/);
  assert.match(appJs, /state\.activeRegionId = regionDrag\.region\.id;[\s\S]*regionClickBlockedUntil = Date\.now\(\) \+ 250/);
  assert.match(appJs, /regionSettingsOpen = true/);
  assert.match(styleCss, /\.region-settings\.show \{[\s\S]*grid-template-rows: 1fr/);
});

test('selected-region inspector appears below the canvas with visual asset inputs', () => {
  const globalAt = indexHtml.indexOf('id="regionGlobalPromptSlot"');
  const settingsAt = indexHtml.indexOf('id="regionSettings"');
  const toolbarAt = indexHtml.indexOf('class="region-toolbar"');
  const stageAt = indexHtml.indexOf('id="regionStage"');
  assert.ok(globalAt > -1 && globalAt < toolbarAt && toolbarAt < stageAt && stageAt < settingsAt);
  assert.match(indexHtml, /class="lora-grid region-lora-slot" id="regionLoraSlot"/);
  assert.match(indexHtml, /class="field region-support-field region-lora-disclosure" id="regionLoraDisclosure"/);
  assert.match(indexHtml, /class="field region-support-field region-reference-field"/);
  assert.doesNotMatch(indexHtml, /<label>Reference image<\/label>/);
  assert.match(indexHtml, /id="regionRefBtn"[^>]*aria-label="Add region reference image"/);
  assert.match(indexHtml, /<b>Add image<\/b><small>Guide this region<\/small>/);
  assert.match(indexHtml, /id="regionRefBtn"[\s\S]*class="region-ref-preview" id="regionRefPreview" hidden/);
  assert.match(indexHtml, /id="regionRefPreviewImg"/);
  assert.match(indexHtml, /id="regionRefClear"[^>]*aria-label="Remove region reference image"/);
  assert.match(styleCss, /\.region-ref-preview \{/);
  assert.match(styleCss, /\.region-reference-field \.region-asset-picker \{[\s\S]*min-height: 50px/);
  assert.match(styleCss, /\.region-reference-field \.region-ref-preview \{[\s\S]*display: block/);
  assert.match(styleCss, /\.region-reference-field \.region-ref-preview\[hidden\] \{ display: none; \}/);
  assert.match(styleCss, /\.region-fields \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.region-fields \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 50px/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.region-reference-field \.region-asset-copy \{ display: none; \}/);
  assert.match(appJs, /\$\('#regionStrengthField'\)\.hidden = !hasLora/);
  assert.match(appJs, /settings\.style\.setProperty\('--selected-region-color', selectedColor\)/);
  assert.match(styleCss, /\.region-settings-inner \{[\s\S]*?linear-gradient\(180deg,[\s\S]*?var\(--selected-region-color\) 18%[\s\S]*?#000 88%/);
  assert.match(styleCss, /\.region-settings-inner \{[\s\S]*?padding: 0 14px;[\s\S]*?border: 0 solid/);
  assert.match(styleCss, /\.region-settings\.show \.region-settings-inner \{ padding-block: 14px; border-width: 1px; \}/);
  assert.match(indexHtml, /id="regionSettingsTitle">Selected Region 1<\/strong>/);
  assert.doesNotMatch(indexHtml, /<span>Selected region<\/span>/);
  assert.match(appJs, /#regionSettingsTitle'\)\.textContent = `Selected Region \$\{index \+ 1\}`/);
  assert.match(styleCss, /\.region-settings-head strong \{[\s\S]*?var\(--selected-region-color\) 72%/);
});

test('Region keeps the compact phone picker and reuses Image resolution on wider screens', () => {
  assert.match(indexHtml, /class="region-toolbar"[\s\S]*id="regionAddBtn"[\s\S]*id="regionDeleteBtn"[\s\S]*id="regionResolutionBtn"/);
  assert.match(indexHtml, /id="regionResolutionMenu"[^>]*aria-hidden="true" inert/);
  assert.match(indexHtml, /id="regionAspectMenu"/);
  assert.match(indexHtml, /id="regionSizeMenu"/);
  assert.match(appJs, /function renderRegionResolutionPicker\(\)/);
  assert.match(appJs, /const wideRegionResolutionQuery = window\.matchMedia\('\(min-width: 641px\)'\)/);
  assert.match(appJs, /const useSharedRegionResolution = isRegion && wideRegionResolutionQuery\.matches/);
  assert.match(appJs, /\$\('#resPanel'\)\.hidden = state\.view === 'edit'[\s\S]*\(isRegion && !useSharedRegionResolution\)/);
  assert.match(appJs, /\$\('\.region-resolution-picker'\)\.hidden = useSharedRegionResolution/);
  assert.match(appJs, /setRegionResolutionExpanded\(false\)/);
  assert.match(appJs, /renderRegionResolutionPicker\(\);/);
  assert.match(styleCss, /\.region-resolution-menu \{[\s\S]*position: absolute/);
  assert.match(styleCss, /\.region-resolution-menu \{[\s\S]*background: #000/);
  assert.match(styleCss, /\.region-aspect-option \.ar-box \{[\s\S]*border: 1\.5px solid currentColor/);
  assert.match(styleCss, /\.region-aspect-option small \{[\s\S]*font-size: 7\.5px;[\s\S]*white-space: nowrap/);
  assert.match(styleCss, /\.region-aspect-option\.active \{[\s\S]*var\(--gemini\) border-box/);
  assert.match(styleCss, /\.region-size-menu \{[\s\S]*display: inline-flex;[\s\S]*border-radius: 999px/);
  assert.match(appJs, /const dimensions = dimensionsForMegapixels\(aspect\.ar, state\.mp\);[\s\S]*<small>\$\{dimensions\.w\} × \$\{dimensions\.h\}<\/small>/);
  assert.match(styleCss, /@media \(max-width: 640px\) \{[\s\S]*\.region-resolution-menu \{[\s\S]*position: fixed;[\s\S]*max-height: min\(70dvh, 430px\);[\s\S]*overflow-y: auto/);
});

test('tablet Region rail is wider, container-aware, and hides only its scrollbar chrome', () => {
  assert.match(styleCss, /\.region-workspace \{[\s\S]*container: region-workspace \/ inline-size/);
  assert.match(styleCss, /@container region-workspace \(max-width: 340px\)[\s\S]*\.region-fields \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 50px/);
  assert.match(styleCss, /body\[data-ui-mode="region"\] \{[\s\S]*--studio-left-width: 380px;[\s\S]*--studio-right-width: 300px/);
  assert.match(styleCss, /\.tabs-wrap \{[\s\S]*grid-template-columns: var\(--studio-left-width\) minmax\(420px, 1fr\) var\(--studio-right-width\)/);
  assert.match(styleCss, /#view-create \{[\s\S]*scrollbar-width: none;[\s\S]*-ms-overflow-style: none/);
  assert.match(styleCss, /#view-create::\-webkit-scrollbar \{[\s\S]*display: none;[\s\S]*width: 0;[\s\S]*height: 0/);
  assert.match(styleCss, /body\[data-ui-mode="region"\] \.region-toolbar-actions \.chip \{[\s\S]*white-space: nowrap/);
});

test('region LoRA settings use an accessible animated disclosure', () => {
  assert.match(indexHtml, /id="regionLoraHeader"[^>]*aria-expanded="false"[^>]*aria-controls="regionLoraBody"/);
  assert.match(indexHtml, /id="regionLoraBody" aria-hidden="true" inert/);
  assert.match(appJs, /function setRegionLoraExpanded\(open\)/);
  assert.match(appJs, /regionLoraHeader'\)\.addEventListener\('click'/);
  assert.match(styleCss, /\.region-lora-body \{[\s\S]*grid-template-rows: 0fr/);
  assert.match(styleCss, /\.region-lora-disclosure\.expanded \.region-lora-body \{ grid-template-rows: 1fr; \}/);
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
  assert.match(appJs, /enhance: region\.enhance !== false/);
  assert.match(appJs, /enabled: true/);
  assert.match(appJs, /maskImageName/);
});

test('each region has an independent generation-time prompt enhance toggle', () => {
  assert.match(indexHtml, /id="regionEnhanceBtn"[^>]*aria-pressed="true"/);
  assert.match(indexHtml, /id="regionDescInput"[\s\S]*id="regionEnhanceBtn"/);
  assert.match(appJs, /description: '',\s*enhance: state\.enhance !== false/);
  assert.match(appJs, /regionEnhanceButton\.classList\.toggle\('on', enhanceRegion\)/);
  assert.match(appJs, /regionEnhanceBtn'\)\.addEventListener\('click'/);
  assert.match(appJs, /region\.enhance = region\.enhance === false/);
  assert.match(appJs, /delete region\.refinedDescription/);
  assert.match(appJs, /if \(d\.profileId && state\.profile && d\.profileId !== state\.profile\.id\) return/);
  assert.match(styleCss, /\.region-prompt-box \{ position: relative; \}/);
});

test('reusing an enhanced regional generation can restore refined or original region text', () => {
  assert.match(appJs, /const hasEnhancedRegions = Array\.isArray\(it\.regions\)/);
  assert.match(appJs, /region\.refinedDescription \|\| region\.description/);
  assert.match(appJs, /enhance: useEnhanced \? false : region\.enhance !== false/);
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
