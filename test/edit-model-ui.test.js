'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'style.css'), 'utf8');
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('Edit uses the same collapsible model selector structure as Create Video', () => {
  assert.match(html, /class="panel video-model-panel edit-model-panel" id="editModelPanel"/);
  assert.match(html, /id="editModelHeader"[^>]*aria-controls="editModelBody"/);
  assert.match(html, /id="editEngineSelected">Flux Klein 9B</);
  assert.match(html, /id="editEngineNote">Precision Editing</);
  assert.match(html, /class="video-model-body" id="editModelBody"/);
  assert.match(html, /video-choice-grid edit-engine-row" id="editEngineRow"/);
  assert.match(html, /id="editEngineInfoBtn"[^>]*aria-label="Compare edit models"/);
  assert.ok(html.indexOf('id="editModelPanel"') < html.indexOf('id="refPanel"'));
  assert.match(css, /\.video-model-body[\s\S]*grid-template-rows: 0fr/);
  assert.match(css, /\.video-model-panel\.expanded \.video-model-body[\s\S]*grid-template-rows: 1fr/);
});

test('Edit and Video model summaries share centered header copy', () => {
  const rule = css.match(/\.model-current\s*\{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /justify-items:\s*center/);
  assert.match(rule, /text-align:\s*center/);
});

test('Edit choices lead with models and keep outcomes as supporting context', () => {
  const choices = [
    ['klein9', 'Precision Editing', 'Flux Klein 9B'],
    ['klein4', 'Fast Edits', 'Flux Klein 4B'],
    ['qwen', 'Combine Images', 'Qwen Edit'],
    ['krea2ref', 'Reference Remix', 'Krea 2 Edit'],
    ['krea2', 'Inpaint + Outpaint', 'Krea 2'],
  ];
  for (const [engine, task, model] of choices) {
    const taskPattern = escapeRegex(task);
    const modelPattern = escapeRegex(model);
    assert.match(html, new RegExp(`data-engine="${engine}"[^>]*data-task-label="${taskPattern}"[^>]*data-model-label="${modelPattern}"[^>]*><b>${modelPattern}</b><small>${taskPattern}</small>`));
  }
  const modelRow = html.slice(html.indexOf('id="editEngineRow"'), html.indexOf('id="editEngineInfoBtn"'));
  assert.deepEqual([...modelRow.matchAll(/data-engine="([^"]+)"/g)].map((match) => match[1]), ['klein9', 'klein4', 'qwen', 'krea2ref', 'krea2']);
  assert.match(app, /editEngine: 'klein9'[\s\S]*editEngineOrder: \[\.\.\.DEFAULT_EDIT_ENGINE_ORDER\][\s\S]*editEngineDefault: 'klein9'/);
  assert.match(app, /qwen: \{[\s\S]*copy: 'Combine references and create multi-angle image sets\.'/);
  assert.match(app, /krea2: \{[\s\S]*task: 'Inpaint \+ Outpaint'[\s\S]*copy: 'Inpaint selected areas or outpaint beyond the frame\.'/);
  assert.match(app, /function renderEditModelSummary\(\)/);
  assert.match(app, /\$\('#editEngineSelected'\)\.textContent = definition\.model/);
  assert.match(app, /\$\('#editEngineNote'\)\.textContent = task/);
  assert.match(app, /function setEditModelExpanded\(open\)/);
  assert.match(app, /#editModelHeader'\)\.addEventListener\('click'/);
  assert.match(app, /#editModelPanel'\)\.hidden = !isEdit/);
});

test('Edit model guide uses short, selectable text cards until replacement previews are available', () => {
  const definitionsStart = app.indexOf('const EDIT_ENGINE_TASKS = {');
  const definitionsEnd = app.indexOf('\n};', definitionsStart);
  const editDefinitions = app.slice(definitionsStart, definitionsEnd);
  assert.match(html, /id="engineInfoSheet"[\s\S]*id="engineInfoTitle"[\s\S]*id="engineInfoList"/);
  assert.match(app, /function renderEngineInfoList\(kind = 'video'\)/);
  assert.match(app, /editing \? 'Choose an edit model' : 'Choose a video model'/);
  assert.match(app, /button\.className = 'engine-info-card'/);
  assert.match(app, /button\.setAttribute\('aria-pressed', String\(engine === current\)\)/);
  assert.doesNotMatch(editDefinitions, /preview:|\/guides\//);
  assert.match(app, /const hasPreview = !!definition\.preview;/);
  assert.match(app, /button\.classList\.toggle\('text-only', !hasPreview\)/);
  assert.match(app, /if \(hasPreview\) button\.appendChild\(createEngineInfoPreview\(definition\.preview\)\)/);
  assert.match(app, /title\.textContent = definition\.model/);
  assert.match(app, /model\.textContent = `\$\{definition\.task\}/);
  assert.match(app, /button\.addEventListener\('click',[\s\S]*choice\.click\(\)/);
  assert.match(css, /\.engine-info-card\.text-only \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 24px/);
  assert.match(css, /\.engine-info-preview-compare\[data-panels="2"\][\s\S]*animation: engineCompareTwo/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/);
});

test('Edit model guide preserves the user-defined order while video gets its display-only order', () => {
  const start = app.indexOf('function renderEngineInfoList(kind = \'video\')');
  const end = app.indexOf('\nfunction renderEditModelSummary()', start);
  const renderGuide = app.slice(start, end);

  assert.ok(start > -1 && end > start, 'renderEngineInfoList should remain inspectable');
  assert.match(renderGuide, /const order = editing \? state\.editEngineOrder : state\.videoEngineOrder;/);
  assert.match(renderGuide, /const guideOrder = editing\s*\? normalizedOrder\s*:/);
  assert.match(renderGuide, /guideOrder\.forEach\(\(engine\) => \{/);
  assert.doesNotMatch(renderGuide, /state\.editEngineOrder\s*=/);
});

test('Preserve remains beside contextual Edit controls instead of model choices', () => {
  assert.match(html, /id="editSamplingRow"[\s\S]*?id="editComposite"/);
  const modelBody = html.slice(html.indexOf('id="editModelBody"'), html.indexOf('id="refPanel"'));
  assert.doesNotMatch(modelBody, /id="editComposite"/);
});
