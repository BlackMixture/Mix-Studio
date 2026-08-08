'use strict';

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { sam3InstallStatus } = require('./sam3-installer');

const DYNTIME_PATCH_REVISION = 'b660b69c97cb0b5661a54cb50066ad11eacc6099';
const DYNTIME_PATCH_SHA256 = 'e5e272e435a75ed682bc1122da2e2ad4de254b054bc750e55f8190aac9527fa0';
const DYNTIME_PATCH_URL = `https://huggingface.co/DmitryDB/MiniMax-H3-DynTime-sQKV/resolve/${DYNTIME_PATCH_REVISION}/patches/ComfyUI-MiniMax-H3-DT-sQKV.patch`;
const DYNTIME_PATCH_FILES = Object.freeze([
  'comfy/ldm/minimax/model.py',
  'comfy/model_detection.py',
  'comfy/model_patcher.py',
]);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      timeout: options.timeout || 2 * 60 * 1000,
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) return resolve([stdout, stderr].filter(Boolean).join('\n').trim());
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      const wrapped = new Error((output || error.message || 'DynTime patch command failed').slice(-2400));
      wrapped.code = 'h3_dyntime_patch_incompatible';
      reject(wrapped);
    });
  });
}

function patchMarkersReady(contents) {
  return contents[0]?.includes('adaln_curve_basis_dim')
    && contents[0]?.includes('self.separate_qkv = separate_qkv')
    && contents[1]?.includes('MiniMax H3 checkpoint has neither fused nor separate Q/K/V projections')
    && contents[2]?.includes('getattr(op, op_keys[1], None)');
}

async function latestBackup(runtime, sourcePath) {
  const root = path.resolve(path.join(runtime.dataDir, 'patch-backups', 'minimax-h3-dyntime'));
  let names;
  try { names = await fsp.readdir(root); } catch { return null; }
  for (const name of names.sort().reverse()) {
    const backupDir = path.join(root, name);
    try {
      const manifest = JSON.parse(await fsp.readFile(path.join(backupDir, 'manifest.json'), 'utf8'));
      if (path.resolve(String(manifest.sourcePath || '')) !== path.resolve(sourcePath)) continue;
      if (!Array.isArray(manifest.files) || manifest.files.length !== DYNTIME_PATCH_FILES.length) continue;
      if (!DYNTIME_PATCH_FILES.every((relative) => manifest.files.some((entry) => entry.relative === relative))) continue;
      return { backupDir, manifest };
    } catch { /* Ignore incomplete or malformed backup folders. */ }
  }
  return null;
}

async function dynTimePatchStatus(runtime, options = {}) {
  const install = options.installStatus || sam3InstallStatus(runtime, options);
  const sourcePath = String(install.sourcePath || '').trim();
  if (!sourcePath) {
    return { ready: false, canInstall: false, sourcePath: '', reason: 'Mix Studio could not find the active ComfyUI source checkout.' };
  }
  const files = DYNTIME_PATCH_FILES.map((relative) => path.join(sourcePath, ...relative.split('/')));
  try {
    const contents = await Promise.all(files.map((file) => fsp.readFile(file, 'utf8')));
    const ready = patchMarkersReady(contents);
    const backup = ready ? await latestBackup(runtime, sourcePath) : null;
    return {
      ready,
      canInstall: !ready,
      restoreAvailable: !!backup,
      sourcePath,
      files: DYNTIME_PATCH_FILES,
      revision: DYNTIME_PATCH_REVISION,
      reason: ready ? '' : 'The reviewed DynTime compatibility patch has not been applied to this ComfyUI checkout.',
    };
  } catch (error) {
    return {
      ready: false,
      canInstall: false,
      sourcePath,
      files: DYNTIME_PATCH_FILES,
      revision: DYNTIME_PATCH_REVISION,
      reason: `The connected ComfyUI core does not contain every patch target: ${String(error.message || error)}`,
    };
  }
}

async function restoreDynTimePatch(runtime, options = {}) {
  const status = await dynTimePatchStatus(runtime, options);
  if (!status.ready) {
    const error = new Error('The DynTime compatibility patch is not currently active.');
    error.code = 'h3_dyntime_patch_not_active';
    throw error;
  }
  const backup = await latestBackup(runtime, status.sourcePath);
  if (!backup) {
    const error = new Error('No verified Mix Studio backup is available for this ComfyUI checkout. Nothing was changed.');
    error.code = 'h3_dyntime_backup_missing';
    throw error;
  }
  const records = [];
  for (const relative of DYNTIME_PATCH_FILES) {
    const manifestEntry = backup.manifest.files.find((entry) => entry.relative === relative);
    const current = path.resolve(status.sourcePath, ...relative.split('/'));
    const saved = path.resolve(backup.backupDir, ...relative.split('/'));
    if (!current.startsWith(`${path.resolve(status.sourcePath)}${path.sep}`)
      || !saved.startsWith(`${path.resolve(backup.backupDir)}${path.sep}`)) {
      throw new Error('Invalid DynTime restore path.');
    }
    const currentContent = await fsp.readFile(current);
    const savedContent = await fsp.readFile(saved);
    if (sha256(currentContent) !== manifestEntry.afterSha256 || sha256(savedContent) !== manifestEntry.beforeSha256) {
      const error = new Error('ComfyUI changed after the DynTime patch was installed, so Mix Studio will not overwrite it with an older backup. Update or restore ComfyUI through its normal tools.');
      error.code = 'h3_dyntime_restore_conflict';
      throw error;
    }
    records.push({ current, saved, currentContent, savedContent });
  }
  const changed = [];
  try {
    for (const record of records) {
      const temporary = `${record.current}.mix-studio-restore.tmp`;
      await fsp.writeFile(temporary, record.savedContent);
      await fsp.rename(temporary, record.current);
      changed.push(record);
    }
  } catch (error) {
    for (const record of changed.reverse()) {
      const temporary = `${record.current}.mix-studio-rollback.tmp`;
      await fsp.writeFile(temporary, record.currentContent).catch(() => {});
      await fsp.rename(temporary, record.current).catch(() => {});
    }
    throw error;
  }
  const restored = await dynTimePatchStatus(runtime, options);
  if (restored.ready) {
    const error = new Error('The ComfyUI backup did not remove the DynTime compatibility patch.');
    error.code = 'h3_dyntime_restore_failed';
    throw error;
  }
  return { restored: true, sourcePath: status.sourcePath, backupDir: backup.backupDir };
}

