'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Advanced Settings exposes a responsive owner-managed add-ons installer', () => {
  assert.match(indexHtml, /data-settings-tab="addons"/);
  assert.match(indexHtml, /id="settingsPaneAddons"/);
  assert.match(indexHtml, /id="addonDropZone"/);
  assert.match(indexHtml, /accept="\.mixpack" multiple/);
  assert.match(indexHtml, /id="addonInspection"/);
  assert.match(indexHtml, /id="addonInspectionList"/);
  assert.match(indexHtml, /id="addonInstallAll"/);
  assert.match(indexHtml, /id="addonPackList"/);
  assert.match(indexHtml, /id="promptPresetImportBtn"/);
  assert.match(appJs, /Only the owner|owner profile|promptPacksCanManage/);
  assert.match(appJs, /inspectPromptPackFiles\(event\.dataTransfer\?\.files\)/);
  assert.match(appJs, /MAX_PENDING_PROMPT_PACKS = 5/);
  assert.match(appJs, /installAllInspectedPromptPacks/);
  assert.match(appJs, /addonFileInput'\)\.value = ''/);
  assert.match(appJs, /install\.disabled = promptPackBusy/);
  assert.match(appJs, /promptPackInspections = promptPackInspections\.filter/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.addon-pack-card/);
});

test('Visual Presets lets the owner import a Mix Pack through the reviewed Add-ons flow', () => {
  assert.match(indexHtml, /Import Mix Pack/);
  assert.match(appJs, /promptPresetImportBtn'\)\.hidden = !state\.promptPacksCanManage/);
  assert.match(appJs, /promptPresetImportBtn'\)\.addEventListener\('click'/);
  assert.match(appJs, /cameraSheet'\)\.classList\.remove\('show'\)/);
  assert.match(appJs, /setSettingsTab\('addons'\)/);
  assert.match(appJs, /inspectPromptPackFiles\(files\)/);
});

test('prompt pack routes stage review, require owner writes, and whitelist served assets', () => {
  assert.match(serverJs, /route === '\/api\/addons\/inspect'/);
  assert.match(serverJs, /readBody\(req, MAX_PROMPT_PACK_BYTES\)/);
  assert.match(serverJs, /promptPackInspections\.set/);
  assert.match(serverJs, /promptPackInspectionRoute/);
  assert.match(serverJs, /promptPackInspections\.delete\(promptPackInspectionRoute\[1\]\)/);
  assert.match(serverJs, /route === '\/api\/addons\/install'/);
  assert.match(serverJs, /Only the owner profile can install add-ons/);
  assert.match(serverJs, /serializePromptPackMutation/);
  assert.match(serverJs, /promptPackAsset/);
  assert.match(serverJs, /preset\.thumbnailFile === filename/);
});

test('installed categories merge into Visual Presets and keep semantic prompt tokens', () => {
  assert.match(appJs, /for \(const pack of state\.promptPacks/);
  assert.match(appJs, /if \(pack\.enabled === false\) continue/);
  assert.match(appJs, /categories\.has\(source\.id\)/);
  assert.match(appJs, /activePromptPresetTokens/);
  assert.match(appJs, /promptPresetSelectionPayload/);
  assert.match(indexHtml, /different categories combine/i);
});

test('Visual Presets browses named Mix Packs with representative thumbnails before categories', () => {
  assert.match(indexHtml, /id="promptPresetPackNav"[^>]*role="tablist"/);
  assert.match(appJs, /function promptPresetPackCatalog/);
  assert.match(appJs, /className = 'preset-pack-tab'/);
  assert.match(appJs, /promptPresetPackThumbnail\(pack\)/);
  assert.match(appJs, /activePromptPresetPackId/);
  assert.match(styleCss, /\.preset-pack-tab-thumb img/);
  assert.match(styleCss, /\.preset-pack-tabs\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(appJs, /syncPromptPresetPackOverflow/);
  assert.match(styleCss, /@keyframes preset-pack-label-scroll/);
  assert.match(styleCss, /prefers-reduced-motion:\s*reduce/);
});

test('Visual Presets searches enabled packs, categories, and presets from one responsive field', () => {
  assert.match(indexHtml, /id="promptPresetSearch"[^>]*type="search"/);
  assert.match(indexHtml, /id="promptPresetSearchStatus"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /id="promptPresetSearchClear"/);
  assert.match(appJs, /function promptPresetSearchEntries/);
  assert.match(appJs, /pack\.name,[\s\S]*category\.label,[\s\S]*preset\.label,[\s\S]*preset\.value/);
  assert.match(appJs, /className = 'preset-search-results'/);
  assert.match(appJs, /context: `\$\{pack\.name\} · \$\{category\.label\}`/);
  assert.match(appJs, /promptPresetSearchQuery = String\(event\.target\.value/);
  assert.match(appJs, /event\.key !== 'Escape'/);
  assert.match(styleCss, /\.preset-search:focus-within/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.preset-search/);
});

test('visual presets preserve the user scene and compose style instructions at generation time', () => {
  assert.match(appJs, /if \(state\.view !== 'create'\) return expanded/);
  assert.match(appJs, /for \(const preset of presets\) scene = stripAppliedPromptPreset/);
  assert.match(appJs, /Visual treatment:/);
});
