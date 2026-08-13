'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

const {
  MAX_PROMPT_PACK_ASSET_BYTES,
  MAX_PROMPT_PACK_BYTES,
  MAX_PROMPT_PACK_PRESETS,
  MAX_PROMPT_PACK_THUMBNAIL_BYTES,
  MAX_PROMPT_PACK_VIDEO_THUMBNAIL_BYTES,
  PROMPT_PACK_FORMAT,
  comparePackVersions,
  inspectPromptPackBuffer,
  installPromptPack,
  listInstalledPromptPacks,
  publicPromptPack,
  readInstalledPromptPack,
  removePromptPack,
  setPromptPackEnabled,
} = require('../lib/prompt-packs');

const thumbnail = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'camera-presets', 'cinematic-arri.jpg'));

function mp4Box(type, payload) {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length + 8, 0);
  header.write(type, 4, 4, 'ascii');
  return Buffer.concat([header, payload]);
}

function animatedThumbnail() {
  const ftyp = mp4Box('ftyp', Buffer.from([
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
  ]));
  const mvhd = Buffer.alloc(100);
  mvhd.writeUInt32BE(1000, 12);
  mvhd.writeUInt32BE(4000, 16);
  const tkhd = Buffer.alloc(84);
  tkhd.writeUInt32BE(640 * 65536, 76);
  tkhd.writeUInt32BE(360 * 65536, 80);
  const moov = mp4Box('moov', Buffer.concat([
    mp4Box('mvhd', mvhd),
    mp4Box('trak', mp4Box('tkhd', tkhd)),
  ]));
  return Buffer.concat([ftyp, moov]);
}

function pack(overrides = {}) {
  return Object.assign({
    format: PROMPT_PACK_FORMAT,
    formatVersion: 1,
    type: 'prompt-presets',
    id: 'black-mixture-styles',
    name: 'Black Mixture Styles',
    version: '1.0.0',
    author: 'Black Mixture',
    description: 'A compact style collection.',
    categories: [{
      id: 'style',
      label: 'Style',
      description: 'Choose one visual treatment.',
      accent: 'violet',
      selectionMode: 'single',
      presets: [{
        id: 'neo-noir',
        label: 'Neo Noir',
        note: 'hard light',
        promptText: 'neo-noir visual style, hard pools of light, deep shadow',
        thumbnail: { mime: 'image/jpeg', data: thumbnail.toString('base64') },
      }],
    }],
  }, overrides);
}

function encoded(source = pack()) {
  return Buffer.from(JSON.stringify(source));
}

test('prompt packs validate a bounded declarative style pack and generate safe asset names', () => {
  const inspected = inspectPromptPackBuffer(encoded());
  assert.equal(inspected.manifest.id, 'black-mixture-styles');
  assert.equal(inspected.manifest.categories[0].presets[0].thumbnailFile, 'style-neo-noir.jpg');
  assert.equal(inspected.assets[0].width, 640);
  assert.equal(inspected.assets[0].height, 640);
  assert.equal(inspected.presetCount, 1);
  assert.match(inspected.manifest.fingerprint, /^[a-f0-9]{64}$/);
});

test('prompt pack limits support 200-preset atlases and their larger thumbnail budget', () => {
  assert.equal(MAX_PROMPT_PACK_PRESETS, 200);
  assert.equal(MAX_PROMPT_PACK_BYTES, 64 * 1024 * 1024);
  assert.equal(MAX_PROMPT_PACK_ASSET_BYTES, 48 * 1024 * 1024);
  assert.equal(MAX_PROMPT_PACK_THUMBNAIL_BYTES, 1024 * 1024);
  assert.equal(MAX_PROMPT_PACK_VIDEO_THUMBNAIL_BYTES, 6 * 1024 * 1024);

  const maximum = pack();
  maximum.categories[0].presets = Array.from({ length: MAX_PROMPT_PACK_PRESETS }, (_, index) => ({
    id: `style-${index}`,
    label: `Style ${index}`,
    promptText: `style ${index}`,
    thumbnail: { mime: 'image/jpeg', data: thumbnail.toString('base64') },
  }));
  const inspected = inspectPromptPackBuffer(encoded(maximum));
  assert.equal(inspected.presetCount, 200);
  assert.ok(inspected.assetBytes > 24 * 1024 * 1024);
  assert.ok(inspected.bytes > 32 * 1024 * 1024);
});

