'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'style.css'), 'utf8');
const cameraSettingsJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'camera-settings.js'), 'utf8');
const cameraAssetsDir = path.join(__dirname, '..', 'public', 'assets', 'camera-presets');

test('prompt tools expose Mix Packs in the shared Create, Edit, and video prompt', () => {
  assert.match(indexHtml, /id="cameraPromptBtn"/);
  const promptBox = indexHtml.slice(indexHtml.indexOf('<div class="prompt-box">'), indexHtml.indexOf('<div class="prompt-intent-hint"'));
  const createTools = indexHtml.slice(indexHtml.indexOf('id="createPromptTools"'), indexHtml.indexOf('id="videoPromptTools"'));
  assert.match(promptBox, /class="prompt-camera-btn"[^>]*id="cameraPromptBtn"[^>]*aria-label="Mix Packs"/);
  assert.match(promptBox, /<rect x="4" y="5" width="13" height="13" rx="2"\/>/);
  assert.doesNotMatch(createTools, /id="cameraPromptBtn"/);
  assert.match(styleCss, /\.prompt-camera-btn\s*\{[^}]*position:\s*absolute[^}]*right:\s*56px/s);
  assert.match(appJs, /cameraPromptBtn'\)\.hidden = false/);
  assert.match(styleCss, /has\(\.prompt-camera-btn:not\(\[hidden\]\)\):has\(\.edit-sequence-btn:not\(\[hidden\]\)\)/);
  assert.match(indexHtml, /id="cameraSheet"/);
  assert.match(indexHtml, /id="promptPresetCategories"/);
  assert.match(indexHtml, /id="promptPresetCategoryNav"[^>]*role="group"/);
  assert.match(indexHtml, /id="promptPresetCategoryRail"[^>]*role="navigation"[^>]*aria-label="Mix Pack sections"/);
  assert.match(indexHtml, /id="promptPresetCategoryPrev"[^>]*aria-label="Show previous Mix Pack sections"/);
  assert.match(indexHtml, /id="promptPresetCategoryNext"[^>]*aria-label="Show more Mix Pack sections"/);
  assert.match(appJs, /promptPresetCatalog/);
  assert.match(appJs, /section\.dataset\.presetCategory = category\.id/);
  assert.match(appJs, /querySelector\('\.camera-preset-grid'\)/);
  assert.match(appJs, /renderCameraPicker/);
  assert.match(appJs, /promptPresetSelections/);
  assert.match(appJs, /cameraPresetPromptPhrase/);
  assert.match(appJs, /applyPromptPresetSelection/);
});

