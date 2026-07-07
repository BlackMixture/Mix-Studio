'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('prompt panel exposes contextual LoRA phrase suggestions', () => {
  assert.match(indexHtml, /id="contextPromptTools"/);
  assert.match(appJs, /renderPromptSuggestions/);
  assert.match(appJs, /appendPromptSuggestion/);
});

test('LoRA picker applies learned strength defaults from context endpoint', () => {
  assert.match(serverJs, /\/api\/context/);
  assert.match(appJs, /refreshLoraContext/);
  assert.match(appJs, /applyContextLoraDefault/);
});
