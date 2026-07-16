'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_RELEASE_FILE = 'release.json';
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function normalizeAppRelease(value) {
  if (!value || typeof value !== 'object') return { version: null, releasedAt: null };
  const version = String(value.version || '').trim();
  const releasedAt = String(value.releasedAt || '').trim();
  return {
    version: version.length <= 64 && SEMVER_PATTERN.test(version) ? version : null,
    releasedAt: /^\d{4}-\d{2}-\d{2}$/.test(releasedAt) ? releasedAt : null,
  };
}

function readAppRelease(root, fsModule = fs) {
  try {
    return normalizeAppRelease(JSON.parse(fsModule.readFileSync(path.join(root, APP_RELEASE_FILE), 'utf8')));
  } catch {
    return { version: null, releasedAt: null };
  }
}

function gitCommand(root, args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, {
      cwd: root,
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (!error) return resolve(String(stdout || ''));
      const detail = String(stderr || stdout || error.message || 'Git command failed').trim();
      const wrapped = new Error(detail.slice(-1200));
      wrapped.code = error.killed ? 'update_timeout' : 'update_failed';
      reject(wrapped);
    });
  });
}

// The repository was renamed KreaStudio -> Mix-Studio. GitHub redirects the
// old URL indefinitely, but installed copies migrate their origin so they
// don't depend on the redirect (a future repo named KreaStudio would break it).
const CURRENT_ORIGIN = 'https://github.com/BlackMixture/Mix-Studio.git';
const LEGACY_ORIGINS = [
  'https://github.com/blackmixture/kreastudio.git',
  'https://github.com/blackmixture/kreastudio',
  'git@github.com:blackmixture/kreastudio.git',
];

async function migrateLegacyOrigin(runGit) {
  try {
    const origin = (await runGit(['remote', 'get-url', 'origin'])).trim();
    if (LEGACY_ORIGINS.includes(origin.toLowerCase())) {
      await runGit(['remote', 'set-url', 'origin', CURRENT_ORIGIN]);
      return { migrated: true, from: origin, to: CURRENT_ORIGIN };
    }
    return { migrated: false, from: origin, to: origin };
  } catch {
    return { migrated: false, from: null, to: null };
  }
}

function restartRequiredForFiles(files) {
  return (files || []).some((file) => (
    file === 'server.js' ||
    file === 'start.bat' ||
    file === 'package.json' ||
    file === 'package-lock.json' ||
    file.startsWith('lib/')
  ));
}

async function updateFromGit(root, options = {}) {
  const runGit = options.runGit || ((args) => gitCommand(root, args));
  const readRelease = options.readRelease || (() => readAppRelease(root));
  const dirty = (await runGit(['status', '--porcelain', '--untracked-files=no'])).trim();
  if (dirty) {
    const error = new Error('This desktop has local code changes. Commit or discard them before updating.');
    error.code = 'update_dirty';
    throw error;
  }

  const branch = (await runGit(['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
  if (!branch || branch === 'HEAD') {
    const error = new Error('The app is not on a named Git branch, so it cannot update safely.');
    error.code = 'update_branch';
    throw error;
  }

  const origin = await migrateLegacyOrigin(runGit);

  const releaseBefore = normalizeAppRelease(await readRelease());
  const before = (await runGit(['rev-parse', 'HEAD'])).trim();
  const pullOutput = (await runGit(['pull', '--ff-only', 'origin', branch])).trim();
  const after = (await runGit(['rev-parse', 'HEAD'])).trim();
  const release = normalizeAppRelease(await readRelease());
  if (before === after) {
    return {
      updated: false, restartRequired: false, branch, before, after,
      releaseBefore, release, changedFiles: [], pullOutput, originMigrated: origin.migrated,
    };
  }

  const changedFiles = (await runGit(['diff', '--name-only', `${before}..${after}`]))
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
  return {
    updated: true,
    restartRequired: restartRequiredForFiles(changedFiles),
    branch,
    before,
    after,
    releaseBefore,
    release,
    changedFiles,
    pullOutput,
    originMigrated: origin.migrated,
  };
}

module.exports = {
  APP_RELEASE_FILE,
  SEMVER_PATTERN,
  gitCommand,
  normalizeAppRelease,
  readAppRelease,
  restartRequiredForFiles,
  migrateLegacyOrigin,
  CURRENT_ORIGIN,
  updateFromGit,
};
