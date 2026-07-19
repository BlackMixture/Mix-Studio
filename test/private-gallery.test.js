'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_PRIVATE_PASSWORD,
  galleryPassword,
  galleryView,
  setFolderLocked,
  canMoveToFolder,
  parseCookies,
} = require('../lib/private-gallery');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function sampleDb() {
  return {
    folders: [
      { id: 'public', name: 'Public' },
      { id: 'private', name: 'Private', locked: true },
    ],
    items: [
      { id: 'a', folder: null, prompt: 'loose' },
      { id: 'b', folder: 'public', prompt: 'shown' },
      { id: 'c', folder: 'private', prompt: 'hidden' },
      { id: 'd', folder: 'missing', prompt: 'orphan stays visible' },
    ],
  };
}

test('galleryPassword defaults to 1234', () => {
  assert.equal(DEFAULT_PRIVATE_PASSWORD, '1234');
  assert.equal(galleryPassword({}), '1234');
  assert.equal(galleryPassword({ galleryPassword: '  secret  ' }), 'secret');
});

test('galleryView lists locked folders but hides their items while locked', () => {
  const view = galleryView(sampleDb(), false);
  assert.deepEqual(view.folders.map((f) => f.id), ['public', 'private']);
  assert.equal(view.folders.find((f) => f.id === 'private').locked, true);
  assert.deepEqual(view.items.map((it) => it.id), ['a', 'b', 'd']);
});

test('galleryView includes locked folders and items while unlocked', () => {
  const view = galleryView(sampleDb(), true);
  assert.deepEqual(view.folders.map((f) => f.id), ['public', 'private']);
  assert.deepEqual(view.items.map((it) => it.id), ['a', 'b', 'c', 'd']);
  assert.equal(view.folders.find((f) => f.id === 'private').locked, true);
});

test('setFolderLocked updates an existing folder', () => {
  const db = sampleDb();
  const folder = setFolderLocked(db, 'public', true);
  assert.equal(folder.locked, true);
  assert.equal(db.folders.find((f) => f.id === 'public').locked, true);
});

test('canMoveToFolder allows dropping into locked folders while locked', () => {
  const result = canMoveToFolder(sampleDb(), 'private', false);
  assert.equal(result.ok, true);
});

test('canMoveToFolder still rejects missing folders', () => {
  const result = canMoveToFolder(sampleDb(), 'nope', true);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing');
});

test('parseCookies reads cookie pairs safely', () => {
  assert.deepEqual(parseCookies('ks_private=abc; theme=dark'), { ks_private: 'abc', theme: 'dark' });
  assert.deepEqual(parseCookies(''), {});
  // Cookies ignore ports: other localhost apps (ComfyUI, AI-Toolkit, …) can
  // plant malformed percent-sequences that must not break the whole request.
  assert.deepEqual(
    parseCookies('junk=100%; ks_private=abc'),
    { junk: '100%', ks_private: 'abc' }
  );
});

test('locked folders use app sheets instead of native password and action prompts', () => {
  assert.match(html, /id="privateUnlockSheet"/);
  assert.match(html, /id="privatePasswordInput"[^>]*type="password"/);
  assert.match(html, /id="folderActionsSheet"/);
  assert.match(html, /id="folderLockAction"/);
  assert.match(app, /function openPrivateUnlockSheet\(/);
  assert.match(app, /function closeFolderActionsSheet\(\)/);
  assert.doesNotMatch(app, /window\.prompt\('Gallery password'/);
  assert.doesNotMatch(app, /type lock, unlock, merge, or delete/);
});

test('custom folders expose device-aware locking help', () => {
  const helper = app.slice(
    app.indexOf('function folderActionHelpText()'),
    app.indexOf('function closeFolderPicker()'),
  );
  assert.match(helper, /\(hover: none\), \(pointer: coarse\)/);
  assert.match(helper, /Press and hold a custom folder for actions, including Lock folder/);
  assert.match(helper, /Right-click a custom folder for actions, including Lock folder/);

  const renderer = app.slice(app.indexOf('function renderFolders()'), app.indexOf('function closeFolderPicker()'));
  assert.match(renderer, /picker\.title = `Choose a folder\. \$\{actionHelp\}`/);
  assert.match(renderer, /picker\.setAttribute\('aria-description', actionHelp\)/);
  assert.match(renderer, /btn\.title = actionHelp/);
  assert.match(renderer, /btn\.setAttribute\('aria-description', actionHelp\)/);
});

test('new folders finish refreshing before they can be locked', () => {
  const handler = app.match(/\$\('#folderAddBtn'\)\?\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n\}\);/)?.[1] || '';
  assert.match(handler, /const folder = await api\('\/api\/folders'/);
  assert.match(handler, /await refreshGallery\(\)/);
  assert.match(handler, /Folder “\$\{folder\.name\}” created/);
});

test('folder privacy toggle keeps its target stable and ignores duplicate clicks', () => {
  assert.match(app, /async function unlockPrivateGallery\(\{ refresh = true, announce = true \} = \{\}\)/);
  const handler = app.match(/\$\('#folderLockAction'\)\.addEventListener\('click', async \(\) => \{([\s\S]*?)\n\}\);/)?.[1] || '';
  assert.match(handler, /const folderId = state\.folderActionTarget\?\.id/);
  assert.match(handler, /actionButton\.disabled/);
  assert.match(handler, /unlockPrivateGallery\(\{ refresh: false, announce: false \}\)/);
  assert.match(handler, /state\.folders\.find\(\(candidate\) => candidate\.id === folderId\)/);
  assert.match(handler, /const updatedFolder = await api/);
  assert.match(handler, /updatedFolder\.locked \? 'Folder locked' : 'Folder unlocked'/);
});
