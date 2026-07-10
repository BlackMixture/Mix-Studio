'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('gallery save menu offers a documentation image builder', () => {
  assert.match(app, /label: 'Documentation image'/);
  assert.match(app, /action: \(\) => openDocumentationBuilder\(it\)/);
  assert.match(html, /id="documentationSheet"/);
  assert.match(html, /id="documentationCanvas"/);
});

test('documentation builder supports overlay and contact-card exports', () => {
  assert.match(html, /data-doc-layout="contact"/);
  assert.match(html, /data-doc-layout="overlay"/);
  assert.match(html, /data-doc-theme="dark"/);
  assert.match(html, /data-doc-theme="light"/);
  assert.match(app, /function renderDocumentationContactCard/);
  assert.match(app, /function renderDocumentationOverlay/);
  assert.match(app, /canvas\.toBlob/);
});

test('documentation metadata omits unavailable values and exposes saved generation details', () => {
  assert.match(app, /function hasDocumentationValue\(value\)/);
  assert.match(app, /if \(hasDocumentationValue\(value\)\) metadata\.push/);
  for (const key of ['model', 'prompt', 'size', 'seed', 'steps', 'cfg', 'loras']) {
    assert.match(app, new RegExp(`add\\('${key}'`));
  }
  assert.match(app, /documentationBuilderState\.metadata\.forEach/);
  assert.match(app, /documentationBuilderState\.selected/);
});

test('documentation builder has responsive preview and adjustment controls', () => {
  assert.match(html, /id="documentationTextScale"/);
  assert.match(html, /id="documentationShade"/);
  assert.match(html, /id="documentationFields"/);
  assert.match(css, /\.documentation-builder/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.documentation-preview/);
});
