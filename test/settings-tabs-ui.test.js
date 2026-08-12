'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('advanced settings are split into accessible side tabs', () => {
  assert.match(html, /class="settings-tabs"[^>]+role="tablist"[^>]+aria-orientation="vertical"/);
  for (const name of ['General', 'Image', 'Video', 'Defaults', 'Suggestions', 'Addons', 'System', 'Community']) {
    assert.match(html, new RegExp(`id="settingsTab${name}"[^>]+role="tab"[^>]+aria-controls="settingsPane${name}"`));
    assert.match(html, new RegExp(`id="settingsPane${name}"[^>]+role="tabpanel"[^>]+aria-labelledby="settingsTab${name}"`));
  }
  assert.match(html, /id="settingsPaneGeneral"[^>]+data-settings-pane="general">/);
  assert.match(html, /id="settingsPaneImage"[^>]+data-settings-pane="image"[^>]+hidden>/);
  assert.match(html, /id="settingsPaneVideo"[^>]+data-settings-pane="video"[^>]+hidden>/);
  assert.match(html, /id="settingsPaneSystem"[^>]+data-settings-pane="system"[^>]+hidden>/);
  assert.match(html, /id="settingsPaneCommunity"[^>]+data-settings-pane="community" hidden>/);
  assert.ok(html.includes('<span>Prompting</span>'));
  assert.ok(html.includes('<span>Mix Packs</span>'));
  const drawer = html.match(/<div class="app-drawer-shell"([\s\S]*?)<\/aside>/)?.[1] || '';
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<\/section>/)?.[1] || '';
  assert.doesNotMatch(drawer, /Update channel/);
  assert.match(systemPane, /settings-update-info[\s\S]*id="settingsUpdatesBtn"[\s\S]*Release updates[\s\S]*id="settingsUpdatesStatus"[\s\S]*Installed[\s\S]*id="settingsAppVersion"/);
  assert.match(app, /renderAppRelease\(lastMeta\.app \|\| \{\}\)/);
});

test('Hugging Face token guidance uses the quiet settings note treatment', () => {
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<section class="settings-pane community-pane"/)?.[1] || '';
  assert.match(systemPane, /id="setHfToken"[\s\S]*<div class="settings-note">Gated models may require access approval and a read token\.<\/div>/);
  assert.doesNotMatch(systemPane, /Some gated downloads require both/);
});

