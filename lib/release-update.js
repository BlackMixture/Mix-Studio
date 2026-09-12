'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { gitCommand, readAppRelease, migrateLegacyOrigin, isOfficialOrigin, parseDirtyStatus } = require('./app-update');
const { inspectCriticalPublicAssets } = require('./app-assets');
const { parseSemver, compareSemver } = require('./github-releases');
const exec = promisify(execFile);

function blocked(code, message, details = {}) {
  return Object.assign(new Error(message), { code }, details);
}

async function cleanCheckout(runGit) {
  const dirty = await runGit(['status', '--porcelain', '--untracked-files=no']);
  if (dirty.trim()) throw blocked('update_dirty', 'Local code changes must be resolved before updating.', parseDirtyStatus(dirty));
}

async function validateRelease(root, version) {
  const release = readAppRelease(root);
  if (release.version !== version || !release.releasedAt) throw blocked('update_release_invalid', 'The release tag and release.json do not match.');
  const assets = inspectCriticalPublicAssets(root);
  if (!assets.ok) throw blocked('update_assets_missing', 'The release is missing critical application files.', { missingFiles: assets.missing });
  for (const file of ['server.js', 'public/app.js']) {
    await exec(process.execPath, ['--check', path.join(root, file)], { timeout: 30000, windowsHide: true });
  }
  return release;
}

function createRecoverySnapshot(root, options, record) {
  // Snapshot only metadata/configuration, never duplicate the user's media library.
  const directory = path.join(options.updatesDir || path.join(options.dataDir || path.join(root, 'data'), 'updates'),
    `recovery-${Date.now()}-${record.before.slice(0, 12)}`);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const files = [
    ['install.json', options.configFile || path.join(root, 'install.json')],
    ['db.json', path.join(options.dataDir || path.join(root, 'data'), 'db.json')],
    ['settings.json', path.join(options.dataDir || path.join(root, 'data'), 'settings.json')],
  ];
  const saved = [];
  for (const [name, source] of files) {
    if (!fs.existsSync(source)) continue;
    const destination = path.join(directory, name);
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(destination, 0o600);
    saved.push({ name, source });
  }
  fs.writeFileSync(path.join(directory, 'recovery.json'), JSON.stringify({ ...record, files: saved,
    note: 'Code recovery only. Do not restore an older database over new generations. Review schema compatibility before reverting after the new server has started.' }, null, 2), { mode: 0o600 });
  return directory;
}

async function updateFromRelease(root, options = {}) {
  const target = options.target;
  const parsed = parseSemver(target?.tagName);
  if (!parsed || parsed.version !== target.version || !/^v?\d/.test(target.tagName)
      || (options.releaseChannel !== 'preview' && parsed.prerelease.length)) {
    throw blocked('update_release_invalid', 'Choose a published release from the selected channel.');
  }
  const runGit = options.runGit || ((args) => gitCommand(root, args, { gitExecutable: options.gitExecutable }));
  await cleanCheckout(runGit);
  const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (branch !== (options.channel || 'main')) throw blocked('update_channel', 'This is a customized or detached checkout. Use Development updates on its configured branch.');
  const origin = await migrateLegacyOrigin(runGit);
  if (!isOfficialOrigin(origin.to)) throw blocked('update_origin', 'Release updates require the official Mix Studio repository.');
  const before = (await runGit(['rev-parse', 'HEAD'])).trim();
  const releaseBefore = readAppRelease(root);
  if (compareSemver(target.version, releaseBefore.version) === -1) {
    throw blocked('update_ahead', 'This installation is newer than the selected release. No downgrade was performed.');
  }
  // Fetch exactly the announced tag; do not pull a branch or trust target_commitish.
  const shallow = (await runGit(['rev-parse', '--is-shallow-repository'])).trim() === 'true';
  await runGit(['fetch', ...(shallow ? ['--unshallow'] : []), '--no-tags', 'origin', `refs/tags/${target.tagName}`]);
  const after = (await runGit(['rev-parse', 'FETCH_HEAD^{commit}'])).trim();
  if (!/^[a-f0-9]{40,64}$/.test(after)) throw blocked('update_release_invalid', 'Git returned an invalid release revision.');
  if (before === after) return { updated: false, restartRequired: false, before, after, branch, releaseBefore, release: releaseBefore, changedFiles: [] };
  try { await runGit(['merge-base', '--is-ancestor', before, after]); }
  catch { throw blocked('update_ahead', 'The selected release does not include this checkout’s commits. No local work was replaced; wait for a newer release or use Development mode.'); }
  const changedFiles = (await runGit(['diff', '--name-only', `${before}..${after}`])).trim().split(/\r?\n/).filter(Boolean);
  const tracked = (await runGit(['ls-tree', '-r', '--name-only', after])).split(/\r?\n/);
  if (tracked.some((name) => name === 'install.json' || name === 'data' || name.startsWith('data/'))) {
    throw blocked('update_release_invalid', 'Release contains machine configuration or user data paths.');
  }
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-release-'));
  let attached = false;
  try {
    await runGit(['worktree', 'add', '--detach', staging, after]);
    attached = true;
    const release = await (options.validateRelease || validateRelease)(staging, target.version);
    await options.beforeApply?.();
    await cleanCheckout(runGit);
    if ((await runGit(['rev-parse', 'HEAD'])).trim() !== before) throw blocked('update_changed', 'The checkout changed while preparing this update. Please retry.');
    const recoveryRef = `refs/mix-studio/recovery/${Date.now()}-${before.slice(0, 12)}`;
    await runGit(['update-ref', recoveryRef, before]);
    const recoveryPath = createRecoverySnapshot(root, options, { before, after, branch, tag: target.tagName, recoveryRef, createdAt: new Date().toISOString() });
    // Never reset or clean: Git refuses conflicts with tracked or untracked local files.
    await runGit(['merge', '--ff-only', after]);
    return { updated: true, restartRequired: true, before, after, branch, releaseBefore, release,
      changedFiles, recoveryPath, originMigrated: origin.migrated };
  } finally {
    if (attached) {
      await runGit(['worktree', 'remove', staging]).catch(() => {});
    } else fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { updateFromRelease, validateRelease, createRecoverySnapshot };
