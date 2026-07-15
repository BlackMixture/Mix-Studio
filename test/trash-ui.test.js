'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

test('Advanced Settings exposes owner-only trash status and empty action', () => {
  assert.match(html, /id="trashManagement"[^>]*hidden/);
  assert.match(html, /id="trashStatus"/);
  assert.match(html, /id="trashEmpty"[^>]*>Empty trash/);
  assert.match(app, /control\.hidden = !state\.profileIsOwner/);
  assert.match(app, /const summary = await api\('\/api\/trash'\)/);
});

test('empty trash requires typed confirmation in both the browser and server', () => {
  assert.match(app, /expected: 'EMPTY TRASH'/);
  assert.match(app, /body: JSON\.stringify\(\{ confirm: typed \}\)/);
  assert.match(server, /route === '\/api\/trash' && req\.method === 'DELETE'/);
  assert.match(server, /if \(!isAdmin\(\)\).*Only the owner profile can empty trash/);
  assert.match(server, /String\(body\.confirm \|\| ''\) !== 'EMPTY TRASH'/);
  assert.match(server, /emptyTrashDirectory\(TRASH_ROOT\)/);
});
