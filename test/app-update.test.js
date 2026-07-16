'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  normalizeAppRelease,
  parseDirtyStatus,
  readAppRelease,
  restartRequiredForFiles,
  updateFromGit,
} = require('../lib/app-update');

const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

function gitSequence(outputs) {
  const calls = [];
  return {
    calls,
    runGit: async (args) => {
      calls.push(args);
      return outputs.shift();
    },
  };
}

function temporaryReleaseRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-studio-release-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeRelease(root, release) {
  fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify(release));
}

test('the checked-in release manifest identifies Mix Studio 1.0.0', () => {
  assert.deepEqual(readAppRelease(path.join(__dirname, '..')), {
    version: '1.0.0',
    releasedAt: '2026-07-15',
  });
});

test('release metadata accepts SemVer and rejects ambiguous version labels', () => {
  assert.deepEqual(normalizeAppRelease({ version: '2.3.4-beta.1+win', releasedAt: '2026-08-01' }), {
    version: '2.3.4-beta.1+win',
    releasedAt: '2026-08-01',
  });
  for (const version of ['v1.0.0', '1.0', '01.0.0', '1.0.0.0', 'latest', '']) {
    assert.equal(normalizeAppRelease({ version, releasedAt: 'not-a-date' }).version, null, version);
  }
  assert.deepEqual(normalizeAppRelease({ version: '1.0.1', releasedAt: 'July 15' }), {
    version: '1.0.1',
    releasedAt: null,
  });
});

test('release metadata is read from disk on every call and safely handles missing files', (t) => {
  const root = temporaryReleaseRoot(t);
  assert.deepEqual(readAppRelease(root), { version: null, releasedAt: null });

  writeRelease(root, { version: '1.0.0', releasedAt: '2026-07-15' });
  assert.equal(readAppRelease(root).version, '1.0.0');

  writeRelease(root, { version: '1.0.1', releasedAt: '2026-07-16' });
  assert.deepEqual(readAppRelease(root), { version: '1.0.1', releasedAt: '2026-07-16' });

  fs.writeFileSync(path.join(root, 'release.json'), '{not json');
  assert.deepEqual(readAppRelease(root), { version: null, releasedAt: null });
});

test('public-only updates do not require a server restart', async () => {
  const fake = gitSequence(['', 'main\n', 'https://github.com/BlackMixture/Mix-Studio.git\n', 'aaa\n', 'Updating aaa..bbb\n', 'bbb\n', 'public/app.js\npublic/style.css\n']);
  const result = await updateFromGit('/app', { runGit: fake.runGit });
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, false);
  assert.equal(result.originMigrated, false);
  assert.deepEqual(result.changedFiles, ['public/app.js', 'public/style.css']);
  assert.deepEqual(fake.calls[4], ['pull', '--ff-only', 'origin', 'main']);
});

test('updates report the release metadata from before and after the fast-forward', async () => {
  const fake = gitSequence(['', 'main\n', 'https://github.com/BlackMixture/Mix-Studio.git\n', 'aaa\n', 'Updating aaa..bbb\n', 'bbb\n', 'release.json\npublic/app.js\n']);
  const releases = [
    { version: '0.9.0', releasedAt: '2026-07-01' },
    { version: '1.0.0', releasedAt: '2026-07-15' },
  ];
  let releaseReads = 0;
  const result = await updateFromGit('/app', {
    runGit: fake.runGit,
    readRelease: () => releases[releaseReads++],
  });

  assert.equal(releaseReads, 2);
  assert.deepEqual(result.releaseBefore, releases[0]);
  assert.deepEqual(result.release, releases[1]);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.changedFiles, ['release.json', 'public/app.js']);
});

test('a legacy KreaStudio origin migrates to Mix-Studio before pulling', async () => {
  const fake = gitSequence(['', 'main\n', 'https://github.com/BlackMixture/KreaStudio.git\n', '', 'aaa\n', 'Already up to date.\n', 'aaa\n']);
  const result = await updateFromGit('/app', { runGit: fake.runGit });
  assert.equal(result.originMigrated, true);
  assert.deepEqual(fake.calls[3], ['remote', 'set-url', 'origin', 'https://github.com/BlackMixture/Mix-Studio.git']);
});

