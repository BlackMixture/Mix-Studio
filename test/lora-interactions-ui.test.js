'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

function tagWithId(source, id) {
  return source.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || '';
}

function topLevelFunction(source, name) {
  const start = source.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  if (open < 0) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return '';
}

function cssMediaBlockContaining(source, query, needle) {
  let cursor = 0;
  while ((cursor = source.indexOf(query, cursor)) >= 0) {
    const open = source.indexOf('{', cursor);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      else if (source[index] === '}') {
        depth -= 1;
        if (depth === 0) {
          const block = source.slice(cursor, index + 1);
          if (block.includes(needle)) return block;
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return '';
}

test('LoRA search is isolated from profile credential fields', () => {
  const profileForm = tagWithId(html, 'profileEditForm');
  const searchForm = tagWithId(html, 'loraSearchForm');
  const profileName = tagWithId(html, 'peName');
  const profilePin = tagWithId(html, 'pePin');
  const search = tagWithId(html, 'loraSearch');

  assert.match(profileForm, /^<form\b/);
  assert.match(profileForm, /autocomplete="off"/);
  assert.match(searchForm, /^<form\b/);
  assert.match(searchForm, /role="search"/);
  assert.match(searchForm, /data-form-type="other"/);
  assert.match(profileName, /autocomplete="name"/);
  assert.match(profilePin, /type="password"/);
  assert.match(profilePin, /autocomplete="new-password"/);
  assert.match(search, /type="search"/);
  assert.match(search, /name="lora-filter"/);
  assert.match(search, /autocomplete="one-time-code"/);
  assert.match(search, /data-1p-ignore/);
  assert.match(search, /data-lpignore="true"/);
  assert.match(search, /spellcheck="false"/);
  assert.match(search, /autocapitalize="none"/);
  assert.match(app, /\$\('#loraSearchForm'\)\.addEventListener\('submit', \(event\) => event\.preventDefault\(\)\)/);
});

test('closing a shared password dialog clears its credential-shaped state', () => {
  const closeDialog = topLevelFunction(app, 'closeAppDialog');
  assert.match(closeDialog, /appDialogInput/);
  assert.match(closeDialog, /\.value\s*=\s*''/);
  assert.match(closeDialog, /\.type\s*=\s*'text'/);
  assert.match(closeDialog, /\.autocomplete\s*=\s*'off'/);
});

test('desktop gallery images can become LoRA thumbnails through the shared crop pipeline', () => {
  const crop = topLevelFunction(app, 'cropLoraThumbnail');
  const upload = topLevelFunction(app, 'uploadLoraThumbnail');
  const fromGallery = topLevelFunction(app, 'setLoraThumbFromGallery');
  const filePicker = topLevelFunction(app, 'setLoraThumb');

  assert.match(app, /card\.dataset\.loraName\s*=\s*l\.name/);
  assert.match(app, /DESKTOP_GALLERY_DROP_SELECTOR[\s\S]{0,700}\.lora-card\[data-lora-name\]/);
  assert.match(app, /target\.matches\('\.lora-card\[data-lora-name\]'\)[\s\S]{0,300}drag\.video/);
  assert.match(app, /target\.matches\('\.lora-card\[data-lora-name\]'\)[\s\S]{0,420}setLoraThumbFromGallery\(target\.dataset\.loraName, item\)/);

  assert.match(crop, /const size = 256/);
  assert.match(crop, /Math\.max\(size \/ img\.naturalWidth, size \/ img\.naturalHeight\)/);
  assert.match(crop, /drawImage\([\s\S]*img,[\s\S]*img\.naturalWidth \* (?:scale|s),[\s\S]*img\.naturalHeight \* (?:scale|s)/);
  assert.match(crop, /toBlob\([\s\S]*'image\/jpeg',[\s\S]*0\.85/);
  assert.match(crop, /URL\.revokeObjectURL\(url\)/);

  assert.match(upload, /api\('\/api\/lorathumb'/);
  assert.match(upload, /method: 'POST'/);
  assert.match(upload, /'x-lora-name': encodeURIComponent\(name\)/);
  assert.match(upload, /body: blob/);
  assert.match(upload, /state\.loraThumbs = (?:result|r)\.loraThumbs \|\| \{\}/);
  assert.match(upload, /renderLoras\(\)/);

  assert.match(filePicker, /cropLoraThumbnail\(file\)/);
  assert.match(filePicker, /uploadLoraThumbnail\(name,/);
  assert.match(fromGallery, /fetch\((?:`\/images\/\$\{encodeURIComponent\(item\.file\)\}`|'\/images\/' \+ encodeURIComponent\(item\.file\))\)/);
  assert.match(fromGallery, /if \(!response\.ok\)/);
  assert.match(fromGallery, /response\.blob\(\)/);
  assert.match(fromGallery, /cropLoraThumbnail/);
  assert.match(fromGallery, /uploadLoraThumbnail\(name,/);
});

test('LoRA thumbnail drop affordance is desktop-only', () => {
  const desktop = cssMediaBlockContaining(css, '@media (min-width: 1180px)', '.desktop-gallery-drag-ghost');
  assert.ok(desktop, 'desktop workspace media block should exist');
  assert.match(desktop, /\.lora-card(?:\[data-lora-name\])?\.gallery-drop-ready/);
  assert.match(desktop, /\.lora-card(?:\[data-lora-name\])?\.gallery-drop-active/);
  assert.match(app, /target\.matches\('\.lora-card\[data-lora-name\]'\)[\s\S]{0,180}return `Set \$\{prettyLora\(target\.dataset\.loraName\)\} thumbnail`/);
});
