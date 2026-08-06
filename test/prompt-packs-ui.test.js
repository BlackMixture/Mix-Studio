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

test('Preferences exposes a responsive owner-managed add-ons installer', () => {
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
  assert.match(appJs, /MAX_PROMPT_PACK_FILE_BYTES = 64 \* 1024 \* 1024/);
  assert.match(appJs, /Preset packs must be \$\{MAX_PROMPT_PACK_FILE_BYTES \/ \(1024 \* 1024\)\} MB or smaller/);
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

test('Mix Pack management clearly upgrades newer versions and permanently deletes removed packs', () => {
  assert.match(appJs, /data-addon-remove="\$\{escapeHtml\(pack\.id\)\}">Delete</);
  assert.match(appJs, /title: `Permanently delete \$\{pack\.name\}\?`/);
  assert.match(appJs, /This cannot be undone/);
  assert.match(appJs, /result\.operation === 'updated'/);
  assert.match(serverJs, /versionChange: current/);
  assert.match(serverJs, /operation: current \? 'updated' : 'installed'/);
  assert.match(serverJs, /deleted: true,[\s\S]*recoverable: false/);
  assert.doesNotMatch(appJs, /files move to recoverable trash/);
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
  assert.match(styleCss, /\.preset-pack-grid\s*{[^}]*repeat\(3,/s);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.preset-pack-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(appJs, /syncPromptPresetPackNameOverflow/);
  assert.match(styleCss, /@keyframes preset-pack-name-scroll/);
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

test('Mix Pack detail categories use scroll-aware section navigation', () => {
  assert.match(indexHtml, /preset-category-selector-label">Sections</);
  assert.match(indexHtml, /id="promptPresetCategoryRail"[^>]*role="navigation"[^>]*aria-label="Mix Pack sections"/);
  assert.match(indexHtml, /id="promptPresetCategoryNav"[^>]*role="group"[^>]*aria-label="Navigate Mix Pack sections"/);
  assert.match(appJs, /let activePromptPresetCategoryId = 'all'/);
  assert.match(appJs, /const categoryFilters = \[\s*\{ id: 'all', label: 'All' \}/);
  assert.match(appJs, /tab\.setAttribute\('aria-current', 'location'\)/);
  assert.doesNotMatch(appJs, /section\.hidden = activePromptPresetCategoryId/);
  assert.match(appJs, /section\.setAttribute\('role', 'region'\)/);
  assert.match(appJs, /function navigatePromptPresetCategory/);
  assert.match(appJs, /function syncPromptPresetCategoryFromScroll/);
  assert.match(appJs, /promptPresetCategories'\)\.addEventListener\('scroll', schedulePromptPresetCategoryScrollSync/);
  assert.match(styleCss, /\.preset-category-tab\s*{[^}]*border-radius:\s*999px/s);
  assert.match(appJs, /categoryIndicator\.className = 'preset-category-filter-indicator'/);
  assert.match(appJs, /indicator\.style\.transform = `translateX\(\$\{active\.offsetLeft\}px\)`/);
  assert.match(styleCss, /\.preset-category-filter-indicator\s*{[^}]*background:\s*#1b2030/s);
  assert.match(styleCss, /\.preset-category-tab\.active\s*{[^}]*background:\s*transparent/s);
  assert.match(styleCss, /\.preset-category:not\(\[hidden\]\) ~ \.preset-category:not\(\[hidden\]\)/);
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
  context.state.view = 'edit';
  assert.equal(compose(), 'A silver ball in grass. Visual treatment: bold flat ink.');
  context.state.view = 'video';
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
  assert.ok((appJs.match(/promptPresets: promptPresetMetadataForGeneration\(\)/g) || []).length >= 2);
  assert.match(appJs, /function promptPresetSelectionsForReuse/);
  assert.match(appJs, /Array\.isArray\(item\?\.promptPresets\)/);
  assert.match(appJs, /for \(const category of promptPresetCatalog\(\)\)/);
  assert.match(appJs, /state\.promptPresetSelections = promptPresetSelectionsForReuse\(it, restoredPrompt\)/);
  assert.match(serverJs, /function normalizePromptPresets/);
  assert.match(serverJs, /p\.mode === 't2i' \|\| p\.mode === 'edit'/);
  assert.match(serverJs, /promptPresets = normalizePromptPresets\([\s\S]*body\.promptPresets/);
  assert.ok((serverJs.match(/promptPresets: job\.params\.promptPresets/g) || []).length >= 3);
});

test('preset cards recover from their exact prompt text after transient selection-state loss', () => {
  const key = namedFunction(appJs, 'promptPresetSelectionKey');
  const payload = namedFunction(appJs, 'promptPresetSelectionPayload');
  const catalog = [{
    id: 'style',
    presets: [{
      category: 'style',
      categoryLabel: 'Style',
      accent: 'rose',
      packId: 'atlas',
      presetId: 'paper',
      label: 'Torn Paper',
      value: 'layered torn-paper collage',
      thumbnail: '/api/addons/atlas/paper.webp',
    }],
  }];
  const reuse = namedFunction(appJs, 'promptPresetSelectionsForReuse', {
    promptPresetSelectionKey: key,
    promptPresetCatalog: () => catalog,
    promptPresetSelectionPayload: payload,
  });
  const signature = namedFunction(appJs, 'promptPresetSelectionStateSignature', {
    promptPresetSelectionKey: key,
  });
  const state = { view: 'create', promptPresetSelections: {} };
  const reconcile = namedFunction(appJs, 'reconcilePromptPresetSelectionsWithPrompt', {
    state,
    promptDraft: () => 'A fox, layered torn-paper collage',
    selectedPromptPresets: () => [],
    promptPresetSelectionPayload: payload,
    promptPresetSelectionsForReuse: reuse,
    promptPresetSelectionStateSignature: signature,
  });
  assert.equal(reconcile('A fox, layered torn-paper collage'), true);
  assert.equal(state.promptPresetSelections.style[0].presetId, 'paper');
  assert.equal(state.promptPresetSelections.style[0].label, 'Torn Paper');
});

test('desktop input history and form reset keep preset identity aligned with the prompt', () => {
  assert.match(appJs, /'prompts', 'promptPresetSelections', 'loras'/);
  assert.match(appJs, /state\.promptPresetSelections = \{ camera: \[\] \};[\s\S]*state\.regions = \[\]/);
  assert.match(appJs, /function renderPromptComposer\(\)[\s\S]*reconcilePromptPresetSelectionsWithPrompt\(value\)/);
  assert.match(appJs, /function promptPresetMetadataForGeneration\(\)[\s\S]*reconcilePromptPresetSelectionsWithPrompt\(value\)/);
  assert.match(appJs, /const restoredPresetCards = reconcilePromptPresetSelectionsWithPrompt\(\)/);
});