test('camera sheet uses visual presets instead of individual camera controls', () => {
  assert.doesNotMatch(indexHtml, /Category 01/);
  assert.doesNotMatch(indexHtml, /Shape the look/);
  assert.doesNotMatch(indexHtml, /Check a preset to apply it/);
  assert.doesNotMatch(indexHtml, /data-camera-wheel=/);
  assert.doesNotMatch(indexHtml, /id="cameraWheelBoard"/);
  assert.match(appJs, /class="camera-preset-grid"/);
  assert.match(appJs, /className = 'camera-preset-card'/);
  assert.match(appJs, /setAttribute\('role', 'checkbox'\)/);
  assert.match(appJs, /setAttribute\('aria-checked'/);
});

test('Mix Pack category rail navigates a continuous section list and follows manual scrolling', () => {
  assert.match(indexHtml, /<span class="preset-category-selector-label">Sections<\/span>/);
  assert.match(appJs, /activePromptPresetCategoryId/);
  assert.match(appJs, /\{ id: 'all', label: 'All' \}/);
  assert.match(appJs, /tab\.setAttribute\('aria-current', 'location'\)/);
  assert.match(appJs, /section\.setAttribute\('role', 'region'\)/);
  assert.doesNotMatch(appJs, /section\.hidden = activePromptPresetCategoryId/);
  assert.match(appJs, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
  assert.match(appJs, /function syncPromptPresetCategoryIndicator/);
  assert.match(appJs, /function syncPromptPresetCategoryOverflow/);
  assert.match(appJs, /function scrollPromptPresetCategories/);
  assert.match(appJs, /function activatePromptPresetCategory/);
  assert.match(appJs, /function navigatePromptPresetCategory/);
  assert.match(appJs, /function syncPromptPresetCategoryFromScroll/);
  assert.match(appJs, /function schedulePromptPresetCategoryScrollSync/);
  assert.match(appJs, /promptPresetCategoryNavigationTarget/);
  assert.match(appJs, /function cancelPromptPresetCategoryNavigation/);
  assert.match(appJs, /promptPresetCategories'\)\.addEventListener\('scroll', schedulePromptPresetCategoryScrollSync/);
  assert.match(appJs, /promptPresetCategories'\)\.addEventListener\('pointerdown', cancelPromptPresetCategoryNavigation/);
  assert.match(appJs, /list\.scrollTo\(\{[\s\S]*behavior: options\.animate === false \|\| reduceMotion \? 'auto' : 'smooth'/);
  assert.match(appJs, /behavior: animate \? 'smooth' : 'auto'/);
  assert.match(styleCss, /\.preset-category-tabs\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(styleCss, /\.preset-category-tabs\s*{[^}]*border-radius:\s*999px/s);
  assert.match(styleCss, /\.preset-category-rail\.can-scroll-next \.preset-category-scroll-next/);
  assert.match(styleCss, /\.preset-category-rail\.can-scroll-prev::before/);
  assert.match(styleCss, /\.preset-category-filter-indicator\.is-ready\s*{[^}]*transition:/s);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.preset-picker-head/);
});

test('sheets lock background scrolling while dialogs are open', () => {
  assert.match(appJs, /syncSheetScrollLock/);
  assert.match(appJs, /MutationObserver/);
  assert.match(styleCss, /body\.sheet-open/);
  assert.match(styleCss, /position:\s*fixed/);
});

test('camera cards expose clear selected and missing-image states', () => {
  assert.match(styleCss, /\.camera-preset-card\.active/);
  assert.match(styleCss, /\.camera-preset-card\.active \.camera-preset-check/);
  assert.match(styleCss, /\.camera-preset-card\.image-missing img/);
});

test('an applied preset becomes a thumbnail card without changing its plain prompt value', () => {
  assert.match(appJs, /function makePromptPresetToken/);
  assert.match(appJs, /token\.className = 'prompt-preset-token'/);
  assert.match(appJs, /token\.contentEditable = 'false'/);
  assert.match(appJs, /dataset\.promptValue/);
  assert.match(appJs, /el\.classList\.contains\('prompt-preset-token'\)/);
  assert.match(styleCss, /\.prompt-preset-token\s*{/);
  assert.match(appJs, /dataset\.presetAccent/);
  assert.match(appJs, /image\.src = preset\.thumbnail/);
  assert.match(appJs, /label\.textContent = preset\.label/);
  assert.match(appJs, /open\.dataset\.openPromptPreset = preset\.presetId/);
  assert.match(appJs, /openCameraPicker\(\{[\s\S]*packId: token\.dataset\.presetPack,[\s\S]*categoryId: token\.dataset\.presetCategory,[\s\S]*presetId: token\.dataset\.presetId/);
  assert.match(appJs, /remove\.dataset\.removePromptPreset/);
  assert.match(appJs, /function makePromptPresetSeparator/);
  assert.match(appJs, /el\.classList\.contains\('prompt-preset-separator'\)/);
  assert.match(appJs, /separator\?\.remove\(\)/);
  assert.match(styleCss, /\.prompt-preset-open > img/);
  assert.match(styleCss, /\.prompt-preset-token-copy/);
  assert.match(styleCss, /\.prompt-preset-token\[data-preset-accent="violet"\]/);
});

test('camera cards apply immediately and toggle independently without a dedicated action row', () => {
  assert.doesNotMatch(indexHtml, /id="cameraPresetClear"/);
  assert.doesNotMatch(indexHtml, /id="cameraApply"/);
  assert.doesNotMatch(indexHtml, /class="preset-picker-actions"/);
  assert.match(appJs, /applyPromptPresetSelection\(category\.id, preset\)/);
  assert.match(appJs, /const next = active[\s\S]*current\.filter[\s\S]*\[\.\.\.current, preset\]/);
  assert.match(appJs, /state\.promptPresetSelections = Object\.assign/);
  assert.match(appJs, /stripAppliedPromptPreset\(value, preset\.value\)/);
  assert.doesNotMatch(appJs, /cameraApply'\)\.addEventListener/);
});

test('camera presets start unselected and omit redundant optional state', () => {
  assert.match(appJs, /promptPresetSelections:\s*\{\s*camera:\s*\[\]/);
  assert.match(cameraSettingsJs, /legacySettings && typeof legacySettings === 'object'/);
  assert.match(cameraSettingsJs, /:\s*null;/);
  assert.doesNotMatch(appJs, /data-state="optional"/);
  assert.doesNotMatch(appJs, /another pack'\)\}` : 'Optional'/);
  assert.doesNotMatch(styleCss, /\.preset-category-state\[data-state="optional"\]/);
  assert.match(appJs, /data-state="applied"/);
  assert.match(appJs, /data-state="other"/);
});

test('Mix Packs use a pack landing grid and removable applied-look thumbnails', () => {
  assert.match(indexHtml, /id="promptPresetPackBrowser"/);
  assert.match(indexHtml, /id="promptPresetPackDetail" hidden/);
  assert.match(indexHtml, /id="promptPresetPackBack"/);
  assert.match(indexHtml, /id="promptPresetSelectionList"/);
  assert.doesNotMatch(indexHtml, /Choose a thumbnail to add its visual language/);
  assert.match(appJs, /promptPresetPackView = 'catalog'/);
  assert.match(appJs, /promptPresetPackView = 'detail'/);
  assert.match(appJs, /className = 'preset-pack-card'/);
  assert.match(appJs, /className = 'preset-selection-chip'/);
  assert.match(appJs, /applyPromptPresetSelection\(preset\.category, preset\)/);
  assert.doesNotMatch(appJs, /<i aria-hidden="true">✓<\/i>/);
  assert.doesNotMatch(styleCss, /\.preset-category-tab i/);
  assert.match(styleCss, /\.preset-pack-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styleCss, /\.preset-pack-card-media\s*{[^}]*aspect-ratio:\s*4\s*\/\s*3/s);
  assert.match(styleCss, /\.preset-pack-card-media img\s*{[^}]*object-fit:\s*contain/s);
  assert.match(appJs, /function syncPromptPresetPackNameOverflow/);
  assert.match(styleCss, /@keyframes preset-pack-name-scroll/);
});

test('camera dialog uses dark surfaces consistent with the app chrome', () => {
  assert.match(styleCss, /\.camera-panel\s*{[^}]*#030407/s);
  assert.match(styleCss, /\.camera-preset-card\s*{[^}]*background:\s*#07090e/s);
  assert.doesNotMatch(styleCss, /\.preset-picker-head\s*{[^}]*border-bottom:/s);
  assert.match(styleCss, /#cameraSheet\s*{[^}]*align-items:\s*center/s);
  assert.match(styleCss, /\.camera-panel\s*{[^}]*border-radius:\s*24px/s);
  assert.match(styleCss, /@keyframes presetDialogIn/);
});

test('camera preset grid adapts from three desktop columns to two mobile columns', () => {
  assert.match(styleCss, /\.camera-preset-grid\s*{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.camera-preset-grid\s*{[^}]*repeat\(2,/);
  assert.match(styleCss, /\.camera-preset-image\s*{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
  assert.match(styleCss, /\.camera-preset-image img\s*{[^}]*object-fit:\s*contain/s);
  assert.doesNotMatch(styleCss, /\.camera-preset-card:hover img\s*{[^}]*transform:\s*scale/s);
});

test('every camera preset thumbnail is packaged with the app', () => {
  const cameraSettings = require('../public/camera-settings');
  for (const combo of cameraSettings.CAMERA_COMBOS) {
    const file = path.join(__dirname, '..', 'public', combo.thumbnail);
    assert.ok(fs.existsSync(file), `${combo.id} thumbnail should exist`);
    assert.ok(fs.statSync(file).size > 20_000, `${combo.id} thumbnail should not be an empty placeholder`);
  }
  assert.ok(fs.existsSync(path.join(cameraAssetsDir, 'manifest.json')));
});

test('camera shared script loads before the app script', () => {
  const cameraScript = indexHtml.indexOf('/camera-settings.js');
  const appScript = indexHtml.indexOf('/app.js');
  assert.ok(cameraScript > -1);
  assert.ok(appScript > -1);
  assert.ok(cameraScript < appScript);
});
