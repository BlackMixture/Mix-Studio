'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {
  emptyTrashDirectory,
  moveAssetRefsToTrash,
  safeAssetPath,
  trashDirectorySummary,
  unreferencedAssetRefs,
} = require('../lib/deleted-media');

test('unreferencedAssetRefs preserves files still used by another gallery item', () => {
  const deleted = [{
    file: 'delete.png',
    sourceFile: 'shared.png',
    videos: [{ file: 'delete.mp4' }],
  }];
  const remaining = [{ file: 'shared.png', videos: [{ file: 'keep.mp4' }] }];
  assert.deepEqual(unreferencedAssetRefs(deleted, remaining), [
    { kind: 'image', file: 'delete.png' },
    { kind: 'video', file: 'delete.mp4' },
  ]);
});

test('moveAssetRefsToTrash removes originals and keeps recoverable image and video files', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-trash-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const imageRoot = path.join(root, 'images');
  const videoRoot = path.join(root, 'videos');
  const trashRoot = path.join(root, 'trash', 'items', 'item-1');
  await Promise.all([fsp.mkdir(imageRoot), fsp.mkdir(videoRoot)]);
  await Promise.all([
    fsp.writeFile(path.join(imageRoot, 'result.png'), 'image bytes'),
    fsp.writeFile(path.join(videoRoot, 'result.mp4'), 'video bytes'),
  ]);

  const moved = await moveAssetRefsToTrash([
    { kind: 'image', file: 'result.png' },
    { kind: 'video', file: 'result.mp4' },
  ], { imageRoot, videoRoot, trashRoot });

  assert.deepEqual(moved, [
    { kind: 'image', file: 'result.png' },
    { kind: 'video', file: 'result.mp4' },
  ]);
  await assert.rejects(fsp.access(path.join(imageRoot, 'result.png')));
  await assert.rejects(fsp.access(path.join(videoRoot, 'result.mp4')));
  assert.equal(await fsp.readFile(path.join(trashRoot, 'images', 'result.png'), 'utf8'), 'image bytes');
  assert.equal(await fsp.readFile(path.join(trashRoot, 'videos', 'result.mp4'), 'utf8'), 'video bytes');
});

test('moveAssetRefsToTrash rolls back earlier moves when a later move fails', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-trash-rollback-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const imageRoot = path.join(root, 'images');
  const videoRoot = path.join(root, 'videos');
  const trashRoot = path.join(root, 'trash', 'items', 'item-2');
  await Promise.all([fsp.mkdir(imageRoot), fsp.mkdir(videoRoot)]);
  await fsp.writeFile(path.join(imageRoot, 'result.png'), 'image bytes');
  await fsp.mkdir(path.join(videoRoot, 'not-a-file.mp4'));

  await assert.rejects(moveAssetRefsToTrash([
    { kind: 'image', file: 'result.png' },
    { kind: 'video', file: 'not-a-file.mp4' },
  ], { imageRoot, videoRoot, trashRoot }), /not a regular file/);

  assert.equal(await fsp.readFile(path.join(imageRoot, 'result.png'), 'utf8'), 'image bytes');
  await assert.rejects(fsp.access(path.join(trashRoot, 'images', 'result.png')));
});

test('safeAssetPath rejects traversal and nested asset names', () => {
  const root = path.resolve('gallery-images');
  assert.throws(() => safeAssetPath(root, '../outside.png'), /Unsafe gallery asset name/);
  assert.throws(() => safeAssetPath(root, 'nested/file.png'), /Unsafe gallery asset name/);
  assert.throws(() => safeAssetPath(root, 'nested\\file.png'), /Unsafe gallery asset name/);
});

test('emptyTrashDirectory reports and permanently removes recoverable files', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-empty-trash-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const trashRoot = path.join(root, 'trash');
  await fsp.mkdir(path.join(trashRoot, 'profiles', 'owner', 'items'), { recursive: true });
  await Promise.all([
    fsp.writeFile(path.join(trashRoot, 'one.png'), '1234'),
    fsp.writeFile(path.join(trashRoot, 'profiles', 'owner', 'items', 'two.mp4'), '123456'),
  ]);

  assert.deepEqual(await trashDirectorySummary(trashRoot), { files: 2, bytes: 10 });
  assert.deepEqual(await emptyTrashDirectory(trashRoot), { files: 2, bytes: 10 });
  assert.deepEqual(await fsp.readdir(trashRoot), []);
});

test('emptyTrashDirectory refuses any root not explicitly named trash', async () => {
  await assert.rejects(emptyTrashDirectory(path.resolve('data')), /not named trash/);
});
