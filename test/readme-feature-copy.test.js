'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

test('README feature descriptions are technical, current, and free of em dashes', () => {
  assert.doesNotMatch(readme, /—/);
  assert.doesNotMatch(readme, /flawlessly|killer workflow|why it is awesome|ultimate creative toolkit/i);

  for (const feature of [
    'Flux 2 Klein', 'Qwen Image Edit', 'Krea 2', 'LTX Director', 'LTX Face ID',
    'LTX Edit', '10Eros DMD', 'Wan 2.2', 'SCAIL 2', 'Strength Hunt',
    'Uploaded assets', 'Generation setup',
  ]) assert.match(readme, new RegExp(feature));
});

test('README workspace showcase uses headings, body copy, and full-width screenshots', () => {
  const start = readme.indexOf('## Inside the app');
  const end = readme.indexOf('## Portable Windows install', start);
  const section = readme.slice(start, end);

  for (const workspace of [
    'Create', 'Region', 'Edit', 'Video', 'SCAIL 2 motion transfer', 'Library',
    'Focused result view', 'Upscale comparison', 'Profiles', 'Generation setup',
  ]) {
    assert.match(section, new RegExp(`^### ${workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(section, /^\|/m);
  assert.equal((section.match(/^!\[[^\]]+\]\(docs\/download\/mix-studio-[^)]+\)$/gm) || []).length, 10);
  assert.match(section, /LTX 2\.3, Director, Face ID, LTX Edit, 10Eros, Wan 2\.2, and SCAIL 2/);
  assert.match(section, /Multiple inputs, masks, outpainting, preserve controls, and sequential edits/);
});

test('README local screenshots and showcase media resolve to checked-in files', () => {
  const localMedia = [...readme.matchAll(/\]\((docs\/download\/[^)]+)\)/g)].map((match) => match[1]);
  assert.ok(localMedia.length >= 10);
  for (const relative of localMedia) {
    assert.ok(fs.existsSync(path.join(root, relative)), `missing README media: ${relative}`);
  }
});

test('README regional prompting uses a lightweight animated bounding-box map', () => {
  assert.match(readme, /docs\/download\/media\/region-island-map\.gif/);
  assert.doesNotMatch(readme, /!\[[^\]]*Two-biome island[^\]]*\]\(docs\/download\/media\/region-island\.png\)/);
  const animation = path.join(root, 'docs', 'download', 'media', 'region-island-map.gif');
  assert.ok(fs.existsSync(animation));
  assert.ok(fs.statSync(animation).size < 1024 * 1024, 'regional GIF stays below 1 MB');
});
