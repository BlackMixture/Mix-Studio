'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { restartRequiredForFiles, updateFromGit } = require('../lib/app-update');

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

test('public-only updates do not require a server restart', async () => {
  const fake = gitSequence(['', 'main\n', 'aaa\n', 'Updating aaa..bbb\n', 'bbb\n', 'public/app.js\npublic/style.css\n']);
  const result = await updateFromGit('/app', { runGit: fake.runGit });
  assert.equal(result.updated, true);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.changedFiles, ['public/app.js', 'public/style.css']);
  assert.deepEqual(fake.calls[3], ['pull', '--ff-only', 'origin', 'main']);
});

test('server and library updates require a restart', () => {
  assert.equal(restartRequiredForFiles(['README.md', 'server.js']), true);
  assert.equal(restartRequiredForFiles(['lib/profiles.js']), true);
  assert.equal(restartRequiredForFiles(['public/index.html', 'test/foo.test.js']), false);
});

test('an up-to-date checkout reports no changed files', async () => {
  const fake = gitSequence(['', 'main\n', 'aaa\n', 'Already up to date.\n', 'aaa\n']);
  const result = await updateFromGit('/app', { runGit: fake.runGit });
  assert.equal(result.updated, false);
  assert.equal(result.restartRequired, false);
  assert.deepEqual(result.changedFiles, []);
});

test('tracked local changes block an update before pulling', async () => {
  const fake = gitSequence([' M server.js\n']);
  await assert.rejects(
    updateFromGit('/app', { runGit: fake.runGit }),
    (error) => error.code === 'update_dirty'
  );
  assert.equal(fake.calls.length, 1);
});

test('owner can restart MixBox Studio safely from the app drawer', () => {
  assert.match(server, /route === '\/api\/app\/restart'/);
  assert.match(server, /Only the owner profile can restart MixBox Studio/);
  assert.match(server, /await assertDesktopIsIdle\(\)/);
  assert.match(html, /id="appRestartBtn"/);
  assert.match(html, /class="restart-brand-icon"/);
  assert.match(html, /id="restartBrandGradient"/);
  assert.match(app, /api\/app\/restart/);
  assert.match(app, /waitForAppRestart\(\)/);
});
