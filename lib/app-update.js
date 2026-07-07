'use strict';

const { execFile } = require('child_process');

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

  const before = (await runGit(['rev-parse', 'HEAD'])).trim();
  const pullOutput = (await runGit(['pull', '--ff-only', 'origin', branch])).trim();
  const after = (await runGit(['rev-parse', 'HEAD'])).trim();
  if (before === after) {
    return { updated: false, restartRequired: false, branch, before, after, changedFiles: [], pullOutput };
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
    changedFiles,
    pullOutput,
  };
}

module.exports = {
  gitCommand,
  restartRequiredForFiles,
  updateFromGit,
};
