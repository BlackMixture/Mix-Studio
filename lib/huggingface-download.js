'use strict';

const fsp = require('fs/promises');
const path = require('path');

const HUGGINGFACE_HUB_TOOL = 'huggingface_hub>=0.32.0';
const HUGGINGFACE_DOWNLOAD_TIMEOUT_SECONDS = 120;
const HUGGINGFACE_TOOL_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const HUGGINGFACE_PROGRESS_INTERVAL_MS = 750;

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return ''; }
}

function parseHuggingFaceResolveUrl(value) {
  try {
    const source = new URL(String(value || ''));
    if (source.protocol !== 'https:' || source.hostname.toLowerCase() !== 'huggingface.co') return null;
    const parts = source.pathname.split('/').filter(Boolean);
    if (parts.length < 5 || parts[2] !== 'resolve') return null;
    const owner = safeDecode(parts[0]);
    const repository = safeDecode(parts[1]);
    const revision = safeDecode(parts[3]);
    const fileParts = parts.slice(4).map(safeDecode);
    if (![owner, repository, revision, ...fileParts].every((part) => (
      part !== '.' && part !== '..' && !part.startsWith('-') && /^[A-Za-z0-9._+-]+$/.test(part)
    ))) return null;
    return {
      repoId: `${owner}/${repository}`,
      revision,
      filename: fileParts.join('/'),
    };
  } catch {
    return null;
  }
}

async function directoryStoredBytes(directory, limit = Number.MAX_SAFE_INTEGER) {
  let total = 0;
  const pending = [directory];
  while (pending.length && total < limit) {
    const current = pending.pop();
    let entries;
    try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) {
        try { total += (await fsp.stat(target)).size; } catch { /* file may be moving into place */ }
      }
      if (total >= limit) return limit;
    }
  }
  return Math.min(total, limit);
}

async function reportDownloadProgress(options, stagingDirectory, downloaded, total) {
  if (typeof options.onProgress !== 'function') return;
  try {
    await options.onProgress({
      downloaded: Math.max(0, Number(downloaded || 0)),
      downloadTotal: Math.max(0, Number(total || 0)),
      method: 'hf-xet',
    });
  } catch { /* progress reporting must never interrupt a model transfer */ }
}

async function acceleratedHuggingFaceDownload(options = {}) {
  const source = parseHuggingFaceResolveUrl(options.url);
  if (!source || !options.uvExecutable || typeof options.run !== 'function') return null;
  const requestedStagingDirectory = String(options.stagingDirectory || '').trim();
  if (!requestedStagingDirectory) return null;
  const stagingDirectory = path.resolve(requestedStagingDirectory);
  await fsp.mkdir(stagingDirectory, { recursive: true });
  const env = {
    HF_HUB_DISABLE_PROGRESS_BARS: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
    HF_HUB_DISABLE_UPDATE_CHECK: '1',
    HF_HUB_DOWNLOAD_TIMEOUT: String(options.downloadTimeoutSeconds || HUGGINGFACE_DOWNLOAD_TIMEOUT_SECONDS),
    NO_COLOR: '1',
    UV_NO_PROGRESS: '1',
  };
  if (options.hfToken) env.HF_TOKEN = String(options.hfToken);
  const expectedBytes = Math.max(0, Number(options.expectedBytes || 0));
  const progressLimit = expectedBytes || Number.MAX_SAFE_INTEGER;
  let lastReported = await directoryStoredBytes(stagingDirectory, progressLimit);
  await reportDownloadProgress(options, stagingDirectory, lastReported, expectedBytes);
  const runPromise = Promise.resolve().then(() => options.run(options.uvExecutable, [
    'tool', 'run',
    '--from', HUGGINGFACE_HUB_TOOL,
    'hf', 'download',
    source.repoId,
    source.filename,
    '--revision', source.revision,
    '--local-dir', stagingDirectory,
  ], {
    cwd: stagingDirectory,
    env,
    signal: options.signal,
    timeout: options.timeout || HUGGINGFACE_TOOL_TIMEOUT_MS,
  }));
  const trackedRun = runPromise.then(
    (value) => ({ ok: true, value }),
    (error) => ({ ok: false, error })
  );
  const intervalMs = Math.max(1, Number(options.progressIntervalMs || HUGGINGFACE_PROGRESS_INTERVAL_MS));
  let outcome = null;
  while (!outcome) {
    outcome = await Promise.race([
      trackedRun,
      new Promise((resolve) => setTimeout(() => resolve(null), intervalMs)),
    ]);
    if (outcome) break;
    const downloaded = await directoryStoredBytes(stagingDirectory, progressLimit);
    if (downloaded !== lastReported) {
      lastReported = downloaded;
      await reportDownloadProgress(options, stagingDirectory, downloaded, expectedBytes);
    }
  }
  if (!outcome.ok) throw outcome.error;
  const downloadedPath = path.join(stagingDirectory, ...source.filename.split('/'));
  const stat = await fsp.stat(downloadedPath);
  if (!stat.isFile() || stat.size <= 0) throw new Error('Hugging Face acceleration finished without producing the requested model file.');
  await reportDownloadProgress(options, stagingDirectory, stat.size, expectedBytes || stat.size);
  return { path: downloadedPath, size: stat.size, source };
}

module.exports = {
  HUGGINGFACE_DOWNLOAD_TIMEOUT_SECONDS,
  HUGGINGFACE_HUB_TOOL,
  HUGGINGFACE_PROGRESS_INTERVAL_MS,
  HUGGINGFACE_TOOL_TIMEOUT_MS,
  acceleratedHuggingFaceDownload,
  parseHuggingFaceResolveUrl,
};
