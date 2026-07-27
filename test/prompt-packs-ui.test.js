'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function namedFunction(source, name, context = {}) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is defined`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    if (depth === 0) return vm.runInNewContext(`(${source.slice(start, index + 1)})`, context);
  }
  throw new Error(`${name} has no closing brace`);
}

test('Advanced Settings exposes a responsive owner-managed add-ons installer', () => {
  assert.match(indexHtml, /data-settings-tab="addons"/);
  assert.match(indexHtml, /id="settingsPaneAddons"/);
  assert.match(indexHtml, /id="addonDropZone"/);
  assert.match(indexHtml, /accept="\.mixpack" multiple/);
  assert.match(indexHtml, /id="addonInspection"/);
  assert.match(indexHtml, /id="addonInspectionList"/);
  assert.match(indexHtml, /id="addonInstallAll"/);
  assert.match(indexHtml, /id="addonPackList"/);
  assert.doesNotMatch(indexHtml, /id="promptPresetImportBtn"/);
  assert.match(appJs, /Only the owner|owner profile|promptPacksCanManage/);
  assert.match(appJs, /inspectPromptPackFiles\(event\.dataTransfer\?\.files\)/);
  assert.match(appJs, /MAX_PENDING_PROMPT_PACKS = 5/);
  assert.match(appJs, /installAllInspectedPromptPacks/);
  assert.match(appJs, /addonFileInput'\)\.value = ''/);
  assert.match(appJs, /install\.disabled = promptPackBusy/);
  assert.match(appJs, /promptPackInspections = promptPackInspections\.filter/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.addon-pack-card/);
});

test('Mix Pack importing remains in the reviewed Add-ons flow instead of the picker', () => {
  assert.doesNotMatch(indexHtml, /Import Mix Pack/);
  assert.doesNotMatch(appJs, /promptPresetImportBtn/);
  assert.match(indexHtml, /id="settingsPaneAddons"/);
  assert.match(indexHtml, /id="addonChooseBtn"/);
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

test('installed categories merge into Mix Packs and keep semantic prompt tokens', () => {
  assert.match(appJs, /for \(const pack of state\.promptPacks/);
  assert.match(appJs, /if \(pack\.enabled === false\) continue/);
  assert.match(appJs, /categories\.has\(source\.id\)/);
  assert.match(appJs, /activePromptPresetTokens/);
  assert.match(appJs, /promptPresetSelectionPayload/);
  assert.match(indexHtml, /id="promptPresetDialogTitle">Mix Packs/);
});

test('the picker opens on named Mix Pack cards before showing a pack detail page', () => {
  assert.match(indexHtml, /id="promptPresetPackNav"[^>]*role="list"/);
  assert.match(indexHtml, /id="promptPresetPackBrowser"/);
  assert.match(indexHtml, /id="promptPresetPackDetail" hidden/);
  assert.match(appJs, /function promptPresetPackCatalog/);
  assert.match(appJs, /className = 'preset-pack-card'/);
  assert.match(appJs, /promptPresetPackThumbnail\(pack\)/);
  assert.match(appJs, /function promptPresetPackSelection/);
  assert.match(appJs, /selected\?\.thumbnail \|\| pack\.categories/);
  assert.match(appJs, /activePromptPresetPackId = preset\.packId \|\| activePromptPresetPackId/);
  assert.match(appJs, /activePromptPresetPackId/);
  assert.match(styleCss, /\.preset-pack-card-media img/);
  assert.match(styleCss, /\.preset-pack-grid\s*{[^}]*repeat\(2,/s);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.preset-pack-grid\s*{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(styleCss, /prefers-reduced-motion:\s*reduce/);
});

test('Mix Pack details search the selected pack from one responsive field', () => {
  assert.match(indexHtml, /id="promptPresetSearch"[^>]*type="search"/);
  assert.match(indexHtml, /id="promptPresetSearchStatus"[^>]*aria-live="polite"/);
  assert.match(indexHtml, /id="promptPresetSearchClear"/);
  assert.match(appJs, /function promptPresetSearchEntries/);
  assert.match(appJs, /pack\.name,[\s\S]*category\.label,[\s\S]*preset\.label,[\s\S]*preset\.value/);
  assert.match(appJs, /className = 'preset-search-results'/);
  assert.match(appJs, /context: `\$\{pack\.name\} · \$\{category\.label\}`/);
  assert.match(appJs, /promptPresetSearchEntries\(activePack \? \[activePack\] : \[\]/);
  assert.match(appJs, /promptPresetSearchQuery = String\(event\.target\.value/);
  assert.match(appJs, /event\.key !== 'Escape'/);
  assert.match(styleCss, /\.preset-search:focus-within/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.preset-search/);
});

test('visual preset prompt composition is profile-configurable and defaults to the original direct format', () => {
  assert.match(indexHtml, /id="defaultPresetVisualTreatment"[^>]*aria-checked="false"/);
  assert.match(indexHtml, /id="defaultPresetCards"[^>]*aria-checked="true"/);
  assert.match(appJs, /state\.userDefaults\.visualPresets\?\.useVisualTreatment !== true/);
  assert.match(appJs, /for \(const preset of presets\) scene = stripAppliedPromptPreset/);
  assert.match(appJs, /Visual treatment:/);
  assert.match(appJs, /state\.userDefaults\.visualPresets\?\.showCards === false/);
  assert.match(appJs, /renderPromptComposer\(\);[\s\S]*scheduleSettingsAutosave\('preferences', 0\)/);
});

test('visual treatment changes only the submitted prompt when explicitly enabled', () => {
  const context = {
    state: { view: 'create', userDefaults: { visualPresets: { useVisualTreatment: false } } },
    promptDraft: () => 'A silver ball in grass, bold flat ink',
    expandPromptLoraTriggers: (value) => value,
    activePromptPresetTokens: () => [{ value: 'bold flat ink' }],
    stripAppliedPromptPreset: (value, phrase) => value.replace(`, ${phrase}`, ''),
  };
  const compose = namedFunction(appJs, 'promptForGeneration', context);
  assert.equal(compose(), 'A silver ball in grass, bold flat ink');
  context.state.userDefaults.visualPresets.useVisualTreatment = true;
  assert.equal(compose(), 'A silver ball in grass. Visual treatment: bold flat ink.');
});

test('preset selection state preserves multiple choices from the same category', () => {
  const key = namedFunction(appJs, 'promptPresetSelectionKey');
  const state = {
    promptPresetSelections: {
      style: [
        { packId: 'atlas', presetId: 'anime', promptText: 'cinematic anime' },
        { packId: 'atlas', presetId: 'print', promptText: 'retro print' },
      ],
    },
  };
  const catalog = [{
    id: 'style',
    presets: [
      { category: 'style', packId: 'atlas', presetId: 'anime', value: 'cinematic anime' },
      { category: 'style', packId: 'atlas', presetId: 'print', value: 'retro print' },
    ],
  }];
  const rawSelections = namedFunction(appJs, 'rawPromptPresetSelections', { state });
  const selected = namedFunction(appJs, 'selectedPromptPresets', {
    state,
    promptPresetCatalog: () => catalog,
    promptPresetSelectionKey: key,
    rawPromptPresetSelections: rawSelections,
    CameraSettings: null,
    builtinCameraPresets: () => [],
  });
  assert.deepEqual(
    Array.from(selected('style'), (preset) => preset.presetId),
    ['anime', 'print'],
  );
});

test('gallery reuse restores preset card metadata and can infer older saved prompts', () => {
  assert.match(appJs, /promptPresets: mode === 't2i' \? promptPresetMetadataForGeneration\(\) : undefined/);
  assert.match(appJs, /function promptPresetSelectionsForReuse/);
  assert.match(appJs, /Array\.isArray\(item\?\.promptPresets\)/);
  assert.match(appJs, /for \(const category of promptPresetCatalog\(\)\)/);
  assert.match(appJs, /state\.promptPresetSelections = promptPresetSelectionsForReuse\(it, restoredPrompt\)/);
  assert.match(serverJs, /function normalizePromptPresets/);
  assert.ok((serverJs.match(/promptPresets: job\.params\.promptPresets/g) || []).length >= 3);
});
