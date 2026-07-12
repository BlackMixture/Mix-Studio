'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('focused gallery prompt and seed metadata are tap-to-copy controls', () => {
  assert.match(app, /copyableMeta\('Prompt', it\.prompt \|\| ''\)/);
  assert.match(app, /copyableMeta\('Motion', info\.motionPrompt \|\| ''\)/);
  assert.match(app, /copyableMeta\('Seed', it\.seed\)/);
  assert.match(app, /copyableMeta\('Seed', info\.seed\)/);
  assert.match(app, /\$\$\('#lbMeta \[data-copy-meta\]'\)/);
});

test('copying metadata supports Clipboard API and a local-browser fallback', () => {
  assert.match(app, /navigator\.clipboard\.writeText\(value\)/);
  assert.match(app, /document\.execCommand\('copy'\)/);
  assert.match(app, /toast\(`\$\{copy\.label\} copied`\)/);
});

test('copy targets remain visually quiet until interaction', () => {
  assert.match(css, /\.lightbox-meta-copy \{[\s\S]*?border: 1px solid transparent;[\s\S]*?background: transparent;/);
  assert.match(css, /\.lightbox-meta-copy\.copied \{/);
});
