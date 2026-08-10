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
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1, 'patch releases trigger update availability');
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
  assert.match(html, /id="updatesBtn"[^>]*hidden[\s\S]*id="updatesUnreadDot"/);
  assert.match(html, /id="settingsPaneSystem"[\s\S]*id="settingsUpdatesBtn"[\s\S]*id="settingsUpdatesStatus"/);
  assert.match(html, /id="updatesSheet"[\s\S]*id="updatesHighlightsBtn"[\s\S]*id="updatesReleaseLink"[\s\S]*id="updatesInstallBtn"/);
  assert.match(html, /id="topbarUpdateBtn"[^>]*hidden/);
  assert.match(html, /id="profileUpdateBadge"[^>]*hidden/);
  assert.match(html, /id="updateNotice"[\s\S]*id="updateNoticeMedia"[\s\S]*id="updateNoticePrev"[\s\S]*id="updateNoticeNext"[\s\S]*id="updateNoticeAutoplay"[\s\S]*id="updateNoticeDots"[\s\S]*View full changelog/);
  assert.match(html, /github\.com\/BlackMixture\/Mix-Studio\/releases/);
  assert.doesNotMatch(html, /id="updatePublisher"|id="updatePublishBtn"|Push update/);
  assert.match(css, /\.update-notice \{[\s\S]*position: fixed/);
  assert.match(css, /\.updates-release-actions \{[\s\S]*justify-content: flex-end/);
  assert.match(css, /\.updates-release-actions \[hidden\] \{ display: none; \}/);
  assert.match(app, /drawerButton\.hidden = !latest/);
  assert.match(app, /OFFICIAL_RELEASE_SHOWCASES/);
  assert.match(app, /const MIX_STUDIO_120_SHOWCASE = \[/);
  assert.match(app, /'1\.2\.4': MIX_STUDIO_120_SHOWCASE/);
  assert.match(app, /'1\.2\.0': MIX_STUDIO_120_SHOWCASE/);
  assert.match(app, /title: 'MiniMax H3 \+ Turbo is here'[\s\S]*title: 'Wan Animate 2 is available'[\s\S]*title: 'Meet Mix Packs'/);
  assert.match(app, /media: '\/update-media\/v1\.2\.0-wan-animate2\.mp4'/);
  assert.match(app, /theme: 'wan-animate2'/);
  assert.match(app, /mediaMobile: '\/update-media\/v1\.2\.0-mix-packs-mobile\.mp4'/);
  assert.match(app, /mobileSource\.media = '\(max-width: 560px\)'/);
  assert.match(app, /showOfficialReleaseNotice\(latestOfficialRelease\(\), \{ force: true \}\)/);
  assert.match(app, /officialReleaseMatchesInstalled/);
  assert.match(app, /officialReleaseNoticeId/);
  assert.match(app, /What’s new in \$\{latestRelease\?\.tagName \|\| 'Mix Studio'\}/);
  assert.match(app, /\$\('#updatesHighlightsBtn'\)\.addEventListener/);
  assert.match(app, /label: 'Update Mix Studio'/);
  assert.match(app, /\$\('#settingsUpdatesBtn'\)\.addEventListener\('click', openUpdatesSheet\)/);
  assert.match(app, /const UPDATE_SHOWCASE_INTERVAL_MS = 8000/);
  assert.match(app, /function updateShowcaseSwipeDirection\(startX, startY, endX, endY, width, elapsed\)/);
  assert.match(app, /Math\.abs\(deltaX\) < Math\.abs\(deltaY\) \* 1\.25/);
  assert.match(app, /\$\('#updateNoticePrev'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#updateNoticeNext'\)\.addEventListener\('click'/);
  assert.match(app, /\$\('#updateNoticeMedia'\)\.addEventListener\('pointerdown'/);
  assert.match(app, /function scheduleUpdateShowcaseAutoCycle\(\)/);
  assert.match(app, /updateShowcaseAutoPaused[\s\S]*document\.hidden[\s\S]*updateShowcaseReducedMotion\(\)/);
  assert.match(app, /function disposeUpdateShowcaseVideo\(\)[\s\S]*video\.removeAttribute\('src'\)[\s\S]*video\.load\(\)/);
  assert.match(css, /\.update-showcase-arrow \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(css, /\.update-showcase-media \{[\s\S]*touch-action: pan-y;/);
});

test('release status never labels an older public release as installed or current', () => {
  assert.match(app, /const installedTag = installedVersion \? `v\$\{installedVersion\.replace\(\/\^v\/i, ''\)\}` : ''/);
  assert.match(app, /const latestMatchesInstalled = officialReleaseMatchesInstalled\(latest\)/);
  assert.match(app, /`\$\{installedTag \|\| latest\.tagName\} is current`/);
  assert.match(app, /latestMatchesInstalled \? '<span class="update-entry-installed">Installed<\/span>' : ''/);
  assert.match(app, /This installation is newer than the latest published GitHub release\./);
});
