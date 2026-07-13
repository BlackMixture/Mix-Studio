'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('Edit presents Outpaint as Expand and Inpaint as Fill', () => {
  assert.match(html, /<b>Expand<\/b>/);
  assert.match(html, /aria-label="Enable Expand"/);
  assert.match(app, /return 'Generate Expand'/);
  assert.match(app, /return 'Generate Fill'/);
  assert.match(app, /'Fill area'/);
  assert.match(app, /'Krea 2 fill area'/);
  assert.match(server, /error: 'Expand needs a source image in reference slot 1'/);
  assert.match(server, /error: 'Krea2 Fill needs a source image'/);
});
