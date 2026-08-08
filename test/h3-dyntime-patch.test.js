'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  DYNTIME_PATCH_FILES,
  DYNTIME_PATCH_REVISION,
  DYNTIME_PATCH_SHA256,
  patchMarkersReady,
  restoreDynTimePatch,
  sha256,
} = require('../lib/h3-dyntime-patch');

test('DynTime patch is pinned and requires markers in all three ComfyUI core files', () => {
  assert.match(DYNTIME_PATCH_REVISION, /^[a-f0-9]{40}$/);
  assert.match(DYNTIME_PATCH_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(patchMarkersReady([
    'adaln_curve_basis_dim\nself.separate_qkv = separate_qkv',
    'MiniMax H3 checkpoint has neither fused nor separate Q/K/V projections',
    'getattr(op, op_keys[1], None)',
  ]), true);
  assert.equal(patchMarkersReady([
    'adaln_curve_basis_dim',
    'MiniMax H3 checkpoint has neither fused nor separate Q/K/V projections',
    'getattr(op, op_keys[1], None)',
  ]), false);
});

test('DynTime restore accepts only the matching verified post-patch files', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-dyntime-restore-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'ComfyUI');
  const backupDir = path.join(root, 'data', 'patch-backups', 'minimax-h3-dyntime', '2026-08-08');
  const original = ['original model', 'original detection', 'original patcher'];
  const patched = [
    'adaln_curve_basis_dim\nself.separate_qkv = separate_qkv',
    'MiniMax H3 checkpoint has neither fused nor separate Q/K/V projections',
    'getattr(op, op_keys[1], None)',
  ];
  const files = [];
  for (let index = 0; index < DYNTIME_PATCH_FILES.length; index += 1) {
    const relative = DYNTIME_PATCH_FILES[index];
    const current = path.join(sourcePath, ...relative.split('/'));
    const saved = path.join(backupDir, ...relative.split('/'));
    await fsp.mkdir(path.dirname(current), { recursive: true });
    await fsp.mkdir(path.dirname(saved), { recursive: true });
    await fsp.writeFile(current, patched[index]);
    await fsp.writeFile(saved, original[index]);
    files.push({ relative, beforeSha256: sha256(original[index]), afterSha256: sha256(patched[index]) });
  }
  await fsp.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify({ sourcePath, files }));
  const runtime = { dataDir: path.join(root, 'data') };
  const result = await restoreDynTimePatch(runtime, { installStatus: { sourcePath } });
  assert.equal(result.restored, true);
  for (let index = 0; index < DYNTIME_PATCH_FILES.length; index += 1) {
    assert.equal(await fsp.readFile(path.join(sourcePath, ...DYNTIME_PATCH_FILES[index].split('/')), 'utf8'), original[index]);
  }
});