async function downloadPinnedPatch(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('This Node runtime cannot download the DynTime patch.');
  const response = await fetchImpl(DYNTIME_PATCH_URL, { signal: options.signal });
  if (!response.ok) {
    const error = new Error(`Could not download the reviewed DynTime patch (${response.status}).`);
    error.code = 'h3_dyntime_patch_download_failed';
    throw error;
  }
  const patch = Buffer.from(await response.arrayBuffer());
  if (sha256(patch) !== DYNTIME_PATCH_SHA256) {
    const error = new Error('The downloaded DynTime patch did not match Mix Studio’s pinned checksum. Nothing was changed.');
    error.code = 'h3_dyntime_patch_checksum_mismatch';
    throw error;
  }
  return patch;
}

async function applyDynTimePatch(runtime, options = {}) {
  const before = await dynTimePatchStatus(runtime, options);
  if (before.ready) return Object.assign({}, before, { changed: false, backupDir: '' });
  if (!before.canInstall) {
    const error = new Error(before.reason || 'The DynTime patch cannot be installed into this ComfyUI checkout.');
    error.code = 'h3_dyntime_patch_unavailable';
    throw error;
  }
  if (options.signal?.aborted) {
    const error = new Error('DynTime setup was cancelled.');
    error.code = 'dependency_cancelled';
    throw error;
  }

  const patch = await downloadPinnedPatch(options);
  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mix-studio-h3-dyntime-'));
  const patchFile = path.join(tempDir, 'ComfyUI-MiniMax-H3-DT-sQKV.patch');
  const sourcePath = path.resolve(before.sourcePath);
  const gitExecutable = String(options.gitExecutable || runtime?.update?.gitExecutable || process.env.MIX_STUDIO_GIT || 'git').trim() || 'git';
  const backupRoot = path.resolve(options.backupDir || path.join(runtime.dataDir, 'patch-backups', 'minimax-h3-dyntime'));
  const backupDir = path.join(backupRoot, new Date().toISOString().replace(/[:.]/g, '-'));
  const backups = [];
  let applied = false;
  try {
    await fsp.writeFile(patchFile, patch);
    await run(gitExecutable, ['-C', sourcePath, 'apply', '--check', patchFile], { cwd: sourcePath });
    await fsp.mkdir(backupDir, { recursive: true });
    for (const relative of DYNTIME_PATCH_FILES) {
      const source = path.resolve(sourcePath, ...relative.split('/'));
      const expectedPrefix = `${sourcePath}${path.sep}`;
      if (!source.startsWith(expectedPrefix)) throw new Error('Invalid DynTime patch target.');
      const destination = path.join(backupDir, ...relative.split('/'));
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      const content = await fsp.readFile(source);
      await fsp.writeFile(destination, content, { flag: 'wx' });
      backups.push({ relative, source, destination, beforeSha256: sha256(content) });
    }
    await run(gitExecutable, ['-C', sourcePath, 'apply', patchFile], { cwd: sourcePath });
    applied = true;
    const after = await dynTimePatchStatus(runtime, options);
    if (!after.ready) throw new Error('ComfyUI did not pass the DynTime post-install verification.');
    for (const entry of backups) entry.afterSha256 = sha256(await fsp.readFile(entry.source));
    await fsp.writeFile(path.join(backupDir, 'manifest.json'), JSON.stringify({
      createdAt: new Date().toISOString(),
      sourcePath,
      patchRevision: DYNTIME_PATCH_REVISION,
      patchSha256: DYNTIME_PATCH_SHA256,
      files: backups.map(({ relative, beforeSha256, afterSha256 }) => ({ relative, beforeSha256, afterSha256 })),
    }, null, 2));
    return Object.assign({}, after, { changed: true, backupDir });
  } catch (error) {
    if (applied && backups.length === DYNTIME_PATCH_FILES.length) {
      await Promise.all(backups.map((entry) => fsp.copyFile(entry.destination, entry.source))).catch(() => {});
    }
    if (!error.code) error.code = 'h3_dyntime_patch_failed';
    throw error;
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  DYNTIME_PATCH_FILES,
  DYNTIME_PATCH_REVISION,
  DYNTIME_PATCH_SHA256,
  DYNTIME_PATCH_URL,
  applyDynTimePatch,
  downloadPinnedPatch,
  dynTimePatchStatus,
  patchMarkersReady,
  sha256,
  restoreDynTimePatch,
};
