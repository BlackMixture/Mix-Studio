'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.toString('ascii', 1, 4), 'PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('README feature descriptions are technical, current, and free of em dashes', () => {
  assert.doesNotMatch(readme, /—/);
  assert.doesNotMatch(readme, /flawlessly|killer workflow|why it is awesome|ultimate creative toolkit/i);

  for (const feature of [
    'Flux 2 Klein', 'Qwen Image Edit', 'Krea 2', 'Krea 2 Remix', 'Reference boost',
    'LTX 2.3', 'LTX 2.5', 'Face ID', 'LTX Edit', '10Eros', 'Wan 2.2', 'SCAIL 2',
    'Strength Hunt', 'Generation setup',
  ]) assert.match(readme, new RegExp(feature));
});

test('README remains a concise public landing page and routes operator detail to focused docs', () => {
  assert.ok(readme.trim().split(/\s+/).length < 1600, 'README remains under 1,600 words');
  assert.ok(readme.split(/\r?\n/).length < 200, 'README remains under 200 lines');
  assert.match(readme, /\[Installation and operations\]\(docs\/installation-and-operations\.md\)/);
  assert.match(readme, /\[Technical reference\]\(docs\/technical-reference\.md\)/);
  assert.match(readme, /\[Contributing\]\(CONTRIBUTING\.md\)/);
  assert.doesNotMatch(readme, /pip freeze|release\.json|data\/auth_secret\.txt|MIXBOX_POSTHOG_KEY/);

  const start = readme.indexOf('## Updates');
  const end = readme.indexOf('## Documentation', start);
  const section = readme.slice(start, end);
  assert.ok(section.trim().split(/\s+/).length < 120, 'Updates section stays task-focused');
  assert.match(section, /Update app/);
  assert.match(section, /Updates inbox/);
});

test('README visual app tour keeps headings, compact body copy, and full-width screenshots', () => {
  const start = readme.indexOf('## Inside the app');
  const end = readme.indexOf('## Updates', start);
  const section = readme.slice(start, end);

  for (const workspace of [
    'Create', 'Region', 'Edit', 'Video', 'SCAIL 2 motion transfer', 'Library',
    'Focused result view', 'Upscale comparison', 'Profiles', 'Generation setup',
  ]) {
    assert.match(section, new RegExp(`^### ${workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  }
  assert.doesNotMatch(section, /^\|/m);
  assert.equal((section.match(/^!\[[^\]]+\]\(docs\/download\/mix-studio-[^)]+\)$/gm) || []).length, 10);
  assert.match(section, /LTX 2\.3, Director, Face ID, LTX Edit, 10Eros, Wan 2\.2, and SCAIL 2 controls/);
  assert.match(section, /Krea 2 Identity Edit, and Krea 2 Remix in one workspace/);
  assert.match(section, /Inspect a result, navigate its group, review metadata, and send it into another workflow/);
  assert.ok(fs.statSync(path.join(root, 'docs', 'download', 'mix-studio-lightbox.png')).size < 768 * 1024, 'focused view screenshot stays below 768 KB');
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

test('README demonstrates static @-addressed multi-reference editing', () => {
  assert.match(readme, /type `@` to insert a specific image as a prompt token/);
  assert.match(readme, /`@Image 1` supplies the character/);
  assert.match(readme, /docs\/download\/media\/edit-reference-mentions\.png/);
  assert.doesNotMatch(readme, /edit-reference-mentions\.gif/);
  assert.ok(readme.indexOf('### Multi-reference editing') > readme.indexOf('### Outpainting'));
  const screenshot = path.join(root, 'docs', 'download', 'media', 'edit-reference-mentions.png');
  assert.ok(fs.existsSync(screenshot));
  assert.deepEqual(pngDimensions(screenshot), { width: 1920, height: 1080 });
  assert.ok(fs.statSync(screenshot).size < 768 * 1024, 'reference screenshot stays below 768 KB');
});
