'use strict';

const fs = require('fs');
const path = require('path');
const { selectionAssetRefs } = require('./selection-summary');

function assetKey(ref) {
  return `${ref.kind}:${ref.file}`;
}

function unreferencedAssetRefs(deletedItems = [], remainingItems = []) {
  const retained = new Set(selectionAssetRefs(remainingItems).map(assetKey));
  return selectionAssetRefs(deletedItems).filter((ref) => !retained.has(assetKey(ref)));
}

function safeAssetPath(root, file) {
  const name = String(file || '');
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name) || path.basename(name) !== name) {
    throw new Error(`Unsafe gallery asset name: ${name || '<empty>'}`);
  }
  const base = path.resolve(root);
  const resolved = path.resolve(base, name);
  if (path.dirname(resolved) !== base) throw new Error(`Gallery asset escapes its media folder: ${name}`);
  return resolved;
}

async function moveAssetRefsToTrash(refs, options, fileSystem = fs.promises) {
  const roots = { image: options.imageRoot, video: options.videoRoot };
  const moved = [];
  try {
    for (const ref of refs) {
      const root = roots[ref.kind];
      if (!root) throw new Error(`Unsupported gallery asset kind: ${ref.kind}`);
      const source = safeAssetPath(root, ref.file);
      let stat;
      try {
        stat = await fileSystem.lstat(source);
      } catch (error) {
        if (error && error.code === 'ENOENT') continue;
        throw error;
      }
      if (!stat.isFile()) throw new Error(`Gallery asset is not a regular file: ${ref.file}`);
      const destinationDir = path.join(options.trashRoot, ref.kind === 'image' ? 'images' : 'videos');
      const destination = safeAssetPath(destinationDir, ref.file);
      await fileSystem.mkdir(destinationDir, { recursive: true });
      await fileSystem.rename(source, destination);
      moved.push({ source, destination, kind: ref.kind, file: ref.file });
    }
    return moved.map(({ kind, file }) => ({ kind, file }));
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of moved.reverse()) {
      try {
        await fileSystem.mkdir(path.dirname(entry.source), { recursive: true });
        await fileSystem.rename(entry.destination, entry.source);
      } catch (rollbackError) {
        rollbackErrors.push(String(rollbackError && rollbackError.message || rollbackError));
      }
    }
    if (rollbackErrors.length) error.rollbackErrors = rollbackErrors;
    throw error;
  }
}

function assertTrashRoot(trashRoot) {
  const root = path.resolve(String(trashRoot || ''));
  if (path.basename(root).toLowerCase() !== 'trash') throw new Error('Refusing to empty a directory that is not named trash');
  return root;
}

async function trashDirectorySummary(trashRoot, fileSystem = fs.promises) {
  const root = assertTrashRoot(trashRoot);
  let files = 0;
  let bytes = 0;
  async function visit(directory) {
    let entries;
    try {
      entries = await fileSystem.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(target);
      else {
        const stat = await fileSystem.lstat(target);
        files += 1;
        bytes += Number(stat.size) || 0;
      }
    }
  }
  await visit(root);
  return { files, bytes };
}

async function emptyTrashDirectory(trashRoot, fileSystem = fs.promises) {
  const root = assertTrashRoot(trashRoot);
  const summary = await trashDirectorySummary(root, fileSystem);
  let entries;
  try {
    entries = await fileSystem.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return summary;
    throw error;
  }
  for (const entry of entries) {
    await fileSystem.rm(path.join(root, entry.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
  return summary;
}

module.exports = {
  emptyTrashDirectory,
  moveAssetRefsToTrash,
  safeAssetPath,
  trashDirectorySummary,
  unreferencedAssetRefs,
};
