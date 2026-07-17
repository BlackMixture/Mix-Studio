'use strict';

const OFFICIAL_REPOSITORY = 'BlackMixture/Mix-Studio';
const LATEST_RELEASE_API = `https://api.github.com/repos/${OFFICIAL_REPOSITORY}/releases/latest`;
const RELEASE_CACHE_MS = 60 * 60 * 1000;
const MAX_RELEASE_NOTES_LENGTH = 12000;
const SEMVER_TAG_PATTERN = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function parseSemver(value) {
  const match = String(value || '').trim().match(SEMVER_TAG_PATTERN);
  if (!match) return null;
  return {
    version: `${match[1]}.${match[2]}.${match[3]}${match[4] ? `-${match[4]}` : ''}${match[5] ? `+${match[5]}` : ''}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]);
    const rightNumber = /^\d+$/.test(right[index]);
    if (leftNumber && rightNumber) return Number(left[index]) < Number(right[index]) ? -1 : 1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) return null;
  for (const key of ['major', 'minor', 'patch']) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function cleanSingleLine(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizePublishedAt(value) {
  const date = new Date(String(value || ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeGithubRelease(value) {
  if (!value || typeof value !== 'object' || value.draft || value.prerelease) return null;
  const tagName = cleanSingleLine(value.tag_name, 64);
  const parsed = parseSemver(tagName);
  if (!tagName || !parsed) return null;
  return {
    id: tagName,
    tagName,
    version: parsed.version,
    title: cleanSingleLine(value.name, 140) || `Mix Studio ${tagName}`,
    notes: String(value.body || '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_RELEASE_NOTES_LENGTH),
    publishedAt: normalizePublishedAt(value.published_at || value.created_at),
    url: `https://github.com/${OFFICIAL_REPOSITORY}/releases/tag/${encodeURIComponent(tagName)}`,
  };
}

function releaseStatus(installedVersion, latest, checkedAt, extra = {}) {
  const installed = parseSemver(installedVersion);
  const comparison = installed && latest ? compareSemver(latest.version, installed.version) : null;
  return {
    repository: OFFICIAL_REPOSITORY,
    installedVersion: installed ? installed.version : null,
    latest,
    updateAvailable: comparison === 1,
    checkedAt,
    ...extra,
  };
}

function releaseCheckError(message) {
  const error = new Error(message);
  error.code = 'release_check_failed';
  return error;
}

function createGithubReleaseChecker(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const now = options.now || Date.now;
  const cacheMs = Number.isFinite(options.cacheMs) ? Math.max(0, options.cacheMs) : RELEASE_CACHE_MS;
  let cachedRelease = null;
  let cachedAt = 0;
  let hasCache = false;
  let pending = null;

  async function fetchLatest() {
    if (typeof fetchImpl !== 'function') throw releaseCheckError('This Node.js runtime cannot check GitHub releases');
    let response;
    try {
      response = await fetchImpl(LATEST_RELEASE_API, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Mix-Studio-release-checker',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw releaseCheckError('Could not reach GitHub to check for Mix Studio updates');
    }

    let latest = null;
    if (response.status !== 404) {
      if (!response.ok) throw releaseCheckError(`GitHub release check failed (${response.status || 'unknown status'})`);
      let payload;
      try {
        payload = await response.json();
      } catch {
        throw releaseCheckError('GitHub returned an unreadable release response');
      }
      latest = normalizeGithubRelease(payload);
      if (!latest) throw releaseCheckError('The latest GitHub release does not have a valid stable version tag');
    }

    cachedRelease = latest;
    cachedAt = now();
    hasCache = true;
    return { latest: cachedRelease, checkedAt: cachedAt };
  }

  async function currentRelease() {
    const currentTime = now();
    if (hasCache && currentTime - cachedAt < cacheMs) {
      return { latest: cachedRelease, checkedAt: cachedAt };
    }
    if (!pending) pending = fetchLatest().finally(() => { pending = null; });
    try {
      return await pending;
    } catch (error) {
      if (!hasCache) throw error;
      return {
        latest: cachedRelease,
        checkedAt: cachedAt,
        stale: true,
        error: String(error.message || error),
      };
    }
  }

  return {
    async check(installedVersion) {
      const result = await currentRelease();
      return releaseStatus(installedVersion, result.latest, result.checkedAt, {
        stale: !!result.stale,
        error: result.error || null,
      });
    },
  };
}

module.exports = {
  LATEST_RELEASE_API,
  MAX_RELEASE_NOTES_LENGTH,
  OFFICIAL_REPOSITORY,
  RELEASE_CACHE_MS,
  SEMVER_TAG_PATTERN,
  compareSemver,
  createGithubReleaseChecker,
  normalizeGithubRelease,
  parseSemver,
  releaseStatus,
};
