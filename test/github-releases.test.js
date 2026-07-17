'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  LATEST_RELEASE_API,
  MAX_RELEASE_NOTES_LENGTH,
  OFFICIAL_REPOSITORY,
  compareSemver,
  createGithubReleaseChecker,
  normalizeGithubRelease,
  parseSemver,
} = require('../lib/github-releases');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function githubResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function releasePayload(overrides = {}) {
  return {
    tag_name: 'v1.2.0',
    name: 'Mix Studio 1.2',
    body: 'Faster video tools.\n\nSee the full notes.',
    published_at: '2026-08-01T12:30:00Z',
    draft: false,
    prerelease: false,
    ...overrides,
  };
}

test('official versions accept release tags and compare SemVer precedence', () => {
  assert.equal(parseSemver('v1.2.3').version, '1.2.3');
  assert.equal(parseSemver('1.2.3-beta.2+win').version, '1.2.3-beta.2+win');
  assert.equal(parseSemver('latest'), null);
  assert.equal(compareSemver('1.2.0', '1.1.9'), 1);
  assert.equal(compareSemver('1.2.0', '1.2.0'), 0);
  assert.equal(compareSemver('1.2.0-beta.2', '1.2.0-beta.10'), -1);
  assert.equal(compareSemver('1.2.0', '1.2.0-rc.1'), 1);
  assert.equal(compareSemver('invalid', '1.2.0'), null);
});

test('GitHub release data is bounded and only accepts stable semantic releases', () => {
  const normalized = normalizeGithubRelease(releasePayload({ body: 'x'.repeat(MAX_RELEASE_NOTES_LENGTH + 100) }));
  assert.deepEqual({
    id: normalized.id,
    tagName: normalized.tagName,
    version: normalized.version,
    title: normalized.title,
    publishedAt: normalized.publishedAt,
    url: normalized.url,
  }, {
    id: 'v1.2.0',
    tagName: 'v1.2.0',
    version: '1.2.0',
    title: 'Mix Studio 1.2',
    publishedAt: '2026-08-01T12:30:00.000Z',
    url: 'https://github.com/BlackMixture/Mix-Studio/releases/tag/v1.2.0',
  });
  assert.equal(normalized.notes.length, MAX_RELEASE_NOTES_LENGTH);
  assert.equal(normalizeGithubRelease(releasePayload({ draft: true })), null);
  assert.equal(normalizeGithubRelease(releasePayload({ prerelease: true })), null);
  assert.equal(normalizeGithubRelease(releasePayload({ tag_name: 'August release' })), null);
});

test('release checker uses the official endpoint, reports availability, and caches checks', async () => {
  let currentTime = 1000;
  const calls = [];
  const checker = createGithubReleaseChecker({
    now: () => currentTime,
    cacheMs: 60000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return githubResponse(releasePayload());
    },
  });

  const available = await checker.check('1.0.0');
  assert.equal(available.repository, OFFICIAL_REPOSITORY);
  assert.equal(available.installedVersion, '1.0.0');
  assert.equal(available.latest.version, '1.2.0');
  assert.equal(available.updateAvailable, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, LATEST_RELEASE_API);
  assert.equal(calls[0].options.headers['User-Agent'], 'Mix-Studio-release-checker');

  currentTime += 1000;
  const current = await checker.check('1.2.0');
  assert.equal(current.updateAvailable, false);
  assert.equal(calls.length, 1, 'the GitHub response should be reused within the cache window');
});

test('release checker handles repositories without releases and keeps stale success data on outages', async () => {
  const empty = createGithubReleaseChecker({ fetchImpl: async () => githubResponse({}, 404) });
  assert.deepEqual((await empty.check('1.0.0')).latest, null);

  let currentTime = 1;
  let online = true;
  const resilient = createGithubReleaseChecker({
    now: () => currentTime,
    cacheMs: 10,
    fetchImpl: async () => {
      if (!online) throw new Error('offline');
      return githubResponse(releasePayload());
    },
  });
  await resilient.check('1.0.0');
  currentTime += 20;
  online = false;
  const stale = await resilient.check('1.0.0');
  assert.equal(stale.latest.version, '1.2.0');
  assert.equal(stale.updateAvailable, true);
  assert.equal(stale.stale, true);
  assert.match(stale.error, /Could not reach GitHub/);
});

test('server and UI expose a read-only official release channel', () => {
  assert.match(server, /createGithubReleaseChecker\(\)/);
  assert.match(server, /route === '\/api\/releases\/latest' && req\.method === 'GET'/);
  assert.match(server, /officialReleaseChecker\.check\(app\.version\)/);
  assert.doesNotMatch(server, /api\/update-announcements|updateAnnouncements|normalizeAnnouncementInput/);

  assert.match(app, /api\('\/api\/releases\/latest'\)/);
  assert.match(app, /OFFICIAL_RELEASE_POLL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(app, /new Notification\(release\.title/);
  assert.match(app, /state\.profileIsOwner \|\| !state\.officialReleaseUpdateAvailable/);
  assert.doesNotMatch(app, /updatePublish|updateAnnouncement|api\('\/api\/update-announcements'/);
});

test('release notes include an owner-only install action and no bundled publisher', () => {
  assert.match(html, /id="updatesBtn"[\s\S]*id="updatesUnreadDot"/);
  assert.match(html, /id="updatesSheet"[\s\S]*id="updatesReleaseLink"[\s\S]*id="updatesInstallBtn"/);
  assert.match(html, /github\.com\/BlackMixture\/Mix-Studio\/releases/);
  assert.doesNotMatch(html, /id="updatePublisher"|id="updatePublishBtn"|Push update/);
  assert.match(css, /\.update-notice \{[\s\S]*position: fixed/);
  assert.match(css, /\.updates-release-actions \{[\s\S]*justify-content: flex-end/);
});