test('server and library updates require a restart', () => {
  assert.equal(restartRequiredForFiles(['README.md', 'server.js']), true);
  assert.equal(restartRequiredForFiles(['lib/profiles.js']), true);
  assert.equal(restartRequiredForFiles(['public/index.html', 'test/foo.test.js']), false);
  assert.equal(restartRequiredForFiles(['release.json']), false);
});

test('an up-to-date checkout reports no changed files', async () => {
  const fake = gitSequence(['', 'main\n', 'https://github.com/BlackMixture/Mix-Studio.git\n', 'aaa\n', 'Already up to date.\n', 'aaa\n']);
  const result = await updateFromGit('/app', { runGit: fake.runGit });
  assert.equal(result.updated, false);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.changedFiles, []);
});

test('tracked local changes block an update before pulling', async () => {
  const fake = gitSequence([' M server.js\n']);
  await assert.rejects(
    updateFromGit('/app', { runGit: fake.runGit }),
    (error) => {
      assert.equal(error.code, 'update_dirty');
      assert.deepEqual(error.dirtyFiles, [{ status: ' M', path: 'server.js' }]);
      assert.equal(error.dirtyFileCount, 1);
      return true;
    }
  );
  assert.equal(fake.calls.length, 1);
});

test('dirty status details are bounded and exclude untracked files', () => {
  const status = [
    'M  server.js',
    ' D public/app.js',
    'R  old-name.js -> lib/new-name.js',
    '?? local-only.txt',
    ...Array.from({ length: 9 }, (_, index) => ` M lib/change-${index}.js`),
    '',
  ].join('\n');
  const result = parseDirtyStatus(status);
  assert.equal(result.dirtyFileCount, 12);
  assert.equal(result.dirtyFiles.length, 8);
  assert.deepEqual(result.dirtyFiles.slice(0, 3), [
    { status: 'M ', path: 'server.js' },
    { status: ' D', path: 'public/app.js' },
    { status: 'R ', path: 'old-name.js -> lib/new-name.js' },
  ]);
});

test('update and meta APIs expose semantic releases independently of ComfyUI readiness', () => {
  const updateRoute = server.slice(server.indexOf("route === '/api/update'"), server.indexOf("route === '/api/app/restart'"));
  assert.match(updateRoute, /version:\s*update\.release\.version\s*\|\|\s*update\.after\.slice\(0, 7\)/);
  assert.match(updateRoute, /previousVersion:\s*update\.releaseBefore\.version\s*\|\|\s*update\.before\.slice\(0, 7\)/);
  assert.match(updateRoute, /releasedAt:\s*update\.release\.releasedAt/);
  assert.match(updateRoute, /revision:\s*update\.after\.slice\(0, 7\)/);
  assert.match(updateRoute, /payload\.dirtyFiles\s*=\s*e\.dirtyFiles/);
  assert.match(updateRoute, /payload\.dirtyFileCount/);

  const metaRoute = server.slice(server.indexOf("route === '/api/meta'"), server.indexOf("route === '/api/input'"));
  assert.match(metaRoute, /const app = readAppRelease\(ROOT\)/);
  assert.ok((metaRoute.match(/\bapp,/g) || []).length >= 2, 'both connected and offline metadata should include the app release');
});

test('owner can restart Mix Studio safely from the app drawer', () => {
  assert.match(server, /route === '\/api\/app\/restart'/);
  assert.match(server, /Only the owner profile can restart Mix Studio/);
  assert.match(server, /await assertDesktopIsIdle\(\)/);
  assert.match(html, /id="appRestartBtn"/);
  assert.match(html, /id="appRestartBtn"[\s\S]*stroke="currentColor"/);
  assert.doesNotMatch(html, /restartBrandGradient/);
  assert.match(app, /api\/app\/restart/);
  assert.match(app, /waitForAppRestart\(\)/);
  assert.match(app, /Restarting Mix Studio…/);
  assert.doesNotMatch(app, /Mix Studioâ/);
});
