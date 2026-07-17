'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Library exposes an accessible mobile search control', () => {
  assert.match(html, /id="gallerySearch"[^>]*type="search"[^>]*aria-label="Search library"/);
  assert.match(html, /id="gallerySearchClear"[^>]*aria-label="Clear library search"/);
  assert.match(html, /id="gallerySearchStatus"[^>]*aria-live="polite"/);
  assert.match(css, /\.library-search:focus-within/);
});

test('Library search filters useful generation metadata and preserves existing filters', () => {
  assert.match(app, /function librarySearchText\(it\)/);
  assert.match(app, /it\.prompt,[\s\S]*it\.refinedPrompt,[\s\S]*folder && folder\.name,[\s\S]*\.\.\.loras,[\s\S]*\.\.\.regions,[\s\S]*\.\.\.videoText/);
  assert.match(app, /return terms\.every\(\(term\) => text\.includes\(term\)\)/);
  assert.match(app, /state\.activeFolder !== 'all'[\s\S]*state\.mediaFilter === 'videos'[\s\S]*matchesLibrarySearch\(it, state\.libraryQuery, groupNames\)/);
});

test('Library search supports clear, escape, and a contextual empty state', () => {
  assert.match(app, /No matches for “\$\{query\}”/);
  assert.match(app, /event\.key !== 'Escape'/);
  assert.match(app, /gallerySearchClear'\)\.addEventListener\('click'/);
});
