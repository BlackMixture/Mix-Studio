'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { updateFromRelease } = require('../lib/release-update');
const { createGithubReleaseChecker, normalizeGithubRelease } = require('../lib/github-releases');
const { resolveRuntimeConfig } = require('../lib/runtime-config');

function fixture(t, { shallow = false, badAssets = false, invalidMetadata = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mix-release-test-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const upstream = path.join(tmp, 'upstream'); const root = path.join(tmp, 'app');
  fs.mkdirSync(upstream);
  function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  git(upstream, ['init', '-b', 'main']);
  git(upstream, ['config', 'user.email', 'fixture@example.invalid']); git(upstream, ['config', 'user.name', 'Fixture']);
  fs.mkdirSync(path.join(upstream, 'public'));
  for (const name of ['index.html', 'style.css', 'app.js', 'h3-prompt-guide.js']) fs.copyFileSync(path.join(__dirname, '../public', name), path.join(upstream, 'public', name));
  fs.writeFileSync(path.join(upstream, '.gitignore'), 'data/\ninstall.json\n');
  fs.writeFileSync(path.join(upstream, 'server.js'), "'use strict';\n");
  fs.writeFileSync(path.join(upstream, 'release.json'), JSON.stringify({version:'1.0.0', releasedAt:'2026-09-01'}));
  git(upstream, ['add', '.']); git(upstream, ['commit', '-m', 'initial']);
  git(tmp, ['clone', ...(shallow ? ['--depth', '1'] : []), require('node:url').pathToFileURL(upstream).href, root]);
  fs.writeFileSync(path.join(upstream, 'release.json'), JSON.stringify({version:invalidMetadata ? '8.0.0' : '1.1.0', releasedAt:'2026-09-02'}));
  if (badAssets) fs.writeFileSync(path.join(upstream, 'public/app.js'), 'broken');
  fs.writeFileSync(path.join(upstream, 'released.txt'), 'release');
  git(upstream, ['add', '.']); git(upstream, ['commit', '-m', 'release']); git(upstream, ['tag', 'v1.1.0']);
  const releaseSha = git(upstream, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(upstream, 'unreleased.txt'), 'must not install');
  git(upstream, ['add', '.']); git(upstream, ['commit', '-m', 'unreleased']);
  const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
  fs.writeFileSync(path.join(dataDir, 'db.json'), '{"items":[{"id":"preserve"}]}');
  fs.writeFileSync(path.join(dataDir, 'settings.json'), '{"secret":"fixture-only"}');
  const before = git(root, ['rev-parse', 'HEAD']);
  const commands = [];
  const options = { target: { tagName:'v1.1.0', version:'1.1.0' }, dataDir,
    runGit: async (args) => { commands.push(args); if (args.join(' ') === 'remote get-url origin') return 'https://github.com/BlackMixture/Mix-Studio.git'; return git(root, args); } };
  return { root, upstream, options, before, releaseSha, commands, git };
}

test('release install uses exact tag, preserves data, saves recovery and ignores newer main', async t => {
  const f = fixture(t); let idleChecks = 0;
  const result = await updateFromRelease(f.root, { ...f.options, beforeApply: async () => { idleChecks++; } });
  assert.equal(result.after, f.releaseSha); assert.equal(idleChecks, 1);
  assert.equal(fs.existsSync(path.join(f.root, 'unreleased.txt')), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'data/db.json'), 'utf8'), '{"items":[{"id":"preserve"}]}');
  assert.equal(fs.readFileSync(path.join(result.recoveryPath, 'db.json'), 'utf8'), '{"items":[{"id":"preserve"}]}');
  const recovery = JSON.parse(fs.readFileSync(path.join(result.recoveryPath, 'recovery.json')));
  assert.equal(f.git(f.root, ['rev-parse', recovery.recoveryRef]), f.before);
  assert.equal(f.commands.some(args => args.includes('pull') || args.includes('reset')), false);
  assert.equal(f.git(f.root, ['worktree', 'list', '--porcelain']).split('worktree ').length, 2);
});

test('shallow installer checkout can advance to a release with complete ancestry', async t => {
  const f = fixture(t, { shallow:true });
  assert.equal((await updateFromRelease(f.root, f.options)).after, f.releaseSha);
  assert.ok(f.commands.some(args => args.includes('--unshallow')));
});

for (const [name, option, code] of [['assets', 'badAssets', 'update_assets_missing'], ['metadata', 'invalidMetadata', 'update_release_invalid']]) {
  test(`invalid release ${name} leaves working app untouched`, async t => {
    const f = fixture(t, { [option]:true });
    await assert.rejects(updateFromRelease(f.root, f.options), { code });
    assert.equal(f.git(f.root, ['rev-parse','HEAD']), f.before);
  });
}

test('dirty files and late queue activity prevent application', async t => {
  const f = fixture(t);
  fs.appendFileSync(path.join(f.root, 'server.js'), '// local change');
  await assert.rejects(updateFromRelease(f.root, f.options), {code:'update_dirty'});
  assert.equal(f.commands.some(args => args[0] === 'fetch'), false);
  f.git(f.root, ['restore', 'server.js']);
  await assert.rejects(updateFromRelease(f.root, {...f.options,beforeApply:async()=>{throw Object.assign(Error('busy'),{code:'desktop_busy'});}}),{code:'desktop_busy'});
  assert.equal(f.git(f.root, ['rev-parse','HEAD']),f.before);
});

test('release channels never discard commits ahead of a published tag', async t => {
  const f=fixture(t); f.git(f.root,['pull','--ff-only','origin','main']);
  const current=f.git(f.root,['rev-parse','HEAD']);
  await assert.rejects(updateFromRelease(f.root,f.options),{code:'update_ahead'});
  assert.equal(f.git(f.root,['rev-parse','HEAD']),current);
});

test('untracked conflicting files are preserved by Git instead of overwritten', async t => {
  const f=fixture(t);fs.writeFileSync(path.join(f.root,'released.txt'),'local');
  await assert.rejects(updateFromRelease(f.root,f.options));
  assert.equal(fs.readFileSync(path.join(f.root,'released.txt'),'utf8'),'local');
  assert.equal(f.git(f.root,['rev-parse','HEAD']),f.before);
});

test('Preview finds the highest published version while Stable excludes prerelease tags', async () => {
  assert.equal(normalizeGithubRelease({tag_name:'v1.2.0-beta.1',prerelease:false}),null);
  const checker=createGithubReleaseChecker({channel:'preview',fetchImpl:async()=>({ok:true,status:200,json:async()=>[
    {tag_name:'v1.1.0'}, {tag_name:'v1.2.0-beta.2',prerelease:true}, {tag_name:'v9.0.0',draft:true}, {tag_name:'v1.2.0-beta.10',prerelease:true},
  ]})});
  assert.equal((await checker.check('1.1.0')).latest.tagName,'v1.2.0-beta.10');
});

test('legacy main configuration defaults to Stable; Development is an explicit choice', () => {
  assert.equal(resolveRuntimeConfig('/fixture',{env:{},existsSync:()=>false}).update.releaseChannel,'stable');
  assert.equal(resolveRuntimeConfig('/fixture',{env:{MIXBOX_RELEASE_CHANNEL:'development'},existsSync:()=>false}).update.releaseChannel,'development');
});
