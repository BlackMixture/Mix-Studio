'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  deleteManagedModelCandidate,
  managedModelCleanupCandidates,
} = require('../lib/model-cleanup');
const { MODEL_ASSETS } = require('../lib/dependency-installer');

const assets = {
  h3: [['h3Unet', 'diffusion_models', 'https://example.test/minimax_h3_fl2va_pruned_int8_convrot.safetensors']],
  h3Bf16: [['h3Bf16Unet', 'diffusion_models', 'https://example.test/minimax_h3_fl2va_bf16.safetensors']],
};

test('model cleanup lists only inactive managed files and requires exact typed confirmation', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-model-cleanup-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'diffusion_models');
  await fsp.mkdir(folder, { recursive: true });
  const standard = path.join(folder, 'minimax_h3_fl2va_pruned_int8_convrot.safetensors');
  const bf16 = path.join(folder, 'minimax_h3_fl2va_bf16.safetensors');
  const unrelated = path.join(folder, 'user-model.safetensors');
  await Promise.all([
    fsp.writeFile(standard, 'standard'),
    fsp.writeFile(bf16, 'bf16'),
    fsp.writeFile(unrelated, 'mine'),
  ]);
  const settings = {
    h3FrameModelVariant: 'standard',
    h3Unet: path.basename(standard),
    h3Bf16Unet: path.basename(bf16),
  };
  const candidates = await managedModelCleanupCandidates(root, settings, assets);
  assert.deepEqual(candidates.map((entry) => entry.filename), [path.basename(bf16)]);
  await assert.rejects(
    deleteManagedModelCandidate(root, settings, assets, candidates[0].id, 'wrong'),
    (error) => error.code === 'model_cleanup_confirmation_required',
  );
  assert.equal(fs.existsSync(bf16), true);
  await deleteManagedModelCandidate(root, settings, assets, candidates[0].id, path.basename(bf16));
  assert.equal(fs.existsSync(bf16), false);
  assert.equal(fs.existsSync(standard), true);
  assert.equal(fs.existsSync(unrelated), true);
});

test('model cleanup keeps the selected H3 Turbo adapter and offers the inactive managed version', async (t) => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-h3-turbo-cleanup-'));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const folder = path.join(root, 'loras');
  await fsp.mkdir(folder, { recursive: true });
  const v4 = 'minimax_h3_turbo_v4_step600_ema.safetensors';
  const legacy = 'minimax_h3_turbo_4step_ema_ckpt850.safetensors';
  await Promise.all([
    fsp.writeFile(path.join(folder, v4), 'v4'),
    fsp.writeFile(path.join(folder, legacy), 'legacy'),
  ]);

  const legacySelected = await managedModelCleanupCandidates(root, { h3TurboLora: legacy }, MODEL_ASSETS);
  assert.equal(legacySelected.some((entry) => entry.filename === legacy), false);
  assert.equal(legacySelected.some((entry) => entry.filename === v4), true);

  const v4Selected = await managedModelCleanupCandidates(root, { h3TurboLora: v4 }, MODEL_ASSETS);
  assert.equal(v4Selected.some((entry) => entry.filename === v4), false);
  assert.equal(v4Selected.some((entry) => entry.filename === legacy), true);
});
