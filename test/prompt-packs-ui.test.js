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
  assert.match(indexHtml, /accept="\.mixpack"/);
  assert.match(indexHtml, /id="addonInspection"/);
  assert.match(indexHtml, /id="addonPackList"/);
  assert.match(appJs, /Only the owner|owner profile|promptPacksCanManage/);
  assert.match(appJs, /dataTransfer\?\.files\?\.\[0\]/);
  assert.match(styleCss, /@media \(max-width: 640px\)[\s\S]*\.addon-pack-card/);
});

test('prompt pack routes stage review, require owner writes, and whitelist served assets', () => {
  assert.match(serverJs, /route === '\/api\/addons\/inspect'/);
  assert.match(serverJs, /readBody\(req, MAX_PROMPT_PACK_BYTES\)/);
  assert.match(serverJs, /promptPackInspections\.set/);
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