test('community settings link to each official Black Mixture destination', () => {
  const pane = html.match(/id="settingsPaneCommunity"([\s\S]*?)<\/section>/)?.[1] || '';
  assert.match(pane, /https:\/\/www\.youtube\.com\/blackmixture/);
  assert.match(pane, /https:\/\/www\.patreon\.com\/BlackMixture/);
  assert.match(pane, /https:\/\/www\.instagram\.com\/blackmixture/);
  assert.match(pane, /https:\/\/discord\.gg\/n2N7Hgvn7n/);
  assert.match(pane, /https:\/\/www\.blackmixture\.com/);
  assert.equal((pane.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 5);
  assert.match(css, /button\[data-settings-tab="community"\] \{ --settings-tab-rgb: 255, 91, 126; \}/);
});

test('model settings retain one field each and follow logical pipeline groups', () => {
  const ids = [
    'setComfy', 'galleryPasswordInput', 'setUnet', 'setKrea2RawUnet', 'setKrea2TurboLora', 'setKrea2DepthLora', 'setDepthAnythingV3Model', 'setClip', 'setVae',
    'setKlein4Unet', 'setKlein4ConsistencyLora', 'setKlein4ConsistencyTrigger',
    'setKlein9Unet', 'setKlein9ConsistencyLora', 'setKlein9ConsistencyTrigger', 'setQeUnet', 'setDit', 'setSvVae',
    'setLtxCkpt', 'setWanHigh', 'setErosCkpt', 'setScailUnet', 'setSvAttn', 'setSysPrompt',
  ];
  for (const id of ids) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should appear once`);
  }
  assert.match(html, /data-settings-pane="image"[\s\S]*Krea 2[\s\S]*Flux 2 Klein Edit[\s\S]*Qwen Image Edit[\s\S]*SeedVR2 Upscale/);
  assert.match(html, /data-settings-pane="video"[\s\S]*LTX 2\.3[\s\S]*Wan 2\.2[\s\S]*10Eros DMD[\s\S]*SCAIL 2 Motion Transfer/);
});

test('Image and Video model settings use compact single-open disclosure lists', () => {
  const imagePane = html.match(/id="settingsPaneImage"([\s\S]*?)<section class="settings-pane" id="settingsPaneVideo"/)?.[1] || '';
  const pane = html.match(/id="settingsPaneVideo"([\s\S]*?)<section class="settings-pane" id="settingsPaneDefaults"/)?.[1] || '';
  const imageSections = imagePane.match(/<details class="settings-group settings-model-disclosure" data-settings-model-section="[^"]+">/g) || [];
  const sections = pane.match(/<details class="settings-group settings-model-disclosure" data-settings-model-section="[^"]+">/g) || [];
  assert.equal(imageSections.length, 4);
  assert.equal(sections.length, 7);
  assert.equal((imagePane.match(/<summary class="settings-model-summary">/g) || []).length, 4);
  assert.equal((pane.match(/<summary class="settings-model-summary">/g) || []).length, 7);
  assert.equal((imagePane.match(/<div class="settings-model-body">/g) || []).length, 4);
  assert.equal((pane.match(/<div class="settings-model-body">/g) || []).length, 7);
  assert.doesNotMatch(imagePane + pane, /data-settings-model-section="[^"]+"[^>]*\sopen(?:\s|>)/);
  for (const name of ['Krea 2', 'Flux 2 Klein Edit', 'Qwen Image Edit', 'SeedVR2 Upscale']) {
    assert.match(imagePane, new RegExp(`<span class="settings-model-name">${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`));
  }
  for (const name of ['LTX 2.5', 'LTX 2.3 &amp; Face ID', 'MiniMax H3', 'Wan 2.2', '10Eros DMD', 'SCAIL 2 Motion Transfer', 'Wan Animate 2']) {
    assert.match(pane, new RegExp(`<span class="settings-model-name">${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`));
  }
  assert.match(app, /\$\$\('\[data-settings-disclosure-group\]'\)\.forEach/);
  assert.match(app, /pane\.querySelectorAll\(':scope > \[data-settings-model-section\], :scope > \[data-settings-preference-section\]'\)/);
  assert.match(app, /if \(other !== disclosure && other\.open\) other\.open = false/);
  assert.match(css, /\.settings-model-disclosure,[\s\S]*\.settings-preference-disclosure \{[\s\S]*border-radius: 15px/);
  assert.match(css, /\.settings-pane\[data-settings-pane="image"\] \{ --settings-model-rgb: 52, 168, 83; \}/);
  assert.match(css, /\.settings-pane\[data-settings-pane="video"\] \{ --settings-model-rgb: 234, 67, 53; \}/);
  assert.match(css, /settings-preference-disclosure\)\[open\][\s\S]*transform: rotate\(180deg\)/);
});

test('settings tabs switch panes, support keyboard navigation, and keep content scrollable', () => {
  assert.match(app, /function setSettingsTab\(name, focus = false\)/);
  assert.match(app, /tab\.setAttribute\('aria-selected', String\(active\)\)/);
  assert.match(app, /pane\.hidden = !active/);
  assert.match(app, /\['ArrowUp', 'ArrowDown', 'Home', 'End'\]/);
  assert.match(css, /\.settings-shell \{[\s\S]*grid-template-columns: 104px minmax\(0, 1fr\)/);
  assert.match(css, /\.settings-content \{[\s\S]*overflow-y: auto/);
  assert.match(css, /\.settings-panel \{[\s\S]*overflow: hidden[\s\S]*display: flex/);
  const tabRail = css.match(/\.settings-tabs \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(tabRail, /background-color: #000/);
});

test('Preferences search finds and reveals settings across every tab', () => {
  assert.match(html, /id="settingsSearchInput"[^>]+type="search"[^>]+placeholder="Search all settings"[^>]+aria-controls="settingsSearchResults"/);
  assert.match(html, /id="settingsSearchClear"[^>]+aria-label="Clear settings search"[^>]+hidden/);
  assert.match(html, /id="settingsSearchResults"[^>]+aria-live="polite"[^>]+hidden/);
  assert.match(app, /function settingsSearchEntries\(\)/);
  assert.match(app, /function settingsSearchScore\(entry, query\)/);
  assert.match(app, /function renderSettingsSearch\(\)/);
  assert.match(app, /function revealSettingsSearchEntry\(entry\)/);
  assert.match(app, /disclosures\.reverse\(\)\.forEach\(\(disclosure\) => \{ disclosure\.open = true; \}\)/);
  assert.match(app, /setSettingsTab\(entry\.tab\)/);
  assert.match(app, /target\.scrollIntoView\(\{ block: 'center'/);
  assert.match(css, /\.settings-global-search \{[\s\S]*grid-template-columns: 16px minmax\(0, 1fr\) auto/);
  assert.match(css, /\.settings-content\.searching > \.settings-pane \{ display: none; \}/);
  assert.match(css, /\.settings-search-result \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto 17px/);
  assert.match(css, /@media \(max-width: 420px\) \{[\s\S]*\.settings-global-search \{ grid-column: 1 \/ -1/);
});

test('advanced settings exposes generation setup as a dedicated status entry', () => {
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<section class="settings-pane community-pane"/)?.[1] || '';
  assert.match(systemPane, /class="generation-setup-entry"[^>]+id="dependencyOpenSetup"/);
  assert.match(systemPane, /id="generationSetupSettingsCopy"/);
  assert.match(systemPane, /id="generationSetupSettingsStatus"/);
  assert.match(systemPane, /id="systemInstallationState"/);
  assert.doesNotMatch(html.match(/id="dependencyManagerCard"([\s\S]*?)<\/section>/)?.[1] || '', /id="dependencyOpenSetup"/);
  assert.match(app, /function renderGenerationSetupEntry\(\)/);
  assert.match(app, /openInitialSetup\(\{ returnToSettings: true \}\)/);
  assert.match(html, /id="setupReturnSettings"[^>]*hidden/);
  assert.match(css, /\.generation-setup-entry \{[\s\S]*grid-template-columns: 40px minmax\(0, 1fr\) auto 18px/);
});

test('General keeps experience and privacy controls while setup moves to System', () => {
  const generalPane = html.match(/id="settingsPaneGeneral"([\s\S]*?)<section class="settings-pane" id="settingsPaneImage"/)?.[1] || '';
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<section class="settings-pane community-pane"/)?.[1] || '';
  assert.match(generalPane, /id="guidedTourStart"[\s\S]*id="guidedTipsToggle"[\s\S]*id="experimentalFeaturesToggle"[\s\S]*id="analyticsToggle"/);
  assert.doesNotMatch(generalPane, /id="(?:setComfy|setHfToken|dependencyOpenSetup|dependencyManagerCard|phoneAccessOpen)"/);
  for (const section of ['system-installation', 'system-access', 'system-hardware', 'system-storage']) {
    assert.ok(systemPane.includes(`data-settings-preference-section="${section}"`));
  }
});

test('Prompting owns prompt AI, suggestions, filters, and advanced instructions', () => {
  const promptingPane = html.match(/id="settingsPaneSuggestions"([\s\S]*?)<section class="settings-pane addons-pane"/)?.[1] || '';
  const systemPane = html.match(/id="settingsPaneSystem"([\s\S]*?)<section class="settings-pane community-pane"/)?.[1] || '';
  for (const id of ['localPromptAiSettings', 'externalLlmSettings', 'contextPreferenceSearch', 'contextPreferenceFilter', 'contextPreferenceSort', 'setSysPrompt']) {
    assert.ok(promptingPane.includes(`id="${id}"`));
    assert.ok(!systemPane.includes(`id="${id}"`));
  }
  assert.match(app, /function renderPromptingSummaries\(\)/);
  assert.match(app, /No suggestions match this search and filter/);
  assert.match(css, /\.context-preference-card-summary \{/);
});

test('Generation Defaults use compact summaries and merge the Krea 2 edit override', () => {
  const pane = html.match(/id="settingsPaneDefaults"([\s\S]*?)<section class="settings-pane" id="settingsPaneSuggestions"/)?.[1] || '';
  assert.equal((pane.match(/data-settings-preference-section="defaults-[^"]+"/g) || []).length, 5);
  assert.match(pane, /data-settings-preference-section="defaults-edit"[\s\S]*id="defaultEditSteps"[\s\S]*Krea 2 Edit override[\s\S]*id="defaultKrea2EditSteps"/);
  for (const id of ['defaultSeedSummary', 'defaultCreateSummary', 'defaultEditSummary', 'defaultVideoSummary', 'defaultPresetSummary']) {
    assert.ok(pane.includes(`id="${id}"`));
  }
  assert.match(app, /function renderGenerationDefaultSummaries\(\)/);
});

test('each active settings tab uses a unique full-tile color without a side stripe', () => {
  assert.match(css, /button\[data-settings-tab="general"\] \{ --settings-tab-rgb: 66, 133, 244; \}/);
  assert.match(css, /button\[data-settings-tab="image"\] \{ --settings-tab-rgb: 52, 168, 83; \}/);
  assert.match(css, /button\[data-settings-tab="video"\] \{ --settings-tab-rgb: 234, 67, 53; \}/);
  assert.match(css, /button\[data-settings-tab="system"\] \{ --settings-tab-rgb: 169, 102, 255; \}/);
  const activeRule = css.match(/\.settings-tabs button\.active \{([\s\S]*?)\}/)?.[1] || '';
  assert.match(activeRule, /linear-gradient\(145deg, rgba\(var\(--settings-tab-rgb\), 0\.22\)/);
  assert.doesNotMatch(activeRule, /inset 2px 0/);
});

test('SeedVR2 attention uses an app-styled accessible picker instead of native select UI', () => {
  assert.doesNotMatch(html, /<select id="setSvAttn"/);
  assert.match(html, /id="setSvAttn" type="hidden" value="sdpa"/);
  assert.match(html, /id="svAttnTrigger"[^>]+aria-haspopup="listbox"[^>]+aria-expanded="false"/);
  assert.match(html, /id="svAttnList" role="listbox"[^>]+aria-hidden="true" inert/);
  const attentionList = html.match(/id="svAttnList"[\s\S]*?<\/div>/)?.[0] || '';
  assert.equal((attentionList.match(/role="option"/g) || []).length, 5);
  assert.match(css, /\.settings-choice-list \{[\s\S]*max-height: 0/);
  assert.match(css, /\.settings-choice\.open \.settings-choice-list \{[\s\S]*max-height: 350px/);
  assert.match(app, /function setSvAttnValue\(value\)/);
  assert.match(app, /function setSvAttnPickerOpen\(open, focusOption = false\)/);
  assert.match(app, /setSvAttnValue\(s\.seedvr2Attention \|\| 'sdpa'\)/);
  assert.match(app, /function applySvAttnVendorFilter\(vendor\)/);
  assert.match(app, /applySvAttnVendorFilter\(s\.gpuVendor \|\| ''\)/);
  assert.match(app, /\['ArrowDown', 'ArrowUp', 'Home', 'End'\]/);
});