test('prompt packs reject code-oriented types, unsafe IDs, unsupported images, and excess presets', () => {
  assert.throws(
    () => inspectPromptPackBuffer(encoded(pack({ type: 'javascript' }))),
    /Only prompt-presets add-ons/
  );
  assert.throws(
    () => inspectPromptPackBuffer(encoded(pack({ id: '../escape' }))),
    /Pack ID must use lowercase/
  );
  const svg = pack();
  svg.categories[0].presets[0].thumbnail = {
    mime: 'image/svg+xml',
    data: Buffer.from('<svg><script>alert(1)</script></svg>').toString('base64'),
  };
  assert.throws(() => inspectPromptPackBuffer(encoded(svg)), /JPEG, PNG, WebP, or MP4/);
  const oversized = pack();
  oversized.categories[0].presets = Array.from({ length: 201 }, (_, index) => ({
    id: `style-${index}`,
    label: `Style ${index}`,
    promptText: `style ${index}`,
    thumbnail: { mime: 'image/jpeg', data: thumbnail.toString('base64') },
  }));
  assert.throws(() => inspectPromptPackBuffer(encoded(oversized)), /200-preset limit/);
});

test('prompt packs accept bounded MP4 previews and retain H3-only discovery metadata', () => {
  const source = pack({
    contexts: ['video.h3'],
    credits: 'Original prompts inspired by a CC BY prompt taxonomy.',
    sourceUrl: 'https://github.com/AtlasCloudAI/awesome-minimax-h3-prompts',
  });
  source.categories[0].presets[0].thumbnail = {
    mime: 'video/mp4',
    data: animatedThumbnail().toString('base64'),
  };
  const inspected = inspectPromptPackBuffer(encoded(source));
  assert.deepEqual(inspected.manifest.contexts, ['video.h3']);
  assert.match(inspected.manifest.sourceUrl, /^https:\/\/github\.com\/AtlasCloudAI\//);
  assert.equal(inspected.manifest.categories[0].presets[0].thumbnailFile, 'style-neo-noir.mp4');
  assert.equal(inspected.assets[0].width, 640);
  assert.equal(inspected.assets[0].height, 360);
  assert.equal(inspected.assets[0].duration, 4);
});

test('prompt pack semantic versions compare updates and downgrades', () => {
  assert.equal(comparePackVersions('1.0.1', '1.0.0'), 1);
  assert.equal(comparePackVersions('2.0.0', '10.0.0'), -1);
  assert.equal(comparePackVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1);
  assert.equal(comparePackVersions('1.0.0', '1.0.0-beta.1'), 1);
});

test('newer prompt packs update atomically, preserve enabled state, and do not retain the old version', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-packs-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const first = inspectPromptPackBuffer(encoded());
  const installed = await installPromptPack(root, first, { now: 100 });
  assert.equal(installed.version, '1.0.0');
  assert.equal((await listInstalledPromptPacks(root)).length, 1);
  await setPromptPackEnabled(root, installed.id, false);

  const updateSource = pack({ version: '1.1.0' });
  const updated = await installPromptPack(root, inspectPromptPackBuffer(encoded(updateSource)), { now: 200 });
  assert.equal(updated.enabled, false);
  assert.equal(updated.installedAt, 100);
  assert.equal(updated.updatedAt, 200);
  assert.deepEqual(
    (await fsp.readdir(root)).filter((entry) => entry.startsWith('.update-backup-')),
    [],
  );
  const publicPack = publicPromptPack(updated, '/api/addons');
  assert.match(publicPack.categories[0].presets[0].thumbnail, /^\/api\/addons\/black-mixture-styles\/assets\/style-neo-noir\.jpg\?v=[a-f0-9]+$/);
});

test('same-version replacement needs confirmation while newer versions upgrade automatically', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-packs-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  await installPromptPack(root, inspectPromptPackBuffer(encoded(pack({ version: '2.0.0' }))));
  const upgraded = await installPromptPack(root, inspectPromptPackBuffer(encoded(pack({ version: '2.1.0' }))));
  assert.equal(upgraded.version, '2.1.0');
  await assert.rejects(
    installPromptPack(root, inspectPromptPackBuffer(encoded(pack({ version: '2.1.0' })))),
    (error) => error.code === 'prompt_pack_exists'
  );
  await assert.rejects(
    installPromptPack(root, inspectPromptPackBuffer(encoded(pack({ version: '1.0.0' }))), { replace: true }),
    (error) => error.code === 'prompt_pack_downgrade'
  );
});

test('removing a prompt pack permanently deletes its directory', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-packs-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const inspected = inspectPromptPackBuffer(encoded());
  await installPromptPack(root, inspected);
  const removed = await removePromptPack(root, inspected.manifest.id);
  assert.equal(removed.pack.id, inspected.manifest.id);
  assert.equal(removed.deleted, true);
  assert.equal(await readInstalledPromptPack(root, inspected.manifest.id), null);
  assert.equal(fs.existsSync(path.join(root, inspected.manifest.id)), false);
});
