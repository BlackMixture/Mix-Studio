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

test('prompt control represents the prompt used for generation', () => {
  assert.match(app, /const prompt = documentationAnglePrompt\(item\) \|\| item\.refinedPrompt \|\| item\.prompt/);
  assert.match(app, /add\('prompt', 'Prompt', prompt\)/);
  assert.match(app, /add\('originalPrompt', 'Original prompt', item\.prompt\)/);
});

test('camera variation documentation uses its angle-specific graph prompt', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(server, /anglePrompt: job\.params\.anglePrompt \|\| undefined/);
  assert.match(app, /function documentationAnglePrompt\(item\)/);
  assert.match(app, /item && item\.anglePrompt/);
  assert.match(app, /front-right quarter view/);
  assert.match(app, /item\.editEngine === 'qwen'/);
});

test('region documentation uses the annotated region map as its figure', () => {
  assert.match(html, /id="documentationRegionGroup" hidden/);
  assert.match(html, /data-doc-region-map="false">Original/);
  assert.match(html, /data-doc-region-map="true"[^>]*>Region map/);
  assert.match(app, /function setDocumentationFigure\(useRegionMap\)/);
  assert.match(app, /await buildRegionOverlay\(item\)/);
  assert.match(app, /await loadDocumentationOriginal\(item\)/);
  assert.match(app, /image\.naturalWidth \|\| image\.width \|\| 1024/);
  assert.match(app, /image\.naturalHeight \|\| image\.height \|\| 1024/);
});

test('export uses a restrained research-record treatment without branding', () => {
  assert.doesNotMatch(app, /GENERATION DOCUMENTATION|MIX STUDIO/);
  assert.match(app, /setDocumentationMonoFont/);
  assert.doesNotMatch(app, /accent\.addColorStop|createLinearGradient\(0, imageHeight/);
  assert.match(css, /\.documentation-preview \{[\s\S]*background: #111216/);
});

test('documentation builder has responsive preview and adjustment controls', () => {
  assert.match(html, /id="documentationTextScale"/);
  assert.match(html, /id="documentationShade"/);
  assert.match(html, /id="documentationFields"/);
  assert.match(css, /\.documentation-builder/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.documentation-preview/);
});
