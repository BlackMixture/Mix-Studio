'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');

test('Edit uses the same collapsible model selector structure as Create Video', () => {
  assert.match(html, /class="panel video-model-panel edit-model-panel" id="editModelPanel"/);
  assert.match(html, /id="editModelHeader"[^>]*aria-controls="editModelBody"/);
  assert.match(html, /id="editEngineSelected">Klein 4B</);
  assert.match(html, /id="editEngineNote">4B · fast edits</);
  assert.match(html, /class="video-model-body" id="editModelBody"/);
  assert.match(html, /video-choice-grid edit-engine-row" id="editEngineRow"/);
  assert.ok(html.indexOf('id="editModelPanel"') < html.indexOf('id="refPanel"'));
  assert.match(css, /\.video-model-body[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-model-panel\.expanded \.video-model-body[\s\S]*grid-template-rows: 1fr/);
});

test('Edit model summary and disclosure stay synchronized with selection', () => {
  assert.match(app, /function renderEditModelSummary\(\)/);
  assert.match(app, /qwen: state\.qwenQuality === 'fast' \? 'multi-reference · fast' : 'multi-reference · quality'/);
  assert.match(app, /function setEditModelExpanded\(open\)/);
  assert.match(app, /#editModelHeader'\)\.addEventListener\('click'/);
  assert.match(app, /#editModelPanel'\)\.hidden = !isEdit/);
  const editHandler = app.slice(app.indexOf("wireEngineRow('editEngineRow'"), app.indexOf("$('#editComposite')"));
  assert.doesNotMatch(editHandler, /setEditModelExpanded\(false\)/);
});

test('Preserve unchanged sits beside sampling instead of model choices', () => {
  assert.match(html, /id="editSamplingRow"[\s\S]*?id="editComposite"/);
  const modelBody = html.slice(html.indexOf('id="editModelBody"'), html.indexOf('id="refPanel"'));
  assert.doesNotMatch(modelBody, /id="editComposite"/);
});
