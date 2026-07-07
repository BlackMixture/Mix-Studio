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
});
